import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Global idempotency log for Stripe webhooks. The webhook handler writes the
// incoming event_id here BEFORE doing any side-effecting work and aborts if
// the row already exists (UNIQUE on event_id as PK gives us atomic dedup
// across concurrent retries). Also doubles as a debug log surfaced in the
// admin dashboard so we can investigate misbehaving event flows without
// having to dig into the Stripe Dashboard.
export const stripeWebhookEventsTable = pgTable("stripe_webhook_events", {
  // Stripe's evt_... id is the natural unique key.
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  // Server clock when the request hit our endpoint, regardless of when
  // Stripe says the event was created (which lives in `payload.created`).
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  status: text("status", { enum: ["received", "processed", "failed", "skipped"] })
    .notNull()
    .default("received"),
  errorMessage: text("error_message"),
  // The full Stripe event object so we can replay or post-mortem without
  // round-tripping to the Stripe API.
  payload: jsonb("payload"),
});

export const insertStripeWebhookEventSchema = createInsertSchema(stripeWebhookEventsTable).omit({
  receivedAt: true,
});
export type InsertStripeWebhookEvent = z.infer<typeof insertStripeWebhookEventSchema>;
export type StripeWebhookEvent = typeof stripeWebhookEventsTable.$inferSelect;
