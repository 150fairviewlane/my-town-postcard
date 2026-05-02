import { and, eq, lt, sql } from "drizzle-orm";
import { db, spotsTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Resets every spot whose 30-minute reservation hold has lapsed back to
 * "available" and clears the customer's information from the row.
 *
 * SQL is a single conditional UPDATE (status='reserved' AND expires_at < now())
 * so this is safe to run concurrently with /spots/:id/reserve and the
 * checkout.session.expired webhook — the row-level lock + WHERE filter
 * means each row gets reset at most once.
 *
 * Returns the ids that were freed so callers can log them.
 */
export async function cleanupExpiredReservations(): Promise<number[]> {
  const freed = await db
    .update(spotsTable)
    .set({
      status: "available",
      businessName: null,
      businessCategory: null,
      contactEmail: null,
      contactPhone: null,
      website: null,
      expiresAt: null,
    })
    .where(
      and(
        eq(spotsTable.status, "reserved"),
        // expires_at is nullable; lt() generates `expires_at < now()` which
        // is FALSE for NULL rows, so legacy rows without an expiry are
        // safely ignored.
        lt(spotsTable.expiresAt, sql`now()`),
      ),
    )
    .returning({ id: spotsTable.id });

  return freed.map((r) => r.id);
}

/**
 * Releases a single spot if (and only if) it is still in "reserved" status.
 * Called from the Stripe checkout.session.expired webhook arm so the spot
 * is freed immediately without waiting for the next sweeper tick. Idempotent:
 * a paid or already-available spot is left untouched.
 */
export async function releaseReservedSpot(spotId: number): Promise<boolean> {
  const result = await db
    .update(spotsTable)
    .set({
      status: "available",
      businessName: null,
      businessCategory: null,
      contactEmail: null,
      contactPhone: null,
      website: null,
      expiresAt: null,
    })
    .where(
      and(eq(spotsTable.id, spotId), eq(spotsTable.status, "reserved")),
    )
    .returning({ id: spotsTable.id });

  return result.length > 0;
}

/**
 * Starts a background sweeper that runs cleanupExpiredReservations every
 * `intervalMs`. Performs an immediate first sweep on startup so any
 * reservations that lapsed while the server was down are cleared promptly.
 *
 * Returns a stop function (used by tests; production never stops it). The
 * timer is unref()'d so it can never block process shutdown.
 */
export function startExpirationSweeper(intervalMs: number): () => void {
  const tick = async () => {
    try {
      const freed = await cleanupExpiredReservations();
      if (freed.length > 0) {
        logger.info(
          { freedSpotIds: freed, count: freed.length },
          "Expiration sweeper freed lapsed reservations",
        );
      }
    } catch (err) {
      logger.error({ err }, "Expiration sweeper tick failed");
    }
  };

  // Fire immediately on startup, then on the regular cadence.
  void tick();
  const handle = setInterval(tick, intervalMs);
  handle.unref();

  logger.info({ intervalMs }, "Expiration sweeper started");

  return () => clearInterval(handle);
}
