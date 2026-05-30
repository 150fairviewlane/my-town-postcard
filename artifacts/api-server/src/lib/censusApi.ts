import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── NAICS Configuration ──────────────────────────────────────────────────────

/**
 * 2-digit NAICS sector codes for industries that buy local print advertising.
 * Only these sectors count toward a territory's ad-ready business score.
 *
 * We query at the 2-digit level for speed and API simplicity. The 6-digit
 * exclusions in EXCLUDED_NAICS_6DIGIT below are NOT applied at query time —
 * they represent a small fraction of sector 81 that doesn't materially affect
 * business count scores. If more precision is needed later, switch to 6-digit
 * queries (10x more API calls, proportionally slower).
 */
export const AD_READY_NAICS = [
  "44", // Retail Trade
  "45", // Retail Trade (continued — 44-45 split)
  "53", // Real Estate and Rental and Leasing
  "54", // Professional, Scientific, and Technical Services (law, accounting, insurance)
  "56", // Administrative and Support Services (cleaning, pest control, landscaping)
  "61", // Educational Services (dance studios, tutoring)
  "62", // Health Care and Social Assistance (dentists, chiropractors, vets, medical offices)
  "71", // Arts, Entertainment, and Recreation (gyms, bowling alleys, golf courses)
  "72", // Accommodation and Food Services (restaurants, cafes, bars)
  "81", // Other Services (salons, barbershops, auto repair, pet grooming, dry cleaners)
] as const;

/**
 * 6-digit NAICS codes excluded from sector 81 counts.
 * Not applied at query time — documented here for future reference.
 */
export const EXCLUDED_NAICS_6DIGIT = [
  "813110", // Religious Organizations
  "813211", // Grantmaking Foundations
  "813212", // Voluntary Health Organizations
  "813311", // Human Rights Organizations
  "813312", // Environment, Conservation Organizations
  "813319", // Other Social Advocacy Organizations
  "813410", // Civic and Social Organizations
  "814110", // Private Households
] as const;

// ─── In-Memory Cache ──────────────────────────────────────────────────────────

const cache = new Map<string, { data: unknown; fetchedAt: number; ttl: number }>();
const CACHE_TTL_7D = 7 * 24 * 60 * 60 * 1000;
const CACHE_TTL_30D = 30 * 24 * 60 * 60 * 1000;

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > entry.ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: unknown, ttl = CACHE_TTL_7D): void {
  cache.set(key, { data, fetchedAt: Date.now(), ttl });
}

// ─── Census API key (optional) ────────────────────────────────────────────────

const CENSUS_API_KEY = process.env.CENSUS_API_KEY ?? "";
const censusKeyParam = CENSUS_API_KEY ? `&key=${encodeURIComponent(CENSUS_API_KEY)}` : "";

// ─── Fetch Helper ─────────────────────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  attempt = 0,
  headers?: Record<string, string>
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    clearTimeout(timer);
    return res;
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    if (attempt === 0) {
      logger.warn({ url, err: msg }, "fetch failed — retrying once");
      return fetchWithRetry(url, 1, headers);
    }
    logger.error({ url, err: msg }, "fetch failed after retry");
    return null;
  }
}

// ─── State FIPS Table ─────────────────────────────────────────────────────────

export const STATE_FIPS: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06",
  CO: "08", CT: "09", DE: "10", FL: "12", GA: "13",
  HI: "15", ID: "16", IL: "17", IN: "18", IA: "19",
  KS: "20", KY: "21", LA: "22", ME: "23", MD: "24",
  MA: "25", MI: "26", MN: "27", MS: "28", MO: "29",
  MT: "30", NE: "31", NV: "32", NH: "33", NJ: "34",
  NM: "35", NY: "36", NC: "37", ND: "38", OH: "39",
  OK: "40", OR: "41", PA: "42", RI: "44", SC: "45",
  SD: "46", TN: "47", TX: "48", UT: "49", VT: "50",
  VA: "51", WA: "53", WV: "54", WI: "55", WY: "56",
  DC: "11",
};

// Reverse lookup: 2-digit FIPS → state abbreviation
const FIPS_TO_STATE_ABBR: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_FIPS).map(([abbr, fips]) => [fips, abbr])
);

// ─── Static Data: ZIP→County & Cities-by-County ───────────────────────────────

/**
 * Keyed by 5-digit ZIP string.
 * county is the short name without suffix, e.g. "Hall" (from the CSV's county column).
 */
interface ZipRow {
  stateFips: string;   // 2-digit padded, e.g. "13"
  stateName: string;   // e.g. "Georgia"
  stateAbbr: string;   // e.g. "GA"
  countyShort: string; // e.g. "Hall" (no "County" suffix)
}
const zipCountyMap = new Map<string, ZipRow>();

/**
 * Keyed by "stateAbbr:COUNTY_UPPER", e.g. "GA:HALL".
 * Value is an ordered list of unique city names in raw file order
 * (Gainesville appears first for Hall County GA).
 */
const citiesByCountyKey = new Map<string, string[]>();

function loadStaticData(): void {
  // ── zip-county.csv ───────────────────────────────────────────────────────────
  // Columns: state_fips,state,state_abbr,zipcode,county,city
  // state_fips is an unpadded integer (e.g. "1" for Alabama, "13" for Georgia).
  try {
    const csvPath = join(__dirname, "../data/zip-county.csv");
    const text = readFileSync(csvPath, "utf-8");
    let loaded = 0;
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("state_fips")) continue;
      // Split on first 5 commas only to handle city names that contain commas
      const cols = line.split(",");
      if (cols.length < 5) continue;
      const stateFipsRaw = cols[0]?.trim() ?? "";
      const stateName    = cols[1]?.trim() ?? "";
      const stateAbbr    = cols[2]?.trim() ?? "";
      const zipcode      = cols[3]?.trim() ?? "";
      const countyShort  = cols[4]?.trim() ?? "";
      if (!zipcode || !countyShort || !stateAbbr || !stateFipsRaw) continue;
      zipCountyMap.set(zipcode, {
        stateFips: stateFipsRaw.padStart(2, "0"),
        stateName,
        stateAbbr,
        countyShort,
      });
      loaded++;
    }
    logger.info({ count: loaded }, "Census: loaded ZIP→county map from disk");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "Census: failed to load zip-county.csv");
  }

  // ── us-cities.csv ────────────────────────────────────────────────────────────
  // Columns (pipe-delimited): City|State short|State full|County|City alias
  // County is already uppercase without suffix, e.g. "HALL".
  // The file may have multiple alias rows per city — deduplicate by city name.
  // Raw file order is used; Gainesville appears first for Hall County GA.
  try {
    const csvPath = join(__dirname, "../data/us-cities.csv");
    const text = readFileSync(csvPath, "utf-8");
    let loaded = 0;
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("City|")) continue;
      const cols = line.split("|");
      if (cols.length < 4) continue;
      const city       = cols[0]?.trim() ?? "";
      const stateShort = cols[1]?.trim() ?? "";
      const county     = cols[3]?.trim() ?? ""; // uppercase, e.g. "HALL"
      if (!city || !stateShort || !county) continue;
      const key = `${stateShort}:${county}`;
      let arr = citiesByCountyKey.get(key);
      if (!arr) {
        arr = [];
        citiesByCountyKey.set(key, arr);
        loaded++;
      }
      if (!arr.includes(city)) arr.push(city);
    }
    logger.info({ count: loaded }, "Census: loaded cities-by-county map from disk");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "Census: failed to load us-cities.csv");
  }
}

loadStaticData();

// ─── TIGER County Lookup ──────────────────────────────────────────────────────

/**
 * A single county entry returned by the TIGER REST service.
 * nameShort is the county name with legal suffix stripped and uppercased,
 * matching the key format used in citiesByCountyKey and zipCountyMap.
 */
interface TigerCounty {
  countyFips3: string; // 3-digit padded, e.g. "139"
  nameFull: string;    // e.g. "Hall County"
  nameShort: string;   // e.g. "HALL" (uppercased, suffix stripped)
}

// Strip common US county legal suffixes before uppercasing.
const COUNTY_SUFFIX_RE =
  / (County|Parish|Borough|Census Area|City and Borough|Municipality|Municipio|District|City)$/i;

/**
 * Fetches all counties for a state from the TIGER REST API (no Census key needed).
 * Results are cached 30 days in memory. Returns [] on failure (non-fatal).
 */
async function getTigerCountiesForState(stateFips: string): Promise<TigerCounty[]> {
  const cacheKey = `tiger-counties:${stateFips}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached as TigerCounty[];

  // Most states have < 300 counties; Texas has 254 — 300 is a safe upper bound.
  const url =
    `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query` +
    `?where=STATE%3D'${encodeURIComponent(stateFips)}'` +
    `&outFields=NAME%2CSTATE%2CCOUNTY&returnGeometry=false&f=json&resultRecordCount=300`;

  try {
    const res = await fetchWithRetry(url);
    if (!res || !res.ok) {
      logger.warn({ url, stateFips }, "TIGER county list fetch failed");
      setCached(cacheKey, [], CACHE_TTL_30D);
      return [];
    }

    const data = await res.json() as {
      features?: Array<{ attributes: { NAME: string; STATE: string; COUNTY: string } }>;
    };

    const counties: TigerCounty[] = (data.features ?? []).map((f) => {
      const nameFull = f.attributes.NAME ?? "";
      const nameShort = nameFull.replace(COUNTY_SUFFIX_RE, "").toUpperCase().trim();
      return {
        countyFips3: (f.attributes.COUNTY ?? "").padStart(3, "0"),
        nameFull,
        nameShort,
      };
    });

    setCached(cacheKey, counties, CACHE_TTL_30D);
    return counties;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, url, stateFips }, "getTigerCountiesForState failed");
    setCached(cacheKey, [], CACHE_TTL_30D);
    return [];
  }
}

// ─── getCountyFromZip ─────────────────────────────────────────────────────────

export interface CountyFromZipResult {
  countyFips: string;  // 3-digit county FIPS
  countyName: string;  // e.g. "Hall County"
  stateFips: string;   // 2-digit state FIPS
  stateName: string;   // e.g. "Georgia"
  stateAbbr: string;   // e.g. "GA"
}

/**
 * Resolves a US ZIP code to its primary county.
 *
 * Data path:
 *   1. In-memory cache check (7-day TTL).
 *   2. Local zip-county.csv (loaded at startup, no network) → state FIPS,
 *      state name, state abbreviation, and county short name (e.g. "Hall").
 *   3. TIGER REST API → all counties for the state (cached 30 days) →
 *      find county whose full name starts with the short name → county FIPS.
 *   4. Cache and return; returns null if the ZIP is not in the dataset.
 */
export async function getCountyFromZip(zip: string): Promise<CountyFromZipResult | null> {
  const cacheKey = `zip:${zip}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached as CountyFromZipResult;

  const zipRow = zipCountyMap.get(zip);
  if (!zipRow) {
    logger.warn({ zip }, "ZIP not found in local zip-county dataset");
    return null;
  }

  const { stateFips, stateName, stateAbbr, countyShort } = zipRow;
  const countyShortUpper = countyShort.toUpperCase().trim();

  // TIGER gives us the 3-digit county FIPS and the canonical full county name.
  const tigerCounties = await getTigerCountiesForState(stateFips);
  const match = tigerCounties.find((c) => c.nameShort === countyShortUpper);

  if (!match) {
    logger.warn({ zip, stateFips, countyShort }, "County not found in TIGER data for this state");
    return null;
  }

  const result: CountyFromZipResult = {
    countyFips: match.countyFips3,
    countyName: match.nameFull,
    stateFips,
    stateName,
    stateAbbr,
  };

  setCached(cacheKey, result, CACHE_TTL_7D);
  return result;
}

// ─── getAdReadyBusinessCount ──────────────────────────────────────────────────

export async function getAdReadyBusinessCount(
  stateFips: string,
  countyFips: string
): Promise<number> {
  const cacheKey = `cbp:${stateFips}:${countyFips}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached as number;

  // Fetch all NAICS sectors in parallel — never sequentially.
  const sectorCounts = await Promise.all(
    AD_READY_NAICS.map(async (naics) => {
      const url =
        `https://api.census.gov/data/2023/cbp` +
        `?get=ESTAB,NAICS2017_LABEL` +
        `&for=county:${countyFips}` +
        `&in=state:${stateFips}` +
        `&NAICS2017=${naics}` +
        censusKeyParam;
      try {
        const res = await fetchWithRetry(url);
        if (!res) return 0;
        // 204 = no businesses in this sector — not an error
        if (res.status === 204) return 0;
        if (!res.ok) {
          logger.warn({ url, status: res.status }, "CBP API returned non-OK status");
          return 0;
        }

        const data = await res.json() as string[][];
        if (!Array.isArray(data) || data.length < 2) return 0;

        const headers = data[0];
        const estabIdx = headers.indexOf("ESTAB");
        if (estabIdx === -1) return 0;

        let sectorTotal = 0;
        for (let i = 1; i < data.length; i++) {
          const val = data[i][estabIdx];
          if (val === "D") {
            // Census suppresses data where reporting would identify a single
            // business (disclosure avoidance). Treat as minimum estimate of 5.
            sectorTotal += 5;
          } else {
            const n = parseInt(val, 10);
            if (!isNaN(n)) sectorTotal += n;
          }
        }
        return sectorTotal;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ url, err: msg }, "CBP fetch error for NAICS sector — skipping");
        return 0;
      }
    })
  );

  const total = sectorCounts.reduce((sum, n) => sum + n, 0);
  setCached(cacheKey, total, CACHE_TTL_7D);
  return total;
}

/**
 * Batch version — fetches multiple counties in parallel.
 * Returns Map keyed by '{stateFips}{countyFips}' → business count.
 */
export async function getAdReadyBusinessCountBatch(
  counties: Array<{ stateFips: string; countyFips: string }>
): Promise<Map<string, number>> {
  const entries = await Promise.all(
    counties.map(async ({ stateFips, countyFips }) => {
      const count = await getAdReadyBusinessCount(stateFips, countyFips);
      return [`${stateFips}${countyFips}`, count] as [string, number];
    })
  );
  return new Map(entries);
}

// ─── getCountyAdjacency ───────────────────────────────────────────────────────

/**
 * Loads the Census county adjacency file and returns a Map:
 *   key   = 5-digit county GEOID (e.g. "13139" for Hall County GA)
 *   value = array of neighboring county GEOIDs
 *
 * The file is tab-delimited with continuation rows (county columns blank).
 * The county GEOID from the most recent non-blank row applies to all
 * continuation rows that follow it.
 */
export async function getCountyAdjacency(): Promise<Map<string, string[]>> {
  const cacheKey = "adjacency";
  const cached = getCached(cacheKey);
  if (cached !== null) return cached as Map<string, string[]>;

  const url =
    "https://www2.census.gov/geo/docs/reference/county_adjacency.txt";
  try {
    const res = await fetchWithRetry(url);
    if (!res || !res.ok) {
      logger.error({ url }, "Failed to fetch county adjacency file");
      return new Map();
    }

    const text = await res.text();
    const map = new Map<string, string[]>();
    let currentGeoid: string | null = null;

    for (const line of text.split("\n")) {
      if (!line) continue;

      // Format: tab-delimited — "CountyName"\tCountyGEOID\t"NeighborName"\tNeighborGEOID
      // Continuation rows have empty first two fields (tab-leading).
      const parts = line.split("\t");
      if (parts.length < 4) continue;

      // Strip surrounding double-quotes and whitespace from GEOID columns
      const countyGeoid = parts[1]?.trim().replace(/^"|"$/g, "");
      const neighborGeoid = parts[3]?.trim().replace(/^"|"$/g, "");

      // Non-empty county GEOID starts a new county block
      if (countyGeoid) {
        currentGeoid = countyGeoid;
        if (!map.has(currentGeoid)) {
          map.set(currentGeoid, []);
        }
      }

      if (!currentGeoid || !neighborGeoid) continue;
      // Skip self-neighbor (county always lists itself first)
      if (neighborGeoid === currentGeoid) continue;

      const neighbors = map.get(currentGeoid)!;
      if (!neighbors.includes(neighborGeoid)) {
        neighbors.push(neighborGeoid);
      }
    }

    setCached(cacheKey, map, CACHE_TTL_30D);
    return map;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, url }, "getCountyAdjacency failed");
    return new Map();
  }
}

/**
 * Returns neighboring county GEOIDs for a given 5-digit county GEOID.
 * Sorted alphabetically (border-length data is not in the adjacency file).
 */
export async function getNeighboringCounties(countyGeoid: string): Promise<string[]> {
  const adjacency = await getCountyAdjacency();
  const neighbors = adjacency.get(countyGeoid) ?? [];
  return [...neighbors].sort();
}

// ─── getCountyInfo ────────────────────────────────────────────────────────────

export interface CountyInfo {
  name: string;      // e.g. "Hall County"
  stateName: string; // e.g. "Georgia"
  stateAbbr: string; // e.g. "GA"
  geoid: string;     // 5-digit FIPS, e.g. "13139"
}

/**
 * Returns county name and state info for a given stateFips + countyFips.
 *
 * Primary: ACS NAME endpoint (requires CENSUS_API_KEY for best availability).
 * Fallback: TIGER REST API (no key needed, same source as getCountyFromZip).
 * Both paths are cached 30 days.
 */
export async function getCountyInfo(
  stateFips: string,
  countyFips: string
): Promise<CountyInfo | null> {
  const cacheKey = `county-info:${stateFips}:${countyFips}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached as CountyInfo;

  const countyFips3 = countyFips.padStart(3, "0");
  const geoid = `${stateFips}${countyFips3}`;
  const stateAbbr = FIPS_TO_STATE_ABBR[stateFips] ?? "";

  // ── Primary: ACS ────────────────────────────────────────────────────────────
  const acsUrl =
    `https://api.census.gov/data/2023/acs/acs5` +
    `?get=NAME&for=county:${countyFips3}&in=state:${stateFips}` +
    censusKeyParam;
  try {
    const res = await fetchWithRetry(acsUrl);
    if (res && res.ok) {
      const data = await res.json() as string[][];
      if (Array.isArray(data) && data.length >= 2) {
        // NAME format: "Hall County, Georgia"
        const nameField = data[1]?.[0] ?? "";
        const commaIdx = nameField.lastIndexOf(",");
        const name = commaIdx >= 0 ? nameField.slice(0, commaIdx).trim() : nameField.trim();
        const stateName = commaIdx >= 0 ? nameField.slice(commaIdx + 1).trim() : "";
        const result: CountyInfo = { name, stateName, stateAbbr, geoid };
        setCached(cacheKey, result, CACHE_TTL_30D);
        return result;
      }
    }
  } catch {
    // fall through to TIGER
  }

  // ── Fallback: TIGER (no key needed) ─────────────────────────────────────────
  try {
    const tigerCounties = await getTigerCountiesForState(stateFips);
    const county = tigerCounties.find((c) => c.countyFips3 === countyFips3);
    if (county) {
      // Derive state name from STATE_FIPS reverse lookup + a simple name map
      const stateName = STATE_NAME_BY_ABBR[stateAbbr] ?? stateAbbr;
      const result: CountyInfo = { name: county.nameFull, stateName, stateAbbr, geoid };
      setCached(cacheKey, result, CACHE_TTL_30D);
      return result;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, stateFips, countyFips }, "getCountyInfo TIGER fallback failed");
  }

  return null;
}

// State abbreviation → full name (used for getCountyInfo TIGER fallback only)
const STATE_NAME_BY_ABBR: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

// ─── getTopCitiesInCounty ─────────────────────────────────────────────────────

/**
 * Returns the top {limit} cities in a county.
 *
 * Data path:
 *   1. In-memory cache (7-day TTL).
 *   2. TIGER REST API → canonical county name with suffix stripped and
 *      uppercased (e.g. "HALL"), cached 30 days per state.
 *   3. Local us-cities.csv (loaded at startup) → cities keyed by
 *      "stateAbbr:COUNTY_UPPER" in raw file order. Gainesville appears
 *      first for Hall County GA in this dataset.
 *
 * Falls back to [] if TIGER fails or the county has no cities in the dataset.
 */
export async function getTopCitiesInCounty(
  stateFips: string,
  countyFips: string,
  limit = 4
): Promise<string[]> {
  const cacheKey = `top-cities:${stateFips}:${countyFips}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached as string[];

  const stateAbbr = FIPS_TO_STATE_ABBR[stateFips];
  if (!stateAbbr) {
    setCached(cacheKey, [], CACHE_TTL_7D);
    return [];
  }

  const countyFips3 = countyFips.padStart(3, "0");

  // TIGER gives us the county's nameShort (e.g. "HALL") which matches the
  // key format used in citiesByCountyKey ("GA:HALL").
  const tigerCounties = await getTigerCountiesForState(stateFips);
  const county = tigerCounties.find((c) => c.countyFips3 === countyFips3);

  if (!county) {
    logger.warn({ stateFips, countyFips }, "County not found in TIGER data for top-cities lookup");
    setCached(cacheKey, [], CACHE_TTL_7D);
    return [];
  }

  const mapKey = `${stateAbbr}:${county.nameShort}`;
  const cities = (citiesByCountyKey.get(mapKey) ?? []).slice(0, limit);

  setCached(cacheKey, cities, CACHE_TTL_7D);
  return cities;
}

// ─── Startup ──────────────────────────────────────────────────────────────────

logger.info(
  "Census API module loaded — static ZIP/city data ready; " +
  "adjacency file and TIGER county lists fetched on first territory request"
);
