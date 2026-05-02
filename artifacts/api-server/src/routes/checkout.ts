import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, spotsTable, ordersTable } from "@workspace/db";
import {
  CreatePaymentIntentBody,
  CreatePaymentIntentResponse,
  ConfirmPaymentBody,
  ConfirmPaymentResponse,
} from "@workspace/api-zod";
import { sendReservationConfirmation, sendAdminNewOrder } from "../lib/emails";
import { logger } from "../lib/logger";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return null;
  }
  const Stripe = require("stripe");
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

const router: IRouter = Router();

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

  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: "Payment processing not configured. Set STRIPE_SECRET_KEY." });
    return;
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: spot.price,
    currency: "usd",
    metadata: {
      spotId: spot.id,
      businessName: spot.businessName ?? "",
      businessCategory: spot.businessCategory ?? "",
    },
  });

  req.log.info({ spotId: spot.id, amount: spot.price }, "PaymentIntent created");

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

  const stripe = getStripe();

  if (stripe) {
    try {
      const intent = await stripe.paymentIntents.retrieve(body.data.paymentIntentId);
      if (intent.status !== "succeeded") {
        res.status(400).json({ error: "Payment has not succeeded yet" });
        return;
      }
    } catch (err) {
      logger.warn({ err }, "Could not verify payment intent — proceeding");
    }
  }

  const [spot] = await db
    .select()
    .from(spotsTable)
    .where(eq(spotsTable.id, body.data.spotId));

  if (!spot) {
    res.status(404).json({ error: "Spot not found" });
    return;
  }

  await db
    .update(spotsTable)
    .set({ status: "paid" })
    .where(eq(spotsTable.id, body.data.spotId));

  const [order] = await db
    .insert(ordersTable)
    .values({
      spotId: body.data.spotId,
      stripePaymentIntentId: body.data.paymentIntentId,
      amountCents: spot.price,
      status: "paid",
    })
    .returning();

  req.log.info({ orderId: order.id, spotId: spot.id }, "Payment confirmed, order created");

  const orderInfo = {
    businessName: spot.businessName ?? "Unknown",
    contactEmail: spot.contactEmail ?? "",
    spotSize: spot.size,
    spotPrice: spot.price,
    spotId: spot.id,
    orderId: order.id,
  };

  await Promise.all([
    sendReservationConfirmation(orderInfo),
    sendAdminNewOrder(orderInfo),
  ]);

  res.json(ConfirmPaymentResponse.parse({ success: true, orderId: order.id }));
});

export default router;
