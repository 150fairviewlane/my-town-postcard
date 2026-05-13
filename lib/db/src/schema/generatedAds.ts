import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const generatedAdsTable = pgTable("generated_ads", {
  id: serial("id").primaryKey(),
  model: text("model").notNull(),
  label: text("label").notNull(),
  prompt: text("prompt").notNull(),
  imageData: text("image_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GeneratedAd = typeof generatedAdsTable.$inferSelect;
