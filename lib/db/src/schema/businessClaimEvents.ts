import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { scrapedBusinessesTable } from "./scrapedBusinesses";

/**
 * One row per cold-email CTA click ("claim your ad" link).
 * Distinct from a pageview — each row is tied to a specific scraped business
 * so you can query "which businesses engaged" without relying on a hit counter.
 */
export const businessClaimEventsTable = pgTable("business_claim_events", {
  id:         serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => scrapedBusinessesTable.id),
  claimedAt:  timestamp("claimed_at",  { withTimezone: true }).notNull().defaultNow(),
  ipAddress:  text("ip_address"),
  userAgent:  text("user_agent"),
  referrer:   text("referrer"),
}, (t) => ({
  businessIdIdx: index("bce_business_id_idx").on(t.businessId),
  claimedAtIdx:  index("bce_claimed_at_idx").on(t.claimedAt),
}));

export type BusinessClaimEvent = typeof businessClaimEventsTable.$inferSelect;
export type InsertBusinessClaimEvent = typeof businessClaimEventsTable.$inferInsert;
