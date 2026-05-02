import { type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, spotsTable, ordersTable } from "@workspace/db";
import { sendReservationConfirmation, sendAdminNewOrder } from "../lib/emails";
import { ensureTrackingCode } from "../lib/trackingCode";
import { releaseReservedSpot } from "../lib/expirationCleanup";
import { logger } from "../lib/logger";

// We use require("stripe") (not import) to match the pattern in checkout.ts
// — this lets the API server boot even when the stripe package isn't fully
// resolvable, and works with the esbuild bundle's require shim.
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Stripe = require("stripe");
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

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

  const stripe = getStripe();
  if (!stripe) {
    logger.error("STRIPE_SECRET_KEY not set — cannot process Stripe webhook");
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

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        await handleCheckoutSessionCompleted(event.data.object, req);
        break;
      }
      case "payment_intent.succeeded": {
        await handlePaymentIntentSucceeded(event.data.object, req);
        break;
      }
      case "checkout.session.expired": {
        // Customer abandoned a Stripe Checkout Session before paying.
        // Free the spot immediately so other shoppers don't have to wait
        // for the 5-minute periodic sweeper. (The current PaymentIntent
        // flow doesn't emit this event; this arm is here to support a
        // future Stripe Checkout Sessions migration without dropping holds
        // on the floor.)
        await handleCheckoutSessionExpired(event.data.object, req);
        break;
      }
      default:
        req.log.info(
          { eventType: event.type },
          "Unhandled Stripe event type — acknowledging without action",
        );
    }
    // Always 2xx after we've safely handled (or chosen to ignore) the event,
    // so Stripe doesn't retry forever.
    res.json({ received: true });
  } catch (err) {
    req.log.error(
      { err, eventType: event.type, eventId: event.id },
      "Failed to process Stripe webhook — Stripe will retry",
    );
    // 500 tells Stripe to retry with backoff.
    res.status(500).json({ error: "Webhook handler failed" });
  }
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
  await markSpotPaidAndNotify(
    spotId,
    intent.id,
    typeof intent.amount === "number" ? intent.amount : null,
    req,
  );
}

function parseSpotIdFromMetadata(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>).spotId;
  if (raw === undefined || raw === null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

async function markSpotPaidAndNotify(
  spotId: number,
  paymentRef: string,
  amountCentsFromEvent: number | null,
  req: Request,
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
  await Promise.all([
    sendReservationConfirmation(orderInfo),
    sendAdminNewOrder(orderInfo),
  ]);
}
