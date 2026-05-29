// Standalone script: seed (or re-seed) all 95 Georgia territories.
// Usage: pnpm --filter @workspace/scripts run seed:ga-territories
//
// Idempotency: if the DB already has ≥ 95 GA rows, the script exits without
// making any changes. Otherwise it clears all GA rows and re-inserts the
// full dataset (safe — no real dealer claims should exist against placeholders).

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, sql } from "drizzle-orm";
import { pgTable, text, integer, json, timestamp } from "drizzle-orm/pg-core";
import { GEORGIA_TERRITORIES } from "./georgia-territories-seed.js";

const { Pool } = pg;

// Minimal inline table definition so the script is self-contained.
const territoriesTable = pgTable("territories", {
  id:         text("id").primaryKey(),
  name:       text("name").notNull(),
  state:      text("state").notNull(),
  counties:   json("counties").$type<string[]>().notNull().default([]),
  zoneNote:   text("zone_note"),
  households: integer("households").notNull().default(0),
  zones:      integer("zones").notNull().default(4),
  status:     text("status", { enum: ["available", "pending", "taken"] }).notNull().default("available"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function run() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(territoriesTable)
    .where(eq(territoriesTable.state, "GA"));

  if (Number(count) >= 95) {
    console.log(`Already have ${count} GA territories — skipping reseed.`);
    await pool.end();
    return;
  }

  console.log(`Found ${count} GA territories — clearing and reseeding...`);
  await db.delete(territoriesTable).where(eq(territoriesTable.state, "GA"));

  await db.insert(territoriesTable).values(
    GEORGIA_TERRITORIES.map(t => ({
      id:         t.id,
      name:       t.name,
      state:      t.state,
      counties:   t.counties,
      zoneNote:   t.zoneNote,
      households: t.households,
      zones:      4,
      status:     t.status,
    })),
  );

  console.log(`Inserted ${GEORGIA_TERRITORIES.length} GA territories successfully.`);
  await pool.end();
}

run().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
