import { pgTable, text, serial, timestamp, index } from "drizzle-orm/pg-core";

export const scrapedBusinessesTable = pgTable("scraped_businesses", {
  id: serial("id").primaryKey(),
  googleId: text("google_id").unique().notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  businessName: text("business_name").notNull(),
  address: text("address"),
  phone: text("phone"),
  website: text("website"),
  email: text("email"),
  category: text("category"),
  subtypes: text("subtypes").array().notNull().default([]),
  logoUrl: text("logo_url"),
  logoMethod: text("logo_method"),
  logoStatus: text("logo_status", {
    enum: ["pending", "usable", "unusable", "no-logo-found", "needs-review"],
  }).notNull().default("pending"),
  logoVisionNotes: text("logo_vision_notes"),
  adImageUrl: text("ad_image_url"),
  adTemplate: text("ad_template"),
  adStatus: text("ad_status", {
    enum: ["pending", "generated", "failed"],
  }).notNull().default("pending"),
  adError: text("ad_error"),
  emailSubject: text("email_subject"),
  emailBodyHtml: text("email_body_html"),
  emailStatus: text("email_status", {
    enum: ["pending", "drafted", "queued", "sent", "opted-out"],
  }).notNull().default("pending"),
  scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  cityStateScrapedAtIdx: index("sb_city_state_scraped_at_idx").on(table.city, table.state, table.scrapedAt),
  logoStatusIdx: index("sb_logo_status_idx").on(table.logoStatus),
  adStatusIdx: index("sb_ad_status_idx").on(table.adStatus),
  emailStatusIdx: index("sb_email_status_idx").on(table.emailStatus),
}));

export type ScrapedBusiness = typeof scrapedBusinessesTable.$inferSelect;
export type InsertScrapedBusiness = typeof scrapedBusinessesTable.$inferInsert;
