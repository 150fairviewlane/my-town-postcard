import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { scrapedBusinessesTable } from "./scrapedBusinesses";
import { spotsTable } from "./spots";
import { ordersTable } from "./orders";

/**
 * One row per cold-email CTA claim that converts to a paid spot.
 * businessId links back to the scraped business that was emailed.
 * spotId and orderId link the claim to the actual purchase so you can
 * compute conversion rate and revenue per outreach campaign.
 */
export const businessClaimEventsTable = pgTable("business_claim_events", {
  id:         serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => scrapedBusinessesTable.id),
  claimedAt:  timestamp("claimed_at",  { withTimezone: true }).notNull().defaultNow(),
  spotId:     integer("spot_id").references(() => spotsTable.id),
  orderId:    integer("order_id").references(() => ordersTable.id),
  ipAddress:  text("ip_address"),
  userAgent:  text("user_agent"),
  referrer:   text("referrer"),
}, (t) => ({
  businessIdIdx: index("bce_business_id_idx").on(t.businessId),
  claimedAtIdx:  index("bce_claimed_at_idx").on(t.claimedAt),
  spotIdIdx:     index("bce_spot_id_idx").on(t.spotId),
}));

export type BusinessClaimEvent = typeof businessClaimEventsTable.$inferSelect;
export type InsertBusinessClaimEvent = typeof businessClaimEventsTable.$inferInsert;
