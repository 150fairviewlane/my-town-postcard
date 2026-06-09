import { Router, type IRouter, type Request } from "express";
import { eq, and, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import {
  db,
  spotsTable,
  ordersTable,
  campaignsTable,
  spotSubscriptionsTable,
  subscriptionIssueAssignmentsTable,
  stripeWebhookEventsTable,
} from "@workspace/db";
import { getStripeClient, isStripeConfigured } from "../lib/stripeClient";
import {
  parseCommitmentType,
  PLAN_METADATA,
  monthlyPriceCents,
  totalCommitmentValueCents,
  addMonths,
  type CommitmentType,
  type SpotSize,
} from "../lib/subscriptionPricing";
import {
  createPendingSubscription,
  activateSubscription,
  countFulfilledIssues,
  computeMrrSummary,
  findPreCommittedForCampaign,
} from "../lib/subscriptions";
import { ensureTrackingCode } from "../lib/trackingCode";
import {
  sendSubscriptionConfirmationEmail,
  sendAdminNewSubscriptionEmail,
} from "../lib/emails";

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
  if (!Number.isFinite(spotId) || !commitmentType || commitmentType === "single") {
    res.status(400).json({ error: "spotId and a valid commitmentType (6_issue or 12_issue) are required" });
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

  // Stripe cancel_at — auto-cancel the subscription at the end of the
  // committed term. Customer is NOT auto-renewed; renewal is opt-in via
  // the T-30/T-7/post email sequence.
  const startDate = new Date();
  const endDate = addMonths(startDate, meta.totalIssues);
  const cancelAtSeconds = Math.floor(endDate.getTime() / 1000);

  const origin = getOrigin(req);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: spot.contactEmail,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `LocalSpot Mailer — ${meta.customerLabel}`,
            description: `${meta.totalIssues} consecutive issues, ${size.toUpperCase()} ad, ${spot.businessName}`,
          },
          unit_amount: monthlyCents,
          recurring: { interval: "month" },
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
    // `cancel_at` on subscription_data is valid in the Stripe API but
    // missing from older Stripe-Node type defs — cast through any.
    subscription_data: {
      metadata: {
        kind: "spot_subscription",
        subscriptionRecordId: String(pending.id),
        spotId: String(spot.id),
        commitmentType,
      },
      cancel_at: cancelAtSeconds,
    } as any,
    success_url: `${origin}/subscription-confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout/${spot.id}?cancelled=1`,
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
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
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

  const stripeSubObj = typeof session.subscription === "string"
    ? await stripe.subscriptions.retrieve(session.subscription)
    : session.subscription;
  const stripeSubscriptionId = stripeSubObj?.id ?? null;
  const stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  if (!stripeSubscriptionId || !stripeCustomerId) {
    res.status(500).json({ error: "Stripe session missing subscription or customer references." });
    return;
  }

  await markSubscriptionAndSpotPaid({
    pendingRecordId: pending.id,
    spotId: pending.initialSpotId,
    stripeSubscriptionId,
    stripeCustomerId,
    cancelAtSeconds: stripeSubObj?.cancel_at ?? null,
    paymentRef: stripeSubscriptionId, // store the sub id in orders.stripe_payment_intent_id slot
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
 */
export async function markSubscriptionAndSpotPaid(opts: {
  pendingRecordId: number;
  spotId: number;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  cancelAtSeconds: number | null;
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
      "Duplicate paid order detected — cancelling duplicate Stripe subscription",
    );
    try {
      if (await isStripeConfigured()) {
        const stripe = await getStripeClient();
        await stripe.subscriptions.cancel(opts.stripeSubscriptionId);
      }
    } catch (err) {
      req.log.error({ err }, "Could not cancel duplicate Stripe subscription — manual refund required");
    }
    await db
      .update(spotSubscriptionsTable)
      .set({
        subscriptionStatus: "canceled",
        stripeSubscriptionId: opts.stripeSubscriptionId,
        stripeCustomerId: opts.stripeCustomerId,
        updatedAt: new Date(),
      })
      .where(eq(spotSubscriptionsTable.id, opts.pendingRecordId));
    return;
  }

  // Compute end date from Stripe cancel_at if present (most accurate),
  // otherwise from our table's totalIssues.
  const [pending] = await db
    .select()
    .from(spotSubscriptionsTable)
    .where(eq(spotSubscriptionsTable.id, opts.pendingRecordId));
  if (!pending) {
    req.log.warn({ pendingRecordId: opts.pendingRecordId }, "Pending subscription row not found — skip activate");
    return;
  }
  const startDate = pending.commitmentStartDate ?? new Date();
  const endDate = opts.cancelAtSeconds
    ? new Date(opts.cancelAtSeconds * 1000)
    : addMonths(startDate, pending.commitmentTotalIssues);

  await activateSubscription({
    subscriptionRecordId: opts.pendingRecordId,
    stripeSubscriptionId: opts.stripeSubscriptionId,
    stripeCustomerId: opts.stripeCustomerId,
    commitmentStartDate: startDate,
    commitmentEndDate: endDate,
  });

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

  try {
    await ensureTrackingCode(spot);
  } catch (err) {
    req.log.error({ err, spotId: opts.spotId }, "Failed to assign tracking code — continuing");
  }

  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, spot.campaignId));

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
        commitmentEndDate: endDate,
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
