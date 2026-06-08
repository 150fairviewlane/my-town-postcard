import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, campaignsTable, spotsTable } from "@workspace/db";
import { GetActiveCampaignResponse } from "@workspace/api-zod";
import { fetchScanCountsForSpotIds } from "../lib/scanCounts";

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

  const spots = await db
    .select()
    .from(spotsTable)
    .where(eq(spotsTable.campaignId, campaign.id));

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

  res.json(GetActiveCampaignResponse.parse(response));
});

router.get("/campaigns/active/taken-categories", async (req, res): Promise<void> => {
  const [campaign] = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(eq(campaignsTable.status, "active"))
    .limit(1);

  if (!campaign) {
    res.json({ takenCategories: [] });
    return;
  }

  const spots = await db
    .select({ businessCategory: spotsTable.businessCategory, status: spotsTable.status })
    .from(spotsTable)
    .where(eq(spotsTable.campaignId, campaign.id));

  const takenCategories = spots
    .filter(s => s.status !== "available" && s.businessCategory)
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
        inArray(spotsTable.status, ["reserved", "paid"]),
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
