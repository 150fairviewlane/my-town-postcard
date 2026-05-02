import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const qrScansTable = pgTable(
  "qr_scans",
  {
    id: serial("id").primaryKey(),
    spotId: integer("spot_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    city: text("city"),
  },
  (t) => ({
    spotIdx: index("qr_scans_spot_id_idx").on(t.spotId),
    scannedAtIdx: index("qr_scans_scanned_at_idx").on(t.scannedAt),
  }),
);

export const insertQrScanSchema = createInsertSchema(qrScansTable).omit({ id: true, scannedAt: true });
export type InsertQrScan = z.infer<typeof insertQrScanSchema>;
export type QrScan = typeof qrScansTable.$inferSelect;
