/**
 * Admin-only QA bot endpoints (/api/admin/qa/*).
 *
 * These routes exist solely to support automated QA purchase testing.
 * They are BLOCKED in production (REPLIT_DEPLOYMENT=1 without
 * STRIPE_FORCE_TEST_MODE=1) and require a valid admin JWT on every call.
 *
 * Routes:
 *   POST   /api/admin/qa/reserve   — reserve a QA spot, bypassing the
 *                                    isPublished / active-campaign guard
 *   POST   /api/admin/qa/checkout  — create+confirm a PaymentIntent with the
 *                                    QA Stripe key, then run the full DB
 *                                    fulfillment path (spot=paid, order,
 *                                    tracking code) WITHOUT sending any emails
 *   DELETE /api/admin/qa/cleanup   — reset all QA spots to 'available' and
 *                                    delete their associated orders/scans
 *
 * DOCUMENTED COVERAGE GAP (PATH 2B confirmed 2026-06-26):
 * Loading the hosted Stripe Checkout Session page — even with real Chromium
 * and full JS execution — does NOT cause Stripe to lazily attach a
 * PaymentIntent to the session. Attachment only happens after the customer
 * interacts with the payment form.  Therefore this bot exercises the
 * EMBEDDED PaymentIntent fulfillment path only (POST /api/checkout/confirm
 * style DB writes).  The checkout.session.completed webhook branch in
 * webhooks.ts is NOT covered.  The only current path to cover that branch is
 * a synthetic signed POST to /api/webhooks/stripe with a
 * checkout.session.completed payload.
 */

import { Router } from "express";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import {
  db,
  campaignsTable,
  spotsTable,
  ordersTable,
  qrScansTable,
} from "@workspace/db";
import { getQaStripeClient } from "../lib/stripeClient";
import { ensureTrackingCode } from "../lib/trackingCode";
import { logger } from "../lib/logger";

const router = Router();
const JWT_SECRET = process.env.SESSION_SECRET || "localspot-secret";

// ------------------------------------------------------------------
// Guards
// ------------------------------------------------------------------

function requireAdmin(req: any, res: any, next: any): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function blockInProduction(req: any, res: any, next: any): void {
  const isProduction =
    process.env.REPLIT_DEPLOYMENT === "1" &&
    process.env.STRIPE_FORCE_TEST_MODE !== "1";
  if (isProduction) {
    res.status(403).json({
      error:
        "QA routes are disabled in production. " +
        "Set STRIPE_FORCE_TEST_MODE=1 to enable them in a QA deployment.",
    });
    return;
  }
  next();
}

// ------------------------------------------------------------------
// POST /api/admin/qa/reserve
// ------------------------------------------------------------------
// Reserves a spot on the permanent QA campaign without the isPublished /
// active-campaign guard that the public /spots/:id/reserve enforces.
// Body: { spotId, businessName, contactEmail, businessCategory? }

router.post(
  "/admin/qa/reserve",
  requireAdmin,
  blockInProduction,
  async (req, res): Promise<void> => {
    const { spotId, businessName, contactEmail, businessCategory } = req.body ?? {};
    if (!spotId || !businessName || !contactEmail) {
      res.status(400).json({ error: "spotId, businessName, and contactEmail are required" });
      return;
    }

    const [spot] = await db
      .select()
      .from(spotsTable)
      .where(eq(spotsTable.id, Number(spotId)));

    if (!spot) {
      res.status(404).json({ error: "Spot not found" });
      return;
    }
    if (!spot.isQaTest) {
      res.status(400).json({ error: "Spot does not belong to a QA campaign (isQaTest must be true)" });
      return;
    }
    if (spot.status !== "available") {
      res.status(409).json({ error: `Spot is not available (current status: ${spot.status})` });
      return;
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const [updated] = await db
      .update(spotsTable)
      .set({
        status: "reserved",
        businessName: String(businessName),
        contactEmail: String(contactEmail),
        businessCategory: businessCategory ? String(businessCategory) : "QA Test",
        expiresAt,
      })
      .where(and(eq(spotsTable.id, spot.id), eq(spotsTable.status, "available")))
      .returning();

    if (!updated) {
      res.status(409).json({ error: "Spot was taken by a concurrent request" });
      return;
    }

    logger.info({ spotId: spot.id }, "QA bot reserved spot");
    res.json({ ...updated, expiresAt: updated.expiresAt?.toISOString() ?? null });
  },
);

// ------------------------------------------------------------------
// POST /api/admin/qa/checkout
// ------------------------------------------------------------------
// Creates a PaymentIntent using STRIPE_QA_SECRET_KEY, confirms it
// server-side with pm_card_visa (a permanent Stripe test fixture), then
// runs the full DB fulfillment path:
//   - spot.status → 'paid', expiresAt → null
//   - orders row inserted
//   - tracking code assigned (ensureTrackingCode)
//   - campaign.firstPaidAt set if null
//
// No notification emails are sent — the is_qa_test flag on the campaign
// already prevents milestone emails; this endpoint skips the order/customer
// notification emails entirely.
//
// Body: { spotId }
// Returns: { piId, orderId, trackingCode }

router.post(
  "/admin/qa/checkout",
  requireAdmin,
  blockInProduction,
  async (req, res): Promise<void> => {
    const spotId = Number(req.body?.spotId);
    if (!spotId) {
      res.status(400).json({ error: "spotId is required" });
      return;
    }

    const [spot] = await db
      .select()
      .from(spotsTable)
      .where(eq(spotsTable.id, spotId));

    if (!spot) {
      res.status(404).json({ error: "Spot not found" });
      return;
    }
    if (!spot.isQaTest) {
      res.status(400).json({ error: "Spot does not belong to a QA campaign" });
      return;
    }
    if (spot.status !== "reserved") {
      res.status(400).json({ error: `Spot must be reserved before checkout (current: ${spot.status})` });
      return;
    }

    // Idempotency: if an order already exists, return it without double-charging
    const existing = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.spotId, spotId), eq(ordersTable.status, "paid")))
      .limit(1);
    if (existing.length > 0) {
      res.status(200).json({
        piId: existing[0].stripePaymentIntentId,
        orderId: existing[0].id,
        trackingCode: spot.trackingCode,
        idempotent: true,
      });
      return;
    }

    let stripe;
    try {
      stripe = getQaStripeClient();
    } catch (err: any) {
      res.status(503).json({ error: `QA Stripe client unavailable: ${err.message}` });
      return;
    }

    // Create a PaymentIntent with the QA test key
    const pi = await stripe.paymentIntents.create({
      amount: spot.price,
      currency: "usd",
      payment_method_types: ["card"],
      metadata: {
        spotId: String(spot.id),
        businessName: spot.businessName ?? "",
        isQaTest: "true",
      },
    });

    // Confirm immediately with pm_card_visa (permanent Stripe test fixture)
    const confirmed = await stripe.paymentIntents.confirm(pi.id, {
      payment_method: "pm_card_visa",
    });

    if (confirmed.status !== "succeeded") {
      res.status(400).json({
        error: `PaymentIntent confirmation failed: status=${confirmed.status}`,
        piId: pi.id,
      });
      return;
    }

    logger.info({ spotId, piId: pi.id }, "QA bot confirmed PaymentIntent");

    // --- DB fulfillment (mirrors /checkout/confirm but without emails) ---

    await db
      .update(spotsTable)
      .set({ status: "paid", expiresAt: null })
      .where(eq(spotsTable.id, spotId));

    let order;
    try {
      [order] = await db
        .insert(ordersTable)
        .values({
          spotId,
          stripePaymentIntentId: pi.id,
          amountCents: spot.price,
          status: "paid",
        })
        .returning();
    } catch (err: any) {
      if (err?.code === "23505") {
        // Concurrent write won the race — look up the existing order
        const [race] = await db
          .select()
          .from(ordersTable)
          .where(eq(ordersTable.stripePaymentIntentId, pi.id))
          .limit(1);
        order = race;
      } else {
        throw err;
      }
    }

    // Assign tracking code (idempotent — no-op if already set)
    const trackingCode = await ensureTrackingCode(spot);

    // Set campaign firstPaidAt on the first sale
    try {
      await db
        .update(campaignsTable)
        .set({ firstPaidAt: new Date() })
        .where(
          and(
            eq(campaignsTable.id, spot.campaignId),
            isNull(campaignsTable.firstPaidAt),
          ),
        );
    } catch (fpErr) {
      logger.error({ err: fpErr, campaignId: spot.campaignId }, "QA checkout: failed to set firstPaidAt — non-critical");
    }

    logger.info({ spotId, piId: pi.id, orderId: order?.id, trackingCode }, "QA bot checkout complete");

    res.json({
      piId: pi.id,
      orderId: order?.id ?? null,
      trackingCode,
    });
  },
);

// ------------------------------------------------------------------
// DELETE /api/admin/qa/cleanup
// ------------------------------------------------------------------
// Resets ALL QA spots (is_qa_test=true) to 'available' and deletes their
// associated qr_scans and orders. Safe to call from bot finally blocks.
//
// Deletion order respects FK constraints:
//   qr_scans → orders → UPDATE spots

router.delete(
  "/admin/qa/cleanup",
  requireAdmin,
  async (_req, res): Promise<void> => {
    // Intentionally NOT production-blocked — cleanup must work even if something
    // goes wrong, and it only touches is_qa_test=true rows.

    // 1. Collect all QA spot IDs
    const qaSpots = await db
      .select({ id: spotsTable.id })
      .from(spotsTable)
      .where(eq(spotsTable.isQaTest, true));

    const spotIds = qaSpots.map((s) => s.id);

    if (spotIds.length === 0) {
      res.json({ freedSpots: 0, deletedOrders: 0, deletedScans: 0 });
      return;
    }

    // 2. Delete qr_scans for QA spots
    const deletedScans = await db
      .delete(qrScansTable)
      .where(inArray(qrScansTable.spotId, spotIds))
      .returning({ id: qrScansTable.id });

    // 3. Delete orders for QA spots
    const deletedOrders = await db
      .delete(ordersTable)
      .where(inArray(ordersTable.spotId, spotIds))
      .returning({ id: ordersTable.id });

    // 4. Reset spots to available and clear all customer data
    const freed = await db
      .update(spotsTable)
      .set({
        status: "available",
        businessName: null,
        businessCategory: null,
        contactEmail: null,
        contactPhone: null,
        website: null,
        adFileUrl: null,
        adStatus: null,
        trackingCode: null,
        templateData: null,
        expiresAt: null,
      })
      .where(
        and(
          eq(spotsTable.isQaTest, true),
          sql`${spotsTable.status} != 'available'`,
        ),
      )
      .returning({ id: spotsTable.id });

    // 5. Reset campaign firstPaidAt so the next bot run gets a clean clock
    const qaCampaigns = await db
      .select({ id: campaignsTable.id })
      .from(campaignsTable)
      .where(eq(campaignsTable.isQaTest, true));

    if (qaCampaigns.length > 0) {
      await db
        .update(campaignsTable)
        .set({
          firstPaidAt: null,
          lastMilestone12EmailSentAt: null,
          lastMilestone15EmailSentAt: null,
        })
        .where(eq(campaignsTable.isQaTest, true));
    }

    logger.info(
      {
        freedSpots: freed.length,
        deletedOrders: deletedOrders.length,
        deletedScans: deletedScans.length,
      },
      "QA cleanup complete",
    );

    res.json({
      freedSpots: freed.length,
      deletedOrders: deletedOrders.length,
      deletedScans: deletedScans.length,
    });
  },
);

export default router;
