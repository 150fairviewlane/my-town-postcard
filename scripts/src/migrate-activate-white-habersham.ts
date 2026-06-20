// Migration: Retire the habersham (Clarkesville) campaign and activate white-habersham
// as the sole active campaign visible to the public.
//
// Idempotent: safe to run multiple times.
//   - habersham (id=1)       → status='completed', is_published=false
//   - white-habersham (id=5) → status='active',    is_published=true
//                              city_list='Cleveland / Helen, Cornelia'
//
// Usage: pnpm --filter @workspace/scripts run migrate:activate-white-habersham

import pg from "pg";

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Retire the old Clarkesville (habersham) campaign.
    const ret = await client.query<{ id: number; slug: string; status: string; is_published: boolean }>(
      `UPDATE campaigns
          SET status = 'completed', is_published = false
        WHERE slug = 'habersham'
       RETURNING id, slug, status, is_published`,
    );
    if (ret.rowCount === 0) {
      console.log("habersham campaign not found — skipping deactivation.");
    } else {
      const r = ret.rows[0];
      console.log(`Retired: id=${r.id} slug=${r.slug} status=${r.status} is_published=${r.is_published}`);
    }

    // 2. Activate the white-habersham campaign.
    const act = await client.query<{ id: number; slug: string; status: string; is_published: boolean; city_list: string }>(
      `UPDATE campaigns
          SET status       = 'active',
              is_published = true,
              city_list    = 'Cleveland, Helen, Clarkesville, Cornelia'
        WHERE slug = 'white-habersham'
       RETURNING id, slug, status, is_published, city_list`,
    );
    if (act.rowCount === 0) {
      console.log("white-habersham campaign not found — skipping activation.");
    } else {
      const r = act.rows[0];
      console.log(`Activated: id=${r.id} slug=${r.slug} status=${r.status} is_published=${r.is_published} city_list="${r.city_list}"`);
    }

    await client.query("COMMIT");
    console.log("Migration complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
