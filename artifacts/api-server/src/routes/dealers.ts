import { Router, type IRouter, type Request } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { z } from "zod/v4";
import jwt from "jsonwebtoken";
import { db, dealersTable, dealerTerritoriesTable, campaignsTable, spotsTable, territoriesTable } from "@workspace/db";
import { getStripeClient, isStripeConfigured } from "../lib/stripeClient";
import { ensureDealerLandingPage } from "../lib/dealerLandingPage";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Pricing for the Phase 1 dealer program. Setup fee is a one-time line item
// on the first invoice; the $99/mo subscription is the recurring half. Both
// are inlined as Stripe `price_data` so we don't have to pre-create Products
// in the Stripe dashboard for QA / dev.
const SETUP_FEE_CENTS = 9900;
const MONTHLY_FEE_CENTS = 9900;

// Fail fast if SESSION_SECRET is missing — never fall back to a hard-coded
// signing key for admin auth. (The legacy admin.ts / adminCampaigns.ts
// routes still use a fallback for backward compatibility; this newer route
// is strict so we don't perpetuate that pattern.)
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
  // Replit deployments expose the public host via REPLIT_DOMAINS (comma-
  // separated). Fall back to the request's own host header in dev/preview.
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitDomain) return `https://${replitDomain}`;
  const host = req.get("host") ?? `localhost:${process.env.PORT ?? "3000"}`;
  const proto = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
  return `${proto}://${host}`;
}

// ─── Helper: update the linked territory's status ─────────────────────────────
// Finds the territory row where dealer_id = dealerId and sets its status.
// Used by the activation and cancellation paths so territory availability
// stays in sync with the dealer's subscription state.
async function setTerritoryStatusForDealer(
  dealerId: number,
  newStatus: "pending" | "taken" | "available",
): Promise<void> {
  const rows = await db
    .select({ id: territoriesTable.id })
    .from(territoriesTable)
    .where(eq(territoriesTable.dealerId, dealerId));
  if (rows.length === 0) return; // territory not linked yet — nothing to update
  await db
    .update(territoriesTable)
    .set({
      status: newStatus,
      ...(newStatus === "available" ? { dealerId: null } : {}),
    })
    .where(eq(territoriesTable.dealerId, dealerId));
}

router.post("/dealers", async (req, res): Promise<void> => {
  const parsed = CreateDealerBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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

  // Determine whether this is the new county-based flow or the legacy ZIP flow.
  const isCountyFlow = "territoryId" in parsed.data;
  // County flow: store a placeholder zip so the NOT NULL column is satisfied.
  const homeZip = isCountyFlow ? "00000" : (parsed.data as any).homeZip as string;
  const territoryId = isCountyFlow ? (parsed.data as any).territoryId as string : null;
  const territoryDisplayName = isCountyFlow
    ? (parsed.data as any).territoryName as string
    : null;
  const legacyTerritories = isCountyFlow
    ? null
    : (parsed.data as any).territories as z.infer<typeof LegacyTerritorySchema>[];

  // Re-attempted signup with an existing email: if the dealer is still in
  // pending_payment we recycle the row and create a fresh Checkout Session.
  // If the dealer is already active or cancelled, refuse politely.
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

  let dealerId: number;
  let portalToken: string;
  if (existing) {
    dealerId = existing.id;
    portalToken = existing.portalToken ?? crypto.randomUUID();
    await db
      .update(dealersTable)
      .set({ name, phone: phone ?? null, homeZip, portalToken })
      .where(eq(dealersTable.id, dealerId));
    // Replace any stale legacy territory rows from an earlier attempt.
    await db.delete(dealerTerritoriesTable).where(eq(dealerTerritoriesTable.dealerId, dealerId));
  } else {
    const [created] = await db
      .insert(dealersTable)
      .values({ name, email, phone: phone ?? null, homeZip, status: "pending_payment" })
      .returning({ id: dealersTable.id, portalToken: dealersTable.portalToken });
    dealerId = created.id;
    portalToken = created.portalToken ?? crypto.randomUUID();
  }

  // County flow: link the territory row to this dealer and ensure its status
  // is "pending" so the picker shows it as unavailable immediately. Step 2
  // of the signup (POST /api/territory-claims) already set territories.status
  // to "pending" — this call also sets the dealerId FK so we can look it up
  // later during activation and cancellation.
  if (territoryId) {
    await db
      .update(territoriesTable)
      .set({ status: "pending", dealerId })
      .where(eq(territoriesTable.id, territoryId));
  }

  // Legacy ZIP-cluster flow: persist the territory rows so the admin can
  // review them. County-based flow skips this — the claim is already recorded
  // in dealer_territory_claims by Step 2 of the signup.
  if (legacyTerritories) {
    await db.insert(dealerTerritoriesTable).values(
      legacyTerritories.map((t) => ({
        dealerId,
        territoryIndex: t.territoryIndex,
        zipCodes: t.zipCodes,
        centerLat: t.centerLat,
        centerLng: t.centerLng,
        cityLabel: t.cityLabel,
        estimatedHouseholds: t.estimatedHouseholds,
      })),
    );
  }

  const stripe = await getStripeClient();
  const origin = getOrigin(req);
  const subscriptionProductName = territoryDisplayName
    ? `My Town Postcard — Dealer Subscription (${territoryDisplayName})`
    : "My Town Postcard — Dealer Subscription";
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

  const dealerIdStr = (session.metadata as any)?.dealerId;
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

  // Activate the dealer if Stripe says payment cleared. Both `paid` and
  // `no_payment_required` are accepted (the latter happens for trials,
  // which we don't currently use but is safe to allow). Idempotent — a
  // second confirm call is a no-op. We *only* promote from pending_payment
  // so a stale/replayed Checkout session can never resurrect a previously
  // cancelled dealer (reinstatement requires an explicit admin action).
  const isPaid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
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
    // Mark the territory as "taken" now that payment has cleared.
    await setTerritoryStatusForDealer(dealerId, "taken");
    req.log.info({ dealerId, sessionId }, "Dealer activated via /confirm");
    // Auto-create the dealer's published landing page (idempotent). Don't let a
    // hiccup here fail the confirm response — the webhook also calls this.
    try {
      await ensureDealerLandingPage(dealerId);
    } catch (err: any) {
      req.log.error({ err: err?.message, dealerId }, "ensureDealerLandingPage failed in /confirm — webhook will retry");
    }
  }

  // Build the portal URL so the frontend can redirect the dealer straight to
  // their self-service page without another round-trip.
  const origin = getOrigin(req);
  const freshDealer = isPaid && dealer.status === "pending_payment"
    ? { ...dealer, status: "active" as const }
    : dealer;
  const portalUrl = freshDealer.portalToken
    ? `${origin}/my-territory?token=${freshDealer.portalToken}`
    : null;

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
    portalToken: dealer.portalToken,
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
// Returns the dealer's name, territory, and campaign sell-through summary so
// they can track progress without giving them access to admin endpoints.
router.get("/dealer-portal", async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token.trim() : null;
  if (!token) {
    res.status(400).json({ error: "Missing token" });
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

  // Look up the territory linked to this dealer.
  const [territory] = await db
    .select()
    .from(territoriesTable)
    .where(eq(territoriesTable.dealerId, dealer.id));

  // Look up the dealer's landing-page campaign (prefer stored ref, fall back
  // to dealer_id FK on the campaign).
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
      .where(eq(campaignsTable.dealerId, dealer.id))
      .limit(1);
  }

  const origin = getOrigin(req);
  let campaignSummary = null;
  let pageUrl: string | null = null;

  if (campaign) {
    const spots = await db
      .select()
      .from(spotsTable)
      .where(eq(spotsTable.campaignId, campaign.id));

    const sold = spots.filter((s) => s.status === "paid");
    const revenueCents = sold.reduce((sum, s) => sum + (s.price || 0), 0);

    pageUrl = campaign.slug ? `${origin}/${campaign.slug}` : null;
    campaignSummary = {
      campaignId: campaign.id,
      campaignName: campaign.name,
      pageUrl,
      isPublished: campaign.isPublished,
      totalSpots: spots.length,
      soldSpots: sold.length,
      availableSpots: spots.filter((s) => s.status === "available").length,
      revenueCents,
    };
  }

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
    campaign: campaignSummary,
  });
});

// Dealer portal data (Task #134). Admin-only summary of a dealer's auto-created
// landing page: its public URL plus live sell-through and per-spot revenue.
// Requires the admin bearer token — it exposes campaign sales metrics, so it
// must not be reachable by enumerating dealer ids.
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

  // Locate the dealer's landing-page campaign (prefer the back-reference, fall
  // back to dealerId). If none yet, the page hasn't been auto-created.
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
export async function activateDealerFromCheckoutSession(session: any): Promise<number | null> {
  const dealerIdStr = (session?.metadata as any)?.dealerId;
  const dealerId = dealerIdStr ? parseInt(String(dealerIdStr), 10) : null;
  if (!dealerId || !Number.isFinite(dealerId)) return null;

  const [dealer] = await db.select().from(dealersTable).where(eq(dealersTable.id, dealerId));
  if (!dealer) return null;
  if (dealer.status === "active") {
    // Already active — still ensure territory is "taken" in case the confirm
    // endpoint ran before the territory FK was set (idempotent).
    await setTerritoryStatusForDealer(dealerId, "taken");
    return dealerId;
  }
  // Only activate from pending_payment — a replayed webhook on a previously
  // cancelled dealer should NOT resurrect them. Reinstatement is admin-only.
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

  // Flip the territory from "pending" → "taken" so the picker shows it as
  // permanently unavailable now that payment has cleared.
  await setTerritoryStatusForDealer(dealerId, "taken");

  // Auto-create the dealer's published landing page (idempotent).
  try {
    await ensureDealerLandingPage(dealerId);
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

  // Release the territory back to "available" so other dealers can claim it.
  await setTerritoryStatusForDealer(dealer.id, "available");

  return dealer.id;
}
