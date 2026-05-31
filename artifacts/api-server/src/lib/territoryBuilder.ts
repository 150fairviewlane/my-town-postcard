/**
 * Territory Builder Engine — Prompt 2 of 3
 *
 * All Census data comes exclusively from the four in-memory Maps loaded by
 * censusApi.ts. No external API calls anywhere in this module.
 */

import { db, territoriesTable, territoryProposalsTable } from "@workspace/db";
import { eq, and, isNotNull, gt, sql } from "drizzle-orm";
import {
  getCountyFromZip,
  getAdReadyBusinessCount,
  getAdReadyBusinessCountBatch,
  getNeighboringCounties,
  getCountyInfo,
  getTopCitiesInCounty,
  getCountyCentroid,
} from "./censusApi";
import { logger } from "./logger";

// ─── Thresholds ───────────────────────────────────────────────────────────────

const MIN_BUSINESS_COUNT = 400;    // minimum viable: floor for 4-card mailing cycle
const TARGET_BUSINESS_COUNT = 600; // target: comfortable pipeline for 4+ cards with replenishment
const MAX_BUSINESS_COUNT = 2000;   // above this, split into sub-territories
const MIN_PER_CLUSTER = 100;       // minimum businesses per postcard area
const MAX_NEIGHBOR_RINGS = 5;      // rings of neighbors before giving up on bundling (wider net for rural areas)

// Geography cap: never bundle counties more than this far from the starting county.
// Prevents absurd territories spanning hundreds of miles of desert or mountain wilderness.
const MAX_BUNDLE_RADIUS_MILES = 75;

// Co-located jurisdiction radius: much tighter than the bundling radius.
// Virginia independent cities and city-county pairs are always adjacent (<5 miles typically);
// 25 miles captures all genuine enclave/adjacent-city cases without sweeping in distant cities.
const MAX_COLOCATED_RADIUS_MILES = 25;

// Metro threshold: counties above this are considered metro-scale and receive finer splits.
const METRO_THRESHOLD = 5_000;

// Household viability — proxy: 1 ad-ready business ≈ 12 households in typical markets.
// Rural counties beat the business count floor but fail the household floor because
// businesses are spread thin across low-density land. Without ZIP-level household data
// we gate at the county level; MIN_ZIP_HOUSEHOLDS documents the intended ZIP-level floor.
const HOUSEHOLDS_PER_BUSINESS = 12;
const MIN_ZIP_HOUSEHOLDS = 300;        // floor for ZIP-level check (placeholder — no ZIP data yet)
// Anchor-county household minimum scales with MIN_BUSINESS_COUNT so territories at the floor
// (400 businesses) still pass. Use this for both the anchor pre-check and the post-bundling gate.
const MIN_HOUSEHOLDS = MIN_BUSINESS_COUNT * HOUSEHOLDS_PER_BUSINESS; // 400 × 12 = 4,800
const MIN_HOUSEHOLDS_TO_SPLIT = 24_000; // need a large county before splitting (2,000 biz × 12)

// States with manually managed territories — auto-builder never runs here.
// Add states here as they are hand-seeded; they get the same hard gate automatically.
const MANAGED_STATES = ["GA"];


// ─── Types ────────────────────────────────────────────────────────────────────

export interface TerritoryProposal {
  proposedName: string;
  slug: string;
  stateFips: string;
  stateAbbr: string;
  counties: Array<{
    fips: string;          // 5-digit GEOID
    name: string;          // e.g. "Hall County"
    shortName: string;     // e.g. "Hall" (stored in territories.counties)
    businessCount: number;
  }>;
  totalBusinessCount: number;
  householdsEstimate: number;  // proxy: totalBusinessCount × HOUSEHOLDS_PER_BUSINESS
  topCities: string[];
  isViable: boolean;
  viabilityReason?: string;    // set when isViable=false to explain why
  isSplit: boolean;
  splitIndex?: number;
  splitTotal?: number;
  estimatedZones: number; // floor(totalBusinessCount / MIN_PER_CLUSTER), max 4
  centroidLat: number | null;
  centroidLng: number | null;
}

// ─── Name / Slug Helpers ──────────────────────────────────────────────────────

const COUNTY_SUFFIX_RE =
  / (County|Parish|Borough|Census Area|City and Borough|Municipality|Municipio|District|City)$/i;

/** Returns the county short name without legal suffix, title-cased. */
function countyShortName(fullName: string): string {
  return fullName.replace(COUNTY_SUFFIX_RE, "").trim();
}

// ─── Co-located jurisdiction tables ───────────────────────────────────────────

/**
 * Virginia independent cities (FIPS ≥ 510): administratively separate from their
 * surrounding counties but absent from the Census adjacency file.
 * Wrong/non-existent codes are harmlessly skipped (getCountyInfo returns null).
 */
const VA_INDEPENDENT_CITY_GEOIDS: readonly string[] = [
  "51510", // Alexandria city
  "51520", // Bristol city
  "51530", // Buena Vista city
  "51540", // Charlottesville city
  "51550", // Chesapeake city
  "51560", // Colonial Heights city
  "51570", // Covington city
  "51580", // Danville city
  "51590", // Emporia city
  "51595", // Fairfax city
  "51600", // Falls Church city
  "51610", // Franklin city
  "51630", // Fredericksburg city
  "51640", // Galax city
  "51650", // Hampton city
  "51660", // Harrisonburg city
  "51670", // Hopewell city
  "51678", // Lexington city
  "51680", // Lynchburg city
  "51683", // Manassas city
  "51685", // Manassas Park city
  "51690", // Martinsville city
  "51700", // Newport News city
  "51710", // Norfolk city
  "51720", // Norton city
  "51730", // Petersburg city
  "51735", // Poquoson city
  "51740", // Portsmouth city
  "51750", // Radford city
  "51760", // Richmond city
  "51770", // Roanoke city
  "51775", // Salem city
  "51790", // Staunton city
  "51800", // Suffolk city
  "51810", // Virginia Beach city
  "51820", // Waynesboro city
  "51830", // Williamsburg city
  "51840", // Winchester city
];

/**
 * Returns GEOIDs of jurisdictions that are administratively separate but
 * geographically co-located with the bundled counties yet absent from (or poorly
 * represented in) the county adjacency file:
 *   - All Virginia independent cities (for any VA territory)
 *   - Maryland: Baltimore city ↔ Baltimore County (hardcoded pair)
 *   - Missouri: St. Louis city ↔ St. Louis County (hardcoded pair)
 * Distance filtering is applied by the caller; wrong FIPS are harmlessly skipped.
 */
function getColocatedGeoids(stateFips: string, bundledGeoids: string[]): string[] {
  const result: string[] = [];

  if (stateFips === "51") {
    // Virginia: always consider all independent cities; distance cap filters non-local ones
    for (const g of VA_INDEPENDENT_CITY_GEOIDS) {
      if (!bundledGeoids.includes(g)) result.push(g);
    }
  }

  if (stateFips === "24") {
    // Maryland: Baltimore city ↔ Baltimore County
    if (bundledGeoids.includes("24005") && !bundledGeoids.includes("24510")) result.push("24510");
    if (bundledGeoids.includes("24510") && !bundledGeoids.includes("24005")) result.push("24005");
  }

  if (stateFips === "29") {
    // Missouri: St. Louis city ↔ St. Louis County
    if (bundledGeoids.includes("29189") && !bundledGeoids.includes("29510")) result.push("29510");
    if (bundledGeoids.includes("29510") && !bundledGeoids.includes("29189")) result.push("29189");
  }

  return result;
}

/** Haversine distance in miles between two lat/lng points. */
function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3_959; // Earth radius in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Generates a human-readable territory name from a list of top cities.
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

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Generates a URL-safe slug from a territory name.
 * Checks territory_proposals for name collisions and appends -2, -3 if needed.
 */
export async function generateSlug(name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .replace(/ \/ /g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  // Check for existing proposals with the same slug prefix
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

export interface ConflictResult {
  hasConflict: boolean;
  conflictingTerritoryId?: string;
  conflictingTerritoryName?: string;
  conflictingTerritoryStatus?: string;
  conflictingCounty?: string;
}

/**
 * Checks whether any of the proposed 5-digit county GEOIDs are already
 * assigned to an existing non-proposed territory in the same state.
 *
 * territories.counties stores county short names (e.g. "Hall"), NOT FIPS.
 * We translate via getCountyInfo and strip the legal suffix before matching.
 */
export async function checkTerritoryConflicts(
  geoids: string[],           // 5-digit GEOIDs, e.g. ["13139"]
  stateAbbr: string
): Promise<ConflictResult> {
  // Build GEOID → short name map for the proposed counties
  const geoidToShort = new Map<string, string>();
  for (const geoid of geoids) {
    const stateFips = geoid.slice(0, 2);
    const countyFips = geoid.slice(2);
    const info = await getCountyInfo(stateFips, countyFips);
    if (info) geoidToShort.set(geoid, countyShortName(info.name));
  }

  const proposedShortNames = new Set(geoidToShort.values());

  // Load all non-proposed territories in this state
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
    for (const countyName of terrCounties) {
      if (proposedShortNames.has(countyName)) {
        return {
          hasConflict: true,
          conflictingTerritoryId: terr.id,
          conflictingTerritoryName: terr.name,
          conflictingTerritoryStatus: terr.status,
          conflictingCounty: countyName,
        };
      }
    }
  }
  return { hasConflict: false };
}

// ─── Large County Splitter ────────────────────────────────────────────────────

/**
 * Splits a large county (≥ 1,600 ad-ready businesses) into city-cluster
 * sub-territories. Uses city list order (no k-means needed for v1).
 */
export async function splitLargeCounty(
  stateFips: string,
  countyFips: string,
  totalBusinessCount: number
): Promise<TerritoryProposal[]> {
  const geoid = `${stateFips}${countyFips.padStart(3, "0")}`;
  const info = await getCountyInfo(stateFips, countyFips);
  const countyName = info?.name ?? `County ${countyFips}`;
  const shortName = countyShortName(countyName);
  const stateAbbr = info?.stateAbbr ?? "";
  const stateName = info?.stateName ?? "";

  // Metro-scale splitting: target ~MAX_BUSINESS_COUNT businesses per zone.
  // LA County (~50k businesses) → 25 raw clusters → capped at 12.
  // A typical 2,500-biz county → 2 clusters. Cap at 12 to prevent micro-fragmentation.
  const clusterCount = Math.min(12, Math.ceil(totalBusinessCount / MAX_BUSINESS_COUNT));
  const allCities = await getTopCitiesInCounty(stateFips, countyFips, 20);

  // Split city list into clusterCount roughly equal groups (raw file order = population order)
  const clusters: string[][] = Array.from({ length: clusterCount }, () => []);
  allCities.forEach((city, i) => clusters[i % clusterCount]!.push(city));

  const countyEntry = {
    fips: geoid,
    name: countyName,
    shortName,
    businessCount: Math.round(totalBusinessCount / clusterCount),
  };

  const proposals: TerritoryProposal[] = [];
  for (let i = 0; i < clusterCount; i++) {
    const clusterCities = clusters[i] ?? [];
    const topCities = clusterCities.slice(0, 4);
    const name = generateTerritoryName(topCities, [countyName], stateAbbr);
    const slug = await generateSlug(name);
    proposals.push({
      proposedName: name,
      slug,
      stateFips,
      stateAbbr,
      counties: [countyEntry],
      totalBusinessCount: countyEntry.businessCount,
      // Splits are only created when the full county passed the household minimum
      // (MIN_HOUSEHOLDS_TO_SPLIT = 3 × MIN_HOUSEHOLDS). Per-split household estimate
      // may look thin in isolation but the county as a whole is viable.
      householdsEstimate: Math.round(countyEntry.businessCount * HOUSEHOLDS_PER_BUSINESS),
      topCities,
      isViable: true,
      isSplit: true,
      splitIndex: i + 1,
      splitTotal: clusterCount,
      estimatedZones: Math.min(4, Math.floor(countyEntry.businessCount / MIN_PER_CLUSTER)),
      centroidLat: getCountyCentroid(countyEntry.fips)?.lat ?? null,
      centroidLng: getCountyCentroid(countyEntry.fips)?.lng ?? null,
    });
  }
  return proposals;
}

// ─── Core Builder ─────────────────────────────────────────────────────────────

/**
 * Builds one or more territory proposals for a given county.
 * Returns a single proposal normally, or an array if the county needs splitting.
 */
export async function buildTerritoryProposal(
  stateFips: string,
  countyFips: string,
  _zipCode: string
): Promise<TerritoryProposal | TerritoryProposal[]> {
  const geoid = `${stateFips}${countyFips.padStart(3, "0")}`;
  const info = await getCountyInfo(stateFips, countyFips);
  const stateAbbr = info?.stateAbbr ?? "";

  // STEP 1 — Get business count for starting county
  const businessCount = await getAdReadyBusinessCount(stateFips, countyFips);
  logger.info({ geoid, businessCount }, "Territory builder: starting county count");

  // STEP 2 — Large county: split into clusters only when the county also has
  // enough residential density to support multiple mailing areas.
  // Counties that beat the business threshold but not the household threshold
  // (e.g. a large sprawling rural county) fall through to the single-territory path.
  if (businessCount >= MAX_BUSINESS_COUNT) {
    const countyHouseholdsEstimate = Math.round(businessCount * HOUSEHOLDS_PER_BUSINESS);
    if (countyHouseholdsEstimate >= MIN_HOUSEHOLDS_TO_SPLIT) {
      const splits = await splitLargeCounty(stateFips, countyFips, businessCount);
      // Inject co-located jurisdictions (VA independent cities, MD/MO city-county pairs)
      // into the last split so they appear in the merged territory card.
      // Use MAX_COLOCATED_RADIUS_MILES (25 mi), not the bundling radius, to avoid
      // sweeping in distant VA cities.
      const anchorCentroid = getCountyCentroid(geoid);
      for (const icGeoid of getColocatedGeoids(stateFips, [geoid])) {
        if (!anchorCentroid) continue;
        const icCentroid = getCountyCentroid(icGeoid);
        if (!icCentroid) continue;
        const dist = haversineDistanceMiles(
          anchorCentroid.lat, anchorCentroid.lng, icCentroid.lat, icCentroid.lng
        );
        if (dist > MAX_COLOCATED_RADIUS_MILES) continue;
        const icFips3 = icGeoid.slice(2);
        const icInfo = await getCountyInfo(stateFips, icFips3);
        if (!icInfo) continue;
        const icCount = await getAdReadyBusinessCount(stateFips, icFips3);
        if (icCount <= 0) continue;
        const lastSplit = splits[splits.length - 1]!;
        lastSplit.counties.push({
          fips: icGeoid,
          name: icInfo.name,
          shortName: countyShortName(icInfo.name),
          businessCount: icCount,
        });
        lastSplit.totalBusinessCount += icCount;
        lastSplit.householdsEstimate += Math.round(icCount * HOUSEHOLDS_PER_BUSINESS);
      }
      return splits;
    }
    // Enough businesses but too rural to split — continue as single territory
    logger.info(
      { geoid, businessCount, countyHouseholdsEstimate, MIN_HOUSEHOLDS_TO_SPLIT },
      "Territory builder: county above biz threshold but below split household minimum — keeping as single territory",
    );
  }

  interface BundledCounty {
    geoid: string;
    fips3: string;
    name: string;
    shortName: string;
    businessCount: number;
  }

  const bundled: BundledCounty[] = [{
    geoid,
    fips3: countyFips.padStart(3, "0"),
    name: info?.name ?? `County ${countyFips}`,
    shortName: countyShortName(info?.name ?? `County ${countyFips}`),
    businessCount,
  }];
  let totalCount = businessCount;

  // Setup shared state used by ring expansion AND co-located jurisdiction check below.
  const seen = new Set<string>([geoid]);
  const startCentroid = getCountyCentroid(geoid);

  // Load existing territory county short names for conflict filtering
  const existingTerritories = await db
    .select({ counties: territoriesTable.counties, status: territoriesTable.status })
    .from(territoriesTable)
    .where(eq(territoriesTable.state, stateAbbr));

  const claimedShortNames = new Set<string>();
  for (const terr of existingTerritories) {
    if (terr.status === "proposed") continue;
    const arr: string[] = Array.isArray(terr.counties) ? terr.counties : [];
    arr.forEach(n => claimedShortNames.add(n));
  }

  // Load pending proposal county GEOIDs (same state only) to avoid double-proposing.
  // Must filter by stateFips — county FIPS are 3-digit and reused across states.
  const pendingProposals = await db
    .select({ proposedCounties: territoryProposalsTable.proposedCounties })
    .from(territoryProposalsTable)
    .where(
      and(
        eq(territoryProposalsTable.stateFips, stateFips),
        eq(territoryProposalsTable.status, "pending_review"),
      ),
    );

  const pendingGeoids = new Set<string>();
  for (const p of pendingProposals) {
    const arr: string[] = Array.isArray(p.proposedCounties) ? p.proposedCounties : [];
    arr.forEach(g => pendingGeoids.add(g));
  }

  // STEP 3 — Ring expansion: keep bundling neighbors until TARGET_BUSINESS_COUNT.
  // Accept the territory if totalCount >= MIN_BUSINESS_COUNT when no more suitable
  // neighbors remain (radius cap, state line, or all claimed).
  if (totalCount < TARGET_BUSINESS_COUNT) {
    let frontier = [geoid];

    for (let ring = 1; ring <= MAX_NEIGHBOR_RINGS && totalCount < TARGET_BUSINESS_COUNT; ring++) {
      const nextFrontier: string[] = [];

      for (const frontierGeoid of frontier) {
        const neighborGeoids = await getNeighboringCounties(frontierGeoid);
        for (const nGeoid of neighborGeoids) {
          if (seen.has(nGeoid)) continue;
          // Same state only — territories must never span state lines
          if (nGeoid.slice(0, 2) !== stateFips) continue;
          // Distance cap — skip counties further than MAX_BUNDLE_RADIUS_MILES from
          // the starting county. Prevents 400-mile desert territories in the West.
          if (startCentroid) {
            const nCentroid = getCountyCentroid(nGeoid);
            if (nCentroid) {
              const distMiles = haversineDistanceMiles(
                startCentroid.lat, startCentroid.lng, nCentroid.lat, nCentroid.lng
              );
              if (distMiles > MAX_BUNDLE_RADIUS_MILES) continue;
            }
          }
          seen.add(nGeoid);

          const nFips3 = nGeoid.slice(2);
          const nInfo = await getCountyInfo(stateFips, nFips3);
          if (!nInfo) continue;
          const nShort = countyShortName(nInfo.name);

          // Skip if already claimed
          if (claimedShortNames.has(nShort)) continue;
          // Skip if in a pending proposal
          if (pendingGeoids.has(nGeoid)) continue;

          nextFrontier.push(nGeoid);
        }
      }

      if (nextFrontier.length === 0) break;

      // Fetch business counts for all ring candidates in parallel
      const countMap = await getAdReadyBusinessCountBatch(
        nextFrontier.map(g => ({ stateFips: g.slice(0, 2), countyFips: g.slice(2) }))
      );

      // Sort by business count descending, add greedily until target
      const sorted = nextFrontier
        .map(g => ({ geoid: g, count: countMap.get(g) ?? 0 }))
        .sort((a, b) => b.count - a.count);

      for (const { geoid: nGeoid, count: nCount } of sorted) {
        if (totalCount >= TARGET_BUSINESS_COUNT) break;
        const nFips3 = nGeoid.slice(2);
        const nInfo = await getCountyInfo(stateFips, nFips3);
        if (!nInfo) continue;
        bundled.push({
          geoid: nGeoid,
          fips3: nFips3,
          name: nInfo.name,
          shortName: countyShortName(nInfo.name),
          businessCount: nCount,
        });
        totalCount += nCount;
      }

      frontier = nextFrontier;
    }
  }

  // STEP 4 — Co-located jurisdiction check (always runs, even when anchor county is large).
  // Virginia independent cities are absent from the county adjacency file; MD/MO have
  // city-county splits. Use MAX_COLOCATED_RADIUS_MILES (25 mi) — not the bundling radius —
  // to avoid sweeping in distant VA cities that happen to be within 75 miles.
  for (const icGeoid of getColocatedGeoids(stateFips, bundled.map(c => c.geoid))) {
    if (seen.has(icGeoid)) continue;
    if (startCentroid) {
      const icCentroid = getCountyCentroid(icGeoid);
      if (icCentroid) {
        const dist = haversineDistanceMiles(
          startCentroid.lat, startCentroid.lng, icCentroid.lat, icCentroid.lng
        );
        if (dist > MAX_COLOCATED_RADIUS_MILES) continue;
      }
    }
    seen.add(icGeoid);
    const icFips3 = icGeoid.slice(2);
    const icInfo = await getCountyInfo(stateFips, icFips3);
    if (!icInfo) continue;
    const icShort = countyShortName(icInfo.name);
    if (claimedShortNames.has(icShort)) continue;
    if (pendingGeoids.has(icGeoid)) continue;
    const icCount = await getAdReadyBusinessCount(stateFips, icFips3);
    if (icCount <= 0) continue;
    bundled.push({
      geoid: icGeoid,
      fips3: icFips3,
      name: icInfo.name,
      shortName: icShort,
      businessCount: icCount,
    });
    totalCount += icCount;
  }

  // STEP 5 — Gather cities for all bundled counties
  const cityArrays = await Promise.all(
    bundled.map(c => getTopCitiesInCounty(stateFips, c.fips3, 6))
  );
  const seenCities = new Set<string>();
  const mergedCities: string[] = [];
  for (const arr of cityArrays) {
    for (const city of arr) {
      if (!seenCities.has(city)) {
        seenCities.add(city);
        mergedCities.push(city);
      }
    }
  }
  const topCities = mergedCities.slice(0, 4);
  const countyNames = bundled.map(c => c.name);

  const name = generateTerritoryName(topCities, countyNames, stateAbbr);
  const slug = await generateSlug(name);

  const householdsEstimate = Math.round(totalCount * HOUSEHOLDS_PER_BUSINESS);
  return {
    proposedName: name,
    slug,
    stateFips,
    stateAbbr,
    counties: bundled.map(c => ({
      fips: c.geoid,
      name: c.name,
      shortName: c.shortName,
      businessCount: c.businessCount,
    })),
    totalBusinessCount: totalCount,
    householdsEstimate,
    topCities,
    // Viable only when the territory has enough businesses AND enough estimated
    // households to support a real direct-mail campaign.
    isViable: totalCount >= MIN_BUSINESS_COUNT && householdsEstimate >= MIN_HOUSEHOLDS,
    viabilityReason:
      totalCount < MIN_BUSINESS_COUNT
        ? `Fewer than ${MIN_BUSINESS_COUNT} ad-ready businesses within ${MAX_BUNDLE_RADIUS_MILES} miles. This area may be too rural for a standard postcard territory.`
        : householdsEstimate < MIN_HOUSEHOLDS
        ? `Estimated household count (${householdsEstimate.toLocaleString()}) is below the ${MIN_HOUSEHOLDS.toLocaleString()} minimum for viable direct mail.`
        : undefined,
    isSplit: false,
    estimatedZones: Math.min(4, Math.floor(totalCount / MIN_PER_CLUSTER)),
    ...computeBundledCentroid(bundled.map(c => c.geoid)),
  };
}

/**
 * Averages Census 2020 population-weighted centroids across a set of county GEOIDs.
 * Counties missing from the centroids file are skipped with a warning.
 * Returns { centroidLat: null, centroidLng: null } when no centroids are available.
 */
function computeBundledCentroid(geoids: string[]): { centroidLat: number | null; centroidLng: number | null } {
  const found = geoids
    .map(g => getCountyCentroid(g))
    .filter((c): c is { lat: number; lng: number } => c !== null);
  if (found.length === 0) {
    if (geoids.length > 0) {
      logger.warn({ geoids }, "County centroid(s) not found in Census file — centroid will be null");
    }
    return { centroidLat: null, centroidLng: null };
  }
  const centroidLat = found.reduce((s, c) => s + c.lat, 0) / found.length;
  const centroidLng = found.reduce((s, c) => s + c.lng, 0) / found.length;
  return { centroidLat, centroidLng };
}

// ─── Approval / Rejection ─────────────────────────────────────────────────────

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

  // Generate next sequential ID for this state
  const existingRows = await db
    .select({ id: territoriesTable.id })
    .from(territoriesTable)
    .where(eq(territoriesTable.state, state));

  const nums = existingRows
    .map(r => parseInt(r.id.replace(`${state}-`, ""), 10))
    .filter(n => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  const territoryId = `${state}-${String(next).padStart(3, "0")}`;

  // Translate FIPS GEOIDs → short county names for territories.counties
  const proposedCounties: string[] = Array.isArray(proposal.proposedCounties)
    ? (proposal.proposedCounties as string[])
    : [];

  const countyShortNames: string[] = [];
  for (const geoid of proposedCounties) {
    const sf = geoid.slice(0, 2);
    const cf = geoid.slice(2);
    const cInfo = await getCountyInfo(sf, cf);
    if (cInfo) countyShortNames.push(countyShortName(cInfo.name));
  }

  const topCities: string[] = Array.isArray(proposal.proposedCities)
    ? (proposal.proposedCities as string[])
    : [];

  const households = Math.round((proposal.businessCount ?? 0) * 12);

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

export interface TerritoryForZipResult {
  type: "existing" | "proposed" | "unavailable";
  territory?: Record<string, unknown>;
  proposals?: TerritoryProposal[];
  proposalIds?: number[];
  message?: string;
}

/**
 * Top-level orchestrator: resolves a ZIP to a county, checks for conflicts,
 * builds proposals, saves them, and notifies admin.
 */
export async function getTerritoryForZip(
  zipCode: string,
  dealerInfo?: { name: string; email: string; phone: string },
  options?: { isTest?: boolean }
): Promise<TerritoryForZipResult> {
  const isTest = options?.isTest ?? false;
  // 1. Resolve ZIP → county
  const county = await getCountyFromZip(zipCode);
  if (!county) {
    return { type: "unavailable", message: "ZIP code not recognized" };
  }

  const { stateFips, stateAbbr } = county;
  // Use let so Fix 8 (fringe-ZIP anchor shift) can re-anchor to a neighbor county
  let countyFips3 = county.countyFips;
  let countyName = county.countyName;
  let geoid = `${stateFips}${countyFips3.padStart(3, "0")}`;

  // 1b. Hard gate — auto-builder never runs for manually managed states.
  // Return the existing territory if one covers this county, otherwise unavailable.
  // No proposal is ever created, regardless of DB coverage or county name matching.
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

  // 1c. Fringe-ZIP anchor shift (Fix 8) — if the triggering ZIP's primary county
  // has very few businesses (< 150), it likely falls in a sparse rural edge of
  // that county. Check the 3 nearest same-state neighbors and re-anchor to
  // whichever has the most businesses, so the territory builds from the real hub.
  //
  // IMPORTANT: the rural gate (1d, below) uses anchorBizCheck BEFORE the shift.
  // A truly rural ZIP (< MIN_BUSINESS_COUNT biz) is rejected without ever attempting
  // the fringe shift, so that a sparse anchor can never be "rescued" by shifting
  // 15-20 miles to a nearby viable county that is a completely different market.
  const anchorBizCheck = await getAdReadyBusinessCount(stateFips, countyFips3);

  // 1d. Rural anchor gate (pre-shift): if the original anchor county is genuinely too
  // sparse for any viable territory, reject immediately before fringe-shift logic runs.
  // MIN_HOUSEHOLDS = MIN_BUSINESS_COUNT × HOUSEHOLDS_PER_BUSINESS = 400 × 12 = 4,800.
  if (anchorBizCheck * HOUSEHOLDS_PER_BUSINESS < MIN_HOUSEHOLDS) {
    logger.info(
      { zipCode, stateFips, countyFips3, anchorBizCheck, threshold: MIN_HOUSEHOLDS / HOUSEHOLDS_PER_BUSINESS },
      "Territory builder: original anchor county below household minimum — returning unavailable (pre-shift)",
    );
    return {
      type: "unavailable",
      message:
        "This ZIP code appears to be in a rural or non-residential area. " +
        "Please try a nearby ZIP code in a more populated town or city.",
    };
  }

  if (anchorBizCheck < 150) {
    const anchorNeighborGeoids = await getNeighboringCounties(geoid);
    const anchorCandidates = anchorNeighborGeoids
      .filter(g => g.slice(0, 2) === stateFips)
      .slice(0, 3);
    if (anchorCandidates.length > 0) {
      const neighborCounts = await getAdReadyBusinessCountBatch(
        anchorCandidates.map(g => ({ stateFips: g.slice(0, 2), countyFips: g.slice(2) }))
      );
      let bestAnchorGeoid = "";
      let bestAnchorCount = anchorBizCheck;
      for (const [g, c] of neighborCounts.entries()) {
        if (c > bestAnchorCount) { bestAnchorGeoid = g; bestAnchorCount = c; }
      }
      if (bestAnchorGeoid) {
        // Guard: only shift if the new anchor is ≤ 20 miles away. This prevents
        // genuinely rural ZIPs (e.g. Yemassee SC) from being dragged into a distant
        // coastal metro simply because the nearest commercial hub is far away.
        const origCentroid = getCountyCentroid(`${stateFips}${county.countyFips.padStart(3, "0")}`);
        const newCentroid = getCountyCentroid(bestAnchorGeoid);
        const shiftDist = (origCentroid && newCentroid)
          ? haversineDistanceMiles(origCentroid.lat, origCentroid.lng, newCentroid.lat, newCentroid.lng)
          : 999;
        if (shiftDist <= 20) {
          const newAnchorInfo = await getCountyInfo(bestAnchorGeoid.slice(0, 2), bestAnchorGeoid.slice(2));
          if (newAnchorInfo) {
            const originalCounty = county.countyFips;
            countyFips3 = bestAnchorGeoid.slice(2);
            countyName = newAnchorInfo.name;
            geoid = bestAnchorGeoid;
            logger.info(
              { zipCode, originalCounty, newGeoid: geoid, bestAnchorCount, shiftDist },
              "Territory builder: shifted anchor county for fringe ZIP"
            );
          }
        } else {
          logger.info(
            { zipCode, bestAnchorGeoid, shiftDist, threshold: 20 },
            "Territory builder: fringe-shift suppressed — new anchor too far away"
          );
        }
      }
    }
  }

  // 2. Check conflict with existing territories (non-managed states only)
  const conflict = await checkTerritoryConflicts([geoid], stateAbbr);
  if (conflict.hasConflict && conflict.conflictingTerritoryId) {
    const status = conflict.conflictingTerritoryStatus ?? "available";
    if (status === "taken" || status === "pending") {
      return {
        type: "unavailable",
        message: "This territory has already been claimed",
      };
    }
    // status = available → return the existing territory for the dealer to claim
    const [existing] = await db
      .select()
      .from(territoriesTable)
      .where(eq(territoriesTable.id, conflict.conflictingTerritoryId));
    return { type: "existing", territory: existing as Record<string, unknown> };
  }

  // 3. Check for pending proposals WITH dealer contact for this exact county
  // (same state + same 3-digit county FIPS), created within the last 48 hours.
  // Older records are treated as stale and never block new submissions.
  // Anonymous previews (dealerEmail IS NULL) are also excluded so the first
  // ZIP search never blocks the claim form.
  // Both stateFips AND countyFips are required — county FIPS are 3-digit and
  // are reused across states, so matching county alone causes cross-state false positives.
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

  // 3.5. Rural anchor gate (pre-build): if the current anchor county has too few businesses
  // to represent a real commercial area, reject before bundling. This prevents aggressive
  // bundling from rescuing a genuinely rural ZIP by pairing it with a distant populated county.
  // Recompute here (post fringe-shift) so the check uses the final anchor, not the original.
  const preCheckBizCount = await getAdReadyBusinessCount(stateFips, countyFips3);
  if (preCheckBizCount * HOUSEHOLDS_PER_BUSINESS < MIN_HOUSEHOLDS) {
    logger.info(
      { zipCode, stateFips, countyFips3, preCheckBizCount, threshold: MIN_HOUSEHOLDS },
      "Territory builder: anchor county below household minimum — returning unavailable (pre-build)",
    );
    return {
      type: "unavailable",
      message:
        "This ZIP code appears to be in a rural or non-residential area. " +
        "Please try a nearby ZIP code in a more populated town or city.",
    };
  }

  // 4. Build proposals
  const rawResult = await buildTerritoryProposal(stateFips, countyFips3, zipCode);
  const proposals = Array.isArray(rawResult) ? rawResult : [rawResult];

  // 4b. Household viability gate — if the combined county estimate falls below the
  // minimum, the area is too rural for a direct-mail territory. Return unavailable
  // before saving to DB or sending admin emails, so the admin queue stays clean.
  // For split proposals, sum across splits to get the county total.
  const countyTotalBiz = proposals.reduce((s, p) => s + p.totalBusinessCount, 0);
  const countyHouseholdsEstimate = Math.round(countyTotalBiz * HOUSEHOLDS_PER_BUSINESS);
  if (countyHouseholdsEstimate < MIN_HOUSEHOLDS) {
    logger.info(
      { zipCode, stateFips, countyFips3, countyTotalBiz, countyHouseholdsEstimate, MIN_HOUSEHOLDS },
      "Territory builder: county below household minimum — returning unavailable instead of saving proposal",
    );
    return {
      type: "unavailable",
      message:
        "This ZIP code appears to be in a rural or non-residential area. " +
        "Please try a nearby ZIP code in a more populated town or city.",
    };
  }

  // 5. Save proposals to DB (skipped for test/smoke-test requests)
  const savedIds: number[] = [];
  if (!isTest) {
    for (const proposal of proposals) {
      const proposedGeoids = proposal.counties.map(c => c.fips);
      const [saved] = await db
        .insert(territoryProposalsTable)
        .values({
          zipCode,
          stateFips,
          stateAbbr,
          countyFips: countyFips3.padStart(3, "0"),
          countyName,
          proposedName: proposal.proposedName,
          proposedCounties: proposedGeoids,
          proposedCities: proposal.topCities,
          businessCount: proposal.totalBusinessCount,
          isSplit: proposal.isSplit,
          splitIndex: proposal.splitIndex ?? null,
          splitTotal: proposal.splitTotal ?? null,
          dealerName: dealerInfo?.name ?? null,
          dealerEmail: dealerInfo?.email ?? null,
          dealerPhone: dealerInfo?.phone ?? null,
        })
        .returning({ id: territoryProposalsTable.id });
      if (saved) savedIds.push(saved.id);
    }
  }

  // 6. Admin notification (fire-and-forget; skipped for test requests)
  if (!isTest) {
    try {
      const { sendTerritoryProposalEmail } = await import("./emails");
      for (const proposal of proposals) {
        await sendTerritoryProposalEmail({
          proposedName: proposal.proposedName,
          stateAbbr,
          stateName: (await getCountyInfo(stateFips, countyFips3))?.stateName ?? stateAbbr,
          countyNames: proposal.counties.map(c => c.name),
          totalBusinessCount: proposal.totalBusinessCount,
          estimatedZones: proposal.estimatedZones,
          topCities: proposal.topCities,
          isViable: proposal.isViable,
          dealerName: dealerInfo?.name,
          dealerEmail: dealerInfo?.email,
          dealerPhone: dealerInfo?.phone,
          zipCode,
        });
      }
    } catch (err: unknown) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) },
        "Territory proposal email failed — continuing");
    }
  }

  return { type: "proposed", proposals, proposalIds: savedIds };
}
