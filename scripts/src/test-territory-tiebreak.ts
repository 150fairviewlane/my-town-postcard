/**
 * Integration test: territory centroid tiebreak rule
 *
 * Verifies that GET /api/territories/public resolves the correct centroid when
 * two territory rows both satisfy the fuzzy LIKE condition for the same campaign.
 *
 * Tiebreak rule under test:
 *   When LOWER(campaigns.territory) LIKE '%' || LOWER(territories.name) || '%'
 *   matches multiple rows, the LATERAL picks the one with the LONGEST name
 *   (ORDER BY LENGTH(name) DESC LIMIT 1).
 *
 * Overlap scenario:
 *   Territory "Jack"         → centroid (1.0, 1.0)
 *   Territory "Jackson County" → centroid (2.0, 2.0)
 *   Campaign territory = "Jackson County"
 *
 * Both LIKE conditions are satisfied:
 *   "jackson county" LIKE '%jack%'           → TRUE  (shorter match)
 *   "jackson county" LIKE '%jackson county%' → TRUE  (longer, more specific)
 *
 * Expected: campaign resolves to centroid (2.0, 2.0) — the longer match wins.
 * Without ORDER BY LENGTH(name) DESC the result would be non-deterministic and
 * could return (1.0, 1.0), causing the wrong pin on the map.
 *
 * Usage: pnpm --filter @workspace/scripts run test:territory-tiebreak
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const TERRITORY_SHORT = "TEST-JACK-001";
const TERRITORY_LONG  = "TEST-JACK-002";
const CAMPAIGN_SLUG   = "test-tiebreak-jack-xyz";

async function cleanup(): Promise<void> {
  await db.execute(sql`
    DELETE FROM campaigns WHERE slug = ${CAMPAIGN_SLUG}
  `);
  await db.execute(sql`
    DELETE FROM territories WHERE id IN (${TERRITORY_SHORT}, ${TERRITORY_LONG})
  `);
}

async function run(): Promise<void> {
  await cleanup();

  await db.execute(sql`
    INSERT INTO territories (id, name, state, counties, households, zones, status, centroid_lat, centroid_lng)
    VALUES
      (${TERRITORY_SHORT}, 'Jack',           'GA', '["Jack"]',           1000, 4, 'available', 1.0, 1.0),
      (${TERRITORY_LONG},  'Jackson County', 'GA', '["Jackson County"]', 1000, 4, 'available', 2.0, 2.0)
  `);

  await db.execute(sql`
    INSERT INTO campaigns (territory, status, slug, is_published, name, zip_code)
    VALUES ('Jackson County', 'active', ${CAMPAIGN_SLUG}, false, 'Test Tiebreak Campaign', '00000')
  `);

  const { rows } = await db.execute<{
    slug: string;
    centroidLat: number | null;
    centroidLng: number | null;
  }>(sql`
    SELECT
      c.slug,
      t.centroid_lat AS "centroidLat",
      t.centroid_lng AS "centroidLng",
      COUNT(s.id) FILTER (WHERE s.status = 'paid') AS "paidSpots",
      COUNT(s.id)                                  AS "totalSpots"
    FROM campaigns c
    LEFT JOIN spots s ON s.campaign_id = c.id
    LEFT JOIN LATERAL (
      SELECT centroid_lat, centroid_lng
      FROM territories ter
      WHERE LOWER(c.territory) LIKE '%' || LOWER(ter.name) || '%'
      ORDER BY LENGTH(ter.name) DESC
      LIMIT 1
    ) t ON true
    WHERE c.slug = ${CAMPAIGN_SLUG}
    GROUP BY c.id, c.territory, c.city_list, c.slug, c.status,
             c.is_published, c.pin_lat, c.pin_lng,
             t.centroid_lat, t.centroid_lng
  `);

  const pin = rows.find(r => r.slug === CAMPAIGN_SLUG);

  if (!pin) {
    throw new Error("FAIL: campaign was not returned by the query at all");
  }

  if (rows.length > 1) {
    throw new Error(
      `FAIL: expected exactly 1 row for slug "${CAMPAIGN_SLUG}", got ${rows.length} — LATERAL is not deduplicating`
    );
  }

  if (pin.centroidLat !== 2.0 || pin.centroidLng !== 2.0) {
    throw new Error(
      `FAIL: expected centroid (2.0, 2.0) from "Jackson County" (longer match), ` +
      `got (${pin.centroidLat}, ${pin.centroidLng}) — tiebreak rule is broken. ` +
      `Check that ORDER BY LENGTH(ter.name) DESC is present in the LATERAL subquery.`
    );
  }

  console.log("PASS: longest-name tiebreak resolved (2.0, 2.0) — 'Jackson County' beat 'Jack'");
}

run()
  .then(cleanup)
  .then(() => { pool.end(); process.exit(0); })
  .catch(async err => {
    console.error(err.message ?? err);
    await cleanup().catch(() => {});
    pool.end();
    process.exit(1);
  });
