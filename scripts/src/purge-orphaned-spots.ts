/**
 * One-time, idempotent cleanup script: deletes spot rows whose grid_area is
 * not in the current STANDARD_SPOT_LAYOUT set.
 *
 * Background: Campaign 1 (Spring 2025) has two legacy rows — grid_area 'lw'
 * and 'a2' — that belonged to an old postcard layout. The backend already
 * filters them out of every query, but the rows still live in the DB.
 *
 * Safe to re-run: if no orphans exist the script exits with a 0-deleted count.
 * Pass --dry-run to preview which rows would be deleted without touching the DB.
 *
 * Run:
 *   pnpm --filter @workspace/scripts run purge:orphaned-spots
 *   pnpm --filter @workspace/scripts run purge:orphaned-spots -- --dry-run
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { notInArray, sql } from "drizzle-orm";
import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

const isDryRun = process.argv.includes("--dry-run");

// Minimal inline spots table — script stays self-contained.
const spotsTable = pgTable("spots", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  gridArea: text("grid_area").notNull(),
  status: text("status").notNull(),
  businessName: text("business_name"),
});

// The canonical set of valid grid areas from STANDARD_SPOT_LAYOUT.
const VALID_GRID_AREAS = [
  // Front
  "mb", "dn", "re", "l1", "l2", "l3", "l4",
  // Back
  "bxl", "bxl2", "bxl3", "bm1", "bm2", "bm3", "bm4", "bs1",
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  // Find orphaned rows first so we can log them.
  const orphans = await db
    .select({
      id: spotsTable.id,
      campaignId: spotsTable.campaignId,
      gridArea: spotsTable.gridArea,
      status: spotsTable.status,
      businessName: spotsTable.businessName,
    })
    .from(spotsTable)
    .where(notInArray(spotsTable.gridArea, VALID_GRID_AREAS));

  if (orphans.length === 0) {
    console.log("No orphaned spot rows found — database is already clean.");
    await pool.end();
    return;
  }

  console.log(`Found ${orphans.length} orphaned spot row(s):`);
  for (const row of orphans) {
    console.log(
      `  id=${row.id}  campaign_id=${row.campaignId}  grid_area=${row.gridArea}  status=${row.status}  business_name=${row.businessName ?? "(none)"}`
    );
  }

  // Guard: refuse to delete paid spots — that would lose revenue history.
  const paidOrphans = orphans.filter((r) => r.status === "paid");
  if (paidOrphans.length > 0) {
    console.error(
      `\nABORTED: ${paidOrphans.length} orphaned row(s) have status='paid' and must be reviewed manually before deletion.`
    );
    await pool.end();
    process.exit(1);
  }

  if (isDryRun) {
    console.log("\nDry-run mode — no rows deleted.");
    await pool.end();
    return;
  }

  const orphanIds = orphans.map((r) => r.id);
  const result = await db
    .execute(
      sql`DELETE FROM spots WHERE id = ANY(${sql.raw(`ARRAY[${orphanIds.join(",")}]::int[]`)}) RETURNING id`
    );

  console.log(`\nDeleted ${result.rows.length} orphaned spot row(s). Database is clean.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
