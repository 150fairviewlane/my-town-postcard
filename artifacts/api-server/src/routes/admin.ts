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
import { ensureTrackingCode } from "../lib/trackingCode";
import {
  getCountyInfo,
  getCountyFromZip,
  getAdReadyBusinessCount,
  getTopCitiesInCounty,
  getNeighboringCounties,
} from "../lib/censusApi";

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
  // Optional date-range filter scopes the totalScans aggregate and the
  // lastScannedAt timestamp. The 7-day / 30-day rolling windows are always
  // relative to now() so the trend numbers stay meaningful regardless of
  // what the admin has filtered on.
  //
  // The `from` and `to` params are inclusive YYYY-MM-DD dates; we expand
  // them to a half-open timestamp range [from 00:00, to+1day 00:00) in the
  // server timezone. When `to` is omitted but `from` is set, we treat it
  // as "from <date> until now".
  const fromRaw = typeof req.query.from === "string" ? req.query.from : null;
  const toRaw = typeof req.query.to === "string" ? req.query.to : null;
  const campaignIdRaw =
    typeof req.query.campaignId === "string" ? req.query.campaignId : null;

  const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (fromRaw && !isYmd(fromRaw)) {
    res.status(400).json({ error: "Invalid 'from' date — expected YYYY-MM-DD" });
    return;
  }
  if (toRaw && !isYmd(toRaw)) {
    res.status(400).json({ error: "Invalid 'to' date — expected YYYY-MM-DD" });
    return;
  }
  const campaignIdNum = campaignIdRaw !== null ? Number(campaignIdRaw) : null;
  if (campaignIdNum !== null && !Number.isFinite(campaignIdNum)) {
    res.status(400).json({ error: "Invalid 'campaignId'" });
    return;
  }

  // Build the scan-row predicate. We always need to keep paid spots that
  // received zero scans inside the chosen window (the LEFT JOIN preserves
  // them as NULLs), so the date filter goes inside the join condition,
  // not into a top-level WHERE.
  const fromCond = fromRaw
    ? sql`AND q.scanned_at >= ${fromRaw}::date`
    : sql``;
  const toCond = toRaw
    ? sql`AND q.scanned_at < (${toRaw}::date + interval '1 day')`
    : sql``;
  const campaignCond =
    campaignIdNum !== null
      ? sql`AND s.campaign_id = ${campaignIdNum}`
      : sql``;

  const rows = await db.execute<{
    spot_id: number;
    business_name: string | null;
    industry: string | null;
    size: string;
    campaign_id: number;
    campaign_name: string | null;
    tracking_code: string | null;
    total_scans: number;
    scans_last_7_days: number;
    scans_last_30_days: number;
    last_scanned_at: Date | string | null;
  }>(sql`
    SELECT
      s.id                AS spot_id,
      s.business_name     AS business_name,
      s.business_category AS industry,
      s.size              AS size,
      s.campaign_id       AS campaign_id,
      c.name              AS campaign_name,
      s.tracking_code     AS tracking_code,
      COUNT(q.id)::int                                                              AS total_scans,
      COUNT(q.id) FILTER (WHERE q.scanned_at > now() - interval '7 days')::int      AS scans_last_7_days,
      COUNT(q.id) FILTER (WHERE q.scanned_at > now() - interval '30 days')::int     AS scans_last_30_days,
      MAX(q.scanned_at)                                                             AS last_scanned_at
    FROM spots s
    LEFT JOIN campaigns c ON c.id = s.campaign_id
    LEFT JOIN qr_scans q
      ON q.spot_id = s.id
      ${fromCond}
      ${toCond}
    WHERE s.tracking_code IS NOT NULL
      ${campaignCond}
    GROUP BY s.id, s.business_name, s.business_category, s.size,
             s.campaign_id, c.name, s.tracking_code
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

  const scans = rows.rows.map((r) => ({
    spotId: Number(r.spot_id),
    businessName: r.business_name,
    industry: r.industry,
    size: r.size as "xl" | "large" | "medium" | "small",
    campaignId: Number(r.campaign_id),
    campaignName: r.campaign_name,
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

// Offline "mark as sold" (Task #134). Lets an admin record a spot sold outside
// the online checkout (e.g. a dealer closed the deal in person). Flips the spot
// to paid, clears any hold, stamps optional business info, records a manual
// order for revenue rollups, and issues a QR tracking code. No Stripe, no
// customer email — this is a bookkeeping action.
router.post("/admin/spots/:id/mark-sold", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid spot id" });
    return;
  }

  const [spot] = await db.select().from(spotsTable).where(eq(spotsTable.id, id));
  if (!spot) {
    res.status(404).json({ error: "Spot not found" });
    return;
  }
  if (spot.status === "paid") {
    res.status(409).json({ error: "This spot is already sold." });
    return;
  }

  const businessName =
    typeof req.body?.businessName === "string" && req.body.businessName.trim()
      ? req.body.businessName.trim()
      : spot.businessName;
  const businessCategory =
    typeof req.body?.businessCategory === "string" && req.body.businessCategory.trim()
      ? req.body.businessCategory.trim()
      : spot.businessCategory;

  const [updated] = await db
    .update(spotsTable)
    .set({ status: "paid", expiresAt: null, businessName, businessCategory })
    .where(eq(spotsTable.id, id))
    .returning();

  // Record a manual order so admin revenue rollups (which sum paid orders)
  // include offline sales. Synthetic ref keeps the unique index happy.
  try {
    await db.insert(ordersTable).values({
      spotId: id,
      stripePaymentIntentId: `manual-${id}-${Date.now()}`,
      amountCents: spot.price,
      status: "paid",
    });
  } catch (err: any) {
    req.log.warn({ err: err?.message, spotId: id }, "Manual order insert skipped (likely already recorded)");
  }

  try {
    await ensureTrackingCode(updated);
  } catch (err: any) {
    req.log.error({ err: err?.message, spotId: id }, "Tracking code assignment failed on mark-sold — continuing");
  }

  const scanCount = (await fetchScanCountsForSpotIds([id])).get(id) ?? 0;
  req.log.info({ spotId: id }, "Spot marked sold (offline)");
  res.json({
    ...updated,
    createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : updated.createdAt,
    expiresAt: null,
    scanCount,
  });
});

// ─── Census county-info test route ───────────────────────────────────────────
// For testing the Census API module (Prompt 1 of 3). Accepts either:
//   ?stateFips=13&countyFips=139   — direct FIPS lookup
//   ?zip=30501                      — ZIP lookup (resolves county first)
router.get("/admin/census/county-info", requireAdmin, async (req, res): Promise<void> => {
  const zipParam = typeof req.query.zip === "string" ? req.query.zip.trim() : null;
  const stateFipsParam = typeof req.query.stateFips === "string" ? req.query.stateFips.trim() : null;
  const countyFipsParam = typeof req.query.countyFips === "string" ? req.query.countyFips.trim() : null;

  let stateFips: string;
  let countyFips: string;
  let resolvedViaZip: ReturnType<typeof getCountyFromZip> extends Promise<infer T> ? T : never = null as any;

  if (zipParam) {
    const zipResult = await getCountyFromZip(zipParam);
    if (!zipResult) {
      res.status(404).json({ error: `Could not resolve ZIP code: ${zipParam}` });
      return;
    }
    resolvedViaZip = zipResult;
    stateFips = zipResult.stateFips;
    countyFips = zipResult.countyFips;
  } else if (stateFipsParam && countyFipsParam) {
    stateFips = stateFipsParam;
    countyFips = countyFipsParam;
  } else {
    res.status(400).json({ error: "Provide either ?zip= or both ?stateFips= and ?countyFips=" });
    return;
  }

  const geoid = `${stateFips}${countyFips.padStart(3, "0")}`;

  const [countyInfo, businessCount, topCities, neighbors] = await Promise.all([
    getCountyInfo(stateFips, countyFips),
    getAdReadyBusinessCount(stateFips, countyFips),
    getTopCitiesInCounty(stateFips, countyFips),
    getNeighboringCounties(geoid),
  ]);

  res.json({
    county: countyInfo ? `${countyInfo.name}, ${countyInfo.stateName}` : null,
    geoid: countyInfo ? countyInfo.geoid : geoid,
    stateAbbr: countyInfo ? countyInfo.stateAbbr : null,
    adReadyBusinessCount: businessCount,
    topCities,
    neighbors,
    cachedAt: new Date().toISOString(),
    ...(resolvedViaZip ? { resolvedFromZip: resolvedViaZip } : {}),
    ...(countyInfo === null ? { warning: "Census ACS API unavailable — county name not resolved" } : {}),
  });
});

export default router;

