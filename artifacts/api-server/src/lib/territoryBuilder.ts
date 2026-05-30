/**
 * Territory Builder Engine — Prompt 2 of 3
 *
 * All Census data comes exclusively from the four in-memory Maps loaded by
 * censusApi.ts. No external API calls anywhere in this module.
 */

import { db, territoriesTable, territoryProposalsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  getCountyFromZip,
  getAdReadyBusinessCount,
  getAdReadyBusinessCountBatch,
  getNeighboringCounties,
  getCountyInfo,
  getTopCitiesInCounty,
} from "./censusApi";
import { logger } from "./logger";

// ─── Thresholds ───────────────────────────────────────────────────────────────

const MIN_BUSINESS_COUNT = 400;    // minimum to be a viable territory
const MAX_BUSINESS_COUNT = 1600;   // above this, split into sub-territories
const MIN_PER_CLUSTER = 100;       // minimum businesses per postcard area
const MAX_NEIGHBOR_RINGS = 3;      // rings of neighbors before giving up on bundling

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
  topCities: string[];
  isViable: boolean;
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

  const clusterCount = Math.min(4, Math.ceil(totalBusinessCount / MIN_BUSINESS_COUNT));
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
      topCities,
      isViable: true,
      isSplit: true,
      splitIndex: i + 1,
      splitTotal: clusterCount,
      estimatedZones: Math.min(4, Math.floor(countyEntry.businessCount / MIN_PER_CLUSTER)),
      centroidLat: null,
      centroidLng: null,
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

  // STEP 2 — Large county: split into clusters
  if (businessCount >= MAX_BUSINESS_COUNT) {
    return splitLargeCounty(stateFips, countyFips, businessCount);
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

  // STEP 3 — Already viable as single county
  if (totalCount < MIN_BUSINESS_COUNT) {
    // STEP 4 — Ring expansion
    const seen = new Set<string>([geoid]);

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

    // Load pending proposal county FIPs to avoid double-proposing
    const pendingProposals = await db
      .select({ proposedCounties: territoryProposalsTable.proposedCounties })
      .from(territoryProposalsTable)
      .where(eq(territoryProposalsTable.status, "pending_review"));

    const pendingGeoids = new Set<string>();
    for (const p of pendingProposals) {
      const arr: string[] = Array.isArray(p.proposedCounties) ? p.proposedCounties : [];
      arr.forEach(g => pendingGeoids.add(g));
    }

    // Current frontier = directly bundled GEOIDs
    let frontier = [geoid];

    for (let ring = 1; ring <= MAX_NEIGHBOR_RINGS && totalCount < MIN_BUSINESS_COUNT; ring++) {
      const nextFrontier: string[] = [];

      for (const frontierGeoid of frontier) {
        const neighborGeoids = await getNeighboringCounties(frontierGeoid);
        for (const nGeoid of neighborGeoids) {
          if (seen.has(nGeoid)) continue;
          // Same state only
          if (nGeoid.slice(0, 2) !== stateFips) continue;
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

      // Sort by business count descending, add greedily until viable
      const sorted = nextFrontier
        .map(g => ({ geoid: g, count: countMap.get(g) ?? 0 }))
        .sort((a, b) => b.count - a.count);

      for (const { geoid: nGeoid, count: nCount } of sorted) {
        if (totalCount >= MIN_BUSINESS_COUNT) break;
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
    topCities,
    isViable: totalCount >= MIN_BUSINESS_COUNT,
    isSplit: false,
    estimatedZones: Math.min(4, Math.floor(totalCount / MIN_PER_CLUSTER)),
    centroidLat: null,
    centroidLng: null,
  };
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
  dealerInfo?: { name: string; email: string; phone: string }
): Promise<TerritoryForZipResult> {
  // 1. Resolve ZIP → county
  const county = await getCountyFromZip(zipCode);
  if (!county) {
    return { type: "unavailable", message: "ZIP code not recognized" };
  }

  const { stateFips, stateAbbr, countyFips: countyFips3, countyName } = county;
  const geoid = `${stateFips}${countyFips3.padStart(3, "0")}`;

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

  // 3. Check for pending proposals for this county
  const activePending = await db
    .select({ id: territoryProposalsTable.id })
    .from(territoryProposalsTable)
    .where(
      and(
        eq(territoryProposalsTable.countyFips, countyFips3.padStart(3, "0")),
        eq(territoryProposalsTable.status, "pending_review"),
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

  // 4. Build proposals
  const rawResult = await buildTerritoryProposal(stateFips, countyFips3, zipCode);
  const proposals = Array.isArray(rawResult) ? rawResult : [rawResult];

  // 5. Save proposals to DB
  const savedIds: number[] = [];
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

  // 6. Admin notification (fire-and-forget — imported lazily to avoid circular deps)
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

  return { type: "proposed", proposals, proposalIds: savedIds };
}
