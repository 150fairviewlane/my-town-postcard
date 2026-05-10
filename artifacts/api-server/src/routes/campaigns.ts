import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
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

export default router;
