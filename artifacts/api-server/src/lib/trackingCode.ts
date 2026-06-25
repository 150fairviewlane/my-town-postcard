import { eq } from "drizzle-orm";
import { db, spotsTable, campaignsTable, type Spot } from "@workspace/db";
import { compositeQrOnto, type SizeKey } from "./compositeQr";

// Convert any string into a URL-safe lowercase slug. Strips accents, replaces
// runs of non-alphanumerics with a single dash, trims leading/trailing dashes,
// and caps length so we never produce monstrous codes.
function slugify(input: string, max: number): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

function randomSuffix(): string {
  // 4 chars of base36 → ~1.7M values; more than enough to break collisions
  // for businesses sharing the same slug + campaign.
  return Math.random().toString(36).slice(2, 6);
}

/**
 * Idempotently assign a tracking code to a spot.
 *
 * - Returns the existing code if one is already set (never regenerates).
 * - Otherwise generates a slug like `<business>-<campaign>` (e.g.
 *   `romas-pizza-spring2026`) and persists it.
 * - On a unique-constraint collision (two spots with the same business name
 *   in the same campaign — extremely rare), retries with a short random
 *   suffix until it lands a unique value or runs out of attempts.
 *
 * Safe to call from both the Stripe webhook and the synchronous
 * /checkout/confirm route — first writer wins, second one's UPDATE either
 * sees the same code already set (idempotent path) or fails with 23505 and
 * we re-fetch and return.
 */
export async function ensureTrackingCode(spot: Spot): Promise<string> {
  if (spot.trackingCode && spot.trackingCode.length > 0) {
    return spot.trackingCode;
  }

  const [campaign] = await db
    .select({ id: campaignsTable.id, name: campaignsTable.name })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, spot.campaignId))
    .limit(1);

  const bizSlug = slugify(spot.businessName ?? "", 40) || `spot-${spot.id}`;
  const campaignSlug =
    (campaign && slugify(campaign.name, 24)) || `c${spot.campaignId}`;
  const base = `${bizSlug}-${campaignSlug}`;

  let candidate = base;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const [updated] = await db
        .update(spotsTable)
        .set({ trackingCode: candidate })
        .where(eq(spotsTable.id, spot.id))
        .returning({ trackingCode: spotsTable.trackingCode });

      if (updated?.trackingCode) {
        return updated.trackingCode;
      }
      // Spot row vanished between the read and the write — surface clearly.
      throw new Error(
        `Spot ${spot.id} not found while assigning tracking code`,
      );
    } catch (err: any) {
      // 23505 = unique_violation. Either another writer set the same code
      // (re-fetch and return theirs) or our slug collides with an unrelated
      // spot's code (retry with a suffix).
      if (err?.code === "23505") {
        const [latest] = await db
          .select({ trackingCode: spotsTable.trackingCode })
          .from(spotsTable)
          .where(eq(spotsTable.id, spot.id))
          .limit(1);
        if (latest?.trackingCode) return latest.trackingCode;

        candidate = `${base}-${randomSuffix()}`;
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `Failed to generate a unique tracking code for spot ${spot.id} after multiple attempts`,
  );
}

/**
 * After a spot is marked paid and its tracking code is assigned, if the spot's
 * Grok-generated ad (stored as a data: URL in templateData.finishedAdUrl) still
 * carries a generic preview QR (pointing at the business website or the
 * mytownpostcard.com homepage), this function re-composites the real tracking QR
 * at the same pixel coordinates and updates the DB row.
 *
 * Safe to call concurrently — compositing at fixed coordinates is naturally
 * idempotent (second write produces identical pixels). Fire-and-forget from
 * both checkout.ts and webhooks.ts; callers must catch and warn-log.
 *
 * The existing order-INSERT race gate already ensures only one of the two callers
 * reaches this function per spot, but even if both ran the result would be identical.
 */
export async function swapGrokQrInTemplateData(spotId: number): Promise<void> {
  const [spot] = await db
    .select({
      trackingCode: spotsTable.trackingCode,
      templateData: spotsTable.templateData,
      size:         spotsTable.size,
    })
    .from(spotsTable)
    .where(eq(spotsTable.id, spotId))
    .limit(1);

  if (!spot?.trackingCode || !spot.templateData) return;

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(spot.templateData) as Record<string, unknown>; }
  catch { return; }

  const finishedAdUrl = parsed.finishedAdUrl;
  if (typeof finishedAdUrl !== "string" || !finishedAdUrl.startsWith("data:image")) return;

  // Prefer sizeKey stored in templateData (set by the Grok popup at save time);
  // fall back to spot.size from the DB if the field is missing.
  const sizeRaw = (typeof parsed.sizeKey === "string" ? parsed.sizeKey : spot.size ?? "").toLowerCase();
  const sizeKey: SizeKey =
    sizeRaw === "xl" || sizeRaw === "x-large" || sizeRaw === "xlarge" ? "xl" :
    sizeRaw === "l"  || sizeRaw === "large"                           ? "l"  :
    sizeRaw === "m"  || sizeRaw === "medium"                          ? "m"  :
    sizeRaw === "s"  || sizeRaw === "small"                           ? "s"  : "xl";

  const trackingUrl = `${(process.env.APP_URL ?? "https://mytownpostcard.com").replace(/\/$/, "")}/go/${spot.trackingCode}`;
  const buf         = Buffer.from(finishedAdUrl.split(",")[1] ?? "", "base64");
  const composited  = await compositeQrOnto(buf, trackingUrl, sizeKey);
  const newDataUrl  = `data:image/jpeg;base64,${composited.toString("base64")}`;

  await db
    .update(spotsTable)
    .set({ templateData: JSON.stringify({ ...parsed, finishedAdUrl: newDataUrl }) })
    .where(eq(spotsTable.id, spotId));
}
