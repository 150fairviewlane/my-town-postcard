import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, spotsTable } from "@workspace/db";
import {
  GetSpotParams,
  GetSpotResponse,
  ReserveSpotParams,
  ReserveSpotBody,
  ReserveSpotResponse,
  UploadAdParams,
  UploadAdBody,
  UploadAdResponse,
} from "@workspace/api-zod";
import { fetchScanCountForSpot } from "../lib/scanCounts";

const router: IRouter = Router();

const serializeSpot = <
  T extends { createdAt: Date | string; expiresAt?: Date | string | null },
>(s: T, scanCount = 0) => ({
  ...s,
  createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
  expiresAt:
    s.expiresAt instanceof Date
      ? s.expiresAt.toISOString()
      : (s.expiresAt ?? null),
  scanCount,
});

// Unpaid reservations are held for this long. After it lapses, the
// expirationCleanup sweeper (or a checkout.session.expired webhook) frees
// the spot. Keep this single source of truth — the frontend reads expiresAt
// straight off the Spot response, so we never duplicate the constant client-side.
const RESERVATION_TTL_MS = 30 * 60 * 1000;

router.get("/spots/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetSpotParams.safeParse({ id: rawId });
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

  const scanCount = await fetchScanCountForSpot(spot.id);
  res.json(GetSpotResponse.parse(serializeSpot(spot, scanCount)));
});

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

  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

  const [updated] = await db
    .update(spotsTable)
    .set({
      status: "reserved",
      businessName: body.data.businessName,
      businessCategory: body.data.businessCategory,
      contactEmail: body.data.contactEmail,
      contactPhone: body.data.contactPhone ?? null,
      website: body.data.website ?? null,
      expiresAt,
    })
    .where(eq(spotsTable.id, params.data.id))
    .returning();

  req.log.info(
    { spotId: params.data.id, business: body.data.businessName, expiresAt: expiresAt.toISOString() },
    "Spot reserved (30-min hold)",
  );
  res.json(ReserveSpotResponse.parse(serializeSpot(updated, await fetchScanCountForSpot(updated.id))));
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

  req.log.info({ spotId: params.data.id, adStatus }, "Ad uploaded/requested");
  res.json(UploadAdResponse.parse(serializeSpot(updated, await fetchScanCountForSpot(updated.id))));
});

export default router;
