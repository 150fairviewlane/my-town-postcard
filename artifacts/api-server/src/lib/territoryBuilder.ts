/**
 * Territory Builder Engine — City Hub Model
 *
 * A territory = up to 4 qualifying commercial hub cities within 40 miles of
 * the dealer's ZIP centroid. Each hub qualifies independently based on
 * household catchment (15-mile radius) and business count (10-mile radius).
 *
 * All data comes from in-memory Maps loaded at startup by censusApi.ts.
 * No external API calls anywhere in this module.
 */

import { db, territoriesTable, territoryProposalsTable, territoryZipAssignmentsTable, type TerritoryProposalRow } from "@workspace/db";
import { eq, and, inArray, ne } from "drizzle-orm";
import {
  getCountyInfo,
  getZipsNearLocation,
  getCitiesInState,
  getZipLocation,
  getCountyHouseholds,
  getCountyGeoidForLocation,
  getCountyGeoidForCity,
  getCountyGeoidFromZip,
  getCountyShortNameByGeoid,
  findGazetteerCity,
  getNeighborCountyNames,
  getCityZipBusinessCount,
  getZipPrimaryCity,
  getZipsForCity,
} from "./censusApi";
import { logger } from "./logger";

// ─── City Hub Constants ───────────────────────────────────────────────────────
const HUB_MIN_HOUSEHOLDS    = 5_000; // min catchment households within HUB_HOUSEHOLD_RADIUS (pre-Voronoi)
const HUB_MIN_BUSINESSES    = 25;    // min postcard-industry establishments within HUB_BUSINESS_RADIUS
/**
 * Hard viability floor: cities with fewer than this many postcard-industry
 * businesses in their 10-mile catchment are disqualified as hub anchors before
 * any distance-based ranking.  Prevents small rural towns (e.g. Mount Airy GA,
 * own-ZIP postcard-industry businesses — not the 10-mile-radius `nearbyBusinesses`
 * figure, which is contaminated by neighbour ZIPs in dense rural clusters (e.g.
 * Mount Airy GA appears to have 359 businesses because Cornelia and Clarkesville's
 * ZIPs fall inside its 10-mile ring, even though Mount Airy itself has only 12).
 * Tunable once real sales data is available.
 */
const MIN_HUB_BUSINESS_COUNT = 100;
// After Voronoi+cap, each hub's exclusive zone is naturally smaller than its full
// 15mi circle (used in findCandidateHubs). Use a lower household floor here so that
// legitimate coastal/island anchors (e.g. Hilton Head Island, 4 477 hh) pass while
// tiny rural overshoot hubs (e.g. Awendaw, 655 hh) are still rejected and replaced.
const VORONOI_HUB_MIN_HOUSEHOLDS = 2_000;
const HUB_HOUSEHOLD_RADIUS  = 25;   // miles to sum households around a hub city
const HUB_BUSINESS_RADIUS   = 10;   // miles to sum businesses around a hub city
const TERRITORY_SEARCH_RADIUS = 40; // max miles from dealer ZIP centroid to search
const TARGET_HUB_COUNT      = 4;    // ideal hubs per territory
const MIN_HUB_COUNT         = 3;    // accept territory with ≥ 3 hubs when 4 unavailable
const MIN_TERRITORY_HOUSEHOLDS = 20_000; // min unique (Voronoi) households for viability
const DISPLAY_MIN_HH          = 5_000; // minimum to appear as a standalone mailing area
// County-based display thresholds (mirrors computeMailingAreas in territories.ts)
const DISPLAY_SMALL_COUNTY    = 15_000; // Rule 1: counties below this merge all their hubs
const DISPLAY_PER_HUB_CAP     = 25_000; // Rule 3: per-hub cap for large counties
// Household proxy used for householdsEstimate (backward-compat field)
const HOUSEHOLDS_PER_BUSINESS = 3.5;

// Minimum city population for hub qualification (proxied by local business density).
// Filters out tiny resort/barrier-island municipalities that appear in the Gazetteer
// but have almost no year-round residents or local businesses.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const HUB_MIN_CITY_POPULATION = 8_000; // documented intent; enforcement is via local biz proxy
const HUB_LOCAL_RADIUS  = 8;  // miles for local business density check (wider to capture commercial corridors offset from gazetteer centroid)
const HUB_LOCAL_BIZ_MIN = 8;  // postcard-biz proxy: fewer than this ≈ population < 8,000
// Minimum local-business count for a city to serve as the representative of its
// county hub slot. Cities below this threshold are skipped even if they are the
// only city in their county — the next closest county fills the slot instead.
// Prevents tiny places like Demorest (~1,800) or Clermont from being selected
// when a larger neighbor (Cornelia, Gainesville) exists in an adjacent county.
const HUB_MIN_COUNTY_REP_BIZ = 50;
const MAX_HUB_DISTANCE_MILES = 22; // hard cap on hub distance from dealer

// ─── County Territory Model ───────────────────────────────────────────────────
const COUNTY_MIN_LOCAL_BIZ = 3;  // minimum local businesses per city to qualify as a hub
const COUNTY_MIN_OWN_ZIP_BIZ = 1; // city must have ≥1 postcard-industry biz in its own USPS ZIPs;
                                   // filters residential enclaves (e.g. Berkeley Lake GA, ~600 homes)
                                   // that have Gazetteer entries but no USPS ZIP identity and would
                                   // otherwise inflate their localBiz count via surrounding cities.
const COUNTY_MAX_HUBS = 6;       // max hubs collected before Voronoi caps at TARGET_HUB_COUNT

// Private/gated/ferry-only communities that can slip through the density proxy
// because their commercial data is misleading (resorts count businesses on paper
// but have essentially zero year-round residential mailing market).
// Note: Hilton Head Island (38,158 residents, thriving business community) is
// intentionally NOT in this list and should be proposable as a hub city.
const RESORT_CITIES = new Set([
  "Sullivan's Island", // SC — 1,893 people, tiny barrier island
  "Isle of Palms",     // SC — 4,347 people, tiny barrier island
  "Kiawah Island",     // SC — private gated resort
  "Sea Island",        // GA — private gated resort
  "Bald Head Island",  // NC — ferry-only island, no businesses
  "Ocracoke",          // NC — tiny outer banks seasonal community
]);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CityHub {
  cityName: string;
  stateAbbr: string;
  lat: number;
  lng: number;
  /** 5-digit county GEOID (stateFips2 + countyFips3). Used for county-based display. */
  countyGeoid: string;
  catchmentHouseholds: number;
  nearbyBusinesses: number;
  /** Businesses within HUB_LOCAL_RADIUS miles (~8 mi). Used as city-size proxy. */
  localBiz: number;
  distanceFromDealer: number;
  qualifies: boolean;
  /**
   * Size-weighted ranking score: distanceFromDealer / Math.log(nearbyBusinesses + 1).
   * Lower is better (closer OR larger wins).  Set only for candidates that pass
   * the MIN_HUB_BUSINESS_COUNT viability floor; undefined for below-threshold
   * fallback cities promoted by the graceful-degradation path.
   */
  score?: number;
}

export interface TerritoryProposal {
  proposedName: string;
  slug: string;
  stateFips: string;
  stateAbbr: string;
  stateName: string;
  hubs: CityHub[];
  totalHouseholds: number;
  totalBusinesses: number;
  /** Alias for totalBusinesses — kept for backward compat with display / email code. */
  totalBusinessCount: number;
  householdsEstimate: number;
  isViable: boolean;
  hubCount: number;
  centroidLat: number | null;
  centroidLng: number | null;
  viabilityMessage: string;
  /** Hub city names — stored in DB proposedCities column and used for territory name. */
  topCities: string[];
  /**
   * Always empty in the city-hub model.
   * Kept so existing map/modal code that reads p.counties doesn't crash.
   */
  counties: Array<{ fips: string; name: string; shortName: string; businessCount: number }>;
  estimatedZones: number;
  isSplit: boolean;
  /** Exact county GEOIDs (state+county FIPS) for every county in this territory.
   *  Used by the map renderer to draw county-boundary polygons. */
  countyGeoids: string[];
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictingTerritoryId?: string;
  conflictingTerritoryName?: string;
  conflictingTerritoryStatus?: string;
  conflictingCounty?: string;
}

export interface TerritoryForZipResult {
  type: "existing" | "proposed" | "unavailable";
  territory?: Record<string, unknown>;
  proposals?: TerritoryProposal[];
  proposalIds?: number[];
  message?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COUNTY_SUFFIX_RE =
  / (County|Parish|Borough|Census Area|City and Borough|Municipality|Municipio|District|City)$/i;

function countyShortName(fullName: string): string {
  return fullName.replace(COUNTY_SUFFIX_RE, "").trim();
}

/** Haversine distance in miles between two lat/lng points. */
function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3_959;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Generates a human-readable territory name from a list of hub city names.
 * Never exceeds 50 characters.
 */
export function generateTerritoryName(
  cities: string[],
  _countyNames: string[],
  _stateAbbr: string
): string {
  const limit = 50;
  if (cities.length === 0) {
    const fallback = _countyNames[0] ?? "Territory";
    return fallback.length <= limit ? fallback : fallback.slice(0, limit);
  }
  if (cities.length === 1) return truncate(`${cities[0]} Area`, limit);
  if (cities.length === 2) return truncate(`${cities[0]} / ${cities[1]}`, limit);
  if (cities.length === 3) return truncate(`${cities[0]} / ${cities[1]} / ${cities[2]}`, limit);
  // 4+ cities: first 3 + " Area"
  const name = `${cities[0]} / ${cities[1]} / ${cities[2]} Area`;
  return truncate(name, limit);
}

/**
 * Generates a URL-safe slug from a territory name.
 * Checks territory_proposals for name collisions and appends -2, -3 etc.
 */
export async function generateSlug(name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .replace(/ \/ /g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const existing = await db
    .select({ proposedName: territoryProposalsTable.proposedName })
    .from(territoryProposalsTable);

  const existingSlugs = new Set(
    existing.map(r =>
      r.proposedName
        .toLowerCase()
        .replace(/ \/ /g, "-")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
    )
  );

  if (!existingSlugs.has(base)) return base;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`;
    if (!existingSlugs.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

// ─── Conflict Checker ─────────────────────────────────────────────────────────

/**
 * Checks whether any of the proposed 5-digit county GEOIDs are already
 * assigned to an existing non-proposed territory in the same state.
 *
 * For the city-hub model (non-managed states), the territories table is empty
 * for those states, so this always returns no conflict. The function is kept
 * to support the managed-state (GA) path which still uses county GEOIDs.
 */
export async function checkTerritoryConflicts(
  geoids: string[],
  stateAbbr: string
): Promise<ConflictResult> {
  const geoidToShort = new Map<string, string>();
  for (const geoid of geoids) {
    const stateFips = geoid.slice(0, 2);
    const countyFips = geoid.slice(2);
    const info = await getCountyInfo(stateFips, countyFips);
    if (info) geoidToShort.set(geoid, countyShortName(info.name));
  }

  const proposedShortNames = new Set(geoidToShort.values());

  const territories = await db
    .select({
      id: territoriesTable.id,
      name: territoriesTable.name,
      counties: territoriesTable.counties,
      status: territoriesTable.status,
    })
    .from(territoriesTable)
    .where(eq(territoriesTable.state, stateAbbr));

  for (const terr of territories) {
    if (terr.status === "proposed") continue;
    const terrCounties: string[] = Array.isArray(terr.counties) ? terr.counties : [];
    for (const name of terrCounties) {
      if (proposedShortNames.has(name)) {
        return {
          hasConflict: true,
          conflictingTerritoryId: terr.id,
          conflictingTerritoryName: terr.name,
          conflictingTerritoryStatus: terr.status,
          conflictingCounty: name,
        };
      }
    }
  }
  return { hasConflict: false };
}

// ─── City Hub Engine ──────────────────────────────────────────────────────────

/**
 * Finds all candidate hub cities within TERRITORY_SEARCH_RADIUS miles of the
 * dealer ZIP centroid, computing household catchment and business count for each.
 * Uses a bounding-box pre-filter to avoid iterating all 30k US places.
 */
export async function findCandidateHubs(
  dealerLat: number,
  dealerLng: number,
  stateAbbr: string,
  searchRadius: number = TERRITORY_SEARCH_RADIUS
): Promise<CityHub[]> {
  const allCities = getCitiesInState(stateAbbr);
  if (!allCities.length) {
    logger.warn({ stateAbbr }, "Territory builder: no Gazetteer cities found for state");
    return [];
  }

  // Bounding box pre-filter — scales with the search radius (~45mi at the
  // default 40mi radius), widened proportionally when the radius expands.
  const boxFactor = searchRadius / TERRITORY_SEARCH_RADIUS;
  const LAT_DELTA = 0.65 * boxFactor;
  const LNG_DELTA = 0.80 * boxFactor;
  const latMin = dealerLat - LAT_DELTA;
  const latMax = dealerLat + LAT_DELTA;
  const lngMin = dealerLng - LNG_DELTA;
  const lngMax = dealerLng + LNG_DELTA;

  const boxFiltered = allCities.filter(
    c => c.lat >= latMin && c.lat <= latMax && c.lng >= lngMin && c.lng <= lngMax
  );

  const candidates: CityHub[] = [];

  for (const city of boxFiltered) {
    const distance = haversineDistanceMiles(dealerLat, dealerLng, city.lat, city.lng);
    if (distance > searchRadius) continue;

    // Population filter: skip resort/private-island exclusions and cities that
    // don't meet the minimum population proxy (< HUB_LOCAL_BIZ_MIN businesses
    // within HUB_LOCAL_RADIUS miles ≈ population < HUB_MIN_CITY_POPULATION).
    if (RESORT_CITIES.has(city.name)) continue;
    const localBiz = getZipsNearLocation(city.lat, city.lng, HUB_LOCAL_RADIUS)
      .reduce((s, z) => s + z.businesses, 0);
    if (localBiz < HUB_LOCAL_BIZ_MIN) continue;

    const catchmentZips = getZipsNearLocation(city.lat, city.lng, HUB_HOUSEHOLD_RADIUS);
    const businessZips  = getZipsNearLocation(city.lat, city.lng, HUB_BUSINESS_RADIUS);

    const catchmentHouseholds = catchmentZips.reduce((s, z) => s + z.households, 0);
    const nearbyBusinesses    = businessZips.reduce((s, z) => s + z.businesses, 0);
    const qualifies =
      catchmentHouseholds >= HUB_MIN_HOUSEHOLDS && nearbyBusinesses >= HUB_MIN_BUSINESSES;

    candidates.push({
      cityName: city.name,
      stateAbbr: city.stateAbbr,
      lat: city.lat,
      lng: city.lng,
      countyGeoid: getCountyGeoidForLocation(city.lat, city.lng) ?? "",
      catchmentHouseholds,
      nearbyBusinesses,
      localBiz,
      distanceFromDealer: distance,
      qualifies,
    });
  }

  // ── Viability floor ────────────────────────────────────────────────────────
  // Split candidates into those that clear MIN_HUB_BUSINESS_COUNT and those
  // that don't, then apply the graceful-degradation fallback per county so
  // that every county always contributes at least one representative city.
  //
  // We use getCityZipBusinessCount (own-USPS-ZIP biz count) rather than
  // nearbyBusinesses (10-mile-radius sum) because the radius metric is
  // contaminated in dense rural clusters — every small town within 10 miles
  // of a larger city borrows its neighbours' establishments into its total.
  // Own-ZIP counts reflect only the businesses assigned to that city's
  // actual USPS ZIP codes and are immune to this radius-borrowing effect.

  const viable    = candidates.filter(c => getCityZipBusinessCount(c.cityName, c.stateAbbr) >= MIN_HUB_BUSINESS_COUNT);
  const nonViable = candidates.filter(c => getCityZipBusinessCount(c.cityName, c.stateAbbr) < MIN_HUB_BUSINESS_COUNT);

  // Determine which counties already have at least one viable representative.
  const viableCounties = new Set(viable.map(c => c.countyGeoid));

  // For each county that has NO viable city, promote the best (highest
  // own-ZIP biz count) non-viable city as a below-threshold fallback.
  const fallbackByCounty = new Map<string, CityHub>();
  for (const c of nonViable) {
    const key = c.countyGeoid || `no-county-${c.cityName}`;
    if (viableCounties.has(key)) continue; // county already covered
    const existing = fallbackByCounty.get(key);
    const cBiz = getCityZipBusinessCount(c.cityName, c.stateAbbr);
    const exBiz = existing ? getCityZipBusinessCount(existing.cityName, existing.stateAbbr) : -1;
    if (!existing || cBiz > exBiz) {
      fallbackByCounty.set(key, c);
    }
  }

  const fallbacks = Array.from(fallbackByCounty.values());
  if (fallbacks.length > 0) {
    logger.warn(
      {
        fallbacks: fallbacks.map(c => ({
          city: c.cityName,
          county: c.countyGeoid,
          ownZipBiz: getCityZipBusinessCount(c.cityName, c.stateAbbr),
        })),
      },
      "Territory builder: below-threshold fallback cities promoted (no viable city in county)"
    );
  }

  // ── Size-weighted scoring ───────────────────────────────────────────────────
  // score = distance / log(ownZipBiz + 1)
  // Lower score = better (smaller distance OR larger own-ZIP biz count wins).
  // Uses own-ZIP biz count (not nearbyBusinesses) to avoid radius contamination.
  for (const c of viable) {
    c.score = c.distanceFromDealer / Math.log(getCityZipBusinessCount(c.cityName, c.stateAbbr) + 1);
  }

  // Sort order:
  //   1. Viable cities (pass floor) first, sorted by score ascending.
  //   2. Below-threshold fallbacks last, sorted by score ascending.
  //   Within both groups, qualifies=true cities precede qualifies=false.
  const sortedViable = viable.sort((a, b) => {
    if (a.qualifies !== b.qualifies) return a.qualifies ? -1 : 1;
    return (a.score ?? Infinity) - (b.score ?? Infinity);
  });

  for (const c of fallbacks) {
    c.score = c.distanceFromDealer / Math.log(c.nearbyBusinesses + 1);
  }
  const sortedFallbacks = fallbacks.sort((a, b) => {
    if (a.qualifies !== b.qualifies) return a.qualifies ? -1 : 1;
    return (a.score ?? Infinity) - (b.score ?? Infinity);
  });

  const result = [...sortedViable, ...sortedFallbacks];

  logger.info(
    {
      stateAbbr,
      boxCandidates: boxFiltered.length,
      withinRadius: candidates.length,
      viableFloor: sortedViable.length,
      fallbacks: sortedFallbacks.length,
      qualified: result.filter(c => c.qualifies).length,
      topCandidates: result.slice(0, 8).map(c => ({
        city: c.cityName,
        nearbyBusinesses: c.nearbyBusinesses,
        distanceMi: +c.distanceFromDealer.toFixed(2),
        score: c.score !== undefined ? +c.score.toFixed(4) : null,
        qualifies: c.qualifies,
      })),
    },
    "Territory builder: candidate hubs evaluated"
  );

  return result;
}

/**
 * Selects up to TARGET_HUB_COUNT qualifying hubs using a compact, one-hub-per-county
 * strategy: sort qualifying candidates by distance (closest first), then walk the
 * sorted list and skip any candidate whose county GEOID is already represented.
 * This replaces the old quadrant-spread logic so that nearby towns in the same county
 * don't consume multiple slots at the expense of real coverage in adjacent counties.
 *
 * Delegates to selectHubsByCountyFill.
 *
 * @deprecated Use selectHubsByCountyFill directly.
 */
export function selectBestHubs(
  candidates: CityHub[],
  dealerLat: number,
  dealerLng: number,
  dealerCountyGeoid?: string,
): CityHub[] {
  const homeGeoid = dealerCountyGeoid ?? getCountyGeoidForLocation(dealerLat, dealerLng) ?? "";
  return selectHubsByCountyFill(candidates, dealerLat, dealerLng, homeGeoid);
}

/**
 * County-fill hub selection: builds the territory county by county, starting
 * with the dealer's home county and expanding outward only when the current
 * county is exhausted.
 *
 * Algorithm:
 *   1. Collect all qualifying cities (qualifies=true, localBiz >= HUB_MIN_COUNTY_REP_BIZ)
 *      and group them by county GEOID. Sort each county's cities by
 *      nearbyBusinesses descending (most commercially significant first).
 *   2. Fill from the dealer's home county first — adds ALL qualifying cities
 *      from that county until targetCount is reached.
 *   3. If still under target, find the nearest unvisited county (by distance
 *      from the current territory centroid) and repeat.
 *   4. Stop when target reached or no more counties within reach.
 *
 * Result: coherent, geographically compact territories that stay within as few
 * counties as possible — a dealer and their customers can drive the whole area
 * in an afternoon.
 *
 * Example — Cleveland GA (White County):
 *   Home county (White): Cleveland, Helen       → 2 hubs
 *   Nearest neighbor (Habersham): Cornelia, Clarkesville → 2 hubs
 *   Total 4 hubs across 2 adjacent counties. ✓
 */
export function selectHubsByCountyFill(
  candidates: CityHub[],
  dealerLat: number,
  dealerLng: number,
  dealerCountyGeoid: string,
  targetCount: number = TARGET_HUB_COUNT
): CityHub[] {
  // Only eligible cities: pass pre-Voronoi qualification AND local density gate
  const eligible = candidates.filter(
    c => c.qualifies && c.localBiz >= HUB_MIN_COUNTY_REP_BIZ
  );

  // Group by county, sort each county by nearbyBusinesses descending
  const byCounty = new Map<string, CityHub[]>();
  for (const c of eligible) {
    const key = c.countyGeoid || `no-county-${c.cityName}`;
    if (!byCounty.has(key)) byCounty.set(key, []);
    byCounty.get(key)!.push(c);
  }
  for (const cities of byCounty.values()) {
    cities.sort((a, b) => b.nearbyBusinesses - a.nearbyBusinesses);
  }

  const selected: CityHub[] = [];
  const usedCounties = new Set<string>();

  // Territory centroid starts at the dealer location
  let centLat = dealerLat;
  let centLng = dealerLng;

  // Fill home county first
  if (dealerCountyGeoid && byCounty.has(dealerCountyGeoid)) {
    for (const city of byCounty.get(dealerCountyGeoid)!) {
      if (selected.length >= targetCount) break;
      selected.push(city);
    }
    usedCounties.add(dealerCountyGeoid);
    if (selected.length > 0) {
      centLat = selected.reduce((s, h) => s + h.lat, 0) / selected.length;
      centLng = selected.reduce((s, h) => s + h.lng, 0) / selected.length;
    }
  }

  // Expand to the nearest unvisited county until target reached
  while (selected.length < targetCount) {
    let nearestKey: string | null = null;
    let nearestDist = Infinity;

    for (const [key, cities] of byCounty) {
      if (usedCounties.has(key)) continue;
      // Distance from current centroid to the nearest city in this county
      for (const city of cities) {
        const d = haversineDistanceMiles(centLat, centLng, city.lat, city.lng);
        if (d < nearestDist) {
          nearestDist = d;
          nearestKey = key;
        }
      }
    }
    if (!nearestKey) break;

    usedCounties.add(nearestKey);
    for (const city of byCounty.get(nearestKey)!) {
      if (selected.length >= targetCount) break;
      selected.push(city);
    }

    // Update centroid after each county addition
    centLat = selected.reduce((s, h) => s + h.lat, 0) / selected.length;
    centLng = selected.reduce((s, h) => s + h.lng, 0) / selected.length;
  }

  return selected;
}

// ─── ZIP Footprint helpers ────────────────────────────────────────────────────

const ZIP_FOOTPRINT_RADIUS_MI = 15;

/**
 * Computes the ZIP footprint for a set of hub cities: all ZIPs within
 * ZIP_FOOTPRINT_RADIUS_MI of any hub, each ZIP assigned to its nearest hub.
 * Used to write territory_zip_assignments rows and for conflict detection.
 */
export function computeHubZipFootprint(
  hubs: Array<{ cityName: string; lat: number; lng: number }>
): Array<{ zip: string; hubCity: string }> {
  if (hubs.length === 0) return [];
  const zipMap = new Map<string, { hubCity: string; dist: number }>();
  for (const hub of hubs) {
    const nearbyZips = getZipsNearLocation(hub.lat, hub.lng, ZIP_FOOTPRINT_RADIUS_MI);
    for (const z of nearbyZips) {
      const existing = zipMap.get(z.zip);
      if (!existing || z.distance < existing.dist) {
        zipMap.set(z.zip, { hubCity: hub.cityName, dist: z.distance });
      }
    }
  }
  return [...zipMap.entries()].map(([zip, { hubCity }]) => ({ zip, hubCity }));
}

/**
 * Computes the map-display ZIP footprint for a set of hub cities.
 *
 * Unlike computeHubZipFootprint (which uses a 15-mile radius for conflict
 * detection), this function further filters each candidate ZIP by "nearest
 * gazetteer city" attribution: a ZIP is only included if the closest city in
 * the state gazetteer is one of the hub cities. This prevents geographically
 * close but distinctly-named cities (e.g. Sandy Springs, Cumming, Buford)
 * from bleeding into the Alpharetta proposal highlight, even when they sit
 * within the 15-mile search radius.
 *
 * @param hubs        - Hub cities with lat/lng (same shape as CityHub[])
 * @param stateCities - All gazetteer cities for the state (from getCitiesInState)
 * @returns           - Flat list of ZIP strings that "belong" to one of the hub cities
 */
export function computeMapDisplayZips(
  hubs: Array<{ cityName: string; lat: number; lng: number }>,
  stateCities: Array<{ name: string; lat: number; lng: number }>,
  stateAbbr: string,
  countyGeoids: string[] = []
): string[] {
  if (hubs.length === 0 || stateCities.length === 0) return [];

  const hubNames = new Set(hubs.map(h => h.cityName.toLowerCase().trim()));

  // Collect candidate ZIPs — two passes combined into one map:
  //
  // Pass A (USPS city): seed with ALL ZIPs in the state whose USPS primary
  //   city name matches a hub city, regardless of centroid distance. This is
  //   the authoritative fix for PO Box ZIPs like 30009/Alpharetta whose mass
  //   centroid sits 19+ miles from the actual city and would otherwise fall
  //   outside the 15-mile geometry radius entirely.
  //   We use a sentinel distance (0) to mark these as authoritative inclusions.
  //
  // Pass B (geometry): collect ZIPs within ZIP_FOOTPRINT_RADIUS_MI of any hub
  //   centroid. Each ZIP is assigned to the nearest hub (Voronoi). If a ZIP was
  //   already seeded by Pass A, keep the existing entry (dist=0 wins).
  const zipMap = new Map<string, { lat: number; lng: number; dist: number; uspsMatch: boolean }>();

  for (const hub of hubs) {
    const cityZips = getZipsForCity(hub.cityName, stateAbbr);
    for (const zip of cityZips) {
      if (!zipMap.has(zip)) {
        const loc = getZipLocation(zip);
        if (loc) zipMap.set(zip, { lat: loc.lat, lng: loc.lng, dist: 0, uspsMatch: true });
      }
    }
  }

  for (const hub of hubs) {
    for (const z of getZipsNearLocation(hub.lat, hub.lng, ZIP_FOOTPRINT_RADIUS_MI)) {
      const ex = zipMap.get(z.zip);
      if (!ex || (!ex.uspsMatch && z.distance < ex.dist)) {
        zipMap.set(z.zip, { lat: z.lat, lng: z.lng, dist: z.distance, uspsMatch: false });
      }
    }
  }

  // For each candidate ZIP, apply a two-rule inclusion test:
  //   Rule A (USPS city): the USPS city name matches a hub city → always include.
  //                       (These were seeded in Pass A above.)
  //   Rule B (nearest gazetteer city): the closest gazetteer centroid is a hub
  //                       city → include. Catches delivery ZIPs that share hub
  //                       territory without a matching USPS primary city name.
  // A ZIP is included if EITHER rule matches.
  const result: string[] = [];
  for (const [zip, { lat, lng, uspsMatch }] of zipMap.entries()) {
    if (uspsMatch) {
      result.push(zip);
      continue;
    }
    let nearestName = "";
    let nearestDist = Infinity;
    for (const city of stateCities) {
      const d = haversineDistanceMiles(lat, lng, city.lat, city.lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearestName = city.name.toLowerCase().trim();
      }
    }
    if (hubNames.has(nearestName)) result.push(zip);
  }

  // County-GEOID filter (visual only — mailing counts are unaffected):
  // Exclude ZIPs whose county GEOID is not in the territory's declared counties.
  // Prevents cross-county ZIPs (e.g. 30339/Cobb bleeding into a Fulton+DeKalb
  // territory) from having their full polygon shaded on the map.
  // Skipped when countyGeoids is empty (county could not be resolved).
  if (countyGeoids.length > 0) {
    const allowed = new Set(countyGeoids);
    // Always allow the counties that contain a hub city directly.  The ≥2-hub
    // rule in getCountyTerritoryHubs can leave single-hub counties (e.g.
    // Gray/Jones County) out of countyGeoids even though the city is an
    // explicit mailing area — those ZIPs must still appear on the map.
    for (const hub of hubs) {
      const geoid = getCountyGeoidForLocation(hub.lat, hub.lng);
      if (geoid) allowed.add(geoid);
    }
    return result.filter(zip => {
      const geoid = getCountyGeoidFromZip(zip);
      return geoid != null && allowed.has(geoid);
    });
  }
  return result;
}

/**
 * Returns all unique county GEOIDs covered by the hub ZIP footprint.
 */
export function getFootprintCountyGeoids(
  hubs: Array<{ cityName: string; lat: number; lng: number }>
): string[] {
  const zips = computeHubZipFootprint(hubs);
  const geoids = new Set<string>();
  for (const { zip } of zips) {
    const geoid = getCountyGeoidFromZip(zip);
    if (geoid) geoids.add(geoid);
  }
  return [...geoids];
}

/**
 * Checks whether the proposed hub ZIP footprint overlaps any TAKEN territory's
 * stored ZIP footprint in territory_zip_assignments. Returns the first conflicting
 * territory id, or null when there is no overlap.
 */
export async function checkZipFootprintConflict(
  hubs: Array<{ cityName: string; lat: number; lng: number }>
): Promise<string | null> {
  const footprintZips = computeHubZipFootprint(hubs).map(z => z.zip);
  if (footprintZips.length === 0) return null;

  const CHUNK = 500;
  for (let i = 0; i < footprintZips.length; i += CHUNK) {
    const chunk = footprintZips.slice(i, i + CHUNK);
    const rows = await db
      .select({ territoryId: territoryZipAssignmentsTable.territoryId })
      .from(territoryZipAssignmentsTable)
      .innerJoin(territoriesTable, eq(territoryZipAssignmentsTable.territoryId, territoriesTable.id))
      .where(and(
        eq(territoriesTable.status, "taken"),
        inArray(territoryZipAssignmentsTable.zip, chunk)
      ))
      .limit(1);
    if (rows.length > 0) return rows[0].territoryId;
  }
  return null;
}

/**
 * Resolves proposal city names to hub coordinates via the Gazetteer.
 * Shared by the ZIP conflict-check and footprint-storage paths so resolution
 * logic is defined in one place.
 * Falls back to the centroid point when no city names resolve.
 */
export function resolveProposalHubs(
  cities: string[],
  stateAbbr: string,
  fallbackLat?: number | null,
  fallbackLng?: number | null
): Array<{ cityName: string; lat: number; lng: number }> {
  const gazCities = getCitiesInState(stateAbbr);
  const hubs: Array<{ cityName: string; lat: number; lng: number }> = [];

  for (const cityName of cities) {
    const upper = cityName.toUpperCase();
    const match = gazCities.find(c =>
      c.name.toUpperCase() === upper ||
      c.name.toUpperCase().startsWith(upper) ||
      upper.startsWith(c.name.toUpperCase())
    );
    if (match) hubs.push({ cityName, lat: match.lat, lng: match.lng });
  }

  if (hubs.length === 0 && fallbackLat != null && fallbackLng != null) {
    hubs.push({ cityName: "center", lat: fallbackLat, lng: fallbackLng });
  }
  return hubs;
}

/**
 * Resolves each city name to coordinates via the Gazetteer, computes the 15-mile
 * ZIP footprint around each hub, and bulk-inserts into territory_zip_assignments.
 * Uses onConflictDoNothing so the first territory to claim a ZIP keeps it.
 * Exported so the synchronous confirm path can also call it.
 */
export async function storeZipFootprintForTerritory(
  territoryId: string,
  cities: string[],
  stateAbbr: string,
  fallbackLat?: number | null,
  fallbackLng?: number | null
): Promise<void> {
  const hubs = resolveProposalHubs(cities, stateAbbr, fallbackLat, fallbackLng);
  if (hubs.length === 0) return;

  const zips = computeHubZipFootprint(hubs);
  if (zips.length === 0) return;

  const CHUNK = 200;
  for (let i = 0; i < zips.length; i += CHUNK) {
    const chunk = zips.slice(i, i + CHUNK);
    await db.insert(territoryZipAssignmentsTable)
      .values(chunk.map(({ zip }) => ({ zip, territoryId })))
      .onConflictDoNothing();
  }

  logger.info({ territoryId, zipCount: zips.length }, "ZIP footprint stored for territory");
}

/**
 * Voronoi ZIP assignment: assigns each ZIP in `allNearbyZips` (all ZIPs within
 * TERRITORY_SEARCH_RADIUS of the dealer) to its nearest hub exclusively.
 * Each ZIP counts toward exactly one hub — no double-counting from overlapping
 * catchment circles.  Logs per-hub assignment counts for debugging.
 *
 * Returns updated hub objects with exclusive catchmentHouseholds /
 * nearbyBusinesses and re-evaluated `qualifies`.
 */
function voronoiAssign(
  hubs: CityHub[],
  allNearbyZips: Array<{ zip: string; lat: number; lng: number; households: number; businesses: number; distance: number }>
): CityHub[] {
  if (hubs.length === 0) return [];

  const hubHH   = new Map<string, number>(hubs.map(h => [h.cityName, 0]));
  const hubBiz  = new Map<string, number>(hubs.map(h => [h.cityName, 0]));
  const hubZips = new Map<string, number>(hubs.map(h => [h.cityName, 0]));

  for (const zip of allNearbyZips) {
    let nearestHub = hubs[0]!;
    let minDist = Infinity;
    for (const hub of hubs) {
      const d = haversineDistanceMiles(zip.lat, zip.lng, hub.lat, hub.lng);
      if (d < minDist) { minDist = d; nearestHub = hub; }
    }
    // Post-assignment radius gate: only count ZIPs within HUB_HOUSEHOLD_RADIUS of
    // their assigned hub. This prevents boundary hubs from accumulating ZIPs that
    // are 20-28 miles away simply because no closer hub exists in that sector.
    if (minDist > HUB_HOUSEHOLD_RADIUS) continue;

    hubHH.set(nearestHub.cityName,   (hubHH.get(nearestHub.cityName)   ?? 0) + zip.households);
    hubBiz.set(nearestHub.cityName,  (hubBiz.get(nearestHub.cityName)  ?? 0) + zip.businesses);
    hubZips.set(nearestHub.cityName, (hubZips.get(nearestHub.cityName) ?? 0) + 1);
  }

  // Debug: confirm capped assignment counts
  for (const hub of hubs) {
    logger.debug(
      {
        hub: hub.cityName,
        zipsAssigned: hubZips.get(hub.cityName) ?? 0,
        households:   hubHH.get(hub.cityName)   ?? 0,
        businesses:   hubBiz.get(hub.cityName)  ?? 0,
      },
      `Hub ${hub.cityName}: ${hubZips.get(hub.cityName) ?? 0} ZIPs assigned (≤${HUB_HOUSEHOLD_RADIUS}mi cap), ` +
      `${hubHH.get(hub.cityName) ?? 0} households, ${hubBiz.get(hub.cityName) ?? 0} businesses`
    );
  }

  return hubs.map(h => {
    const hh  = hubHH.get(h.cityName)  ?? 0;
    const biz = hubBiz.get(h.cityName) ?? 0;
    // Post-Voronoi qualification uses VORONOI_HUB_MIN_HOUSEHOLDS (lower than the
    // pre-Voronoi HUB_MIN_HOUSEHOLDS) because the 15mi cap gives each hub a
    // smaller exclusive zone than its full circle overlap.  The lower floor
    // keeps real anchors like Hilton Head Island (4 477 hh) while still
    // rejecting rural overshoot hubs like Awendaw (655 hh).
    return {
      ...h,
      catchmentHouseholds: hh,
      nearbyBusinesses:    biz,
      qualifies: hh >= VORONOI_HUB_MIN_HOUSEHOLDS && biz >= HUB_MIN_BUSINESSES,
    };
  });
}

// ─── AI Hub Selection ─────────────────────────────────────────────────────────


/**
 * Returns up to 100 unique hub city names from territories already taken within
 * 25 miles of the dealer location (same state). Used to tell the AI which cities
 * are already claimed so it can avoid them.
 */
async function getClaimedHubCities(
  dealerLat: number,
  dealerLng: number,
  stateAbbr: string
): Promise<string[]> {
  const CLAIMED_RADIUS_MI = 25;
  const rows = await db
    .select({
      centroidLat: territoriesTable.centroidLat,
      centroidLng: territoriesTable.centroidLng,
      zoneNote: territoriesTable.zoneNote,
    })
    .from(territoriesTable)
    .where(and(
      eq(territoriesTable.state, stateAbbr),
      eq(territoriesTable.status, "taken")
    ));

  const withDistance = rows
    .filter(r => r.centroidLat != null && r.centroidLng != null)
    .map(r => ({
      ...r,
      dist: haversineDistanceMiles(dealerLat, dealerLng, r.centroidLat!, r.centroidLng!),
    }))
    .filter(r => r.dist <= CLAIMED_RADIUS_MI)
    .sort((a, b) => a.dist - b.dist);

  const seen = new Set<string>();
  for (const row of withDistance) {
    if (!row.zoneNote) continue;
    for (const city of row.zoneNote.split(",")) {
      const name = city.trim();
      if (name) seen.add(name);
    }
    if (seen.size >= 100) break;
  }
  return [...seen].slice(0, 100);
}


/**
 * County-based hub selection — deterministic, no AI call.
 *
 * Always pins the seed city as Zone 1. Then selects up to 3 additional zones
 * using a radius-based search (starting at 15 miles, expanding in 5-mile
 * increments) sorted primarily by proximity-weighted distance:
 *   - same county as seed: distanceMultiplier = 0.7  (strongly preferred)
 *   - adjacent county:     distanceMultiplier = 0.85
 *   - any other county:    distanceMultiplier = 1.0
 *
 * This guarantees Johns Creek / Milton / Roswell appear before Atlanta for an
 * Alpharetta dealer, because they are much closer even after the county weight.
 * Atlanta at 25 miles actual distance exceeds the 15-mile hard cap and is
 * excluded entirely in the first pass.
 */
async function getCountyTerritoryHubs(
  city: string,
  stateAbbr: string,
  dealerLat: number,
  dealerLng: number,
  excludedCities: string[]
): Promise<{ hubs: CityHub[]; countyLabel: string; countyGeoids: string[] }> {
  const excludedSet = new Set(excludedCities.map(c => c.toLowerCase().trim()));

  // Step 1: Resolve seed city → Gazetteer place + county GEOID
  const homePlace = findGazetteerCity(city, stateAbbr);
  if (!homePlace) {
    logger.warn({ city, stateAbbr }, "County territory: city not found in Gazetteer");
    return { hubs: [], countyLabel: "", countyGeoids: [] };
  }
  const homeGeoid = getCountyGeoidForLocation(homePlace.lat, homePlace.lng) ?? "";
  if (!homeGeoid) {
    // County resolution failed (e.g. metro ZIP absent from zip-county.csv).
    // Proceed without county-proximity weighting — still produces a valid
    // 4-zone proposal using pure distance sorting rather than "unavailable".
    logger.warn({ city, stateAbbr }, "County territory: could not resolve home county GEOID — proceeding without county scoping");
  }
  const homeCountyInfo = homeGeoid
    ? await getCountyInfo(homeGeoid.slice(0, 2), homeGeoid.slice(2))
    : null;
  const homeCountyShort = homeCountyInfo?.name.replace(/\s+County$/i, "").trim() ?? city;

  // Helper: build a CityHub from a Gazetteer-resolved place
  function buildHub(c: { name: string; stateAbbr: string; lat: number; lng: number }): CityHub {
    const geoid = getCountyGeoidForLocation(c.lat, c.lng) ?? "";
    const nearbyZips = getZipsNearLocation(c.lat, c.lng, HUB_HOUSEHOLD_RADIUS);
    const bizZips    = getZipsNearLocation(c.lat, c.lng, HUB_BUSINESS_RADIUS);
    const localZips  = getZipsNearLocation(c.lat, c.lng, HUB_LOCAL_RADIUS);
    return {
      cityName: c.name,
      stateAbbr: c.stateAbbr,
      lat: c.lat,
      lng: c.lng,
      countyGeoid: geoid,
      catchmentHouseholds: nearbyZips.reduce((s, z) => s + z.households, 0),
      nearbyBusinesses:    bizZips.reduce((s, z) => s + z.businesses, 0),
      localBiz:            localZips.reduce((s, z) => s + z.businesses, 0),
      distanceFromDealer:  haversineDistanceMiles(dealerLat, dealerLng, c.lat, c.lng),
      qualifies: true,
    };
  }

  const allStateCities = getCitiesInState(stateAbbr);
  const seedCityNorm = city.toLowerCase().trim();

  // Step 2: Build adjacent-county short-name set for proximity weighting.
  // Empty when homeGeoid is unknown — all candidates get multiplier 1.0.
  const adjacentCountyShortNames = new Set(
    homeGeoid ? getNeighborCountyNames(homeGeoid).map(n => n.toLowerCase()) : []
  );

  // Step 3: Build geoid → short county name map (one async pass over all geoids).
  const candidateGeoids = new Set(
    allStateCities
      .map(c => getCountyGeoidForLocation(c.lat, c.lng))
      .filter((g): g is string => g != null)
  );
  const geoidToShortName = new Map<string, string>();
  if (homeGeoid) geoidToShortName.set(homeGeoid, homeCountyShort.toLowerCase());
  for (const geoid of candidateGeoids) {
    if (geoidToShortName.has(geoid)) continue;
    const info = await getCountyInfo(geoid.slice(0, 2), geoid.slice(2));
    if (info) {
      geoidToShortName.set(geoid, info.name.replace(/\s+County$/i, "").trim().toLowerCase());
    }
  }

  // Step 4: Score every candidate city with proximity-weighted, size-adjusted distance.
  //
  //   Proximity multiplier (county relationship):
  //     same county     → actual distance × 0.7
  //     adjacent county → actual distance × 0.85
  //     other county    → actual distance × 1.0
  //
  //   Size-weighted score (lower = better):
  //     score = scoredDist / Math.log(nearbyBusinesses + 1)
  //   This replaces the old pure-distance sort so that a significantly larger
  //   commercial centre (e.g. Clarkesville, ~700 businesses, 6.5 mi) outranks
  //   a tiny nearby town (e.g. Mount Airy, ~50 businesses, 2 mi).
  //
  //   Viability floor: candidates with nearbyBusinesses < MIN_HUB_BUSINESS_COUNT
  //   are excluded before sorting.  If no candidate in the entire pool passes the
  //   floor the algorithm falls back gracefully (promotes the largest available
  //   city and logs a warning) rather than returning an empty set.
  type ScoredHub = CityHub & { scoredDist: number };

  const allMapped: ScoredHub[] = allStateCities
    .filter(c => {
      const norm = c.name.toLowerCase().trim();
      if (norm === seedCityNorm) return false;   // seed is handled separately
      if (excludedSet.has(norm)) return false;
      if (RESORT_CITIES.has(c.name)) return false;
      return true;
    })
    .map(c => {
      const hub = buildHub(c);
      const shortName = geoidToShortName.get(hub.countyGeoid) ?? "";
      let multiplier: number;
      if (homeGeoid && hub.countyGeoid === homeGeoid) {
        multiplier = 0.7;
      } else if (homeGeoid && adjacentCountyShortNames.has(shortName)) {
        multiplier = 0.85;
      } else {
        multiplier = 1.0;
      }
      return { ...hub, scoredDist: hub.distanceFromDealer * multiplier };
    })
    .filter(h => h.localBiz >= COUNTY_MIN_LOCAL_BIZ)
    // Exclude residential enclaves with no USPS ZIP identity. localBiz at 8 mi
    // is inflated by surrounding commercial corridors (e.g. Berkeley Lake GA
    // captures Peachtree Corners + Duluth + Norcross), so we require the city
    // to have at least one postcard-industry biz in its own USPS-labeled ZIPs.
    .filter(h => getCityZipBusinessCount(h.cityName, h.stateAbbr) >= COUNTY_MIN_OWN_ZIP_BIZ);

  // Viability floor: keep only cities whose own-ZIP postcard-industry business
  // count meets MIN_HUB_BUSINESS_COUNT.  Own-ZIP (getCityZipBusinessCount) is
  // used here — NOT nearbyBusinesses — because the 10-mile radius metric is
  // contaminated in dense rural clusters where every small town borrows its
  // neighbours' ZIP codes (e.g. Mount Airy GA: 12 own-ZIP businesses but 359
  // nearbyBusinesses because Cornelia and Clarkesville's ZIPs fall inside its
  // 10-mile ring).
  // If the floor would wipe out the entire pool, fall back to all candidates
  // (but warn so the data gap is visible in logs).
  let viablePool = allMapped.filter(h => getCityZipBusinessCount(h.cityName, h.stateAbbr) >= MIN_HUB_BUSINESS_COUNT);
  if (viablePool.length === 0 && allMapped.length > 0) {
    logger.warn(
      {
        city,
        stateAbbr,
        poolSize: allMapped.length,
        maxOwnZipBiz: Math.max(...allMapped.map(h => getCityZipBusinessCount(h.cityName, h.stateAbbr))),
      },
      "County territory: no candidates meet MIN_HUB_BUSINESS_COUNT (own-ZIP) — falling back to full pool"
    );
    viablePool = allMapped;
  }

  // Size-weighted sort: score = scoredDist / log(ownZipBiz + 1)
  // Uses own-ZIP biz count to avoid radius-borrowing contamination.
  const candidateHubs: ScoredHub[] = viablePool
    .map(h => ({ ...h, score: h.scoredDist / Math.log(getCityZipBusinessCount(h.cityName, h.stateAbbr) + 1) }))
    .sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity)) as ScoredHub[];

  logger.info(
    {
      city,
      stateAbbr,
      totalMapped: allMapped.length,
      viableAfterFloor: viablePool.length,
      top8: candidateHubs.slice(0, 8).map(h => {
        const ownZipBiz = getCityZipBusinessCount(h.cityName, h.stateAbbr);
        return {
          name: h.cityName,
          ownZipBiz,
          distMi: +h.distanceFromDealer.toFixed(2),
          scoredDist: +h.scoredDist.toFixed(2),
          score: +(h.scoredDist / Math.log(ownZipBiz + 1)).toFixed(4),
        };
      }),
    },
    "County territory: candidate ranking"
  );

  // Step 5: Always pin the seed city as Zone 1.
  const seedHub = buildHub({ name: city, stateAbbr, lat: homePlace.lat, lng: homePlace.lng });

  // Step 6: Radius-based fill for the remaining 3 zones.
  // Start at 15 miles actual distance; expand in 5-mile steps until 3 found or
  // the 40-mile hard cap is reached.
  const INITIAL_RADIUS_MI = 15;
  const RADIUS_STEP_MI    = 5;
  const HARD_MAX_RADIUS   = 40;
  const ZONES_NEEDED      = TARGET_HUB_COUNT - 1; // 3 additional zones

  let additionalHubs: ScoredHub[] = [];
  let currentRadius = INITIAL_RADIUS_MI;

  while (currentRadius <= HARD_MAX_RADIUS) {
    // Filter on ACTUAL distance (not scored distance) for the hard radius cap.
    const withinRadius = candidateHubs.filter(h => h.distanceFromDealer <= currentRadius);
    if (withinRadius.length >= ZONES_NEEDED) {
      additionalHubs = withinRadius.slice(0, ZONES_NEEDED);
      break;
    }
    currentRadius += RADIUS_STEP_MI;
  }

  // If we still don't have enough after exhausting the radius, take closest available.
  if (additionalHubs.length < ZONES_NEEDED) {
    additionalHubs = candidateHubs.slice(0, ZONES_NEEDED);
    currentRadius = HARD_MAX_RADIUS;
  }

  const hubs: CityHub[] = [seedHub, ...additionalHubs];

  // Count hubs per county GEOID.  Used for both countyGeoids and countyLabel
  // so the two are always in sync.
  const geoidHubCounts = new Map<string, number>();
  for (const h of hubs) {
    if (!h.countyGeoid) continue;
    geoidHubCounts.set(h.countyGeoid, (geoidHubCounts.get(h.countyGeoid) ?? 0) + 1);
  }

  // Build county GEOID list.  Always include the home county.  Only include
  // non-home counties that have ≥ 2 hubs — single-hub non-home counties are
  // border-bleed artifacts (e.g. Mountain Park geocoding into Fulton County
  // when all other hubs are in Cherokee County) and must not be claimed,
  // because they would cause unrelated large counties to block new proposals.
  const countyGeoids: string[] = homeGeoid ? [homeGeoid] : [];
  for (const [geoid, count] of geoidHubCounts) {
    if (geoid !== homeGeoid && count >= 2) countyGeoids.push(geoid);
  }

  // Build county label — uses the same ≥2-hub rule as countyGeoids so the
  // human-readable name and the machine-readable GEOID list always agree.
  const usedCountyShortNames: string[] = homeGeoid ? [homeCountyShort] : [];
  for (const [geoid, count] of geoidHubCounts) {
    if ((homeGeoid && geoid === homeGeoid) || count < 2 || !geoid) continue;
    const raw = geoidToShortName.get(geoid) ?? "";
    const display = raw.charAt(0).toUpperCase() + raw.slice(1);
    if (display && !usedCountyShortNames.some(n => n.toLowerCase() === display.toLowerCase())) {
      usedCountyShortNames.push(display);
    }
  }

  const countyLabel = usedCountyShortNames.length === 0
    ? ""
    : usedCountyShortNames.length === 1
      ? `${usedCountyShortNames[0]} County`
      : `${usedCountyShortNames.slice(0, -1).join(" / ")} / ${usedCountyShortNames[usedCountyShortNames.length - 1]} Counties`;

  logger.info(
    {
      city,
      stateAbbr,
      hubCount: hubs.length,
      finalRadius: currentRadius,
      countyLabel,
      countyGeoids,
      hubs: hubs.map(h => ({
        name: h.cityName,
        dist: Math.round(h.distanceFromDealer * 10) / 10,
      })),
    },
    "County territory: hubs resolved (proximity-first)"
  );
  return { hubs, countyLabel, countyGeoids };
}

/**
 * Builds a territory proposal using the city-hub model.
 */
export async function buildCityHubProposal(
  dealerLat: number,
  dealerLng: number,
  stateAbbr: string,
  stateFips: string,
  stateName: string,
  city: string = "",
  dealerState: string = "",
  searchRadius: number = TERRITORY_SEARCH_RADIUS
): Promise<TerritoryProposal> {
  const excludedCities = await getClaimedHubCities(dealerLat, dealerLng, stateAbbr);
  const { hubs: rawHubs, countyLabel, countyGeoids } = await getCountyTerritoryHubs(
    city, dealerState || stateAbbr, dealerLat, dealerLng, excludedCities
  );

  if (rawHubs.length < 2) {
    return {
      proposedName: countyLabel || generateTerritoryName([], [], stateAbbr),
      slug: await generateSlug("territory"),
      stateFips,
      stateAbbr,
      stateName,
      hubs: [],
      totalHouseholds: 0,
      totalBusinesses: 0,
      totalBusinessCount: 0,
      householdsEstimate: 0,
      isViable: false,
      hubCount: 0,
      centroidLat: dealerLat,
      centroidLng: dealerLng,
      viabilityMessage:
        "⚠ We couldn't build a territory for this location. Contact us to discuss options.",
      topCities: [],
      counties: [],
      countyGeoids,
      estimatedZones: 1,
      isSplit: false,
    };
  }

  const candidates = rawHubs;
  const dealerCountyGeoid = getCountyGeoidForLocation(dealerLat, dealerLng) ?? "";
  const initialHubs = rawHubs;

  // All ZIPs within territory search radius — Voronoi input (dealer-centered)
  const allNearbyZips = getZipsNearLocation(dealerLat, dealerLng, searchRadius);

  // First Voronoi pass: assign each ZIP to its nearest hub exclusively
  let hubs = voronoiAssign(initialHubs, allNearbyZips);

  // Replacement round: if any hub fails post-Voronoi qualification, use county-fill
  // on the remaining unused candidates (starting from the current territory centroid)
  // to find replacements that keep the territory geographically coherent.
  const failedNames = new Set(hubs.filter(h => !h.qualifies).map(h => h.cityName));
  if (failedNames.size > 0) {
    const usedCityNames = new Set(hubs.map(h => h.cityName));
    const kept = hubs.filter(h => h.qualifies);

    // Centroid of the surviving hubs (fall back to dealer location if none survive)
    const centLat = kept.length > 0
      ? kept.reduce((s, h) => s + h.lat, 0) / kept.length
      : dealerLat;
    const centLng = kept.length > 0
      ? kept.reduce((s, h) => s + h.lng, 0) / kept.length
      : dealerLng;
    const centCounty = getCountyGeoidForLocation(centLat, centLng) ?? dealerCountyGeoid;

    // County-fill on unused candidates to fill the remaining slots
    const unusedCandidates = candidates.filter(c => !usedCityNames.has(c.cityName));
    const replacements = selectHubsByCountyFill(
      unusedCandidates, centLat, centLng, centCounty,
      TARGET_HUB_COUNT - kept.length
    );

    // Re-run Voronoi only if the hub set actually changed
    if (replacements.length > 0) {
      hubs = voronoiAssign([...kept, ...replacements], allNearbyZips);
    }
  }

  // Final set: only hubs that qualify after Voronoi, capped at TARGET_HUB_COUNT.
  //
  // Ordering rules (Bug 1 + Bug 2 fix):
  //   1. The seed city (dealer's entered city) is always pinned as Zone 1.
  //   2. Remaining zones are sorted by distance from dealer (ascending).
  //   3. Population/business count is a tiebreaker only, never the primary sort.
  {
    const seedCityNorm = city.toLowerCase().trim();

    // Bug 3 fix: Force the seed hub to always qualify, regardless of Voronoi results.
    // In dense suburban markets (e.g. Alpharetta / Fulton County), nearby hubs like
    // Johns Creek, Roswell, and Milton absorb most surrounding ZIPs, leaving the
    // seed city below VORONOI_HUB_MIN_HOUSEHOLDS and causing it to be filtered out
    // before the pinning logic below can act.  The dealer explicitly named this city —
    // it must always appear as Zone 1.
    hubs = hubs.map(h =>
      h.cityName.toLowerCase().trim() === seedCityNorm
        ? { ...h, qualifies: true }
        : h
    );

    const qualifiedHubs = hubs.filter(h => h.qualifies);

    // Separate the pinned seed hub from the rest.
    const seedHubs  = qualifiedHubs.filter(h => h.cityName.toLowerCase().trim() === seedCityNorm);
    const otherHubs = qualifiedHubs.filter(h => h.cityName.toLowerCase().trim() !== seedCityNorm);

    // Sort non-seed hubs by distance (ascending), business count as tiebreaker.
    otherHubs.sort((a, b) => {
      const distDiff = a.distanceFromDealer - b.distanceFromDealer;
      if (Math.abs(distDiff) > 0.5) return distDiff;
      return (
        getCityZipBusinessCount(b.cityName, b.stateAbbr) -
        getCityZipBusinessCount(a.cityName, a.stateAbbr)
      );
    });

    // Seed first, then up to 3 nearest others.
    hubs = [
      ...seedHubs.slice(0, 1),
      ...otherHubs.slice(0, TARGET_HUB_COUNT - seedHubs.length),
    ].slice(0, TARGET_HUB_COUNT);
  }

  const hubCount = hubs.length;
  const totalBusinesses = hubs.reduce((s, h) => s + h.nearbyBusinesses, 0);

  // Qualification uses Voronoi-exclusive household count (no double-counting)
  const voronoiTotalHH = hubs.reduce((s, h) => s + h.catchmentHouseholds, 0);
  // County territories are viable with as few as 2 hub cities — a home county plus
  // one neighbour county is coherent even when both are small/rural.
  const minHubs = 2;
  const hasEnoughHubs        = hubCount >= minHubs;
  const hasEnoughHouseholds  = voronoiTotalHH >= MIN_TERRITORY_HOUSEHOLDS;
  const isViable = hasEnoughHubs && hasEnoughHouseholds;

  // Capture individual city names BEFORE the display transform merges small-county
  // hubs into slash-joined display strings (e.g. "Clayton / Dillard / Sky Valley").
  // These are used for topCities → proposedCities → zone_note → one campaign per city.
  // The display transform below should only affect the proposal-card UI, not the
  // stored city list that drives campaign creation.
  const individualCityNames = hubs.map(h => h.cityName);

  // ── Display transform: county-based household count per hub ──
  // Groups hubs by county GEOID and applies the three display rules:
  //   Rule 1 (county < 15k): merge all hubs in that county → one entry, county total
  //   Rules 2/3 (county ≥ 15k): per-hub share = county_total ÷ hub_count, capped at 25k
  // Hubs below DISPLAY_MIN_HH (5k) are dropped after the county split.
  {
    // Count hubs per county so we can divide correctly
    const countyHubCounts = new Map<string, number>();
    for (const h of hubs) {
      const g = h.countyGeoid;
      countyHubCounts.set(g, (countyHubCounts.get(g) ?? 0) + 1);
    }

    const displayHubs: CityHub[] = [];
    const mergedCounties = new Set<string>();

    for (const h of hubs) {
      const geoid = h.countyGeoid;
      const countyTotal = geoid ? getCountyHouseholds(geoid) : 0;
      const hubsInCounty = countyHubCounts.get(geoid) ?? 1;

      if (countyTotal < DISPLAY_SMALL_COUNTY) {
        // Rule 1 — emit one merged entry for the whole county group
        if (!mergedCounties.has(geoid)) {
          mergedCounties.add(geoid);
          const countyHubs = hubs.filter(x => x.countyGeoid === geoid);
          const names = countyHubs.map(x => x.cityName).sort();
          const mergedName =
            names.length === 1 ? names[0] :
            names.length === 2 ? `${names[0]} / ${names[1]}` :
            `${names[0]} / ${names[1]} / ${names[2]}`;
          const centLat = countyHubs.reduce((s, x) => s + x.lat, 0) / countyHubs.length;
          const centLng = countyHubs.reduce((s, x) => s + x.lng, 0) / countyHubs.length;
          displayHubs.push({
            ...h,
            cityName: mergedName,
            lat: centLat,
            lng: centLng,
            catchmentHouseholds: countyTotal,
          });
        }
      } else {
        // Rules 2 & 3 — keep separate, divide by hub count, cap at 25k
        const perHub = Math.min(Math.round(countyTotal / hubsInCounty), DISPLAY_PER_HUB_CAP);
        displayHubs.push({ ...h, catchmentHouseholds: perHub });
      }
    }

    hubs = displayHubs.filter(h => h.catchmentHouseholds >= DISPLAY_MIN_HH);
  }

  // Cap at 4 display areas, keeping highest-count hubs.
  if (hubs.length > 4) {
    hubs.sort((a, b) => b.catchmentHouseholds - a.catchmentHouseholds);
    hubs = hubs.slice(0, 4);
  }

  const totalHouseholds = hubs.reduce((s, h) => s + h.catchmentHouseholds, 0);
  const cityNames = individualCityNames;
  const proposedName = countyLabel || generateTerritoryName(cityNames, [], stateAbbr);
  const slug = await generateSlug(proposedName);

  const centroidLat = hubs.length > 0
    ? hubs.reduce((s, h) => s + h.lat, 0) / hubs.length
    : dealerLat;
  const centroidLng = hubs.length > 0
    ? hubs.reduce((s, h) => s + h.lng, 0) / hubs.length
    : dealerLng;

  let viabilityMessage: string;
  if (!hasEnoughHubs) {
    viabilityMessage =
      `⚠ Only ${hubCount} mailing area${hubCount === 1 ? "" : "s"} found near this location. ` +
      `Contact us to discuss territory options.`;
  } else if (!hasEnoughHouseholds) {
    viabilityMessage =
      "⚠ This area may not have enough households for 4 full postcard mailings of 5,000 each. " +
      "Contact us to discuss options.";
  } else if (totalBusinesses >= 600) {
    viabilityMessage = "★ Strong market — excellent pipeline for 4+ postcard mailings.";
  } else if (totalBusinesses >= 400) {
    viabilityMessage = "✓ Good market — solid pipeline for 4 postcard mailings.";
  } else if (totalBusinesses >= 300) {
    viabilityMessage =
      "↗ Adequate market — manageable territory for 4 mailings with focused sales effort.";
  } else {
    viabilityMessage =
      "⚠ Smaller market — this territory may take longer to fill postcard spots. " +
      "You'll have a larger exclusive area.";
  }

  return {
    proposedName,
    slug,
    stateFips,
    stateAbbr,
    stateName,
    hubs,
    totalHouseholds,
    totalBusinesses,
    totalBusinessCount: totalBusinesses,
    householdsEstimate: Math.round(totalBusinesses * HOUSEHOLDS_PER_BUSINESS),
    isViable,
    hubCount,
    centroidLat,
    centroidLng,
    viabilityMessage,
    topCities: cityNames,
    counties: [],
    countyGeoids,
    estimatedZones: Math.max(1, Math.min(4, hubs.length)),
    isSplit: false,
  };
}

// ─── Existing-territory proximity check ──────────────────────────────────────

const EXISTING_TERRITORY_RADIUS_MI = 25;

/**
 * Returns the closest existing territory in `stateAbbr` whose centroid is
 * within `miles` of the given location, or null. Optionally filter by status.
 */
export async function findExistingTerritoryWithinMiles(
  lat: number,
  lng: number,
  stateAbbr: string,
  miles: number,
  opts?: { statuses?: string[] }
): Promise<Record<string, unknown> | null> {
  const rows = await db
    .select()
    .from(territoriesTable)
    .where(eq(territoriesTable.state, stateAbbr));

  let best: Record<string, unknown> | null = null;
  let bestDist = Infinity;
  for (const r of rows) {
    if (opts?.statuses && !opts.statuses.includes(r.status)) continue;
    if (r.centroidLat == null || r.centroidLng == null) continue;
    const d = haversineDistanceMiles(lat, lng, r.centroidLat, r.centroidLng);
    if (d <= miles && d < bestDist) {
      best = r as Record<string, unknown>;
      bestDist = d;
    }
  }
  return best;
}

/** Generates the next sequential territory id for a state (e.g. "GA-001"). */
export async function generateNextTerritoryId(stateAbbr: string): Promise<string> {
  const rows = await db
    .select({ id: territoriesTable.id })
    .from(territoriesTable)
    .where(eq(territoriesTable.state, stateAbbr));
  const nums = rows
    .map(r => parseInt(r.id.replace(`${stateAbbr}-`, ""), 10))
    .filter(n => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${stateAbbr}-${String(next).padStart(3, "0")}`;
}

/**
 * Thrown by materializeTerritoryFromProposal when intra-transaction
 * verification finds that one or more footprint ZIPs are already owned by a
 * different taken territory. The transaction rolls back automatically.
 * Callers (dealers.ts webhook handler) catch this to trigger a Stripe refund.
 */
export class ZipFootprintConflictError extends Error {
  constructor(
    public readonly conflictingTerritoryId: string,
    public readonly conflictingZip: string,
  ) {
    super(
      `ZIP footprint conflict: ${conflictingZip} already belongs to territory ${conflictingTerritoryId}`,
    );
    this.name = "ZipFootprintConflictError";
  }
}

/**
 * Materializes a pending-payment proposal row into a live `territories` row
 * with status `taken`, stamped with `source_proposal_id` for idempotency and
 * linked to the claiming dealer. Returns the new territory id.
 *
 * The territory insert and its ZIP footprint are written in a single DB
 * transaction. After ZIP inserts a verification query checks whether any of
 * our footprint ZIPs are now owned by a DIFFERENT territory (meaning we lost a
 * concurrent race). If so, a ZipFootprintConflictError is thrown inside the
 * transaction, rolling back both the territory row and ZIP assignments.
 */
export async function materializeTerritoryFromProposal(
  proposal: TerritoryProposalRow,
  dealerId: number | null
): Promise<string> {
  const stateAbbr = proposal.stateAbbr;
  const counties = Array.isArray(proposal.proposedCounties) ? proposal.proposedCounties : [];
  const cities = Array.isArray(proposal.proposedCities) ? proposal.proposedCities : [];

  // Compute footprint before the transaction (pure in-memory, no DB I/O).
  const hubs = resolveProposalHubs(cities, stateAbbr, proposal.centroidLat, proposal.centroidLng);
  const footprintZips = hubs.length > 0 ? computeHubZipFootprint(hubs) : [];

  const territoryId = await db.transaction(async (tx) => {
    // Generate the sequential territory ID inside the transaction so the
    // read-then-write is protected against concurrent materialization.
    const existing = await tx
      .select({ id: territoriesTable.id })
      .from(territoriesTable)
      .where(eq(territoriesTable.state, stateAbbr));
    const nums = existing
      .map(r => parseInt(r.id.replace(`${stateAbbr}-`, ""), 10))
      .filter(n => !isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    const id = `${stateAbbr}-${String(next).padStart(3, "0")}`;

    await tx.insert(territoriesTable).values({
      id,
      name: proposal.proposedName,
      state: stateAbbr,
      counties,
      households: proposal.households ?? 0,
      zones: 4,
      status: "taken",
      zoneNote: cities.join(", "),
      centroidLat: proposal.centroidLat ?? undefined,
      centroidLng: proposal.centroidLng ?? undefined,
      businessCount: proposal.businessCount ?? 0,
      source: "auto-generated",
      proposedByZip: proposal.zipCode,
      dealerId: dealerId ?? undefined,
      sourceProposalId: proposal.id,
    });

    // Write ZIP footprint in the same transaction — no race window between
    // territory creation and footprint availability for conflict checks.
    const CHUNK = 200;
    for (let i = 0; i < footprintZips.length; i += CHUNK) {
      const chunk = footprintZips.slice(i, i + CHUNK);
      await tx.insert(territoryZipAssignmentsTable)
        .values(chunk.map(({ zip }) => ({ zip, territoryId: id })))
        .onConflictDoNothing();
    }

    // Verify we actually own all of our footprint ZIPs: if any are now owned
    // by a DIFFERENT territory, a concurrent checkout won the race. Throw to
    // roll back both the territory row and ZIP assignments.
    const ourZips = footprintZips.map(z => z.zip);
    const VCHUNK = 500;
    for (let i = 0; i < ourZips.length; i += VCHUNK) {
      const chunk = ourZips.slice(i, i + VCHUNK);
      // Only flag ZIPs owned by TAKEN territories — available territories have
      // pre-seeded footprints but hold no exclusive claim, so they must not
      // block a concurrent materialization (mirrors the checkZipFootprintConflict filter).
      const stolen = await tx
        .select({
          zip: territoryZipAssignmentsTable.zip,
          ownerTerritoryId: territoryZipAssignmentsTable.territoryId,
        })
        .from(territoryZipAssignmentsTable)
        .innerJoin(territoriesTable, eq(territoryZipAssignmentsTable.territoryId, territoriesTable.id))
        .where(
          and(
            inArray(territoryZipAssignmentsTable.zip, chunk),
            ne(territoryZipAssignmentsTable.territoryId, id),
            eq(territoriesTable.status, "taken"),
          )
        )
        .limit(1);
      if (stolen.length > 0) {
        // County guard: only treat as a genuine concurrent conflict when the
        // winning territory shares a county with the one being materialized.
        // Cross-county ZIP bleed (e.g. a neighboring territory whose footprint
        // happened to include a ZIP in our county) should not roll back the transaction.
        const [ownerRow] = await tx
          .select({ counties: territoriesTable.counties })
          .from(territoriesTable)
          .where(eq(territoriesTable.id, stolen[0].ownerTerritoryId));
        const isRealConflict = !ownerRow ||
          proposalCountiesOverlapTerritory(counties, { counties: ownerRow.counties });
        if (isRealConflict) {
          throw new ZipFootprintConflictError(
            stolen[0].ownerTerritoryId,
            stolen[0].zip,
          );
        }
        // Neighboring-county bleed — the ZIP stays with the other territory
        // (onConflictDoNothing already prevented us from claiming it); continue.
      }
    }

    return id;
  });

  logger.info(
    { territoryId, proposalId: proposal.id, dealerId, stateAbbr, zipCount: footprintZips.length },
    "Territory materialized from proposal (territory + ZIP footprint committed atomically)"
  );

  return territoryId;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Unified territory resolver for all 50 states. Given a location (lat/lng) and
 * its state, returns either:
 *   - an existing same-state territory whose centroid is within 25 miles, or
 *   - a fresh in-memory hub proposal (NOT persisted) built from county boundaries, or
 *   - `unavailable` when no viable territory can be built.
 *
 * The proposal is never written to the database here — it is persisted only
 * when the dealer clicks Claim (see the propose/claim routes).
 *
 * @param city  City name (from Gazetteer or form input) used to resolve the home county.
 * @param dealerState  Optional state abbreviation override (defaults to stateAbbr).
 */
/**
 * Returns true when the searched location (lat/lng) is within one of the
 * territory's officially declared counties. Used to gate "existing" matches
 * so that ZIP codes in neighboring counties don't bleed into adjacent searches.
 *
 * If the territory has no `counties` array (legacy/manual rows), we conservatively
 * return true so the old centroid-radius behavior is preserved.
 */
function locationIsInTerritoryCounties(
  lat: number,
  lng: number,
  territory: Record<string, unknown>,
  cityName?: string,
  stateAbbr?: string,
): boolean {
  const declared: string[] = Array.isArray(territory.counties)
    ? (territory.counties as string[]).map((c) => String(c).toLowerCase())
    : [];
  if (declared.length === 0) return true; // legacy territory — no county filter
  // Use city-aware lookup when caller provides city+state so border-city overrides
  // (e.g. Ball Ground → Cherokee, not Pickens) are applied consistently.
  const geoid = (cityName && stateAbbr)
    ? getCountyGeoidForCity(cityName, stateAbbr, lat, lng)
    : getCountyGeoidForLocation(lat, lng);
  if (!geoid) return false;
  const countyName = getCountyShortNameByGeoid(geoid);
  return !!countyName && declared.includes(countyName.toLowerCase());
}

/**
 * Returns true when the proposal's counties overlap with the territory's
 * declared counties — indicating a genuine geographic conflict rather than
 * neighboring-county ZIP bleed.
 *
 * Conservative defaults (returns true) when either side has no counties
 * declared, preserving the original strict behavior for legacy data.
 */
export function proposalCountiesOverlapTerritory(
  proposalCounties: string[],
  territory: Record<string, unknown>,
): boolean {
  const territoryCounties: string[] = Array.isArray(territory.counties)
    ? (territory.counties as string[]).map((c) => String(c).toLowerCase())
    : [];
  if (proposalCounties.length === 0 || territoryCounties.length === 0) return true;
  const pSet = new Set(proposalCounties.map((c) => c.toLowerCase()));
  return territoryCounties.some((c) => pSet.has(c));
}

export async function getTerritoryForLocation(
  lat: number,
  lng: number,
  stateAbbr: string,
  stateFips: string,
  stateName: string,
  zip?: string,
  city: string = "",
  dealerState: string = ""
): Promise<TerritoryForZipResult> {
  // (A) Existing same-state territory within 25 miles — but only when the
  // searched city actually falls inside one of that territory's declared counties.
  // Without this guard, territories whose ZIP footprint bleeds into neighboring
  // counties (e.g. White/Habersham has Rabun-county ZIPs) would swallow searches
  // from those neighboring counties and report them as already claimed.
  const existing = await findExistingTerritoryWithinMiles(
    lat, lng, stateAbbr, EXISTING_TERRITORY_RADIUS_MI
  );
  if (existing && locationIsInTerritoryCounties(lat, lng, existing, city || undefined, stateAbbr || undefined)) {
    return { type: "existing", territory: existing };
  }

  // (B) Single AI-powered proposal — no radius ladder needed because hub
  // selection is delegated to Claude Haiku, which knows geographic context.
  const best = await buildCityHubProposal(
    lat, lng, stateAbbr, stateFips, stateName,
    city, dealerState || stateAbbr
  );

  // (D) Accept the best proposal if it is viable (>= MIN_HUB_COUNT hubs and
  // enough households); otherwise the location is unavailable.
  if (best && best.isViable) {
    // ZIP footprint conflict re-check: if any hub's 15-mile footprint already
    // belongs to a taken territory, surface that territory as "existing" so the
    // picker shows it as claimed rather than erroneously offering a new proposal.
    // Apply the same county-membership guard so neighboring-county ZIP bleed
    // doesn't block proposals for genuinely unclaimed counties.
    const conflictTerritoryId = await checkZipFootprintConflict(best.hubs);
    if (conflictTerritoryId) {
      const [conflictTerritory] = await db
        .select()
        .from(territoriesTable)
        .where(eq(territoriesTable.id, conflictTerritoryId));
      if (conflictTerritory && locationIsInTerritoryCounties(lat, lng, conflictTerritory as Record<string, unknown>, city || undefined, stateAbbr || undefined)) {
        return { type: "existing", territory: conflictTerritory as Record<string, unknown> };
      }
    }
    return { type: "proposed", proposals: [best], proposalIds: [] };
  }

  logger.info(
    { stateAbbr, zip, hubCount: best.hubCount },
    "Territory builder: no viable territory near location"
  );
  return {
    type: "unavailable",
    message:
      "This area doesn't have enough nearby commercial centers for a viable territory. " +
      "Try a larger nearby town or city.",
  };
}
