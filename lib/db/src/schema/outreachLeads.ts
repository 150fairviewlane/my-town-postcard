import { pgTable, text, serial, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const outreachLeadsTable = pgTable("outreach_leads", {
  id: serial("id").primaryKey(),
  businessName: text("business_name").notNull(),
  ownerName: text("owner_name"),
  phone: text("phone"),
  email: text("email"),
  industry: text("industry"),
  town: text("town"),
  contactMethod: text("contact_method", {
    enum: ["facebook", "phone", "email", "in-person", "other"],
  }).notNull().default("other"),
  status: text("status", {
    enum: [
      "not-contacted",
      "contacted",
      "interested",
      "reserved",
      "paid",
      "passed",
    ],
  }).notNull().default("not-contacted"),
  notes: text("notes"),
  contactedAt: timestamp("contacted_at", { withTimezone: true }),
  followUpDate: date("follow_up_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOutreachLeadSchema = createInsertSchema(outreachLeadsTable)
  .omit({ id: true, createdAt: true });
export type InsertOutreachLead = z.infer<typeof insertOutreachLeadSchema>;
export type OutreachLead = typeof outreachLeadsTable.$inferSelect;
