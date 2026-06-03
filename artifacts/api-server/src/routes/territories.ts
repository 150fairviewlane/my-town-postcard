import { Router, type IRouter } from "express";
import { eq, and, sql as rawSql } from "drizzle-orm";
import { z } from "zod/v4";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db, territoriesTable, dealerTerritoryClaimsTable, territoryZipAssignmentsTable, territoryProposalsTable } from "@workspace/db";
import {
  getTerritoryForZip,
  approveTerritory,
  rejectTerritory,
  findCandidateHubs,
  selectBestHubs,
} from "../lib/territoryBuilder";
import { getCountyGeoidsByShortNames, getCountyNameByGeoid } from "../lib/censusApi";

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

// ─── Seed Data ────────────────────────────────────────────────────────────────
type TerritoryStatus = "available" | "pending" | "taken";
interface SeedRow {
  id: string; name: string; state: string; counties: string[];
  zoneNote: string; households: number; status: TerritoryStatus;
}

// 95-territory production dataset — all 159 Georgia counties.
// Canonical source of truth; also mirrored in scripts/src/georgia-territories-seed.ts.
const GA_SEED: SeedRow[] = [
  // ── TIER 1 — METRO ATLANTA CITY CLUSTERS ─────────────────────────────────────
  // Metro ZIPs are assigned via the explicit curated map in seed-zip-assignments.ts
  // (county-centroid logic cannot split a single county across these sub-territories).
  { id:"GA-001", name:"Alpharetta / Milton / Roswell",        state:"GA", counties:["Fulton"],          zoneNote:"Alpharetta, Milton, Roswell, Johns Creek, Mountain Park",        households:95000, status:"available" },
  { id:"GA-002", name:"Sandy Springs / Buckhead / Dunwoody",  state:"GA", counties:["Fulton","DeKalb"],  zoneNote:"Sandy Springs, Buckhead, Dunwoody, Brookhaven, Chamblee",        households:92000, status:"available" },
  { id:"GA-003", name:"Atlanta / Midtown / Inman Park",       state:"GA", counties:["Fulton","DeKalb"],  zoneNote:"Atlanta city core, Midtown, Inman Park, Grant Park, Va-Highland", households:88000, status:"available" },
  { id:"GA-004", name:"Duluth / Peachtree Corners / Norcross", state:"GA", counties:["Gwinnett"],        zoneNote:"Duluth, Peachtree Corners, Norcross, Berkeley Lake",             households:88000, status:"available" },
  { id:"GA-005", name:"Lawrenceville / Snellville / Lilburn", state:"GA", counties:["Gwinnett"],         zoneNote:"Lawrenceville, Snellville, Lilburn, Grayson",                    households:95000, status:"available" },
  { id:"GA-006", name:"Buford / Sugar Hill / Braselton",      state:"GA", counties:["Gwinnett"],         zoneNote:"Buford, Sugar Hill, Dacula, Braselton, Loganville",              households:86000, status:"available" },
  { id:"GA-007", name:"Marietta / Kennesaw / Acworth",        state:"GA", counties:["Cobb"],             zoneNote:"Marietta, Kennesaw, Acworth, Powder Springs area",               households:92000, status:"available" },
  { id:"GA-008", name:"Smyrna / Mableton / Powder Springs",   state:"GA", counties:["Cobb"],             zoneNote:"Smyrna, Mableton, Powder Springs, Austell, Vinings",             households:88000, status:"available" },
  { id:"GA-009", name:"Decatur / Tucker / Clarkston",         state:"GA", counties:["DeKalb"],           zoneNote:"Decatur, Tucker, Clarkston, Avondale Estates, Pine Lake",        households:82000, status:"available" },
  { id:"GA-010", name:"Stonecrest / Lithonia / South DeKalb", state:"GA", counties:["DeKalb"],           zoneNote:"Stonecrest, Lithonia, South DeKalb, East Atlanta",               households:78000, status:"available" },
  // ── TIER 2 — SINGLE COUNTY (Atlanta suburbs) ─────────────────────────────────
  { id:"GA-011", name:"Cherokee County",               state:"GA", counties:["Cherokee"],                            zoneNote:"Canton, Ball Ground, Holly Springs, Woodstock",         households:105000, status:"available" },
  { id:"GA-012", name:"Forsyth County",                state:"GA", counties:["Forsyth"],                             zoneNote:"Cumming, South Forsyth",                                households:100000, status:"available" },
  { id:"GA-013", name:"Henry County",                  state:"GA", counties:["Henry"],                               zoneNote:"McDonough, Stockbridge, Hampton, Locust Grove",         households:95000,  status:"available" },
  { id:"GA-014", name:"Clayton County",                state:"GA", counties:["Clayton"],                             zoneNote:"Jonesboro, Riverdale, Forest Park, College Park",       households:105000, status:"available" },
  { id:"GA-015", name:"Paulding County",               state:"GA", counties:["Paulding"],                            zoneNote:"Dallas, Hiram, Powder Springs area",                    households:58000,  status:"available" },
  { id:"GA-016", name:"Douglas County",                state:"GA", counties:["Douglas"],                             zoneNote:"Douglasville, Lithia Springs, Villa Rica area",         households:50000,  status:"available" },
  { id:"GA-017", name:"Coweta County",                 state:"GA", counties:["Coweta"],                              zoneNote:"Newnan, Senoia, Sharpsburg",                            households:55000,  status:"available" },
  { id:"GA-018", name:"Fayette County",                state:"GA", counties:["Fayette"],                             zoneNote:"Fayetteville, Peachtree City, Tyrone, Brooks",          households:48000,  status:"available" },
  { id:"GA-019", name:"Carroll County",                state:"GA", counties:["Carroll"],                             zoneNote:"Carrollton, Villa Rica, Whitesburg, Temple",            households:45000,  status:"available" },
  { id:"GA-020", name:"Barrow County",                 state:"GA", counties:["Barrow"],                              zoneNote:"Winder, Auburn, Bethlehem, Carl",                       households:32000,  status:"available" },
  { id:"GA-021", name:"Rockdale County",               state:"GA", counties:["Rockdale"],                            zoneNote:"Conyers, Milstead",                                     households:34000,  status:"available" },
  { id:"GA-022", name:"Newton County",                 state:"GA", counties:["Newton"],                              zoneNote:"Covington, Oxford, Mansfield, Porterdale",              households:40000,  status:"available" },
  { id:"GA-023", name:"Walton County",                 state:"GA", counties:["Walton"],                              zoneNote:"Monroe, Social Circle, Loganville, Good Hope",          households:38000,  status:"available" },
  { id:"GA-024", name:"Spalding County",               state:"GA", counties:["Spalding"],                            zoneNote:"Griffin, Orchard Hill, Sunny Side",                     households:28000,  status:"available" },
  { id:"GA-025", name:"Jackson County",                state:"GA", counties:["Jackson"],                             zoneNote:"Jefferson, Commerce, Braselton, Hoschton",              households:42000,  status:"available" },
  // ── TIER 2 — SINGLE COUNTY (North Georgia) ───────────────────────────────────
  { id:"GA-026", name:"Hall County",                   state:"GA", counties:["Hall"],                                zoneNote:"Gainesville, Flowery Branch, Oakwood, Buford area",    households:82000,  status:"available" },
  { id:"GA-027", name:"Whitfield County",              state:"GA", counties:["Whitfield"],                           zoneNote:"Dalton, Tunnel Hill, Cohutta, Varnell",                 households:38000,  status:"available" },
  { id:"GA-028", name:"Bartow County",                 state:"GA", counties:["Bartow"],                              zoneNote:"Cartersville, Adairsville, Emerson, Euharlee",          households:42000,  status:"available" },
  { id:"GA-029", name:"Floyd County",                  state:"GA", counties:["Floyd"],                               zoneNote:"Rome, Cave Spring, Armuchee, Shannon",                  households:38000,  status:"available" },
  { id:"GA-030", name:"Catoosa County",                state:"GA", counties:["Catoosa"],                             zoneNote:"Ringgold, Fort Oglethorpe, Tunnel Hill area",           households:25000,  status:"available" },
  { id:"GA-031", name:"Walker / Dade / Chattooga Counties",        state:"GA", counties:["Walker","Dade","Chattooga"],                       zoneNote:"LaFayette, Rock Spring, Chickamauga, Trenton, Summerville",          households:30000,  status:"available" },
  { id:"GA-032", name:"Gordon County",                 state:"GA", counties:["Gordon"],                              zoneNote:"Calhoun, Resaca, Fairmount, Plainville",                households:26000,  status:"available" },
  { id:"GA-033", name:"Clarke County",                 state:"GA", counties:["Clarke"],                              zoneNote:"Athens, Winterville, Bogart",                           households:48000,  status:"available" },
  // ── TIER 2 — SINGLE COUNTY (Other major cities) ──────────────────────────────
  { id:"GA-034", name:"Chatham County",                state:"GA", counties:["Chatham"],                             zoneNote:"Savannah, Pooler, Garden City, Port Wentworth",        households:108000, status:"available" },
  { id:"GA-035", name:"Richmond County",               state:"GA", counties:["Richmond"],                            zoneNote:"Augusta, Hephzibah, Blythe",                            households:75000,  status:"available" },
  { id:"GA-036", name:"Muscogee County",               state:"GA", counties:["Muscogee"],                            zoneNote:"Columbus, Midland, Upatoi",                             households:72000,  status:"available" },
  { id:"GA-037", name:"Bibb County",                   state:"GA", counties:["Bibb"],                                zoneNote:"Macon, Lizella, Payne City",                            households:55000,  status:"available" },
  { id:"GA-038", name:"Houston County",                state:"GA", counties:["Houston"],                             zoneNote:"Warner Robins, Perry, Centerville, Byron",              households:60000,  status:"available" },
  { id:"GA-039", name:"Columbia County",               state:"GA", counties:["Columbia"],                            zoneNote:"Evans, Grovetown, Harlem, Martinez",                    households:55000,  status:"available" },
  { id:"GA-040", name:"Lowndes County",                state:"GA", counties:["Lowndes"],                             zoneNote:"Valdosta, Hahira, Lake Park, Remerton",                 households:45000,  status:"available" },
  { id:"GA-041", name:"Bulloch County",                state:"GA", counties:["Bulloch"],                             zoneNote:"Statesboro, Brooklet, Portal, Register",                households:32000,  status:"available" },
  { id:"GA-042", name:"Effingham County",              state:"GA", counties:["Effingham"],                           zoneNote:"Springfield, Guyton, Rincon, Pooler area",              households:30000,  status:"available" },
  { id:"GA-043", name:"Glynn County",                  state:"GA", counties:["Glynn"],                               zoneNote:"Brunswick, St. Simons Island, Jekyll Island",           households:48000,  status:"available" },
  { id:"GA-044", name:"Tift County",                   state:"GA", counties:["Tift"],                                zoneNote:"Tifton, Omega, Ty Ty",                                  households:28000,  status:"available" },
  { id:"GA-045", name:"Coffee County",                 state:"GA", counties:["Coffee"],                              zoneNote:"Douglas, Nicholls, Broxton, Ambrose",                   households:34000,  status:"available" },
  { id:"GA-046", name:"Troup County",                  state:"GA", counties:["Troup"],                               zoneNote:"LaGrange, West Point, Hogansville",                     households:28000,  status:"available" },
  // ── TIER 3 — COMBINED COUNTIES (NE Georgia Mountains) ────────────────────────
  { id:"GA-047", name:"Habersham / Stephens Counties",       state:"GA", counties:["Habersham","Stephens"],          zoneNote:"Clarkesville, Cornelia, Demorest, Toccoa, Baldwin",     households:30000, status:"available" },
  { id:"GA-048", name:"Franklin / Hart Counties",            state:"GA", counties:["Franklin","Hart"],               zoneNote:"Carnesville, Hartwell, Canon, Royston, Bowersville",    households:22000, status:"available" },
  { id:"GA-049", name:"Rabun / Towns / Union Counties",      state:"GA", counties:["Rabun","Towns","Union"],         zoneNote:"Clayton, Hiawassee, Blairsville",                       households:22000, status:"available" },
  { id:"GA-050", name:"Fannin / Gilmer Counties",            state:"GA", counties:["Fannin","Gilmer"],               zoneNote:"Blue Ridge, Ellijay",                                   households:28000, status:"available" },
  { id:"GA-051", name:"Pickens / Dawson Counties",           state:"GA", counties:["Pickens","Dawson"],              zoneNote:"Jasper, Dawsonville",                                   households:24000, status:"available" },
  { id:"GA-052", name:"Lumpkin / White Counties",            state:"GA", counties:["Lumpkin","White"],               zoneNote:"Dahlonega, Cleveland, Helen, Turnersville, Auraria",    households:22000, status:"available" },
  { id:"GA-053", name:"Murray County",                       state:"GA", counties:["Murray"],                        zoneNote:"Chatsworth, Eton, Crandall, Cisco",                     households:18000, status:"available" },
  { id:"GA-054", name:"Haralson / Polk Counties",            state:"GA", counties:["Haralson","Polk"],               zoneNote:"Buchanan, Bremen, Cedartown, Rockmart",                 households:26000, status:"available" },
  // ── TIER 3 — COMBINED COUNTIES (Northeast Georgia) ───────────────────────────
  { id:"GA-055", name:"Oglethorpe / Elbert Counties",        state:"GA", counties:["Oglethorpe","Elbert"],           zoneNote:"Lexington, Elberton, Crawford, Bowman",                 households:20000, status:"available" },
  { id:"GA-056", name:"Banks / Madison Counties",            state:"GA", counties:["Banks","Madison"],               zoneNote:"Homer, Danielsville, Maysville, Commerce area",         households:20000, status:"available" },
  { id:"GA-057", name:"Oconee / Greene Counties",            state:"GA", counties:["Oconee","Greene"],               zoneNote:"Watkinsville, Greensboro, Union Point",                 households:30000, status:"available" },
  { id:"GA-058", name:"Morgan / Putnam Counties",            state:"GA", counties:["Morgan","Putnam"],               zoneNote:"Madison, Eatonton",                                     households:22000, status:"available" },
  { id:"GA-059", name:"Jasper / Jones Counties",             state:"GA", counties:["Jasper","Jones"],                zoneNote:"Monticello, Gray, Juliette",                            households:20000, status:"available" },
  { id:"GA-060", name:"McDuffie / Warren / Jefferson",       state:"GA", counties:["McDuffie","Warren","Jefferson"], zoneNote:"Thomson, Warrenton, Louisville",                        households:24000, status:"available" },
  { id:"GA-061", name:"Wilkes / Lincoln / Taliaferro / Glascock", state:"GA", counties:["Wilkes","Lincoln","Taliaferro","Glascock"], zoneNote:"Washington, Lincolnton, Crawfordville, Gibson", households:18000, status:"available" },
  // ── TIER 3 — COMBINED COUNTIES (Atlanta south / west) ────────────────────────
  { id:"GA-062", name:"Pike / Lamar / Upson Counties",       state:"GA", counties:["Pike","Lamar","Upson"],          zoneNote:"Zebulon, Barnesville, Thomaston",                       households:28000, status:"available" },
  { id:"GA-063", name:"Monroe / Butts Counties",             state:"GA", counties:["Monroe","Butts"],                zoneNote:"Forsyth, Jackson",                                      households:26000, status:"available" },
  { id:"GA-064", name:"Harris County",                       state:"GA", counties:["Harris"],                        zoneNote:"Hamilton, Pine Mountain, Waverly Hall",                 households:20000, status:"available" },
  { id:"GA-065", name:"Heard / Meriwether / Talbot Counties",state:"GA", counties:["Heard","Meriwether","Talbot"],   zoneNote:"Franklin, Greenville, Warm Springs, Talbotton",         households:20000, status:"available" },
  // ── TIER 3 — COMBINED COUNTIES (Coastal Georgia) ─────────────────────────────
  { id:"GA-066", name:"Bryan / Liberty Counties",            state:"GA", counties:["Bryan","Liberty"],               zoneNote:"Richmond Hill, Pemberton, Hinesville, Midway",          households:42000, status:"available" },
  { id:"GA-067", name:"Camden County",                       state:"GA", counties:["Camden"],                        zoneNote:"Kingsland, St. Marys, Woodbine",                        households:24000, status:"available" },
  { id:"GA-068", name:"Long / McIntosh / Charlton Counties", state:"GA", counties:["Long","McIntosh","Charlton"],    zoneNote:"Ludowici, Darien, Folkston",                            households:20000, status:"available" },
  // ── TIER 3 — COMBINED COUNTIES (Central Georgia) ─────────────────────────────
  { id:"GA-069", name:"Peach / Crawford Counties",           state:"GA", counties:["Peach","Crawford"],              zoneNote:"Fort Valley, Roberta, Byron area",                      households:22000, status:"available" },
  { id:"GA-070", name:"Baldwin / Johnson / Washington / Hancock", state:"GA", counties:["Baldwin","Johnson","Washington","Hancock"], zoneNote:"Milledgeville, Wrightsville, Sandersville, Sparta", households:36000, status:"available" },
  { id:"GA-071", name:"Twiggs / Bleckley / Laurens Counties",state:"GA", counties:["Twiggs","Bleckley","Laurens"],  zoneNote:"Jeffersonville, Cochran, Dublin",                       households:28000, status:"available" },
  { id:"GA-072", name:"Dooly / Crisp Counties",              state:"GA", counties:["Dooly","Crisp"],                 zoneNote:"Vienna, Cordele",                                       households:22000, status:"available" },
  { id:"GA-073", name:"Dodge / Montgomery / Telfair Counties",state:"GA", counties:["Dodge","Montgomery","Telfair"],zoneNote:"Eastman, Mount Vernon, McRae-Helena",                   households:22000, status:"available" },
  { id:"GA-074", name:"Wheeler / Treutlen / Toombs Counties",state:"GA", counties:["Wheeler","Treutlen","Toombs"],  zoneNote:"Alamo, Soperton, Lyons, Vidalia",                       households:22000, status:"available" },
  { id:"GA-075", name:"Wilcox / Pulaski / Wilkinson Counties",state:"GA", counties:["Wilcox","Pulaski","Wilkinson"],zoneNote:"Rochelle, Hawkinsville, Irwinton",                      households:20000, status:"available" },
  { id:"GA-076", name:"Macon / Taylor / Marion Counties",    state:"GA", counties:["Macon","Taylor","Marion"],        zoneNote:"Oglethorpe, Butler, Buena Vista, Ideal",               households:16000, status:"available" },
  // ── TIER 3 — COMBINED COUNTIES (Southwest Georgia) ───────────────────────────
  { id:"GA-077", name:"Baker / Dougherty Counties",          state:"GA", counties:["Baker","Dougherty"],             zoneNote:"Albany, Newton, Leesburg",                              households:37000, status:"available" },
  { id:"GA-078", name:"Sumter / Schley Counties",            state:"GA", counties:["Sumter","Schley"],               zoneNote:"Americus, Ellaville",                                   households:24000, status:"available" },
  { id:"GA-079", name:"Terrell / Lee Counties",              state:"GA", counties:["Terrell","Lee"],                  zoneNote:"Dawson, Leesburg, Smithville",                          households:20000, status:"available" },
  { id:"GA-080", name:"Randolph / Calhoun / Clay / Quitman", state:"GA", counties:["Randolph","Calhoun","Clay","Quitman"], zoneNote:"Cuthbert, Morgan, Fort Gaines, Georgetown",       households:14000, status:"available" },
  { id:"GA-081", name:"Stewart / Webster / Chattahoochee",   state:"GA", counties:["Stewart","Webster","Chattahoochee"], zoneNote:"Lumpkin, Preston, Cusseta",                       households:12000, status:"available" },
  { id:"GA-082", name:"Early / Seminole / Miller Counties",  state:"GA", counties:["Early","Seminole","Miller"],     zoneNote:"Blakely, Donalsonville, Colquitt",                      households:22000, status:"available" },
  { id:"GA-083", name:"Decatur County",                      state:"GA", counties:["Decatur"],                        zoneNote:"Bainbridge, Attapulgus, Climax",                        households:22000, status:"available" },
  { id:"GA-084", name:"Mitchell / Colquitt Counties",        state:"GA", counties:["Mitchell","Colquitt"],            zoneNote:"Camilla, Moultrie, Berlin",                             households:34000, status:"available" },
  { id:"GA-085", name:"Worth / Turner Counties",             state:"GA", counties:["Worth","Turner"],                 zoneNote:"Sylvester, Ashburn, Isabella",                          households:22000, status:"available" },
  { id:"GA-086", name:"Thomas / Brooks / Grady Counties",    state:"GA", counties:["Thomas","Brooks","Grady"],        zoneNote:"Thomasville, Quitman, Cairo",                           households:46000, status:"available" },
  // ── TIER 3 — COMBINED COUNTIES (South Central / Southeast Georgia) ───────────
  { id:"GA-087", name:"Ben Hill / Irwin / Berrien Counties", state:"GA", counties:["Ben Hill","Irwin","Berrien"],    zoneNote:"Fitzgerald, Ocilla, Nashville",                         households:28000, status:"available" },
  { id:"GA-088", name:"Cook / Atkinson / Lanier Counties",   state:"GA", counties:["Cook","Atkinson","Lanier"],      zoneNote:"Adel, Pearson, Lakeland",                               households:20000, status:"available" },
  { id:"GA-089", name:"Echols / Clinch Counties",            state:"GA", counties:["Echols","Clinch"],               zoneNote:"Statenville, Homerville",                               households:12000, status:"available" },
  { id:"GA-090", name:"Emanuel / Candler Counties",          state:"GA", counties:["Emanuel","Candler"],             zoneNote:"Swainsboro, Metter",                                    households:20000, status:"available" },
  { id:"GA-091", name:"Screven / Jenkins / Burke Counties",          state:"GA", counties:["Screven","Jenkins","Burke"],             zoneNote:"Sylvania, Millen, Waynesboro",                                      households:16000, status:"available" },
  { id:"GA-092", name:"Evans / Tattnall Counties",           state:"GA", counties:["Evans","Tattnall"],              zoneNote:"Claxton, Reidsville, Collins",                           households:20000, status:"available" },
  { id:"GA-093", name:"Appling / Jeff Davis Counties",       state:"GA", counties:["Appling","Jeff Davis"],          zoneNote:"Baxley, Hazlehurst",                                    households:22000, status:"available" },
  { id:"GA-094", name:"Wayne / Brantley Counties",           state:"GA", counties:["Wayne","Brantley"],              zoneNote:"Jesup, Nahunta, Odum",                                  households:20000, status:"available" },
  { id:"GA-095", name:"Ware / Pierce / Bacon Counties",      state:"GA", counties:["Ware","Pierce","Bacon"],         zoneNote:"Waycross, Blackshear, Alma",                            households:28000, status:"available" },
  // ── METRO ADDITION — South Fulton (replaces the old Fulton-South split) ───────
  { id:"GA-096", name:"South Fulton / Fairburn / Union City", state:"GA", counties:["Fulton"],          zoneNote:"Union City, Fairburn, Palmetto, South Fulton, Chattahoochee Hills", households:72000, status:"available" },
];

// Production seed: 95 territories covering all 159 GA counties.
// Idempotent: if GA count is already ≥ 95, the seed is skipped.
// On first run it clears stale placeholder rows before inserting the full set.
async function seedStarterTerritories(): Promise<void> {
  const [{ count }] = await db
    .select({ count: rawSql<number>`count(*)::int` })
    .from(territoriesTable)
    .where(eq(territoriesTable.state, "GA"));

  if (Number(count) >= 96) return; // already seeded — nothing to do

  await db.delete(territoriesTable).where(eq(territoriesTable.state, "GA"));
  await db.insert(territoriesTable).values(
    GA_SEED.map(t => ({
      id:         t.id,
      name:       t.name,
      state:      t.state,
      counties:   t.counties,
      zoneNote:   t.zoneNote,
      households: t.households,
      zones:      4,
      status:     t.status,
    })),
  );
}

// Run seed once on startup (non-blocking; silently skips if table doesn't exist
// yet — first `pnpm --filter @workspace/db run push` creates it).
seedStarterTerritories().catch(() => {});

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

// ─── GET /api/territories?state=GA ────────────────────────────────────────────
router.get("/territories", async (req, res): Promise<void> => {
  // Ensure starter territories exist before serving the list
  await seedStarterTerritories().catch(() => {});
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

// ─── GET /api/zip-to-county?zip= ──────────────────────────────────────────────
// Resolves a 5-digit US zip code to the nearest Georgia county by proxying
// zippopotam.us for the lat/lng, then computing haversine distance to the
// 159-county centroid table. Returns {zip, county, state, lat, lng} on success
// or {zip, county:null, state:null} when the zip is outside GA or not found.
const GA_COUNTY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  Appling:{lat:31.75,lng:-82.29},Atkinson:{lat:31.30,lng:-82.88},Bacon:{lat:31.55,lng:-82.45},
  Baker:{lat:31.33,lng:-84.43},Baldwin:{lat:33.07,lng:-83.25},Banks:{lat:34.37,lng:-83.49},
  Barrow:{lat:33.99,lng:-83.72},Bartow:{lat:34.24,lng:-84.84},"Ben Hill":{lat:31.77,lng:-83.22},
  Berrien:{lat:31.28,lng:-83.24},Bibb:{lat:32.84,lng:-83.64},Bleckley:{lat:32.43,lng:-83.33},
  Brantley:{lat:31.19,lng:-81.98},Brooks:{lat:30.83,lng:-83.58},Bryan:{lat:32.03,lng:-81.43},
  Bulloch:{lat:32.41,lng:-81.78},Burke:{lat:33.05,lng:-82.00},Butts:{lat:33.30,lng:-84.00},
  Calhoun:{lat:31.53,lng:-84.74},Camden:{lat:30.88,lng:-81.65},Candler:{lat:32.40,lng:-82.07},
  Carroll:{lat:33.58,lng:-85.08},Catoosa:{lat:34.90,lng:-85.12},Charlton:{lat:30.78,lng:-82.13},
  Chatham:{lat:32.03,lng:-81.10},Chattahoochee:{lat:32.35,lng:-84.79},Cherokee:{lat:34.24,lng:-84.47},
  Clarke:{lat:33.95,lng:-83.37},Clay:{lat:31.63,lng:-84.99},Clayton:{lat:33.55,lng:-84.37},
  Clinch:{lat:31.00,lng:-82.70},Cobb:{lat:33.92,lng:-84.58},Coffee:{lat:31.55,lng:-82.85},
  Colquitt:{lat:31.17,lng:-83.77},Columbia:{lat:33.55,lng:-82.18},Cook:{lat:31.15,lng:-83.43},
  Coweta:{lat:33.35,lng:-84.77},Crawford:{lat:32.73,lng:-84.00},Crisp:{lat:31.93,lng:-83.77},
  Dade:{lat:34.85,lng:-85.49},Dawson:{lat:34.44,lng:-84.17},Decatur:{lat:30.87,lng:-84.58},
  DeKalb:{lat:33.77,lng:-84.22},Dodge:{lat:32.17,lng:-83.17},Dooly:{lat:32.17,lng:-83.73},
  Dougherty:{lat:31.52,lng:-84.19},Douglas:{lat:33.70,lng:-84.77},Early:{lat:31.32,lng:-84.89},
  Echols:{lat:30.70,lng:-82.88},Effingham:{lat:32.37,lng:-81.33},Elbert:{lat:34.12,lng:-82.87},
  Emanuel:{lat:32.60,lng:-82.31},Evans:{lat:32.19,lng:-81.89},Fannin:{lat:34.86,lng:-84.32},
  Fayette:{lat:33.42,lng:-84.47},Floyd:{lat:34.27,lng:-85.22},Forsyth:{lat:34.21,lng:-84.12},
  Franklin:{lat:34.38,lng:-83.22},Fulton:{lat:33.79,lng:-84.47},Gilmer:{lat:34.68,lng:-84.47},
  Glascock:{lat:33.23,lng:-82.62},Glynn:{lat:31.21,lng:-81.49},Gordon:{lat:34.50,lng:-84.87},
  Grady:{lat:30.87,lng:-84.19},Greene:{lat:33.58,lng:-83.15},Gwinnett:{lat:33.96,lng:-84.02},
  Habersham:{lat:34.63,lng:-83.53},Hall:{lat:34.30,lng:-83.82},Hancock:{lat:33.27,lng:-83.00},
  Haralson:{lat:33.79,lng:-85.22},Harris:{lat:32.83,lng:-84.91},Hart:{lat:34.35,lng:-82.97},
  Heard:{lat:33.30,lng:-85.13},Henry:{lat:33.45,lng:-84.15},Houston:{lat:32.47,lng:-83.65},
  Irwin:{lat:31.60,lng:-83.29},Jackson:{lat:34.13,lng:-83.56},Jasper:{lat:33.32,lng:-84.00},
  "Jeff Davis":{lat:31.80,lng:-82.63},Jefferson:{lat:33.05,lng:-82.42},Jenkins:{lat:32.80,lng:-81.97},
  Johnson:{lat:32.70,lng:-82.65},Jones:{lat:33.02,lng:-83.57},Lamar:{lat:33.07,lng:-84.14},
  Lanier:{lat:31.03,lng:-83.06},Laurens:{lat:32.47,lng:-82.93},Lee:{lat:31.77,lng:-84.14},
  Lincoln:{lat:33.79,lng:-82.48},Long:{lat:31.77,lng:-81.73},Lowndes:{lat:30.83,lng:-83.28},
  Lumpkin:{lat:34.56,lng:-83.98},McDuffie:{lat:33.46,lng:-82.47},McIntosh:{lat:31.53,lng:-81.40},
  Macon:{lat:32.35,lng:-84.04},Madison:{lat:33.84,lng:-83.22},Marion:{lat:32.35,lng:-84.53},
  Meriwether:{lat:33.07,lng:-84.68},Miller:{lat:31.17,lng:-84.73},Mitchell:{lat:31.24,lng:-84.18},
  Monroe:{lat:33.03,lng:-83.90},Montgomery:{lat:32.18,lng:-82.54},Morgan:{lat:33.59,lng:-83.49},
  Murray:{lat:34.79,lng:-84.75},Muscogee:{lat:32.51,lng:-84.97},Newton:{lat:33.55,lng:-83.85},
  Oconee:{lat:33.81,lng:-83.43},Oglethorpe:{lat:33.88,lng:-83.07},Paulding:{lat:33.92,lng:-84.87},
  Peach:{lat:32.56,lng:-83.83},Pickens:{lat:34.46,lng:-84.47},Pierce:{lat:31.35,lng:-82.21},
  Pike:{lat:33.09,lng:-84.38},Polk:{lat:34.00,lng:-85.19},Pulaski:{lat:32.23,lng:-83.47},
  Putnam:{lat:33.32,lng:-83.37},Quitman:{lat:31.87,lng:-85.03},Rabun:{lat:34.88,lng:-83.40},
  Randolph:{lat:31.78,lng:-84.74},Richmond:{lat:33.37,lng:-82.07},Rockdale:{lat:33.65,lng:-84.02},
  Schley:{lat:32.27,lng:-84.31},Screven:{lat:32.77,lng:-81.62},Seminole:{lat:30.93,lng:-84.88},
  Spalding:{lat:33.25,lng:-84.27},Stephens:{lat:34.56,lng:-83.47},Stewart:{lat:32.08,lng:-84.83},
  Sumter:{lat:32.07,lng:-84.19},Talbot:{lat:32.70,lng:-84.53},Taliaferro:{lat:33.57,lng:-82.88},
  Tattnall:{lat:32.05,lng:-82.07},Taylor:{lat:32.55,lng:-84.25},Telfair:{lat:31.90,lng:-82.95},
  Terrell:{lat:31.77,lng:-84.43},Thomas:{lat:30.85,lng:-83.92},Tift:{lat:31.45,lng:-83.52},
  Toombs:{lat:32.12,lng:-82.32},Towns:{lat:34.92,lng:-83.73},Treutlen:{lat:32.40,lng:-82.56},
  Troup:{lat:33.03,lng:-85.03},Turner:{lat:31.72,lng:-83.62},Twiggs:{lat:32.67,lng:-83.42},
  Union:{lat:34.83,lng:-83.99},Upson:{lat:32.89,lng:-84.28},Walker:{lat:34.74,lng:-85.38},
  Walton:{lat:33.77,lng:-83.72},Ware:{lat:31.05,lng:-82.45},Warren:{lat:33.41,lng:-82.68},
  Washington:{lat:32.97,lng:-82.82},Wayne:{lat:31.55,lng:-81.93},Webster:{lat:32.05,lng:-84.55},
  Wheeler:{lat:32.10,lng:-82.73},White:{lat:34.64,lng:-83.73},Whitfield:{lat:34.76,lng:-84.97},
  Wilcox:{lat:31.97,lng:-83.43},Wilkes:{lat:33.78,lng:-82.73},Wilkinson:{lat:32.80,lng:-83.18},
  Worth:{lat:31.55,lng:-83.87},
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Georgia FIPS prefix is "13". Bounds: lat 30.36–35.00, lng -85.61 – -80.84
const GA_LAT_MIN = 30.0, GA_LAT_MAX = 35.1, GA_LNG_MIN = -86.0, GA_LNG_MAX = -80.0;

router.get("/zip-to-county", async (req, res): Promise<void> => {
  const zip = typeof req.query.zip === "string" ? req.query.zip.trim() : "";
  if (!/^\d{5}$/.test(zip)) {
    res.status(400).json({ error: "zip must be a 5-digit string" });
    return;
  }
  try {
    const upstream = await fetch(`https://api.zippopotam.us/us/${zip}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!upstream.ok) {
      res.json({ zip, county: null, state: null });
      return;
    }
    const data = await upstream.json() as any;
    const place = data.places?.[0];
    if (!place) { res.json({ zip, county: null, state: null }); return; }

    const lat = parseFloat(place.latitude);
    const lng = parseFloat(place.longitude);
    const stateAbbr: string = (data["post code"] ? (data as any)["country abbreviation"] : place["state abbreviation"] ?? "").toUpperCase();
    const placeState: string = (place["state abbreviation"] ?? "").toUpperCase();

    // Only serve GA results
    if (placeState !== "GA" || lat < GA_LAT_MIN || lat > GA_LAT_MAX || lng < GA_LNG_MIN || lng > GA_LNG_MAX) {
      res.json({ zip, county: null, state: placeState || stateAbbr });
      return;
    }

    // Find nearest county centroid by haversine
    let nearestCounty = "";
    let nearestDist = Infinity;
    for (const [countyName, centroid] of Object.entries(GA_COUNTY_CENTROIDS)) {
      const dist = haversineKm(lat, lng, centroid.lat, centroid.lng);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestCounty = countyName;
      }
    }

    res.json({ zip, county: nearestCounty, state: "GA", lat, lng });
  } catch (err: any) {
    req.log.warn({ zip, err: err?.message }, "zip-to-county lookup failed");
    res.json({ zip, county: null, state: null });
  }
});

// ─── Local data file resolver ─────────────────────────────────────────────────
function resolveDataPath(filename: string): string {
  // In production (esbuild bundle), _dirname = dist/
  const prodPath = path.resolve(_dirname, "data", filename);
  if (fs.existsSync(prodPath)) return prodPath;
  // In development (tsx watch), _dirname = src/routes/
  const devPath = path.resolve(_dirname, "..", "data", filename);
  if (fs.existsSync(devPath)) return devPath;
  throw new Error(`${filename} not found (checked dist/data/ and src/data/)`);
}

// ─── GET /api/georgia-zip-geojson ─────────────────────────────────────────────
// Serves the local ga-zips.geojson file with in-memory cache.
let gaZipGeoJsonCache: object | null = null;

router.get("/georgia-zip-geojson", (req, res): void => {
  if (gaZipGeoJsonCache) { res.json(gaZipGeoJsonCache); return; }
  try {
    const filePath = resolveDataPath("ga-zips.geojson");
    gaZipGeoJsonCache = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    req.log.info("Cached GA ZIP GeoJSON");
    res.json(gaZipGeoJsonCache);
  } catch (err: any) {
    req.log.error({ err: err?.message }, "Failed to serve GA ZIP GeoJSON");
    res.status(500).json({ error: "Could not load ZIP GeoJSON" });
  }
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
  zipCode:     z.string().min(5).max(10),
  dealerName:  z.string().max(120).optional(),
  dealerEmail: z.string().email().max(180).optional(),
  dealerPhone: z.string().max(40).optional(),
  isTest:      z.boolean().optional(),
});

// ── POST /api/territories/propose (public, rate-limited) ─────────────────────
router.post("/territories/propose", async (req, res): Promise<void> => {
  const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown").split(",")[0]!.trim();
  if (!checkProposeRateLimit(ip)) {
    res.status(429).json({ error: "Too many requests — try again in an hour" });
    return;
  }

  const parsed = ProposeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { zipCode, dealerName, dealerEmail, dealerPhone, isTest } = parsed.data;
  const dealerInfo =
    dealerName && dealerEmail
      ? { name: dealerName, email: dealerEmail, phone: dealerPhone ?? "" }
      : undefined;

  const result = await getTerritoryForZip(zipCode, dealerInfo, { isTest: isTest ?? false });
  res.json(result);
});

// ── GET /api/admin/territory-proposals ───────────────────────────────────────
router.get("/admin/territory-proposals", requireAdmin, async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : "pending_review";
  const page  = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
  const offset = (page - 1) * limit;

  const rows = await db
    .select()
    .from(territoryProposalsTable)
    .where(eq(territoryProposalsTable.status, status as "pending_review" | "approved" | "rejected"))
    .orderBy(rawSql`created_at desc`)
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: rawSql<number>`count(*)::int` })
    .from(territoryProposalsTable)
    .where(eq(territoryProposalsTable.status, status as "pending_review" | "approved" | "rejected"));

  res.json({ proposals: rows, total, page, limit });
});

// ── GET /api/admin/territory-proposals/:id ───────────────────────────────────
router.get("/admin/territory-proposals/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db
    .select()
    .from(territoryProposalsTable)
    .where(eq(territoryProposalsTable.id, id));
  if (!row) { res.status(404).json({ error: "Proposal not found" }); return; }
  res.json(row);
});

// ── POST /api/admin/territory-proposals/:id/approve ──────────────────────────
router.post("/admin/territory-proposals/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const overrides = req.body?.overrides as { name?: string; status?: string } | undefined;
  // Extract admin username from JWT (payload.sub or sub)
  const auth = req.headers.authorization ?? "";
  let adminUser = "admin";
  try {
    const payload = JSON.parse(
      Buffer.from(auth.split(".")[1] ?? "", "base64url").toString()
    );
    adminUser = payload.sub ?? payload.email ?? "admin";
  } catch { /* ignore */ }

  const result = await approveTerritory(id, adminUser, overrides);
  res.json({ ...result, message: "Territory approved and live" });
});

// ── POST /api/admin/territory-proposals/:id/reject ───────────────────────────
router.post("/admin/territory-proposals/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const reason = typeof req.body?.reason === "string" ? req.body.reason : "No reason provided";

  let adminUser = "admin";
  try {
    const auth = req.headers.authorization ?? "";
    const payload = JSON.parse(Buffer.from(auth.split(".")[1] ?? "", "base64url").toString());
    adminUser = payload.sub ?? payload.email ?? "admin";
  } catch { /* ignore */ }

  await rejectTerritory(id, adminUser, reason);
  res.json({ ok: true });
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

// ─── GET /api/georgia-counties-geojson ────────────────────────────────────────
// On first request, fetches the full Plotly counties GeoJSON, filters to Georgia
// (FIPS prefix "13"), caches in memory, and serves all subsequent requests from
// the cache without re-fetching. This prevents every page load from hitting
// the external CDN and keeps the map load fast even if the CDN is slow.
let gaGeoJsonCache: object | null = null;

router.get("/georgia-counties-geojson", async (req, res): Promise<void> => {
  if (gaGeoJsonCache) {
    res.json(gaGeoJsonCache);
    return;
  }
  try {
    const upstream = await fetch(
      "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json",
      { signal: AbortSignal.timeout(15000) },
    );
    if (!upstream.ok) throw new Error(`Upstream ${upstream.status}`);
    const allCounties = await upstream.json() as any;
    const gaFeatures = allCounties.features.filter((f: any) => f.id && String(f.id).startsWith("13"));
    gaGeoJsonCache = { type: "FeatureCollection", features: gaFeatures };
    req.log.info({ featureCount: gaFeatures.length }, "Cached Georgia GeoJSON");
    res.json(gaGeoJsonCache);
  } catch (err: any) {
    req.log.error({ err: err?.message }, "Failed to fetch Georgia counties GeoJSON");
    res.status(502).json({ error: "Could not load county GeoJSON" });
  }
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
