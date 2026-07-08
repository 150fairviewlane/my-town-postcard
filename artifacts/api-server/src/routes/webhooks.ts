import { type Request, type Response } from "express";
import { eq, and, isNull, sql } from "drizzle-orm";
import { db, spotsTable, ordersTable, campaignsTable, spotSubscriptionsTable, dealersTable, businessClaimEventsTable, scrapedBusinessesTable } from "@workspace/db";
import { getCachedAd, setCachedAd } from "../lib/claimRegenCache.js";
import { generateAdForOutreach } from "../lib/generateAdForOutreach.js";
import { sendAdProofEmail, sendAdminNewOrder, sendDealerNewSaleEmail } from "../lib/emails";
import { computeCommissionCents } from "../lib/commission";
import { ensureTrackingCode, swapGrokQrInTemplateData } from "../lib/trackingCode";
import { releaseReservedSpot } from "../lib/expirationCleanup";
import { logger } from "../lib/logger";
import { getStripeClient } from "../lib/stripeClient";
import {
  activateDealerFromCheckoutSession,
  activateTerritoryClaimFromCheckoutSession,
  cancelDealerFromSubscription,
  releaseDealerPendingTerritory,
} from "./dealers";
import {
  recordWebhookEvent,
  markWebhookEventProcessed,
  markWebhookEventFailed,
  updateSubscriptionStatusByStripeId,
  triggerSubscriptionBillingForCampaign,
} from "../lib/subscriptions";
import { markSubscriptionAndSpotPaid } from "./subscriptions";

/**
 * Stripe webhook handler. Mounted at POST /api/webhooks/stripe via
 * express.raw({ type: "application/json" }) in app.ts so req.body is a Buffer
 * — the raw bytes are required for signature verification.
 *
 * Verifies every request against STRIPE_WEBHOOK_SECRET. Handles:
 *   - checkout.session.completed (Stripe Checkout Sessions)
 *   - payment_intent.succeeded   (Payment Intents — what the embedded card
 *                                  form on /checkout/:spotId currently uses)
 *
 * Both paths converge on markSpotPaidAndNotify, which is idempotent: if the
 * synchronous /checkout/confirm route or an earlier webhook delivery already
 * recorded the order, this handler is a no-op. That keeps Stripe retries safe.
 */
export async function stripeWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error(
      "STRIPE_WEBHOOK_SECRET is not set — refusing webhook (cannot verify signature)",
    );
    res.status(503).json({ error: "Webhook secret not configured" });
    return;
  }

  let stripe;
  try {
    stripe = await getStripeClient();
  } catch (err: any) {
    logger.error({ err: err?.message }, "Stripe integration unavailable — cannot process webhook");
    res.status(503).json({ error: "Stripe not configured" });
    return;
  }

  const sig = req.headers["stripe-signature"];
  if (!sig || typeof sig !== "string") {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  // req.body MUST be a Buffer here. If it isn't, the raw-body middleware in
  // app.ts didn't run (or ran in the wrong order) and signature verification
  // will fail with an obscure error — this guard turns that into a clear one.
  if (!Buffer.isBuffer(req.body)) {
    logger.error(
      "Stripe webhook received without raw body — express.raw() middleware misconfigured",
    );
    res.status(500).json({ error: "Webhook body not raw" });
    return;
  }

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    logger.warn(
      { err: err?.message },
      "Stripe webhook signature verification failed",
    );
    res
      .status(400)
      .json({ error: `Webhook signature verification failed: ${err?.message ?? "unknown"}` });
    return;
  }

  req.log.info(
    { eventType: event.type, eventId: event.id },
    "Stripe webhook verified",
  );

  // Global dedup. Three outcomes:
  //   - "fresh"     never seen this event id — process it
  //   - "retry"     prior attempt errored / crashed; Stripe is retrying —
  //                 RE-process it so we don't drop a real event
  //   - "processed" already fully handled — 2xx so Stripe stops retrying
  const claim = await recordWebhookEvent(event.id, event.type, event);
  if (claim === "processed") {
    req.log.info({ eventId: event.id, eventType: event.type }, "Stripe webhook already processed — idempotent no-op");
    res.json({ received: true, deduped: true });
    return;
  }
  if (claim === "retry") {
    req.log.warn(
      { eventId: event.id, eventType: event.type },
      "Stripe webhook is a retry after a prior failure — reprocessing",
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // Route by metadata.kind: dealer signups go through the dealer
        // activation path; spot_subscription sessions activate the new
        // subscription row; everything else is a one-time spot order.
        const meta = (event.data.object?.metadata ?? {}) as Record<string, string>;
        if (meta.kind === "dealer") {
          const dealerId = await activateDealerFromCheckoutSession(event.data.object);
          req.log.info({ dealerId, sessionId: event.data.object?.id }, "Dealer activated via webhook");
        } else if (meta.proposal_id) {
          await activateTerritoryClaimFromCheckoutSession(event.data.object);
          req.log.info({ sessionId: event.data.object?.id }, "Territory claim processed via webhook");
        } else if (meta.kind === "spot_subscription") {
          await handleSpotSubscriptionCheckoutCompleted(event.data.object, req);
        } else {
          await handleCheckoutSessionCompleted(event.data.object, req);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        // Defensive backfill — if /subscription-confirm wasn't hit yet
        // (customer closed the tab), keep the local row in sync. We
        // identify our own subscriptions via metadata.kind.
        await handleSubscriptionUpserted(event.data.object, event.created, req);
        break;
      }
      case "customer.subscription.deleted": {
        const meta = (event.data.object?.metadata ?? {}) as Record<string, string>;
        if (meta.kind === "spot_subscription") {
          await updateSubscriptionStatusByStripeId({
            stripeSubscriptionId: String(event.data.object?.id),
            newStatus: "canceled",
            eventCreatedAt: new Date(event.created * 1000),
          });
          req.log.info({ subscriptionId: event.data.object?.id }, "Spot subscription cancelled via webhook");
        } else {
          // Legacy dealer cancellation path.
          const dealerId = await cancelDealerFromSubscription(event.data.object);
          req.log.info(
            { dealerId, subscriptionId: event.data.object?.id },
            "Dealer subscription cancelled via webhook",
          );
        }
        break;
      }
      case "invoice.payment_failed": {
        // Mark the subscription past_due so the lineup builder excludes it
        // from the next issue. Stripe keeps retrying — when it succeeds,
        // we'll flip back to active via subscription.updated.
        const invoiceSub = event.data.object?.subscription;
        if (invoiceSub) {
          await updateSubscriptionStatusByStripeId({
            stripeSubscriptionId: String(invoiceSub),
            newStatus: "past_due",
            eventCreatedAt: new Date(event.created * 1000),
          });
          req.log.info({ subscriptionId: invoiceSub }, "Subscription marked past_due via invoice.payment_failed");
        }
        break;
      }
      case "invoice.payment_succeeded": {
        // Recurring invoice paid. We DO NOT mark any issue fulfilled
        // here — fulfillment is recorded only when the admin marks the
        // campaign mailed. We do, however, log the payment in the
        // webhook events log (already done by recordWebhookEvent) and
        // flip back to active if we were past_due.
        const invoiceSub = event.data.object?.subscription;
        if (invoiceSub) {
          await updateSubscriptionStatusByStripeId({
            stripeSubscriptionId: String(invoiceSub),
            newStatus: "active",
            eventCreatedAt: new Date(event.created * 1000),
          });
        }
        break;
      }
      case "invoice.upcoming":
      case "charge.refunded": {
        // Logged in the events table for the admin's debug view; no DB
        // side effects beyond that for now. Stripe Dashboard remains the
        // canonical source for refund records.
        req.log.info({ eventType: event.type }, "Logged subscription-related event (no state change)");
        break;
      }
      case "payment_intent.succeeded": {
        await handlePaymentIntentSucceeded(event.data.object, req);
        break;
      }
      case "checkout.session.expired": {
        // Customer abandoned a Stripe Checkout Session before paying.
        // Route by metadata.kind:
        //   - kind=dealer: release the "pending" territory back to "available".
        //   - everything else: free the reserved ad spot so other shoppers
        //     don't have to wait for the 5-minute periodic sweeper.
        const expiredMeta = (event.data.object?.metadata ?? {}) as Record<string, string>;
        if (expiredMeta.kind === "dealer") {
          const dealerIdStr = expiredMeta.dealerId;
          const expiredDealerId = dealerIdStr ? parseInt(String(dealerIdStr), 10) : null;
          if (expiredDealerId && Number.isFinite(expiredDealerId)) {
            await releaseDealerPendingTerritory(expiredDealerId);
            req.log.info(
              { dealerId: expiredDealerId, sessionId: event.data.object?.id },
              "Released pending dealer territory after checkout.session.expired",
            );
          }
        } else if (expiredMeta.proposal_id) {
          // No territory row is materialized until payment succeeds, and no
          // subscription exists yet, so there's nothing to release. The
          // pending_payment proposal + dealer stay reusable on a retry.
          req.log.info(
            { proposalId: expiredMeta.proposal_id, sessionId: event.data.object?.id },
            "Territory claim checkout expired — no state to release",
          );
        } else {
          await handleCheckoutSessionExpired(event.data.object, req);
        }
        break;
      }
      default:
        req.log.info(
          { eventType: event.type },
          "Unhandled Stripe event type — acknowledging without action",
        );
    }
    await markWebhookEventProcessed(event.id);
    // Always 2xx after we've safely handled (or chosen to ignore) the event,
    // so Stripe doesn't retry forever.
    res.json({ received: true });
  } catch (err: any) {
    req.log.error(
      { err, eventType: event.type, eventId: event.id },
      "Failed to process Stripe webhook — Stripe will retry",
    );
    await markWebhookEventFailed(event.id, err?.message ?? String(err));
    // 500 tells Stripe to retry with backoff.
    res.status(500).json({ error: "Webhook handler failed" });
  }
}

async function handleSpotSubscriptionCheckoutCompleted(
  session: any,
  req: Request,
): Promise<void> {
  const recordIdStr = session?.metadata?.subscriptionRecordId;
  const subscriptionRecordId = recordIdStr ? parseInt(String(recordIdStr), 10) : NaN;
  const spotIdStr = session?.metadata?.spotId;
  const spotId = spotIdStr ? parseInt(String(spotIdStr), 10) : NaN;
  if (!Number.isFinite(subscriptionRecordId) || !Number.isFinite(spotId)) {
    req.log.warn(
      { sessionId: session?.id },
      "spot_subscription checkout.session.completed missing subscriptionRecordId/spotId — skipping",
    );
    return;
  }

  const stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
  if (!stripeCustomerId || !paymentIntentId) {
    req.log.warn({ sessionId: session.id }, "Spot subscription checkout missing customer id or payment intent id");
    return;
  }

  // Retrieve the PaymentIntent to get the saved payment method for future
  // off-session billing when subsequent issues go to print.
  const stripe = await getStripeClient();
  let stripePaymentMethodId: string | null = null;
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    stripePaymentMethodId = typeof pi.payment_method === "string"
      ? pi.payment_method
      : (pi.payment_method as any)?.id ?? null;
  } catch (err: any) {
    req.log.warn({ err: err?.message, paymentIntentId, sessionId: session.id }, "Could not retrieve PaymentIntent for subscription webhook");
  }
  if (!stripePaymentMethodId) {
    req.log.warn({ sessionId: session.id, paymentIntentId }, "Spot subscription webhook could not resolve payment method — skipping");
    return;
  }

  const [pending] = await db
    .select()
    .from(spotSubscriptionsTable)
    .where(eq(spotSubscriptionsTable.id, subscriptionRecordId));
  if (!pending) {
    req.log.warn({ subscriptionRecordId }, "spot_subscription webhook references unknown record");
    return;
  }

  await markSubscriptionAndSpotPaid({
    pendingRecordId: subscriptionRecordId,
    spotId,
    stripePaymentMethodId,
    stripeCustomerId,
    paymentRef: paymentIntentId,
    monthlyCents: pending.monthlyPriceCents,
    req,
  });
}

async function handleSubscriptionUpserted(
  subscription: any,
  eventCreatedSeconds: number,
  req: Request,
): Promise<void> {
  const meta = (subscription?.metadata ?? {}) as Record<string, string>;
  if (meta.kind !== "spot_subscription") return; // dealer or unrelated sub
  const stripeSubId = subscription?.id;
  if (!stripeSubId) return;

  const mapStatus = (s: string): "active" | "past_due" | "canceled" | "ended" | null => {
    if (s === "active" || s === "trialing") return "active";
    if (s === "past_due" || s === "unpaid") return "past_due";
    if (s === "canceled" || s === "incomplete_expired") return "canceled";
    return null;
  };
  const mapped = mapStatus(subscription.status);
  if (!mapped) {
    req.log.info({ stripeSubId, stripeStatus: subscription.status }, "Untracked Stripe subscription status — skipping");
    return;
  }

  await updateSubscriptionStatusByStripeId({
    stripeSubscriptionId: stripeSubId,
    newStatus: mapped,
    eventCreatedAt: new Date(eventCreatedSeconds * 1000),
    endedAt: subscription.ended_at ? new Date(subscription.ended_at * 1000) : undefined,
  });
}

async function handleCheckoutSessionCompleted(
  session: any,
  req: Request,
): Promise<void> {
  const spotId = parseSpotIdFromMetadata(session.metadata);
  if (spotId === null) {
    req.log.warn(
      { sessionId: session.id },
      "checkout.session.completed missing spotId metadata — skipping",
    );
    return;
  }

  // Prefer the payment_intent id as the dedup key (it's the same id the
  // /checkout/confirm route stores). Fall back to session id if Stripe
  // delivers the event without an expanded payment_intent.
  const paymentRef =
    (typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id) || session.id;

  await markSpotPaidAndNotify(
    spotId,
    paymentRef,
    typeof session.amount_total === "number" ? session.amount_total : null,
    req,
  );
}

async function handleCheckoutSessionExpired(
  session: any,
  req: Request,
): Promise<void> {
  const spotId = parseSpotIdFromMetadata(session.metadata);
  if (spotId === null) {
    req.log.warn(
      { sessionId: session.id },
      "checkout.session.expired missing spotId metadata — skipping",
    );
    return;
  }

  // Idempotent: only resets a spot that's still in "reserved" status. A spot
  // that was already paid (race with a successful payment_intent.succeeded)
  // or already swept by the periodic cleaner is left untouched.
  const released = await releaseReservedSpot(spotId);
  if (released) {
    req.log.info(
      { spotId, sessionId: session.id },
      "Released spot after checkout.session.expired",
    );
  } else {
    req.log.info(
      { spotId, sessionId: session.id },
      "checkout.session.expired for spot that's no longer reserved — no-op",
    );
  }
}

async function handlePaymentIntentSucceeded(
  intent: any,
  req: Request,
): Promise<void> {
  const spotId = parseSpotIdFromMetadata(intent.metadata);
  if (spotId === null) {
    req.log.warn(
      { paymentIntentId: intent.id },
      "payment_intent.succeeded missing spotId metadata — skipping",
    );
    return;
  }
  // Propagate claim businessId from PI metadata so markSpotPaidAndNotify can
  // inject the cached single-panel ad into templateData before the QR swap.
  const claimBizIdStr = intent.metadata?.claimBusinessId;
  const claimBizId = claimBizIdStr ? parseInt(String(claimBizIdStr), 10) : NaN;
  const claimBusinessId = Number.isFinite(claimBizId) && claimBizId > 0 ? claimBizId : undefined;
  await markSpotPaidAndNotify(
    spotId,
    intent.id,
    typeof intent.amount === "number" ? intent.amount : null,
    req,
    claimBusinessId,
  );
}

function parseSpotIdFromMetadata(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>).spotId;
  if (raw === undefined || raw === null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export async function markSpotPaidAndNotify(
  spotId: number,
  paymentRef: string,
  amountCentsFromEvent: number | null,
  req: Request,
  claimBusinessId?: number,
): Promise<void> {
  // Idempotency: if we already recorded an order for this payment reference,
  // we're done. Stripe retries webhooks, and the synchronous /checkout/confirm
  // route may have already processed the same payment. Either path inserts
  // into ordersTable with stripePaymentIntentId set to the same value, so the
  // first writer wins and subsequent calls are no-ops (no double emails, no
  // duplicate order rows).
  const existing = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(eq(ordersTable.stripePaymentIntentId, paymentRef))
    .limit(1);

  if (existing.length > 0) {
    req.log.info(
      { spotId, paymentRef, orderId: existing[0].id },
      "Order already recorded for this payment — webhook is a no-op (idempotent)",
    );
    return;
  }

  // Defense-in-depth against duplicate charges: a different PaymentIntent
  // may have already paid this spot. The DB unique index would reject the
  // insert anyway, but we want to (a) avoid the noisy 23505 log, (b) auto-
  // refund the duplicate via Stripe, and (c) leave a clear audit trail.
  const otherPaid = await db
    .select({ id: ordersTable.id, paymentIntentId: ordersTable.stripePaymentIntentId })
    .from(ordersTable)
    .where(and(eq(ordersTable.spotId, spotId), eq(ordersTable.status, "paid")))
    .limit(1);
  if (otherPaid.length > 0 && otherPaid[0].paymentIntentId !== paymentRef) {
    req.log.warn(
      {
        spotId,
        existingOrderId: otherPaid[0].id,
        existingPaymentIntentId: otherPaid[0].paymentIntentId,
        duplicatePaymentIntentId: paymentRef,
      },
      "Duplicate charge detected via webhook — auto-refunding the duplicate",
    );
    try {
      const stripe = await getStripeClient();
      await stripe.refunds.create({
        payment_intent: paymentRef,
        reason: "duplicate",
      });
    } catch (refundErr: any) {
      req.log.error(
        { err: refundErr?.message, paymentIntentId: paymentRef },
        "Webhook auto-refund of duplicate charge FAILED — manual reconciliation required",
      );
    }
    return;
  }

  const [spot] = await db
    .select()
    .from(spotsTable)
    .where(eq(spotsTable.id, spotId));

  if (!spot) {
    req.log.warn({ spotId }, "Webhook references unknown spot — skipping");
    return;
  }

  // Clear expires_at when transitioning to paid — the 30-minute hold no
  // longer applies, and we don't want the cleanup sweeper to ever look at
  // this row again.
  await db
    .update(spotsTable)
    .set({ status: "paid", expiresAt: null })
    .where(eq(spotsTable.id, spotId));

  // The DB has a partial unique index on stripe_payment_intent_id, so a
  // concurrent insert from /checkout/confirm will lose with a 23505
  // (unique_violation) here. Treat that as the same "already recorded"
  // no-op as the look-ahead select above.
  let order;
  try {
    [order] = await db
      .insert(ordersTable)
      .values({
        spotId,
        stripePaymentIntentId: paymentRef,
        amountCents: amountCentsFromEvent ?? spot.price,
        status: "paid",
      })
      .returning();
  } catch (err: any) {
    if (err?.code === "23505") {
      req.log.info(
        { spotId, paymentRef },
        "Order race lost to concurrent writer (unique violation) — webhook is a no-op",
      );
      return;
    }
    throw err;
  }

  req.log.info(
    { orderId: order.id, spotId, paymentRef },
    "Webhook marked spot paid and created order",
  );

  // When the 12th spot on a campaign sells, trigger off-session billing for
  // all active subscription assignments (issues 2-N billed per-mailing here).
  // Wrapped in try/catch so a billing failure never blocks webhook delivery.
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
      req.log.info({ campaignId: spot.campaignId, paidCount }, "Campaign reached 12 paid spots — triggering subscription billing");
      await triggerSubscriptionBillingForCampaign(spot.campaignId);
    }
  } catch (err) {
    req.log.error({ err, campaignId: spot.campaignId }, "Failed to check/trigger subscription billing — non-critical");
  }

  // Set firstPaidAt on the campaign the first time any spot is paid.
  // Idempotent: WHERE first_paid_at IS NULL means it never overwrites.
  try {
    await db
      .update(campaignsTable)
      .set({ firstPaidAt: new Date() })
      .where(and(eq(campaignsTable.id, spot.campaignId), isNull(campaignsTable.firstPaidAt)));
  } catch (fpErr) {
    req.log.error({ err: fpErr, campaignId: spot.campaignId }, "Failed to set campaign firstPaidAt — non-critical");
  }

  // Generate a tracking code for the QR redirect. Idempotent — if the
  // synchronous /checkout/confirm path already set one, this is a no-op.
  // Wrapped in try/catch so a failure here doesn't break webhook delivery
  // (Stripe would otherwise retry forever).
  try {
    const code = await ensureTrackingCode(spot);
    req.log.info({ spotId, trackingCode: code }, "Tracking code ensured for paid spot");
  } catch (err) {
    req.log.error({ err, spotId }, "Failed to assign tracking code — continuing");
  }

  // Inject claim fast-lane single-panel ad into templateData before QR swap.
  // Cache hit → instant. Cache miss (expired or slow browser) → regenerate
  // from DB so late purchases still get templateData populated.
  if (claimBusinessId) {
    try {
      let claimEntry = getCachedAd(claimBusinessId);
      if (!claimEntry) {
        // Cache miss — regenerate so the spot gets templateData even when
        // the 60-min cache window expired between regen and payment.
        const [bizRow] = await db
          .select({
            businessName: scrapedBusinessesTable.businessName,
            city: scrapedBusinessesTable.city,
            state: scrapedBusinessesTable.state,
            category: scrapedBusinessesTable.category,
            phone: scrapedBusinessesTable.phone,
            website: scrapedBusinessesTable.website,
          })
          .from(scrapedBusinessesTable)
          .where(eq(scrapedBusinessesTable.id, claimBusinessId))
          .limit(1);
        if (bizRow) {
          const regen = await generateAdForOutreach({
            bizName: bizRow.businessName,
            category: bizRow.category ?? null,
            phone: bizRow.phone ?? null,
            address: null,
            city: bizRow.city,
            state: bizRow.state,
            website: bizRow.website ?? null,
            skipComposite: true,
            quality: true,
          });
          setCachedAd(claimBusinessId, regen.imageUrl, regen.template, "l");
          claimEntry = getCachedAd(claimBusinessId);
          logger.info({ spotId, claimBusinessId }, "Claim ad regenerated (cache miss) via webhook");
        }
      }
      if (claimEntry) {
        const td = JSON.stringify({
          finishedAdUrl: claimEntry.dataUrl,
          template: claimEntry.template,
          sizeKey: claimEntry.sizeKey,
        });
        await db.update(spotsTable).set({ templateData: td }).where(eq(spotsTable.id, spotId));
        logger.info({ spotId, claimBusinessId }, "Claim ad injected into templateData via webhook");
        db.insert(businessClaimEventsTable).values({
          businessId: claimBusinessId,
          spotId,
          orderId: order?.id ?? null,
        }).catch((err: any) => logger.warn({ err: err?.message, claimBusinessId }, "claim event insert failed"));
      }
    } catch (claimErr: any) {
      logger.warn({ err: claimErr?.message, claimBusinessId }, "claim templateData injection failed — non-critical");
    }
  }

  // Swap the generic preview QR in any Grok-generated ad stored in
  // templateData.finishedAdUrl with the real tracking QR now that the
  // tracking code is assigned. Fire-and-forget — must never fail the webhook.
  try {
    await swapGrokQrInTemplateData(spotId);
    logger.info({ spotId }, "Grok preview QR swapped for real tracking QR");
  } catch (swapErr: any) {
    logger.warn({ err: swapErr?.message, spotId }, "Grok QR swap in templateData failed — non-critical");
  }

  const orderInfo = {
    businessName: spot.businessName ?? "Unknown",
    contactEmail: spot.contactEmail ?? "",
    spotSize: spot.size,
    spotPrice: order.amountCents,
    spotId: spot.id,
    orderId: order.id,
  };

  // Fire customer + admin notifications in parallel. emails.ts already
  // swallows individual send failures and logs them, so a Resend outage
  // won't fail the webhook (Stripe would otherwise keep retrying for hours).
  // Look up the campaign so the customer email can include the campaign
  // name + scheduled mail date.
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, spot.campaignId));

  // Look up the dealer who owns this territory (null for house campaigns).
  const dealer = campaign?.dealerId
    ? (await db
        .select({ email: dealersTable.email, name: dealersTable.name })
        .from(dealersTable)
        .where(eq(dealersTable.id, campaign.dealerId))
        .limit(1))[0] ?? null
    : null;

  const APP_URL = process.env.APP_URL || "https://mytownpostcard.com";

  const parsedTd = (() => {
    try { return spot.templateData ? JSON.parse(spot.templateData) : null; } catch { return null; }
  })();
  const finishedAdUrl = typeof parsedTd?.finishedAdUrl === "string" &&
    !parsedTd.finishedAdUrl.startsWith("data:")
    ? parsedTd.finishedAdUrl : null;

  await Promise.all([
    sendAdProofEmail({
      ...orderInfo,
      campaignName: campaign?.name ?? null,
      mailDate: campaign?.mailDate ?? null,
      contactPhone: spot.contactPhone ?? null,
      website: spot.website ?? null,
      industry: spot.businessCategory ?? null,
      finishedAdUrl,
    }),
    sendAdminNewOrder({
      ...orderInfo,
      finishedAdUrl: finishedAdUrl ?? spot.adFileUrl ?? null,
    }),
    ...(dealer
      ? [sendDealerNewSaleEmail({
          dealerEmail: dealer.email,
          dealerName: dealer.name,
          cityName: (campaign?.cityList ?? "").split(",")[0].trim() || campaign?.territory || "your territory",
          businessName: spot.businessName ?? "Unknown",
          spotSize: spot.size,
          spotPrice: order.amountCents,
          commissionCents: computeCommissionCents(order.amountCents),
          portalUrl: `${APP_URL}/dealer/login`,
        })]
      : []),
  ]);
}
