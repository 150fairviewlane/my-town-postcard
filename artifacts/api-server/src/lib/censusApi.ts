import { logger } from "./logger";

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
      logger.warn({ url, err: msg }, "Census fetch failed — retrying once");
      return fetchWithRetry(url, 1, headers);
    }
    logger.error({ url, err: msg }, "Census fetch failed after retry");
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

// ─── getCountyFromZip ─────────────────────────────────────────────────────────

export interface CountyFromZipResult {
  countyFips: string;  // 3-digit county FIPS
  countyName: string;  // e.g. "Hall County"
  stateFips: string;   // 2-digit state FIPS
  stateName: string;   // e.g. "Georgia"
  stateAbbr: string;   // e.g. "GA"
}

export async function getCountyFromZip(zip: string): Promise<CountyFromZipResult | null> {
  const cacheKey = `zip:${zip}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached as CountyFromZipResult;

  try {
    // Step 1: Zippopotam.us → city + state abbreviation (no key needed)
    const zipRes = await fetchWithRetry(`https://api.zippopotam.us/us/${zip}`);
    if (!zipRes || zipRes.status === 404 || !zipRes.ok) return null;

    const zipData = await zipRes.json() as {
      places: Array<{
        "place name": string;
        state: string;
        "state abbreviation": string;
      }>;
    };

    const place = zipData.places?.[0];
    if (!place) return null;

    const stateAbbr = place["state abbreviation"];
    const stateName = place["state"];
    const cityName = place["place name"];
    const stateFips = STATE_FIPS[stateAbbr];
    if (!stateFips) return null;

    // Step 2: ACS county list for this state — NAME format is
    // "Hall County, Georgia" — fuzzy-match against the city name to find
    // which county the ZIP belongs to and extract the 3-digit county FIPS.
    const acsUrl =
      `https://api.census.gov/data/2023/acs/acs5` +
      `?get=NAME&for=county:*&in=state:${stateFips}` +
      censusKeyParam;
    const acsRes = await fetchWithRetry(acsUrl);
    if (!acsRes || !acsRes.ok) return null;

    const acsData = await acsRes.json() as string[][];
    if (!Array.isArray(acsData) || acsData.length < 2) return null;

    const headers = acsData[0];
    const nameIdx = headers.indexOf("NAME");
    const countyIdx = headers.indexOf("county");
    if (nameIdx === -1 || countyIdx === -1) return null;

    // Match county name containing the ZIP's city name.
    // ACS county NAME is "Hall County, Georgia" — compare lowercase.
    const cityLower = cityName.toLowerCase();
    let matchedRow: string[] | null = null;

    for (let i = 1; i < acsData.length; i++) {
      const rowName = (acsData[i][nameIdx] ?? "").toLowerCase();
      // e.g. "hall county, georgia" includes "gainesville" only if the
      // city name appears in the county name (rare). More reliably: the
      // ZIP's city is typically the county seat and its name is usually
      // the first word of the county name — so prefix-match the county
      // name against the city name.
      const countyFirstWord = rowName.split(/\s+/)[0] ?? "";
      if (cityLower.startsWith(countyFirstWord) || countyFirstWord.startsWith(cityLower)) {
        matchedRow = acsData[i];
        break;
      }
    }
    // Fallback: substring search
    if (!matchedRow) {
      for (let i = 1; i < acsData.length; i++) {
        const rowName = (acsData[i][nameIdx] ?? "").toLowerCase();
        if (rowName.includes(cityLower)) {
          matchedRow = acsData[i];
          break;
        }
      }
    }
    if (!matchedRow) return null;

    const countyFips3 = matchedRow[countyIdx];
    if (!countyFips3) return null;

    // County name: "Hall County, Georgia" → "Hall County"
    const fullName = matchedRow[nameIdx] ?? "";
    const commaIdx = fullName.indexOf(",");
    const countyName = commaIdx >= 0 ? fullName.slice(0, commaIdx).trim() : fullName.trim();

    const result: CountyFromZipResult = {
      countyFips: countyFips3,
      countyName,
      stateFips,
      stateName,
      stateAbbr,
    };

    setCached(cacheKey, result, CACHE_TTL_7D);
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, zip }, "getCountyFromZip failed");
    return null;
  }
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
 * The file is pipe-delimited with continuation rows (county columns blank).
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

export async function getCountyInfo(
  stateFips: string,
  countyFips: string
): Promise<CountyInfo | null> {
  const cacheKey = `county-info:${stateFips}:${countyFips}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached as CountyInfo;

  const url =
    `https://api.census.gov/data/2023/acs/acs5` +
    `?get=NAME&for=county:${countyFips}&in=state:${stateFips}` +
    censusKeyParam;
  try {
    const res = await fetchWithRetry(url);
    if (!res || !res.ok) return null;

    const data = await res.json() as string[][];
    if (!Array.isArray(data) || data.length < 2) return null;

    // NAME format: "Hall County, Georgia"
    const nameField = data[1]?.[0] ?? "";
    const commaIdx = nameField.lastIndexOf(",");
    const name = commaIdx >= 0 ? nameField.slice(0, commaIdx).trim() : nameField.trim();
    const stateName = commaIdx >= 0 ? nameField.slice(commaIdx + 1).trim() : "";
    const stateAbbr = FIPS_TO_STATE_ABBR[stateFips] ?? "";
    const geoid = `${stateFips}${countyFips.padStart(3, "0")}`;

    const result: CountyInfo = { name, stateName, stateAbbr, geoid };
    setCached(cacheKey, result, CACHE_TTL_30D);
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, url }, "getCountyInfo failed");
    return null;
  }
}

// ─── getTopCitiesInCounty ─────────────────────────────────────────────────────

const LEGAL_SUFFIX_RE =
  /\s+(CCD|city|town|village|township|borough|CDP|census-designated place)$/i;

/**
 * Returns the top {limit} cities/places in a county by area,
 * derived from the Census Gazetteer county subdivisions file for the state.
 *
 * County subdivisions GEOID is STATEFP(2) + COUNTYFP(3) + COUSUBFP(5), so
 * filtering by countyFips = GEOID.slice(2, 5) isolates the county.
 * Rows are sorted by ALAND (land area, sq meters) descending — a reliable
 * proxy for population when POP10 is not in the file. Legal suffixes such
 * as "CCD", "city", "town" are stripped from the returned names.
 *
 * Falls back to an empty array if the Gazetteer fetch fails (non-fatal).
 */
export async function getTopCitiesInCounty(
  stateFips: string,
  countyFips: string,
  limit = 4
): Promise<string[]> {
  const cacheKey = `top-cities:${stateFips}:${countyFips}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached as string[];

  const countyFips3 = countyFips.padStart(3, "0");
  const url =
    `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer` +
    `/2024_gaz_cousubs_${stateFips}.txt`;

  try {
    const res = await fetchWithRetry(url);
    if (!res || !res.ok) {
      logger.warn({ url, stateFips, countyFips }, "Gazetteer cousubs fetch failed");
      setCached(cacheKey, [], CACHE_TTL_7D);
      return [];
    }

    const text = await res.text();
    const lines = text.split("\n");
    if (lines.length < 2) {
      setCached(cacheKey, [], CACHE_TTL_7D);
      return [];
    }

    // Header: USPS GEOID ANSICODE NAME FUNCSTAT ALAND AWATER ALAND_SQMI AWATER_SQMI INTPTLAT INTPTLONG
    const header = lines[0].split("\t");
    const geoidIdx = header.indexOf("GEOID");
    const nameIdx = header.indexOf("NAME");
    const alandIdx = header.indexOf("ALAND");
    if (geoidIdx === -1 || nameIdx === -1 || alandIdx === -1) {
      logger.warn({ url, header }, "Gazetteer cousubs: unexpected column layout");
      setCached(cacheKey, [], CACHE_TTL_7D);
      return [];
    }

    type GazRow = { name: string; aland: number };
    const rows: GazRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split("\t");
      if (cols.length <= Math.max(geoidIdx, nameIdx, alandIdx)) continue;

      const geoid = cols[geoidIdx]?.trim() ?? "";
      // GEOID for cousubs: STATEFP(2) + COUNTYFP(3) + COUSUBFP(5)
      const rowCountyFips = geoid.slice(2, 5);
      if (rowCountyFips !== countyFips3) continue;

      const rawName = cols[nameIdx]?.trim() ?? "";
      const name = rawName.replace(LEGAL_SUFFIX_RE, "").trim();
      const aland = parseInt(cols[alandIdx] ?? "0", 10) || 0;
      if (name) rows.push({ name, aland });
    }

    const cities = rows
      .sort((a, b) => b.aland - a.aland)
      .map((r) => r.name);

    const unique = [...new Set(cities)].slice(0, limit);
    setCached(cacheKey, unique, CACHE_TTL_7D);
    return unique;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, url, stateFips, countyFips }, "getTopCitiesInCounty failed");
    setCached(cacheKey, [], CACHE_TTL_7D);
    return [];
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

logger.info(
  "Census API module loaded — adjacency file will be fetched on first territory request"
);
