import { sql } from "drizzle-orm";
import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    spotId: integer("spot_id").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    amountCents: integer("amount_cents").notNull(),
    status: text("status", { enum: ["pending", "paid", "failed"] }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Partial unique index on stripe_payment_intent_id (when not NULL) gives
    // us atomic dedup between the synchronous /checkout/confirm route and the
    // /api/webhooks/stripe webhook. Whichever inserts first wins; the other
    // gets a unique-violation error which the caller treats as "already
    // recorded" (idempotent no-op).
    stripePaymentIntentIdUnique: uniqueIndex("orders_stripe_payment_intent_id_unique")
      .on(t.stripePaymentIntentId)
      .where(sql`${t.stripePaymentIntentId} IS NOT NULL`),
    // Partial unique index: at most one PAID order per spot, ever. This is
    // the DB-level guarantee that a spot can never be double-charged. If two
    // distinct PaymentIntents both succeed for the same spot (e.g. customer
    // reloads checkout, two PIs are created, both somehow get confirmed),
    // the second insert here fails with 23505 and the application code
    // refunds (or flags for manual reconciliation) instead of issuing a
    // duplicate paid order. Failed/pending orders are not constrained.
    paidOrderPerSpotUnique: uniqueIndex("orders_paid_spot_unique")
      .on(t.spotId)
      .where(sql`${t.status} = 'paid'`),
  }),
);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
