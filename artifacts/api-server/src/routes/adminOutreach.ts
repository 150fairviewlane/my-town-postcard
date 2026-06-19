import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod/v4";
import { db, outreachLeadsTable } from "@workspace/db";
import {
  CreateOutreachLeadBody,
  UpdateOutreachLeadBody,
  ListOutreachLeadsResponse,
  CreateOutreachLeadResponse,
  UpdateOutreachLeadResponse,
  DeleteOutreachLeadResponse,
} from "@workspace/api-zod";
import jwt from "jsonwebtoken";
import { searchAllPages } from "../lib/placesApi.js";
import { findEmailOnWebsite } from "../lib/emailScraper.js";

const router: IRouter = Router();

const JWT_SECRET = process.env.SESSION_SECRET || "localspot-secret";

// Same admin guard the rest of /admin uses. Duplicated here rather than
// imported so this router can be mounted independently.
function requireAdmin(req: any, res: any, next: any): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

const serializeTimestamp = (d: Date | string | null | undefined) =>
  d instanceof Date ? d.toISOString() : (d ?? null);

// Drizzle's `date` column returns a `YYYY-MM-DD` string already; pass it
// through unchanged so the client can compare with `new Date().toISOString()
// .slice(0, 10)` directly.
const serializeDate = (d: string | null | undefined) => d ?? null;

function serializeLead(row: typeof outreachLeadsTable.$inferSelect) {
  return {
    id: row.id,
    businessName: row.businessName,
    ownerName: row.ownerName,
    phone: row.phone,
    email: row.email,
    industry: row.industry,
    town: row.town,
    contactMethod: row.contactMethod,
    status: row.status,
    notes: row.notes,
    contactedAt: serializeTimestamp(row.contactedAt),
    followUpDate: serializeDate(row.followUpDate),
    createdAt: serializeTimestamp(row.createdAt) ?? new Date().toISOString(),
  };
}

router.get("/admin/outreach", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(outreachLeadsTable)
    .orderBy(desc(outreachLeadsTable.createdAt));
  res.json(
    ListOutreachLeadsResponse.parse({ leads: rows.map(serializeLead) }),
  );
});

router.post("/admin/outreach", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateOutreachLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;
  const businessName = body.businessName.trim();
  if (!businessName) {
    res.status(400).json({ error: "businessName is required" });
    return;
  }

  const [row] = await db
    .insert(outreachLeadsTable)
    .values({
      businessName,
      ownerName: body.ownerName ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      industry: body.industry ?? null,
      town: body.town ?? null,
      contactMethod: body.contactMethod ?? "other",
      status: body.status ?? "not-contacted",
      notes: body.notes ?? null,
      followUpDate: body.followUpDate ?? null,
    })
    .returning();

  res.json(CreateOutreachLeadResponse.parse(serializeLead(row)));
});

// ── Business discovery ─────────────────────────────────────────────────────────
// POST /api/admin/outreach/discover
// Searches Google Places for businesses matching a category + city/state,
// scrapes each business website for an email address, and inserts new rows
// into outreach_leads. Skips rows that already exist (same businessName+town).
//
// Body: { category: string, city: string, state: string }
// Response: { found, newLeads, withEmail, skippedDuplicates }
const DiscoverBody = z.object({
  category: z.string().min(1).max(120),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(2),
});

router.post(
  "/admin/outreach/discover",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = DiscoverBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: String(parsed.error) });
      return;
    }
    const { category, city, state } = parsed.data;

    if (!process.env.GOOGLE_PLACES_API_KEY) {
      res.status(503).json({
        error: "GOOGLE_PLACES_API_KEY is not configured. Add it as a Replit secret.",
      });
      return;
    }

    const query = `${category} in ${city}, ${state}`;
    req.log.info({ query }, "outreach/discover: starting Places search");

    let places;
    try {
      places = await searchAllPages(query);
    } catch (err: any) {
      req.log.error({ err }, "outreach/discover: Places API error");
      const status = err?.status === 429 ? 429 : 502;
      res.status(status).json({ error: err.message ?? "Google Places API error" });
      return;
    }

    req.log.info({ found: places.length }, "outreach/discover: Places results");

    let newLeads = 0;
    let withEmail = 0;
    let skippedDuplicates = 0;

    for (const place of places) {
      // Dedup check — same business name + town already in DB
      const existing = await db
        .select({ id: outreachLeadsTable.id })
        .from(outreachLeadsTable)
        .where(
          and(
            eq(outreachLeadsTable.businessName, place.displayName),
            eq(outreachLeadsTable.town, city),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        skippedDuplicates++;
        continue;
      }

      // Polite delay before each website fetch (also spreads DB writes)
      const delayMs = 700 + Math.random() * 1100;
      await new Promise((r) => setTimeout(r, delayMs));

      // Try to scrape an email from the business website
      let email: string | null = null;
      if (place.website) {
        try {
          email = await findEmailOnWebsite(place.website);
        } catch {
          // Non-fatal — proceed without email
        }
      }
      if (email) withEmail++;

      const contactMethod =
        email ? "email" : place.phone ? "phone" : "other";

      await db.insert(outreachLeadsTable).values({
        businessName: place.displayName,
        phone: place.phone,
        email: email ?? null,
        industry: category,
        town: city,
        contactMethod,
        status: "not-contacted",
      });
      newLeads++;
    }

    req.log.info({ found: places.length, newLeads, withEmail, skippedDuplicates }, "outreach/discover: done");
    res.json({ found: places.length, newLeads, withEmail, skippedDuplicates });
  },
);

router.patch(
  "/admin/outreach/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const parsed = UpdateOutreachLeadBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const body = parsed.data;

    // Build a partial update so unset fields aren't accidentally overwritten
    // with null. `markContactedNow` is a UI affordance ("Mark Contacted Now")
    // that just stamps the server's current time onto contactedAt.
    const update: Partial<typeof outreachLeadsTable.$inferInsert> = {};
    if (body.businessName !== undefined) update.businessName = body.businessName.trim();
    if (body.ownerName !== undefined) update.ownerName = body.ownerName;
    if (body.phone !== undefined) update.phone = body.phone;
    if (body.email !== undefined) update.email = body.email;
    if (body.industry !== undefined) update.industry = body.industry;
    if (body.town !== undefined) update.town = body.town;
    if (body.contactMethod !== undefined) update.contactMethod = body.contactMethod;
    if (body.status !== undefined) update.status = body.status;
    if (body.notes !== undefined) update.notes = body.notes;
    if (body.followUpDate !== undefined) update.followUpDate = body.followUpDate;
    if (body.markContactedNow) update.contactedAt = new Date();

    const [row] = await db
      .update(outreachLeadsTable)
      .set(update)
      .where(eq(outreachLeadsTable.id, id))
      .returning();

    if (!row) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    res.json(UpdateOutreachLeadResponse.parse(serializeLead(row)));
  },
);

router.delete(
  "/admin/outreach/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const result = await db
      .delete(outreachLeadsTable)
      .where(eq(outreachLeadsTable.id, id))
      .returning({ id: outreachLeadsTable.id });
    if (result.length === 0) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    res.json(DeleteOutreachLeadResponse.parse({ success: true }));
  },
);

export default router;
