import { Router, type IRouter } from "express";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const router: IRouter = Router();

const JWT_SECRET = process.env.SESSION_SECRET || "localspot-secret";

// Works in both ESM dev (tsx watch) and the esbuild production bundle.
const _dirname: string =
  (globalThis as any).__dirname ??
  path.dirname(fileURLToPath(import.meta.url));

function resolveHtml(filename: string): string {
  const prodPath = path.resolve(_dirname, "public", filename);
  if (fs.existsSync(prodPath)) return prodPath;
  const devPath = path.resolve(_dirname, "..", "public", filename);
  if (fs.existsSync(devPath)) return devPath;
  throw new Error(`${filename} not found (checked dist/public/ and src/public/)`);
}

const MANAGER_HTML      = resolveHtml("territory-manager.html");
const FINDER_HTML       = resolveHtml("territory-finder.html");
const ZIP_MANAGER_HTML  = resolveHtml("territory-zip-manager.html");

function verifyQueryToken(token: string): boolean {
  try { jwt.verify(token, JWT_SECRET); return true; } catch { return false; }
}

// GET /admin/territories — admin JWT required via ?token= query param
router.get("/admin/territories", (req, res): void => {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!token || !verifyQueryToken(token)) {
    res.redirect("/admin");
    return;
  }
  res.sendFile(MANAGER_HTML);
});

// GET /dealer/claim-territory — legacy public dealer signup page
router.get("/dealer/claim-territory", (_req, res): void => {
  res.sendFile(MANAGER_HTML);
});

// GET /admin/territories/zip-manager — admin ZIP assignment tool (JWT required)
router.get("/admin/territories/zip-manager", (req, res): void => {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!token || !verifyQueryToken(token)) { res.redirect("/admin"); return; }
  res.sendFile(ZIP_MANAGER_HTML);
});

// GET /find-territory — public interactive territory finder map
router.get("/find-territory", (_req, res): void => {
  res.sendFile(FINDER_HTML);
});

// GET /dealer/find-territory — same page, alternate entry point
router.get("/dealer/find-territory", (_req, res): void => {
  res.sendFile(FINDER_HTML);
});

export default router;
