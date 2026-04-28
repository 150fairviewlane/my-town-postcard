import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const spotsTable = pgTable("spots", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  size: text("size", { enum: ["large", "medium", "small"] }).notNull(),
  gridArea: text("grid_area").notNull(),
  price: integer("price").notNull(),
  categoryLock: text("category_lock"),
  status: text("status", { enum: ["available", "reserved", "paid"] }).notNull().default("available"),
  businessName: text("business_name"),
  businessCategory: text("business_category"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  adFileUrl: text("ad_file_url"),
  adStatus: text("ad_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSpotSchema = createInsertSchema(spotsTable).omit({ id: true, createdAt: true });
export type InsertSpot = z.infer<typeof insertSpotSchema>;
export type Spot = typeof spotsTable.$inferSelect;
