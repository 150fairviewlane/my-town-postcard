import { sql } from "drizzle-orm";
import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// One row per long-form ad subscription (Growth Plan = 6 issues, Premium
// Visibility Plan = 12 issues). Single-issue customers do NOT get a row here
// — they continue to use the existing PaymentIntent + orders flow with no
// changes whatsoever.
//
// A subscription spans many issues/campaigns; the per-issue placement is
// recorded in subscription_issue_assignments. The initialSpotId points at the
// spot row from the campaign where the subscription was first created (it's
// the customer's first run); future issues create their own spot rows that
// are linked via the assignments table.
export const spotSubscriptionsTable = pgTable(
  "spot_subscriptions",
  {
    id: serial("id").primaryKey(),
    // The spot row in the campaign where this subscription was created.
    // Useful for backreferencing the original purchase context (price,
    // grid_area, etc). Future-issue spots are NOT referenced here.
    initialSpotId: integer("initial_spot_id").notNull(),
    // Denormalized customer info so the admin lineup tool doesn't have to
    // chase across joins, and so the customer's contact details are
    // preserved even if they later edit them on a per-issue spot row.
    businessName: text("business_name").notNull(),
    businessCategory: text("business_category"),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone"),
    website: text("website"),
    // Ad size class — future-issue spots must match this size so the
    // subscription can be placed in an equivalent slot on every campaign.
    size: text("size", { enum: ["xl", "large", "medium", "small"] }).notNull(),
    commitmentType: text("commitment_type", { enum: ["6_issue", "12_issue"] }).notNull(),
    commitmentTotalIssues: integer("commitment_total_issues").notNull(),
    monthlyPriceCents: integer("monthly_price_cents").notNull(),
    totalCommitmentValueCents: integer("total_commitment_value_cents").notNull(),
    // Stripe references — populated when the Checkout Session creates the
    // subscription. stripeSubscriptionId is unique so webhooks can upsert
    // by it idempotently regardless of arrival order.
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    commitmentStartDate: timestamp("commitment_start_date", { withTimezone: true }),
    commitmentEndDate: timestamp("commitment_end_date", { withTimezone: true }),
    subscriptionStatus: text("subscription_status", {
      enum: ["pending_payment", "active", "past_due", "canceled", "ended"],
    })
      .notNull()
      .default("pending_payment"),
    // Renewal upsell email tracking — null until each email is sent, so
    // the scheduler doesn't double-send and the admin can audit who got
    // what when.
    renewalEmailT30At: timestamp("renewal_email_t30_at", { withTimezone: true }),
    renewalEmailT7At: timestamp("renewal_email_t7_at", { withTimezone: true }),
    renewalEmailPostAt: timestamp("renewal_email_post_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Partial unique index — stripeSubscriptionId is null until the Stripe
    // Checkout Session creates the subscription; we don't want all the
    // pending_payment rows to collide on empty.
    stripeSubscriptionIdUnique: uniqueIndex("spot_subscriptions_stripe_sub_id_unique")
      .on(t.stripeSubscriptionId)
      .where(sql`${t.stripeSubscriptionId} IS NOT NULL`),
  }),
);

export const insertSpotSubscriptionSchema = createInsertSchema(spotSubscriptionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSpotSubscription = z.infer<typeof insertSpotSubscriptionSchema>;
export type SpotSubscription = typeof spotSubscriptionsTable.$inferSelect;
