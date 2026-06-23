import { Router, type IRouter } from "express";
import { eq, and, sql as rawSql } from "drizzle-orm";
import { z } from "zod/v4";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db, territoriesTable, dealerTerritoryClaimsTable, territoryZipAssignmentsTable, territoryProposalsTable } from "@workspace/db";
import { ensureDealerLandingPage } from "../lib/dealerLandingPage";
import {
  getTerritoryForLocation,
  buildCityHubProposal,
  findCandidateHubs,
  selectBestHubs,
  selectHubsByCountyFill,
  getFootprintCountyGeoids,
  computeMapDisplayZips,
  computeHubZipFootprint,
  checkZipFootprintConflict,
  findExistingTerritoryWithinMiles,
} from "../lib/territoryBuilder";
import {
  getCountyGeoidsByShortNames,
  getCountyNameByGeoid,
  getCountyShortNameByGeoid,
  getCitiesInState,
  findGazetteerCity,
  getCountyGeoidFromZip,
  getCountyGeoidForLocation,
  getCountyGeoidForCity,
  getZipsNearLocation,
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

  const centCounty = getCountyGeoidForLocation(row.centroidLat, row.centroidLng) ?? "";
  const hubs = selectHubsByCountyFill(candidates, row.centroidLat, row.centroidLng, centCounty);

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

  // When a territory is assigned to a dealer (status → taken, dealerId set),
  // provision the landing page immediately so the admin doesn't need a separate
  // "Rebuild Landing Page" step.
  if (parsed.data.dealerId != null && parsed.data.status === "taken") {
    try {
      const campaignIds = await ensureDealerLandingPage(parsed.data.dealerId);
      req.log.info(
        { territoryId: req.params.id, dealerId: parsed.data.dealerId, campaignIds },
        "ensureDealerLandingPage complete after territory assignment",
      );
    } catch (err: any) {
      req.log.error(
        { err: err?.message, territoryId: req.params.id, dealerId: parsed.data.dealerId },
        "ensureDealerLandingPage failed after territory assignment — admin can use Rebuild button",
      );
    }
  }

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
  city:  z.string().trim().min(1, "City is required").max(120),
  state: z.string().trim().min(2, "Select a state").max(60),
  hubOverrides: z.array(z.object({
    slotIndex: z.number().int().min(0).max(3),
    city: z.string().trim().min(1).max(120),
  })).max(4).optional(),
});

/** State abbreviation → [name, FIPS 2-digit string] */
const STATE_META: Record<string, { stateName: string; stateFips: string }> = {
  AL:{stateName:"Alabama",stateFips:"01"},AK:{stateName:"Alaska",stateFips:"02"},
  AZ:{stateName:"Arizona",stateFips:"04"},AR:{stateName:"Arkansas",stateFips:"05"},
  CA:{stateName:"California",stateFips:"06"},CO:{stateName:"Colorado",stateFips:"08"},
  CT:{stateName:"Connecticut",stateFips:"09"},DE:{stateName:"Delaware",stateFips:"10"},
  DC:{stateName:"District of Columbia",stateFips:"11"},FL:{stateName:"Florida",stateFips:"12"},
  GA:{stateName:"Georgia",stateFips:"13"},HI:{stateName:"Hawaii",stateFips:"15"},
  ID:{stateName:"Idaho",stateFips:"16"},IL:{stateName:"Illinois",stateFips:"17"},
  IN:{stateName:"Indiana",stateFips:"18"},IA:{stateName:"Iowa",stateFips:"19"},
  KS:{stateName:"Kansas",stateFips:"20"},KY:{stateName:"Kentucky",stateFips:"21"},
  LA:{stateName:"Louisiana",stateFips:"22"},ME:{stateName:"Maine",stateFips:"23"},
  MD:{stateName:"Maryland",stateFips:"24"},MA:{stateName:"Massachusetts",stateFips:"25"},
  MI:{stateName:"Michigan",stateFips:"26"},MN:{stateName:"Minnesota",stateFips:"27"},
  MS:{stateName:"Mississippi",stateFips:"28"},MO:{stateName:"Missouri",stateFips:"29"},
  MT:{stateName:"Montana",stateFips:"30"},NE:{stateName:"Nebraska",stateFips:"31"},
  NV:{stateName:"Nevada",stateFips:"32"},NH:{stateName:"New Hampshire",stateFips:"33"},
  NJ:{stateName:"New Jersey",stateFips:"34"},NM:{stateName:"New Mexico",stateFips:"35"},
  NY:{stateName:"New York",stateFips:"36"},NC:{stateName:"North Carolina",stateFips:"37"},
  ND:{stateName:"North Dakota",stateFips:"38"},OH:{stateName:"Ohio",stateFips:"39"},
  OK:{stateName:"Oklahoma",stateFips:"40"},OR:{stateName:"Oregon",stateFips:"41"},
  PA:{stateName:"Pennsylvania",stateFips:"42"},RI:{stateName:"Rhode Island",stateFips:"44"},
  SC:{stateName:"South Carolina",stateFips:"45"},SD:{stateName:"South Dakota",stateFips:"46"},
  TN:{stateName:"Tennessee",stateFips:"47"},TX:{stateName:"Texas",stateFips:"48"},
  UT:{stateName:"Utah",stateFips:"49"},VT:{stateName:"Vermont",stateFips:"50"},
  VA:{stateName:"Virginia",stateFips:"51"},WA:{stateName:"Washington",stateFips:"53"},
  WV:{stateName:"West Virginia",stateFips:"54"},WI:{stateName:"Wisconsin",stateFips:"55"},
  WY:{stateName:"Wyoming",stateFips:"56"},
};


// ── POST /api/territories/propose (public, rate-limited) ─────────────────────
// Unified resolver for all 50 states. Accepts { city, state } where state may
// be a 2-letter abbreviation ("GA") or full name ("Georgia"). Returns one of:
// an existing territory within 25mi, a fresh in-memory proposal (NOT saved to
// the DB — persisted only when the dealer claims), or unavailable.
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
  const { city, state, hubOverrides: hubOverridesInput } = parsed.data;

  // Accept both 2-letter abbreviations ("GA") and full names ("Georgia").
  const stateInput = state.trim();
  let stateAbbr = stateInput.toUpperCase();
  if (stateInput.length > 2) {
    // Reverse-lookup: find the abbreviation whose stateName matches case-insensitively.
    const stateNameLower = stateInput.toLowerCase();
    const match = Object.entries(STATE_META).find(
      ([, v]) => v.stateName.toLowerCase() === stateNameLower
    );
    if (match) stateAbbr = match[0];
  }

  // Resolve stateFips and stateName from the (now-normalized) 2-letter abbreviation.
  const stateMeta = STATE_META[stateAbbr];
  if (!stateMeta) {
    res.status(400).json({ error: "Unrecognized state. Please provide a valid US state name or 2-letter abbreviation." });
    return;
  }
  const { stateFips, stateName } = stateMeta;

  // City + State → lat/lng via the Gazetteer (authoritative geocoder).
  // No ZIP fallback — if the city is not in the Gazetteer, ask for a nearby larger town.
  const cityMatch = findGazetteerCity(city, stateAbbr);
  if (!cityMatch) {
    res.status(404).json({ error: `We couldn't locate "${city}, ${stateAbbr}". Try a nearby larger town.` });
    return;
  }
  const loc = { lat: cityMatch.lat, lng: cityMatch.lng };

  const result = await getTerritoryForLocation(
    loc.lat, loc.lng, stateAbbr, stateFips, stateName, undefined, city, stateAbbr,
  );

  // When the searched city falls inside an existing territory, capture it so we
  // can surface a "nearby taken" warning in the proposal card — but still
  // generate a full proposal so the dealer always sees editable mailing areas.
  let nearbyExisting: { id: string; name: string; status: string } | null = null;
  let proposalSource = result.type === "proposed" && result.proposals?.[0]
    ? result.proposals[0]
    : null;

  if (result.type === "existing" && result.territory) {
    const t = result.territory as Record<string, any>;
    nearbyExisting = { id: t.id, name: t.name, status: t.status };
    // Generate a fresh proposal (hubs are auto-adjusted away from the claimed area).
    const freshProposal = await buildCityHubProposal(
      loc.lat, loc.lng, stateAbbr, stateFips, stateName, city, stateAbbr,
    );
    if (freshProposal.isViable) {
      proposalSource = freshProposal;
    }
  }

  if (proposalSource) {
    const p = proposalSource;

    // Working copies — may be mutated by hubOverrides below.
    // Use the county GEOIDs resolved by buildCityHubProposal from getCountyTerritoryHubs —
    // these cover ALL counties in the territory (e.g. Union + Towns for Blairsville GA).
    let hubs = [...p.hubs];
    let topCities = [...p.topCities];
    let countyGeoids = p.countyGeoids;
    let centroidLat = p.centroidLat;
    let centroidLng = p.centroidLng;
    let totalHouseholds = p.totalHouseholds;

    // ── Hub override processing ────────────────────────────────────────────────
    const overrides = hubOverridesInput ?? [];
    if (overrides.length > 0) {
      // Step 1: resolve each override city via the Gazetteer; fail fast on any miss.
      for (const ov of overrides) {
        const ovCity = ov.city.trim();
        const ovMatch = findGazetteerCity(ovCity, stateAbbr);
        if (!ovMatch) {
          res.status(422).json({
            error: `City not found: "${ovCity}" in ${stateAbbr}. Try a nearby larger town.`,
            city: ovCity,
          });
          return;
        }

        const idx = ov.slotIndex;

        // Replace the display hub at this slot with the resolved override city.
        if (idx >= 0 && idx < hubs.length) {
          const nearbyZips = getZipsNearLocation(ovMatch.lat, ovMatch.lng, 15);
          const approxHH = Math.min(
            nearbyZips.reduce((s, z) => s + z.households, 0),
            25000,
          );
          hubs[idx] = {
            ...hubs[idx],
            cityName: ovCity,
            lat: ovMatch.lat,
            lng: ovMatch.lng,
            catchmentHouseholds: approxHH,
          };
        }

        // Mirror into topCities (the text list that becomes proposal.cities in the response).
        if (idx >= 0 && idx < topCities.length) {
          topCities[idx] = ovCity;
        }
      }

      // Step 2: recompute derived values from the merged hub set.
      countyGeoids = getFootprintCountyGeoids(hubs);
      totalHouseholds = hubs.reduce((s, h) => s + h.catchmentHouseholds, 0);
      if (hubs.length > 0) {
        centroidLat = hubs.reduce((s, h) => s + h.lat, 0) / hubs.length;
        centroidLng = hubs.reduce((s, h) => s + h.lng, 0) / hubs.length;
      }

    }

    const countyShortNames = countyGeoids
      .map(g => getCountyShortNameByGeoid(g))
      .filter((n): n is string => !!n);
    const footprintCountyGeoids = getFootprintCountyGeoids(hubs);
    const stateCities = getCitiesInState(stateAbbr);
    const proposalZips = computeMapDisplayZips(hubs, stateCities, stateAbbr, countyGeoids);
    res.json({
      type: "proposed",
      nearbyExisting,
      proposal: {
        proposedName: p.proposedName,
        stateAbbr,
        stateFips,
        stateName,
        zipCode: null,
        countyFips: null,
        countyName: null,
        centroidLat,
        centroidLng,
        households: totalHouseholds,
        businessCount: p.totalBusinesses,
        cities: topCities,
        countyGeoids,
        countyShortNames,
        footprintCountyGeoids,
        proposalZips,
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

// ─── POST /api/admin/territories/custom ───────────────────────────────────────
// Admin-only: preview or create a territory from up to 4 named cities (any counties).
// Body: { name, state, cities: string[], preview?: boolean }
// When preview=true (or omitted), returns derived data + conflict check without DB writes.
// When preview=false and no conflicts, inserts the territory + ZIP assignments.

const CustomTerritorySchema = z.object({
  name:    z.string().min(1).max(200),
  state:   z.string().length(2),
  cities:  z.array(z.string().trim().min(1)).min(2).max(4),
  preview: z.boolean().optional(),
});

const CUSTOM_CONFLICT_RADIUS_MI = 15;

router.post("/admin/territories/custom", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CustomTerritorySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { name, state, cities, preview = false } = parsed.data;
  const stateAbbr = state.toUpperCase();

  // 1. Resolve each city via Gazetteer
  const resolved: Array<{ cityName: string; lat: number; lng: number }> = [];
  const failedCities: string[] = [];
  for (const cityInput of cities) {
    const match = findGazetteerCity(cityInput.trim(), stateAbbr);
    if (!match) {
      failedCities.push(cityInput.trim());
    } else {
      resolved.push({ cityName: cityInput.trim(), lat: match.lat, lng: match.lng });
    }
  }
  if (failedCities.length > 0) {
    res.status(404).json({
      error: `Could not locate the following cities in ${stateAbbr}: ${failedCities.join(", ")}. Try a nearby larger town.`,
      failedCities,
    });
    return;
  }

  // 2. Combined centroid (simple average)
  const centroidLat = resolved.reduce((s, c) => s + c.lat, 0) / resolved.length;
  const centroidLng = resolved.reduce((s, c) => s + c.lng, 0) / resolved.length;

  // 3. ZIP footprint — union of all cities' 15-mile radii, nearest-hub assignment
  const footprintZips = computeHubZipFootprint(resolved);

  // 4. Total households — union of unique ZIPs from each city's 15-mile ring
  const zipHHMap = new Map<string, number>();
  for (const city of resolved) {
    for (const z of getZipsNearLocation(city.lat, city.lng, 15)) {
      if (!zipHHMap.has(z.zip)) zipHHMap.set(z.zip, z.households);
    }
  }
  const totalHouseholds = [...zipHHMap.values()].reduce((s, v) => s + v, 0);

  // 5. Derive counties from each city's lat/lng.
  // Use getCountyGeoidForCity so border-city overrides (e.g. Ball Ground → Cherokee)
  // are applied before falling back to the nearest-ZIP-centroid heuristic.
  const countySet   = new Set<string>();
  const countyNames: string[] = [];
  for (const city of resolved) {
    const geoid = getCountyGeoidForCity(city.cityName, stateAbbr, city.lat, city.lng);
    if (geoid) {
      const shortName = getCountyShortNameByGeoid(geoid);
      if (shortName && !countySet.has(shortName)) {
        countySet.add(shortName);
        countyNames.push(shortName);
      }
    }
  }

  // 6. Conflict check
  type ConflictEntry = { source: string; territoryId: string; territoryName: string; territoryStatus: string };
  const conflicts: ConflictEntry[] = [];

  // a) ZIP footprint overlap with TAKEN territories
  const zipConflictId = await checkZipFootprintConflict(resolved);
  if (zipConflictId) {
    const [cTerr] = await db
      .select({ id: territoriesTable.id, name: territoriesTable.name, status: territoriesTable.status })
      .from(territoriesTable)
      .where(eq(territoriesTable.id, zipConflictId));
    if (cTerr) {
      conflicts.push({
        source: "ZIP footprint overlap",
        territoryId: cTerr.id,
        territoryName: cTerr.name,
        territoryStatus: cTerr.status,
      });
    }
  }

  // b) Proximity + county check per city (all non-proposed statuses)
  for (const city of resolved) {
    const nearby = await findExistingTerritoryWithinMiles(
      city.lat, city.lng, stateAbbr, CUSTOM_CONFLICT_RADIUS_MI,
      { statuses: ["pending", "taken"] },
    );
    if (!nearby) continue;
    const nearbyId = nearby.id as string;
    if (conflicts.find(c => c.territoryId === nearbyId)) continue; // already reported

    // County-guard: only flag when the city shares a county with the existing territory
    const nearbyCounties: string[] = Array.isArray(nearby.counties)
      ? (nearby.counties as string[])
      : [];
    let isConflict: boolean;
    if (nearbyCounties.length === 0) {
      isConflict = true; // legacy territory without county list — conservative
    } else {
      const cityGeoid   = getCountyGeoidForLocation(city.lat, city.lng);
      const cityShort   = cityGeoid ? (getCountyShortNameByGeoid(cityGeoid) ?? "") : "";
      isConflict = cityShort.length > 0 &&
        nearbyCounties.some(c => c.toLowerCase() === cityShort.toLowerCase());
    }

    if (isConflict) {
      conflicts.push({
        source: `city "${city.cityName}"`,
        territoryId: nearbyId,
        territoryName: nearby.name as string,
        territoryStatus: nearby.status as string,
      });
    }
  }

  const previewData = {
    resolvedCities: resolved.map(c => ({ name: c.cityName, lat: c.lat, lng: c.lng })),
    centroidLat,
    centroidLng,
    counties: countyNames,
    totalZips: footprintZips.length,
    totalHouseholds,
    conflicts,
    hasConflicts: conflicts.length > 0,
  };

  if (preview !== false) {
    res.json(previewData);
    return;
  }

  // 7. CREATE — reject if conflicts exist
  if (conflicts.length > 0) {
    res.status(409).json({ error: "Cannot create territory: conflicts detected", conflicts });
    return;
  }

  // Generate next sequential ID inside a transaction so concurrent inserts don't collide
  const [created] = await db.transaction(async (tx) => {
    const existingRows = await tx
      .select({ id: territoriesTable.id })
      .from(territoriesTable)
      .where(eq(territoriesTable.state, stateAbbr));
    const nums = existingRows
      .map(r => parseInt(r.id.replace(`${stateAbbr}-`, ""), 10))
      .filter(n => !isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    const id   = `${stateAbbr}-${String(next).padStart(3, "0")}`;

    const rows = await tx.insert(territoriesTable).values({
      id,
      name,
      state:       stateAbbr,
      counties:    countyNames,
      households:  totalHouseholds,
      zones:       4,
      status:      "available",
      zoneNote:    resolved.map(c => c.cityName).join(", "),
      centroidLat,
      centroidLng,
      source:      "manual",
    }).returning();

    // Write ZIP footprint
    const CHUNK = 200;
    for (let i = 0; i < footprintZips.length; i += CHUNK) {
      const chunk = footprintZips.slice(i, i + CHUNK);
      await tx.insert(territoryZipAssignmentsTable)
        .values(chunk.map(({ zip }) => ({ zip, territoryId: id })))
        .onConflictDoNothing();
    }

    return rows;
  });

  req.log.info({ id: created.id, name, cities: resolved.map(c => c.cityName) }, "Admin custom territory created");
  res.status(201).json({ ...previewData, territoryId: created.id, territory: created });
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

// ─── GET /api/zip-geojson?state=GA&zips=30022,30076,... ──────────────────────
// Returns a GeoJSON FeatureCollection of ZIP code polygons for the requested
// ZIPs in the given state.  Only states that have a <state>-zips.geojson file
// in src/data/ are supported — returns 404 otherwise.  Used by the territory
// finder map to highlight proposed territory footprints at ZIP resolution
// instead of drawing an entire county polygon.
const _zipGeoCache = new Map<string, any>();

router.get("/zip-geojson", async (req, res): Promise<void> => {
  const stateParam = typeof req.query.state === "string"
    ? req.query.state.toUpperCase().trim()
    : "";
  const zipsParam = typeof req.query.zips === "string" ? req.query.zips : "";

  if (!stateParam || !zipsParam) {
    res.status(400).json({ error: "state and zips query params are required" });
    return;
  }

  // Load and cache the state ZIP GeoJSON file
  if (!_zipGeoCache.has(stateParam)) {
    const dataDir = process.env.NODE_ENV === "production"
      ? path.join(_dirname, "data")
      : path.join(_dirname, "../data");
    const filePath = path.join(dataDir, `${stateParam.toLowerCase()}-zips.geojson`);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: `No ZIP boundary data for state: ${stateParam}` });
      return;
    }
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      _zipGeoCache.set(stateParam, JSON.parse(raw));
    } catch (err) {
      req.log.error({ err, stateParam }, "Failed to load ZIP GeoJSON file");
      res.status(500).json({ error: "Failed to load ZIP boundary data" });
      return;
    }
  }

  const geoJson = _zipGeoCache.get(stateParam);
  const requestedZips = new Set(zipsParam.split(",").map(z => z.trim()).filter(Boolean));

  const features = (geoJson?.features ?? []).filter((f: any) => {
    const zip = f?.properties?.ZCTA5CE10;
    return zip && requestedZips.has(zip);
  });

  res.json({ type: "FeatureCollection", features });
});

export default router;
