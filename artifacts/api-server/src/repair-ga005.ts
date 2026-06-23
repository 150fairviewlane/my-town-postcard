/**
 * One-shot repair script for GA-005 (Cherokee territory).
 *
 * Root cause: Ball Ground's Gazetteer centroid geocodes to Pickens County,
 * causing (a) wrong counties column and (b) wrong ZIP footprint (3 Pickens/Dawson
 * ZIPs instead of the correct ~45 Cherokee ZIPs covering Ball Ground / Canton /
 * Woodstock / Holly Springs).
 *
 * This script:
 *   1. Resolves the 4 hub cities from the Gazetteer.
 *   2. Recomputes counties using the fixed getCountyGeoidForCity (override applied).
 *   3. Recomputes ZIP footprint using computeHubZipFootprint (same logic as
 *      the Custom Territory tool).
 *   4. Deletes the 3 wrong ZIP assignments and inserts the correct ones.
 *   5. Updates GA-005's counties column (centroid is already correct).
 *
 * Run with:
 *   pnpm --filter @workspace/api-server exec tsx src/repair-ga005.ts
 */

import {
  findGazetteerCity,
  getCountyGeoidForCity,
  getCountyShortNameByGeoid,
} from "./lib/censusApi";
import { computeHubZipFootprint } from "./lib/territoryBuilder";
import { db, territoriesTable, territoryZipAssignmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const TERRITORY_ID = "GA-005";
const HUB_CITIES   = ["Ball Ground", "Canton", "Woodstock", "Holly Springs"];
const STATE_ABBR   = "GA";

async function main() {
  console.log(`\n── GA-005 Repair Script ──────────────────────────────\n`);

  // 1. Resolve hub cities from Gazetteer
  const resolved: Array<{ cityName: string; lat: number; lng: number }> = [];
  for (const city of HUB_CITIES) {
    const match = findGazetteerCity(city, STATE_ABBR);
    if (!match) {
      console.error(`ERROR: Could not find "${city}" in Gazetteer — aborting.`);
      process.exit(1);
    }
    resolved.push({ cityName: city, lat: match.lat, lng: match.lng });
    console.log(`  ${city}: ${match.lat}, ${match.lng}`);
  }

  // 2. Recompute counties using fixed geocoding
  const countySet   = new Set<string>();
  const countyNames: string[] = [];
  for (const city of resolved) {
    const geoid = getCountyGeoidForCity(city.cityName, STATE_ABBR, city.lat, city.lng);
    if (geoid) {
      const shortName = getCountyShortNameByGeoid(geoid);
      if (shortName && !countySet.has(shortName)) {
        countySet.add(shortName);
        countyNames.push(shortName);
      }
    }
  }
  console.log(`\nCorrect counties:`, countyNames);

  // 3. Recompute ZIP footprint
  const footprintZips = computeHubZipFootprint(resolved);
  console.log(`Correct ZIP count: ${footprintZips.length}`);
  if (footprintZips.length < 20) {
    console.error(`ERROR: ZIP count suspiciously low (${footprintZips.length}) — aborting.`);
    process.exit(1);
  }

  // 4. Read current state for confirmation
  const [current] = await db
    .select()
    .from(territoriesTable)
    .where(eq(territoriesTable.id, TERRITORY_ID));
  if (!current) {
    console.error(`ERROR: Territory ${TERRITORY_ID} not found in DB.`);
    process.exit(1);
  }
  console.log(`\nBefore repair:`);
  console.log(`  counties: ${JSON.stringify(current.counties)}`);
  const oldZips = await db
    .select({ zip: territoryZipAssignmentsTable.zip })
    .from(territoryZipAssignmentsTable)
    .where(eq(territoryZipAssignmentsTable.territoryId, TERRITORY_ID));
  console.log(`  ZIP assignments: ${oldZips.length} (${oldZips.map(z => z.zip).join(", ")})`);

  // 5. Apply repair in a transaction
  //
  // territory_zip_assignments has PRIMARY KEY (zip) — each ZIP belongs to exactly
  // one territory at a time. The correct 45 Cherokee ZIPs are currently assigned
  // to available territories (GA-003, GA-004). Since GA-005 is the only TAKEN
  // territory, it must win: forcibly delete any existing assignment for these ZIPs
  // before inserting them under GA-005.
  const correctZips = footprintZips.map(z => z.zip);

  await db.transaction(async (tx) => {
    // 5a. Update counties on the territory row
    await tx
      .update(territoriesTable)
      .set({ counties: countyNames })
      .where(eq(territoriesTable.id, TERRITORY_ID));

    // 5b. Remove ALL existing assignments for the correct ZIPs (any territory)
    //     so GA-005 can claim them cleanly.
    const { inArray } = await import("drizzle-orm");
    const CHUNK = 200;
    for (let i = 0; i < correctZips.length; i += CHUNK) {
      const chunk = correctZips.slice(i, i + CHUNK);
      await tx
        .delete(territoryZipAssignmentsTable)
        .where(inArray(territoryZipAssignmentsTable.zip, chunk));
    }

    // 5c. Insert correct ZIP assignments for GA-005
    for (let i = 0; i < footprintZips.length; i += CHUNK) {
      const chunk = footprintZips.slice(i, i + CHUNK);
      await tx
        .insert(territoryZipAssignmentsTable)
        .values(chunk.map(({ zip }) => ({ zip, territoryId: TERRITORY_ID })));
    }
  });

  // 6. Verify
  const [updated] = await db
    .select()
    .from(territoriesTable)
    .where(eq(territoriesTable.id, TERRITORY_ID));
  const newZips = await db
    .select({ zip: territoryZipAssignmentsTable.zip })
    .from(territoryZipAssignmentsTable)
    .where(eq(territoryZipAssignmentsTable.territoryId, TERRITORY_ID));

  console.log(`\nAfter repair:`);
  console.log(`  counties: ${JSON.stringify(updated?.counties)}`);
  console.log(`  ZIP assignments: ${newZips.length}`);
  console.log(`  Sample ZIPs: ${newZips.slice(0, 10).map(z => z.zip).join(", ")}...`);
  console.log(`\n✓ GA-005 repair complete.\n`);
  process.exit(0);
}

main().catch(err => {
  console.error("Repair failed:", err);
  process.exit(1);
});
