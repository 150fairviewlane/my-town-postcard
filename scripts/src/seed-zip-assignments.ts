// Bulk-seed territory_zip_assignments from the GA ZCTA GeoJSON + territory county data.
// For each ZIP, find the nearest GA county centroid (haversine). Then check how many
// territories claim that county:
//   - Exactly 1 territory → insert the assignment
//   - 0 or 2+ territories → skip (leave for manual resolution in ZIP Manager)
// Safe to re-run: uses ON CONFLICT DO NOTHING so existing assignments are untouched.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEOJSON_PATH = path.resolve(__dirname, "../../artifacts/api-server/src/data/ga-zips.geojson");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const COUNTY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  Appling:{lat:31.75,lng:-82.29},Atkinson:{lat:31.30,lng:-82.88},Bacon:{lat:31.55,lng:-82.45},
  Baker:{lat:31.33,lng:-84.43},Baldwin:{lat:33.07,lng:-83.25},Banks:{lat:34.37,lng:-83.49},
  Barrow:{lat:33.99,lng:-83.72},Bartow:{lat:34.24,lng:-84.84},"Ben Hill":{lat:31.77,lng:-83.22},
  Berrien:{lat:31.28,lng:-83.24},Bibb:{lat:32.84,lng:-83.64},Bleckley:{lat:32.43,lng:-83.33},
  Brantley:{lat:31.19,lng:-81.98},Brooks:{lat:30.83,lng:-83.58},Bryan:{lat:32.03,lng:-81.43},
  Bulloch:{lat:32.41,lng:-81.78},Burke:{lat:33.05,lng:-82.00},Butts:{lat:33.30,lng:-84.00},
  Calhoun:{lat:31.53,lng:-84.74},Camden:{lat:30.88,lng:-81.65},Candler:{lat:32.40,lng:-82.07},
  Carroll:{lat:33.58,lng:-85.08},Catoosa:{lat:34.90,lng:-85.12},Charlton:{lat:30.78,lng:-82.13},
  Chatham:{lat:32.03,lng:-81.10},Chattahoochee:{lat:32.35,lng:-84.79},Cherokee:{lat:34.24,lng:-84.47},
  Clarke:{lat:33.95,lng:-83.37},Clay:{lat:31.63,lng:-84.99},Clayton:{lat:33.55,lng:-84.37},
  Clinch:{lat:31.00,lng:-82.70},Cobb:{lat:33.92,lng:-84.58},Coffee:{lat:31.55,lng:-82.85},
  Colquitt:{lat:31.17,lng:-83.77},Columbia:{lat:33.55,lng:-82.18},Cook:{lat:31.15,lng:-83.43},
  Coweta:{lat:33.35,lng:-84.77},Crawford:{lat:32.73,lng:-84.00},Crisp:{lat:31.93,lng:-83.77},
  Dade:{lat:34.85,lng:-85.49},Dawson:{lat:34.44,lng:-84.17},Decatur:{lat:30.87,lng:-84.58},
  DeKalb:{lat:33.77,lng:-84.22},Dodge:{lat:32.17,lng:-83.17},Dooly:{lat:32.17,lng:-83.73},
  Dougherty:{lat:31.52,lng:-84.19},Douglas:{lat:33.70,lng:-84.77},Early:{lat:31.32,lng:-84.89},
  Echols:{lat:30.70,lng:-82.88},Effingham:{lat:32.37,lng:-81.33},Elbert:{lat:34.12,lng:-82.87},
  Emanuel:{lat:32.60,lng:-82.31},Evans:{lat:32.19,lng:-81.89},Fannin:{lat:34.86,lng:-84.32},
  Fayette:{lat:33.42,lng:-84.47},Floyd:{lat:34.27,lng:-85.22},Forsyth:{lat:34.21,lng:-84.12},
  Franklin:{lat:34.38,lng:-83.22},Fulton:{lat:33.79,lng:-84.47},Gilmer:{lat:34.68,lng:-84.47},
  Glascock:{lat:33.23,lng:-82.62},Glynn:{lat:31.21,lng:-81.49},Gordon:{lat:34.50,lng:-84.87},
  Grady:{lat:30.87,lng:-84.19},Greene:{lat:33.58,lng:-83.15},Gwinnett:{lat:33.96,lng:-84.02},
  Habersham:{lat:34.63,lng:-83.53},Hall:{lat:34.30,lng:-83.82},Hancock:{lat:33.27,lng:-83.00},
  Haralson:{lat:33.79,lng:-85.22},Harris:{lat:32.83,lng:-84.91},Hart:{lat:34.35,lng:-82.97},
  Heard:{lat:33.30,lng:-85.13},Henry:{lat:33.45,lng:-84.15},Houston:{lat:32.47,lng:-83.65},
  Irwin:{lat:31.60,lng:-83.29},Jackson:{lat:34.13,lng:-83.56},Jasper:{lat:33.32,lng:-84.00},
  "Jeff Davis":{lat:31.80,lng:-82.63},Jefferson:{lat:33.05,lng:-82.42},Jenkins:{lat:32.80,lng:-81.97},
  Johnson:{lat:32.70,lng:-82.65},Jones:{lat:33.02,lng:-83.57},Lamar:{lat:33.07,lng:-84.14},
  Lanier:{lat:31.03,lng:-83.06},Laurens:{lat:32.47,lng:-82.93},Lee:{lat:31.77,lng:-84.14},
  Lincoln:{lat:33.79,lng:-82.48},Long:{lat:31.77,lng:-81.73},Lowndes:{lat:30.83,lng:-83.28},
  Lumpkin:{lat:34.56,lng:-83.98},McDuffie:{lat:33.46,lng:-82.47},McIntosh:{lat:31.53,lng:-81.40},
  Macon:{lat:32.35,lng:-84.04},Madison:{lat:33.84,lng:-83.22},Marion:{lat:32.35,lng:-84.53},
  Meriwether:{lat:33.07,lng:-84.68},Miller:{lat:31.17,lng:-84.73},Mitchell:{lat:31.24,lng:-84.18},
  Monroe:{lat:33.03,lng:-83.90},Montgomery:{lat:32.18,lng:-82.54},Morgan:{lat:33.59,lng:-83.49},
  Murray:{lat:34.79,lng:-84.75},Muscogee:{lat:32.51,lng:-84.97},Newton:{lat:33.55,lng:-83.85},
  Oconee:{lat:33.81,lng:-83.43},Oglethorpe:{lat:33.88,lng:-83.07},Paulding:{lat:33.92,lng:-84.87},
  Peach:{lat:32.56,lng:-83.83},Pickens:{lat:34.46,lng:-84.47},Pierce:{lat:31.35,lng:-82.21},
  Pike:{lat:33.09,lng:-84.38},Polk:{lat:34.00,lng:-85.19},Pulaski:{lat:32.23,lng:-83.47},
  Putnam:{lat:33.32,lng:-83.37},Quitman:{lat:31.87,lng:-85.03},Rabun:{lat:34.88,lng:-83.40},
  Randolph:{lat:31.78,lng:-84.74},Richmond:{lat:33.37,lng:-82.07},Rockdale:{lat:33.65,lng:-84.02},
  Schley:{lat:32.27,lng:-84.31},Screven:{lat:32.77,lng:-81.62},Seminole:{lat:30.93,lng:-84.88},
  Spalding:{lat:33.25,lng:-84.27},Stephens:{lat:34.56,lng:-83.47},Stewart:{lat:32.08,lng:-84.83},
  Sumter:{lat:32.07,lng:-84.19},Talbot:{lat:32.70,lng:-84.53},Taliaferro:{lat:33.57,lng:-82.88},
  Tattnall:{lat:32.05,lng:-82.07},Taylor:{lat:32.55,lng:-84.25},Telfair:{lat:31.90,lng:-82.95},
  Terrell:{lat:31.77,lng:-84.43},Thomas:{lat:30.85,lng:-83.92},Tift:{lat:31.45,lng:-83.52},
  Toombs:{lat:32.12,lng:-82.32},Towns:{lat:34.92,lng:-83.73},Treutlen:{lat:32.40,lng:-82.56},
  Troup:{lat:33.03,lng:-85.03},Turner:{lat:31.72,lng:-83.62},Twiggs:{lat:32.67,lng:-83.42},
  Union:{lat:34.83,lng:-83.99},Upson:{lat:32.89,lng:-84.28},Walker:{lat:34.74,lng:-85.38},
  Walton:{lat:33.77,lng:-83.72},Ware:{lat:31.05,lng:-82.45},Warren:{lat:33.41,lng:-82.68},
  Washington:{lat:32.97,lng:-82.82},Wayne:{lat:31.55,lng:-81.93},Webster:{lat:32.05,lng:-84.55},
  Wheeler:{lat:32.10,lng:-82.73},White:{lat:34.64,lng:-83.73},Whitfield:{lat:34.76,lng:-84.97},
  Wilcox:{lat:31.97,lng:-83.43},Wilkes:{lat:33.78,lng:-82.73},Wilkinson:{lat:32.80,lng:-83.18},
  Worth:{lat:31.55,lng:-83.87},
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestCounty(lat: number, lng: number): string {
  let best = "";
  let bestDist = Infinity;
  for (const [name, c] of Object.entries(COUNTY_CENTROIDS)) {
    const d = haversineKm(lat, lng, c.lat, c.lng);
    if (d < bestDist) { bestDist = d; best = name; }
  }
  return best;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("Loading GA territories from DB…");
    const { rows: territories } = await client.query<{ id: string; counties: string[] }>(
      "SELECT id, counties FROM territories WHERE state = 'GA'"
    );

    // Build county (lowercase) → territoryId[] map
    const countyToTerritories = new Map<string, string[]>();
    for (const t of territories) {
      for (const county of (t.counties as string[])) {
        const key = county.toLowerCase();
        if (!countyToTerritories.has(key)) countyToTerritories.set(key, []);
        countyToTerritories.get(key)!.push(t.id);
      }
    }

    // Find contested counties (appear in 2+ territories → ZIPs skipped)
    const contestedCounties = new Set<string>();
    for (const [county, tids] of countyToTerritories) {
      if (tids.length > 1) contestedCounties.add(county);
    }
    console.log(`Found ${territories.length} territories. Contested counties: ${[...contestedCounties].join(", ")}`);

    console.log(`Loading GeoJSON from ${GEOJSON_PATH}…`);
    const geojson = JSON.parse(readFileSync(GEOJSON_PATH, "utf-8"));
    const features = geojson.features as Array<{ properties: Record<string, string> }>;
    console.log(`${features.length} ZIP features found`);

    const toInsert: Array<{ zip: string; territoryId: string }> = [];
    const skipped: Array<{ zip: string; county: string; reason: string }> = [];

    for (const f of features) {
      const zip = f.properties.ZCTA5CE10;
      const lat = parseFloat(f.properties.INTPTLAT10);
      const lng = parseFloat(f.properties.INTPTLON10);
      const county = nearestCounty(lat, lng);
      const countyKey = county.toLowerCase();
      const tids = countyToTerritories.get(countyKey) ?? [];

      if (tids.length === 1) {
        toInsert.push({ zip, territoryId: tids[0] });
      } else if (tids.length === 0) {
        skipped.push({ zip, county, reason: "no territory claims this county" });
      } else {
        skipped.push({ zip, county, reason: `contested (${tids.join(", ")})` });
      }
    }

    console.log(`\nAuto-assigning ${toInsert.length} ZIPs, skipping ${skipped.length} ZIPs…`);

    // Insert in batches of 200 using ON CONFLICT DO NOTHING
    const BATCH = 200;
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const values = batch.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(", ");
      const params = batch.flatMap(r => [r.zip, r.territoryId]);
      const result = await client.query(
        `INSERT INTO territory_zip_assignments (zip, territory_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        params,
      );
      inserted += result.rowCount ?? 0;
    }

    console.log(`\n✓ Inserted: ${inserted} new rows (${toInsert.length - inserted} already existed)`);
    console.log(`✗ Skipped:  ${skipped.length} ZIPs (contested or unmapped counties)\n`);

    // Summarize skipped by county
    const contestedSummary = new Map<string, number>();
    for (const s of skipped) {
      contestedSummary.set(s.county, (contestedSummary.get(s.county) ?? 0) + 1);
    }
    console.log("Skipped ZIP counts by county:");
    for (const [county, count] of [...contestedSummary].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${county}: ${count} ZIPs`);
    }

    // Warn about territories with 0 assigned ZIPs
    const { rows: assigned } = await client.query<{ territory_id: string; cnt: string }>(
      "SELECT territory_id, count(*) as cnt FROM territory_zip_assignments GROUP BY territory_id"
    );
    const assignedSet = new Set(assigned.map(r => r.territory_id));
    const zeroZipTerritories = territories.filter(t => !assignedSet.has(t.id));
    if (zeroZipTerritories.length) {
      console.log(`\n⚠ Territories with 0 assigned ZIPs (${zeroZipTerritories.length}):`);
      for (const t of zeroZipTerritories) {
        console.log(`  ${t.id}`);
      }
    } else {
      console.log("\n✓ All territories have at least one assigned ZIP.");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
