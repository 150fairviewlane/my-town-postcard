import { eq } from "drizzle-orm";
import { db, spotsTable, campaignsTable, type Spot } from "@workspace/db";

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
