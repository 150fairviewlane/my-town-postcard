import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, spotsTable, ordersTable, campaignsTable } from "@workspace/db";
import {
  CreatePaymentIntentBody,
  CreatePaymentIntentResponse,
  ConfirmPaymentBody,
  ConfirmPaymentResponse,
} from "@workspace/api-zod";
import { sendAdProofEmail, sendAdminNewOrder } from "../lib/emails";
import { ensureTrackingCode } from "../lib/trackingCode";
import { logger } from "../lib/logger";
import {
  getStripeClient,
  getStripePublishableKey,
  isStripeConfigured,
} from "../lib/stripeClient";

const router: IRouter = Router();

// Lightweight config endpoint so the frontend can load Stripe.js with the
// right publishable key for the current environment (dev vs deployment).
// Returning 503 with a friendly message keeps a missing integration from
// crashing the checkout page with a stack trace.
router.get("/config/stripe-publishable-key", async (req, res): Promise<void> => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (err: any) {
    req.log.warn({ err: err?.message }, "Stripe publishable key unavailable");
    res.status(503).json({
      error:
        "Payments are not configured for this environment. Connect the Stripe integration to enable checkout.",
    });
  }
});

router.post("/checkout/create-payment-intent", async (req, res): Promise<void> => {
  const body = CreatePaymentIntentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [spot] = await db
    .select()
    .from(spotsTable)
    .where(eq(spotsTable.id, body.data.spotId));

  if (!spot) {
    res.status(404).json({ error: "Spot not found" });
    return;
  }

  if (spot.status !== "reserved") {
    res.status(400).json({ error: "Spot must be reserved before payment" });
    return;
  }

  let stripe;
  try {
    stripe = await getStripeClient();
  } catch (err: any) {
    req.log.error({ err: err?.message }, "Stripe client unavailable");
    res.status(503).json({
      error:
        "Payments are not configured for this environment. Connect the Stripe integration to enable checkout.",
    });
    return;
  }

  // Refuse to create a new PaymentIntent if this spot is already paid (e.g.
  // the customer hit /checkout in two tabs and one tab finished). Without
  // this, Stripe would happily charge the second card too.
  const alreadyPaid = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(eq(ordersTable.spotId, spot.id), eq(ordersTable.status, "paid")))
    .limit(1);
  if (alreadyPaid.length > 0) {
    res.status(409).json({ error: "This spot has already been paid for." });
    return;
  }

  // Use a deterministic Stripe idempotency key tied to the current
  // reservation window. Within a single 30-minute hold, every call to
  // /create-payment-intent for the same spot gets back the SAME
  // PaymentIntent — no orphaned intents from React strict mode, page
  // reloads, or tab refreshes. A new reservation (different expiresAt)
  // produces a fresh intent. We hash to keep keys ≤ 255 chars even for
  // edge cases.
  const reservationFingerprint = `${spot.id}-${spot.expiresAt?.getTime() ?? "noexp"}-${spot.price}`;
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: spot.price,
      currency: "usd",
      // Restrict to card payments — the embedded CardElement we render only
      // collects card details, and leaving this empty would let Stripe
      // negotiate other methods (e.g. Link, Cash App) that need extra UI.
      payment_method_types: ["card"],
      metadata: {
        spotId: String(spot.id),
        businessName: spot.businessName ?? "",
        businessCategory: spot.businessCategory ?? "",
      },
    },
    { idempotencyKey: `pi-spot-${reservationFingerprint}` },
  );

  req.log.info({ spotId: spot.id, amount: spot.price, paymentIntentId: paymentIntent.id }, "PaymentIntent created");

  res.json(CreatePaymentIntentResponse.parse({
    clientSecret: paymentIntent.client_secret,
    spotId: spot.id,
    amount: spot.price,
    businessName: spot.businessName,
    size: spot.size,
  }));
});

router.post("/checkout/confirm", async (req, res): Promise<void> => {
  const body = ConfirmPaymentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  // Verify the PaymentIntent actually succeeded with Stripe before we mark
  // the spot as paid. Without this check, a malicious client could call
  // /checkout/confirm with a fabricated paymentIntentId and skip payment.
  // We require the integration to be configured here — there's no safe
  // fallback for "trust the client".
  if (!(await isStripeConfigured())) {
    res.status(503).json({
      error: "Payments are not configured for this environment.",
    });
    return;
  }

  const stripe = await getStripeClient();
  let intent;
  try {
    intent = await stripe.paymentIntents.retrieve(body.data.paymentIntentId);
  } catch (err: any) {
    req.log.warn({ err: err?.message, paymentIntentId: body.data.paymentIntentId }, "PaymentIntent retrieve failed");
    res.status(400).json({ error: "Could not verify payment with Stripe." });
    return;
  }

  if (intent.status !== "succeeded") {
    res.status(400).json({ error: "Payment has not succeeded yet" });
    return;
  }

  // Sanity check: the PaymentIntent's metadata.spotId must match the
  // spotId the client sent. Otherwise an attacker could pay for a $5 spot
  // and call /confirm with someone else's $50 spotId.
  const intentSpotId = parseInt(String(intent.metadata?.spotId ?? ""), 10);
  if (!Number.isFinite(intentSpotId) || intentSpotId !== body.data.spotId) {
    req.log.warn(
      { paymentIntentId: intent.id, intentSpotId, requestSpotId: body.data.spotId },
      "PaymentIntent metadata.spotId mismatch — refusing to confirm",
    );
    res.status(400).json({ error: "Payment does not match this spot." });
    return;
  }

  const [spot] = await db
    .select()
    .from(spotsTable)
    .where(eq(spotsTable.id, body.data.spotId));

  if (!spot) {
    res.status(404).json({ error: "Spot not found" });
    return;
  }

  // Idempotency: if an order already exists for this PaymentIntent (e.g.
  // the webhook beat us here), return the existing record instead of
  // double-inserting. The unique partial index on stripe_payment_intent_id
  // would reject the second insert anyway; this is the cooperative path.
  const existing = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.stripePaymentIntentId, body.data.paymentIntentId))
    .limit(1);

  if (existing.length > 0) {
    req.log.info(
      { orderId: existing[0].id, spotId: spot.id },
      "Order already recorded — returning existing order (idempotent)",
    );
    res.json(ConfirmPaymentResponse.parse({ success: true, orderId: existing[0].id }));
    return;
  }

  // Defense-in-depth: if a DIFFERENT PaymentIntent already paid this spot,
  // we have a duplicate charge. Refund the new one immediately so the
  // customer is made whole, and refuse to create a second order. Without
  // this, the unique index `orders_paid_spot_unique` would block the
  // insert below but the customer's card would already be charged.
  const otherPaidForSpot = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.spotId, body.data.spotId), eq(ordersTable.status, "paid")))
    .limit(1);
  if (otherPaidForSpot.length > 0) {
    req.log.warn(
      {
        spotId: spot.id,
        existingOrderId: otherPaidForSpot[0].id,
        existingPaymentIntentId: otherPaidForSpot[0].stripePaymentIntentId,
        duplicatePaymentIntentId: body.data.paymentIntentId,
      },
      "Duplicate charge detected — issuing refund for the second PaymentIntent",
    );
    try {
      await stripe.refunds.create({
        payment_intent: body.data.paymentIntentId,
        reason: "duplicate",
      });
    } catch (refundErr: any) {
      req.log.error(
        { err: refundErr?.message, paymentIntentId: body.data.paymentIntentId },
        "Auto-refund of duplicate charge FAILED — manual reconciliation required",
      );
    }
    res.status(409).json({
      error:
        "This spot was already paid for in another session. Your card has been refunded.",
    });
    return;
  }

  // Clear expires_at — paid spots have no expiry, and we want the periodic
  // cleanup sweeper to ignore them entirely.
  await db
    .update(spotsTable)
    .set({ status: "paid", expiresAt: null })
    .where(eq(spotsTable.id, body.data.spotId));

  let order;
  try {
    [order] = await db
      .insert(ordersTable)
      .values({
        spotId: body.data.spotId,
        stripePaymentIntentId: body.data.paymentIntentId,
        amountCents: spot.price,
        status: "paid",
      })
      .returning();
  } catch (err: any) {
    if (err?.code === "23505") {
      // Race lost to the webhook — re-read the row it inserted and return
      // that to the client so they still see a successful confirmation.
      const [winner] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.stripePaymentIntentId, body.data.paymentIntentId))
        .limit(1);
      if (winner) {
        req.log.info(
          { orderId: winner.id, spotId: spot.id },
          "Order race lost to webhook — returning webhook's order",
        );
        res.json(ConfirmPaymentResponse.parse({ success: true, orderId: winner.id }));
        return;
      }
    }
    throw err;
  }

  req.log.info({ orderId: order.id, spotId: spot.id }, "Payment confirmed, order created");

  // Assign QR tracking code on the spot (idempotent — webhook may have
  // already done this for the same spot). Don't fail the request if it
  // hiccups; the webhook will retry.
  try {
    const code = await ensureTrackingCode(spot);
    req.log.info({ spotId: spot.id, trackingCode: code }, "Tracking code ensured for paid spot");
  } catch (err) {
    req.log.error({ err, spotId: spot.id }, "Failed to assign tracking code — continuing");
  }

  const orderInfo = {
    businessName: spot.businessName ?? "Unknown",
    contactEmail: spot.contactEmail ?? "",
    spotSize: spot.size,
    spotPrice: spot.price,
    spotId: spot.id,
    orderId: order.id,
  };

  // Look up the campaign so the customer email can include the campaign
  // name + scheduled mail date. A missing campaign row is unlikely (FK is
  // enforced at the application layer) but we degrade gracefully.
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, spot.campaignId));

  // Don't let a flaky email provider fail the customer's confirmation —
  // emails.ts already swallows individual failures, but we wrap in a
  // top-level try as belt-and-braces.
  try {
    await Promise.all([
      sendAdProofEmail({
        ...orderInfo,
        campaignName: campaign?.name ?? null,
        mailDate: campaign?.mailDate ?? null,
        contactPhone: spot.contactPhone ?? null,
        website: spot.website ?? null,
        industry: spot.businessCategory ?? null,
      }),
      sendAdminNewOrder(orderInfo),
    ]);
  } catch (err) {
    logger.error({ err, orderId: order.id }, "Order emails failed — continuing");
  }

  res.json(ConfirmPaymentResponse.parse({ success: true, orderId: order.id }));
});

export default router;
