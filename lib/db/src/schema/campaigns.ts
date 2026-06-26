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
  // Fill-rate tracking. firstPaidAt is set (once, idempotently) when the
  // campaign's first spot order is confirmed — this is the "clock start" for
  // all 30/40/45-day alerts and the dealer soft-goal coaching countdown.
  // Campaigns with firstPaidAt IS NULL have no clock running and are skipped
  // entirely by the fill-rate alert scheduler.
  firstPaidAt: timestamp("first_paid_at", { withTimezone: true }),
  // Each tier fires exactly once per campaign. Set to now() immediately after
  // the corresponding admin-alert email is sent; never reset.
  adminAlert30SentAt: timestamp("admin_alert_30_sent_at", { withTimezone: true }),
  adminAlert40SentAt: timestamp("admin_alert_40_sent_at", { withTimezone: true }),
  adminAlert45SentAt: timestamp("admin_alert_45_sent_at", { withTimezone: true }),
  // Dealer 30-day coaching reminder (sent once at the 30-day mark).
  dealerReminder30SentAt: timestamp("dealer_reminder_30_sent_at", { withTimezone: true }),
  // Milestone email tracking (daily-recurring, unlike the one-shot fill-rate alerts).
  // Set to now() when the milestone email is sent; reset to null is intentionally
  // NOT done — the scheduler compares the date portion to today's UTC date so it
  // re-fires once per calendar day for as long as the campaign stays active/draft
  // and has not been completed. A completed campaign is excluded by the status filter.
  lastMilestone12EmailSentAt: timestamp("last_milestone_12_email_sent_at", { withTimezone: true }),
  lastMilestone15EmailSentAt: timestamp("last_milestone_15_email_sent_at", { withTimezone: true }),
  // QA bot flag. When true this campaign and its spots are permanently excluded
  // from all milestone emails, revenue rollups, commission calculations, and QR
  // scan analytics. The dedicated bot campaign is never counted toward real
  // milestones — it exists only for automated QA runs.
  isQaTest: boolean("is_qa_test").notNull().default(false),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({ id: true, createdAt: true });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
