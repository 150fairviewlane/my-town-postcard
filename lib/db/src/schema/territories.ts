import { pgTable, text, serial, integer, timestamp, json, doublePrecision } from "drizzle-orm/pg-core";
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
  status: text("status", { enum: ["available", "pending", "taken"] })
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

export const insertTerritorySchema = createInsertSchema(territoriesTable).omit({
  createdAt: true,
});
export const insertTerritoryClaimSchema = createInsertSchema(dealerTerritoryClaimsTable).omit({
  id: true,
  claimedAt: true,
});

export type Territory = typeof territoriesTable.$inferSelect;
export type InsertTerritory = z.infer<typeof insertTerritorySchema>;
export type DealerTerritoryClaimRow = typeof dealerTerritoryClaimsTable.$inferSelect;
export type TerritoryZipAssignment = typeof territoryZipAssignmentsTable.$inferSelect;
