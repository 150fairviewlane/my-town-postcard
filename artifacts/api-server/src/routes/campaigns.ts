import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, campaignsTable, spotsTable } from "@workspace/db";
import { GetActiveCampaignResponse } from "@workspace/api-zod";

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

  const serializeDate = (d: Date | string | null | undefined) =>
    d instanceof Date ? d.toISOString() : (d ?? null);

  const response = {
    ...campaign,
    createdAt: serializeDate(campaign.createdAt),
    spots: spots.map(s => ({ ...s, createdAt: serializeDate(s.createdAt) })),
  };

  res.json(GetActiveCampaignResponse.parse(response));
});

export default router;
