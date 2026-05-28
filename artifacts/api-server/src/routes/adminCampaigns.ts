import { Router, type IRouter } from "express";
import { eq, and, ne, inArray, sql } from "drizzle-orm";
import {
  db,
  campaignsTable,
  spotsTable,
  ordersTable,
} from "@workspace/db";
import {
  CreateCampaignBody,
  GetAdminCampaignByIdParams,
  ActivateCampaignParams,
  CompleteCampaignParams,
  ListAdminCampaignsResponse,
  GetAdminCampaignByIdResponse,
  CreateCampaignResponse,
  ActivateCampaignResponse,
  CompleteCampaignResponse,
} from "@workspace/api-zod";
import jwt from "jsonwebtoken";
import { fetchScanCountsForSpotIds } from "../lib/scanCounts";
import { sendCampaignCompletedAdminEmail } from "../lib/emails";
import { markCampaignAssignmentsMailed } from "../lib/subscriptions";

const router: IRouter = Router();

const JWT_SECRET = process.env.SESSION_SECRET || "localspot-secret";

// Same admin guard the rest of /admin uses. Duplicated here rather than
// imported so this router can be mounted independently of admin.ts.
function requireAdmin(req: any, res: any, next: any): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Standard postcard layout — mirrors the picker / print page exactly. The
// picker grid (postcardCore.GRID_AREAS + postcardBack.BACK_GRID_AREAS) is the
// authoritative visual definition; this list mirrors the *sellable* cells
// from that grid (house ad cells like `hs`, `bhs`, `bhr`, `bhn` and the
// `ed` EDDM block are rendered statically by the frontend and intentionally
// have no DB row). Prices in cents.
const STANDARD_SPOT_LAYOUT: ReadonlyArray<{
  side: "front" | "back";
  size: "xl" | "large" | "medium" | "small";
  gridArea: string;
  price: number;
}> = [
  // Front side — 7 sellable cells: 3 XL (top row) + 4 Large portrait (bottom row).
  // No house ad. Every inch of the front is a paid spot.
  // XL  = 4"×5" (400×500 natural px). Large = 3"×4" portrait (300×400 natural px).
  { side: "front", size: "xl",    gridArea: "mb", price: 49900 },
  { side: "front", size: "xl",    gridArea: "dn", price: 49900 },
  { side: "front", size: "xl",    gridArea: "re", price: 49900 },
  { side: "front", size: "large", gridArea: "l1", price: 39900 },
  { side: "front", size: "large", gridArea: "l2", price: 39900 },
  { side: "front", size: "large", gridArea: "l3", price: 39900 },
  { side: "front", size: "large", gridArea: "l4", price: 39900 },
  // Back side — 8 sellable cells: 3 XL (top row) + 4 Medium (middle row) + 1 Small.
  { side: "back",  size: "xl",     gridArea: "bxl",  price: 49900 },
  { side: "back",  size: "xl",     gridArea: "bxl2", price: 49900 },
  { side: "back",  size: "xl",     gridArea: "bxl3", price: 49900 },
  { side: "back",  size: "medium", gridArea: "bm1",  price: 29900 },
  { side: "back",  size: "medium", gridArea: "bm2",  price: 29900 },
  { side: "back",  size: "medium", gridArea: "bm3",  price: 29900 },
  { side: "back",  size: "medium", gridArea: "bm4",  price: 29900 },
  { side: "back",  size: "small",  gridArea: "bs1",  price: 19900 },
];

const serializeDate = (d: Date | string | null | undefined) =>
  d instanceof Date ? d.toISOString() : (d ?? null);

// Inferred from the generated zod schema. Keeping the inference local avoids
// adding a direct zod dependency to api-server (zod is an internal detail of
// @workspace/api-zod).
type CampaignDetail = ReturnType<typeof GetAdminCampaignByIdResponse.parse>;

// Build the AdminCampaignDetailResponse shape used by:
// - GET /admin/campaigns/:id (existing campaign view)
// - POST /admin/campaigns (just-created campaign — paidSpots will be 0)
// - POST /admin/campaigns/:id/activate / complete (echo back the new state)
async function buildCampaignDetail(
  campaignId: number,
): Promise<CampaignDetail | null> {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId));
  if (!campaign) return null;

  const spots = await db
    .select()
    .from(spotsTable)
    .where(eq(spotsTable.campaignId, campaignId));

  // Only fetch orders for this campaign's spots — global SELECT * FROM orders
  // would scan the entire orders table on every dashboard refresh and grow
  // unbounded as more campaigns close. Empty `spotIds` (a brand-new campaign
  // whose insert hasn't completed) is short-circuited because Drizzle's
  // `inArray([])` generates an `IN ()` SQL fragment that some drivers reject.
  const spotIds = spots.map((s) => s.id);
  const orders =
    spotIds.length === 0
      ? []
      : await db
          .select()
          .from(ordersTable)
          .where(inArray(ordersTable.spotId, spotIds));
  const paidOrdersBySpot = new Map(orders.map((o) => [o.spotId, o]));
  const scanCounts = await fetchScanCountsForSpotIds(spots.map((s) => s.id));

  const enrichedSpots = spots.map((spot) => {
    const order = paidOrdersBySpot.get(spot.id);
    const parseTemplateData = (raw: string | null | undefined) => {
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    };
    return {
      ...spot,
      createdAt: serializeDate(spot.createdAt) ?? new Date().toISOString(),
      expiresAt: serializeDate(spot.expiresAt),
      templateData: parseTemplateData(spot.templateData),
      isPaid: spot.status === "paid",
      stripePaymentIntentId: order?.stripePaymentIntentId ?? null,
      scanCount: scanCounts.get(spot.id) ?? 0,
    };
  });

  const paidSpots = enrichedSpots.filter((s) => s.isPaid);
  const totalRevenue = paidSpots.reduce((sum, s) => sum + s.price, 0);
  const availableSpots = enrichedSpots.filter(
    (s) => s.status === "available",
  ).length;

  return GetAdminCampaignByIdResponse.parse({
    campaign: {
      ...campaign,
      createdAt: serializeDate(campaign.createdAt) ?? new Date().toISOString(),
    },
    spots: enrichedSpots,
    totalRevenue,
    totalSpots: spots.length,
    paidSpots: paidSpots.length,
    availableSpots,
  });
}

router.get("/admin/campaigns", requireAdmin, async (_req, res): Promise<void> => {
  // One round-trip per-campaign aggregate: spot counts and paid revenue. Paid
  // spots are joined on status='paid' so revenue equals the sum of paid
  // spot prices (matches /admin/campaigns/:id totalRevenue).
  const rows = await db.execute<{
    id: number;
    name: string;
    territory: string;
    zip_code: string;
    mail_date: string | null;
    homes_count: number;
    status: string;
    created_at: Date | string;
    total_spots: number;
    paid_spots: number;
    available_spots: number;
    total_revenue: number;
  }>(sql`
    SELECT
      c.id,
      c.name,
      c.territory,
      c.zip_code,
      c.mail_date,
      c.homes_count,
      c.status,
      c.created_at,
      COALESCE(COUNT(s.id)::int, 0)                                                   AS total_spots,
      COALESCE(COUNT(s.id) FILTER (WHERE s.status = 'paid')::int, 0)                  AS paid_spots,
      COALESCE(COUNT(s.id) FILTER (WHERE s.status = 'available')::int, 0)             AS available_spots,
      COALESCE(SUM(CASE WHEN s.status = 'paid' THEN s.price ELSE 0 END)::int, 0)      AS total_revenue
    FROM campaigns c
    LEFT JOIN spots s ON s.campaign_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC, c.id DESC
  `);

  const campaigns = rows.rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    territory: r.territory,
    zipCode: r.zip_code,
    mailDate: r.mail_date,
    homesCount: Number(r.homes_count),
    status: r.status,
    createdAt: serializeDate(r.created_at) ?? new Date().toISOString(),
    totalSpots: Number(r.total_spots ?? 0),
    paidSpots: Number(r.paid_spots ?? 0),
    availableSpots: Number(r.available_spots ?? 0),
    totalRevenue: Number(r.total_revenue ?? 0),
  }));

  res.json(ListAdminCampaignsResponse.parse({ campaigns }));
});

router.post("/admin/campaigns", requireAdmin, async (req, res): Promise<void> => {
  const body = CreateCampaignBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  // Auto-generate the standard postcard layout for the new campaign in a
  // single transaction so we never end up with a campaign row but no spots.
  const created = await db.transaction(async (tx) => {
    const [campaign] = await tx
      .insert(campaignsTable)
      .values({
        name: body.data.name,
        territory: body.data.territory,
        zipCode: body.data.zipCode,
        homesCount: body.data.homesCount,
        mailDate: body.data.mailDate ?? null,
        status: body.data.status ?? "draft",
      })
      .returning();

    await tx.insert(spotsTable).values(
      STANDARD_SPOT_LAYOUT.map((s) => ({
        campaignId: campaign.id,
        side: s.side,
        size: s.size,
        gridArea: s.gridArea,
        price: s.price,
      })),
    );

    return campaign;
  });

  req.log.info(
    { campaignId: created.id, name: created.name, status: created.status },
    "Campaign created",
  );

  const detail = await buildCampaignDetail(created.id);
  if (!detail) {
    res.status(500).json({ error: "Failed to load created campaign" });
    return;
  }
  res.json(CreateCampaignResponse.parse(detail));
});

router.get("/admin/campaigns/:id", requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetAdminCampaignByIdParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const detail = await buildCampaignDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  res.json(GetAdminCampaignByIdResponse.parse(detail));
});

router.post("/admin/campaigns/:id/activate", requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ActivateCampaignParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [target] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, params.data.id));

  if (!target) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  // Only one active campaign at a time — the public /campaigns/active
  // endpoint and PostcardPickerSection both depend on this invariant.
  // Demote any other active campaign to "completed" before flipping the
  // target. Wrapped in a transaction so the picker never sees zero or
  // two active campaigns mid-flight.
  await db.transaction(async (tx) => {
    await tx
      .update(campaignsTable)
      .set({ status: "completed" })
      .where(
        and(
          eq(campaignsTable.status, "active"),
          ne(campaignsTable.id, params.data.id),
        ),
      );

    await tx
      .update(campaignsTable)
      .set({ status: "active" })
      .where(eq(campaignsTable.id, params.data.id));
  });

  req.log.info({ campaignId: params.data.id }, "Campaign activated");

  const detail = await buildCampaignDetail(params.data.id);
  if (!detail) {
    res.status(500).json({ error: "Failed to reload campaign" });
    return;
  }
  res.json(ActivateCampaignResponse.parse(detail));
});

router.post("/admin/campaigns/:id/complete", requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = CompleteCampaignParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [target] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, params.data.id));

  if (!target) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  await db
    .update(campaignsTable)
    .set({ status: "completed" })
    .where(eq(campaignsTable.id, params.data.id));

  // Flip every approved subscription-issue assignment for this campaign
  // to included_in_print=true. This is the ONLY place issues are counted
  // as fulfilled toward a subscriber's commitment total. Failure here is
  // logged but does not block the campaign-complete response — we'll
  // surface a retry path from the admin subscriptions screen later.
  try {
    const mailedCount = await markCampaignAssignmentsMailed(params.data.id);
    req.log.info(
      { campaignId: params.data.id, mailedAssignments: mailedCount },
      "Marked subscription assignments mailed",
    );
  } catch (err) {
    req.log.error(
      { err, campaignId: params.data.id },
      "Failed to mark subscription assignments mailed — admin can retry from Subscriptions page",
    );
  }

  req.log.info({ campaignId: params.data.id }, "Campaign completed");

  const detail = await buildCampaignDetail(params.data.id);
  if (!detail) {
    res.status(500).json({ error: "Failed to reload campaign" });
    return;
  }

  // Fire-and-forget admin notification email. Failure to send is logged
  // inside the helper and never bubbles up — completing the campaign is
  // the source of truth, the email is just a courtesy.
  void sendCampaignCompletedAdminEmail({
    campaignId: detail.campaign.id,
    name: detail.campaign.name,
    territory: detail.campaign.territory,
    homesCount: detail.campaign.homesCount,
    totalSpots: detail.totalSpots,
    paidSpots: detail.paidSpots,
    totalRevenueCents: detail.totalRevenue,
  });

  res.json(CompleteCampaignResponse.parse(detail));
});

// ---------------------------------------------------------------------------
// TEMPORARY: one-shot production data sync. Wipes campaign 1 spots/orders
// and re-seeds them to match the current dev state. Admin-auth required.
// Safe to call multiple times (idempotent). Remove after prod is confirmed.
// ---------------------------------------------------------------------------
router.post("/admin/campaigns/sync-dev-to-prod", requireAdmin, async (req, res): Promise<void> => {
  try {
    await db.execute(sql`
      BEGIN;

      -- 1. Drop dependent orders
      DELETE FROM orders
      WHERE spot_id IN (SELECT id FROM spots WHERE campaign_id = 1);

      -- 2. Drop all spots for campaign 1
      DELETE FROM spots WHERE campaign_id = 1;

      -- 3. Sync campaign row
      UPDATE campaigns
      SET name         = 'Spring 2025',
          territory    = 'Clarkesville & Surrounding Areas',
          zip_code     = '30523',
          mail_date    = '2025-05-15',
          homes_count  = 5000,
          status       = 'active'
      WHERE id = 1;

      -- 4. Re-insert spots with explicit IDs matching dev
      INSERT INTO spots
        (id, campaign_id, side, size, grid_area, price, status,
         business_name, business_category, contact_email, contact_phone,
         website, ad_file_url, ad_status, tracking_code, expires_at)
      VALUES
        (1,  1,'front','xl',   'mb',  49900,'paid',      'Mr. Biscuits Cafe',       'Breakfast & Cafe',  'jdjdjdjd',            NULL,             NULL, NULL, NULL,'mr-biscuits-cafe-spring-2025',         NULL),
        (2,  1,'front','xl',   'dn',  49900,'available', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
        (3,  1,'front','large','l1',  39900,'available', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
        (4,  1,'front','xl',   're',  49900,'paid',      'Clarkesville Chiropractic','Chiropractor',      'Info@shedpeddler.com','(706) 754-0189','mrbiscuitscafe.com',NULL,NULL,'clarkesville-chiropractic-spring-2025',NULL),
        (6,  1,'front','large','l3',  39900,'available', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
        (7,  1,'front','medium','lw', 29900,'available', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
        (8,  1,'front','large','l4',  39900,'available', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
        (9,  1,'front','medium','a2', 29900,'available', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
        (11, 1,'back', 'xl',   'bxl', 49900,'paid',      'Habersham Handyman',       'Other Service',     'Info@shedpeddler.com','(706) 754-0105','mrbiscuitscafe.com',NULL,NULL,'habersham-handyman-spring-2025',       NULL),
        (12, 1,'back', 'xl',   'bxl2',49900,'available', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
        (13, 1,'back', 'xl',   'bxl3',49900,'available', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
        (14, 1,'back', 'medium','bm1',29900,'available', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
        (15, 1,'back', 'medium','bm2',29900,'paid',      'AJ''s Pizza',              'Pizza Restaurant',  'Info@shedpeddler.com','(706) 754-0105','mrbiscuitscafe.com',NULL,NULL,'aj-s-pizza-spring-2025',               NULL),
        (16, 1,'back', 'small', 'bs1',19900,'available', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
        (17, 1,'back', 'medium','bm3',29900,'available', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
        (34, 1,'front','large','l2',  39900,'available', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
        (35, 1,'back', 'medium','bm4',29900,'paid',      'Clarkesville Veterinary',  'Veterinarian',      'Info@shedpeddler.com','(706) 754-0199','mrbiscuitscafe.com',NULL,NULL,'clarkesville-veterinary-spring-2025',  NULL);

      -- 5. Advance the sequence past the highest explicit ID
      SELECT setval(pg_get_serial_sequence('spots','id'), (SELECT MAX(id) FROM spots));

      COMMIT;
    `);

    req.log.info("sync-dev-to-prod: campaign 1 spots reset successfully");
    res.json({ ok: true, message: "Campaign 1 spots synced to dev state." });
  } catch (err) {
    req.log.error({ err }, "sync-dev-to-prod: failed");
    res.status(500).json({ error: "Sync failed", detail: String(err) });
  }
});

export default router;
