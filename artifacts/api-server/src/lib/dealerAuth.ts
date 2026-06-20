import bcrypt from "bcrypt";
import { createHash, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { db, dealersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const BCRYPT_ROUNDS = 12;
const COOKIE_NAME = "dealer_token";
const CSRF_COOKIE_NAME = "dealer_csrf";

function getJwtSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 8) {
    throw new Error("SESSION_SECRET is not configured");
  }
  return s;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface DealerTokenPayload {
  dealer_id: number;
  impersonatedBy?: string;
  iat?: number;
  exp?: number;
}

export function signDealerToken(
  payload: { dealer_id: number; impersonatedBy?: string },
  opts: { rememberMe?: boolean; shortLived?: boolean } = {},
): string {
  const secret = getJwtSecret();
  const expiresIn = opts.shortLived ? "15m" : opts.rememberMe ? "7d" : "24h";
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyDealerToken(token: string): DealerTokenPayload {
  const secret = getJwtSecret();
  return jwt.verify(token, secret) as DealerTokenPayload;
}

export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashResetToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// ─── CSRF — HMAC-signed token ─────────────────────────────────────────────────
// The double-submit-cookie pattern breaks in iframe-embedded contexts because
// browsers block third-party cookies (e.g. Replit preview pane, Safari ITP).
// Instead we issue a short-lived HMAC-SHA256 signed token. The frontend stores
// it in memory/state and sends it back in the X-CSRF-Token header. The server
// verifies the signature — no cookie needed, works in any iframe context.

import { createHmac } from "crypto";

function getCsrfSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 8) throw new Error("SESSION_SECRET is not configured");
  return s;
}

export function generateCsrfToken(): string {
  const nonce = randomBytes(24).toString("base64url");
  const sig = createHmac("sha256", getCsrfSecret()).update(nonce).digest("base64url");
  return `${nonce}.${sig}`;
}

/** No-op — kept so existing call-sites in dealers.ts don't need changing. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function setCsrfCookie(_res: Response, _token: string): void {
  // Cookie-based double-submit removed; token is validated by HMAC signature.
}

export const csrfProtect: RequestHandler = (req, res, next) => {
  const headerToken = req.headers["x-csrf-token"] as string | undefined;
  if (!headerToken) {
    res.status(403).json({
      error: "Invalid CSRF token. Please refresh the page and try again.",
      reason: "csrf_missing",
    });
    return;
  }
  const dot = headerToken.lastIndexOf(".");
  if (dot === -1) {
    res.status(403).json({
      error: "Invalid CSRF token. Please refresh the page and try again.",
      reason: "csrf_malformed",
    });
    return;
  }
  const nonce = headerToken.slice(0, dot);
  const providedSig = headerToken.slice(dot + 1);
  const expectedSig = createHmac("sha256", getCsrfSecret()).update(nonce).digest("base64url");
  if (providedSig !== expectedSig) {
    res.status(403).json({
      error: "Invalid CSRF token. Please refresh the page and try again.",
      reason: "csrf_mismatch",
    });
    return;
  }
  next();
};

// ─── Session cookie helpers ───────────────────────────────────────────────────

export function setDealerCookie(res: Response, token: string, rememberMe: boolean): void {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : undefined,
  });
}

export function clearDealerCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "strict" });
}

// ─── requireDealerAuth middleware ─────────────────────────────────────────────

export async function requireDealerAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Prefer Authorization: Bearer header (works in iframe / third-party-cookie-blocked contexts).
  // Fall back to HttpOnly cookie for legacy / server-rendered callers.
  const authHeader = req.headers.authorization;
  const token =
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined) ??
    (req as any).cookies?.[COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: "Not authenticated", reason: "no_token" });
    return;
  }

  let payload: DealerTokenPayload;
  try {
    payload = verifyDealerToken(token);
  } catch {
    clearDealerCookie(res);
    res.setHeader("Location", "/dealer/login?reason=session_expired");
    res.status(401).json({ error: "Session expired", reason: "invalid_token" });
    return;
  }

  const [dealer] = await db
    .select()
    .from(dealersTable)
    .where(eq(dealersTable.id, payload.dealer_id));

  if (!dealer) {
    clearDealerCookie(res);
    res.setHeader("Location", "/dealer/login?reason=session_expired");
    res.status(401).json({ error: "Account not found", reason: "dealer_not_found" });
    return;
  }

  (res as any).locals.dealer = dealer;
  (res as any).locals.dealerToken = payload;
  next();
}

// ─── Password complexity ──────────────────────────────────────────────────────

export const PASSWORD_SCHEMA = {
  minLength: 8,
  requiresDigit: /\d/,
  requiresSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/,
};

export function validatePasswordComplexity(password: string): string | null {
  if (password.length < PASSWORD_SCHEMA.minLength) {
    return `Password must be at least ${PASSWORD_SCHEMA.minLength} characters.`;
  }
  if (!PASSWORD_SCHEMA.requiresDigit.test(password)) {
    return "Password must contain at least one number.";
  }
  if (!PASSWORD_SCHEMA.requiresSpecial.test(password)) {
    return "Password must contain at least one special character.";
  }
  return null;
}
