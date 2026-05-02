import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
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
