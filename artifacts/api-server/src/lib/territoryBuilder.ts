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
  getCountyHouseholds,
  getCountyGeoidForLocation,
  getCountyGeoidFromZip,
} from "./censusApi";
import { logger } from "./logger";

// ─── City Hub Constants ───────────────────────────────────────────────────────
const HUB_MIN_HOUSEHOLDS    = 5_000; // min catchment households within HUB_HOUSEHOLD_RADIUS (pre-Voronoi)
const HUB_MIN_BUSINESSES    = 25;    // min postcard-industry establishments within HUB_BUSINESS_RADIUS
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

  // Sort: qualifying first, then by distance
  candidates.sort((a, b) => {
    if (a.qualifies !== b.qualifies) return a.qualifies ? -1 : 1;
    return a.distanceFromDealer - b.distanceFromDealer;
  });

  logger.info(
    {
      stateAbbr,
      boxCandidates: boxFiltered.length,
      withinRadius: candidates.length,
      qualified: candidates.filter(c => c.qualifies).length,
    },
    "Territory builder: candidate hubs evaluated"
  );

  return candidates;
}

/**
 * Selects up to TARGET_HUB_COUNT qualifying hubs using a compact, one-hub-per-county
 * strategy: sort qualifying candidates by distance (closest first), then walk the
 * sorted list and skip any candidate whose county GEOID is already represented.
 * This replaces the old quadrant-spread logic so that nearby towns in the same county
 * don't consume multiple slots at the expense of real coverage in adjacent counties.
 *
 * Selection algorithm (two-stage):
 *   1. Group qualifying candidates by county. Within each county, elect the city
 *      with the HIGHEST nearbyBusinesses as the county representative — this
 *      ensures Gainesville beats Clermont in Hall County, and Cornelia beats
 *      Demorest in Habersham County.
 *   2. Apply a minimum size gate: if the elected representative has fewer than
 *      HUB_MIN_COUNTY_REP_BIZ local businesses, skip that county entirely so a
 *      tiny city never blocks a slot that a closer large city could fill.
 *   3. Sort the surviving county representatives by their distance from the dealer
 *      and take the closest TARGET_HUB_COUNT counties.
 */
export function selectBestHubs(
  candidates: CityHub[],
  _dealerLat: number,
  _dealerLng: number
): CityHub[] {
  const qualified = candidates.filter(c => c.qualifies);

  // Step 1: elect the most commercially significant city per county
  const byCounty = new Map<string, CityHub>();
  for (const hub of qualified) {
    const key = hub.countyGeoid || `no-county-${hub.cityName}`;
    const current = byCounty.get(key);
    if (!current || hub.nearbyBusinesses > current.nearbyBusinesses) {
      byCounty.set(key, hub);
    }
  }

  // Step 2: skip counties whose elected representative is too small
  const countyReps = [...byCounty.values()].filter(
    hub => hub.localBiz >= HUB_MIN_COUNTY_REP_BIZ
  );

  // Step 3: sort by distance from dealer, take up to TARGET_HUB_COUNT
  countyReps.sort((a, b) => a.distanceFromDealer - b.distanceFromDealer);
  return countyReps.slice(0, TARGET_HUB_COUNT);
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

/**
 * Builds a territory proposal using the city-hub model.
 */
async function buildCityHubProposal(
  _zip: string,
  dealerLat: number,
  dealerLng: number,
  stateAbbr: string,
  stateFips: string,
  stateName: string,
  searchRadius: number = TERRITORY_SEARCH_RADIUS
): Promise<TerritoryProposal> {
  const candidates = await findCandidateHubs(dealerLat, dealerLng, stateAbbr, searchRadius);
  const initialHubs = selectBestHubs(candidates, dealerLat, dealerLng);

  // All ZIPs within territory search radius — Voronoi input (dealer-centered)
  const allNearbyZips = getZipsNearLocation(dealerLat, dealerLng, searchRadius);

  // First Voronoi pass: assign each ZIP to its nearest hub exclusively
  let hubs = voronoiAssign(initialHubs, allNearbyZips);

  // Replacement round: if any hub fails qualification after exclusive assignment,
  // swap it for the best unused candidate and re-run Voronoi once.
  // Mirrors selectBestHubs: pick the highest-nearbyBusinesses city per county,
  // skip counties whose best city is below HUB_MIN_COUNTY_REP_BIZ.
  const failedNames = new Set(hubs.filter(h => !h.qualifies).map(h => h.cityName));
  if (failedNames.size > 0) {
    const usedCityNames = new Set(hubs.map(h => h.cityName));
    const kept = hubs.filter(h => h.qualifies);
    const keptCounties = new Set(kept.map(h => h.countyGeoid).filter(Boolean));

    // Elect best city per unused county from remaining candidates
    const unusedByCounty = new Map<string, CityHub>();
    for (const c of candidates) {
      if (usedCityNames.has(c.cityName) || !c.qualifies) continue;
      const key = c.countyGeoid || `no-county-${c.cityName}`;
      if (c.countyGeoid && keptCounties.has(c.countyGeoid)) continue;
      const cur = unusedByCounty.get(key);
      if (!cur || c.nearbyBusinesses > cur.nearbyBusinesses) unusedByCounty.set(key, c);
    }
    const replacements = [...unusedByCounty.values()]
      .filter(c => c.localBiz >= HUB_MIN_COUNTY_REP_BIZ)
      .sort((a, b) => a.distanceFromDealer - b.distanceFromDealer);

    for (const rep of replacements) {
      if (kept.length >= TARGET_HUB_COUNT) break;
      kept.push(rep);
      if (rep.countyGeoid) keptCounties.add(rep.countyGeoid);
    }

    // Re-run Voronoi only if the hub set actually changed
    if (kept.length > hubs.filter(h => h.qualifies).length) {
      hubs = voronoiAssign(kept, allNearbyZips);
    }
  }

  // Final set: only hubs that qualify after Voronoi, capped at TARGET_HUB_COUNT
  hubs = hubs
    .filter(h => h.qualifies)
    .sort((a, b) => a.distanceFromDealer - b.distanceFromDealer)
    .slice(0, TARGET_HUB_COUNT);

  const hubCount = hubs.length;
  const totalBusinesses = hubs.reduce((s, h) => s + h.nearbyBusinesses, 0);

  // Qualification uses Voronoi-exclusive household count (no double-counting)
  const voronoiTotalHH = hubs.reduce((s, h) => s + h.catchmentHouseholds, 0);
  const hasEnoughHubs        = hubCount >= MIN_HUB_COUNT;
  const hasEnoughHouseholds  = voronoiTotalHH >= MIN_TERRITORY_HOUSEHOLDS;
  const isViable = hasEnoughHubs && hasEnoughHouseholds;

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
  const cityNames = hubs.map(h => h.cityName);
  const proposedName = generateTerritoryName(cityNames, [], stateAbbr);
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
    estimatedZones: Math.max(1, Math.min(4, hubs.length)),
    isSplit: false,
  };
}

// ─── Existing-territory proximity check ──────────────────────────────────────

const EXISTING_TERRITORY_RADIUS_MI = 25;
// Expand the hub search radius in 15-mile steps (max 85mi) until we reach
// TARGET_HUB_COUNT hubs. A proposal is accepted with as few as MIN_HUB_COUNT.
const HUB_SEARCH_RADII = [40, 55, 70, 85];

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
      const stolen = await tx
        .select({
          zip: territoryZipAssignmentsTable.zip,
          ownerTerritoryId: territoryZipAssignmentsTable.territoryId,
        })
        .from(territoryZipAssignmentsTable)
        .where(
          and(
            inArray(territoryZipAssignmentsTable.zip, chunk),
            ne(territoryZipAssignmentsTable.territoryId, id),
          )
        )
        .limit(1);
      if (stolen.length > 0) {
        throw new ZipFootprintConflictError(
          stolen[0].ownerTerritoryId,
          stolen[0].zip,
        );
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
 *   - a fresh in-memory hub proposal (NOT persisted), expanding the search
 *     radius up to 85 miles to reach 4 hubs (min 3 for viability), or
 *   - `unavailable` when no viable territory can be built.
 *
 * The proposal is never written to the database here — it is persisted only
 * when the dealer clicks Claim (see the propose/claim routes).
 */
export async function getTerritoryForLocation(
  lat: number,
  lng: number,
  stateAbbr: string,
  stateFips: string,
  stateName: string,
  zip?: string
): Promise<TerritoryForZipResult> {
  // (A) Existing same-state territory within 25 miles of this location.
  const existing = await findExistingTerritoryWithinMiles(
    lat, lng, stateAbbr, EXISTING_TERRITORY_RADIUS_MI
  );
  if (existing) {
    return { type: "existing", territory: existing };
  }

  // (B + C) Build a proposal, expanding the radius until we reach the target
  // hub count (or exhaust the radius ladder). Keep the best attempt seen.
  let best: TerritoryProposal | null = null;
  for (const radius of HUB_SEARCH_RADII) {
    const proposal = await buildCityHubProposal(
      zip ?? "", lat, lng, stateAbbr, stateFips, stateName, radius
    );
    if (!best || proposal.hubCount > best.hubCount) best = proposal;
    if (proposal.hubCount >= TARGET_HUB_COUNT) break;
  }

  // (D) Accept the best proposal if it is viable (>= MIN_HUB_COUNT hubs and
  // enough households); otherwise the location is unavailable.
  if (best && best.isViable) {
    // ZIP footprint conflict re-check: if any hub's 15-mile footprint already
    // belongs to a taken territory, surface that territory as "existing" so the
    // picker shows it as claimed rather than erroneously offering a new proposal.
    const conflictTerritoryId = await checkZipFootprintConflict(best.hubs);
    if (conflictTerritoryId) {
      const [conflictTerritory] = await db
        .select()
        .from(territoriesTable)
        .where(eq(territoriesTable.id, conflictTerritoryId));
      if (conflictTerritory) {
        return { type: "existing", territory: conflictTerritory as Record<string, unknown> };
      }
    }
    return { type: "proposed", proposals: [best], proposalIds: [] };
  }

  logger.info(
    { stateAbbr, zip, hubCount: best?.hubCount ?? 0 },
    "Territory builder: no viable territory near location"
  );
  return {
    type: "unavailable",
    message:
      "This area doesn't have enough nearby commercial centers for a viable territory. " +
      "Try a larger nearby town or city.",
  };
}
