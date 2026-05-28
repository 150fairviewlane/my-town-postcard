import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db, territoriesTable, dealerTerritoryClaimsTable } from "@workspace/db";

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
  households: number; status: TerritoryStatus;
}
const GA_SEED: SeedRow[] = [
  { id: "GA-001", name: "White / Habersham Counties",  state: "GA", counties: ["White","Habersham"],          households: 28000,  status: "available" },
  { id: "GA-002", name: "Hall County (Gainesville)",   state: "GA", counties: ["Hall"],                       households: 82000,  status: "available" },
  { id: "GA-003", name: "Stephens / Franklin / Hart",  state: "GA", counties: ["Stephens","Franklin","Hart"], households: 32000,  status: "pending"   },
  { id: "GA-004", name: "Rabun / Towns / Union",       state: "GA", counties: ["Rabun","Towns","Union"],      households: 22000,  status: "available" },
  { id: "GA-005", name: "Fannin / Gilmer Counties",    state: "GA", counties: ["Fannin","Gilmer"],            households: 30000,  status: "taken"     },
  { id: "GA-006", name: "Pickens / Dawson / Lumpkin", state: "GA", counties: ["Pickens","Dawson","Lumpkin"], households: 46000,  status: "available" },
  { id: "GA-007", name: "Banks / Jackson",             state: "GA", counties: ["Banks","Jackson"],            households: 52000,  status: "available" },
  { id: "GA-008", name: "Cherokee County",             state: "GA", counties: ["Cherokee"],                   households: 98000,  status: "available" },
  { id: "GA-009", name: "Forsyth County",              state: "GA", counties: ["Forsyth"],                    households: 112000, status: "available" },
  { id: "GA-010", name: "Murray / Whitfield Counties", state: "GA", counties: ["Murray","Whitfield"],         households: 56000,  status: "available" },
  { id: "GA-011", name: "Gordon / Bartow Counties",   state: "GA", counties: ["Gordon","Bartow"],            households: 68000,  status: "available" },
  { id: "GA-012", name: "Lumpkin / Dawson Counties",  state: "GA", counties: ["Lumpkin","Dawson"],           households: 28000,  status: "available" },
];

// Idempotent seed: inserts each starter territory by primary key, skipping rows
// that already exist. Safe to call on every boot; never overwrites existing data.
async function seedStarterTerritories(): Promise<void> {
  await db
    .insert(territoriesTable)
    .values(
      GA_SEED.map(t => ({
        id: t.id, name: t.name, state: t.state,
        counties: t.counties, households: t.households,
        zones: 4, status: t.status,
      })),
    )
    .onConflictDoNothing();
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
});

const UpdateTerritorySchema = z.object({
  name:       z.string().min(1).max(200).optional(),
  counties:   z.array(z.string().min(1)).optional(),
  households: z.number().int().min(0).optional(),
  status:     z.enum(["available", "pending", "taken"]).optional(),
  dealerId:   z.number().int().nullable().optional(),
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

  await db.transaction(async tx => {
    await tx
      .update(territoriesTable)
      .set({ status: "pending" })
      .where(and(
        eq(territoriesTable.id, parsed.data.territory_id),
        eq(territoriesTable.status, "available"),
      ));
    await tx.insert(dealerTerritoryClaimsTable).values({
      territoryId:  parsed.data.territory_id,
      dealerName:   parsed.data.dealer_name,
      dealerEmail:  parsed.data.dealer_email,
      dealerPhone:  parsed.data.dealer_phone ?? null,
      status:       "pending",
    });
  });

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

export default router;
