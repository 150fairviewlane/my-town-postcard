import { Router, type IRouter, type Request } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { z } from "zod/v4";
import jwt from "jsonwebtoken";
import { db, dealersTable, dealerTerritoriesTable } from "@workspace/db";
import { getStripeClient, isStripeConfigured } from "../lib/stripeClient";

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

const TerritorySchema = z.object({
  territoryIndex: z.number().int().min(0).max(15),
  zipCodes: z.array(z.string().regex(/^\d{5}$/)).min(1).max(500),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  cityLabel: z.string().min(1).max(120),
  estimatedHouseholds: z.number().int().min(0).max(1_000_000),
});

const CreateDealerBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(180),
  phone: z.string().trim().max(40).optional().nullable(),
  homeZip: z.string().regex(/^\d{5}$/),
  territories: z.array(TerritorySchema).min(1).max(8),
});

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

  const { name, email, phone, homeZip, territories } = parsed.data;

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
  if (existing) {
    dealerId = existing.id;
    await db
      .update(dealersTable)
      .set({ name, phone: phone ?? null, homeZip })
      .where(eq(dealersTable.id, dealerId));
    // Replace any stale territory rows from an earlier attempt.
    await db.delete(dealerTerritoriesTable).where(eq(dealerTerritoriesTable.dealerId, dealerId));
  } else {
    const [created] = await db
      .insert(dealersTable)
      .values({ name, email, phone: phone ?? null, homeZip, status: "pending_payment" })
      .returning({ id: dealersTable.id });
    dealerId = created.id;
  }

  type T = z.infer<typeof TerritorySchema>;
  await db.insert(dealerTerritoriesTable).values(
    territories.map((t: T) => ({
      dealerId,
      territoryIndex: t.territoryIndex,
      zipCodes: t.zipCodes,
      centerLat: t.centerLat,
      centerLng: t.centerLng,
      cityLabel: t.cityLabel,
      estimatedHouseholds: t.estimatedHouseholds,
    })),
  );

  const stripe = await getStripeClient();
  const origin = getOrigin(req);
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
          product_data: { name: "My Town Postcard — Dealer Subscription" },
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
    req.log.info({ dealerId, sessionId }, "Dealer activated via /confirm");
  }

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
    territories: territories.map((t) => ({
      territoryIndex: t.territoryIndex,
      cityLabel: t.cityLabel,
      zipCount: t.zipCodes.length,
      estimatedHouseholds: t.estimatedHouseholds,
    })),
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
  if (dealer.status === "active") return dealerId; // idempotent
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
  return dealer.id;
}
