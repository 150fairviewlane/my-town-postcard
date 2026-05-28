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

function resolveHtmlPath(): string {
  const prodPath = path.resolve(_dirname, "public", "territory-manager.html");
  if (fs.existsSync(prodPath)) return prodPath;
  const devPath = path.resolve(_dirname, "..", "public", "territory-manager.html");
  if (fs.existsSync(devPath)) return devPath;
  throw new Error("territory-manager.html not found");
}

const HTML_FILE_PATH = resolveHtmlPath();

function verifyQueryToken(token: string): boolean {
  try { jwt.verify(token, JWT_SECRET); return true; } catch { return false; }
}

// GET /admin/territories — admin JWT required via ?token= query param
// The admin dashboard passes the token so the browser GET can be authenticated.
router.get("/admin/territories", (req, res): void => {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!token || !verifyQueryToken(token)) {
    res.redirect("/admin");
    return;
  }
  res.sendFile(HTML_FILE_PATH);
});

// GET /dealer/claim-territory — public dealer signup page
router.get("/dealer/claim-territory", (_req, res): void => {
  res.sendFile(HTML_FILE_PATH);
});

export default router;
