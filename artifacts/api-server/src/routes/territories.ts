import { Router, type IRouter } from "express";
import { eq, and, sql as rawSql } from "drizzle-orm";
import { z } from "zod/v4";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db, territoriesTable, dealerTerritoryClaimsTable, territoryZipAssignmentsTable, territoryProposalsTable } from "@workspace/db";
import {
  getTerritoryForLocation,
  findCandidateHubs,
  selectBestHubs,
  getFootprintCountyGeoids,
} from "../lib/territoryBuilder";
import {
  getCountyGeoidsByShortNames,
  getCountyNameByGeoid,
  getCountyShortNameByGeoid,
  getCountyFromZip,
  getCitiesInState,
  getZipLocation,
  getCountyGeoidFromZip,
} from "../lib/censusApi";

// Works in both ESM dev (tsx watch) and the esbuild production bundle.
// In prod, esbuild's banner sets globalThis.__dirname = dist/, so the
// fallback to import.meta.url is only reached in dev.
const _dirname: string =
  (globalThis as any).__dirname ??
  path.dirname(fileURLToPath(import.meta.url));

const router: IRouter = Router();

const JWT_SECRET = process.env.SESSION_SECRET || "localspot-secret";

// ─── Middleware ────────────────────────────────────────────────────────────────
// Used on data-mutating admin API routes (Authorization: Bearer <token>).
function requireAdmin(req: any, res: any, next: any): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Validates a JWT passed as a ?token= query param (used by HTML page routes so
// the browser GET can be authenticated without a custom header).
function verifyQueryToken(token: string): boolean {
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

// ─── Static HTML ──────────────────────────────────────────────────────────────
// The territory-manager HTML lives in src/public/ (dev) and dist/public/ (prod).
// The build step copies src/public → dist/public, so __dirname-relative paths
// work identically in both environments.
function resolveHtmlPath(): string {
  // In production (esbuild bundle), _dirname = dist/
  const prodPath = path.resolve(_dirname, "public", "territory-manager.html");
  if (fs.existsSync(prodPath)) return prodPath;
  // In development (tsx watch), _dirname = src/routes/
  const devPath = path.resolve(_dirname, "..", "public", "territory-manager.html");
  if (fs.existsSync(devPath)) return devPath;
  throw new Error("territory-manager.html not found (checked both dist/public/ and src/public/)");
}

const HTML_FILE_PATH = resolveHtmlPath();


// ─── Zod Schemas ──────────────────────────────────────────────────────────────
const CreateTerritorySchema = z.object({
  name:       z.string().min(1).max(200),
  state:      z.string().length(2),
  counties:   z.array(z.string().min(1)).min(1),
  households: z.number().int().min(0),
  zoneNote:   z.string().max(500).optional().nullable(),
});

const UpdateTerritorySchema = z.object({
  name:       z.string().min(1).max(200).optional(),
  counties:   z.array(z.string().min(1)).optional(),
  households: z.number().int().min(0).optional(),
  status:     z.enum(["available", "pending", "taken"]).optional(),
  dealerId:   z.number().int().nullable().optional(),
  zoneNote:   z.string().max(500).optional().nullable(),
});

const ClaimSchema = z.object({
  territory_id:  z.string().min(1),
  dealer_name:   z.string().min(1).max(120),
  dealer_email:  z.string().email().max(180),
  dealer_phone:  z.string().max(40).optional().nullable(),
});

// ─── GET /api/territories ─────────────────────────────────────────────────────
router.get("/territories", async (req, res): Promise<void> => {
  const state = typeof req.query.state === "string" ? req.query.state.toUpperCase() : null;
  const rows = state
    ? await db.select().from(territoriesTable).where(eq(territoriesTable.state, state))
    : await db.select().from(territoriesTable);
  res.json(rows);
});

// ─── GET /api/territories/:id/counties ────────────────────────────────────────
router.get("/territories/:id/counties", async (req, res): Promise<void> => {
  const [row] = await db
    .select({ counties: territoriesTable.counties })
    .from(territoriesTable)
    .where(eq(territoriesTable.id, req.params.id));
  if (!row) { res.status(404).json({ error: "Territory not found" }); return; }
  res.json({ counties: row.counties });
});

// ─── GET /api/territories/:id/mailing-areas ───────────────────────────────────
// Uses the same hub-selection logic as the territory builder proposal flow.
// Finds real commercial hub cities near the territory centroid via
// findCandidateHubs + selectBestHubs. Returns city names only — the frontend
// displays a fixed "5,000 households via USPS EDDM" footer, no per-area count.

type MailingAreaResult = Array<{ name: string }>;
const _mailingAreaCache = new Map<string, MailingAreaResult>();

router.get("/territories/:id/mailing-areas", async (req, res): Promise<void> => {
  const { id } = req.params;

  const cached = _mailingAreaCache.get(id);
  if (cached) { res.json(cached); return; }

  const [row] = await db
    .select({
      name: territoriesTable.name,
      centroidLat: territoriesTable.centroidLat,
      centroidLng: territoriesTable.centroidLng,
      state: territoriesTable.state,
      counties: territoriesTable.counties,
    })
    .from(territoriesTable)
    .where(eq(territoriesTable.id, id));
  if (!row) { res.status(404).json({ error: "Territory not found" }); return; }

  if (row.centroidLat == null || row.centroidLng == null) {
    res.json([]);
    return;
  }

  const stateAbbr = (row.state ?? "GA").toUpperCase();
  const allCandidates = await findCandidateHubs(row.centroidLat, row.centroidLng, stateAbbr);

  // ── Edge case 1: metro split territories (name contains " — ") ──────────────
  // These are partial-county splits (e.g. "Fulton County — North"). The county
  // array covers the whole county, so county filtering would bleed hubs across
  // sub-territories. Instead, limit by 15-mile radius from the (correctly
  // placed) centroid so each sub-area gets its own local hubs.
  const isMetroSplit = (row.name ?? "").includes(" \u2014 ");
  let candidates;
  if (isMetroSplit) {
    const METRO_SPLIT_RADIUS_MI = 15;
    candidates = allCandidates.filter(c => c.distanceFromDealer <= METRO_SPLIT_RADIUS_MI);
    if (candidates.length === 0) candidates = allCandidates; // safety fallback
  } else {
    // ── Standard county-boundary filter ────────────────────────────────────────
    const allowedGeoids = getCountyGeoidsByShortNames(stateAbbr, row.counties ?? []);

    const inTerritory = allowedGeoids.size > 0
      ? allCandidates.filter(c => {
          if (allowedGeoids.has(c.countyGeoid)) return true;
          // ── Edge case 3: Virginia independent cities ──────────────────────────
          // VA independent cities have their own county FIPS codes separate from
          // surrounding counties (e.g. "Charlottesville city" is distinct from
          // Albemarle County). Include them when within 10 miles of the centroid.
          if (stateAbbr === "VA") {
            const countyName = getCountyNameByGeoid(c.countyGeoid) ?? "";
            if (countyName.toLowerCase().endsWith(" city") && c.distanceFromDealer <= 10) {
              return true;
            }
          }
          return false;
        })
      : allCandidates;

    // ── Edge case 2: small rural territories with few in-county hubs ───────────
    // Use whatever in-county hubs exist (even just 1 or 2).
    // Only fall back to unfiltered nearest-2 when zero in-county hubs found.
    if (inTerritory.length > 0) {
      candidates = inTerritory;
    } else {
      candidates = [...allCandidates]
        .sort((a, b) => a.distanceFromDealer - b.distanceFromDealer)
        .slice(0, 2);
    }
  }

  const hubs = selectBestHubs(candidates, row.centroidLat, row.centroidLng);

  const result: MailingAreaResult = hubs.map(h => ({ name: h.cityName }));
  _mailingAreaCache.set(id, result);
  res.json(result);
});

// ─── POST /api/territories (admin) ────────────────────────────────────────────
router.post("/territories", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateTerritorySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const state = parsed.data.state.toUpperCase();
  const existingRows = await db
    .select({ id: territoriesTable.id })
    .from(territoriesTable)
    .where(eq(territoriesTable.state, state));

  const nums = existingRows
    .map(r => parseInt(r.id.replace(`${state}-`, ""), 10))
    .filter(n => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  const id = `${state}-${String(next).padStart(3, "0")}`;

  const [created] = await db
    .insert(territoriesTable)
    .values({ id, ...parsed.data, state, zones: 4, status: "available" })
    .returning();

  req.log.info({ id }, "Territory created");
  res.status(201).json(created);
});

// ─── PUT /api/territories/:id (admin) ─────────────────────────────────────────
router.put("/territories/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateTerritorySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db
    .select()
    .from(territoriesTable)
    .where(eq(territoriesTable.id, req.params.id));
  if (!existing) { res.status(404).json({ error: "Territory not found" }); return; }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined)       updateData.name       = parsed.data.name;
  if (parsed.data.counties !== undefined)   updateData.counties   = parsed.data.counties;
  if (parsed.data.households !== undefined) updateData.households = parsed.data.households;
  if (parsed.data.status !== undefined)     updateData.status     = parsed.data.status;
  if (parsed.data.dealerId !== undefined)   updateData.dealerId   = parsed.data.dealerId;
  if (parsed.data.zoneNote !== undefined)   updateData.zoneNote   = parsed.data.zoneNote;

  const [updated] = await db
    .update(territoriesTable)
    .set(updateData)
    .where(eq(territoriesTable.id, req.params.id))
    .returning();

  req.log.info({ id: req.params.id }, "Territory updated");
  res.json(updated);
});

// ─── DELETE /api/territories/:id (admin) ──────────────────────────────────────
router.delete("/territories/:id", requireAdmin, async (req, res): Promise<void> => {
  const [existing] = await db
    .select()
    .from(territoriesTable)
    .where(eq(territoriesTable.id, req.params.id));
  if (!existing) { res.status(404).json({ error: "Territory not found" }); return; }
  if (existing.status !== "available") {
    res.status(409).json({ error: "Only available territories can be deleted" });
    return;
  }
  await db.delete(territoriesTable).where(eq(territoriesTable.id, req.params.id));
  req.log.info({ id: req.params.id }, "Territory deleted");
  res.json({ ok: true });
});

// ─── POST /api/territory-claims ───────────────────────────────────────────────
router.post("/territory-claims", async (req, res): Promise<void> => {
  const parsed = ClaimSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [territory] = await db
    .select()
    .from(territoriesTable)
    .where(eq(territoriesTable.id, parsed.data.territory_id));
  if (!territory) { res.status(404).json({ error: "Territory not found" }); return; }
  if (territory.status !== "available") {
    res.status(409).json({ error: "This territory is no longer available" });
    return;
  }

  // Atomically transition status + insert claim. The UPDATE is guarded by
  // status='available' so concurrent requests racing here will find 0 rows
  // updated — we check the count before inserting the claim row, ensuring a
  // claim is ONLY created when this request won the race.
  let claimed = false;
  await db.transaction(async tx => {
    const updated = await tx
      .update(territoriesTable)
      .set({ status: "pending" })
      .where(and(
        eq(territoriesTable.id, parsed.data.territory_id),
        eq(territoriesTable.status, "available"),
      ))
      .returning({ id: territoriesTable.id });

    if (updated.length === 0) return; // another request beat us

    await tx.insert(dealerTerritoryClaimsTable).values({
      territoryId:  parsed.data.territory_id,
      dealerName:   parsed.data.dealer_name,
      dealerEmail:  parsed.data.dealer_email,
      dealerPhone:  parsed.data.dealer_phone ?? null,
      status:       "pending",
    });
    claimed = true;
  });

  if (!claimed) {
    res.status(409).json({ error: "This territory is no longer available" });
    return;
  }

  req.log.info(
    { territoryId: parsed.data.territory_id, dealer: parsed.data.dealer_email },
    "Territory claimed",
  );
  res.status(201).json({ ok: true, message: "Territory claimed successfully" });
});

// ─── GET /api/admin/territories (HTML — admin JWT required via ?token=) ───────
// The admin dashboard passes the JWT as a ?token= query param so the browser
// GET can be authenticated without custom headers. The page itself re-uses the
// token (stored in localStorage) for subsequent AJAX API calls.
router.get("/admin/territories", (req, res): void => {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!token || !verifyQueryToken(token)) {
    // No valid token — redirect to the React admin login page
    res.redirect("/admin");
    return;
  }
  res.sendFile(HTML_FILE_PATH);
});

// ─── GET /api/dealer/claim-territory (HTML — public) ──────────────────────────
router.get("/dealer/claim-territory", (_req, res): void => {
  res.sendFile(HTML_FILE_PATH);
});

// ─── GET /api/territories/zip-assignments ─────────────────────────────────────
// Returns ZIP→territory assignments.
// Optional ?state=GA filters to only assignments whose territory belongs to that state.
router.get("/territories/zip-assignments", async (req, res): Promise<void> => {
  try {
    const stateFilter =
      typeof req.query.state === "string" ? req.query.state.toUpperCase() : null;

    const rows = stateFilter
      ? await db
          .select({
            zip: territoryZipAssignmentsTable.zip,
            territoryId: territoryZipAssignmentsTable.territoryId,
          })
          .from(territoryZipAssignmentsTable)
          .innerJoin(
            territoriesTable,
            eq(territoryZipAssignmentsTable.territoryId, territoriesTable.id),
          )
          .where(eq(territoriesTable.state, stateFilter))
      : await db.select().from(territoryZipAssignmentsTable);

    res.json(rows);
  } catch (err: any) {
    req.log.error({ err: err?.message }, "Failed to fetch zip assignments");
    res.status(500).json({ error: "Failed to fetch zip assignments" });
  }
});

// ─── POST /api/admin/territories/zip-assignments ──────────────────────────────
// Upserts one or more ZIP assignments. Body: { assignments: [{zip, territoryId}] }
const ZipAssignmentsSchema = z.object({
  assignments: z.array(z.object({
    zip:         z.string().length(5),
    territoryId: z.string().min(1),
  })).min(1).max(2000),
});

router.post("/admin/territories/zip-assignments", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ZipAssignmentsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { assignments } = parsed.data;
  await db
    .insert(territoryZipAssignmentsTable)
    .values(assignments.map(a => ({ zip: a.zip, territoryId: a.territoryId })))
    .onConflictDoUpdate({
      target: territoryZipAssignmentsTable.zip,
      set: { territoryId: rawSql`excluded.territory_id` },
    });
  req.log.info({ count: assignments.length }, "ZIP assignments upserted");
  res.json({ ok: true, count: assignments.length });
});

// ─── DELETE /api/admin/territories/zip-assignments/:zip ──────────────────────
// Removes a single ZIP assignment (unassigns it).
router.delete("/admin/territories/zip-assignments/:zip", requireAdmin, async (req, res): Promise<void> => {
  const { zip } = req.params;
  await db.delete(territoryZipAssignmentsTable).where(eq(territoryZipAssignmentsTable.zip, zip));
  req.log.info({ zip }, "ZIP assignment removed");
  res.json({ ok: true });
});

// ─── Territory Auto-Builder Routes ───────────────────────────────────────────

// Simple in-memory rate limiter: 10 requests per IP per hour
const _proposeRateLimit = new Map<string, { count: number; resetAt: number }>();
function checkProposeRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = _proposeRateLimit.get(ip);
  if (!entry || entry.resetAt < now) {
    _proposeRateLimit.set(ip, { count: 1, resetAt: now + 3_600_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

const ProposeSchema = z.object({
  zip:   z.string().trim().regex(/^\d{5}$/, "Enter a valid 5-digit ZIP code"),
  city:  z.string().trim().min(1, "City is required").max(120),
  state: z.string().trim().regex(/^[A-Za-z]{2}$/, "Select a state"),
});

/** Unique, non-empty county GEOIDs across a proposal's hubs. */
function proposalCountyGeoids(hubs: Array<{ countyGeoid: string }>): string[] {
  return [...new Set(hubs.map(h => h.countyGeoid).filter(Boolean))];
}

// ── POST /api/territories/propose (public, rate-limited) ─────────────────────
// Unified resolver for all 50 states. Requires ZIP + City + State. Returns one
// of: an existing territory within 25mi, a fresh in-memory proposal (NOT saved
// to the DB — persisted only when the dealer claims), or unavailable.
router.post("/territories/propose", async (req, res): Promise<void> => {
  const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown").split(",")[0]!.trim();
  if (!checkProposeRateLimit(ip)) {
    res.status(429).json({ error: "Too many requests — try again in an hour" });
    return;
  }

  const parsed = ProposeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { zip, city, state } = parsed.data;
  const submittedAbbr = state.trim().toUpperCase();

  // ZIP resolves the primary county and the canonical state metadata.
  const fromZip = await getCountyFromZip(zip);
  if (!fromZip) {
    res.status(404).json({ error: "We couldn't find that ZIP code. Please double-check it." });
    return;
  }
  const { stateFips, stateName, stateAbbr, countyFips, countyName } = fromZip;

  // State is authoritative and must agree with the ZIP — it is never silently
  // ignored. A mismatched ZIP/state combination is rejected.
  if (submittedAbbr !== stateAbbr) {
    res.status(400).json({
      error: `ZIP ${zip} is in ${stateName} (${stateAbbr}), not ${submittedAbbr}. Please check your ZIP and state.`,
    });
    return;
  }

  // City + State → lat/lng via the Gazetteer (authoritative geocoder). Only fall
  // back to the ZIP centroid for small towns missing from the Gazetteer, and
  // that ZIP is already validated to be within the submitted state.
  const cityNorm = city.toLowerCase();
  const cityMatch = getCitiesInState(stateAbbr).find(c => c.name.toLowerCase() === cityNorm);
  const loc = cityMatch
    ? { lat: cityMatch.lat, lng: cityMatch.lng }
    : getZipLocation(zip);
  if (!loc) {
    res.status(404).json({ error: `We couldn't locate "${city}, ${stateAbbr}". Try a nearby larger town.` });
    return;
  }

  const result = await getTerritoryForLocation(
    loc.lat, loc.lng, stateAbbr, stateFips, stateName, zip,
  );

  if (result.type === "existing" && result.territory) {
    const t = result.territory as Record<string, any>;
    const counties: string[] = Array.isArray(t.counties) ? t.counties : [];
    res.json({
      type: "existing",
      territory: {
        id: t.id,
        name: t.name,
        status: t.status,
        state: t.state,
        counties,
        countyGeoids: [...getCountyGeoidsByShortNames(stateAbbr, counties)],
        households: t.households ?? 0,
        businessCount: t.businessCount ?? 0,
        centroidLat: t.centroidLat ?? null,
        centroidLng: t.centroidLng ?? null,
      },
    });
    return;
  }

  if (result.type === "proposed" && result.proposals && result.proposals[0]) {
    const p = result.proposals[0];
    const countyGeoids = proposalCountyGeoids(p.hubs);
    const countyShortNames = countyGeoids
      .map(g => getCountyShortNameByGeoid(g))
      .filter((n): n is string => !!n);
    const footprintCountyGeoids = getFootprintCountyGeoids(p.hubs);
    res.json({
      type: "proposed",
      proposal: {
        proposedName: p.proposedName,
        stateAbbr,
        stateFips,
        stateName,
        zipCode: zip,
        countyFips,
        countyName,
        centroidLat: p.centroidLat,
        centroidLng: p.centroidLng,
        households: p.totalHouseholds,
        businessCount: p.totalBusinesses,
        cities: p.topCities,
        countyGeoids,
        countyShortNames,
        footprintCountyGeoids,
        viabilityMessage: p.viabilityMessage,
      },
    });
    return;
  }

  res.json({ type: "unavailable", message: result.message ?? "No viable territory near this location." });
});

// ── GET /api/admin/census/county-score ───────────────────────────────────────
router.get("/admin/census/county-score", requireAdmin, async (req, res): Promise<void> => {
  const { stateFips, countyFips } = req.query as Record<string, string>;
  if (!stateFips || !countyFips) {
    res.status(400).json({ error: "stateFips and countyFips are required" });
    return;
  }
  const [count, cities] = await Promise.all([
    (await import("../lib/censusApi")).getAdReadyBusinessCount(stateFips, countyFips),
    (await import("../lib/censusApi")).getTopCitiesInCounty(stateFips, countyFips),
  ]);
  res.json({ stateFips, countyFips, adReadyBusinessCount: count, topCities: cities });
});

// ─── GET /api/territories/footprints?state=XX ────────────────────────────────
// Returns an array of { id, status, countyFips: string[] } for every territory
// in the given state that has ZIP footprint data. Used by the map to color
// counties from a single batched call rather than per-territory requests.
router.get("/territories/footprints", async (req, res): Promise<void> => {
  const stateAbbr = typeof req.query.state === "string"
    ? req.query.state.toUpperCase().trim()
    : "";
  if (!stateAbbr || stateAbbr.length !== 2) {
    res.status(400).json({ error: "?state=XX required (2-letter abbreviation)" });
    return;
  }

  const rows = await db
    .select({
      territoryId: territoryZipAssignmentsTable.territoryId,
      zip: territoryZipAssignmentsTable.zip,
      status: territoriesTable.status,
    })
    .from(territoryZipAssignmentsTable)
    .innerJoin(
      territoriesTable,
      eq(territoryZipAssignmentsTable.territoryId, territoriesTable.id)
    )
    .where(eq(territoriesTable.state, stateAbbr));

  const byTerritory = new Map<string, { status: string; geoids: Set<string> }>();
  for (const r of rows) {
    let entry = byTerritory.get(r.territoryId);
    if (!entry) {
      entry = { status: r.status, geoids: new Set() };
      byTerritory.set(r.territoryId, entry);
    }
    const geoid = getCountyGeoidFromZip(r.zip);
    if (geoid) entry.geoids.add(geoid);
  }

  const result = [...byTerritory.entries()].map(([id, { status, geoids }]) => ({
    id,
    status,
    countyFips: [...geoids],
  }));

  res.json(result);
});

// ─── GET /api/counties-geojson?stateFips=XX ───────────────────────────────────
// Generic per-state county GeoJSON. Fetches the Plotly counties dataset once
// (shared in-memory promise so concurrent requests don't double-fetch), filters
// to the requested state FIPS prefix, and caches the filtered result per state.
const stateGeoJsonCache = new Map<string, object>();
let _plotlyAllCountiesPromise: Promise<any> | null = null;

function getPlotlyAllCounties(): Promise<any> {
  if (!_plotlyAllCountiesPromise) {
    _plotlyAllCountiesPromise = fetch(
      "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json",
      { signal: AbortSignal.timeout(20000) },
    ).then(r => {
      if (!r.ok) throw new Error(`Upstream ${r.status}`);
      return r.json();
    }).catch(err => {
      _plotlyAllCountiesPromise = null;  // allow retry on next request
      throw err;
    });
  }
  return _plotlyAllCountiesPromise;
}

router.get("/counties-geojson", async (req, res): Promise<void> => {
  const rawFips = typeof req.query.stateFips === "string" ? req.query.stateFips.trim() : "";
  const stateFips = rawFips.padStart(2, "0");
  if (!stateFips || stateFips === "00") {
    res.status(400).json({ error: "stateFips query param required (e.g. ?stateFips=06)" });
    return;
  }
  const cached = stateGeoJsonCache.get(stateFips);
  if (cached) {
    res.json(cached);
    return;
  }
  try {
    const allCounties = await getPlotlyAllCounties();
    const features = allCounties.features.filter((f: any) => f.id && String(f.id).startsWith(stateFips));
    const result = { type: "FeatureCollection", features };
    stateGeoJsonCache.set(stateFips, result);
    req.log.info({ stateFips, featureCount: features.length }, "Cached state county GeoJSON");
    res.json(result);
  } catch (err: any) {
    req.log.error({ err: err?.message }, "Failed to fetch counties GeoJSON");
    res.status(502).json({ error: "Could not load county GeoJSON" });
  }
});

export default router;
