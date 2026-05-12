import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const imageLibraryTable = pgTable("image_library", {
  id: serial("id").primaryKey(),
  imageUrl: text("image_url").notNull(),
  thumbUrl: text("thumb_url").notNull(),
  industry: text("industry").notNull(),
  mood: text("mood"),
  textSafeRegion: text("text_safe_region").notNull().default("Bottom"),
  photographerCredit: text("photographer_credit").notNull(),
  source: text("source").notNull(),
  approved: boolean("approved").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertImageLibrarySchema = createInsertSchema(imageLibraryTable).omit({ id: true, createdAt: true });
export type InsertImageLibrary = z.infer<typeof insertImageLibrarySchema>;
export type ImageLibrary = typeof imageLibraryTable.$inferSelect;
