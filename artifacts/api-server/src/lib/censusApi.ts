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
 * We count at the 2-digit sector level (CBP rows where naics = "XX----").
 * The 6-digit exclusions in EXCLUDED_NAICS_6DIGIT are documented for future
 * reference; they represent a small fraction of sector 81 and are not applied
 * at query time.
 */
export const AD_READY_NAICS = [
  "44", // Retail Trade
  "45", // Retail Trade (continued — 44-45 split)
  "53", // Real Estate and Rental and Leasing
  "54", // Professional, Scientific, and Technical Services
  "56", // Administrative and Support Services
  "61", // Educational Services
  "62", // Health Care and Social Assistance
  "71", // Arts, Entertainment, and Recreation
  "72", // Accommodation and Food Services
  "81", // Other Services (salons, auto repair, pet grooming, dry cleaners)
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

// ─── Census API key (optional — used only for ACS calls) ──────────────────────

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

const FIPS_TO_STATE_ABBR: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_FIPS).map(([abbr, fips]) => [fips, abbr])
);

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

// ─── Static Data: All Four Files Loaded at Startup ───────────────────────────

/**
 * ZIP → county row (from zip-county.csv, loaded once at startup).
 * county is the short name without suffix, e.g. "Hall".
 */
interface ZipRow {
  stateFips: string;   // 2-digit padded, e.g. "13"
  stateName: string;   // e.g. "Georgia"
  stateAbbr: string;   // e.g. "GA"
  countyShort: string; // e.g. "Hall" (no "County" suffix)
}
const zipCountyMap = new Map<string, ZipRow>();

/**
 * "stateAbbr:COUNTY_UPPER" → ordered unique city list.
 * Gainesville appears first for Hall County GA in raw file order.
 */
const citiesByCountyKey = new Map<string, string[]>();

/**
 * "stateFips:countyFips3" → total ad-ready establishment count.
 * Built by summing CBP est column for the 10 target 2-digit NAICS sectors
 * (rows where naics = "44----", "45----", …, "81----").
 */
const cbpByCounty = new Map<string, number>();

/**
 * County GEOID → array of neighboring county GEOIDs.
 * Loaded from the Census adjacency file at startup.
 */
const adjacencyMap = new Map<string, string[]>();

// Set of 2-digit NAICS codes we aggregate (faster than AD_READY_NAICS.includes)
const AD_READY_SET = new Set<string>(AD_READY_NAICS);

function loadStaticData(): void {
  const dataDir = join(__dirname, "../data");

  // ── 1. zip-county.csv ────────────────────────────────────────────────────────
  // Columns: state_fips,state,state_abbr,zipcode,county,city
  // state_fips is an unpadded integer (e.g. "1" for Alabama, "13" for Georgia).
  try {
    const text = readFileSync(join(dataDir, "zip-county.csv"), "utf-8");
    let loaded = 0;
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("state_fips")) continue;
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
    logger.info({ count: loaded }, "Census: loaded ZIP→county map");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "Census: failed to load zip-county.csv");
  }

  // ── 2. us-cities.csv ─────────────────────────────────────────────────────────
  // Columns (pipe-delimited): City|State short|State full|County|City alias
  // County is uppercase without suffix, e.g. "HALL".
  // Raw file order preserved; Gainesville is first for Hall County GA.
  try {
    const text = readFileSync(join(dataDir, "us-cities.csv"), "utf-8");
    let loaded = 0;
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("City|")) continue;
      const cols = line.split("|");
      if (cols.length < 4) continue;
      const city       = cols[0]?.trim() ?? "";
      const stateShort = cols[1]?.trim() ?? "";
      const county     = cols[3]?.trim() ?? "";
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
    logger.info({ count: loaded }, "Census: loaded cities-by-county map");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "Census: failed to load us-cities.csv");
  }

  // ── 3. county-business-patterns.txt ─────────────────────────────────────────
  // CBP 2022 county-level data. 1.1M rows, comma-delimited, fields quoted.
  // Header: "fipstate","fipscty","naics","emp_nf","emp","qp1_nf","qp1","ap_nf","ap","est",...
  // We read rows where naics = "XX----" (2-digit sector + 4 dashes) and
  // XX is one of the AD_READY_NAICS codes. Column 9 (est) = establishment count.
  try {
    const text = readFileSync(join(dataDir, "county-business-patterns.txt"), "utf-8");
    let rows = 0;
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith('"fipstate"')) continue;

      // Fields are comma-separated; all string fields are double-quoted.
      // Split on comma, then strip surrounding quotes from each field.
      const cols = line.split(",");
      if (cols.length < 10) continue;

      const naics = (cols[2] ?? "").replace(/^"|"$/g, "").trim();

      // Match 2-digit sector rows: exactly "XX----" where XX ∈ AD_READY_SET
      if (naics.length !== 6 || naics.slice(2) !== "----") continue;
      const sector = naics.slice(0, 2);
      if (!AD_READY_SET.has(sector)) continue;

      const fipstate = (cols[0] ?? "").replace(/^"|"$/g, "").trim();
      const fipscty  = (cols[1] ?? "").replace(/^"|"$/g, "").trim();
      if (!fipstate || !fipscty) continue;

      const estRaw = (cols[9] ?? "").replace(/^"|"$/g, "").trim();
      const est = parseInt(estRaw, 10);
      if (isNaN(est) || est <= 0) continue;

      const key = `${fipstate}:${fipscty.padStart(3, "0")}`;
      cbpByCounty.set(key, (cbpByCounty.get(key) ?? 0) + est);
      rows++;
    }
    logger.info({ rows, counties: cbpByCounty.size }, "Census: loaded CBP business counts");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "Census: failed to load county-business-patterns.txt");
  }

  // ── 4. county-adjacency.txt ──────────────────────────────────────────────────
  // Census county adjacency file. Tab-delimited. Format:
  //   "CountyName"\tCountyGEOID\t"NeighborName"\tNeighborGEOID
  // Continuation rows have empty first two fields (tab-leading).
  try {
    const text = readFileSync(join(dataDir, "county-adjacency.txt"), "utf-8");
    let currentGeoid: string | null = null;
    for (const line of text.split("\n")) {
      if (!line) continue;
      const parts = line.split("\t");
      if (parts.length < 4) continue;
      const countyGeoid   = parts[1]?.trim().replace(/^"|"$/g, "");
      const neighborGeoid = parts[3]?.trim().replace(/^"|"$/g, "");
      if (countyGeoid) {
        currentGeoid = countyGeoid;
        if (!adjacencyMap.has(currentGeoid)) adjacencyMap.set(currentGeoid, []);
      }
      if (!currentGeoid || !neighborGeoid) continue;
      if (neighborGeoid === currentGeoid) continue; // skip self
      const neighbors = adjacencyMap.get(currentGeoid)!;
      if (!neighbors.includes(neighborGeoid)) neighbors.push(neighborGeoid);
    }
    logger.info({ counties: adjacencyMap.size }, "Census: loaded county adjacency map");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "Census: failed to load county-adjacency.txt");
  }
}

loadStaticData();

// ─── TIGER County Lookup ──────────────────────────────────────────────────────

interface TigerCounty {
  countyFips3: string; // 3-digit padded, e.g. "139"
  nameFull: string;    // e.g. "Hall County"
  nameShort: string;   // e.g. "HALL" (uppercased, suffix stripped)
}

const COUNTY_SUFFIX_RE =
  / (County|Parish|Borough|Census Area|City and Borough|Municipality|Municipio|District|City)$/i;

/**
 * Fetches all counties for a state from the TIGER REST API (no Census key).
 * Results are cached 30 days in memory. Returns [] on failure (non-fatal).
 */
async function getTigerCountiesForState(stateFips: string): Promise<TigerCounty[]> {
  const cacheKey = `tiger-counties:${stateFips}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached as TigerCounty[];

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
    logger.error({ err: err instanceof Error ? err.message : String(err), url, stateFips }, "getTigerCountiesForState failed");
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
 *   1. In-memory cache (7-day TTL).
 *   2. Local zip-county.csv → state FIPS/name/abbr + county short name ("Hall").
 *   3. TIGER REST API → all counties for the state (cached 30 days) →
 *      match county by uppercased short name → get 3-digit county FIPS.
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

/**
 * Returns the total number of ad-ready establishments in a county.
 * Reads directly from the CBP 2022 data loaded at startup — no network call.
 * Returns 0 if the county has no CBP data (very rare; some unpopulated counties).
 */
export async function getAdReadyBusinessCount(
  stateFips: string,
  countyFips: string
): Promise<number> {
  const key = `${stateFips}:${countyFips.padStart(3, "0")}`;
  return cbpByCounty.get(key) ?? 0;
}

/**
 * Batch version — returns Map keyed by '{stateFips}{countyFips}' → business count.
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
 * Returns the county adjacency map (pre-loaded from disk at startup).
 * Kept async to preserve the existing API contract.
 */
export async function getCountyAdjacency(): Promise<Map<string, string[]>> {
  return adjacencyMap;
}

/**
 * Returns neighboring county GEOIDs for a given 5-digit county GEOID.
 * Sorted alphabetically.
 */
export async function getNeighboringCounties(countyGeoid: string): Promise<string[]> {
  const neighbors = adjacencyMap.get(countyGeoid) ?? [];
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
 * Fallback: TIGER REST API (no key needed, already cached per state).
 * Both paths cached 30 days.
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
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await res.json() as string[][];
        if (Array.isArray(data) && data.length >= 2) {
          const nameField = data[1]?.[0] ?? "";
          const commaIdx = nameField.lastIndexOf(",");
          const name = commaIdx >= 0 ? nameField.slice(0, commaIdx).trim() : nameField.trim();
          const stateName = commaIdx >= 0 ? nameField.slice(commaIdx + 1).trim() : "";
          const result: CountyInfo = { name, stateName, stateAbbr, geoid };
          setCached(cacheKey, result, CACHE_TTL_30D);
          return result;
        }
      }
    }
  } catch {
    // fall through to TIGER
  }

  // ── Fallback: TIGER ──────────────────────────────────────────────────────────
  try {
    const tigerCounties = await getTigerCountiesForState(stateFips);
    const county = tigerCounties.find((c) => c.countyFips3 === countyFips3);
    if (county) {
      const stateName = STATE_NAME_BY_ABBR[stateAbbr] ?? stateAbbr;
      const result: CountyInfo = { name: county.nameFull, stateName, stateAbbr, geoid };
      setCached(cacheKey, result, CACHE_TTL_30D);
      return result;
    }
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err), stateFips, countyFips }, "getCountyInfo TIGER fallback failed");
  }

  return null;
}

// ─── getTopCitiesInCounty ─────────────────────────────────────────────────────

/**
 * Returns the top {limit} cities in a county.
 *
 * Data path:
 *   1. In-memory cache (7-day TTL).
 *   2. TIGER REST API → county nameShort (e.g. "HALL"), cached 30 days.
 *   3. Local us-cities.csv → cities keyed by "stateAbbr:COUNTY_UPPER"
 *      in raw file order (Gainesville is first for Hall County GA).
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
  const tigerCounties = await getTigerCountiesForState(stateFips);
  const county = tigerCounties.find((c) => c.countyFips3 === countyFips3);

  if (!county) {
    logger.warn({ stateFips, countyFips }, "County not found in TIGER for top-cities lookup");
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
  "Census API module loaded — all four data files read from disk at startup; " +
  "TIGER county lists fetched on first territory request per state"
);
