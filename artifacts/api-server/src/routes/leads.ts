import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { db, outreachLeadsTable } from "@workspace/db";
import {
  sendAdminContactInquiry,
  sendDealerContactInquiry,
  sendContactAutoReply,
} from "../lib/emails";

const router: IRouter = Router();

const SubmitLeadBody = z.object({
  first: z.string().min(1),
  last: z.string().min(1),
  biz: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  dealerEmail: z.string().email().nullable().optional(),
  territory: z.string().nullable().optional(),
});

router.post("/leads", async (req, res): Promise<void> => {
  const parsed = SubmitLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { first, last, biz, email, phone, dealerEmail, territory } = parsed.data;

  const ownerName = `${first.trim()} ${last.trim()}`.trim();

  const [row] = await db
    .insert(outreachLeadsTable)
    .values({
      businessName: biz.trim(),
      ownerName,
      email: email.trim(),
      phone: phone.trim(),
      contactMethod: "other",
      status: "not-contacted",
      notes: "Got Questions? form submission",
    })
    .returning({ id: outreachLeadsTable.id });

  const info = { first: first.trim(), last: last.trim(), biz: biz.trim(), email: email.trim(), phone: phone.trim(), dealerEmail: dealerEmail ?? null, territory: territory ?? null };

  const tasks = [
    sendAdminContactInquiry(info),
    sendContactAutoReply(info),
    ...(dealerEmail ? [sendDealerContactInquiry(info)] : []),
  ];

  const results = await Promise.allSettled(tasks);
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      req.log.warn({ err: r.reason, emailIndex: i }, "leads: email send failed");
    }
  });

  res.json({ success: true, id: row.id });
});

export default router;
