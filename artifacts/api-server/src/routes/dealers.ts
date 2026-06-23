import { Router, type IRouter, type Request } from "express";
import { eq, sql, desc, asc, and, or, isNull, gt, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import {
  db,
  dealersTable,
  dealerTerritoriesTable,
  dealerPasswordResetsTable,
  dealerTerritoryClaimsTable,
  adminActionsTable,
  campaignsTable,
  spotsTable,
  ordersTable,
  qrScansTable,
  spotSubscriptionsTable,
  subscriptionIssueAssignmentsTable,
  territoriesTable,
  territoryProposalsTable,
  territoryZipAssignmentsTable,
  formerDealersTable,
} from "@workspace/db";
import { getStripeClient, isStripeConfigured } from "../lib/stripeClient";
import { computeCommissionCents } from "../lib/commission";
import { ensureDealerLandingPage } from "../lib/dealerLandingPage";
import {
  materializeTerritoryFromProposal,
  findExistingTerritoryWithinMiles,
  resolveProposalHubs,
  checkZipFootprintConflict,
  proposalCountiesOverlapTerritory,
  ZipFootprintConflictError,
} from "../lib/territoryBuilder";
import {
  sendTerritoryConflictEmail,
  sendDealerPasswordResetEmail,
  sendDealerWelcomeEmail,
  sendAdminNewDealerEmail,
  sendAdminDealerCancelledEmail,
} from "../lib/emails";
import { logger } from "../lib/logger";
import {
  hashPassword,
  verifyPassword,
  signDealerToken,
  verifyDealerToken,
  generateResetToken,
  hashResetToken,
  setDealerCookie,
  clearDealerCookie,
  requireDealerAuth,
  validatePasswordComplexity,
  generateCsrfToken,
  setCsrfCookie,
  csrfProtect,
} from "../lib/dealerAuth";

const router: IRouter = Router();

// ─── Rate limiters ────────────────────────────────────────────────────────────
// In-memory per-IP failed attempt tracker (5 failures / 10 min window per IP).
// Separate from the per-account lock — an attacker distributing requests across
// many accounts would otherwise never trigger the account lock.
const IP_WINDOW_MS = 10 * 60 * 1000;
const IP_MAX_FAILURES = 5;
const ipFailedAttempts = new Map<string, { count: number; windowStart: number }>();

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again in 10 minutes" },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait before trying again." },
});

// ─── Pricing for the Phase 1 dealer program. ─────────────────────────────────
// $99/mo covers setup + access. Inlined as Stripe `price_data` so no Products
// need to be pre-created in the Stripe dashboard for QA / dev.

const MONTHLY_FEE_CENTS = 9900;

function getJwtSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 8) {
    throw new Error("SESSION_SECRET is not configured — admin endpoints are disabled.");
  }
  return s;
}
function requireAdmin(req: any, res: any, next: any): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  let secret: string;
  try {
    secret = getJwtSecret();
  } catch (err: any) {
    req.log?.error({ err: err?.message }, "Admin auth misconfigured");
    res.status(500).json({ error: "Admin auth is not configured on this server." });
    return;
  }
  try {
    const payload: any = jwt.verify(auth.slice(7), secret);
    if (!payload?.admin) {
      res.status(401).json({ error: "Token missing admin claim" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

const LegacyTerritorySchema = z.object({
  territoryIndex: z.number().int().min(0).max(15),
  zipCodes: z.array(z.string().regex(/^\d{5}$/)).min(1).max(500),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  cityLabel: z.string().min(1).max(120),
  estimatedHouseholds: z.number().int().min(0).max(1_000_000),
});

// Accepts both the new county-based format (territoryId + territoryName) and
// the legacy ZIP-cluster format (homeZip + territories[]) for backward compat.
const CreateDealerBodySchema = z.union([
  z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(180),
    phone: z.string().trim().max(40).optional().nullable(),
    territoryId: z.string().min(1).max(20),
    territoryName: z.string().min(1).max(200),
    password: z.string().min(8).max(128).optional(),
    confirmPassword: z.string().optional(),
  }),
  z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(180),
    phone: z.string().trim().max(40).optional().nullable(),
    homeZip: z.string().regex(/^\d{5}$/),
    territories: z.array(LegacyTerritorySchema).min(1).max(8),
    password: z.string().min(8).max(128).optional(),
    confirmPassword: z.string().optional(),
  }),
]);

function getOrigin(req: Request): string {
  const envOrigin = process.env.PUBLIC_APP_URL?.replace(/\/$/, "");
  if (envOrigin) return envOrigin;
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitDomain) return `https://${replitDomain}`;
  const host = req.get("host") ?? `localhost:${process.env.PORT ?? "3000"}`;
  const proto = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
  return `${proto}://${host}`;
}

// ─── Territory status helpers ──────────────────────────────────────────────────

/**
 * Returns the WHERE clause used to guard a territory claim. Accepts the
 * territory only if it is "available", or already "pending" and linked to
 * this same dealer (idempotent re-attempt from a prior POST /api/dealers call).
 * Used inside the transaction in POST /api/dealers.
 */
function territoryClaimGuard(territoryId: string, dealerId: number) {
  return and(
    eq(territoriesTable.id, territoryId),
    or(
      eq(territoriesTable.status, "available"),
      and(
        eq(territoriesTable.status, "pending"),
        or(
          isNull(territoriesTable.dealerId),
          eq(territoriesTable.dealerId, dealerId),
        ),
      ),
    ),
  );
}

/**
 * Updates the linked territory's status. Used by the activation and
 * cancellation paths so territory availability stays in sync with
 * the dealer's subscription state.
 */
async function setTerritoryStatusForDealer(
  dealerId: number,
  newStatus: "pending" | "taken" | "available",
): Promise<void> {
  await db
    .update(territoriesTable)
    .set({
      status: newStatus,
      ...(newStatus === "available" ? { dealerId: null } : {}),
    })
    .where(eq(territoriesTable.dealerId, dealerId));
}

/**
 * Releases a "pending" territory back to "available" if the associated dealer
 * never paid (checkout abandoned / expired / failed). Idempotent — won't touch
 * territories that are already "taken" (i.e. payment succeeded). Exported for
 * use in the webhook handler.
 */
export async function releaseDealerPendingTerritory(dealerId: number): Promise<void> {
  await db
    .update(territoriesTable)
    .set({ status: "available", dealerId: null })
    .where(
      and(
        eq(territoriesTable.dealerId, dealerId),
        eq(territoriesTable.status, "pending"),
      ),
    );
}

router.post("/dealers", async (req, res): Promise<void> => {
  const parsed = CreateDealerBodySchema.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ zodError: parsed.error.issues, body: req.body }, "POST /dealers Zod validation failed");
    res.status(400).json({ error: "Please make sure you've selected a territory and filled in all required fields." });
    return;
  }

  if (!(await isStripeConfigured())) {
    res.status(503).json({
      error:
        "Payments are not configured for this environment. Connect the Stripe integration to enable dealer signups.",
    });
    return;
  }

  const { name, email, phone } = parsed.data;
  const rawPassword = (parsed.data as any).password as string | undefined;
  if (rawPassword) {
    const complexityError = validatePasswordComplexity(rawPassword);
    if (complexityError) {
      res.status(400).json({ error: complexityError });
      return;
    }
    const rawConfirm = (parsed.data as any).confirmPassword as string | undefined;
    if (rawConfirm !== undefined && rawPassword !== rawConfirm) {
      res.status(400).json({ error: "Passwords do not match." });
      return;
    }
  }
  const passwordHash = rawPassword ? await hashPassword(rawPassword) : null;

  const isCountyFlow = "territoryId" in parsed.data;
  const homeZip = isCountyFlow ? "00000" : (parsed.data as any).homeZip as string;
  const territoryId = isCountyFlow ? (parsed.data as any).territoryId as string : null;
  const territoryDisplayName = isCountyFlow
    ? (parsed.data as any).territoryName as string
    : null;
  const legacyTerritories = isCountyFlow
    ? null
    : (parsed.data as any).territories as z.infer<typeof LegacyTerritorySchema>[];

  const [existing] = await db.select().from(dealersTable).where(eq(dealersTable.email, email));
  if (existing && existing.status === "active") {
    res.status(409).json({ error: "A dealer account with this email is already active. Please sign in at /dealer/login." });
    return;
  }
  if (existing && existing.status === "pending_payment") {
    res.status(409).json({
      error:
        "An account with this email is already being set up. If you completed payment, please sign in to finish activating your account. If you need help, contact support.",
    });
    return;
  }
  if (existing && existing.status === "cancelled") {
    res.status(409).json({
      error:
        "An earlier dealer account with this email was cancelled. Please contact support to reinstate it.",
    });
    return;
  }

  // Run the dealer upsert + territory claim atomically. If the territory
  // has already been taken by someone else, the whole transaction rolls back
  // and we return a 409 instead of partially mutating state.
  let dealerId: number;
  let portalToken: string;

  try {
    const result = await db.transaction(async (tx) => {
      let txDealerId: number;
      let txPortalToken: string;

      if (existing) {
        txDealerId = existing.id;
        txPortalToken = existing.portalToken ?? crypto.randomUUID();
        await tx
          .update(dealersTable)
          .set({ name, phone: phone ?? null, homeZip, portalToken: txPortalToken })
          .where(eq(dealersTable.id, txDealerId));
        // Release any pending territory linked to this dealer from a prior
        // signup attempt. This ensures that if the dealer picks a different
        // territory on retry, the old one returns to "available" and we never
        // end up with multiple territories linked to the same dealer (which
        // would cause all of them to flip to "taken" on activation).
        await tx
          .update(territoriesTable)
          .set({ status: "available", dealerId: null })
          .where(
            and(
              eq(territoriesTable.dealerId, txDealerId),
              eq(territoriesTable.status, "pending"),
            ),
          );
        // Replace any stale legacy territory rows from an earlier attempt.
        await tx
          .delete(dealerTerritoriesTable)
          .where(eq(dealerTerritoriesTable.dealerId, txDealerId));
      } else {
        const [created] = await tx
          .insert(dealersTable)
          .values({ name, email, phone: phone ?? null, homeZip, status: "pending_payment", ...(passwordHash ? { passwordHash } : {}) })
          .returning({ id: dealersTable.id, portalToken: dealersTable.portalToken });
        txDealerId = created.id;
        txPortalToken = created.portalToken ?? crypto.randomUUID();
      }

      // County flow: atomically link the territory to this dealer, guarded by
      // a status check so we never overwrite a "taken" territory or one claimed
      // by a different dealer. Throws inside the transaction so it rolls back.
      if (territoryId) {
        const claimed = await tx
          .update(territoriesTable)
          .set({ status: "pending", dealerId: txDealerId })
          .where(territoryClaimGuard(territoryId, txDealerId))
          .returning({ id: territoriesTable.id });
        if (claimed.length === 0) {
          throw Object.assign(new Error("Territory is no longer available."), { status: 409 });
        }
      }

      // Legacy ZIP-cluster flow: persist territory rows for admin review.
      if (legacyTerritories) {
        await tx.insert(dealerTerritoriesTable).values(
          legacyTerritories.map((t) => ({
            dealerId: txDealerId,
            territoryIndex: t.territoryIndex,
            zipCodes: t.zipCodes,
            centerLat: t.centerLat,
            centerLng: t.centerLng,
            cityLabel: t.cityLabel,
            estimatedHouseholds: t.estimatedHouseholds,
          })),
        );
      }

      return { dealerId: txDealerId, portalToken: txPortalToken };
    });

    dealerId = result.dealerId;
    portalToken = result.portalToken;
  } catch (err: any) {
    if ((err as any).status === 409) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }

  const stripe = await getStripeClient();
  const origin = getOrigin(req);
  const subscriptionProductName = territoryDisplayName
    ? `My Town Postcard — Dealer Subscription (${territoryDisplayName})`
    : "My Town Postcard — Dealer Subscription";

  // success_url goes directly to the dealer's self-service portal, keyed by
  // their opaque portalToken. Activation is handled by the webhook
  // (checkout.session.completed, kind=dealer) and idempotently by the
  // /dealers/confirm endpoint (reachable via the portal's own "complete
  // activation" flow if the webhook hasn't fired yet).
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: subscriptionProductName },
          unit_amount: MONTHLY_FEE_CENTS,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    metadata: { kind: "dealer", dealerId: String(dealerId) },
    subscription_data: {
      metadata: { kind: "dealer", dealerId: String(dealerId) },
    },
    // {CHECKOUT_SESSION_ID} is replaced by Stripe with the real session ID.
    // DealerConfirmation calls /api/dealers/confirm as a synchronous fallback
    // so activation always happens even if the webhook hasn't fired yet.
    success_url: `${origin}/dealers/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dealers/signup?cancelled=1`,
  });

  await db
    .update(dealersTable)
    .set({ stripeCheckoutSessionId: session.id })
    .where(eq(dealersTable.id, dealerId));

  req.log.info(
    { dealerId, sessionId: session.id, email },
    "Created dealer + Stripe Checkout session",
  );

  res.json({ dealerId, checkoutUrl: session.url });
});

// ─── POST /api/dealers/claim-proposal ────────────────────────────────────────
// Unified claim flow for an in-memory territory proposal returned by
// POST /api/territories/propose. Persists the proposal (pending_payment),
// creates/updates the dealer (pending_payment), and opens a Stripe Checkout
// subscription session whose metadata references ONLY {proposal_id}.
// The territory row is materialized later, by the webhook, on payment success.
const ClaimProposalProposalSchema = z.object({
  proposedName:     z.string().min(1).max(160),
  stateAbbr:        z.string().min(2).max(2),
  stateFips:        z.string().min(1).max(2),
  stateName:        z.string().min(1).max(60),
  zipCode:          z.string().regex(/^\d{5}$/).nullable().optional(),
  countyFips:       z.string().min(1).max(5).nullable().optional(),
  countyName:       z.string().min(1).max(120).nullable().optional(),
  centroidLat:      z.number(),
  centroidLng:      z.number(),
  households:       z.number().int().nonnegative(),
  businessCount:    z.number().int().nonnegative(),
  cities:           z.array(z.string()).default([]),
  countyShortNames: z.array(z.string()).default([]),
});
const ClaimProposalBodySchema = z.object({
  name:            z.string().min(1).max(120),
  email:           z.string().email().max(180),
  phone:           z.string().max(40).optional(),
  proposal:        ClaimProposalProposalSchema,
  password:        z.string().min(8).max(128).optional(),
  confirmPassword: z.string().optional(),
});

router.post("/dealers/claim-proposal", async (req, res): Promise<void> => {
  const parsed = ClaimProposalBodySchema.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ zodError: parsed.error.issues }, "POST /dealers/claim-proposal validation failed");
    const firstIssue = parsed.error.issues[0];
    const field = firstIssue?.path?.[0];
    const fieldLabel =
      field === "email" ? "email address" :
      field === "name"  ? "full name" :
      field === "phone" ? "phone number" :
      field === "proposal" ? "territory selection" : "required field";
    res.status(400).json({ error: `Please enter a valid ${fieldLabel}.` });
    return;
  }

  if (!(await isStripeConfigured())) {
    res.status(503).json({
      error:
        "Payments are not configured for this environment. Connect the Stripe integration to enable dealer signups.",
    });
    return;
  }

  const { name, email, phone, proposal } = parsed.data;
  const cpRawPassword = (parsed.data as any).password as string | undefined;
  if (cpRawPassword) {
    const complexityError = validatePasswordComplexity(cpRawPassword);
    if (complexityError) {
      res.status(400).json({ error: complexityError });
      return;
    }
    const cpRawConfirm = (parsed.data as any).confirmPassword as string | undefined;
    if (cpRawConfirm !== undefined && cpRawPassword !== cpRawConfirm) {
      res.status(400).json({ error: "Passwords do not match." });
      return;
    }
  }
  const cpPasswordHash = cpRawPassword ? await hashPassword(cpRawPassword) : null;

  const [existing] = await db.select().from(dealersTable).where(eq(dealersTable.email, email));
  if (existing && existing.status === "active") {
    res.status(409).json({ error: "A dealer account with this email is already active. Please sign in at /dealer/login." });
    return;
  }
  if (existing && existing.status === "pending_payment") {
    res.status(409).json({
      error:
        "An account with this email is already being set up. If you completed payment, please sign in to finish activating your account. If you need help, contact support.",
    });
    return;
  }
  if (existing && existing.status === "cancelled") {
    res.status(409).json({
      error:
        "An earlier dealer account with this email was cancelled. Please contact support to reinstate it.",
    });
    return;
  }

  // Upsert dealer (pending_payment) + persist the proposal (pending_payment),
  // linked together, in one transaction.
  const { dealerId, portalToken, proposalId } = await db.transaction(async (tx) => {
    let txDealerId: number;
    let txPortalToken: string;
    if (existing) {
      txDealerId = existing.id;
      txPortalToken = existing.portalToken ?? crypto.randomUUID();
      await tx
        .update(dealersTable)
        .set({ name, phone: phone ?? null, homeZip: proposal.zipCode ?? null, portalToken: txPortalToken, ...(cpPasswordHash ? { passwordHash: cpPasswordHash } : {}) })
        .where(eq(dealersTable.id, txDealerId));
    } else {
      const [created] = await tx
        .insert(dealersTable)
        .values({ name, email, phone: phone ?? null, homeZip: proposal.zipCode ?? null, status: "pending_payment", ...(cpPasswordHash ? { passwordHash: cpPasswordHash } : {}) })
        .returning({ id: dealersTable.id, portalToken: dealersTable.portalToken });
      txDealerId = created.id;
      txPortalToken = created.portalToken ?? crypto.randomUUID();
    }

    const [insertedProposal] = await tx
      .insert(territoryProposalsTable)
      .values({
        zipCode:          proposal.zipCode ?? null,
        stateFips:        proposal.stateFips,
        stateAbbr:        proposal.stateAbbr,
        countyFips:       proposal.countyFips ?? null,
        countyName:       proposal.countyName ?? null,
        proposedName:     proposal.proposedName,
        proposedCounties: proposal.countyShortNames,
        proposedCities:   proposal.cities,
        businessCount:    proposal.businessCount,
        households:       proposal.households,
        centroidLat:      proposal.centroidLat,
        centroidLng:      proposal.centroidLng,
        status:           "pending_payment",
        dealerId:         txDealerId,
        dealerName:       name,
        dealerEmail:      email,
        dealerPhone:      phone ?? null,
      })
      .returning({ id: territoryProposalsTable.id });

    return { dealerId: txDealerId, portalToken: txPortalToken, proposalId: insertedProposal.id };
  });

  const stripe = await getStripeClient();
  const origin = getOrigin(req);
  // Include dealerId so /dealers/confirm can locate the dealer as a synchronous
  // fallback when the webhook hasn't fired yet.
  const meta = { proposal_id: String(proposalId), dealerId: String(dealerId) };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: `My Town Postcard — Dealer Subscription (${proposal.proposedName})` },
          unit_amount: MONTHLY_FEE_CENTS,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    metadata: meta,
    subscription_data: { metadata: meta },
    // {CHECKOUT_SESSION_ID} is replaced by Stripe with the real session ID.
    // DealerConfirmation calls /api/dealers/confirm as a synchronous fallback
    // so activation always happens even if the webhook hasn't fired yet.
    success_url: `${origin}/dealers/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/find-territory?cancelled=1`,
  });

  await db
    .update(dealersTable)
    .set({ stripeCheckoutSessionId: session.id })
    .where(eq(dealersTable.id, dealerId));

  req.log.info(
    { dealerId, proposalId, sessionId: session.id, email },
    "Created dealer + territory proposal claim + Stripe Checkout session",
  );

  res.json({ dealerId, proposalId, checkoutUrl: session.url });
});

router.get("/dealers/confirm", async (req, res): Promise<void> => {
  const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : null;
  if (!sessionId || !sessionId.startsWith("cs_")) {
    res.status(400).json({ error: "Missing or invalid session_id" });
    return;
  }

  if (!(await isStripeConfigured())) {
    res.status(503).json({ error: "Payments are not configured for this environment." });
    return;
  }

  const stripe = await getStripeClient();
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err: any) {
    req.log.warn({ err: err?.message, sessionId }, "Could not retrieve Stripe session");
    res.status(400).json({ error: "Could not verify checkout session." });
    return;
  }

  const sessionMeta = (session.metadata as any) ?? {};
  const isPaid = session.payment_status === "paid" || session.payment_status === "no_payment_required";

  // ── Proposal-based territory claim (new flow) ───────────────────────────────
  // claim-proposal sessions carry `proposal_id` (and `dealerId`) in metadata.
  // The full materialization (territory rows, ZIP assignments, conflict checks)
  // must go through activateTerritoryClaimFromCheckoutSession, not the simpler
  // dealer-only path below.
  const proposalIdStr = sessionMeta.proposal_id;
  const proposalIdNum = proposalIdStr ? parseInt(String(proposalIdStr), 10) : null;

  if (proposalIdNum && Number.isFinite(proposalIdNum)) {
    if (isPaid) {
      try {
        await activateTerritoryClaimFromCheckoutSession(session);
        req.log.info({ proposalId: proposalIdNum, sessionId }, "Territory claim activated via /confirm");
      } catch (err: any) {
        req.log.error(
          { err: err?.message, proposalId: proposalIdNum },
          "activateTerritoryClaimFromCheckoutSession failed in /confirm — webhook will retry",
        );
      }
    }

    // Recover dealer from the proposal record (the function already stores dealerId there).
    const dealerIdFromMeta = sessionMeta.dealerId ? parseInt(String(sessionMeta.dealerId), 10) : null;
    let claimDealerId: number | null = dealerIdFromMeta && Number.isFinite(dealerIdFromMeta) ? dealerIdFromMeta : null;
    if (!claimDealerId) {
      const [prop] = await db
        .select({ dealerId: territoryProposalsTable.dealerId })
        .from(territoryProposalsTable)
        .where(eq(territoryProposalsTable.id, proposalIdNum));
      claimDealerId = prop?.dealerId ?? null;
    }
    if (!claimDealerId) {
      res.status(400).json({ error: "Session is not linked to a dealer signup." });
      return;
    }

    const [claimDealer] = await db.select().from(dealersTable).where(eq(dealersTable.id, claimDealerId));
    if (!claimDealer) {
      res.status(404).json({ error: "Dealer not found." });
      return;
    }

    const origin = getOrigin(req);
    const portalToken = claimDealer.portalToken;
    const portalUrl = `${origin}/dealer/login`;
    const territories = await db
      .select()
      .from(dealerTerritoriesTable)
      .where(eq(dealerTerritoriesTable.dealerId, claimDealerId));

    res.json({
      dealerId: claimDealerId,
      name: claimDealer.name,
      email: claimDealer.email,
      status: claimDealer.status,
      paymentStatus: session.payment_status,
      portalToken,
      portalUrl,
      territories: territories.map((t) => ({
        territoryIndex: t.territoryIndex,
        cityLabel: t.cityLabel,
        zipCount: t.zipCodes.length,
        estimatedHouseholds: t.estimatedHouseholds,
      })),
    });
    return;
  }

  // ── Legacy dealer signup flow (kind=dealer in metadata) ────────────────────
  const dealerIdStr = sessionMeta.dealerId;
  const dealerId = dealerIdStr ? parseInt(String(dealerIdStr), 10) : null;
  if (!dealerId || !Number.isFinite(dealerId)) {
    res.status(400).json({ error: "Session is not linked to a dealer signup." });
    return;
  }

  const [dealer] = await db.select().from(dealersTable).where(eq(dealersTable.id, dealerId));
  if (!dealer) {
    res.status(404).json({ error: "Dealer not found." });
    return;
  }

  if (isPaid && dealer.status === "pending_payment") {
    await db
      .update(dealersTable)
      .set({
        status: "active",
        stripeCustomerId:
          typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
        stripeSubscriptionId:
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null,
        activatedAt: new Date(),
      })
      .where(eq(dealersTable.id, dealerId));
    await setTerritoryStatusForDealer(dealerId, "taken");
    req.log.info({ dealerId, sessionId }, "Dealer activated via /confirm");
    try {
      const campaignIds = await ensureDealerLandingPage(dealerId);
      req.log.info({ dealerId, campaignCount: campaignIds.length, campaignIds }, "ensureDealerLandingPage complete via /confirm");
    } catch (err: any) {
      req.log.error({ err: err?.message, dealerId }, "ensureDealerLandingPage failed in /confirm — webhook will retry");
    }
    try {
      const appUrl = getOrigin(req);
      const rawToken = generateResetToken();
      const tokenHash = hashResetToken(rawToken);
      await db.insert(dealerPasswordResetsTable).values({
        dealerId,
        tokenHash,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      });
      const [territory] = await db
        .select({ cityLabel: dealerTerritoriesTable.cityLabel })
        .from(dealerTerritoriesTable)
        .where(eq(dealerTerritoriesTable.dealerId, dealerId));
      await sendDealerWelcomeEmail({
        dealerName: dealer.name,
        dealerEmail: dealer.email,
        territoryName: territory?.cityLabel ?? null,
        setPasswordLink: `${appUrl}/dealer/reset-password?token=${rawToken}`,
        loginLink: `${appUrl}/dealer/login`,
      });
    } catch (err: any) {
      req.log.error({ err: err?.message, dealerId }, "Failed to send dealer welcome email via /confirm");
    }
  }

  const origin = getOrigin(req);
  const portalToken = dealer.portalToken;
  const portalUrl = `${origin}/dealer/login`;

  const territories = await db
    .select()
    .from(dealerTerritoriesTable)
    .where(eq(dealerTerritoriesTable.dealerId, dealerId));

  res.json({
    dealerId,
    name: dealer.name,
    email: dealer.email,
    status: isPaid ? "active" : dealer.status,
    paymentStatus: session.payment_status,
    portalToken,
    portalUrl,
    territories: territories.map((t) => ({
      territoryIndex: t.territoryIndex,
      cityLabel: t.cityLabel,
      zipCount: t.zipCodes.length,
      estimatedHouseholds: t.estimatedHouseholds,
    })),
  });
});

// ─── Dealer self-service portal ────────────────────────────────────────────────
// ─── GET /api/dealer-portal — DEPRECATED ──────────────────────────────────────
// This token-based portal endpoint has been superseded by cookie-auth routes:
//   GET /api/dealers/me  and  GET /api/dealers/portal-data
// Disabled to eliminate the weaker auth surface.
router.get("/dealer-portal", (_req, res): void => {
  res.status(410).json({
    error: "This endpoint is deprecated. Please use the dealer dashboard at /dealer/dashboard.",
    loginUrl: "/dealer/login",
  });
  return;
});


// Dealer portal data (admin-only). Summary of a dealer's auto-created landing
// page: public URL + live sell-through + per-spot revenue.
router.get("/dealers/:id/landing-page", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid dealer id" });
    return;
  }

  const [dealer] = await db.select().from(dealersTable).where(eq(dealersTable.id, id));
  if (!dealer) {
    res.status(404).json({ error: "Dealer not found" });
    return;
  }

  let campaign;
  if (dealer.landingPageCampaignId) {
    [campaign] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, dealer.landingPageCampaignId));
  }
  if (!campaign) {
    [campaign] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.dealerId, id))
      .limit(1);
  }
  if (!campaign) {
    res.json({ dealerId: id, name: dealer.name, page: null });
    return;
  }

  const spots = await db
    .select()
    .from(spotsTable)
    .where(eq(spotsTable.campaignId, campaign.id));

  const sold = spots.filter((s) => s.status === "paid");
  const frontSold = sold.filter((s) => s.side === "front").length;
  const backSold = sold.filter((s) => s.side === "back").length;
  const revenueCents = sold.reduce((sum, s) => sum + (s.price || 0), 0);

  res.json({
    dealerId: id,
    name: dealer.name,
    page: {
      slug: campaign.slug,
      url: campaign.slug ? `${getOrigin(req)}/${campaign.slug}` : null,
      published: campaign.isPublished,
      territory: campaign.territory,
      cityList: campaign.cityList,
      campaignId: campaign.id,
    },
    summary: {
      totalSpots: spots.length,
      soldSpots: sold.length,
      availableSpots: spots.filter((s) => s.status === "available").length,
      frontSold,
      backSold,
      revenueCents,
    },
    spots: spots
      .map((s) => ({
        id: s.id,
        gridArea: s.gridArea,
        side: s.side,
        size: s.size,
        status: s.status,
        businessName: s.businessName,
        price: s.price,
      }))
      .sort((a, b) => (a.side === b.side ? a.gridArea.localeCompare(b.gridArea) : a.side === "front" ? -1 : 1)),
  });
});

// ─── POST /api/admin/dealers ──────────────────────────────────────────────────
// Admin-only: create a dealer account that is immediately active (no Stripe
// payment required). Useful for dealers the admin adds directly rather than
// ones who self-sign-up through the dealer program checkout flow.
router.post("/admin/dealers", requireAdmin, async (req, res): Promise<void> => {
  const schema = z.object({
    name: z.string().min(1).max(200),
    email: z.string().email(),
    phone: z.string().optional(),
    password: z.string().min(8).max(128),
    territoryId: z.string().optional(), // e.g. "GA-003"
    isComped: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }
  const { name, email, phone, password, territoryId, isComped } = parsed.data;

  // Check for duplicate email
  const [existing] = await db.select({ id: dealersTable.id, status: dealersTable.status })
    .from(dealersTable)
    .where(eq(dealersTable.email, email));
  if (existing) {
    res.status(409).json({ error: `A dealer account for ${email} already exists (id ${existing.id}, status: ${existing.status}).` });
    return;
  }

  // Validate territory exists and is available if provided
  if (territoryId) {
    const [terr] = await db.select({ id: territoriesTable.id, status: territoriesTable.status })
      .from(territoriesTable)
      .where(eq(territoriesTable.id, territoryId));
    if (!terr) {
      res.status(404).json({ error: `Territory ${territoryId} not found.` });
      return;
    }
    if (terr.status === "taken") {
      res.status(409).json({ error: `Territory ${territoryId} is already taken.` });
      return;
    }
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();

  const dealer = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(dealersTable)
      .values({
        name,
        email,
        phone: phone ?? null,
        homeZip: "00000",
        status: "active",
        passwordHash,
        activatedAt: now,
        isComped: isComped ?? false,
      })
      .returning();

    if (territoryId) {
      const updated = await tx
        .update(territoriesTable)
        .set({ status: "taken", dealerId: created.id })
        .where(and(eq(territoriesTable.id, territoryId), eq(territoriesTable.status, "available")))
        .returning({ id: territoriesTable.id });
      if (updated.length === 0) {
        throw Object.assign(new Error(`Territory ${territoryId} is no longer available.`), { status: 409 });
      }
    }

    return created;
  });

  req.log.info({ dealerId: dealer.id, email, territoryId, isComped }, "Admin created dealer (no payment required)");

  // Auto-provision landing page campaigns and spots, exactly as the public signup flow does.
  let landingPageCreated = false;
  if (territoryId) {
    try {
      const campaignIds = await ensureDealerLandingPage(dealer.id);
      landingPageCreated = campaignIds.length > 0;
      req.log.info({ dealerId: dealer.id, campaignIds }, "Admin dealer: landing page auto-provisioned");

      // Comped dealers get their campaigns immediately set to active so they
      // show as live (not draft) in the admin UI and on territory pages.
      // This is safe because dealer territory campaigns are slug-accessed and
      // don't participate in the single-active-campaign invariant for the house picker.
      if (isComped && campaignIds.length > 0) {
        await db
          .update(campaignsTable)
          .set({ status: "active", isPublished: true })
          .where(inArray(campaignsTable.id, campaignIds));
        req.log.info({ dealerId: dealer.id, campaignIds }, "Admin dealer: comped — campaigns auto-activated");
      }
    } catch (err: unknown) {
      req.log.warn({ dealerId: dealer.id, err: (err as Error)?.message }, "Admin dealer: landing page provisioning failed — dealer still created");
    }
  }

  res.status(201).json({
    dealer: {
      id: dealer.id,
      name: dealer.name,
      email: dealer.email,
      phone: dealer.phone,
      status: dealer.status,
      portalToken: dealer.portalToken,
      activatedAt: dealer.activatedAt,
      createdAt: dealer.createdAt,
    },
    landingPageCreated,
  });
});

router.get("/admin/dealers", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.execute<{
    id: number;
    name: string;
    email: string;
    phone: string | null;
    home_zip: string;
    status: string;
    is_comped: boolean;
    created_at: Date | string;
    activated_at: Date | string | null;
    territory_count: number;
    total_households: number | null;
  }>(sql`
    SELECT
      d.id, d.name, d.email, d.phone, d.home_zip, d.status, d.is_comped,
      d.created_at, d.activated_at,
      (
        (SELECT COUNT(*)   FROM dealer_territories WHERE dealer_id = d.id) +
        COALESCE((SELECT SUM(zones) FROM territories WHERE dealer_id = d.id), 0)
      )::int AS territory_count,
      (
        COALESCE((SELECT SUM(estimated_households) FROM dealer_territories WHERE dealer_id = d.id), 0) +
        COALESCE((SELECT SUM(households)            FROM territories         WHERE dealer_id = d.id), 0)
      )::int AS total_households
    FROM dealers d
    ORDER BY d.created_at DESC
  `);

  const toIso = (v: Date | string | null | undefined): string | null => {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString();
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
  };

  res.json({
    dealers: rows.rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      email: r.email,
      phone: r.phone,
      homeZip: r.home_zip,
      status: r.status,
      isComped: Boolean(r.is_comped),
      createdAt: toIso(r.created_at),
      activatedAt: toIso(r.activated_at),
      territoryCount: Number(r.territory_count ?? 0),
      totalHouseholds: Number(r.total_households ?? 0),
    })),
  });
});

router.get("/admin/dealers/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid dealer id" });
    return;
  }
  const [dealer] = await db.select().from(dealersTable).where(eq(dealersTable.id, id));
  if (!dealer) {
    res.status(404).json({ error: "Dealer not found" });
    return;
  }

  // Legacy dealer_territories rows (ZIP-cluster dealers)
  const territories = await db
    .select()
    .from(dealerTerritoriesTable)
    .where(eq(dealerTerritoriesTable.dealerId, id))
    .orderBy(desc(dealerTerritoriesTable.territoryIndex));

  // Modern: campaigns linked to this dealer (one per hub city)
  const campaigns = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.dealerId, id))
    .orderBy(asc(campaignsTable.id));

  const origin = getOrigin(req);

  // ZIP count: prefer territory_zip_assignments (modern county dealers);
  // fall back to summing dealer_territories.zip_codes lengths (legacy).
  let dealerZipCount: number | null = null;
  const [linkedTerritory] = await db
    .select({ id: territoriesTable.id })
    .from(territoriesTable)
    .where(eq(territoriesTable.dealerId, id))
    .limit(1);
  if (linkedTerritory) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(territoryZipAssignmentsTable)
      .where(eq(territoryZipAssignmentsTable.territoryId, linkedTerritory.id));
    dealerZipCount = count ?? 0;
  } else if (territories.length > 0) {
    dealerZipCount = territories.reduce(
      (sum, t) => sum + (Array.isArray(t.zipCodes) ? t.zipCodes.length : 0),
      0,
    );
  }

  // Per-campaign spot stats (N queries, but dealer territory counts are small)
  const campaignStats = await Promise.all(
    campaigns.map(async (c) => {
      const spots = await db
        .select({ status: spotsTable.status, price: spotsTable.price })
        .from(spotsTable)
        .where(eq(spotsTable.campaignId, c.id));
      const sold = spots.filter((s) => s.status === "paid");
      const revenueCents = sold.reduce((sum, s) => sum + (s.price ?? 0), 0);
      return {
        campaignId: c.id,
        label: c.cityList || c.territory || c.name,
        slug: c.slug,
        pageUrl: c.slug ? `${origin}/${c.slug}` : null,
        isPublished: c.isPublished ?? false,
        totalSpots: spots.length,
        soldSpots: sold.length,
        availableSpots: spots.filter((s) => s.status === "available").length,
        revenueCents,
        commissionCents: computeCommissionCents(revenueCents),
        estimatedHouseholds: c.homesCount ?? 0,
        zipCount: dealerZipCount,
      };
    }),
  );

  const totalRevenueCentsAcrossAll = campaignStats.reduce((s, c) => s + c.revenueCents, 0);
  const totals = {
    totalSpotsAcrossAll: campaignStats.reduce((s, c) => s + c.totalSpots, 0),
    totalSoldAcrossAll: campaignStats.reduce((s, c) => s + c.soldSpots, 0),
    totalRevenueCentsAcrossAll,
    totalCommissionCentsAcrossAll: computeCommissionCents(totalRevenueCentsAcrossAll),
  };

  res.json({
    dealer: {
      ...dealer,
      createdAt: dealer.createdAt instanceof Date ? dealer.createdAt.toISOString() : dealer.createdAt,
      activatedAt:
        dealer.activatedAt instanceof Date ? dealer.activatedAt.toISOString() : dealer.activatedAt,
      cancelledAt:
        dealer.cancelledAt instanceof Date ? dealer.cancelledAt.toISOString() : dealer.cancelledAt,
    },
    territories: territories.map((t) => ({
      territoryIndex: t.territoryIndex,
      zipCodes: t.zipCodes,
      centerLat: t.centerLat,
      centerLng: t.centerLng,
      cityLabel: t.cityLabel,
      estimatedHouseholds: t.estimatedHouseholds,
    })),
    campaigns: campaignStats,
    totals,
  });
});

// ─── POST /api/admin/dealers/:id/rebuild-landing-page ─────────────────────────
// Re-runs ensureDealerLandingPage for a dealer. Useful for correcting campaigns
// when zone_note was updated or a prior run created malformed city_list values.
router.post("/admin/dealers/:id/rebuild-landing-page", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid dealer id" });
    return;
  }
  const [dealer] = await db.select().from(dealersTable).where(eq(dealersTable.id, id));
  if (!dealer) {
    res.status(404).json({ error: "Dealer not found" });
    return;
  }
  const campaignIds = await ensureDealerLandingPage(id);
  req.log.info({ dealerId: id, campaignIds }, "Rebuilt dealer landing page via admin");
  res.json({ ok: true, campaignIds });
});

// ─── GET /api/admin/dealers/:id/delete-preview ────────────────────────────────
// Returns a summary of what a full delete would remove, without deleting anything.
router.get("/admin/dealers/:id/delete-preview", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid dealer id" }); return; }

  const [dealer] = await db.select({ id: dealersTable.id, name: dealersTable.name })
    .from(dealersTable).where(eq(dealersTable.id, id));
  if (!dealer) { res.status(404).json({ error: "Dealer not found" }); return; }

  const campaigns = await db
    .select({ id: campaignsTable.id, name: campaignsTable.name, slug: campaignsTable.slug })
    .from(campaignsTable)
    .where(eq(campaignsTable.dealerId, id));

  const campaignSummaries = await Promise.all(
    campaigns.map(async (c) => {
      const spots = await db
        .select({ id: spotsTable.id, status: spotsTable.status })
        .from(spotsTable)
        .where(eq(spotsTable.campaignId, c.id));
      return {
        campaignId: c.id,
        name: c.name,
        slug: c.slug,
        totalSpots: spots.length,
        paidSpots: spots.filter((s) => s.status === "paid").length,
        reservedSpots: spots.filter((s) => s.status === "reserved").length,
      };
    }),
  );

  res.json({ dealerName: dealer.name, campaigns: campaignSummaries });
});

// ─── Helper: archive a dealer to former_dealers before deletion ───────────────
async function archiveDealerSnapshot(dealer: typeof dealersTable.$inferSelect): Promise<void> {
  // Collect territory snapshot from both the territories table (named territories)
  // and dealer_territories (ZIP-cluster territories from legacy flow).
  const namedTerritories = await db
    .select({ id: territoriesTable.id, name: territoriesTable.name, households: territoriesTable.households })
    .from(territoriesTable)
    .where(eq(territoriesTable.dealerId, dealer.id));

  const zipTerritories = await db
    .select({ cityLabel: dealerTerritoriesTable.cityLabel, estimatedHouseholds: dealerTerritoriesTable.estimatedHouseholds })
    .from(dealerTerritoriesTable)
    .where(eq(dealerTerritoriesTable.dealerId, dealer.id));

  const territoriesSnapshot = [
    ...namedTerritories.map((t) => ({ id: t.id, name: t.name, households: t.households })),
    ...zipTerritories.map((t) => ({ name: t.cityLabel, households: t.estimatedHouseholds })),
  ];

  await db.insert(formerDealersTable).values({
    originalDealerId: dealer.id,
    name: dealer.name,
    email: dealer.email,
    phone: dealer.phone ?? null,
    homeZip: dealer.homeZip ?? null,
    statusAtDeletion: dealer.status,
    stripeCustomerId: dealer.stripeCustomerId ?? null,
    stripeSubscriptionId: dealer.stripeSubscriptionId ?? null,
    isComped: dealer.isComped,
    territoriesSnapshot,
    activatedAt: dealer.activatedAt ?? null,
    originalCreatedAt: dealer.createdAt,
  });
}

// ─── DELETE /api/admin/dealers/:id ────────────────────────────────────────────
// mode=archive      — (recommended) archive snapshot → release territories → full cascade delete
// mode=dealer-only  — archive → delete dealer row only; campaigns get dealerId → null
// mode=full         — archive → delete dealer + linked campaigns + all child records
// mode=deactivate   — soft cancel: status='cancelled', campaigns isPublished=false (no archive)
router.delete("/admin/dealers/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid dealer id" }); return; }

  const mode = String(req.query.mode ?? req.body?.mode ?? "");
  if (!["archive", "dealer-only", "full", "deactivate"].includes(mode)) {
    res.status(400).json({ error: "mode must be archive, dealer-only, full, or deactivate" });
    return;
  }

  const [dealer] = await db.select().from(dealersTable).where(eq(dealersTable.id, id));
  if (!dealer) { res.status(404).json({ error: "Dealer not found" }); return; }

  if (mode === "deactivate") {
    await db.update(dealersTable).set({ status: "cancelled" }).where(eq(dealersTable.id, id));
    await db.update(campaignsTable).set({ isPublished: false }).where(eq(campaignsTable.dealerId, id));
    await setTerritoryStatusForDealer(id, "available");
    req.log.info({ dealerId: id }, "Dealer deactivated (soft cancel)");
    res.json({ ok: true, mode: "deactivate", dealerName: dealer.name });
    return;
  }

  // All destructive modes archive the dealer snapshot first.
  await archiveDealerSnapshot(dealer);

  if (mode === "dealer-only") {
    await setTerritoryStatusForDealer(id, "available");
    await db.update(campaignsTable).set({ dealerId: null }).where(eq(campaignsTable.dealerId, id));
    await db.delete(dealerPasswordResetsTable).where(eq(dealerPasswordResetsTable.dealerId, id));
    await db.delete(dealerTerritoryClaimsTable).where(eq(dealerTerritoryClaimsTable.dealerId, id));
    await db.delete(dealerTerritoriesTable).where(eq(dealerTerritoriesTable.dealerId, id));
    await db.delete(adminActionsTable).where(eq(adminActionsTable.targetDealerId, id));
    await db.delete(territoryProposalsTable).where(eq(territoryProposalsTable.dealerId, id));
    await db.delete(dealersTable).where(eq(dealersTable.id, id));
    req.log.info({ dealerId: id }, "Dealer archived + removed; campaigns kept (dealerId set null)");
    res.json({ ok: true, mode: "dealer-only", dealerName: dealer.name });
    return;
  }

  // mode === "full" or "archive" — cascade delete everything
  const campaigns = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(eq(campaignsTable.dealerId, id));
  const campaignIds = campaigns.map((c) => c.id);

  if (campaignIds.length > 0) {
    const spots = await db
      .select({ id: spotsTable.id })
      .from(spotsTable)
      .where(sql`${spotsTable.campaignId} = ANY(${sql.raw(`ARRAY[${campaignIds.join(",")}]::int[]`)})`)
    const spotIds = spots.map((s) => s.id);

    if (spotIds.length > 0) {
      const spotArr = sql.raw(`ARRAY[${spotIds.join(",")}]::int[]`);
      await db.execute(sql`DELETE FROM qr_scans WHERE spot_id = ANY(${spotArr})`);
      const campArr = sql.raw(`ARRAY[${campaignIds.join(",")}]::int[]`);
      await db.execute(sql`DELETE FROM subscription_issue_assignments WHERE spot_id = ANY(${spotArr}) OR campaign_id = ANY(${campArr})`);
      await db.execute(sql`DELETE FROM spot_subscriptions WHERE initial_spot_id = ANY(${spotArr})`);
      await db.execute(sql`DELETE FROM orders WHERE spot_id = ANY(${spotArr})`);
      await db.execute(sql`DELETE FROM spots WHERE id = ANY(${spotArr})`);
    } else {
      const campArr = sql.raw(`ARRAY[${campaignIds.join(",")}]::int[]`);
      await db.execute(sql`DELETE FROM subscription_issue_assignments WHERE campaign_id = ANY(${campArr})`);
    }
    await db.execute(sql`DELETE FROM campaigns WHERE dealer_id = ${id}`);
  }

  await db.delete(dealerPasswordResetsTable).where(eq(dealerPasswordResetsTable.dealerId, id));
  await db.delete(dealerTerritoryClaimsTable).where(eq(dealerTerritoryClaimsTable.dealerId, id));
  await db.delete(dealerTerritoriesTable).where(eq(dealerTerritoriesTable.dealerId, id));
  await db.delete(adminActionsTable).where(eq(adminActionsTable.targetDealerId, id));
  await db.delete(territoryProposalsTable).where(eq(territoryProposalsTable.dealerId, id));
  await setTerritoryStatusForDealer(id, "available");
  await db.delete(dealersTable).where(eq(dealersTable.id, id));

  req.log.info({ dealerId: id, campaignCount: campaignIds.length }, "Dealer archived + fully deleted");
  res.json({ ok: true, mode, dealerName: dealer.name, campaignsDeleted: campaignIds.length });
});

// ─── GET /api/admin/former-dealers ────────────────────────────────────────────
router.get("/admin/former-dealers", requireAdmin, async (req, res): Promise<void> => {
  const former = await db
    .select()
    .from(formerDealersTable)
    .orderBy(desc(formerDealersTable.deletedAt));
  res.json({ formerDealers: former });
});

// ─── GET /api/dealers/portal-data (cookie-auth version of /dealer-portal) ─────
// Used by DealerDashboard.jsx (cookie-auth). Returns the same data shape as
// the legacy token-based /dealer-portal endpoint but authenticates via the
// dealer_token httpOnly cookie instead.
router.get("/dealers/portal-data", requireDealerAuth, async (req, res): Promise<void> => {
  const dealer = (res as any).locals.dealer;

  const [territory] = await db
    .select()
    .from(territoriesTable)
    .where(eq(territoriesTable.dealerId, dealer.id));

  const allCampaigns = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.dealerId, dealer.id))
    .orderBy(asc(campaignsTable.id));

  const origin = getOrigin(req);

  const campaignSummaries = await Promise.all(
    allCampaigns.map(async (c) => {
      const spots = await db
        .select()
        .from(spotsTable)
        .where(eq(spotsTable.campaignId, c.id));
      const sold = spots.filter((s) => s.status === "paid");
      const revenueCents = sold.reduce((sum, s) => sum + (s.price || 0), 0);
      return {
        campaignId: c.id,
        campaignName: c.name,
        cityList: c.cityList,
        slug: c.slug,
        pageUrl: c.slug ? `${origin}/${c.slug}` : null,
        isPublished: c.isPublished,
        firstPaidAt: c.firstPaidAt?.toISOString() ?? null,
        totalSpots: spots.length,
        soldSpots: sold.length,
        availableSpots: spots.filter((s) => s.status === "available").length,
        revenueCents,
        commissionCents: computeCommissionCents(revenueCents),
        spots: spots.map((s) => ({
          gridArea: s.gridArea,
          side: s.side,
          status: s.status,
          businessName: s.businessName ?? null,
          adFileUrl: s.adFileUrl ?? null,
        })),
      };
    }),
  );

  const totalRevenueCents = campaignSummaries.reduce((s, c) => s + c.revenueCents, 0);

  res.json({
    dealerId: dealer.id,
    name: dealer.name,
    email: dealer.email,
    status: dealer.status,
    territory: territory
      ? { id: territory.id, name: territory.name, counties: territory.counties, households: territory.households }
      : null,
    campaigns: campaignSummaries,
    campaign: campaignSummaries[0] ?? null,
    totals: {
      totalRevenueCents,
      totalCommissionCents: computeCommissionCents(totalRevenueCents),
    },
  });
});

// ─── GET /api/dealers/csrf-token ─────────────────────────────────────────────
// Issues the CSRF double-submit cookie and returns the token in JSON.
// The frontend fetches this before any state-mutating dealer auth request.
router.get("/dealers/csrf-token", (req, res): void => {
  const token = generateCsrfToken();
  setCsrfCookie(res, token);
  res.json({ csrfToken: token });
});

// ─── POST /api/dealers/login ──────────────────────────────────────────────────
router.post("/dealers/login", loginLimiter, csrfProtect, async (req, res): Promise<void> => {
  const { email, password, rememberMe } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  // ── IP-based failed attempt check ─────────────────────────────────────────
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const ipEntry = ipFailedAttempts.get(ip);
  if (ipEntry && now - ipEntry.windowStart < IP_WINDOW_MS && ipEntry.count >= IP_MAX_FAILURES) {
    res.status(429).json({ error: "Too many failed attempts from this address. Please try again in 10 minutes." });
    return;
  }

  const [dealer] = await db
    .select()
    .from(dealersTable)
    .where(eq(dealersTable.email, email.trim().toLowerCase()));

  const INVALID_MSG = "Invalid email or password.";

  if (!dealer) {
    // Still count IP failures for non-existent accounts (prevents enumeration via timing)
    _recordIpFailure(ip);
    res.status(401).json({ error: INVALID_MSG });
    return;
  }

  // ── Per-account lockout check ────────────────────────────────────────────
  if (dealer.lockedUntil && dealer.lockedUntil > new Date()) {
    res.status(429).json({ error: "Account is temporarily locked. Please try again in 10 minutes." });
    return;
  }

  if (!dealer.passwordHash) {
    _recordIpFailure(ip);
    res.status(401).json({ error: INVALID_MSG });
    return;
  }

  const valid = await verifyPassword(password, dealer.passwordHash);
  if (!valid) {
    // If the previous lock has expired, start a fresh window — otherwise cumulative
    // counts would re-lock the account on the very first attempt after expiry.
    const lockExpired = dealer.lockedUntil && dealer.lockedUntil <= new Date();
    const priorAttempts = lockExpired ? 0 : (dealer.failedLoginAttempts ?? 0);
    const attempts = priorAttempts + 1;
    const shouldLock = attempts >= 5;

    await db
      .update(dealersTable)
      .set({
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + 10 * 60 * 1000) : null,
      })
      .where(eq(dealersTable.id, dealer.id));

    _recordIpFailure(ip);
    res.status(401).json({ error: INVALID_MSG });
    return;
  }

  // ── Success — reset all failure counters ─────────────────────────────────
  await db
    .update(dealersTable)
    .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(dealersTable.id, dealer.id));

  ipFailedAttempts.delete(ip);

  const token = signDealerToken({ dealer_id: dealer.id }, { rememberMe: !!rememberMe });
  setDealerCookie(res, token, !!rememberMe);

  req.log.info({ dealerId: dealer.id }, "Dealer logged in");
  res.json({ ok: true, dealerId: dealer.id, token });
});

function _recordIpFailure(ip: string): void {
  const now = Date.now();
  const existing = ipFailedAttempts.get(ip);
  if (!existing || now - existing.windowStart >= IP_WINDOW_MS) {
    ipFailedAttempts.set(ip, { count: 1, windowStart: now });
  } else {
    ipFailedAttempts.set(ip, { count: existing.count + 1, windowStart: existing.windowStart });
  }
}

// ─── POST /api/dealers/logout ─────────────────────────────────────────────────
router.post("/dealers/logout", csrfProtect, (req, res): void => {
  clearDealerCookie(res);
  res.json({ ok: true });
});

// ─── GET /api/dealers/me ──────────────────────────────────────────────────────
router.get("/dealers/me", requireDealerAuth, async (req, res): Promise<void> => {
  const dealer = (res as any).locals.dealer;
  const tokenPayload = (res as any).locals.dealerToken;

  const [territory] = await db
    .select()
    .from(territoriesTable)
    .where(eq(territoriesTable.dealerId, dealer.id));

  res.json({
    dealerId: dealer.id,
    name: dealer.name,
    email: dealer.email,
    status: dealer.status,
    impersonatedBy: tokenPayload?.impersonatedBy ?? null,
    // Exposed only while pending so the dashboard can offer a "retry confirm" link.
    stripeCheckoutSessionId: dealer.status === "pending_payment" ? dealer.stripeCheckoutSessionId : null,
    territory: territory
      ? { id: territory.id, name: territory.name, households: territory.households }
      : null,
  });
});

// ─── POST /api/dealers/forgot-password ───────────────────────────────────────
router.post("/dealers/forgot-password", forgotPasswordLimiter, csrfProtect, async (req, res): Promise<void> => {
  const { email } = req.body ?? {};
  // Always return success regardless of whether email exists (prevents enumeration)
  const GENERIC_MSG = "If that email is registered you'll receive a link shortly.";

  if (typeof email !== "string" || !email.trim()) {
    res.json({ ok: true, message: GENERIC_MSG });
    return;
  }

  const [dealer] = await db
    .select()
    .from(dealersTable)
    .where(eq(dealersTable.email, email.trim().toLowerCase()));

  if (!dealer) {
    res.json({ ok: true, message: GENERIC_MSG });
    return;
  }

  const rawToken = generateResetToken();
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(dealerPasswordResetsTable).values({
    dealerId: dealer.id,
    tokenHash,
    expiresAt,
  });

  const appUrl = process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}`
      : "http://localhost:3000");
  const resetLink = `${appUrl}/dealer/reset-password?token=${rawToken}`;

  try {
    await sendDealerPasswordResetEmail({
      dealerName: dealer.name,
      dealerEmail: dealer.email,
      resetLink,
    });
  } catch (err: any) {
    req.log.error({ err: err?.message, dealerId: dealer.id }, "Failed to send password reset email");
  }

  req.log.info({ dealerId: dealer.id }, "Password reset token generated");
  res.json({ ok: true, message: GENERIC_MSG });
});

// ─── POST /api/dealers/reset-password ────────────────────────────────────────
router.post("/dealers/reset-password", csrfProtect, async (req, res): Promise<void> => {
  const { token, newPassword } = req.body ?? {};

  if (typeof token !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ error: "Token and new password are required." });
    return;
  }

  const complexityError = validatePasswordComplexity(newPassword);
  if (complexityError) {
    res.status(400).json({ error: complexityError });
    return;
  }

  const tokenHash = hashResetToken(token);
  const now = new Date();

  const [resetRow] = await db
    .select()
    .from(dealerPasswordResetsTable)
    .where(
      and(
        eq(dealerPasswordResetsTable.tokenHash, tokenHash),
        isNull(dealerPasswordResetsTable.usedAt),
        gt(dealerPasswordResetsTable.expiresAt, now),
      ),
    );

  if (!resetRow) {
    res.status(400).json({ error: "This link has expired or already been used." });
    return;
  }

  const newHash = await hashPassword(newPassword);

  await db
    .update(dealersTable)
    .set({ passwordHash: newHash, failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(dealersTable.id, resetRow.dealerId));

  await db
    .update(dealerPasswordResetsTable)
    .set({ usedAt: now })
    .where(eq(dealerPasswordResetsTable.id, resetRow.id));

  clearDealerCookie(res);
  req.log.info({ dealerId: resetRow.dealerId }, "Dealer password reset");
  res.json({ ok: true });
});

// ─── POST /api/admin/dealers/:id/impersonate ──────────────────────────────────
router.post("/admin/dealers/:id/impersonate", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid dealer id" });
    return;
  }

  const [dealer] = await db.select().from(dealersTable).where(eq(dealersTable.id, id));
  if (!dealer) {
    res.status(404).json({ error: "Dealer not found" });
    return;
  }

  const token = signDealerToken(
    { dealer_id: dealer.id, impersonatedBy: "admin" },
    { shortLived: true },
  );

  await db.insert(adminActionsTable).values({
    adminId: "admin",
    action: "impersonate_dealer",
    targetDealerId: dealer.id,
    metadata: { dealerName: dealer.name, dealerEmail: dealer.email },
  });

  setDealerCookie(res, token, false);
  req.log.info({ dealerId: dealer.id }, "Admin impersonating dealer");
  res.json({ ok: true, dealerId: dealer.id, token });
});

// ─── GET /api/admin/audit-log ─────────────────────────────────────────────────
router.get("/admin/audit-log", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(adminActionsTable)
    .orderBy(desc(adminActionsTable.createdAt))
    .limit(100);

  const toIso = (v: Date | string | null | undefined): string | null => {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString();
    const d = new Date(v as string);
    return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
  };

  res.json({
    actions: rows.map((r) => ({
      id: r.id,
      adminId: r.adminId,
      action: r.action,
      targetDealerId: r.targetDealerId,
      metadata: r.metadata,
      createdAt: toIso(r.createdAt),
    })),
  });
});

export default router;

/**
 * Webhook helpers. Called from routes/webhooks.ts when the Stripe event
 * carries dealer metadata (kind=dealer). Kept here so all dealer-state
 * transitions live in one file.
 */
export async function activateDealerFromCheckoutSession(
  session: any,
  explicitDealerId?: number | null,
): Promise<number | null> {
  const dealerIdStr = (session?.metadata as any)?.dealerId;
  const dealerId =
    explicitDealerId ?? (dealerIdStr ? parseInt(String(dealerIdStr), 10) : null);
  if (!dealerId || !Number.isFinite(dealerId)) return null;

  const [dealer] = await db.select().from(dealersTable).where(eq(dealersTable.id, dealerId));
  if (!dealer) return null;
  if (dealer.status === "active") {
    // Already active — ensure territory is "taken" in case the confirm
    // endpoint ran before the territory FK was set (idempotent).
    await setTerritoryStatusForDealer(dealerId, "taken");
    return dealerId;
  }
  // Only activate from pending_payment — a replayed webhook on a previously
  // cancelled dealer should NOT resurrect them.
  if (dealer.status !== "pending_payment") return null;

  await db
    .update(dealersTable)
    .set({
      status: "active",
      stripeCustomerId:
        typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
      stripeSubscriptionId:
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null,
      activatedAt: new Date(),
    })
    .where(eq(dealersTable.id, dealerId));

  await setTerritoryStatusForDealer(dealerId, "taken");

  try {
    const campaignIds = await ensureDealerLandingPage(dealerId);
    logger.info({ dealerId, campaignCount: campaignIds.length, campaignIds }, "ensureDealerLandingPage complete via webhook");
  } catch (err: any) {
    logger.error({ err: err?.message, dealerId }, "ensureDealerLandingPage failed in webhook activation");
  }

  try {
    const appUrl =
      process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
      (process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}`
        : "http://localhost:3000");
    const rawToken = generateResetToken();
    const tokenHash = hashResetToken(rawToken);
    await db.insert(dealerPasswordResetsTable).values({
      dealerId,
      tokenHash,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    });
    // Fetch ALL legacy territory rows so we can count zones for the email.
    const legacyTerritories = await db
      .select({ cityLabel: dealerTerritoriesTable.cityLabel })
      .from(dealerTerritoriesTable)
      .where(eq(dealerTerritoriesTable.dealerId, dealerId));

    // Named territory (new-style) — fetch cities for the welcome email.
    const [namedTerritory] = await db
      .select({
        name: territoriesTable.name,
        sourceProposalId: territoriesTable.sourceProposalId,
      })
      .from(territoriesTable)
      .where(eq(territoriesTable.dealerId, dealerId));

    let welcomeCities: string[] = [];
    const welcomeTerritoryName = namedTerritory?.name ?? legacyTerritories[0]?.cityLabel ?? null;

    if (namedTerritory?.sourceProposalId) {
      const [proposal] = await db
        .select({ proposedCities: territoryProposalsTable.proposedCities })
        .from(territoryProposalsTable)
        .where(eq(territoryProposalsTable.id, namedTerritory.sourceProposalId));
      if (Array.isArray(proposal?.proposedCities)) {
        welcomeCities = proposal.proposedCities;
      }
    }

    // Zone count drives the "X households" line: each zone = 5,000 via USPS EDDM.
    // Named-territory dealers: one zone per proposed city.
    // Legacy dealers: one zone per dealerTerritoriesTable row.
    const welcomeZoneCount = namedTerritory
      ? welcomeCities.length
      : legacyTerritories.length;

    // Dealer set their password during signup — no setPasswordLink needed.
    await sendDealerWelcomeEmail({
      dealerName: dealer.name,
      dealerEmail: dealer.email,
      territoryName: welcomeTerritoryName,
      cities: welcomeCities,
      zoneCount: welcomeZoneCount > 0 ? welcomeZoneCount : undefined,
      loginLink: `${appUrl}/dealer/login`,
    });
    sendAdminNewDealerEmail({
      dealerId,
      dealerName: dealer.name,
      dealerEmail: dealer.email,
      territoryName: welcomeTerritoryName,
    }).catch((err: any) =>
      logger.error({ err: err?.message, dealerId }, "Failed to send admin new dealer email"),
    );
  } catch (err: any) {
    logger.error({ err: err?.message, dealerId }, "Failed to send dealer welcome email via webhook");
  }

  return dealerId;
}

export async function cancelDealerFromSubscription(subscription: any): Promise<number | null> {
  const subId = subscription?.id;
  if (!subId) return null;
  const [dealer] = await db
    .select()
    .from(dealersTable)
    .where(eq(dealersTable.stripeSubscriptionId, String(subId)));
  if (!dealer) return null;
  if (dealer.status === "cancelled") return dealer.id; // idempotent
  await db
    .update(dealersTable)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(eq(dealersTable.id, dealer.id));

  // Release the territory back to "available" so another dealer can claim it.
  await setTerritoryStatusForDealer(dealer.id, "available");

  // Notify the admin — fire-and-forget so a Resend failure never blocks the
  // cancellation path. Look up the territory label the same way activation does.
  const [territory] = await db
    .select({ cityLabel: dealerTerritoriesTable.cityLabel })
    .from(dealerTerritoriesTable)
    .where(eq(dealerTerritoriesTable.dealerId, dealer.id));
  sendAdminDealerCancelledEmail({
    dealerId: dealer.id,
    dealerName: dealer.name,
    dealerEmail: dealer.email,
    territoryName: territory?.cityLabel ?? null,
  }).catch((err: any) =>
    logger.error({ err: err?.message, dealerId: dealer.id }, "Failed to send admin dealer cancelled email"),
  );

  return dealer.id;
}

/**
 * Refunds the most recent invoice and cancels the subscription for a territory
 * claim that could not be honored (post-payment conflict). Also flips the
 * dealer to "cancelled". Best-effort — logs but never throws on Stripe errors.
 */
async function refundAndCancelTerritoryClaim(
  session: any,
  dealerId: number | null,
): Promise<void> {
  const stripe = await getStripeClient();
  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
  if (subId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId, {
        expand: ["latest_invoice.payment_intent"],
      });
      const pi = (sub as any).latest_invoice?.payment_intent;
      const piId = typeof pi === "string" ? pi : pi?.id ?? null;
      if (piId) {
        await stripe.refunds.create({ payment_intent: piId });
      }
      await stripe.subscriptions.cancel(subId);
    } catch (err: any) {
      logger.error({ err: err?.message, subId }, "Failed to refund/cancel territory claim subscription");
    }
  }
  if (dealerId) {
    await db
      .update(dealersTable)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(dealersTable.id, dealerId));
  }
}

/**
 * Webhook activation for the unified territory-claim flow (metadata
 * kind=territory). Idempotent. Materializes the territory from the referenced
 * proposal on payment success, unless an overlapping territory appeared during
 * checkout — in which case the claim is refunded and the dealer notified.
 */
export async function activateTerritoryClaimFromCheckoutSession(session: any): Promise<void> {
  const meta = (session?.metadata ?? {}) as Record<string, string>;
  const proposalId = meta.proposal_id ? parseInt(String(meta.proposal_id), 10) : null;
  if (!proposalId || !Number.isFinite(proposalId)) {
    logger.warn({ sessionId: session?.id }, "territory checkout.session.completed missing proposal_id — skipping");
    return;
  }

  const [proposal] = await db
    .select()
    .from(territoryProposalsTable)
    .where(eq(territoryProposalsTable.id, proposalId));
  if (!proposal) {
    logger.warn({ proposalId }, "territory claim: proposal not found — skipping");
    return;
  }
  // Dealer is recovered from the proposal record — Stripe metadata carries ONLY
  // proposal_id, never the dealer id.
  const dealerId = proposal.dealerId ?? null;

  // Idempotency: a territory already materialized from this proposal means a
  // prior (possibly retried) webhook already handled it. Just ensure the dealer
  // is active and exit.
  const [existingTerritory] = await db
    .select({ id: territoriesTable.id })
    .from(territoriesTable)
    .where(eq(territoriesTable.sourceProposalId, proposalId));
  if (existingTerritory) {
    await activateDealerFromCheckoutSession(session, dealerId);
    return;
  }
  if (proposal.status === "claimed") return; // defensive

  // Post-payment conflict re-check — two layers:
  //   (A) 25-mile centroid proximity (fast, catches obvious overlaps)
  //   (B) ZIP footprint overlap against territory_zip_assignments (precise)
  //
  // Both checks apply a county-membership guard: a conflict is only genuine when
  // the conflicting territory shares at least one declared county with the proposal.
  // This prevents neighboring-county ZIP bleed (e.g. White/Habersham territory
  // has some Rabun County ZIPs from its 15-mile footprint) from blocking dealers
  // in those neighboring counties.
  const proposalCounties: string[] = Array.isArray(proposal.proposedCounties)
    ? (proposal.proposedCounties as string[])
    : [];

  if (proposal.centroidLat != null && proposal.centroidLng != null) {
    const conflict = await findExistingTerritoryWithinMiles(
      proposal.centroidLat,
      proposal.centroidLng,
      proposal.stateAbbr,
      25,
      { statuses: ["taken", "pending"] },
    );
    if (conflict && proposalCountiesOverlapTerritory(proposalCounties, conflict)) {
      await db
        .update(territoryProposalsTable)
        .set({ status: "conflict", reviewedAt: new Date(), notes: `Conflict with ${String(conflict.id)}` })
        .where(eq(territoryProposalsTable.id, proposalId));
      await refundAndCancelTerritoryClaim(session, dealerId);
      if (proposal.dealerEmail) {
        await sendTerritoryConflictEmail({
          dealerName: proposal.dealerName ?? "Dealer",
          dealerEmail: proposal.dealerEmail,
          territoryName: proposal.proposedName,
        });
      }
      logger.info(
        { proposalId, dealerId, conflictTerritoryId: String(conflict.id) },
        "Territory claim refunded — centroid overlap appeared during checkout",
      );
      return;
    }
  }

  // (B) ZIP footprint overlap: catches conflicts where centroids are >25 mi
  // apart but 15-mile catchment circles still share ZIP codes.
  {
    const cities = Array.isArray(proposal.proposedCities) ? proposal.proposedCities : [];
    const hubs = resolveProposalHubs(
      cities,
      proposal.stateAbbr,
      proposal.centroidLat,
      proposal.centroidLng,
    );
    if (hubs.length > 0) {
      const zipConflictId = await checkZipFootprintConflict(hubs);
      if (zipConflictId) {
        // County guard: fetch the conflicting territory and verify it shares a county
        // with this proposal before treating it as a genuine conflict.
        const [conflictRow] = await db
          .select()
          .from(territoriesTable)
          .where(eq(territoriesTable.id, zipConflictId));
        const isRealConflict = !conflictRow ||
          proposalCountiesOverlapTerritory(proposalCounties, conflictRow as Record<string, unknown>);
        if (isRealConflict) {
          await db
            .update(territoryProposalsTable)
            .set({
              status: "conflict",
              reviewedAt: new Date(),
              notes: `ZIP footprint conflict with territory ${zipConflictId}`,
            })
            .where(eq(territoryProposalsTable.id, proposalId));
          await refundAndCancelTerritoryClaim(session, dealerId);
          if (proposal.dealerEmail) {
            await sendTerritoryConflictEmail({
              dealerName: proposal.dealerName ?? "Dealer",
              dealerEmail: proposal.dealerEmail,
              territoryName: proposal.proposedName,
            });
          }
          logger.info(
            { proposalId, dealerId, zipConflictTerritoryId: zipConflictId },
            "Territory claim refunded — ZIP footprint overlap appeared during checkout",
          );
          return;
        }
        logger.info(
          { proposalId, dealerId, skippedConflictId: zipConflictId, proposalCounties },
          "ZIP footprint conflict skipped — conflicting territory is in a different county (neighboring bleed)",
        );
      }
    }
  }

  // No conflict (pre-checks passed) — materialize the territory.
  // materializeTerritoryFromProposal runs territory insert + ZIP footprint in
  // one transaction and throws ZipFootprintConflictError if a concurrent
  // checkout won the same ZIPs between our pre-check and the DB write.
  let territoryId: string;
  try {
    territoryId = await materializeTerritoryFromProposal(proposal, dealerId);
  } catch (err) {
    if (err instanceof ZipFootprintConflictError) {
      await db
        .update(territoryProposalsTable)
        .set({
          status: "conflict",
          reviewedAt: new Date(),
          notes: `Concurrent ZIP footprint conflict: ${err.conflictingZip} claimed by ${err.conflictingTerritoryId}`,
        })
        .where(eq(territoryProposalsTable.id, proposalId));
      await refundAndCancelTerritoryClaim(session, dealerId);
      if (proposal.dealerEmail) {
        await sendTerritoryConflictEmail({
          dealerName: proposal.dealerName ?? "Dealer",
          dealerEmail: proposal.dealerEmail,
          territoryName: proposal.proposedName,
        });
      }
      logger.info(
        { proposalId, dealerId, conflictZip: err.conflictingZip, winnerTerritoryId: err.conflictingTerritoryId },
        "Territory claim refunded — concurrent ZIP footprint race lost during materialization",
      );
      return;
    }
    throw err;
  }

  // Mark the proposal claimed and activate the dealer
  // (flips active, stores Stripe ids, builds landing page).
  await db
    .update(territoryProposalsTable)
    .set({ status: "claimed", territoryId, reviewedAt: new Date() })
    .where(eq(territoryProposalsTable.id, proposalId));
  await activateDealerFromCheckoutSession(session, dealerId);
  logger.info({ proposalId, dealerId, territoryId }, "Territory claim activated from checkout session");
}
