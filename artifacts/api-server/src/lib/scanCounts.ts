import { inArray, sql } from "drizzle-orm";
import { db, qrScansTable } from "@workspace/db";

/**
 * Single-query aggregate of scan counts for a list of spot IDs. Returns a Map
 * of spotId → count so callers can hydrate Spot responses without N+1 queries.
 * Spots with zero scans are simply absent from the map (callers should default
 * to 0).
 */
export async function fetchScanCountsForSpotIds(
  spotIds: number[],
): Promise<Map<number, number>> {
  if (spotIds.length === 0) return new Map();
  const rows = await db
    .select({
      spotId: qrScansTable.spotId,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(qrScansTable)
    .where(inArray(qrScansTable.spotId, spotIds))
    .groupBy(qrScansTable.spotId);
  return new Map(rows.map((r) => [r.spotId, Number(r.count)]));
}

/** Single-spot variant for the GET /spots/:id route. */
export async function fetchScanCountForSpot(spotId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(qrScansTable)
    .where(sql`${qrScansTable.spotId} = ${spotId}`);
  return Number(row?.count ?? 0);
}
