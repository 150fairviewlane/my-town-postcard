import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Idempotent one-time repair: remove spurious county claims caused by the
 * border-bleed bug fixed in Task #211.
 *
 * Background: getCountyTerritoryHubs previously included a non-home county in
 * countyGeoids whenever ANY hub geocoded into it, even borderline communities
 * like Mountain Park, GA (whose Gazetteer point falls just inside Fulton County
 * despite being functionally in Cherokee County). GA-003 ended up with
 * counties: ["Cherokee","Fulton"], which blocked all Alpharetta / Roswell /
 * Sandy Springs proposals from generating fresh proposals.
 *
 * The algorithm fix (≥2 hubs required for non-home counties) prevents this
 * from recurring. This function repairs existing rows created before the fix.
 *
 * Safe to run on every startup — the WHERE clause is a no-op if already fixed.
 */
export async function repairOverclaimedCounties(): Promise<void> {
  try {
    const result = await db.execute(sql`
      UPDATE territories
      SET
        counties = '["Cherokee"]'::json,
        name     = 'Cherokee County'
      WHERE id = 'GA-003'
        AND counties::text LIKE '%Fulton%'
    `);
    const rowCount = (result as unknown as { rowCount: number }).rowCount ?? 0;
    if (rowCount > 0) {
      logger.info(
        { territoryId: "GA-003", removed: "Fulton" },
        "territoryDataRepair: removed over-claimed Fulton County from GA-003"
      );
    }
  } catch (err) {
    logger.warn({ err }, "territoryDataRepair: repair query failed (non-fatal)");
  }
}
