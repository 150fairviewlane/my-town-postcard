import { pgTable, text, serial, integer, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// The audit log of which subscription ran (or skipped, or is queued) in
// which campaign/issue. This is the SOURCE OF TRUTH for fulfillment —
// "issues remaining" is always computed as
//   commitmentTotalIssues - count(rows where included_in_print = true)
// and is NEVER stored as a decrementing counter on the subscription. A
// successful Stripe invoice charges the customer; an issue is only
// considered fulfilled when the admin marks the campaign mailed.
export const subscriptionIssueAssignmentsTable = pgTable(
  "subscription_issue_assignments",
  {
    id: serial("id").primaryKey(),
    subscriptionId: integer("subscription_id").notNull(),
    // The issue (campaign) the subscription is queued/running in.
    campaignId: integer("campaign_id").notNull(),
    // The per-issue spot row created when the admin confirms the lineup.
    // Nullable while the assignment is still being staged (pre-confirmation)
    // so the admin can review pre-committed advertisers before claiming
    // grid slots.
    spotId: integer("spot_id"),
    // Optional reference to the specific ad design version mailed for this
    // issue. We don't have a separate ad_versions table yet, so this is a
    // free-form text pointer (typically the spot's templateData hash or a
    // Cloudinary asset id). Nullable until the proof is approved.
    adVersionId: text("ad_version_id"),
    proofStatus: text("proof_status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    includedInPrint: boolean("included_in_print").notNull().default(false),
    mailedAt: timestamp("mailed_at", { withTimezone: true }),
    skippedReason: text("skipped_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One assignment row per (subscription, campaign). Prevents the lineup
    // builder from double-listing a subscriber if it's run twice for the
    // same issue, and prevents the per-campaign fulfillment count from
    // double-counting.
    subscriptionCampaignUnique: uniqueIndex("subscription_issue_assignments_sub_campaign_unique").on(
      t.subscriptionId,
      t.campaignId,
    ),
  }),
);

export const insertSubscriptionIssueAssignmentSchema = createInsertSchema(
  subscriptionIssueAssignmentsTable,
).omit({ id: true, createdAt: true });
export type InsertSubscriptionIssueAssignment = z.infer<typeof insertSubscriptionIssueAssignmentSchema>;
export type SubscriptionIssueAssignment = typeof subscriptionIssueAssignmentsTable.$inferSelect;
