import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, spotsTable } from "@workspace/db";
import {
  ReserveSpotParams,
  ReserveSpotBody,
  ReserveSpotResponse,
  UploadAdParams,
  UploadAdBody,
  UploadAdResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/spots/:id/reserve", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ReserveSpotParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = ReserveSpotBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
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

  if (spot.status !== "available") {
    res.status(400).json({ error: "This spot is no longer available" });
    return;
  }

  const takenCategory = await db
    .select()
    .from(spotsTable)
    .where(
      and(
        eq(spotsTable.campaignId, spot.campaignId),
        eq(spotsTable.businessCategory, body.data.businessCategory),
      )
    )
    .limit(1);

  if (takenCategory.length > 0) {
    res.status(400).json({ error: `The category "${body.data.businessCategory}" is already taken on this postcard. One business per category.` });
    return;
  }

  const [updated] = await db
    .update(spotsTable)
    .set({
      status: "reserved",
      businessName: body.data.businessName,
      businessCategory: body.data.businessCategory,
      contactEmail: body.data.contactEmail,
      contactPhone: body.data.contactPhone ?? null,
    })
    .where(eq(spotsTable.id, params.data.id))
    .returning();

  const ser = (u: typeof updated) => ({ ...u, createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt });

  req.log.info({ spotId: params.data.id, business: body.data.businessName }, "Spot reserved");
  res.json(ReserveSpotResponse.parse(ser(updated)));
});

router.post("/spots/:id/upload-ad", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UploadAdParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UploadAdBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
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

  const adStatus = body.data.designRequested ? "design_requested" : "submitted";
  const adFileUrl = body.data.designRequested ? null : (body.data.adFileUrl ?? null);

  const [updated] = await db
    .update(spotsTable)
    .set({ adStatus, adFileUrl })
    .where(eq(spotsTable.id, params.data.id))
    .returning();

  const ser2 = (u: typeof updated) => ({ ...u, createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt });

  req.log.info({ spotId: params.data.id, adStatus }, "Ad uploaded/requested");
  res.json(UploadAdResponse.parse(ser2(updated)));
});

export default router;
