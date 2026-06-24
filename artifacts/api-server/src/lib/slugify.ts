import { db, campaignsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Turn a territory / county name into a clean URL slug.
//   "White / Habersham Counties" -> "white-habersham"
//   "Fulton County — North"      -> "fulton-north"
//   "Alpharetta / Milton / Roswell" -> "alpharetta-milton-roswell"
// Strips the words "county"/"counties", treats "/" as a separator, lowercases,
// and drops every non-alphanumeric character.
export function generateSlug(name: string): string {
  return name
    .replace(/\//g, " ")
    .replace(/\bcount(?:y|ies)\b/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join("-");
}

// Resolve a collision-free campaign slug. Appends -2, -3, ... until the slug is
// free in the campaigns table. Always returns a non-empty slug (falls back to
// "territory" if the name has no usable characters).
// NOTE: prefer generateUniqueTerritorySlug for all new territory/campaign creation.
export async function generateUniqueCampaignSlug(name: string): Promise<string> {
  const base = generateSlug(name) || "territory";
  let candidate = base;
  let n = 1;
  // Bounded loop — in practice resolves on the first or second try.
  for (let attempt = 0; attempt < 1000; attempt++) {
    const [existing] = await db
      .select({ id: campaignsTable.id })
      .from(campaignsTable)
      .where(eq(campaignsTable.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
  // Extremely unlikely fallback — disambiguate with a timestamp.
  return `${base}-${Date.now()}`;
}

// ── Territory slug helpers ────────────────────────────────────────────────────

/** Lowercase a city name and remove all non-alphanumeric characters (no separator
 *  within multi-word names). "Ball Ground" → "ballground", "St. Marys" → "stmarys". */
function normalizeCity(city: string): string {
  return city.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Lowercase a county name and strip the word "county"/"counties".
 *  "Oconee County" → "oconee", "White" → "white". */
function normalizeCounty(county: string): string {
  return county
    .replace(/\bcounty\b/gi, "")
    .replace(/\bcounties\b/gi, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

async function slugExists(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(eq(campaignsTable.slug, slug))
    .limit(1);
  return !!row;
}

/**
 * Generate a unique campaign slug for a territory landing page.
 *
 * Format: `cityname-st`  (e.g. `watkinsville-ga`, `ballground-ga`)
 *   - City name: lowercased, all non-alphanumeric characters removed (no
 *     separator within multi-word names — "Ball Ground" → "ballground").
 *   - State: lowercase 2-letter abbreviation.
 *
 * Collision handling (checks ALL campaigns, any status):
 *   1. `{city}-{state}`                        e.g. `watkinsville-ga`
 *   2. `{city}-{county}-{state}`               e.g. `watkinsville-oconee-ga`
 *   3. `{city}-{state}-2`, `{city}-{state}-3`  numeric suffix (last resort)
 *
 * This is the ONLY function that should generate slugs for new territory/
 * dealer landing-page campaigns. Do not call generateUniqueCampaignSlug for
 * this purpose.
 */
export async function generateUniqueTerritorySlug(
  cityName: string,
  stateAbbr: string,
  countyName?: string | null,
): Promise<string> {
  const city = normalizeCity(cityName) || "territory";
  const state = stateAbbr.toLowerCase().slice(0, 2) || "ga";

  // Attempt 1: cityname-st
  const base = `${city}-${state}`;
  if (!await slugExists(base)) return base;

  // Attempt 2: cityname-countyname-st
  if (countyName) {
    const county = normalizeCounty(countyName);
    if (county) {
      const withCounty = `${city}-${county}-${state}`;
      if (!await slugExists(withCounty)) return withCounty;
    }
  }

  // Attempt 3: numeric suffix on the base slug
  for (let n = 2; n < 1000; n++) {
    const numbered = `${base}-${n}`;
    if (!await slugExists(numbered)) return numbered;
  }

  // Extremely unlikely last resort
  return `${base}-${Date.now()}`;
}
