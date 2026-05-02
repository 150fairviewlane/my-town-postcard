import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, campaignsTable, spotsTable, ordersTable } from "@workspace/db";
import {
  AdminLoginBody,
  AdminLoginResponse,
  GetAdminCampaignResponse,
  GetAdminScansResponse,
  ApproveAdParams,
  ApproveAdResponse,
} from "@workspace/api-zod";
import jwt from "jsonwebtoken";
import { fetchScanCountsForSpotIds } from "../lib/scanCounts";

const router: IRouter = Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "localspot-admin-2025";
const JWT_SECRET = process.env.SESSION_SECRET || "localspot-secret";

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

router.post("/admin/login", async (req, res): Promise<void> => {
  const body = AdminLoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  if (body.data.password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: "24h" });
  req.log.info("Admin logged in");
  res.json(AdminLoginResponse.parse({ token }));
});

router.get("/admin/campaign", requireAdmin, async (req, res): Promise<void> => {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.status, "active"))
    .limit(1);

  if (!campaign) {
    res.status(404).json({ error: "No active campaign" });
    return;
  }

  const spots = await db
    .select()
    .from(spotsTable)
    .where(eq(spotsTable.campaignId, campaign.id));

  const orders = await db.select().from(ordersTable);
  const paidOrdersBySpot = new Map(orders.map(o => [o.spotId, o]));
  const scanCounts = await fetchScanCountsForSpotIds(spots.map(s => s.id));

  const serializeDate = (d: Date | string | null | undefined) =>
    d instanceof Date ? d.toISOString() : (d ?? null);

  const enrichedSpots = spots.map(spot => {
    const order = paidOrdersBySpot.get(spot.id);
    return {
      ...spot,
      createdAt: serializeDate(spot.createdAt),
      expiresAt: serializeDate(spot.expiresAt),
      isPaid: spot.status === "paid",
      stripePaymentIntentId: order?.stripePaymentIntentId ?? null,
      scanCount: scanCounts.get(spot.id) ?? 0,
    };
  });

  const paidSpots = enrichedSpots.filter(s => s.isPaid);
  const totalRevenue = paidSpots.reduce((sum, s) => sum + s.price, 0);

  res.json(GetAdminCampaignResponse.parse({
    campaign: { ...campaign, createdAt: serializeDate(campaign.createdAt) },
    spots: enrichedSpots,
    totalRevenue,
    totalSpots: spots.length,
    paidSpots: paidSpots.length,
  }));
});

router.get("/admin/scans", requireAdmin, async (req, res): Promise<void> => {
  // One round-trip per-spot aggregate: total / 7-day / 30-day windows plus
  // the last-scanned-at timestamp. We list every spot that has been issued
  // a tracking code (i.e. paid spots) so admins can see "0 scans yet" rows
  // alongside actively scanned ones.
  const rows = await db.execute<{
    spot_id: number;
    business_name: string | null;
    tracking_code: string | null;
    total_scans: number;
    scans_last_7_days: number;
    scans_last_30_days: number;
    last_scanned_at: Date | string | null;
  }>(sql`
    SELECT
      s.id            AS spot_id,
      s.business_name AS business_name,
      s.tracking_code AS tracking_code,
      COUNT(q.id)::int                                                              AS total_scans,
      COUNT(q.id) FILTER (WHERE q.scanned_at > now() - interval '7 days')::int      AS scans_last_7_days,
      COUNT(q.id) FILTER (WHERE q.scanned_at > now() - interval '30 days')::int     AS scans_last_30_days,
      MAX(q.scanned_at)                                                             AS last_scanned_at
    FROM spots s
    LEFT JOIN qr_scans q ON q.spot_id = s.id
    WHERE s.tracking_code IS NOT NULL
    GROUP BY s.id, s.business_name, s.tracking_code
    ORDER BY total_scans DESC, s.id ASC
  `);

  // pg returns TIMESTAMPTZ as a Date in some configs and as an already-parsed
  // string in others. Normalize both into ISO 8601 so the API is consistent
  // with the rest of the responses (createdAt etc).
  const toIso = (v: Date | string | null | undefined): string | null => {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString();
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
  };

  const scans = rows.rows.map(r => ({
    spotId: Number(r.spot_id),
    businessName: r.business_name,
    trackingCode: r.tracking_code,
    totalScans: Number(r.total_scans ?? 0),
    scansLast7Days: Number(r.scans_last_7_days ?? 0),
    scansLast30Days: Number(r.scans_last_30_days ?? 0),
    lastScannedAt: toIso(r.last_scanned_at),
  }));

  res.json(GetAdminScansResponse.parse({ scans }));
});

router.post("/admin/spots/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ApproveAdParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [spot] = await db
    .select()
    .from(spotsTable)
    .where(eq(spotsTable.id, params.data.id));

  if (!spot) {
    res.status(404).json({ error: "Spot not found" });
    return;
  }

  const [updated] = await db
    .update(spotsTable)
    .set({ adStatus: "approved" })
    .where(eq(spotsTable.id, params.data.id))
    .returning();

  const scanCount = (await fetchScanCountsForSpotIds([params.data.id])).get(params.data.id) ?? 0;
  const ser = (u: typeof updated) => ({
    ...u,
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
    scanCount,
  });

  req.log.info({ spotId: params.data.id }, "Ad approved");
  res.json(ApproveAdResponse.parse(ser(updated)));
});

export default router;
