import { pgTable, text, serial, integer, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const spotsTable = pgTable("spots", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  // Which face of the postcard this spot lives on. Front and back are
  // independently sellable using the same payment + ad-generator flow.
  side: text("side", { enum: ["front", "back"] }).notNull().default("front"),
  size: text("size", { enum: ["xl", "large", "medium", "small"] }).notNull(),
  gridArea: text("grid_area").notNull(),
  price: integer("price").notNull(),
  categoryLock: text("category_lock"),
  status: text("status", { enum: ["available", "reserved", "paid"] }).notNull().default("available"),
  businessName: text("business_name"),
  businessCategory: text("business_category"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  website: text("website"),
  adFileUrl: text("ad_file_url"),
  adStatus: text("ad_status"),
  // URL-safe slug used for the trackable QR redirect at /go/:code. Generated
  // when the spot transitions to "paid" (in the Stripe webhook and the
  // synchronous /checkout/confirm path). Unique across the table; null until
  // payment so that available/reserved rows don't collide on the empty string.
  trackingCode: text("tracking_code").unique(),
  // When a spot transitions to "reserved" it gets a 30-minute hold. The
  // periodic sweeper (artifacts/api-server/src/lib/expirationCleanup.ts) and
  // the Stripe checkout.session.expired webhook handler both reset spots
  // whose hold has lapsed. NULL for available rows and for paid rows (a
  // paid spot has no expiry); only meaningful on status="reserved" rows.
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  // Full AdGenerator state (JSON) captured at reservation time so the postcard
  // picker can render the exact ad the customer designed.
  templateData: text("template_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Denormalized copy of the parent campaign's is_qa_test flag. Stored on the
  // spot row so every query touching spots can filter without a JOIN back to
  // campaigns. Set once at seed/insert time; never changed.
  isQaTest: boolean("is_qa_test").notNull().default(false),
}, (table) => ({
  // Prevent two spots with the same grid area from being inserted for the
  // same campaign. This is the DB-level enforcement of the layout invariant —
  // a uniqueness violation here means a bug in the spot-generation code
  // (duplicate entry in STANDARD_SPOT_LAYOUT or two concurrent inserts for
  // the same campaign).
  campaignGridAreaUnique: uniqueIndex("spots_campaign_grid_area_unique").on(
    table.campaignId,
    table.gridArea,
  ),
}));

export const insertSpotSchema = createInsertSchema(spotsTable).omit({ id: true, createdAt: true });
export type InsertSpot = z.infer<typeof insertSpotSchema>;
export type Spot = typeof spotsTable.$inferSelect;
