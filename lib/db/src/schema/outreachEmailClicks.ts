import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { scrapedBusinessesTable } from "./scrapedBusinesses";

export const outreachEmailClicksTable = pgTable("outreach_email_clicks", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id")
    .notNull()
    .references(() => scrapedBusinessesTable.id, { onDelete: "cascade" }),
  clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (table) => ({
  businessIdIdx: index("oec_business_id_idx").on(table.businessId),
  clickedAtIdx:  index("oec_clicked_at_idx").on(table.clickedAt),
}));

export type OutreachEmailClick = typeof outreachEmailClicksTable.$inferSelect;
