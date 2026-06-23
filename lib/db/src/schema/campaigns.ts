import { pgTable, text, serial, integer, timestamp, boolean, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dealersTable } from "./dealers";

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  territory: text("territory").notNull(),
  zipCode: text("zip_code").notNull(),
  mailDate: text("mail_date"),
  homesCount: integer("homes_count").notNull().default(5000),
  status: text("status", { enum: ["draft", "active", "completed"] }).notNull().default("draft"),
  // --- Multi-tenant territory pages (Task #134) ---
  // Unique URL slug for the public landing page (e.g. "white-habersham").
  // Nullable: legacy campaigns + admin drafts may have no public page. Postgres
  // allows many NULLs in a UNIQUE column so this never collides.
  slug: text("slug").unique(),
  // Dealer who owns this territory page (null for the house/Habersham page and
  // admin-created campaigns). FK with onDelete:set null so removing a dealer
  // leaves the campaign intact but unlinked.
  dealerId: integer("dealer_id").references(() => dealersTable.id, { onDelete: "set null" }),
  // Whether the page is publicly viewable + purchasable. This is the
  // multi-tenant purchase gate (replaces the single-active-campaign rule for
  // public pages): many campaigns can be published at once.
  isPublished: boolean("is_published").notNull().default(false),
  // Human copy injected into the landing page (e.g. "Summer 2026" / "June 2026"
  // / "Clarkesville, Demorest, Cornelia, Alto"). All optional — the frontend
  // falls back to sensible defaults when absent.
  mailingSeason: text("mailing_season"),
  mailingMonth: text("mailing_month"),
  cityList: text("city_list"),
  // Per-campaign map pin override. When set these take precedence over the
  // shared territories-table centroid so individual sub-zones (e.g. Cherokee:
  // Canton, Woodstock, Ball Ground, Holly Springs) pin to the real city centre
  // rather than the county centroid.
  pinLat: doublePrecision("pin_lat"),
  pinLng: doublePrecision("pin_lng"),
  // Optional personal note from the dealer shown above the spot picker on their
  // landing page. Helps build trust when the territory is new and has zero
  // advertisers yet. Null = no note displayed.
  dealerWelcomeMessage: text("dealer_welcome_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({ id: true, createdAt: true });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
