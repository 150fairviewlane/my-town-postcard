import { pgTable, text, serial, integer, timestamp, json, jsonb, doublePrecision, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dealersTable } from "./dealers";

// Named county-based dealer territories. Each territory is a group of one or
// more contiguous counties in a state. Non-overlapping by definition — each
// county belongs to at most one territory.
export const territoriesTable = pgTable("territories", {
  // Human-readable primary key like "GA-001"
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  state: text("state").notNull(),
  // JSON array of county name strings, e.g. ["White","Habersham"]
  counties: json("counties").$type<string[]>().notNull().default([]),
  households: integer("households").notNull().default(0),
  zones: integer("zones").notNull().default(4),
  status: text("status", { enum: ["available", "pending", "taken", "proposed"] })
    .notNull()
    .default("available"),
  // Key cities / communities within the territory (display hint for dealers)
  zoneNote: text("zone_note"),
  // Geographic centroid of the territory (averaged from constituent county centroids)
  centroidLat: doublePrecision("centroid_lat"),
  centroidLng: doublePrecision("centroid_lng"),
  // Linked dealer (set when territory is claimed + activated)
  dealerId: integer("dealer_id").references(() => dealersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Auto-builder fields
  businessCount: integer("business_count"),
  source: text("source").default("manual"),        // 'manual' | 'auto-generated'
  proposedByZip: text("proposed_by_zip"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  // The territory_proposals.id this territory was materialized from (webhook
  // idempotency key — a retried Stripe event won't create a duplicate).
  sourceProposalId: integer("source_proposal_id"),
});

// Records each dealer's territory claim. Created when the dealer submits the
// signup form; status progresses from pending → active once payment clears
// (future work — payment wiring not in scope for the initial implementation).
export const dealerTerritoryClaimsTable = pgTable("dealer_territory_claims", {
  id: serial("id").primaryKey(),
  territoryId: text("territory_id")
    .notNull()
    .references(() => territoriesTable.id, { onDelete: "cascade" }),
  // Dealer contact info — stored directly so the claim is self-contained even
  // before a dealer account is created or a payment is processed.
  dealerName: text("dealer_name").notNull(),
  dealerEmail: text("dealer_email").notNull(),
  dealerPhone: text("dealer_phone"),
  // Optional FK populated if a full dealer row already exists
  dealerId: integer("dealer_id").references(() => dealersTable.id, {
    onDelete: "set null",
  }),
  status: text("status", { enum: ["pending", "active", "cancelled"] })
    .notNull()
    .default("pending"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
});

// ZIP-to-territory assignments. Each ZIP code belongs to at most one territory
// (enforced by the TEXT PRIMARY KEY). Used to render per-ZIP boundaries on the
// public territory-finder map instead of county polygons, eliminating all
// county-level overlaps and sub-county ambiguities.
export const territoryZipAssignmentsTable = pgTable("territory_zip_assignments", {
  zip: text("zip").primaryKey(),
  territoryId: text("territory_id")
    .notNull()
    .references(() => territoriesTable.id, { onDelete: "cascade" }),
});

// Auto-builder proposal workflow. Created when a dealer enters their ZIP code;
// reviewed and approved/rejected by admin before becoming a live territory.
export const territoryProposalsTable = pgTable("territory_proposals", {
  id: serial("id").primaryKey(),
  // Populated after admin approves and the territory row is inserted
  territoryId: text("territory_id"),
  zipCode: text("zip_code"),
  stateFips: text("state_fips").notNull(),
  stateAbbr: text("state_abbr").notNull(),
  // Primary county — null when the proposal was built from city+state only (no ZIP)
  countyFips: text("county_fips"),
  countyName: text("county_name"),
  proposedName: text("proposed_name").notNull(),
  // JSONB arrays — proposed_counties: 5-digit GEOID strings; proposed_cities: city names
  proposedCounties: jsonb("proposed_counties").$type<string[]>().notNull(),
  proposedCities: jsonb("proposed_cities").$type<string[]>().notNull(),
  businessCount: integer("business_count").notNull(),
  // Materialization payload — stored so the Stripe webhook can build the
  // territory row without recomputing hubs (and so the 25-mile post-payment
  // conflict re-check has a centroid to test).
  households: integer("households").notNull().default(0),
  centroidLat: doublePrecision("centroid_lat"),
  centroidLng: doublePrecision("centroid_lng"),
  isSplit: boolean("is_split").default(false),
  splitIndex: integer("split_index"),
  splitTotal: integer("split_total"),
  // Pending-payment holding table for the unified claim flow:
  //   pending_payment → claimed (territory materialized on Stripe payment)
  //                   → conflict (overlap appeared during checkout; refunded)
  status: text("status", { enum: ["pending_payment", "claimed", "conflict"] })
    .notNull()
    .default("pending_payment"),
  // Dealer created up front (pending_payment) when Claim is clicked; the
  // webhook links + activates this dealer when payment completes.
  dealerId: integer("dealer_id").references(() => dealersTable.id, {
    onDelete: "set null",
  }),
  dealerName: text("dealer_name"),
  dealerEmail: text("dealer_email"),
  dealerPhone: text("dealer_phone"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: text("reviewed_by"),
  notes: text("notes"),
});

export const insertTerritorySchema = createInsertSchema(territoriesTable).omit({
  createdAt: true,
});
export const insertTerritoryClaimSchema = createInsertSchema(dealerTerritoryClaimsTable).omit({
  id: true,
  claimedAt: true,
});
export const insertTerritoryProposalSchema = createInsertSchema(territoryProposalsTable).omit({
  id: true,
  createdAt: true,
});

export type Territory = typeof territoriesTable.$inferSelect;
export type InsertTerritory = z.infer<typeof insertTerritorySchema>;
export type DealerTerritoryClaimRow = typeof dealerTerritoryClaimsTable.$inferSelect;
export type TerritoryZipAssignment = typeof territoryZipAssignmentsTable.$inferSelect;
export type TerritoryProposalRow = typeof territoryProposalsTable.$inferSelect;
