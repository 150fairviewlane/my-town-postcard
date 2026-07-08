import { Router, type IRouter } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db, spotsTable, ordersTable, campaignsTable, businessClaimEventsTable, scrapedBusinessesTable } from "@workspace/db";
import { getCachedAd, setCachedAd } from "../lib/claimRegenCache.js";
import { generateAdForOutreach } from "../lib/generateAdForOutreach.js";
import {
  CreatePaymentIntentBody,
  CreatePaymentIntentResponse,
  ConfirmPaymentBody,
  ConfirmPaymentResponse,
} from "@workspace/api-zod";
import { sendAdProofEmail, sendAdminNewOrder } from "../lib/emails";
import { ensureTrackingCode, swapGrokQrInTemplateData } from "../lib/trackingCode";
import { logger } from "../lib/logger";
import { markSpotPaidAndNotify } from "./webhooks";
import {
  getStripeClient,
  getStripePublishableKey,
  isStripeConfigured,
} from "../lib/stripeClient";

const router: IRouter = Router();

// Resolve the public origin for Stripe redirect URLs. Prefers an explicit
// APP_URL/PUBLIC_APP_URL, then the Replit deployment domain, then the request's
// own host (dev/preview). Mirrors the helper in dealers.ts / subscriptions.ts.
function publicOrigin(req: any): string {
  const envOrigin =
    process.env.APP_URL?.replace(/\/$/, "") || process.env.PUBLIC_APP_URL?.replace(/\/$/, "");
  if (envOrigin) return envOrigin;
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitDomain) return `https://${replitDomain}`;
  const host = req.get("host") ?? `localhost:${process.env.PORT ?? "3000"}`;
  const proto =
    req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
  return `${proto}://${host}`;
}

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
  // Read optional claimBusinessId from the request body (sent by the claim
  // fast-lane checkout flow). Zod strips unknown fields from body.data, so we
  // read req.body directly. This is stored in PI metadata so the confirm
  // handler and webhook can inject the cached single-panel ad into templateData.
  const rawClaimId = req.body?.claimBusinessId;
  const claimBizId = rawClaimId !== undefined ? parseInt(String(rawClaimId), 10) : NaN;
  const hasClaimId = Number.isFinite(claimBizId) && claimBizId > 0;

  const piMetadata: Record<string, string> = {
    spotId: String(spot.id),
    businessName: spot.businessName ?? "",
    businessCategory: spot.businessCategory ?? "",
  };
  if (hasClaimId) piMetadata.claimBusinessId = String(claimBizId);

  const reservationFingerprint = `${spot.id}-${spot.expiresAt?.getTime() ?? "noexp"}-${spot.price}`;
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: spot.price,
      currency: "usd",
      // Restrict to card payments — the embedded CardElement we render only
      // collects card details, and leaving this empty would let Stripe
      // negotiate other methods (e.g. Link, Cash App) that need extra UI.
      payment_method_types: ["card"],
      metadata: piMetadata,
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

  // Assign QR tracking code on the spot (idempotent — webhook may have
  // already done this for the same spot). Don't fail the request if it
  // hiccups; the webhook will retry.
  try {
    const code = await ensureTrackingCode(spot);
    req.log.info({ spotId: spot.id, trackingCode: code }, "Tracking code ensured for paid spot");
  } catch (err) {
    req.log.error({ err, spotId: spot.id }, "Failed to assign tracking code — continuing");
  }

  // Inject claim fast-lane single-panel ad into templateData before QR swap.
  // Must happen BEFORE swapGrokQrInTemplateData so the QR can be composited
  // onto the freshly injected ad.
  // Cache hit → instant. Cache miss (expired or slow browser) → regenerate
  // from DB so late purchases still get templateData populated.
  const claimIdStr = intent.metadata?.claimBusinessId;
  const claimBizIdConfirm = claimIdStr ? parseInt(String(claimIdStr), 10) : NaN;
  if (Number.isFinite(claimBizIdConfirm) && claimBizIdConfirm > 0) {
    try {
      let claimEntry = getCachedAd(claimBizIdConfirm);
      if (!claimEntry) {
        // Cache miss — regenerate the single-panel ad synchronously so the
        // spot gets templateData even when the cache expired.
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
          .where(eq(scrapedBusinessesTable.id, claimBizIdConfirm))
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
          setCachedAd(claimBizIdConfirm, regen.imageUrl, regen.template, "l");
          claimEntry = getCachedAd(claimBizIdConfirm);
          req.log.info({ spotId: body.data.spotId, claimBizId: claimBizIdConfirm }, "Claim ad regenerated (cache miss) at confirmation");
        }
      }
      if (claimEntry) {
        const td = JSON.stringify({
          finishedAdUrl: claimEntry.dataUrl,
          template: claimEntry.template,
          sizeKey: claimEntry.sizeKey,
        });
        await db.update(spotsTable).set({ templateData: td }).where(eq(spotsTable.id, body.data.spotId));
        req.log.info({ spotId: body.data.spotId, claimBizId: claimBizIdConfirm }, "Claim ad injected into templateData");
        // Record the engagement event with spot + order linkage — fire-and-forget
        db.insert(businessClaimEventsTable).values({
          businessId: claimBizIdConfirm,
          spotId: body.data.spotId,
          orderId: order?.id ?? null,
          ipAddress: ((req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.ip ?? null),
          userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
          referrer: (req.headers["referer"] as string | undefined) ?? null,
        }).catch((err: any) => req.log.warn({ err: err?.message, claimBizId: claimBizIdConfirm }, "claim event insert failed"));
      }
    } catch (claimErr: any) {
      req.log.warn({ err: claimErr?.message, claimBizId: claimBizIdConfirm }, "claim templateData injection failed — non-critical");
    }
  }

  // Swap the generic preview QR in any Grok-generated ad stored in
  // templateData.finishedAdUrl with the real tracking QR now that the
  // tracking code is assigned. Fire-and-forget — must never block confirmation.
  try {
    await swapGrokQrInTemplateData(spot.id);
    req.log.info({ spotId: spot.id }, "Grok preview QR swapped for real tracking QR");
  } catch (swapErr: any) {
    req.log.warn({ err: swapErr?.message, spotId: spot.id }, "Grok QR swap in templateData failed — non-critical");
  }

  const parsedTemplateData = (() => {
    try { return spot.templateData ? JSON.parse(spot.templateData) : null; } catch { return null; }
  })();
  const finishedAdUrl = typeof parsedTemplateData?.finishedAdUrl === "string" &&
    !parsedTemplateData.finishedAdUrl.startsWith("data:")
    ? parsedTemplateData.finishedAdUrl : null;

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
        finishedAdUrl,
      }),
      sendAdminNewOrder({
        ...orderInfo,
        finishedAdUrl: finishedAdUrl ?? spot.adFileUrl ?? null,
      }),
    ]);
  } catch (err) {
    logger.error({ err, orderId: order.id }, "Order emails failed — continuing");
  }

  res.json(ConfirmPaymentResponse.parse({ success: true, orderId: order.id }));
});

// --- Hosted Stripe Checkout for one-time spot purchases (Task #134) ---
// Territory landing pages use Stripe's hosted Checkout (redirect) instead of the
// embedded CardElement the homepage uses. The webhook already routes these back
// through markSpotPaidAndNotify (metadata.kind is neither "dealer" nor
// "spot_subscription", so it falls to the one-time spot branch). This is the
// same fulfillment path as the embedded flow — orders, tracking codes, emails.
router.post("/checkout/create-spot-session", async (req, res): Promise<void> => {
  const spotId = parseInt(String(req.body?.spotId ?? ""), 10);
  if (!Number.isFinite(spotId)) {
    res.status(400).json({ error: "Missing or invalid spotId" });
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

  // Don't open a second Checkout if this spot is already paid.
  const alreadyPaid = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(eq(ordersTable.spotId, spot.id), eq(ordersTable.status, "paid")))
    .limit(1);
  if (alreadyPaid.length > 0) {
    res.status(409).json({ error: "This spot has already been paid for." });
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

  const origin = publicOrigin(req);
  const sizeLabel = `${spot.size.charAt(0).toUpperCase()}${spot.size.slice(1)} Postcard Ad`;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: spot.price,
          product_data: {
            name: sizeLabel,
            description: spot.businessName ? `Reserved for ${spot.businessName}` : undefined,
          },
        },
      },
    ],
    // metadata.spotId drives the webhook + sync confirm; kind keeps the webhook
    // router explicit (falls to the one-time spot branch).
    metadata: {
      spotId: String(spot.id),
      kind: "spot_one_time",
      businessName: spot.businessName ?? "",
      businessCategory: spot.businessCategory ?? "",
    },
    payment_intent_data: {
      metadata: { spotId: String(spot.id), kind: "spot_one_time" },
    },
    success_url: `${origin}/spot-confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout/${spot.id}?cancelled=1`,
  });

  req.log.info({ spotId: spot.id, sessionId: session.id }, "Spot checkout session created");
  res.json({ url: session.url });
});

router.get("/checkout/spot-session-confirm", async (req, res): Promise<void> => {
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
    req.log.warn({ err: err?.message, sessionId }, "Could not retrieve spot checkout session");
    res.status(400).json({ error: "Could not verify checkout session." });
    return;
  }

  const spotId = parseInt(String((session.metadata as any)?.spotId ?? ""), 10);
  if (!Number.isFinite(spotId)) {
    res.status(400).json({ error: "Session is not linked to a spot." });
    return;
  }

  const isPaid =
    session.payment_status === "paid" || session.payment_status === "no_payment_required";
  if (isPaid) {
    const paymentRef =
      (typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent as any)?.id) || session.id;
    // Idempotent — webhook may have already recorded this order. Same path.
    await markSpotPaidAndNotify(
      spotId,
      paymentRef,
      typeof session.amount_total === "number" ? session.amount_total : null,
      req,
    );
  }

  const [spot] = await db.select().from(spotsTable).where(eq(spotsTable.id, spotId));
  const [campaign] = spot?.campaignId
    ? await db.select({ slug: campaignsTable.slug }).from(campaignsTable).where(eq(campaignsTable.id, spot.campaignId))
    : [];
  res.json({
    success: isPaid,
    paymentStatus: session.payment_status,
    spotId,
    businessName: spot?.businessName ?? null,
    size: spot?.size ?? null,
    amountCents: typeof session.amount_total === "number" ? session.amount_total : spot?.price ?? null,
    gridArea: spot?.gridArea ?? null,
    side: spot?.side ?? null,
    campaignSlug: campaign?.slug ?? null,
  });
});

export default router;
