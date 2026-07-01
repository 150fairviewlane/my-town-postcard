import { Router, type IRouter, type Request } from "express";
import { eq, and, sql, isNull } from "drizzle-orm";
import jwt from "jsonwebtoken";
import {
  db,
  spotsTable,
  ordersTable,
  campaignsTable,
  spotSubscriptionsTable,
  subscriptionIssueAssignmentsTable,
  stripeWebhookEventsTable,
  dealersTable,
} from "@workspace/db";
import { getStripeClient, isStripeConfigured } from "../lib/stripeClient";
import {
  parseCommitmentType,
  PLAN_METADATA,
  monthlyPriceCents,
  totalCommitmentValueCents,
  type CommitmentType,
  type SpotSize,
} from "../lib/subscriptionPricing";
import {
  createPendingSubscription,
  activateSubscription,
  triggerSubscriptionBillingForCampaign,
  countFulfilledIssues,
  computeMrrSummary,
  findPreCommittedForCampaign,
} from "../lib/subscriptions";
import { ensureTrackingCode } from "../lib/trackingCode";
import {
  sendSubscriptionConfirmationEmail,
  sendAdminNewSubscriptionEmail,
  sendDealerNewSubscriptionEmail,
} from "../lib/emails";
import { computeCommissionCents } from "../lib/commission";

const router: IRouter = Router();

// Re-use the same admin auth pattern as routes/admin.ts. We don't import
// `requireAdmin` from there because it isn't exported; copying the small
// helper keeps this module standalone.
function requireAdmin(req: any, res: any, next: any): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const secret = process.env.SESSION_SECRET || "localspot-secret";
  try {
    jwt.verify(auth.slice(7), secret);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function getOrigin(req: Request): string {
  const envOrigin = process.env.APP_URL?.replace(/\/$/, "") || process.env.PUBLIC_APP_URL?.replace(/\/$/, "");
  if (envOrigin) return envOrigin;
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitDomain) return `https://${replitDomain}`;
  const host = req.get("host") ?? `localhost:${process.env.PORT ?? "3000"}`;
  const proto = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
  return `${proto}://${host}`;
}

/**
 * Origin for Stripe success_url / cancel_url — must resolve to wherever the
 * customer's browser actually is, NOT a configured production alias like APP_URL.
 * Priority: X-Forwarded-Host (set by Replit's proxy for both dev and prod) →
 * REPLIT_DOMAINS (injected per-deployment, absent in dev workspace) → Host header.
 * APP_URL is intentionally excluded so a production alias never hijacks dev flows.
 */
function stripeReturnOrigin(req: Request): string {
  const proto =
    (req.get("x-forwarded-proto") ?? "").split(",")[0].trim() === "https" ||
    req.protocol === "https"
      ? "https"
      : "http";
  const xfh = req.get("x-forwarded-host");
  if (xfh) return `${proto}://${xfh.split(",")[0].trim()}`;
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitDomain) return `https://${replitDomain}`;
  const host = req.get("host") ?? `localhost:${process.env.PORT ?? "3000"}`;
  return `${proto}://${host}`;
}

/**
 * POST /api/checkout/create-subscription-session
 * Body: { spotId: number, commitmentType: "6_issue" | "12_issue" }
 *
 * Validates the spot is reserved, creates a pending spot_subscriptions row
 * and a Stripe Checkout Session in subscription mode (with cancel_at = now
 * + N months so the customer is NEVER auto-renewed). Returns the Checkout
 * URL for the frontend to redirect to.
 *
 * The single-issue path (existing /checkout/create-payment-intent) is
 * completely untouched.
 */
router.post("/checkout/create-subscription-session", async (req, res): Promise<void> => {
  const spotId = Number(req.body?.spotId);
  const commitmentType = parseCommitmentType(req.body?.commitmentType);
  const fromSlug = typeof req.body?.fromSlug === "string" ? req.body.fromSlug.trim() : "";
  if (!Number.isFinite(spotId) || !commitmentType || commitmentType === "single") {
    res.status(400).json({ error: "spotId and a valid commitmentType (4_issue or 12_issue) are required" });
    return;
  }

  const [spot] = await db.select().from(spotsTable).where(eq(spotsTable.id, spotId));
  if (!spot) {
    res.status(404).json({ error: "Spot not found" });
    return;
  }
  if (spot.status !== "reserved") {
    res.status(400).json({ error: "Spot must be reserved before payment" });
    return;
  }
  if (!spot.businessName || !spot.contactEmail) {
    res.status(400).json({ error: "Spot is missing business name or contact email" });
    return;
  }

  if (!(await isStripeConfigured())) {
    res.status(503).json({
      error: "Payments are not configured for this environment. Connect the Stripe integration to enable checkout.",
    });
    return;
  }
  const stripe = await getStripeClient();

  // Refuse duplicate subscription creation for a spot already paid.
  const alreadyPaid = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(eq(ordersTable.spotId, spot.id), eq(ordersTable.status, "paid")))
    .limit(1);
  if (alreadyPaid.length > 0) {
    res.status(409).json({ error: "This spot has already been paid for." });
    return;
  }
  // Guard against duplicate subscriptions. Active/past_due rows always block.
  // pending_payment rows block only within a 30-minute window — after that the
  // Stripe Checkout session is considered abandoned and the stale row is
  // cancelled so the customer can retry without needing admin intervention.
  const PENDING_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
  const existingSub = await db
    .select({
      id:        spotSubscriptionsTable.id,
      status:    spotSubscriptionsTable.subscriptionStatus,
      createdAt: spotSubscriptionsTable.createdAt,
    })
    .from(spotSubscriptionsTable)
    .where(eq(spotSubscriptionsTable.initialSpotId, spot.id))
    .limit(5);
  for (const s of existingSub) {
    if (s.status === "pending_payment") {
      const ageMs = Date.now() - new Date(s.createdAt).getTime();
      if (ageMs > PENDING_EXPIRY_MS) {
        // Stale abandoned session — cancel it silently so the customer can retry.
        await db
          .update(spotSubscriptionsTable)
          .set({ subscriptionStatus: "canceled", updatedAt: new Date() })
          .where(eq(spotSubscriptionsTable.id, s.id));
        req.log.info({ stalePendingId: s.id, ageMs }, "cancelled stale pending_payment subscription");
      }
    }
  }
  // Re-fetch after any stale cancellations.
  const activeSub = await db
    .select({ id: spotSubscriptionsTable.id, status: spotSubscriptionsTable.subscriptionStatus })
    .from(spotSubscriptionsTable)
    .where(eq(spotSubscriptionsTable.initialSpotId, spot.id))
    .limit(5);
  const blocking = activeSub.find((s) =>
    s.status === "active" || s.status === "past_due" || s.status === "pending_payment",
  );
  if (blocking) {
    res.status(409).json({
      error:
        blocking.status === "pending_payment"
          ? "A subscription checkout session is already open for this spot. Refresh the page or complete the open Stripe Checkout tab."
          : "This spot already has an active subscription.",
    });
    return;
  }

  const size = spot.size as SpotSize;
  const monthlyCents = monthlyPriceCents(size, commitmentType);
  const totalCents = totalCommitmentValueCents(size, commitmentType);
  const meta = PLAN_METADATA[commitmentType];

  // Insert the pending subscription row first so we have a stable record
  // id to embed in Stripe metadata. The webhook + sync confirm will key
  // off this id (NOT the Stripe subscription id, which doesn't exist yet).
  const pending = await createPendingSubscription({
    spotId: spot.id,
    campaignId: spot.campaignId,
    size,
    commitmentType,
    businessName: spot.businessName,
    businessCategory: spot.businessCategory,
    contactEmail: spot.contactEmail,
    contactPhone: spot.contactPhone,
    website: spot.website,
  });

  const origin = getOrigin(req);
  const session = await stripe.checkout.sessions.create({
    // Payment mode (not subscription): charge issue #1 now and save the card
    // for future off-session charges when subsequent issues go to print.
    // customer_creation: "always" is required so Stripe creates a Customer
    // object that session.customer returns post-checkout — without it,
    // customer is null and setup_future_usage: "off_session" has nothing
    // to attach the saved PaymentMethod to.
    mode: "payment",
    payment_method_types: ["card"],
    customer_creation: "always",
    customer_email: spot.contactEmail,
    payment_intent_data: {
      setup_future_usage: "off_session",
      description: `My Town Postcard — ${meta.customerLabel}: ${spot.businessName}`,
      metadata: {
        kind: "spot_subscription",
        subscriptionRecordId: String(pending.id),
        spotId: String(spot.id),
        commitmentType,
      },
    },
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `My Town Postcard — ${meta.customerLabel}`,
            description: `${meta.totalIssues} consecutive issues, ${size.toUpperCase()} ad, ${spot.businessName} (issue 1 of ${meta.totalIssues})`,
          },
          unit_amount: monthlyCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      kind: "spot_subscription",
      subscriptionRecordId: String(pending.id),
      spotId: String(spot.id),
      commitmentType,
    },
    success_url: `${stripeReturnOrigin(req)}/subscription-confirmation?session_id={CHECKOUT_SESSION_ID}${fromSlug ? `&from=${encodeURIComponent(fromSlug)}` : ""}`,
    cancel_url: `${stripeReturnOrigin(req)}/checkout/${spot.id}${fromSlug ? `?from=${encodeURIComponent(fromSlug)}` : ""}`,
  });

  req.log.info(
    { spotId: spot.id, subscriptionRecordId: pending.id, sessionId: session.id, commitmentType, monthlyCents, totalCents },
    "Created spot subscription Checkout session",
  );

  res.json({
    checkoutUrl: session.url,
    subscriptionRecordId: pending.id,
    monthlyCents,
    totalCents,
    totalIssues: meta.totalIssues,
  });
});

/**
 * GET /api/checkout/subscription-confirm?session_id=cs_...
 * Synchronous post-payment confirmation. Verifies the Stripe Checkout
 * Session paid, marks the spot paid, activates the subscription record,
 * issues the QR tracking code, and sends customer + admin emails.
 *
 * Idempotent — webhook may have already done some/all of this. We use the
 * same orders-table dedup as the one-time path so the first writer wins
 * and subsequent calls become safe no-ops.
 */
router.get("/checkout/subscription-confirm", async (req, res): Promise<void> => {
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
  let session: any;
  try {
    // Expand the subscription + its latest invoice + payment intent so we can
    // extract payment references in subscription mode (session.payment_intent
    // is null for subscription Checkout — the PI lives on the invoice).
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription.latest_invoice.payment_intent"],
    });
  } catch (err: any) {
    req.log.warn({ err: err?.message, sessionId }, "Could not retrieve subscription session");
    res.status(400).json({ error: "Could not verify checkout session." });
    return;
  }

  const recordIdStr = session?.metadata?.subscriptionRecordId;
  const subscriptionRecordId = recordIdStr ? parseInt(String(recordIdStr), 10) : NaN;
  if (!Number.isFinite(subscriptionRecordId)) {
    res.status(400).json({ error: "Session is not linked to a subscription record." });
    return;
  }
  const [pending] = await db
    .select()
    .from(spotSubscriptionsTable)
    .where(eq(spotSubscriptionsTable.id, subscriptionRecordId));
  if (!pending) {
    res.status(404).json({ error: "Subscription record not found." });
    return;
  }

  const isPaid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
  if (!isPaid) {
    res.status(202).json({
      status: pending.subscriptionStatus,
      paymentStatus: session.payment_status,
    });
    return;
  }

  // Fast path: webhook already activated the subscription before the customer
  // was redirected back. Return success straight from the DB — no need to
  // re-extract customer/payment references from the Stripe session.
  if (pending.subscriptionStatus === "active") {
    req.log.info(
      { pendingRecordId: pending.id, spotId: pending.initialSpotId },
      "subscription-confirm: webhook already activated — returning DB state",
    );
    res.json({
      success: true,
      subscriptionRecordId: pending.id,
      spotId: pending.initialSpotId,
      monthlyCents: pending.monthlyPriceCents,
      totalCents: pending.totalCommitmentValueCents,
      totalIssues: pending.commitmentTotalIssues,
      commitmentType: pending.commitmentType,
    });
    return;
  }

  const stripeCustomerId = typeof session.customer === "string" ? session.customer : (session.customer as any)?.id ?? null;
  if (!stripeCustomerId) {
    res.status(500).json({ error: "Stripe session missing customer reference." });
    return;
  }

  // For subscription-mode Checkout sessions, payment_intent is null on the session
  // itself — the PaymentIntent lives on subscription.latest_invoice.payment_intent
  // (expanded above). For one-time mode it's directly on session.payment_intent.
  const rawPi = session.payment_intent ?? session.subscription?.latest_invoice?.payment_intent ?? null;
  const paymentIntentId: string | null =
    typeof rawPi === "string" ? rawPi : (rawPi as any)?.id ?? null;

  // Use Stripe subscription ID as fallback paymentRef (e.g. free first month)
  const rawSub = session.subscription;
  const stripeSubscriptionId: string | null =
    typeof rawSub === "string" ? rawSub : (rawSub as any)?.id ?? null;

  const paymentRef = paymentIntentId ?? stripeSubscriptionId;
  if (!paymentRef) {
    res.status(500).json({ error: "Stripe session missing payment intent or subscription reference." });
    return;
  }

  // Get payment method: prefer from the expanded PaymentIntent object, else
  // retrieve it; final fallback is subscription.default_payment_method.
  let stripePaymentMethodId: string | null = null;
  const rawPm = (rawPi as any)?.payment_method ?? null;
  if (rawPm) {
    stripePaymentMethodId = typeof rawPm === "string" ? rawPm : (rawPm as any)?.id ?? null;
  }
  if (!stripePaymentMethodId && paymentIntentId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      stripePaymentMethodId = typeof pi.payment_method === "string"
        ? pi.payment_method
        : (pi.payment_method as any)?.id ?? null;
    } catch (err: any) {
      req.log.warn({ err: err?.message, paymentIntentId }, "Could not retrieve PaymentIntent for payment method");
    }
  }
  if (!stripePaymentMethodId && stripeSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      stripePaymentMethodId = typeof sub.default_payment_method === "string"
        ? sub.default_payment_method
        : (sub.default_payment_method as any)?.id ?? null;
    } catch (err: any) {
      req.log.warn({ err: err?.message, stripeSubscriptionId }, "Could not retrieve subscription default payment method");
    }
  }
  if (!stripePaymentMethodId) {
    res.status(500).json({ error: "Could not retrieve saved payment method from Stripe." });
    return;
  }

  await markSubscriptionAndSpotPaid({
    pendingRecordId: pending.id,
    spotId: pending.initialSpotId,
    stripePaymentMethodId,
    stripeCustomerId,
    paymentRef: paymentRef,
    monthlyCents: pending.monthlyPriceCents,
    req,
  });

  res.json({
    success: true,
    subscriptionRecordId: pending.id,
    spotId: pending.initialSpotId,
    monthlyCents: pending.monthlyPriceCents,
    totalCents: pending.totalCommitmentValueCents,
    totalIssues: pending.commitmentTotalIssues,
    commitmentType: pending.commitmentType,
  });
});

/**
 * Shared writer used by the synchronous confirm path AND the webhook handler.
 * Idempotent on the orders.stripePaymentIntentId unique index.
 *
 * On success:
 *   1. Activates the local subscription row (saves stripeCustomerId + paymentMethodId).
 *   2. Marks initial assignment chargeTriggeredAt = NOW() (issue #1 already paid here).
 *   3. Marks spot paid and creates an order row.
 *   4. Sends customer + admin notification emails.
 */
export async function markSubscriptionAndSpotPaid(opts: {
  pendingRecordId: number;
  spotId: number;
  stripePaymentMethodId: string;
  stripeCustomerId: string;
  paymentRef: string;
  monthlyCents: number;
  req: Request | { log: { info: Function; warn: Function; error: Function } };
}): Promise<void> {
  const { req } = opts;

  // If an order already exists for this payment ref, the webhook beat us.
  // No-op.
  const existing = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(eq(ordersTable.stripePaymentIntentId, opts.paymentRef))
    .limit(1);
  if (existing.length > 0) {
    req.log.info(
      { spotId: opts.spotId, paymentRef: opts.paymentRef },
      "Subscription order already recorded — idempotent no-op",
    );
    return;
  }

  // Duplicate-charge guard: if this spot already has a paid order from a
  // DIFFERENT payment reference (one-time PaymentIntent OR a different
  // subscription session), we must NOT activate this subscription —
  // otherwise the customer ends up paying twice. Cancel the duplicate
  // Stripe subscription immediately and mark our local record canceled
  // so the customer can be refunded out of band.
  const otherPaid = await db
    .select({ id: ordersTable.id, ref: ordersTable.stripePaymentIntentId })
    .from(ordersTable)
    .where(and(eq(ordersTable.spotId, opts.spotId), eq(ordersTable.status, "paid")))
    .limit(1);
  if (otherPaid.length > 0 && otherPaid[0].ref !== opts.paymentRef) {
    req.log.error(
      { spotId: opts.spotId, existingRef: otherPaid[0].ref, duplicateRef: opts.paymentRef },
      "Duplicate paid order detected — marking local subscription canceled (no Stripe subscription to cancel)",
    );
    await db
      .update(spotSubscriptionsTable)
      .set({
        subscriptionStatus: "canceled",
        stripeCustomerId: opts.stripeCustomerId,
        stripePaymentMethodId: opts.stripePaymentMethodId,
        updatedAt: new Date(),
      })
      .where(eq(spotSubscriptionsTable.id, opts.pendingRecordId));
    return;
  }

  const [pending] = await db
    .select()
    .from(spotSubscriptionsTable)
    .where(eq(spotSubscriptionsTable.id, opts.pendingRecordId));
  if (!pending) {
    req.log.warn({ pendingRecordId: opts.pendingRecordId }, "Pending subscription row not found — skip activate");
    return;
  }
  const startDate = pending.commitmentStartDate ?? new Date();

  await activateSubscription({
    subscriptionRecordId: opts.pendingRecordId,
    stripeCustomerId: opts.stripeCustomerId,
    stripePaymentMethodId: opts.stripePaymentMethodId,
    commitmentStartDate: startDate,
  });

  // Mark issue #1 as already billed (paid at Checkout) so the campaign
  // billing trigger does not double-charge the customer on their first run.
  try {
    await db
      .update(subscriptionIssueAssignmentsTable)
      .set({ chargeTriggeredAt: new Date() })
      .where(
        and(
          eq(subscriptionIssueAssignmentsTable.subscriptionId, opts.pendingRecordId),
          isNull(subscriptionIssueAssignmentsTable.chargeTriggeredAt),
        ),
      );
  } catch (err) {
    req.log.error({ err, pendingRecordId: opts.pendingRecordId }, "Failed to mark initial assignment chargeTriggeredAt — non-critical");
  }

  // Mark the spot paid (clear hold). Same shape as the one-time path.
  const [spot] = await db.select().from(spotsTable).where(eq(spotsTable.id, opts.spotId));
  if (!spot) {
    req.log.warn({ spotId: opts.spotId }, "Subscription confirm references unknown spot — skipping");
    return;
  }
  await db
    .update(spotsTable)
    .set({ status: "paid", expiresAt: null })
    .where(eq(spotsTable.id, opts.spotId));

  let order;
  try {
    [order] = await db
      .insert(ordersTable)
      .values({
        spotId: opts.spotId,
        stripePaymentIntentId: opts.paymentRef,
        amountCents: opts.monthlyCents,
        status: "paid",
      })
      .returning();
  } catch (err: any) {
    if (err?.code === "23505") {
      req.log.info({ spotId: opts.spotId, paymentRef: opts.paymentRef }, "Order race lost — no-op");
      return;
    }
    throw err;
  }

  // Subscription checkout is the order-creation path for multi-issue spots.
  // Check here whether this sale pushes the campaign to 12 paid spots and
  // trigger off-session billing for all other active subscribers on this campaign.
  try {
    const [paidCountRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(ordersTable)
      .innerJoin(spotsTable, eq(ordersTable.spotId, spotsTable.id))
      .where(
        and(
          eq(spotsTable.campaignId, spot.campaignId),
          eq(ordersTable.status, "paid"),
        ),
      );
    const paidCount = Number(paidCountRow?.c ?? 0);
    if (paidCount === 12) {
      req.log.info({ campaignId: spot.campaignId, paidCount }, "Subscription checkout: campaign reached 12 paid spots — triggering subscription billing");
      await triggerSubscriptionBillingForCampaign(spot.campaignId);
    }
  } catch (err) {
    req.log.error({ err, campaignId: spot.campaignId }, "Failed to check/trigger subscription billing from subscription checkout — non-critical");
  }

  try {
    await ensureTrackingCode(spot);
  } catch (err) {
    req.log.error({ err, spotId: opts.spotId }, "Failed to assign tracking code — continuing");
  }

  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, spot.campaignId));

  // Look up dealer who owns this territory (null for house campaigns).
  const dealer = campaign?.dealerId
    ? (await db
        .select({ email: dealersTable.email, name: dealersTable.name })
        .from(dealersTable)
        .where(eq(dealersTable.id, campaign.dealerId))
        .limit(1))[0] ?? null
    : null;

  const APP_URL = process.env.APP_URL || "https://mytownpostcard.com";

  try {
    await Promise.all([
      sendSubscriptionConfirmationEmail({
        businessName: pending.businessName,
        contactEmail: pending.contactEmail,
        spotSize: pending.size,
        spotId: opts.spotId,
        orderId: order.id,
        commitmentType: pending.commitmentType as CommitmentType,
        totalIssues: pending.commitmentTotalIssues,
        monthlyCents: pending.monthlyPriceCents,
        totalCents: pending.totalCommitmentValueCents,
        commitmentEndDate: null,
        campaignName: campaign?.name ?? null,
        mailDate: campaign?.mailDate ?? null,
      }),
      sendAdminNewSubscriptionEmail({
        businessName: pending.businessName,
        contactEmail: pending.contactEmail,
        spotSize: pending.size,
        commitmentType: pending.commitmentType as CommitmentType,
        totalIssues: pending.commitmentTotalIssues,
        monthlyCents: pending.monthlyPriceCents,
        totalCents: pending.totalCommitmentValueCents,
        subscriptionRecordId: opts.pendingRecordId,
      }),
      ...(dealer
        ? [sendDealerNewSubscriptionEmail({
            dealerEmail: dealer.email,
            dealerName: dealer.name,
            cityName: (campaign?.cityList ?? "").split(",")[0].trim() || campaign?.territory || "your territory",
            businessName: pending.businessName,
            spotSize: pending.size,
            commitmentType: pending.commitmentType,
            totalIssues: pending.commitmentTotalIssues,
            monthlyCents: pending.monthlyPriceCents,
            totalCents: pending.totalCommitmentValueCents,
            commissionCents: computeCommissionCents(pending.totalCommitmentValueCents),
            portalUrl: `${APP_URL}/dealer/login`,
          })]
        : []),
    ]);
  } catch (err) {
    req.log.error({ err, orderId: order.id }, "Subscription emails failed — continuing");
  }
}

// =============================================================================
// Admin endpoints
// =============================================================================

router.get("/admin/subscriptions", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.execute<any>(sql`
    SELECT
      s.*,
      COALESCE(SUM(CASE WHEN a.included_in_print THEN 1 ELSE 0 END), 0)::int AS issues_fulfilled
    FROM spot_subscriptions s
    LEFT JOIN subscription_issue_assignments a ON a.subscription_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `);
  const toIso = (d: any) => (d instanceof Date ? d.toISOString() : d ?? null);
  res.json({
    subscriptions: rows.rows.map((r: any) => ({
      id: Number(r.id),
      initialSpotId: Number(r.initial_spot_id),
      businessName: r.business_name,
      contactEmail: r.contact_email,
      contactPhone: r.contact_phone,
      size: r.size,
      commitmentType: r.commitment_type,
      commitmentTotalIssues: Number(r.commitment_total_issues),
      issuesFulfilled: Number(r.issues_fulfilled ?? 0),
      monthlyPriceCents: Number(r.monthly_price_cents),
      totalCommitmentValueCents: Number(r.total_commitment_value_cents),
      subscriptionStatus: r.subscription_status,
      stripeSubscriptionId: r.stripe_subscription_id,
      commitmentStartDate: toIso(r.commitment_start_date),
      commitmentEndDate: toIso(r.commitment_end_date),
      createdAt: toIso(r.created_at),
    })),
  });
});

router.get("/admin/subscriptions/mrr", requireAdmin, async (_req, res): Promise<void> => {
  res.json(await computeMrrSummary());
});

router.post("/admin/subscriptions/:id/cancel", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid subscription id" });
    return;
  }
  const [sub] = await db.select().from(spotSubscriptionsTable).where(eq(spotSubscriptionsTable.id, id));
  if (!sub) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }
  if (sub.stripeSubscriptionId && (await isStripeConfigured())) {
    const stripe = await getStripeClient();
    try {
      await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    } catch (err: any) {
      // Already cancelled at Stripe — fine, we still want to record local state.
      req.log.warn({ err: err?.message, subId: id }, "Stripe cancel returned error — continuing with local cancel");
    }
  }
  await db
    .update(spotSubscriptionsTable)
    .set({ subscriptionStatus: "canceled", updatedAt: new Date() })
    .where(eq(spotSubscriptionsTable.id, id));
  res.json({ success: true });
});

/**
 * Reconcile local subscription rows against Stripe. Pulls every active /
 * past_due subscription in our DB, asks Stripe for the canonical state,
 * and updates the local row if it differs. Catches missed-webhook drift.
 */
router.post("/admin/subscriptions/sync", requireAdmin, async (req, res): Promise<void> => {
  if (!(await isStripeConfigured())) {
    res.status(503).json({ error: "Stripe not configured." });
    return;
  }
  const stripe = await getStripeClient();
  const rows = await db
    .select()
    .from(spotSubscriptionsTable)
    .where(
      sql`subscription_status IN ('active','past_due') AND stripe_subscription_id IS NOT NULL`,
    );

  let updated = 0;
  let errors = 0;
  for (const row of rows) {
    try {
      const live = await stripe.subscriptions.retrieve(row.stripeSubscriptionId!);
      const mapStripeStatus = (s: string): "active" | "past_due" | "canceled" | "ended" | null => {
        if (s === "active" || s === "trialing") return "active";
        if (s === "past_due" || s === "unpaid") return "past_due";
        if (s === "canceled" || s === "incomplete_expired") return "canceled";
        return null;
      };
      const mapped = mapStripeStatus(live.status);
      if (mapped && mapped !== row.subscriptionStatus) {
        await db
          .update(spotSubscriptionsTable)
          .set({ subscriptionStatus: mapped, updatedAt: new Date() })
          .where(eq(spotSubscriptionsTable.id, row.id));
        updated++;
      }
    } catch (err: any) {
      req.log.error({ err: err?.message, subId: row.id }, "Stripe sync failed for subscription");
      errors++;
    }
  }
  res.json({ checked: rows.length, updated, errors });
});

router.get("/admin/webhook-events", requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
  const events = await db
    .select()
    .from(stripeWebhookEventsTable)
    .orderBy(sql`received_at DESC`)
    .limit(limit);
  res.json({
    events: events.map((e) => ({
      eventId: e.eventId,
      eventType: e.eventType,
      status: e.status,
      errorMessage: e.errorMessage,
      receivedAt: e.receivedAt instanceof Date ? e.receivedAt.toISOString() : e.receivedAt,
      processedAt: e.processedAt instanceof Date ? e.processedAt.toISOString() : e.processedAt,
    })),
  });
});

/**
 * Pre-committed-advertiser suggestions for a new campaign. The admin's
 * "Campaign Lineup" panel polls this to show which subscribers should be
 * slotted into the current issue before opening the picker to new buyers.
 */
router.get("/admin/campaigns/:id/preCommitted", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid campaign id" });
    return;
  }
  const candidates = await findPreCommittedForCampaign(id);
  res.json({
    preCommitted: await Promise.all(
      candidates.map(async (c) => ({
        ...c,
        commitmentEndDate: c.commitmentEndDate?.toISOString() ?? null,
        // Belt-and-braces: re-derive fulfilled count from the assignments
        // table in case the LEFT JOIN gave a stale value.
        issuesFulfilled: await countFulfilledIssues(c.id),
      })),
    ),
  });
});

/**
 * POST /api/admin/subscriptions/:id/retry-billing
 * Immediately retry the off-session Stripe charge for a past_due subscription.
 * On success, marks the subscription active. On failure, returns 402.
 */
router.post("/admin/subscriptions/:id/retry-billing", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid subscription id" });
    return;
  }
  const [sub] = await db.select().from(spotSubscriptionsTable).where(eq(spotSubscriptionsTable.id, id));
  if (!sub) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }
  if (sub.subscriptionStatus !== "past_due") {
    res.status(400).json({ error: "Only past_due subscriptions can have billing retried." });
    return;
  }
  if (!sub.stripeCustomerId || !sub.stripePaymentMethodId) {
    res.status(400).json({ error: "No saved payment method on file for this subscription. Cannot retry billing." });
    return;
  }
  if (!(await isStripeConfigured())) {
    res.status(503).json({ error: "Stripe not configured." });
    return;
  }
  const stripe = await getStripeClient();
  try {
    await stripe.paymentIntents.create({
      amount: sub.monthlyPriceCents,
      currency: "usd",
      customer: sub.stripeCustomerId,
      payment_method: sub.stripePaymentMethodId,
      confirm: true,
      off_session: true,
      description: `My Town Postcard — retry billing for ${sub.businessName}`,
      metadata: {
        kind: "spot_subscription_billing_retry",
        subscription_id: String(sub.id),
      },
    });
    await db
      .update(spotSubscriptionsTable)
      .set({ subscriptionStatus: "active", updatedAt: new Date() })
      .where(eq(spotSubscriptionsTable.id, id));
    req.log.info({ subId: id }, "Subscription billing retry succeeded — reactivated");
    res.json({ success: true, message: "Billing successful. Subscription reactivated." });
  } catch (err: any) {
    req.log.error({ err: err?.message, subId: id }, "Subscription billing retry failed");
    res.status(402).json({ error: `Billing failed: ${err?.message ?? "Card declined"}` });
  }
});

router.post(
  "/admin/subscriptions/:id/assignments/:campaignId/approve-proof",
  requireAdmin,
  async (req, res): Promise<void> => {
    const subId = parseInt(String(req.params.id), 10);
    const campaignId = parseInt(String(req.params.campaignId), 10);
    if (!Number.isFinite(subId) || !Number.isFinite(campaignId)) {
      res.status(400).json({ error: "Invalid ids" });
      return;
    }
    const updated = await db
      .update(subscriptionIssueAssignmentsTable)
      .set({ proofStatus: "approved" })
      .where(
        and(
          eq(subscriptionIssueAssignmentsTable.subscriptionId, subId),
          eq(subscriptionIssueAssignmentsTable.campaignId, campaignId),
        ),
      )
      .returning({ id: subscriptionIssueAssignmentsTable.id });
    if (updated.length === 0) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    res.json({ success: true });
  },
);

export default router;
