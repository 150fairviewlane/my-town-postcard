import { pgTable, text, serial, integer, timestamp, real, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Dealers are independent resellers who buy the rights to sell ad space on
// co-op postcards in their own town. Phase 1 captures signup + payment only;
// dealer login + dashboard come in later phases.
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
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

export const insertDealerSchema = createInsertSchema(dealersTable).omit({
  id: true,
  createdAt: true,
  activatedAt: true,
  cancelledAt: true,
});
export type InsertDealer = z.infer<typeof insertDealerSchema>;
export type Dealer = typeof dealersTable.$inferSelect;
export type DealerTerritory = typeof dealerTerritoriesTable.$inferSelect;
