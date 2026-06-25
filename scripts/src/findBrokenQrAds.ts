/**
 * findBrokenQrAds.ts
 *
 * Identifies all spots whose ad_file_url is a Grok-generated base64 JPEG.
 * These ads were generated before server-side QR compositing was added and
 * contain an AI-drawn (non-scannable) QR placeholder instead of a real QR code.
 *
 * Prints a count and a table of affected spots, then exits with code 1 if any
 * are found so CI can surface the list for a manual regeneration pass.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run find:broken-qr-ads
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { and, isNotNull, like, eq } from "drizzle-orm";
import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

const { Pool } = pg;

// Minimal inline table definitions — keeps the script self-contained.
const spotsTable = pgTable("spots", {
  id:           serial("id").primaryKey(),
  campaignId:   integer("campaign_id").notNull(),
  businessName: text("business_name"),
  gridArea:     text("grid_area").notNull(),
  status:       text("status").notNull(),
  adFileUrl:    text("ad_file_url"),
});

const campaignsTable = pgTable("campaigns", {
  id:   serial("id").primaryKey(),
  name: text("name").notNull(),
});

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const rows = await db
    .select({
      id:           spotsTable.id,
      campaignId:   spotsTable.campaignId,
      campaignName: campaignsTable.name,
      businessName: spotsTable.businessName,
      gridArea:     spotsTable.gridArea,
      status:       spotsTable.status,
    })
    .from(spotsTable)
    .leftJoin(campaignsTable, eq(spotsTable.campaignId, campaignsTable.id))
    .where(
      and(
        isNotNull(spotsTable.adFileUrl),
        like(spotsTable.adFileUrl, "data:image/jpeg;base64,%"),
      ),
    )
    .orderBy(spotsTable.campaignId, spotsTable.id);

  await pool.end();

  if (rows.length === 0) {
    console.log("✅  No spots with Grok base64 JPEG ads found — nothing to regenerate.");
    process.exit(0);
  }

  console.log(`⚠️  Found ${rows.length} spot(s) with Grok-generated base64 JPEG ads (non-scannable QR):\n`);

  const COL = { id: 6, camp: 6, name: 14, biz: 32, grid: 8, stat: 10 };
  const pad = (s: string | number | null, n: number) =>
    String(s ?? "").substring(0, n).padEnd(n);

  console.log(
    `${pad("ID", COL.id)} ${pad("CampID", COL.camp)} ${pad("Campaign", COL.name)} ` +
    `${pad("Business", COL.biz)} ${pad("Grid", COL.grid)} ${pad("Status", COL.stat)}`,
  );
  console.log("─".repeat(Object.values(COL).reduce((a, b) => a + b, 0) + 5));

  for (const r of rows) {
    console.log(
      `${pad(r.id, COL.id)} ${pad(r.campaignId, COL.camp)} ${pad(r.campaignName, COL.name)} ` +
      `${pad(r.businessName, COL.biz)} ${pad(r.gridArea, COL.grid)} ${pad(r.status, COL.stat)}`,
    );
  }

  console.log(`\nThese ${rows.length} ads need a regeneration pass in the admin ad generator.`);
  process.exit(1);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
