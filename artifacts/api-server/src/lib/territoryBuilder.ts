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

import { db, territoriesTable, territoryProposalsTable } from "@workspace/db";
import { eq, and, isNotNull, gt, sql } from "drizzle-orm";
import {
  getCountyFromZip,
  getCountyInfo,
  getZipLocation,
  getZipsNearLocation,
  getCitiesInState,
  getCountyPopulationNearLocation,
} from "./censusApi";
import { logger } from "./logger";

// ─── Blocked ZIPs ─────────────────────────────────────────────────────────────
// ZIPs that are definitively non-residential (wildlife preserves, industrial
// zones, etc.) and should never be proposed.
const BLOCKED_ZIPS = new Set([
  "29945", // Yemassee SC — ACE Basin wildlife preserve, no residential population
]);

// ─── Managed States ───────────────────────────────────────────────────────────
// States with manually managed territories — auto-builder never runs here.
// Add states here as they are hand-seeded.
const MANAGED_STATES = ["GA"];

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
// Mailing area display constants — distance-weighted, no Voronoi, same as territories route
const DISPLAY_MAILING_RADIUS  = 15;    // miles — weighted radius per hub
const DISPLAY_CORE_RADIUS     = 8;     // miles — full-weight core market
const DISPLAY_MIN_HH          = 5_000; // merge display areas below this threshold
// County floor skipped when a hub has ≥3 ZIPs within 8 miles (not sparse).
const DISPLAY_CORE_ZIP_MIN    = 3;     // ZIPs within 8mi required to skip floor
// Household proxy used for householdsEstimate (backward-compat field)
const HOUSEHOLDS_PER_BUSINESS = 3.5;

// Minimum city population for hub qualification (proxied by local business density).
// Filters out tiny resort/barrier-island municipalities that appear in the Gazetteer
// but have almost no year-round residents or local businesses.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const HUB_MIN_CITY_POPULATION = 8_000; // documented intent; enforcement is via local biz proxy
const HUB_LOCAL_RADIUS  = 5;  // miles for local business density check
const HUB_LOCAL_BIZ_MIN = 8;  // postcard-biz proxy: fewer than this ≈ population < 8,000

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
  catchmentHouseholds: number;
  nearbyBusinesses: number;
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
    .from(territoryProposalsTable)
    .where(eq(territoryProposalsTable.status, "pending_review"));

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
async function findCandidateHubs(
  dealerLat: number,
  dealerLng: number,
  stateAbbr: string
): Promise<CityHub[]> {
  const allCities = getCitiesInState(stateAbbr);
  if (!allCities.length) {
    logger.warn({ stateAbbr }, "Territory builder: no Gazetteer cities found for state");
    return [];
  }

  // Bounding box pre-filter — ~45 miles in each direction
  const LAT_DELTA = 0.65;
  const LNG_DELTA = 0.80;
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
    if (distance > TERRITORY_SEARCH_RADIUS) continue;

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
      catchmentHouseholds,
      nearbyBusinesses,
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
 * Selects up to TARGET_HUB_COUNT qualifying hubs that form a good geographic
 * spread around the dealer ZIP centroid. Uses quadrant-based selection when
 * more than 4 hubs qualify.
 */
function selectBestHubs(
  candidates: CityHub[],
  dealerLat: number,
  dealerLng: number
): CityHub[] {
  const qualified = candidates.filter(c => c.qualifies);

  if (qualified.length <= TARGET_HUB_COUNT) {
    return qualified;
  }

  // More than 4 qualify: use quadrant-based spread selection
  type Quadrant = "NE" | "NW" | "SE" | "SW";
  const getQuadrant = (hub: CityHub): Quadrant => {
    const n = hub.lat >= dealerLat;
    const e = hub.lng >= dealerLng;
    return ((n ? "N" : "S") + (e ? "E" : "W")) as Quadrant;
  };

  // Always include the closest qualifying city (anchor)
  const sorted = [...qualified].sort((a, b) => a.distanceFromDealer - b.distanceFromDealer);
  const anchor = sorted[0]!;
  const selected = new Set<CityHub>([anchor]);

  // Pick the closest qualifying city from each quadrant
  const quadrants: Quadrant[] = ["NE", "NW", "SE", "SW"];
  const remaining = sorted.filter(h => h !== anchor);

  for (const quad of quadrants) {
    if (selected.size >= TARGET_HUB_COUNT) break;
    const fromQuad = remaining.filter(h => !selected.has(h) && getQuadrant(h) === quad);
    if (fromQuad.length > 0) selected.add(fromQuad[0]!);
  }

  // Fill any remaining slots with closest unselected qualified cities
  for (const hub of remaining) {
    if (selected.size >= TARGET_HUB_COUNT) break;
    if (!selected.has(hub)) selected.add(hub);
  }

  // Return sorted by distance for consistent display order
  return [...selected].sort((a, b) => a.distanceFromDealer - b.distanceFromDealer);
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
  stateName: string
): Promise<TerritoryProposal> {
  const candidates = await findCandidateHubs(dealerLat, dealerLng, stateAbbr);
  const initialHubs = selectBestHubs(candidates, dealerLat, dealerLng);

  // All ZIPs within territory search radius — Voronoi input (40-mile dealer-centered)
  const allNearbyZips = getZipsNearLocation(dealerLat, dealerLng, TERRITORY_SEARCH_RADIUS);

  // First Voronoi pass: assign each ZIP to its nearest hub exclusively
  let hubs = voronoiAssign(initialHubs, allNearbyZips);

  // Replacement round: if any hub fails qualification after exclusive assignment,
  // swap it for the next best candidate and re-run Voronoi once
  const failedNames = new Set(hubs.filter(h => !h.qualifies).map(h => h.cityName));
  if (failedNames.size > 0) {
    const usedNames = new Set(hubs.map(h => h.cityName));
    const replacements = candidates.filter(c => !usedNames.has(c.cityName) && c.qualifies);

    const kept = hubs.filter(h => h.qualifies);
    for (const rep of replacements) {
      if (kept.length >= TARGET_HUB_COUNT) break;
      kept.push(rep);
    }

    // Re-run Voronoi only if the hub set actually changed
    if (kept.length !== hubs.filter(h => h.qualifies).length || replacements.length > 0) {
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

  // ── Display transform: distance-weighted household count per hub ──
  // ZIPs within 8 miles: full weight (1.0) — core market.
  // ZIPs 8-15 miles: half weight (0.5) — fringe/shared market.
  // Adjacent hubs share fringe ZIPs but have different core ZIPs, so their
  // counts naturally differ — avoids the identical-numbers problem.
  // Floor: county population × 0.40 for rural hubs with sparse ZIP data.
  hubs = hubs.map(h => {
    const zips = getZipsNearLocation(h.lat, h.lng, DISPLAY_MAILING_RADIUS);
    const weighted = Math.round(
      zips.reduce((s, z) => s + z.households * (z.distance <= DISPLAY_CORE_RADIUS ? 1.0 : 0.5), 0)
    );
    // ZIP density test: ≥3 ZIPs within 8 miles = not sparse.
    // Dense hubs get distinct weighted counts; sparse rural hubs get the county floor.
    const isDense = zips.filter(z => z.distance <= DISPLAY_CORE_RADIUS).length >= DISPLAY_CORE_ZIP_MIN;
    const floor = Math.round(getCountyPopulationNearLocation(h.lat, h.lng) * 0.40);
    return {
      ...h,
      catchmentHouseholds: isDense ? weighted : Math.max(weighted, floor),
    };
  });
  // Merge any display area below 5,000 HH into its nearest neighbor.
  // Combined HH = max(a, b) — overlapping catchments, not additive.
  let displayMerged = true;
  while (displayMerged) {
    displayMerged = false;
    if (hubs.length <= 1) break;
    const belowIdx = hubs.findIndex(h => h.catchmentHouseholds < DISPLAY_MIN_HH);
    if (belowIdx === -1) break;
    let nearestIdx = -1, nearestDist = Infinity;
    for (let j = 0; j < hubs.length; j++) {
      if (j === belowIdx) continue;
      const d = haversineDistanceMiles(
        hubs[belowIdx]!.lat, hubs[belowIdx]!.lng,
        hubs[j]!.lat,        hubs[j]!.lng
      );
      if (d < nearestDist) { nearestDist = d; nearestIdx = j; }
    }
    if (nearestIdx === -1) break;
    const a = hubs[belowIdx]!;
    const b = hubs[nearestIdx]!;
    const merged: CityHub = {
      ...a,
      cityName:             `${a.cityName} / ${b.cityName}`,
      lat:                  (a.lat + b.lat) / 2,
      lng:                  (a.lng + b.lng) / 2,
      catchmentHouseholds:  Math.max(a.catchmentHouseholds, b.catchmentHouseholds),
      nearbyBusinesses:     a.nearbyBusinesses + b.nearbyBusinesses,
    };
    const hi = Math.max(belowIdx, nearestIdx);
    const lo = Math.min(belowIdx, nearestIdx);
    hubs.splice(hi, 1);
    hubs.splice(lo, 1);
    hubs.push(merged);
    displayMerged = true;
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

// ─── Approve / Reject ─────────────────────────────────────────────────────────

export async function approveTerritory(
  proposalId: number,
  adminUser: string,
  overrides?: { name?: string; status?: string }
): Promise<{ territoryId: string; slug: string }> {
  const [proposal] = await db
    .select()
    .from(territoryProposalsTable)
    .where(eq(territoryProposalsTable.id, proposalId));

  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

  const state = proposal.stateAbbr;
  const finalName = overrides?.name ?? proposal.proposedName;
  const finalStatus = (overrides?.status ?? "available") as "available" | "pending" | "taken";

  const existingRows = await db
    .select({ id: territoriesTable.id })
    .from(territoriesTable)
    .where(eq(territoriesTable.state, state));

  const nums = existingRows
    .map(r => parseInt(r.id.replace(`${state}-`, ""), 10))
    .filter(n => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  const territoryId = `${state}-${String(next).padStart(3, "0")}`;

  const proposedEntries: string[] = Array.isArray(proposal.proposedCounties)
    ? (proposal.proposedCounties as string[])
    : [];

  // Detect whether stored entries are legacy county GEOIDs (5-digit numeric)
  // or city names from the new city-hub model.
  const isLegacyGeoids =
    proposedEntries.length > 0 && /^\d{5}$/.test(proposedEntries[0] ?? "");

  let countyShortNames: string[];
  if (isLegacyGeoids) {
    countyShortNames = [];
    for (const geoid of proposedEntries) {
      const sf = geoid.slice(0, 2);
      const cf = geoid.slice(2);
      const cInfo = await getCountyInfo(sf, cf);
      if (cInfo) countyShortNames.push(countyShortName(cInfo.name));
    }
  } else {
    // City-hub model: use hub city names directly as the territory's counties list
    countyShortNames = proposedEntries;
  }

  const topCities: string[] = Array.isArray(proposal.proposedCities)
    ? (proposal.proposedCities as string[])
    : [];

  const households = Math.round((proposal.businessCount ?? 0) * HOUSEHOLDS_PER_BUSINESS);

  await db.insert(territoriesTable).values({
    id: territoryId,
    name: finalName,
    state,
    counties: countyShortNames,
    households,
    zones: proposal.splitTotal ?? 4,
    status: finalStatus,
    zoneNote: topCities.join(", "),
    businessCount: proposal.businessCount,
    source: "auto-generated",
    proposedByZip: proposal.zipCode,
    approvedBy: adminUser,
    approvedAt: new Date(),
  });

  await db
    .update(territoryProposalsTable)
    .set({
      status: "approved",
      territoryId,
      reviewedAt: new Date(),
      reviewedBy: adminUser,
    })
    .where(eq(territoryProposalsTable.id, proposalId));

  logger.info({ territoryId, proposalId, adminUser }, "Territory approved");
  const slug = territoryId.toLowerCase().replace(/-/g, "-");
  return { territoryId, slug };
}

export async function rejectTerritory(
  proposalId: number,
  adminUser: string,
  reason: string
): Promise<void> {
  await db
    .update(territoryProposalsTable)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewedBy: adminUser,
      notes: reason,
    })
    .where(eq(territoryProposalsTable.id, proposalId));

  logger.info({ proposalId, adminUser }, "Territory rejected");
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Top-level orchestrator: resolves a ZIP to a location, checks for conflicts,
 * builds city-hub proposals, saves them, and notifies admin.
 */
export async function getTerritoryForZip(
  zipCode: string,
  dealerInfo?: { name: string; email: string; phone: string },
  options?: { isTest?: boolean }
): Promise<TerritoryForZipResult> {
  const isTest = options?.isTest ?? false;

  // 1. Blocked ZIP gate
  if (BLOCKED_ZIPS.has(zipCode)) {
    return {
      type: "unavailable",
      message:
        "This ZIP code is in a non-residential area. " +
        "Please try a ZIP code in a nearby town or city.",
    };
  }

  // 2. Resolve ZIP → lat/lng centroid
  const location = getZipLocation(zipCode);
  if (!location) {
    return { type: "unavailable", message: "ZIP code not recognized" };
  }
  const { lat, lng } = location;

  // 3. Resolve ZIP → state/county info (still needed for managed-state gate,
  //    dup-proposal check, and DB insert)
  const county = await getCountyFromZip(zipCode);
  if (!county) {
    return { type: "unavailable", message: "ZIP code not recognized" };
  }
  const { stateFips, stateAbbr, stateName, countyFips: countyFips3, countyName } = county;
  const geoid = `${stateFips}${countyFips3.padStart(3, "0")}`;

  // 4. Managed-state hard gate — auto-builder never runs for these states.
  if (MANAGED_STATES.includes(stateAbbr)) {
    const managedConflict = await checkTerritoryConflicts([geoid], stateAbbr);
    if (managedConflict.hasConflict && managedConflict.conflictingTerritoryId) {
      const managedStatus = managedConflict.conflictingTerritoryStatus ?? "available";
      if (managedStatus === "available") {
        const [existing] = await db
          .select()
          .from(territoriesTable)
          .where(eq(territoriesTable.id, managedConflict.conflictingTerritoryId));
        return { type: "existing", territory: existing as Record<string, unknown> };
      }
    }
    return {
      type: "unavailable",
      message:
        "Territory finder is not available for this area. Please contact us directly.",
    };
  }

  // 5. Conflict check against existing territories (non-managed states)
  const conflict = await checkTerritoryConflicts([geoid], stateAbbr);
  if (conflict.hasConflict && conflict.conflictingTerritoryId) {
    const status = conflict.conflictingTerritoryStatus ?? "available";
    if (status === "taken" || status === "pending") {
      return {
        type: "unavailable",
        message: "This territory has already been claimed",
      };
    }
    const [existing] = await db
      .select()
      .from(territoriesTable)
      .where(eq(territoriesTable.id, conflict.conflictingTerritoryId));
    return { type: "existing", territory: existing as Record<string, unknown> };
  }

  // 6. Duplicate proposal check — same county + contact info within 48 hours
  const activePending = await db
    .select({ id: territoryProposalsTable.id })
    .from(territoryProposalsTable)
    .where(
      and(
        eq(territoryProposalsTable.stateFips, stateFips),
        eq(territoryProposalsTable.countyFips, countyFips3.padStart(3, "0")),
        eq(territoryProposalsTable.status, "pending_review"),
        isNotNull(territoryProposalsTable.dealerEmail),
        gt(territoryProposalsTable.createdAt, sql`NOW() - INTERVAL '48 hours'`),
      ),
    );

  if (activePending.length > 0) {
    return {
      type: "unavailable",
      message:
        "A territory proposal for this area is already under review. " +
        "Please contact us to be notified when it becomes available.",
    };
  }

  // 7. Build city-hub proposal
  const proposal = await buildCityHubProposal(
    zipCode, lat, lng, stateAbbr, stateFips, stateName
  );

  // 8. Viability gate — if fewer than MIN_HUB_COUNT hubs qualify, reject
  if (!proposal.isViable) {
    logger.info(
      { zipCode, stateAbbr, hubCount: proposal.hubCount, totalBusinesses: proposal.totalBusinesses },
      "Territory builder: insufficient hub cities — returning unavailable"
    );
    return {
      type: "unavailable",
      message:
        "This ZIP code does not have enough nearby commercial centers for a viable territory. " +
        "Please try a ZIP code in a larger town or city.",
    };
  }

  // 9. Save proposal to DB (skipped for test/smoke-test requests)
  const savedIds: number[] = [];
  if (!isTest) {
    const [saved] = await db
      .insert(territoryProposalsTable)
      .values({
        zipCode,
        stateFips,
        stateAbbr,
        countyFips: countyFips3.padStart(3, "0"),
        countyName,
        proposedName: proposal.proposedName,
        proposedCounties: proposal.topCities,  // hub city names stored here
        proposedCities: proposal.topCities,
        businessCount: proposal.totalBusinesses,
        isSplit: false,
        splitIndex: null,
        splitTotal: null,
        dealerName: dealerInfo?.name ?? null,
        dealerEmail: dealerInfo?.email ?? null,
        dealerPhone: dealerInfo?.phone ?? null,
      })
      .returning({ id: territoryProposalsTable.id });
    if (saved) savedIds.push(saved.id);
  }

  // 10. Admin notification (fire-and-forget; skipped for test requests)
  if (!isTest) {
    try {
      const { sendTerritoryProposalEmail } = await import("./emails");
      await sendTerritoryProposalEmail({
        proposedName: proposal.proposedName,
        stateAbbr,
        stateName,
        countyNames: proposal.topCities,           // hub city names as "county" labels
        totalBusinessCount: proposal.totalBusinesses,
        estimatedZones: proposal.estimatedZones,
        topCities: proposal.topCities,
        isViable: proposal.isViable,
        dealerName: dealerInfo?.name,
        dealerEmail: dealerInfo?.email,
        dealerPhone: dealerInfo?.phone,
        zipCode,
      });
    } catch (err: unknown) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Territory proposal email failed — continuing"
      );
    }
  }

  return { type: "proposed", proposals: [proposal], proposalIds: savedIds };
}
