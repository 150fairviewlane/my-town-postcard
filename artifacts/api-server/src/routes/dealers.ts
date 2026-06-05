import { Router, type IRouter, type Request } from "express";
import { eq, sql, desc, asc, and, or, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import jwt from "jsonwebtoken";
import {
  db,
  dealersTable,
  dealerTerritoriesTable,
  campaignsTable,
  spotsTable,
  territoriesTable,
  territoryProposalsTable,
} from "@workspace/db";
import { getStripeClient, isStripeConfigured } from "../lib/stripeClient";
import { ensureDealerLandingPage } from "../lib/dealerLandingPage";
import {
  materializeTerritoryFromProposal,
  findExistingTerritoryWithinMiles,
  resolveProposalHubs,
  checkZipFootprintConflict,
  ZipFootprintConflictError,
} from "../lib/territoryBuilder";
import {
  sendTerritoryClaimedEmail,
  sendTerritoryConflictEmail,
} from "../lib/emails";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Pricing for the Phase 1 dealer program. Setup fee is a one-time line item
// on the first invoice; the $99/mo subscription is the recurring half. Both
// are inlined as Stripe `price_data` so we don't have to pre-create Products
// in the Stripe dashboard for QA / dev.
const SETUP_FEE_CENTS = 9900;
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
  }),
  z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(180),
    phone: z.string().trim().max(40).optional().nullable(),
    homeZip: z.string().regex(/^\d{5}$/),
    territories: z.array(LegacyTerritorySchema).min(1).max(8),
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
    res.status(409).json({ error: "A dealer account with this email is already active." });
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
          .values({ name, email, phone: phone ?? null, homeZip, status: "pending_payment" })
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
          product_data: { name: "My Town Postcard — Dealer Setup Fee" },
          unit_amount: SETUP_FEE_CENTS,
        },
        quantity: 1,
      },
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
    // The portal page uses it as a synchronous fallback activation in case
    // the checkout.session.completed webhook hasn't fired yet.
    success_url: `${origin}/my-territory?token=${portalToken}&session_id={CHECKOUT_SESSION_ID}`,
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
  name:     z.string().min(1).max(120),
  email:    z.string().email().max(180),
  phone:    z.string().max(40).optional(),
  proposal: ClaimProposalProposalSchema,
});

router.post("/dealers/claim-proposal", async (req, res): Promise<void> => {
  const parsed = ClaimProposalBodySchema.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ zodError: parsed.error.issues }, "POST /dealers/claim-proposal validation failed");
    res.status(400).json({ error: "Please fill in all required fields and pick a valid territory." });
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

  const [existing] = await db.select().from(dealersTable).where(eq(dealersTable.email, email));
  if (existing && existing.status === "active") {
    res.status(409).json({ error: "A dealer account with this email is already active." });
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
        .set({ name, phone: phone ?? null, homeZip: proposal.zipCode ?? null, portalToken: txPortalToken })
        .where(eq(dealersTable.id, txDealerId));
    } else {
      const [created] = await tx
        .insert(dealersTable)
        .values({ name, email, phone: phone ?? null, homeZip: proposal.zipCode ?? null, status: "pending_payment" })
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
          product_data: { name: "My Town Postcard — Dealer Setup Fee" },
          unit_amount: SETUP_FEE_CENTS,
        },
        quantity: 1,
      },
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
    success_url: `${origin}/my-territory?token=${portalToken}&session_id={CHECKOUT_SESSION_ID}`,
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
    const portalUrl = portalToken ? `${origin}/my-territory?token=${portalToken}` : null;
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
  }

  const origin = getOrigin(req);
  const portalToken = dealer.portalToken;
  const portalUrl = portalToken ? `${origin}/my-territory?token=${portalToken}` : null;

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
// Public endpoint — authenticated by the opaque portalToken UUID, not a login.
// Returns the dealer's name, territory, and campaign sell-through summary.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/dealer-portal", async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token.trim() : null;
  if (!token) {
    res.status(400).json({ error: "Missing token" });
    return;
  }
  // Guard against non-UUID strings that would cause a PostgreSQL type error.
  if (!UUID_RE.test(token)) {
    res.status(404).json({ error: "Invalid or expired portal link." });
    return;
  }

  const [dealer] = await db
    .select()
    .from(dealersTable)
    .where(eq(dealersTable.portalToken, token));
  if (!dealer) {
    res.status(404).json({ error: "Invalid or expired portal link." });
    return;
  }

  const [territory] = await db
    .select()
    .from(territoriesTable)
    .where(eq(territoriesTable.dealerId, dealer.id));

  // Fetch ALL campaigns for this dealer, ordered oldest-first so the UI always
  // shows them in the creation order (matches the zoneNote hub-city order).
  const allCampaigns = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.dealerId, dealer.id))
    .orderBy(asc(campaignsTable.id));

  const origin = getOrigin(req);

  // Build per-campaign summaries including live sell-through stats.
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
        totalSpots: spots.length,
        soldSpots: sold.length,
        availableSpots: spots.filter((s) => s.status === "available").length,
        revenueCents,
      };
    }),
  );

  res.json({
    dealerId: dealer.id,
    name: dealer.name,
    email: dealer.email,
    status: dealer.status,
    territory: territory
      ? {
          id: territory.id,
          name: territory.name,
          counties: territory.counties,
          households: territory.households,
          zoneNote: territory.zoneNote,
        }
      : null,
    // `campaigns` is the authoritative multi-area array. `campaign` (singular)
    // is kept for any legacy consumers still reading the old field.
    campaigns: campaignSummaries,
    campaign: campaignSummaries[0] ?? null,
  });
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

router.get("/admin/dealers", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.execute<{
    id: number;
    name: string;
    email: string;
    phone: string | null;
    home_zip: string;
    status: string;
    created_at: Date | string;
    activated_at: Date | string | null;
    territory_count: number;
    total_households: number | null;
  }>(sql`
    SELECT
      d.id, d.name, d.email, d.phone, d.home_zip, d.status,
      d.created_at, d.activated_at,
      COUNT(t.id)::int                          AS territory_count,
      COALESCE(SUM(t.estimated_households), 0)::int AS total_households
    FROM dealers d
    LEFT JOIN dealer_territories t ON t.dealer_id = d.id
    GROUP BY d.id
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
  const territories = await db
    .select()
    .from(dealerTerritoriesTable)
    .where(eq(dealerTerritoriesTable.dealerId, id))
    .orderBy(desc(dealerTerritoriesTable.territoryIndex));

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
  if (proposal.centroidLat != null && proposal.centroidLng != null) {
    const conflict = await findExistingTerritoryWithinMiles(
      proposal.centroidLat,
      proposal.centroidLng,
      proposal.stateAbbr,
      25,
      { statuses: ["taken", "pending"] },
    );
    if (conflict) {
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

  let portalToken: string | null = null;
  if (dealerId) {
    const [d] = await db
      .select({ portalToken: dealersTable.portalToken })
      .from(dealersTable)
      .where(eq(dealersTable.id, dealerId));
    portalToken = d?.portalToken ?? null;
  }
  if (proposal.dealerEmail) {
    await sendTerritoryClaimedEmail({
      dealerName: proposal.dealerName ?? "Dealer",
      dealerEmail: proposal.dealerEmail,
      territoryName: proposal.proposedName,
      cities: Array.isArray(proposal.proposedCities) ? proposal.proposedCities : [],
      portalToken,
    });
  }
  logger.info({ proposalId, dealerId, territoryId }, "Territory claim activated from checkout session");
}
