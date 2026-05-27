import { Router, type IRouter } from "express";
import { eq, and, ne, inArray } from "drizzle-orm";
import { db, spotsTable, campaignsTable, ordersTable } from "@workspace/db";
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
  T extends { createdAt: Date | string; expiresAt?: Date | string | null; templateData?: string | null },
>(s: T, scanCount = 0) => ({
  ...s,
  createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
  expiresAt:
    s.expiresAt instanceof Date
      ? s.expiresAt.toISOString()
      : (s.expiresAt ?? null),
  // Parse stored JSON back to object so clients receive a typed object, not a string.
  templateData: s.templateData
    ? (() => { try { return JSON.parse(s.templateData!); } catch { return null; } })()
    : null,
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

  // Defense in depth: if a paid order exists for this spot — even if the spot
  // status slipped back to 'available' due to a data inconsistency — refuse the
  // reservation so the customer doesn't get stranded at checkout.
  const [existingPaidOrder] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(eq(ordersTable.spotId, spot.id), eq(ordersTable.status, "paid")))
    .limit(1);
  if (existingPaidOrder) {
    res.status(409).json({ error: "This spot has already been purchased." });
    return;
  }

  // Defense in depth: refuse to reserve any spot whose campaign has been
  // marked completed. The picker only renders the active campaign so this
  // shouldn't happen via the UI, but we keep the API honest if a stale
  // tab calls /reserve directly after the campaign was closed.
  const [parentCampaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, spot.campaignId));

  if (!parentCampaign || parentCampaign.status !== "active") {
    res.status(400).json({ error: "This campaign is no longer accepting new spots." });
    return;
  }

  // Only block if a *reserved* or *paid* spot in this campaign already holds
  // this category. Available spots may have stale businessCategory data left
  // over from a prior expired reservation — they must not block new reserves.
  // Also exclude the current spot so re-reserving the same spot after a hold
  // expired never incorrectly self-conflicts.
  const takenCategory = await db
    .select()
    .from(spotsTable)
    .where(
      and(
        eq(spotsTable.campaignId, spot.campaignId),
        eq(spotsTable.businessCategory, body.data.businessCategory),
        inArray(spotsTable.status, ["reserved", "paid"]),
        ne(spotsTable.id, spot.id),
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
      // Persist the full AdGenerator design state so the picker can render the
      // real ad for this spot after payment is confirmed.
      templateData: body.data.templateData
        ? JSON.stringify(body.data.templateData)
        : null,
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
