import { Router, type IRouter } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db, campaignsTable, dealersTable, spotsTable } from "@workspace/db";
import { GetActiveCampaignResponse } from "@workspace/api-zod";
import { fetchScanCountsForSpotIds } from "../lib/scanCounts";
import { findGazetteerCity } from "../lib/censusApi";

const router: IRouter = Router();

router.get("/campaigns/active", async (req, res): Promise<void> => {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.status, "active"))
    .limit(1);

  if (!campaign) {
    res.status(404).json({ error: "No active campaign found" });
    return;
  }

  const spots = await db
    .select()
    .from(spotsTable)
    .where(eq(spotsTable.campaignId, campaign.id));

  // Hydrate scan counts in a single GROUP BY query so the frontend can show
  // per-spot scan totals without N+1 round-trips.
  const counts = await fetchScanCountsForSpotIds(spots.map(s => s.id));

  const serializeDate = (d: Date | string | null | undefined) =>
    d instanceof Date ? d.toISOString() : (d ?? null);

  const parseTemplateData = (raw: string | null | undefined) => {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };

  const response = {
    ...campaign,
    createdAt: serializeDate(campaign.createdAt),
    spots: spots.map(s => ({
      ...s,
      createdAt: serializeDate(s.createdAt),
      expiresAt: serializeDate(s.expiresAt),
      templateData: parseTemplateData(s.templateData),
      scanCount: counts.get(s.id) ?? 0,
    })),
  };

  // Spot statuses change frequently (reservations, payments, expiration sweeper).
  // Never cache this response — a stale 304 would show available spots that are
  // already reserved in the DB, causing confusing "spot just taken" errors.
  res.setHeader("Cache-Control", "no-store");
  res.json(GetActiveCampaignResponse.parse(response));
});

// Multi-tenant territory page (Task #134). Returns a *published* campaign by
// its URL slug plus its spots, in the same shape as /campaigns/active so the
// frontend can reuse the picker. Unlike /active this is NOT gated on the
// single-active rule — many dealer pages can be published at once.
router.get("/campaigns/by-slug/:slug", async (req, res): Promise<void> => {
  const slug = String(req.params.slug ?? "").toLowerCase();
  if (!slug) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.slug, slug), eq(campaignsTable.isPublished, true)))
    .limit(1);

  if (!campaign) {
    res.status(404).json({ error: "No published page found for this address" });
    return;
  }

  const [spots, dealerRow] = await Promise.all([
    db.select().from(spotsTable).where(eq(spotsTable.campaignId, campaign.id)),
    campaign.dealerId
      ? db
          .select({ companyEmail: dealersTable.companyEmail })
          .from(dealersTable)
          .where(eq(dealersTable.id, campaign.dealerId))
          .limit(1)
          .then(rows => rows[0] ?? null)
      : Promise.resolve(null),
  ]);

  const counts = await fetchScanCountsForSpotIds(spots.map(s => s.id));

  const serializeDate = (d: Date | string | null | undefined) =>
    d instanceof Date ? d.toISOString() : (d ?? null);

  const parseTemplateData = (raw: string | null | undefined) => {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };

  const response = {
    ...campaign,
    dealerEmail: dealerRow?.companyEmail ?? null,
    createdAt: serializeDate(campaign.createdAt),
    spots: spots.map(s => ({
      ...s,
      createdAt: serializeDate(s.createdAt),
      expiresAt: serializeDate(s.expiresAt),
      templateData: parseTemplateData(s.templateData),
      scanCount: counts.get(s.id) ?? 0,
    })),
  };

  res.setHeader("Cache-Control", "no-store");
  res.json(GetActiveCampaignResponse.parse(response));
});

// ─── GET /api/territories/public ─────────────────────────────────────────────
// Returns all active or published campaigns as map-ready territory objects.
// lat/lng are omitted (not defaulted to 0,0) when no territories table row
// matches the campaign territory name — so the frontend can safely skip pins
// for territories that have no centroid yet.
router.get("/territories/public", async (req, res): Promise<void> => {
  // Tiebreak rule: when the fuzzy LIKE matches multiple territory rows for one
  // campaign, pick the longest name — longer name = more characters matched =
  // more specific territory = correct centroid.  ORDER BY LENGTH(name) DESC
  // inside a LATERAL guarantees exactly one territory row per campaign and
  // makes the rule explicit at the SQL level (never left to Postgres ordering).
  const { rows } = await db.execute<{
    id: number;
    territory: string | null;
    cityList: string | null;
    slug: string | null;
    status: string;
    isPublished: boolean;
    pinLat: number | null;
    pinLng: number | null;
    centroidLat: number | null;
    centroidLng: number | null;
    paidSpots: string;
    totalSpots: string;
  }>(sql`
    SELECT
      c.id,
      c.territory,
      c.city_list        AS "cityList",
      c.slug,
      c.status,
      c.is_published     AS "isPublished",
      c.pin_lat          AS "pinLat",
      c.pin_lng          AS "pinLng",
      t.centroid_lat     AS "centroidLat",
      t.centroid_lng     AS "centroidLng",
      COUNT(s.id) FILTER (WHERE s.status = 'paid') AS "paidSpots",
      COUNT(s.id)                                  AS "totalSpots"
    FROM campaigns c
    LEFT JOIN spots s ON s.campaign_id = c.id
    LEFT JOIN LATERAL (
      SELECT centroid_lat, centroid_lng
      FROM territories ter
      WHERE LOWER(c.territory) LIKE '%' || LOWER(ter.name) || '%'
      ORDER BY LENGTH(ter.name) DESC
      LIMIT 1
    ) t ON true
    WHERE (c.status = 'active' OR c.is_published = true)
      AND c.slug IS NOT NULL
    GROUP BY
      c.id, c.territory, c.city_list, c.slug, c.status,
      c.is_published, c.pin_lat, c.pin_lng,
      t.centroid_lat, t.centroid_lng
  `);

  const result = rows.map(r => {
    // Use hub city name when cityList has exactly one entry (e.g. "Canton"),
    // otherwise fall back to the parent territory name (e.g. "White / Habersham Counties").
    const cities = (r.cityList ?? "").split(",").map((c: string) => c.trim()).filter(Boolean);
    const name = cities.length === 1 ? cities[0] : (r.territory ?? "");
    const base: Record<string, unknown> = {
      slug:       r.slug,
      name,
      paidSpots:  Number(r.paidSpots ?? 0),
      totalSpots: Number(r.totalSpots ?? 0),
    };
    // Coordinate resolution priority (highest → lowest):
    //   1. per-campaign pin_lat/pin_lng  (set by admin or provisioning)
    //   2. single-city Gazetteer lookup  (when cityList has exactly one entry
    //      and the DB pin is missing — e.g. sub-zone campaigns created before
    //      pin_lat was being populated)
    //   3. shared territory centroid     (multi-city / county-level fallback)
    let lat = r.pinLat ?? null;
    let lng = r.pinLng ?? null;

    if ((lat == null || lng == null) && cities.length === 1) {
      // All Cherokee city campaigns (Canton, Woodstock, Holly Springs, Ball Ground)
      // currently have null pin_lat — they share a county centroid that makes all
      // 4 dots render at the same pixel. Look up the real city coords from the
      // Gazetteer (in-memory, no DB round-trip). Default state = GA since the
      // platform currently serves Georgia territories only.
      const stateAbbr = "GA";
      const place = findGazetteerCity(cities[0], stateAbbr);
      if (place) { lat = place.lat; lng = place.lng; }
    }

    if (lat == null || lng == null) {
      lat = r.centroidLat ?? null;
      lng = r.centroidLng ?? null;
    }

    if (lat != null && lng != null) {
      base.latitude  = lat;
      base.longitude = lng;
    }
    return base;
  });

  res.json(result);
});

// ─── GET /api/campaigns/public-territories ────────────────────────────────────
// Public endpoint (no auth). Returns all published territory pages as a slim
// list of { slug, label, lat, lng } for the "wrong town?" wayfinding banner.
// label = hub city when cityList has exactly one entry, else the territory name.
// lat/lng come from the territories centroid JOIN (may be null for new entries).
router.get("/campaigns/public-territories", async (req, res): Promise<void> => {
  // Same tiebreak rule as /territories/public: LATERAL + ORDER BY LENGTH DESC
  // picks the most specific territory match when multiple rows satisfy the LIKE.
  const { rows } = await db.execute<{
    slug: string | null;
    territory: string | null;
    cityList: string | null;
    centroidLat: number | null;
    centroidLng: number | null;
  }>(sql`
    SELECT
      c.slug,
      c.territory,
      c.city_list    AS "cityList",
      t.centroid_lat AS "centroidLat",
      t.centroid_lng AS "centroidLng"
    FROM campaigns c
    LEFT JOIN LATERAL (
      SELECT centroid_lat, centroid_lng
      FROM territories ter
      WHERE LOWER(c.territory) LIKE '%' || LOWER(ter.name) || '%'
      ORDER BY LENGTH(ter.name) DESC
      LIMIT 1
    ) t ON true
    WHERE c.is_published = true AND c.slug IS NOT NULL
    ORDER BY c.territory
  `);

  const territories = rows
    .filter(r => r.slug)
    .map(r => {
      const cities = (r.cityList ?? "").split(",").map((c: string) => c.trim()).filter(Boolean);
      const label = cities.length === 1 ? cities[0] : (r.territory ?? r.slug ?? "");
      return {
        slug:  r.slug as string,
        label,
        lat:   r.centroidLat  ?? null,
        lng:   r.centroidLng  ?? null,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  res.json({ territories });
});

router.get("/campaigns/active/taken-categories", async (req, res): Promise<void> => {
  const campaignId = parseInt(String(req.query.campaignId ?? ""), 10);
  if (!campaignId || isNaN(campaignId)) {
    // Missing or invalid campaignId — return empty list rather than falling back
    // to an arbitrary active campaign, which would return the wrong data for
    // every territory except whichever one wins the unscoped query.
    res.json({ takenCategories: [] });
    return;
  }

  const spots = await db
    .select({ businessCategory: spotsTable.businessCategory, status: spotsTable.status })
    .from(spotsTable)
    .where(eq(spotsTable.campaignId, campaignId));

  const takenCategories = spots
    .filter(s => s.status === "paid" && s.businessCategory)
    .map(s => s.businessCategory as string);

  res.json({ takenCategories });
});

router.get("/campaigns/:campaignId/used-templates", async (req, res): Promise<void> => {
  const campaignId = parseInt(String(req.params.campaignId ?? ""), 10);
  if (!campaignId || isNaN(campaignId)) {
    res.status(400).json({ error: "Invalid campaignId" });
    return;
  }
  const spotId = req.query.spotId ? parseInt(String(req.query.spotId), 10) : null;

  const spots = await db
    .select({ id: spotsTable.id, side: spotsTable.side, templateData: spotsTable.templateData })
    .from(spotsTable)
    .where(
      and(
        eq(spotsTable.campaignId, campaignId),
        inArray(spotsTable.status, ["paid"]),
      ),
    );

  const result: { front: string[]; back: string[] } = { front: [], back: [] };
  for (const spot of spots) {
    if (spotId && spot.id === spotId) continue;
    if (!spot.templateData) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(spot.templateData); } catch { continue; }
    if (!parsed || typeof parsed !== "object" || !("template" in parsed)) continue;
    const template = (parsed as Record<string, unknown>).template;
    if (typeof template !== "string") continue;
    const side = (spot.side ?? "front") as "front" | "back";
    if (!result[side].includes(template)) result[side].push(template);
  }

  res.json(result);
});

export default router;
