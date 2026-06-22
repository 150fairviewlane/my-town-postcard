import { pgTable, text, serial, integer, timestamp, boolean, real, uniqueIndex, uuid, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Dealers are independent resellers who buy the rights to sell ad space on
// co-op postcards in their own town. Phase 1 captures signup + payment only;
// Phase 2 adds full email/password authentication (login, password reset,
// admin impersonation).
export const dealersTable = pgTable(
  "dealers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    homeZip: text("home_zip"),
    status: text("status", {
      enum: ["pending_payment", "active", "cancelled"],
    })
      .notNull()
      .default("pending_payment"),
    // Stripe references — populated as the signup flow progresses. The
    // checkout session id is stored as soon as we redirect the dealer; the
    // customer + subscription ids are populated by /confirm and the webhook.
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    // The dealer's auto-created landing-page campaign (Task #134). Plain
    // integer (not a Drizzle .references()) to avoid a circular import with
    // campaigns.ts, which already FKs dealer_id back to this table. Populated
    // idempotently when the dealer's subscription activates.
    landingPageCampaignId: integer("landing_page_campaign_id"),
    // Opaque token used by the dealer's self-service portal (/my-territory?token=<>).
    // Generated automatically at row creation. Lets us give the dealer a
    // bookmark-able link without building a full login system.
    portalToken: uuid("portal_token").defaultRandom().unique(),
    // Phase 2: email/password authentication fields
    passwordHash: text("password_hash"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    welcomeReminderSentAt: timestamp("welcome_reminder_sent_at", { withTimezone: true }),
    // Comped dealers have their monthly fee waived — they were gifted the
    // dealership directly by the admin rather than paying the $99/mo fee.
    // This flag is purely for bookkeeping (e.g. monthly-fee revenue reports
    // that need to exclude comped accounts). It has NO effect on commission
    // calculations, dealer portal access, or spot-sale revenue tracking.
    isComped: boolean("is_comped").notNull().default(false),
  },
  (t) => ({
    // Unique on email so a re-attempted signup with the same address surfaces
    // the existing record instead of silently creating duplicates.
    dealerEmailUnique: uniqueIndex("dealers_email_unique").on(t.email),
  }),
);

// Each dealer is granted up to 4 postcard territories — geographic clusters
// of ZIP codes around their home ZIP, computed by the client-side territory
// engine. We store what the dealer accepted at signup (zip list + the
// computed centroid + a friendly city label + an estimated household count)
// so the admin can review and so we can render the same map back later.
//
// FK + unique index: cascading delete keeps territories orphan-free if a
// dealer row is removed, and the (dealer_id, territory_index) uniqueness
// guarantees we never end up with duplicate slots for the same dealer.
export const dealerTerritoriesTable = pgTable(
  "dealer_territories",
  {
    id: serial("id").primaryKey(),
    dealerId: integer("dealer_id")
      .notNull()
      .references(() => dealersTable.id, { onDelete: "cascade" }),
    territoryIndex: integer("territory_index").notNull(),
    zipCodes: text("zip_codes").array().notNull(),
    centerLat: real("center_lat").notNull(),
    centerLng: real("center_lng").notNull(),
    cityLabel: text("city_label").notNull(),
    estimatedHouseholds: integer("estimated_households").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dealerIdxUnique: uniqueIndex("dealer_territory_idx_unique").on(t.dealerId, t.territoryIndex),
  }),
);

// Phase 2: password reset tokens. Raw tokens are never stored — only SHA-256
// hashes. One row per reset request; expires in 1 hour; used_at is stamped
// when the reset succeeds (token is then invalid for re-use).
export const dealerPasswordResetsTable = pgTable("dealer_password_resets", {
  id: serial("id").primaryKey(),
  dealerId: integer("dealer_id")
    .notNull()
    .references(() => dealersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Phase 2: audit log for admin actions (primarily impersonation). Logged
// whenever an admin logs in as a dealer so there is a full audit trail.
export const adminActionsTable = pgTable("admin_actions", {
  id: serial("id").primaryKey(),
  adminId: text("admin_id").notNull().default("admin"),
  action: text("action").notNull(),
  targetDealerId: integer("target_dealer_id")
    .references(() => dealersTable.id, { onDelete: "set null" }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDealerSchema = createInsertSchema(dealersTable).omit({
  id: true,
  createdAt: true,
  activatedAt: true,
  cancelledAt: true,
});
export type InsertDealer = z.infer<typeof insertDealerSchema>;
export type Dealer = typeof dealersTable.$inferSelect;
export type DealerTerritory = typeof dealerTerritoriesTable.$inferSelect;
export type DealerPasswordReset = typeof dealerPasswordResetsTable.$inferSelect;
export type AdminAction = typeof adminActionsTable.$inferSelect;
