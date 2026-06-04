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
 * We count at the 2-digit sector level using CBP establishment counts (est column).
 * The 6-digit exclusions in EXCLUDED_NAICS_6DIGIT are documented for reference
 * but not applied — they're a small fraction of sector 81.
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

// ─── In-Memory Data Maps ──────────────────────────────────────────────────────

/**
 * ZIP → county row.
 * Source: src/data/zip-county.csv
 * Key: ZIP string (e.g. "30501")
 */
interface ZipRow {
  stateFips: string;    // 2-digit padded, e.g. "13"
  stateName: string;    // e.g. "Georgia"
  stateAbbr: string;    // e.g. "GA"
  countyShort: string;  // e.g. "Hall" (no suffix)
}
const zipCountyMap = new Map<string, ZipRow>();

/**
 * "stateAbbr:COUNTY_UPPER" → ordered unique city list.
 * Source: src/data/us-cities.csv
 * Raw file order preserved; Gainesville appears first for Hall County GA.
 */
const citiesByCountyKey = new Map<string, string[]>();

/**
 * "stateFips:countyFips3" → total ad-ready establishment count.
 * Source: src/data/county-business-patterns.txt (CBP 2022)
 * Summed over the 10 AD_READY_NAICS 2-digit sectors.
 */
const cbpByCounty = new Map<string, number>();

/**
 * 5-digit county GEOID → array of neighboring GEOIDs.
 * Source: src/data/county-adjacency.txt
 */
const adjacencyMap = new Map<string, string[]>();

/**
 * County info derived from the adjacency file.
 * Key: 5-digit GEOID (e.g. "13139")
 */
interface CountyRow {
  countyFips3: string;  // e.g. "139"
  stateFips: string;    // e.g. "13"
  stateAbbr: string;    // e.g. "GA"
  countyName: string;   // e.g. "Hall County"
  stateName: string;    // e.g. "Georgia"
  nameShort: string;    // e.g. "HALL" (uppercased, suffix stripped)
}
const countyInfoByGeoid = new Map<string, CountyRow>();

/**
 * "stateFips:COUNTYSHORT" → countyFips3
 * Built from adjacency data; used by getCountyFromZip to resolve county FIPS.
 */
const countyFipsByShortName = new Map<string, string>();

/**
 * 5-digit county GEOID → population-weighted centroid.
 * Source: src/data/county-centroids.csv (Census 2020 CenPop)
 * Key: "06037" (Los Angeles County, CA)
 */
interface CountyCentroidRow {
  lat: number;
  lng: number;
  population: number; // Census 2020 county population
}
const countyCentroidsMap = new Map<string, CountyCentroidRow>();

/**
 * ZIP → total establishment count.
 * Source: src/data/zbp22totals.txt (ZBP 2022)
 * Key: 5-digit ZIP string (e.g. "30528")
 * Value: total establishments; 'D' (suppressed) values stored as 5.
 */
const zipBusinessMap = new Map<string, number>();

/**
 * ZIP → postcard-relevant establishment count.
 * Source: src/data/zbp-postcard.csv (filtered from ZBP 2022 detail file)
 * Key: 5-digit ZIP string (e.g. "29464")
 * Value: sum of establishments across the 32 postcard-industry NAICS codes
 *   (sectors 44-45, 52-53, 62, 71, 72, 81, specialty contractors 2381x-2383x)
 *   at the 6-digit leaf level only — no double-counting of rollup rows.
 */
const zipPostcardBizMap = new Map<string, number>();

/**
 * 5-digit county GEOID → total occupied housing units (sum of all ZIP estimates
 * within that county from zip-housing-units.csv).
 * Built in loadStaticData() after both zip-county.csv and zip-housing-units.csv load.
 * Key: "STATEFIPS(2)COUNTYFIPS(3)" — e.g. "13241" (Rabun County GA)
 */
const countyHouseholdsMap = new Map<string, number>();

/**
 * ZIP → housing unit estimate derived from Census 2020 county populations.
 * Source: src/data/zip-housing-units.csv
 *
 * Generation method (run once from disk data, committed to repo):
 *   county_housing_units = Census2020_county_population / 2.53 (2020 avg HH size)
 *   Each ZIP receives a share proportional to its ZBP employer-establishment count
 *   within the county (70% proportional + 30% even split), so ZIPs with no
 *   business data still receive a non-zero allocation from the county total.
 *
 * Only strict 5-digit numeric ZIPs are loaded; non-numeric ZCTA group codes
 * (e.g. 350HH, 350XX) that appear in zip-county.csv are silently skipped.
 *
 * Key: 5-digit numeric ZIP string (e.g. "30537")
 * Value: estimated occupied housing units in that ZIP/ZCTA
 */
const zipHousingUnitsMap = new Map<string, number>();

/**
 * ZIP → {lat, lng} centroid.
 * Source: src/data/zip-centroids.csv (Midwire US ZIP centroids)
 * Key: 5-digit ZIP string (e.g. "30528")
 */
const zipCentroidsMap = new Map<string, { lat: number; lng: number }>();

/**
 * City/place record from the Census 2023 Gazetteer for Places.
 */
export interface GazetteerPlace {
  name: string;      // e.g. "Gainesville"
  stateAbbr: string; // e.g. "GA"
  lat: number;
  lng: number;
}

/**
 * State abbreviation → array of Gazetteer places with coordinates.
 * Source: src/data/gazetteer-places.txt
 * Key: 2-letter state abbreviation (e.g. "GA")
 */
const gazetteerByState = new Map<string, GazetteerPlace[]>();

// Legal-suffix pattern for stripping Gazetteer place name suffixes.
// Handles city/town/village/borough, consolidated/metro/charter governments.
// Also strips parenthetical qualifiers like "(balance)" at end of name.
const PLACE_SUFFIX_RE =
  /(\s*\([^)]*\)\s*$|\s+(city|town|village|CDP|borough|township|charter township|municipality|city and borough|unified government|metro government|metropolitan government|consolidated government|urban county government|charter county government|balance of county)$)/gi;

// Strip legal suffixes before uppercasing to get nameShort
const COUNTY_SUFFIX_RE =
  / (County|Parish|Borough|Census Area|City and Borough|Municipality|Municipio|District|City)$/i;

// AD_READY set for O(1) lookup during CBP parsing
const AD_READY_SET = new Set<string>(AD_READY_NAICS);

// ─── Static Data Loader ───────────────────────────────────────────────────────

/**
 * RFC 4180-compatible CSV parser for ZBP lines.
 * Handles the mixed-quoting style in zbp22totals.txt where string fields are
 * double-quoted (and may contain embedded commas) while numeric fields are bare.
 */
function parseZbpCsvLine(line: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let field = "";
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"'; i += 2; // escaped double-quote
        } else if (line[i] === '"') {
          i++; break; // closing quote
        } else {
          field += line[i++];
        }
      }
      result.push(field);
    } else {
      // Bare (unquoted) field — read until next comma or end
      const end = line.indexOf(",", i);
      if (end === -1) { result.push(line.slice(i)); break; }
      result.push(line.slice(i, end));
      i = end;
    }
    if (i < line.length && line[i] === ",") i++; // advance past comma separator
    else break;
  }
  return result;
}

function loadStaticData(): void {
  const dataDir = join(__dirname, "../data");

  // ── 1. zip-county.csv ────────────────────────────────────────────────────────
  // Header: state_fips,state,state_abbr,zipcode,county,city
  // state_fips is unpadded (e.g. "13" for Georgia, "1" for Alabama).
  try {
    const text = readFileSync(join(dataDir, "zip-county.csv"), "utf-8");
    let count = 0;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
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
      count++;
    }
    logger.info({ count }, "Census: loaded zip-county.csv");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) },
      "Census: failed to load zip-county.csv");
  }

  // ── 2. us-cities.csv ─────────────────────────────────────────────────────────
  // Columns (pipe-delimited): City|State short|State full|County|City alias
  // County is already uppercase without suffix, e.g. "HALL".
  // Raw file order preserved — Gainesville appears first for Hall County GA.
  try {
    const text = readFileSync(join(dataDir, "us-cities.csv"), "utf-8");
    let count = 0;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("City|")) continue;
      const cols = line.split("|");
      if (cols.length < 4) continue;
      const city       = cols[0]?.trim() ?? "";
      const stateShort = cols[1]?.trim() ?? "";
      const county     = cols[3]?.trim() ?? ""; // e.g. "HALL"
      if (!city || !stateShort || !county) continue;
      const key = `${stateShort}:${county}`;
      let arr = citiesByCountyKey.get(key);
      if (!arr) {
        arr = [];
        citiesByCountyKey.set(key, arr);
        count++;
      }
      if (!arr.includes(city)) arr.push(city);
    }
    logger.info({ count }, "Census: loaded us-cities.csv");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) },
      "Census: failed to load us-cities.csv");
  }

  // ── 3. county-business-patterns.txt ─────────────────────────────────────────
  // CBP 2022 county data. ~1.1M rows, comma-delimited, string fields quoted.
  // Header: "fipstate","fipscty","naics","emp_nf","emp","qp1_nf","qp1","ap_nf","ap","est",...
  // We match rows where naics = "XX----" (2-digit sector + 4 dashes) and
  // XX ∈ AD_READY_SET. Column 9 (est) = establishment count.
  try {
    const text = readFileSync(join(dataDir, "county-business-patterns.txt"), "utf-8");
    let rows = 0;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith('"fipstate"')) continue;
      const cols = line.split(",");
      if (cols.length < 10) continue;
      const naics = (cols[2] ?? "").replace(/^"|"$/g, "").trim();
      // 2-digit sector rows have form "XX----" (6 chars, last 4 are dashes)
      if (naics.length !== 6 || naics.slice(2) !== "----") continue;
      const sector = naics.slice(0, 2);
      if (!AD_READY_SET.has(sector)) continue;
      const fipstate = (cols[0] ?? "").replace(/^"|"$/g, "").trim();
      const fipscty  = (cols[1] ?? "").replace(/^"|"$/g, "").trim();
      if (!fipstate || !fipscty) continue;
      const est = parseInt((cols[9] ?? "").replace(/^"|"$/g, "").trim(), 10);
      if (isNaN(est) || est <= 0) continue;
      const key = `${fipstate}:${fipscty.padStart(3, "0")}`;
      cbpByCounty.set(key, (cbpByCounty.get(key) ?? 0) + est);
      rows++;
    }
    logger.info({ rows, counties: cbpByCounty.size }, "Census: loaded county-business-patterns.txt");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) },
      "Census: failed to load county-business-patterns.txt");
  }

  // ── 4. county-adjacency.txt ──────────────────────────────────────────────────
  // Tab-delimited. Line format (actual file is tab-delimited, not pipe):
  //   "CountyName, StateName"\tCountyGEOID\t"NeighborName"\tNeighborGEOID
  // Continuation rows have empty first two columns (the current county applies).
  // We also extract county info (name, state, FIPS) from the county column for
  // use in getCountyFromZip and getTopCitiesInCounty.
  try {
    const text = readFileSync(join(dataDir, "county-adjacency.txt"), "utf-8");
    let currentGeoid: string | null = null;
    let adjCount = 0;
    for (const line of text.split("\n")) {
      if (!line) continue;
      const parts = line.split("\t");
      if (parts.length < 4) continue;
      const countyGeoid   = parts[1]?.trim().replace(/^"|"$/g, "");
      const neighborGeoid = parts[3]?.trim().replace(/^"|"$/g, "");

      if (countyGeoid) {
        // New county block — extract county info from the first column.
        currentGeoid = countyGeoid;
        const stateFips = countyGeoid.slice(0, 2);
        const countyFips3 = countyGeoid.slice(2);
        const stateAbbr = FIPS_TO_STATE_ABBR[stateFips] ?? "";
        const stateName = STATE_NAME_BY_ABBR[stateAbbr] ?? stateAbbr;

        // First column: "Hall County, Georgia" (with surrounding quotes)
        const fullField = parts[0]?.trim().replace(/^"|"$/g, "") ?? "";
        const lastComma = fullField.lastIndexOf(",");
        const countyName = lastComma >= 0 ? fullField.slice(0, lastComma).trim() : fullField;
        const nameShort = countyName.replace(COUNTY_SUFFIX_RE, "").toUpperCase().trim();

        if (!countyInfoByGeoid.has(currentGeoid)) {
          countyInfoByGeoid.set(currentGeoid, {
            countyFips3, stateFips, stateAbbr, countyName, stateName, nameShort,
          });
          countyFipsByShortName.set(`${stateFips}:${nameShort}`, countyFips3);
          adjCount++;
        }
        if (!adjacencyMap.has(currentGeoid)) adjacencyMap.set(currentGeoid, []);
      }

      if (!currentGeoid || !neighborGeoid) continue;
      if (neighborGeoid === currentGeoid) continue; // skip self
      const neighbors = adjacencyMap.get(currentGeoid)!;
      if (!neighbors.includes(neighborGeoid)) neighbors.push(neighborGeoid);
    }
    logger.info({ counties: adjCount, edges: adjacencyMap.size }, "Census: loaded county-adjacency.txt");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) },
      "Census: failed to load county-adjacency.txt");
  }

  // ── 5. county-centroids.csv ───────────────────────────────────────────────────
  // Header: STATEFP,COUNTYFP,COUNAME,STNAME,POPULATION,LATITUDE,LONGITUDE
  // Census 2020 population-weighted county centroids.
  // STATEFP and COUNTYFP may not be zero-padded in the raw file.
  try {
    const text = readFileSync(join(dataDir, "county-centroids.csv"), "utf-8");
    let count = 0;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("STATEFP")) continue;
      const cols = line.split(",");
      if (cols.length < 7) continue;
      const stateFp  = (cols[0]?.trim() ?? "").padStart(2, "0");
      const countyFp = (cols[1]?.trim() ?? "").padStart(3, "0");
      const pop      = parseInt(cols[4]?.trim() ?? "0", 10);
      const lat      = parseFloat(cols[5]?.trim() ?? "");
      const lng      = parseFloat(cols[6]?.trim() ?? "");
      if (!stateFp || !countyFp || isNaN(lat) || isNaN(lng)) continue;
      countyCentroidsMap.set(`${stateFp}${countyFp}`, { lat, lng, population: isNaN(pop) ? 0 : pop });
      count++;
    }
    logger.info({ count }, "Census: loaded county-centroids.csv");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) },
      "Census: failed to load county-centroids.csv");
  }

  // ── 6. zbp22totals.txt ────────────────────────────────────────────────────────
  // ZIP Business Patterns 2022. Mixed-quoting CSV: string fields are quoted,
  // numeric fields are NOT quoted. The "name" field is "CITY, STATE" and
  // contains an embedded comma, so parseZbpCsvLine() (RFC-4180) is required —
  // never use simple split(",") here.
  // Column positions are detected from the header row at startup to guard against
  // schema changes. Expected column names: zip, est (or estab).
  try {
    const text = readFileSync(join(dataDir, "zbp22totals.txt"), "utf-8");
    const lines = text.split("\n");

    // Parse header to find column indices by name
    const headerLine = lines[0]?.trim() ?? "";
    const headers = parseZbpCsvLine(headerLine).map(h => h.replace(/^"|"$/g, "").toLowerCase().trim());
    const zipIdx  = headers.findIndex(h => h === "zip");
    const estIdx  = headers.findIndex(h => h === "est" || h === "estab");
    if (zipIdx === -1 || estIdx === -1) {
      logger.error({ headers }, "Census: zbp22totals.txt missing expected columns (zip, est/estab)");
    } else {
      logger.info({ zipIdx, estIdx }, "ZBP column indices detected from header");
    }
    const resolvedZipIdx = zipIdx === -1 ? 0 : zipIdx;
    const resolvedEstIdx = estIdx === -1 ? 8 : estIdx; // fallback to known position

    let count = 0;
    for (const raw of lines.slice(1)) {
      const line = raw.trim();
      if (!line) continue;
      const cols = parseZbpCsvLine(line);
      if (cols.length <= resolvedEstIdx) continue;
      const zip    = (cols[resolvedZipIdx] ?? "").replace(/^"|"$/g, "").trim();
      const estRaw = (cols[resolvedEstIdx] ?? "").replace(/^"|"$/g, "").trim();
      if (!zip || zip.length !== 5) continue;
      const est = estRaw === "D" ? 5 : parseInt(estRaw, 10);
      if (isNaN(est) || est <= 0) continue;
      zipBusinessMap.set(zip, est);
      count++;
    }
    logger.info({ count }, "ZBP loaded: ZIP codes with business data");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) },
      "Census: failed to load zbp22totals.txt");
  }

  // ── 7. zbp-postcard.csv ──────────────────────────────────────────────────────
  // Pre-filtered ZBP 2022 detail: only 6-digit NAICS leaf codes for the 32
  // postcard industries (sectors 44-45, 52-53, 62, 71, 72, 81, contractors 238x).
  // Produced by scripts/filterZbpDetail.ts; committed alongside the server.
  // Header: zip,naics,estab
  // estab may be 'D' (suppressed, stored as 5) or a plain integer.
  try {
    const text = readFileSync(join(dataDir, "zbp-postcard.csv"), "utf-8");
    let count = 0;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("zip,")) continue;
      const cols = line.split(",");
      if (cols.length < 3) continue;
      const zip     = (cols[0] ?? "").trim();
      const estRaw  = (cols[2] ?? "").trim();
      if (!zip || zip.length !== 5) continue;
      const est = estRaw === "D" ? 5 : parseInt(estRaw, 10);
      if (isNaN(est) || est <= 0) continue;
      zipPostcardBizMap.set(zip, (zipPostcardBizMap.get(zip) ?? 0) + est);
      count++;
    }
    logger.info({ zips: zipPostcardBizMap.size, rows: count }, "ZBP postcard businesses loaded");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) },
      "Census: failed to load zbp-postcard.csv — postcard business counts will be 0");
  }

  // ── 8. zip-centroids.csv ──────────────────────────────────────────────────────
  // Midwire US ZIP centroids. Header: code,city,state,county,area_code,lat,lon
  // code = col 0, lat = col 5, lon = col 6.
  try {
    const text = readFileSync(join(dataDir, "zip-centroids.csv"), "utf-8");
    let count = 0;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("code,")) continue;
      const cols = line.split(",");
      if (cols.length < 7) continue;
      const zip = (cols[0] ?? "").trim();
      const lat = parseFloat(cols[5] ?? "");
      const lng = parseFloat(cols[6] ?? "");
      if (!zip || zip.length !== 5 || isNaN(lat) || isNaN(lng)) continue;
      zipCentroidsMap.set(zip, { lat, lng });
      count++;
    }
    logger.info({ count }, "ZIP centroids loaded");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) },
      "Census: failed to load zip-centroids.csv");
  }

  // ── 8. gazetteer-places.txt ───────────────────────────────────────────────────
  // Census 2023 Gazetteer for Incorporated/CDP Places. Tab-delimited.
  // Columns (0-indexed): USPS[0], GEOID[1], ANSICODE[2], NAME[3], LSAD[4],
  //   FUNCSTAT[5], ALAND[6], AWATER[7], ALAND_SQMI[8], AWATER_SQMI[9],
  //   INTPTLAT[10], INTPTLONG[11]
  // NAME includes legal suffixes (e.g. "Gainesville city") — stripped here.
  try {
    const text = readFileSync(join(dataDir, "gazetteer-places.txt"), "utf-8");
    let count = 0;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("USPS")) continue;
      const cols = line.split("\t");
      if (cols.length < 12) continue;
      const stateAbbr = (cols[0] ?? "").trim();
      const rawName   = (cols[3] ?? "").trim();
      const funcStat  = (cols[5] ?? "").trim(); // FUNCSTAT: 'A'=incorporated, 'S'=statistical CDP
      const lat       = parseFloat((cols[10] ?? "").trim());
      const lng       = parseFloat((cols[11] ?? "").trim());
      if (!stateAbbr || !rawName || isNaN(lat) || isNaN(lng)) continue;
      // Only include active incorporated places (A=active, B=active consolidated govt).
      // Exclude FUNCSTAT='S' (CDPs — unincorporated statistical areas) and 'N'/'F' (non-functioning).
      if (funcStat !== "A" && funcStat !== "B") continue;
      const name = rawName.replace(PLACE_SUFFIX_RE, "").trim();
      if (!name) continue;
      let arr = gazetteerByState.get(stateAbbr);
      if (!arr) { arr = []; gazetteerByState.set(stateAbbr, arr); }
      arr.push({ name, stateAbbr, lat, lng });
      count++;
    }
    logger.info({ count, states: gazetteerByState.size }, "Gazetteer places loaded");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) },
      "Census: failed to load gazetteer-places.txt");
  }

  // ── 9. zip-housing-units.csv ──────────────────────────────────────────────────
  // Census 2020 county population distributed proportionally to ZIPs via ZBP
  // establishment density. Replaces the inflated employer-estabs × 22 proxy.
  // Header: zip,housing_units
  try {
    const text = readFileSync(join(dataDir, "zip-housing-units.csv"), "utf-8");
    let count = 0;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("zip,")) continue;
      const cols = line.split(",");
      if (cols.length < 2) continue;
      const zip = (cols[0] ?? "").trim();
      const hu  = parseInt(cols[1] ?? "0", 10);
      if (!zip || !/^\d{5}$/.test(zip) || isNaN(hu) || hu <= 0) continue;
      zipHousingUnitsMap.set(zip, hu);
      count++;
    }
    logger.info({ count }, "Census: loaded zip-housing-units.csv");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) },
      "Census: failed to load zip-housing-units.csv — household counts will fall back to estab proxy");
  }

  // ── 10. Build county households map ─────────────────────────────────────────
  // Sum all ZIP housing unit estimates within each county → county GEOID total.
  // Requires both zipHousingUnitsMap (section 9) and zipCountyMap (section 1).
  try {
    for (const [zip, hu] of zipHousingUnitsMap.entries()) {
      const row = zipCountyMap.get(zip);
      if (!row) continue;
      const countyFips3 = countyFipsByShortName.get(
        `${row.stateFips}:${row.countyShort.toUpperCase().trim()}`
      );
      if (!countyFips3) continue;
      const geoid = `${row.stateFips}${countyFips3.padStart(3, "0")}`;
      countyHouseholdsMap.set(geoid, (countyHouseholdsMap.get(geoid) ?? 0) + hu);
    }
    logger.info({ counties: countyHouseholdsMap.size }, "Census: built county households map");
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) },
      "Census: failed to build county households map");
  }
}

loadStaticData();

// ─── Exported Types ───────────────────────────────────────────────────────────

/**
 * Returns the Census 2020 population-weighted centroid for a county.
 * Pass the 5-digit GEOID (e.g. "06037" for Los Angeles County, CA).
 * Returns null when the GEOID is not found in the centroids dataset.
 */
export function getCountyCentroid(geoid: string): { lat: number; lng: number } | null {
  return countyCentroidsMap.get(geoid) ?? null;
}

/**
 * Returns the 2020 Census population of the county whose population-weighted
 * centroid is nearest to the given lat/lng.  Used to compute a household floor
 * for mailing-area display: `Math.round(pop * 0.40)`.
 * Returns 0 when no county centroid is loaded (data not available).
 */
export function getCountyPopulationNearLocation(lat: number, lng: number): number {
  const toRad = (d: number) => d * Math.PI / 180;
  let minDist = Infinity, bestPop = 0;
  for (const centroid of countyCentroidsMap.values()) {
    const dLat = toRad(centroid.lat - lat);
    const dLng = toRad(centroid.lng - lng);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat)) * Math.cos(toRad(centroid.lat)) * Math.sin(dLng / 2) ** 2;
    const d = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); // radians
    if (d < minDist) { minDist = d; bestPop = centroid.population; }
  }
  return bestPop;
}

export interface CountyFromZipResult {
  countyFips: string;  // 3-digit county FIPS
  countyName: string;  // e.g. "Hall County"
  stateFips: string;   // 2-digit state FIPS
  stateName: string;   // e.g. "Georgia"
  stateAbbr: string;   // e.g. "GA"
}

export interface CountyInfo {
  name: string;      // e.g. "Hall County"
  stateName: string; // e.g. "Georgia"
  stateAbbr: string; // e.g. "GA"
  geoid: string;     // 5-digit FIPS, e.g. "13139"
}

// ─── getCountyFromZip ─────────────────────────────────────────────────────────

/**
 * Resolves a US ZIP code to its primary county using local static data.
 *
 * Data path: zip-county.csv → county short name →
 *   adjacency-derived countyFips3 (via countyFipsByShortName map).
 * Returns null if the ZIP is not in the local dataset.
 */
export async function getCountyFromZip(zip: string): Promise<CountyFromZipResult | null> {
  const row = zipCountyMap.get(zip);
  if (!row) {
    logger.warn({ zip }, "ZIP not found in local dataset");
    return null;
  }
  const { stateFips, stateName, stateAbbr, countyShort } = row;
  const nameKey = `${stateFips}:${countyShort.toUpperCase().trim()}`;
  const countyFips3 = countyFipsByShortName.get(nameKey);
  if (!countyFips3) {
    logger.warn({ zip, stateFips, countyShort }, "County FIPS not found in adjacency data");
    return null;
  }
  const geoid = `${stateFips}${countyFips3}`;
  const countyRow = countyInfoByGeoid.get(geoid);
  return {
    countyFips: countyFips3,
    countyName: countyRow?.countyName ?? `${countyShort} County`,
    stateFips,
    stateName,
    stateAbbr,
  };
}

// ─── getAdReadyBusinessCount ──────────────────────────────────────────────────

/**
 * Returns the total number of ad-ready establishments in a county.
 * Reads from CBP 2022 data loaded at startup. Returns 0 for counties
 * with no CBP data (unpopulated counties or data not available).
 */
export async function getAdReadyBusinessCount(
  stateFips: string,
  countyFips: string
): Promise<number> {
  const key = `${stateFips}:${countyFips.padStart(3, "0")}`;
  return cbpByCounty.get(key) ?? 0;
}

/**
 * Batch version — fetches multiple counties simultaneously.
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
 * Returns the county adjacency map (loaded from disk at startup).
 * Key: 5-digit county GEOID; Value: array of neighboring county GEOIDs.
 * Kept async to preserve the API contract.
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

/**
 * Returns the short county names (e.g. "Dawson", not "Dawson County") for the
 * neighbors of `homeGeoid`, sorted ascending by straight-line haversine distance
 * from the home county centroid to each neighbor centroid.
 *
 * Synchronous — reads from the already-loaded in-memory maps.
 * Returns [] if the home county centroid is missing from the dataset.
 * @param homeGeoid — 5-digit county GEOID of the dealer's home county
 * @param maxCount  — maximum neighbors to return (default 6)
 */
export function getNeighborCountyNames(homeGeoid: string, maxCount = 6): string[] {
  const homeCentroid = countyCentroidsMap.get(homeGeoid);
  if (!homeCentroid) return [];

  const neighborGeoids = adjacencyMap.get(homeGeoid) ?? [];
  if (neighborGeoids.length === 0) return [];

  const toRad = (d: number) => d * Math.PI / 180;
  const R = 3_959; // Earth radius miles

  const withDistance: Array<{ geoid: string; dist: number }> = [];
  for (const geoid of neighborGeoids) {
    const c = countyCentroidsMap.get(geoid);
    if (!c) continue;
    const dLat = toRad(c.lat - homeCentroid.lat);
    const dLng = toRad(c.lng - homeCentroid.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(homeCentroid.lat)) * Math.cos(toRad(c.lat)) * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    withDistance.push({ geoid, dist });
  }

  withDistance.sort((a, b) => a.dist - b.dist);

  const result: string[] = [];
  for (const { geoid } of withDistance.slice(0, maxCount)) {
    const row = countyInfoByGeoid.get(geoid);
    if (!row) continue;
    const short = row.nameShort
      .toLowerCase()
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
    result.push(short);
  }
  return result;
}

// ─── getCountyInfo ────────────────────────────────────────────────────────────

/**
 * Returns county name and state info for a given stateFips + countyFips.
 * Derived from the adjacency file county data loaded at startup.
 */
export async function getCountyInfo(
  stateFips: string,
  countyFips: string
): Promise<CountyInfo | null> {
  const geoid = `${stateFips}${countyFips.padStart(3, "0")}`;
  const row = countyInfoByGeoid.get(geoid);
  if (!row) return null;
  return { name: row.countyName, stateName: row.stateName, stateAbbr: row.stateAbbr, geoid };
}

// ─── getTopCitiesInCounty ─────────────────────────────────────────────────────

/**
 * Returns the top {limit} cities in a county.
 * Reads from us-cities.csv data loaded at startup.
 * Results are in raw file order (Gainesville is first for Hall County GA).
 */
export async function getTopCitiesInCounty(
  stateFips: string,
  countyFips: string,
  limit = 4
): Promise<string[]> {
  const geoid = `${stateFips}${countyFips.padStart(3, "0")}`;
  const row = countyInfoByGeoid.get(geoid);
  if (!row) return [];
  const mapKey = `${row.stateAbbr}:${row.nameShort}`;
  return (citiesByCountyKey.get(mapKey) ?? []).slice(0, limit);
}

// ─── City-Hub Exports ─────────────────────────────────────────────────────────

/**
 * Returns the total establishment count for a ZIP code from ZBP 2022 totals.
 * Returns 0 for ZIPs with no data or suppressed entries stored as 5.
 */
export function getZipBusinessCount(zip: string): number {
  return zipBusinessMap.get(zip) ?? 0;
}

/**
 * Returns the postcard-relevant establishment count for a ZIP code.
 * Sourced from zbp-postcard.csv (ZBP 2022 detail, 6-digit NAICS leaf codes only).
 * Covers sectors 44-45 (retail), 52-53 (finance/RE), 62 (health care),
 * 71 (arts/rec), 72 (food service), 81 (other services), and specialty
 * contractors (238210, 238220, 238320, etc.).
 * Returns 0 for ZIPs with no postcard-industry data.
 */
export function getZipPostcardBusinessCount(zip: string): number {
  return zipPostcardBizMap.get(zip) ?? 0;
}

/**
 * Returns the lat/lng centroid for a ZIP code from the Midwire centroids dataset.
 * Returns null if the ZIP is not found.
 */
export function getZipLocation(zip: string): { lat: number; lng: number } | null {
  return zipCentroidsMap.get(zip) ?? null;
}

/**
 * Returns all ZIPs within radiusMiles of (lat, lng), sorted by distance ascending.
 * Each entry includes:
 *   - households: occupied housing units from zip-housing-units.csv (Census 2020
 *                 county population distributed proportionally by ZBP establishment
 *                 density). Falls back to totalEstabs × HH_PER_ESTAB for ZIPs not
 *                 in the housing-units dataset.
 *   - businesses: postcard-industry ZBP establishment count (used for hub qualification)
 *   - distance: Haversine miles from (lat, lng)
 *
 * Uses a bounding-box pre-filter for performance before the precise Haversine check.
 */
// Fallback only — used for ZIPs absent from zip-housing-units.csv (rare).
const HH_PER_ESTAB = 22;

export function getZipsNearLocation(
  lat: number,
  lng: number,
  radiusMiles: number
): Array<{ zip: string; lat: number; lng: number; households: number; businesses: number; distance: number }> {
  // Approximate degree deltas for the bounding box
  const latDelta = radiusMiles / 69.0;
  const lngDelta = radiusMiles / (69.0 * Math.cos(lat * (Math.PI / 180)));
  const latMin = lat - latDelta;
  const latMax = lat + latDelta;
  const lngMin = lng - lngDelta;
  const lngMax = lng + lngDelta;

  const R = 3_959; // Earth radius in miles
  const result: Array<{ zip: string; lat: number; lng: number; households: number; businesses: number; distance: number }> = [];

  for (const [zip, centroid] of zipCentroidsMap.entries()) {
    if (
      centroid.lat < latMin || centroid.lat > latMax ||
      centroid.lng < lngMin || centroid.lng > lngMax
    ) continue;

    const dLat = (centroid.lat - lat) * (Math.PI / 180);
    const dLng = (centroid.lng - lng) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat * (Math.PI / 180)) *
      Math.cos(centroid.lat * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
    const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (distance > radiusMiles) continue;

    // households: use real Census-derived housing unit counts; fall back to the
    // estab-based proxy only for ZIPs absent from the housing-units dataset.
    const totalEstabs   = zipBusinessMap.get(zip) ?? zipPostcardBizMap.get(zip) ?? 0;
    const businesses    = zipPostcardBizMap.get(zip) ?? 0;
    const households    = zipHousingUnitsMap.get(zip) ?? Math.round(totalEstabs * HH_PER_ESTAB);
    result.push({ zip, lat: centroid.lat, lng: centroid.lng, households, businesses, distance });
  }

  result.sort((a, b) => a.distance - b.distance);
  return result;
}

/**
 * Returns the total occupied housing units for a county, derived from the
 * zip-housing-units.csv dataset summed to the county level.
 * @param geoid — 5-digit county GEOID (state FIPS 2 + county FIPS 3), e.g. "13241"
 */
export function getCountyHouseholds(geoid: string): number {
  return countyHouseholdsMap.get(geoid) ?? 0;
}

/**
 * Returns the 5-digit county GEOID for the county whose ZIP centroid is nearest
 * to (lat, lng). Uses a bounding-box pre-filter for speed (O(n) with early exit).
 * Returns null if no matching ZIP or county can be found.
 */
export function getCountyGeoidForLocation(lat: number, lng: number): string | null {
  // ±0.5° ≈ ±34 miles — wide enough to find a ZIP centroid for any populated area.
  const latDelta = 0.5;
  const lngDelta = 0.6;

  // Collect all candidate ZIPs within the bounding box, sorted by ascending distance.
  // Some ZIPs appear in zip-centroids.csv but not in zip-county.csv (e.g. PO Box
  // ZIPs, rural free-delivery ZIPs, or small satellite ZIPs that are missing from
  // the county assignment table). Walking the sorted list lets us fall back to the
  // next-nearest ZIP that actually has a county assignment instead of returning null.
  const nearby: Array<{ zip: string; dist2: number }> = [];

  for (const [zip, centroid] of zipCentroidsMap.entries()) {
    if (
      Math.abs(centroid.lat - lat) > latDelta ||
      Math.abs(centroid.lng - lng) > lngDelta
    ) continue;
    const dLat = centroid.lat - lat;
    const dLng = centroid.lng - lng;
    nearby.push({ zip, dist2: dLat * dLat + dLng * dLng });
  }

  if (nearby.length === 0) return null;
  nearby.sort((a, b) => a.dist2 - b.dist2);

  for (const { zip } of nearby) {
    const row = zipCountyMap.get(zip);
    if (!row) continue;
    const countyFips3 = countyFipsByShortName.get(
      `${row.stateFips}:${row.countyShort.toUpperCase().trim()}`
    );
    if (!countyFips3) continue;
    return `${row.stateFips}${countyFips3.padStart(3, "0")}`;
  }

  return null;
}

/**
 * Returns all Gazetteer places for a given state abbreviation.
 * Used by the city-hub territory builder to enumerate candidate hub cities.
 */
export function getCitiesInState(stateAbbr: string): GazetteerPlace[] {
  return gazetteerByState.get(stateAbbr) ?? [];
}

/**
 * Resolves a US ZIP code to its 5-digit county GEOID using local static data.
 * Synchronous, in-memory lookup (zipCountyMap + countyFipsByShortName).
 * Returns null if the ZIP is not in the local dataset.
 */
export function getCountyGeoidFromZip(zip: string): string | null {
  const row = zipCountyMap.get(zip);
  if (!row) return null;
  const countyFips3 = countyFipsByShortName.get(
    `${row.stateFips}:${row.countyShort.toUpperCase().trim()}`
  );
  if (!countyFips3) return null;
  return `${row.stateFips}${countyFips3.padStart(3, "0")}`;
}

// ─── Startup ──────────────────────────────────────────────────────────────────

logger.info(
  "Census API module loaded — adjacency file will be fetched on first territory request"
);

/**
 * Returns the full county name (e.g. "Charlottesville city") for a 5-digit GEOID,
 * or null when the GEOID is not in the adjacency dataset.
 */
export function getCountyNameByGeoid(geoid: string): string | null {
  return countyInfoByGeoid.get(geoid)?.countyName ?? null;
}

/**
 * Returns the short (suffix-stripped, title-cased) county name for a 5-digit
 * GEOID, e.g. "13137" → "Habersham". Internally the adjacency dataset stores
 * `nameShort` uppercased; this re-title-cases it for display + storage in
 * territory.counties (which mailing-areas resolves back via
 * getCountyGeoidsByShortNames).
 */
export function getCountyShortNameByGeoid(geoid: string): string | null {
  const row = countyInfoByGeoid.get(geoid);
  if (!row) return null;
  return row.nameShort
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Resolves a list of county short names (e.g. ["Habersham", "Stephens"]) for a
 * given state into their 5-digit GEOID strings (e.g. {"13137", "13257"}).
 * Comparison is case-insensitive. Unknown names are silently skipped.
 */
export function getCountyGeoidsByShortNames(
  stateAbbr: string,
  shortNames: string[]
): Set<string> {
  const upper = new Set(shortNames.map(n => n.toUpperCase()));
  const result = new Set<string>();
  for (const [geoid, row] of countyInfoByGeoid) {
    if (row.stateAbbr.toUpperCase() === stateAbbr.toUpperCase() && upper.has(row.nameShort)) {
      result.add(geoid);
    }
  }
  return result;
}
