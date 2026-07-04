import { Router, type IRouter } from "express";
import { eq, desc, and, ilike, or, sql } from "drizzle-orm";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { db, scrapedBusinessesTable } from "@workspace/db";
import { searchBusinesses } from "../lib/outscraper.js";
import { extractLogo } from "../lib/logoExtractor.js";
import { filterLogo } from "../lib/logoFilter.js";
import { generateAdForOutreach, type OutreachAdParams } from "../lib/generateAdForOutreach.js";
import { findEmailOnWebsite } from "../lib/emailScraper.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();
const JWT_SECRET = process.env.SESSION_SECRET || "localspot-secret";
const UNSUB_SECRET = process.env.SESSION_SECRET || "localspot-secret";
const APP_URL = process.env.APP_URL || "https://mytownpostcard.com";
const FROM_EMAIL = process.env.FROM_EMAIL || "info@mytownpostcard.com";

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

function unsubToken(id: number): string {
  return crypto
    .createHmac("sha256", UNSUB_SECRET)
    .update(String(id))
    .digest("hex")
    .slice(0, 24);
}

// ── In-memory job registry ─────────────────────────────────────────────────────
interface JobRecord {
  status: "running" | "done" | "failed";
  type: "scrape" | "logo" | "ad" | "email";
  label: string;
  total: number;
  processed: number;
  newCount: number;
  skippedDuplicates: number;
  withEmail: number;
  log: string[];
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}
const jobs = new Map<string, JobRecord>();

function newJob(type: JobRecord["type"], label: string): string {
  const id = crypto.randomUUID();
  jobs.set(id, {
    status: "running",
    type,
    label,
    total: 0,
    processed: 0,
    newCount: 0,
    skippedDuplicates: 0,
    withEmail: 0,
    log: [],
    startedAt: new Date(),
  });
  // Prune old completed jobs (keep max 20)
  const completed = [...jobs.entries()]
    .filter(([, j]) => j.status !== "running")
    .sort((a, b) => (b[1].completedAt?.getTime() ?? 0) - (a[1].completedAt?.getTime() ?? 0));
  for (const [oldId] of completed.slice(20)) jobs.delete(oldId);
  return id;
}

function jobAppend(jobId: string, msg: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.log.push(msg);
  if (job.log.length > 200) job.log.shift();
}

// ── Email draft helpers ────────────────────────────────────────────────────────
function buildEmailDraft(business: {
  id: number;
  businessName: string;
  city: string;
  state: string;
  category: string | null;
  phone: string | null;
  website: string | null;
  adImageUrl: string | null;
}): { subject: string; bodyHtml: string } {
  const { id, businessName, city, state, category, phone, adImageUrl } = business;
  const token = unsubToken(id);
  const unsubUrl = `${APP_URL}/api/outreach/unsubscribe?id=${id}&token=${token}`;
  const spotUrl = `${APP_URL}/?utm_source=outreach&utm_medium=email&utm_campaign=cold`;

  const industryLine = category
    ? `As a ${category.toLowerCase()} business in the ${city} area`
    : `As a local business serving the ${city} area`;

  const phoneNote = phone ? ` — call us at ${phone}` : "";

  const adSection = adImageUrl && !adImageUrl.startsWith("data:")
    ? `<div style="text-align:center;margin:24px 0;">
        <img src="${adImageUrl}" alt="Sample ad for ${businessName}" width="300"
          style="border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.15);max-width:100%;" />
        <div style="color:#6b7280;font-size:12px;margin-top:6px;">Sample ad concept we designed for you</div>
      </div>`
    : "";

  const bodyHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:system-ui,sans-serif;">
<div style="max-width:580px;margin:0 auto;padding:32px 16px;">
  <div style="background:#fff;border-radius:12px;padding:36px 32px;box-shadow:0 2px 8px rgba(0,0,0,0.07);">

    <div style="font-family:Georgia,serif;font-size:22px;font-weight:900;color:#7B1418;margin-bottom:4px;">
      📮 My Town Postcard
    </div>
    <div style="font-size:13px;color:#9ca3af;margin-bottom:28px;">Reaching 5,000 ${city}, ${state} homes</div>

    <p style="font-size:16px;color:#111;line-height:1.6;margin-bottom:16px;">
      Hi <strong>${businessName}</strong> team,
    </p>

    <p style="font-size:15px;color:#374151;line-height:1.7;margin-bottom:16px;">
      ${industryLine}, we wanted to reach out about an exciting opportunity to get your name
      in front of <strong>5,000 local households</strong> — all in ${city} and the surrounding area.
    </p>

    <p style="font-size:15px;color:#374151;line-height:1.7;margin-bottom:16px;">
      We're putting together a <strong>co-op postcard mailer</strong> sent directly to 5,000 homes
      via USPS Every Door Direct Mail® (EDDM). You only pay for one advertising spot —
      no list purchase, no per-address fees — just a single flat price for your ad on a
      beautifully printed 9"×12" postcard.
    </p>

    ${adSection}

    <div style="background:#fef2f2;border-left:4px solid #7B1418;padding:16px 20px;border-radius:0 8px 8px 0;margin:24px 0;">
      <div style="font-weight:700;color:#7B1418;margin-bottom:8px;">What you get:</div>
      <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;font-size:14px;">
        <li>Full-color printed ad on a premium 9"×12" postcard</li>
        <li>Delivered to 5,000 homes — no duplicates, no waste</li>
        <li>FREE professional ad design included</li>
        <li>QR code tracking so you can measure response</li>
        <li>One-time fee, no subscription required</li>
      </ul>
    </div>

    <p style="font-size:15px;color:#374151;line-height:1.7;margin-bottom:24px;">
      Spots are limited and sold on a first-come basis. We'd love to feature
      <strong>${businessName}</strong> on the next mailer.
    </p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${spotUrl}" style="display:inline-block;padding:14px 32px;background:#7B1418;color:#fff;
        font-weight:700;font-size:15px;border-radius:8px;text-decoration:none;">
        See Available Spots →
      </a>
    </div>

    <p style="font-size:14px;color:#6b7280;line-height:1.6;margin-top:24px;">
      Questions? Reply to this email or give us a call${phoneNote}.
    </p>

    <div style="margin-top:32px;padding-top:18px;border-top:2px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;">
      <div style="margin-bottom:4px;">My Town Postcard · ${city}, ${state}</div>
      <div>
        <a href="${spotUrl}" style="color:#9ca3af;">Visit our site</a>
        &nbsp;·&nbsp;
        <a href="${unsubUrl}" style="color:#9ca3af;">Unsubscribe</a>
      </div>
    </div>

  </div>
</div>
</body></html>`;

  const subject = `${city} postcard — a spot reserved for ${businessName}`;
  return { subject, bodyHtml };
}

// ── GET /api/admin/scraper/businesses ─────────────────────────────────────────
router.get("/admin/scraper/businesses", requireAdmin, async (req, res): Promise<void> => {
  const { city, state, email_status, logo_status, ad_status, q, limit = "50", offset = "0" } = req.query as Record<string, string>;

  const conditions = [];
  if (city) conditions.push(ilike(scrapedBusinessesTable.city, `%${city}%`));
  if (state) conditions.push(eq(scrapedBusinessesTable.state, state.toUpperCase()));
  if (email_status) conditions.push(eq(scrapedBusinessesTable.emailStatus, email_status as any));
  if (logo_status) conditions.push(eq(scrapedBusinessesTable.logoStatus, logo_status as any));
  if (ad_status) conditions.push(eq(scrapedBusinessesTable.adStatus, ad_status as any));
  if (q) {
    conditions.push(
      or(
        ilike(scrapedBusinessesTable.businessName, `%${q}%`),
        ilike(scrapedBusinessesTable.category, `%${q}%`),
        ilike(scrapedBusinessesTable.email, `%${q}%`),
      )!,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const lim = Math.min(Number(limit) || 50, 200);
  const off = Number(offset) || 0;

  const [rows, countRow] = await Promise.all([
    db
      .select()
      .from(scrapedBusinessesTable)
      .where(where)
      .orderBy(desc(scrapedBusinessesTable.scrapedAt))
      .limit(lim)
      .offset(off),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(scrapedBusinessesTable)
      .where(where),
  ]);

  const total = countRow[0]?.count ?? 0;
  res.json({ businesses: rows, total, limit: lim, offset: off });
});

// ── GET /api/admin/scraper/businesses/:id ─────────────────────────────────────
router.get("/admin/scraper/businesses/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db
    .select()
    .from(scrapedBusinessesTable)
    .where(eq(scrapedBusinessesTable.id, id))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// ── PATCH /api/admin/scraper/businesses/:id ───────────────────────────────────
router.patch("/admin/scraper/businesses/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const allowed = ["emailStatus", "email", "phone", "website", "notes", "logoStatus"] as const;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (key in req.body) update[key === "emailStatus" ? "emailStatus" : key] = req.body[key];
  }

  // Map camelCase from body to snake_case drizzle columns
  const mapped: Partial<typeof scrapedBusinessesTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if ("emailStatus" in req.body) mapped.emailStatus = req.body.emailStatus;
  if ("email" in req.body) mapped.email = req.body.email;
  if ("phone" in req.body) mapped.phone = req.body.phone;
  if ("website" in req.body) mapped.website = req.body.website;
  if ("logoStatus" in req.body) mapped.logoStatus = req.body.logoStatus;

  const [updated] = await db
    .update(scrapedBusinessesTable)
    .set(mapped)
    .where(eq(scrapedBusinessesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// ── DELETE /api/admin/scraper/businesses/:id ──────────────────────────────────
router.delete("/admin/scraper/businesses/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(scrapedBusinessesTable).where(eq(scrapedBusinessesTable.id, id));
  res.json({ ok: true });
});

// ── GET /api/admin/scraper/jobs ───────────────────────────────────────────────
router.get("/admin/scraper/jobs", requireAdmin, (_req, res): void => {
  const list = [...jobs.entries()].map(([id, j]) => ({ id, ...j }));
  list.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  res.json(list);
});

// ── GET /api/admin/scraper/job/:jobId ─────────────────────────────────────────
router.get("/admin/scraper/job/:jobId", requireAdmin, (req, res): void => {
  const job = jobs.get(req.params.jobId);
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.json({ id: req.params.jobId, ...job });
});

// ── POST /api/admin/scraper/scrape ────────────────────────────────────────────
router.post("/admin/scraper/scrape", requireAdmin, async (req, res): Promise<void> => {
  const { category, city, state, limit = 50 } = req.body as {
    category: string;
    city: string;
    state: string;
    limit?: number;
  };

  if (!category?.trim() || !city?.trim() || !state?.trim()) {
    res.status(400).json({ error: "category, city, and state are required" });
    return;
  }

  if (!process.env.OUTSCRAPER_API_KEY) {
    res.status(503).json({ error: "OUTSCRAPER_API_KEY is not configured on this server" });
    return;
  }

  const query = `${category.trim()}, ${city.trim()}, ${state.trim().toUpperCase()}, US`;
  const jobId = newJob("scrape", `${query} (limit ${limit})`);
  res.json({ jobId, query });

  // Run async
  runScrapeJob(jobId, query, city.trim(), state.trim().toUpperCase(), Number(limit) || 50).catch((err) => {
    const job = jobs.get(jobId);
    if (job) {
      job.status = "failed";
      job.error = String(err);
      job.completedAt = new Date();
    }
    logger.error({ err, jobId }, "adminScraper: scrape job failed");
  });
});

async function runScrapeJob(
  jobId: string,
  query: string,
  city: string,
  state: string,
  limit: number,
): Promise<void> {
  const job = jobs.get(jobId)!;
  jobAppend(jobId, `Searching Outscraper: "${query}"`);

  let results;
  try {
    results = await searchBusinesses(query, limit);
  } catch (err) {
    job.status = "failed";
    job.error = String(err);
    job.completedAt = new Date();
    jobAppend(jobId, `❌ Outscraper error: ${String(err)}`);
    return;
  }

  job.total = results.length;
  jobAppend(jobId, `Found ${results.length} results from Outscraper`);

  let newCount = 0;
  let skipped = 0;
  let withEmail = 0;

  for (const biz of results) {
    job.processed++;

    const existing = await db
      .select({ id: scrapedBusinessesTable.id })
      .from(scrapedBusinessesTable)
      .where(eq(scrapedBusinessesTable.googleId, biz.googleId))
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      job.skippedDuplicates = skipped;
      continue;
    }

    let email = biz.email;
    if (!email && biz.website) {
      try {
        email = await findEmailOnWebsite(biz.website);
      } catch {
      }
    }
    if (email) withEmail++;

    try {
      await db.insert(scrapedBusinessesTable).values({
        googleId: biz.googleId,
        city,
        state,
        businessName: biz.name,
        address: biz.address || null,
        phone: biz.phone,
        website: biz.website,
        email,
        category: biz.category,
        subtypes: biz.subtypes,
        logoUrl: biz.logo,
        logoStatus: biz.logo ? "pending" : "pending",
      });
      newCount++;
      job.newCount = newCount;
      job.withEmail = withEmail;
    } catch (err) {
      jobAppend(jobId, `⚠ Insert failed for "${biz.name}": ${String(err).slice(0, 80)}`);
    }
  }

  job.status = "done";
  job.completedAt = new Date();
  jobAppend(jobId, `✅ Done — ${newCount} new, ${skipped} skipped, ${withEmail} with email`);
  logger.info({ jobId, newCount, skipped, withEmail }, "adminScraper: scrape job complete");
}

// ── POST /api/admin/scraper/businesses/:id/logo ───────────────────────────────
router.post("/admin/scraper/businesses/:id/logo", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [biz] = await db
    .select()
    .from(scrapedBusinessesTable)
    .where(eq(scrapedBusinessesTable.id, id))
    .limit(1);
  if (!biz) { res.status(404).json({ error: "Not found" }); return; }

  res.json({ ok: true, message: "Logo extraction started" });

  processLogo(id, biz.website, biz.logoUrl).catch((err) =>
    logger.error({ err, id }, "adminScraper: logo processing error"),
  );
});

async function processLogo(id: number, website: string | null, outscraperLogo: string | null): Promise<void> {
  const logoResult = await extractLogo(website, outscraperLogo);

  if (!logoResult) {
    await db
      .update(scrapedBusinessesTable)
      .set({ logoStatus: "no-logo-found", logoVisionNotes: "No logo source found", updatedAt: new Date() })
      .where(eq(scrapedBusinessesTable.id, id));
    return;
  }

  const filterResult = await filterLogo(logoResult.url);

  if (filterResult.pass) {
    await db
      .update(scrapedBusinessesTable)
      .set({
        logoUrl: logoResult.url,
        logoMethod: logoResult.method,
        logoStatus: "usable",
        logoVisionNotes: filterResult.notes,
        updatedAt: new Date(),
      })
      .where(eq(scrapedBusinessesTable.id, id));
  } else {
    await db
      .update(scrapedBusinessesTable)
      .set({
        logoUrl: logoResult.url,
        logoMethod: logoResult.method,
        logoStatus: "unusable",
        logoVisionNotes: filterResult.notes,
        updatedAt: new Date(),
      })
      .where(eq(scrapedBusinessesTable.id, id));
  }
}

// ── POST /api/admin/scraper/businesses/:id/ad ─────────────────────────────────
router.post("/admin/scraper/businesses/:id/ad", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  if (!process.env.XAI_API_KEY) {
    res.status(503).json({ error: "XAI_API_KEY is not configured" });
    return;
  }

  const [biz] = await db
    .select()
    .from(scrapedBusinessesTable)
    .where(eq(scrapedBusinessesTable.id, id))
    .limit(1);
  if (!biz) { res.status(404).json({ error: "Not found" }); return; }

  await db
    .update(scrapedBusinessesTable)
    .set({ adStatus: "pending", updatedAt: new Date() })
    .where(eq(scrapedBusinessesTable.id, id));

  res.json({ ok: true, message: "Ad generation started" });

  const params: OutreachAdParams = {
    bizName: biz.businessName,
    category: biz.category,
    phone: biz.phone,
    address: biz.address,
    city: biz.city,
    state: biz.state,
    website: biz.website,
    services: biz.subtypes as string[] | undefined,
  };

  generateAdForOutreach(params)
    .then(async (result) => {
      await db
        .update(scrapedBusinessesTable)
        .set({ adImageUrl: result.imageUrl, adTemplate: result.template, adStatus: "generated", updatedAt: new Date() })
        .where(eq(scrapedBusinessesTable.id, id));
    })
    .catch(async (err) => {
      logger.error({ err, id }, "adminScraper: ad generation failed");
      await db
        .update(scrapedBusinessesTable)
        .set({ adStatus: "failed", updatedAt: new Date() })
        .where(eq(scrapedBusinessesTable.id, id));
    });
});

// ── POST /api/admin/scraper/businesses/:id/email-draft ────────────────────────
router.post("/admin/scraper/businesses/:id/email-draft", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [biz] = await db
    .select()
    .from(scrapedBusinessesTable)
    .where(eq(scrapedBusinessesTable.id, id))
    .limit(1);
  if (!biz) { res.status(404).json({ error: "Not found" }); return; }

  const { subject, bodyHtml } = buildEmailDraft({
    id: biz.id,
    businessName: biz.businessName,
    city: biz.city,
    state: biz.state,
    category: biz.category,
    phone: biz.phone,
    website: biz.website,
    adImageUrl: biz.adImageUrl,
  });

  const [updated] = await db
    .update(scrapedBusinessesTable)
    .set({ emailSubject: subject, emailBodyHtml: bodyHtml, emailStatus: "drafted", updatedAt: new Date() })
    .where(eq(scrapedBusinessesTable.id, id))
    .returning();

  res.json({ ok: true, subject, preview: bodyHtml.slice(0, 200) + "...", business: updated });
});

// ── POST /api/admin/scraper/businesses/:id/send-email ─────────────────────────
router.post("/admin/scraper/businesses/:id/send-email", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "RESEND_API_KEY not configured" }); return; }

  const [biz] = await db
    .select()
    .from(scrapedBusinessesTable)
    .where(eq(scrapedBusinessesTable.id, id))
    .limit(1);
  if (!biz) { res.status(404).json({ error: "Not found" }); return; }
  if (!biz.email) { res.status(400).json({ error: "No email address for this business" }); return; }
  if (!biz.emailBodyHtml || !biz.emailSubject) {
    res.status(400).json({ error: "No email draft — generate a draft first" });
    return;
  }
  if (biz.emailStatus === "sent") {
    res.status(409).json({ error: "Email already sent" });
    return;
  }
  if (biz.emailStatus === "opted-out") {
    res.status(409).json({ error: "Business has opted out" });
    return;
  }

  let Resend: new (key: string) => any;
  try {
    ({ Resend } = await import("resend") as any);
  } catch {
    res.status(500).json({ error: "Resend module not available" });
    return;
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: biz.email,
    subject: biz.emailSubject,
    html: biz.emailBodyHtml,
  });

  if (result.error) {
    req.log.error({ err: result.error, id }, "adminScraper: send email failed");
    res.status(500).json({ error: String(result.error?.message ?? result.error) });
    return;
  }

  await db
    .update(scrapedBusinessesTable)
    .set({ emailStatus: "sent", updatedAt: new Date() })
    .where(eq(scrapedBusinessesTable.id, id));

  req.log.info({ id, email: biz.email }, "adminScraper: outreach email sent");
  res.json({ ok: true, emailId: result.data?.id });
});

// ── POST /api/admin/scraper/batch/logos ──────────────────────────────────────
router.post("/admin/scraper/batch/logos", requireAdmin, async (req, res): Promise<void> => {
  const { city, state, limit = 20 } = req.body as { city?: string; state?: string; limit?: number };

  const conditions: ReturnType<typeof eq>[] = [
    eq(scrapedBusinessesTable.logoStatus, "pending"),
  ];
  if (city) conditions.push(eq(scrapedBusinessesTable.city, city) as any);
  if (state) conditions.push(eq(scrapedBusinessesTable.state, state.toUpperCase()) as any);

  const pending = await db
    .select()
    .from(scrapedBusinessesTable)
    .where(and(...conditions))
    .limit(Number(limit) || 20);

  if (pending.length === 0) {
    res.json({ ok: true, message: "No pending logos to process", count: 0 });
    return;
  }

  const jobId = newJob("logo", `Batch logos: ${pending.length} businesses`);
  const job = jobs.get(jobId)!;
  job.total = pending.length;
  res.json({ ok: true, jobId, count: pending.length });

  runBatchLogos(jobId, pending).catch((err) => {
    const j = jobs.get(jobId);
    if (j) { j.status = "failed"; j.error = String(err); j.completedAt = new Date(); }
    logger.error({ err, jobId }, "adminScraper: batch logos job failed");
  });
});

async function runBatchLogos(jobId: string, businesses: typeof scrapedBusinessesTable.$inferSelect[]): Promise<void> {
  const job = jobs.get(jobId)!;
  for (const biz of businesses) {
    await processLogo(biz.id, biz.website, biz.logoUrl);
    job.processed++;
    job.newCount++;
    jobAppend(jobId, `Processed logo for "${biz.businessName}"`);
  }
  job.status = "done";
  job.completedAt = new Date();
  jobAppend(jobId, `✅ Batch logos done — ${businesses.length} processed`);
}

// ── POST /api/admin/scraper/batch/ads ────────────────────────────────────────
router.post("/admin/scraper/batch/ads", requireAdmin, async (req, res): Promise<void> => {
  if (!process.env.XAI_API_KEY) {
    res.status(503).json({ error: "XAI_API_KEY not configured" });
    return;
  }

  const { city, state, limit = 10 } = req.body as { city?: string; state?: string; limit?: number };

  const conditions: any[] = [eq(scrapedBusinessesTable.adStatus, "pending")];
  if (city) conditions.push(ilike(scrapedBusinessesTable.city, city));
  if (state) conditions.push(eq(scrapedBusinessesTable.state, state.toUpperCase()));

  const pending = await db
    .select()
    .from(scrapedBusinessesTable)
    .where(and(...conditions))
    .limit(Math.min(Number(limit) || 10, 20));

  if (pending.length === 0) {
    res.json({ ok: true, message: "No pending ads to generate", count: 0 });
    return;
  }

  const jobId = newJob("ad", `Batch ads: ${pending.length} businesses`);
  const job = jobs.get(jobId)!;
  job.total = pending.length;
  res.json({ ok: true, jobId, count: pending.length });

  runBatchAds(jobId, pending).catch((err) => {
    const j = jobs.get(jobId);
    if (j) { j.status = "failed"; j.error = String(err); j.completedAt = new Date(); }
    logger.error({ err, jobId }, "adminScraper: batch ads job failed");
  });
});

async function runBatchAds(jobId: string, businesses: typeof scrapedBusinessesTable.$inferSelect[]): Promise<void> {
  const job = jobs.get(jobId)!;
  for (const biz of businesses) {
    try {
      const params: OutreachAdParams = {
        bizName: biz.businessName,
        category: biz.category,
        phone: biz.phone,
        address: biz.address,
        city: biz.city,
        state: biz.state,
        website: biz.website,
        services: biz.subtypes as string[] | undefined,
      };
      const result = await generateAdForOutreach(params);
      await db
        .update(scrapedBusinessesTable)
        .set({ adImageUrl: result.imageUrl, adTemplate: result.template, adStatus: "generated", updatedAt: new Date() })
        .where(eq(scrapedBusinessesTable.id, biz.id));
      job.newCount++;
      jobAppend(jobId, `✅ Generated ad for "${biz.businessName}"`);
    } catch (err) {
      await db
        .update(scrapedBusinessesTable)
        .set({ adStatus: "failed", updatedAt: new Date() })
        .where(eq(scrapedBusinessesTable.id, biz.id));
      jobAppend(jobId, `❌ Ad failed for "${biz.businessName}": ${String(err).slice(0, 80)}`);
    }
    job.processed++;
  }
  job.status = "done";
  job.completedAt = new Date();
  jobAppend(jobId, `✅ Batch ads done — ${job.newCount} generated`);
}

// ── POST /api/admin/scraper/batch/email-drafts ───────────────────────────────
router.post("/admin/scraper/batch/email-drafts", requireAdmin, async (req, res): Promise<void> => {
  const { city, state, limit = 50 } = req.body as { city?: string; state?: string; limit?: number };

  const conditions: any[] = [eq(scrapedBusinessesTable.emailStatus, "pending")];
  if (city) conditions.push(ilike(scrapedBusinessesTable.city, city));
  if (state) conditions.push(eq(scrapedBusinessesTable.state, state.toUpperCase()));

  const pending = await db
    .select()
    .from(scrapedBusinessesTable)
    .where(and(...conditions))
    .limit(Math.min(Number(limit) || 50, 200));

  if (pending.length === 0) {
    res.json({ ok: true, message: "No pending email drafts", count: 0 });
    return;
  }

  const jobId = newJob("email", `Batch email drafts: ${pending.length} businesses`);
  const job = jobs.get(jobId)!;
  job.total = pending.length;
  job.status = "done";
  job.completedAt = new Date();

  let draftCount = 0;
  for (const biz of pending) {
    const { subject, bodyHtml } = buildEmailDraft({
      id: biz.id,
      businessName: biz.businessName,
      city: biz.city,
      state: biz.state,
      category: biz.category,
      phone: biz.phone,
      website: biz.website,
      adImageUrl: biz.adImageUrl,
    });
    await db
      .update(scrapedBusinessesTable)
      .set({ emailSubject: subject, emailBodyHtml: bodyHtml, emailStatus: "drafted", updatedAt: new Date() })
      .where(eq(scrapedBusinessesTable.id, biz.id));
    draftCount++;
    job.processed++;
    job.newCount = draftCount;
  }

  jobAppend(jobId, `✅ Drafted ${draftCount} emails`);
  res.json({ ok: true, jobId, count: draftCount });
});

// ── GET /api/admin/scraper/stats ──────────────────────────────────────────────
router.get("/admin/scraper/stats", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      emailStatus: scrapedBusinessesTable.emailStatus,
      logoStatus: scrapedBusinessesTable.logoStatus,
      adStatus: scrapedBusinessesTable.adStatus,
      count: sql<number>`count(*)::int`,
    })
    .from(scrapedBusinessesTable)
    .groupBy(
      scrapedBusinessesTable.emailStatus,
      scrapedBusinessesTable.logoStatus,
      scrapedBusinessesTable.adStatus,
    );

  const total = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scrapedBusinessesTable);

  res.json({ stats: rows, total: total[0]?.count ?? 0 });
});

// ── Public: GET /api/outreach/unsubscribe ─────────────────────────────────────
router.get("/outreach/unsubscribe", async (req, res): Promise<void> => {
  const { id, token } = req.query as Record<string, string>;
  const numId = Number(id);

  if (!numId || !token) {
    res.status(400).send("Invalid unsubscribe link.");
    return;
  }

  const expected = unsubToken(numId);
  if (token !== expected) {
    res.status(400).send("Invalid or expired unsubscribe token.");
    return;
  }

  await db
    .update(scrapedBusinessesTable)
    .set({ emailStatus: "opted-out", updatedAt: new Date() })
    .where(and(
      eq(scrapedBusinessesTable.id, numId),
      eq(scrapedBusinessesTable.emailStatus, "sent"),
    ));

  res.send(`<!DOCTYPE html><html><head><title>Unsubscribed</title></head><body style="font-family:sans-serif;text-align:center;padding:60px;">
<h2>You've been unsubscribed.</h2>
<p>You will no longer receive outreach emails from My Town Postcard.</p>
</body></html>`);
});

export default router;
