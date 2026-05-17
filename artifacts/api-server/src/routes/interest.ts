import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { db, outreachLeadsTable } from "@workspace/db";

const router: IRouter = Router();

const SubmitInterestBody = z.object({
  name: z.string().optional(),
  businessName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  industry: z.string().min(1),
  options: z.array(z.string()).optional().default([]),
});

router.post("/interest", async (req, res): Promise<void> => {
  const parsed = SubmitInterestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { name, businessName, email, phone, industry, options } = parsed.data;

  const notesParts = [
    `Interest lead — category: ${industry}`,
    options.length ? `Options requested: ${options.join(", ")}` : null,
  ].filter(Boolean);

  const [row] = await db
    .insert(outreachLeadsTable)
    .values({
      businessName: businessName.trim(),
      ownerName: name?.trim() || null,
      email: email.trim(),
      phone: phone?.trim() || null,
      industry: industry || null,
      contactMethod: "other",
      status: "not-contacted",
      notes: notesParts.join(" | "),
    })
    .returning({ id: outreachLeadsTable.id });

  res.json({ success: true, id: row.id });
});

export default router;
