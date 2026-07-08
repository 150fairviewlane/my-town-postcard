import { Router, type IRouter } from "express";
import { eq, desc, and, ilike, or, sql, gte, isNull, isNotNull, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { db, scrapedBusinessesTable, outreachEmailClicksTable, businessClaimEventsTable } from "@workspace/db";
import { getCachedAd, setCachedAd, checkAndIncrementIpLimit, checkAndIncrementGlobalCap } from "../lib/claimRegenCache.js";
import { searchBusinesses } from "../lib/outscraper.js";
import { extractLogo } from "../lib/logoExtractor.js";
import { filterLogo } from "../lib/logoFilter.js";
import { generateAdForOutreach, type OutreachAdParams } from "../lib/generateAdForOutreach.js";
import { findEmailOnWebsite } from "../lib/emailScraper.js";
import { warmBrowser, closeBrowser } from "../lib/browserScraper.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();
const JWT_SECRET = process.env.SESSION_SECRET || "localspot-secret";
const UNSUB_SECRET = process.env.SESSION_SECRET || "localspot-secret";
const APP_URL = (process.env.APP_URL || "https://mytownpostcard.com").replace(/\/$/, "");
const FROM_EMAIL = process.env.FROM_EMAIL || "info@mytownpostcard.com";
const CACHE_DAYS = 90;
const COST_PER_1K = 2.85;

// ── Admin auth guard — verifies JWT AND checks admin:true claim ───────────────
function requireAdmin(req: any, res: any, next: any): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as Record<string, unknown>;
    if (!payload.admin) {
      res.status(401).json({ error: "Admin access required" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function unsubToken(googleId: string): string {
  return crypto
    .createHmac("sha256", UNSUB_SECRET)
    .update(googleId)
    .digest("hex")
    .slice(0, 24);
}

function cacheThreshold(): Date {
  return new Date(Date.now() - CACHE_DAYS * 24 * 60 * 60 * 1000);
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
  /** true when Google returned fewer results than requested — natural ceiling reached */
  ceiling: boolean;
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
    ceiling: false,
  });
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

// ── Email draft builder ────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailDraft(business: {
  id: number;
  googleId: string;
  businessName: string;
  city: string;
  state: string;
  category: string | null;
  phone: string | null;
  website: string | null;
  adImageUrl: string | null;
}): { subject: string; bodyHtml: string } {
  const { googleId, businessName, city, state, category, adImageUrl } = business;
  // Escape all external/scraped fields before HTML interpolation
  const bizName = escapeHtml(businessName);
  const cityE = escapeHtml(city);
  const stateE = escapeHtml(state);
  const categoryE = category ? escapeHtml(category) : null;

  const token = unsubToken(googleId);
  const unsubUrl = `${APP_URL}/api/outreach/unsubscribe?id=${encodeURIComponent(googleId)}&token=${encodeURIComponent(token)}`;
  // Primary "I Love My Ad" CTA — goes directly to the territory picker with
  // the business ID pre-loaded so the claim section auto-expands.
  const claimUrl = `${APP_URL}/?claim=${business.id}`;
  const trackUrl = `${APP_URL}/api/outreach/click/${business.id}`;
  // NOTE: this previously read `business.phone` — the SCRAPED recipient's own
  // phone number — telling them to "call us" at their own business line. We
  // don't currently advertise a My Town Postcard phone number, so direct
  // inquiries to our site + inbox instead. See root-cause report to user.
  const contactSite = APP_URL.replace(/^https?:\/\//, "");
  const contactNote = ` or visit ${contactSite}`;
  const industryLine = categoryE
    ? `As a ${categoryE.toLowerCase()} business in the ${cityE} area`
    : `As a local business serving the ${cityE} area`;

  // Always embed the ad image — the send handler converts data: URIs to CID attachments
  // adImageUrl is a data: URI or HTTPS URL generated by our own ad pipeline, not from scraped input
  const adSection = adImageUrl
    ? `<div style="text-align:center;margin:24px 0;">
        <img src="${adImageUrl}" alt="Sample ad concept for ${bizName}" width="560"
          style="border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.15);max-width:100%;display:block;margin:0 auto;" />
        <div style="color:#6b7280;font-size:12px;margin-top:6px;">Sample postcard ad concept we created for ${bizName}</div>
      </div>`
    : `<div style="background:#f3f4f6;background-color:#f3f4f6;border-radius:8px;padding:16px;text-align:center;margin:24px 0;color:#6b7280;font-size:13px;">
        &#x2736; Sample ad design available upon request
      </div>`;

  const bodyHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<style>
  :root { color-scheme: light only; supported-color-schemes: light only; }
  @media (prefers-color-scheme: dark) {
    body, .ltp-bg { background:#f9fafb !important; }
    .ltp-card { background:#fff !important; }
    .ltp-text-dark { color:#111 !important; }
    .ltp-text-body { color:#374151 !important; }
    .ltp-text-muted { color:#6b7280 !important; }
    .ltp-text-faint { color:#9ca3af !important; }
    .ltp-brand { color:#7B1418 !important; }
  }
</style>
</head>
<body class="ltp-bg" style="margin:0;padding:0;background:#f9fafb;background-color:#f9fafb;font-family:system-ui,sans-serif;">
<div style="max-width:580px;margin:0 auto;padding:32px 16px;">
  <div class="ltp-card" style="background:#fff;background-color:#fff;border-radius:12px;padding:36px 32px;box-shadow:0 2px 8px rgba(0,0,0,0.07);">

    <div class="ltp-brand" style="font-family:Georgia,serif;font-size:22px;font-weight:900;color:#7B1418;margin-bottom:4px;">
      &#x1F4EE; My Town Postcard
    </div>
    <div class="ltp-text-faint" style="font-size:13px;color:#9ca3af;margin-bottom:28px;">Reaching 5,000 ${cityE}, ${stateE} homes</div>

    <p class="ltp-text-dark" style="font-size:16px;color:#111;line-height:1.6;margin-bottom:16px;">
      Hi <strong>${bizName}</strong> team,
    </p>

    <p class="ltp-text-body" style="font-size:15px;color:#374151;line-height:1.7;margin-bottom:16px;">
      ${industryLine}, we wanted to reach out about an opportunity to get your name
      in front of <strong>5,000 local households</strong> — all in ${cityE} and the surrounding area.
    </p>

    <p class="ltp-text-body" style="font-size:15px;color:#374151;line-height:1.7;margin-bottom:16px;">
      We're putting together a <strong>co-op postcard mailer</strong> sent directly to 5,000 homes
      via USPS Every Door Direct Mail® (EDDM). You only pay for one advertising spot —
      no list purchase, no per-address fees — just a single flat price for your ad on a
      beautifully printed 9"×12" postcard.
    </p>

    ${adSection}

    <div style="background:#fef2f2;background-color:#fef2f2;border-left:4px solid #7B1418;padding:16px 20px;border-radius:0 8px 8px 0;margin:24px 0;">
      <div class="ltp-brand" style="font-weight:700;color:#7B1418;margin-bottom:8px;">What's included:</div>
      <ul class="ltp-text-body" style="margin:0;padding-left:20px;color:#374151;line-height:1.8;font-size:14px;">
        <li>Full-color printed ad on a premium 9"×12" postcard</li>
        <li>Delivered to 5,000 homes — no duplicates, no waste</li>
        <li>FREE professional ad design included</li>
        <li>QR code tracking to measure response</li>
      </ul>
    </div>

    <p class="ltp-text-body" style="font-size:15px;color:#374151;line-height:1.7;margin-bottom:24px;">
      Spots are limited and sold on a first-come basis.
    </p>

    <div style="text-align:center;margin:32px 0 12px;">
      <a href="${claimUrl}" style="display:inline-block;padding:16px 36px;background:#7B1418;background-color:#7B1418;color:#fff;
        font-weight:800;font-size:16px;border-radius:8px;text-decoration:none;letter-spacing:0.2px;">
        &#x2713; I Love My Ad &#x2014; Sign Me Up!
      </a>
    </div>
    <div style="text-align:center;margin:0 0 28px;">
      <a href="${trackUrl}" style="display:inline-block;padding:10px 24px;color:#6b7280;
        font-weight:600;font-size:14px;text-decoration:underline;">
        Browse available spots and pricing →
      </a>
    </div>

    <p class="ltp-text-muted" style="font-size:14px;color:#6b7280;line-height:1.6;margin-top:24px;">
      Questions? Reply to this email${contactNote}.
    </p>

    <div style="margin-top:32px;padding-top:18px;border-top:2px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;">
      <div class="ltp-text-faint" style="margin-bottom:4px;color:#9ca3af;">
        My Town Postcard · P.O. Box 123 · Clarkesville, GA 30523
      </div>
      <div>
        <a href="${APP_URL}" style="color:#9ca3af;">Visit our site</a>
        &nbsp;·&nbsp;
        <a href="${unsubUrl}" style="color:#9ca3af;">Unsubscribe</a>
      </div>
    </div>

  </div>
</div>
</body></html>`;

  const subject = `${city} postcard — we created a sample ad for ${businessName}`;
  return { subject, bodyHtml };
}

// ── Cascade pipeline helpers ──────────────────────────────────────────────────

async function processLogoAndContinue(
  id: number,
  website: string | null,
  outscraperLogo: string | null,
): Promise<void> {
  const logoResult = await extractLogo(website, outscraperLogo);

  if (!logoResult) {
    await db
      .update(scrapedBusinessesTable)
      .set({ logoStatus: "no-logo-found", logoVisionNotes: "No logo source found", updatedAt: new Date() })
      .where(eq(scrapedBusinessesTable.id, id));
  } else {
    const filterResult = await filterLogo(logoResult.url);
    const logoStatus = filterResult.pass ? "usable" : (filterResult.needsReview ? "needs-review" : "unusable");
    await db
      .update(scrapedBusinessesTable)
      .set({
        logoUrl: logoResult.url,
        logoMethod: logoResult.method,
        logoStatus,
        logoVisionNotes: filterResult.notes,
        updatedAt: new Date(),
      })
      .where(eq(scrapedBusinessesTable.id, id));
  }

  // Only generate an ad if the business has an email address on file.
  // Ads exist solely to attach to outreach emails; generating one for a
  // business we can't email is wasted GPU time and storage.
  const [biz] = await db
    .select()
    .from(scrapedBusinessesTable)
    .where(eq(scrapedBusinessesTable.id, id))
    .limit(1);
  if (biz) {
    if (!biz.email) {
      logger.info({ id, name: biz.businessName }, "adminScraper: skipping ad gen — no email on file");
      return;
    }
    const usableLogo = biz.logoStatus === "usable" ? biz.logoUrl : null;
    generateAdAndContinue(id, {
      bizName: biz.businessName,
      category: biz.category,
      phone: biz.phone,
      address: biz.address,
      city: biz.city,
      state: biz.state,
      website: biz.website,
      services: (biz.subtypes as string[]) ?? [],
    }, usableLogo).catch((err) => logger.error({ err, id }, "adminScraper: ad cascade failed"));
  }
}

async function generateAdAndContinue(
  id: number,
  params: OutreachAdParams,
  logoUrl?: string | null,
): Promise<void> {
  if (!process.env.XAI_API_KEY) {
    logger.warn({ id }, "adminScraper: XAI_API_KEY not set, skipping ad generation");
    // Still draft an email without ad
    draftEmailForBusiness(id).catch((err) =>
      logger.error({ err, id }, "adminScraper: email draft (no-xai) cascade failed"),
    );
    return;
  }

  try {
    const result = await generateAdForOutreach({ ...params, logoUrl });
    await db
      .update(scrapedBusinessesTable)
      .set({ adImageUrl: result.imageUrl, adTemplate: result.template, adStatus: "generated", adError: null, updatedAt: new Date() })
      .where(eq(scrapedBusinessesTable.id, id));
    // Auto-cascade: ad generated → draft email
    draftEmailForBusiness(id).catch((err) =>
      logger.error({ err, id }, "adminScraper: email draft cascade failed"),
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, id }, "adminScraper: ad generation failed");
    await db
      .update(scrapedBusinessesTable)
      .set({ adStatus: "failed", adError: errMsg.slice(0, 500), updatedAt: new Date() })
      .where(eq(scrapedBusinessesTable.id, id));
    // Still draft an email without the ad
    draftEmailForBusiness(id).catch((innerErr) =>
      logger.error({ innerErr, id }, "adminScraper: email draft (ad-failed) cascade failed"),
    );
  }
}

async function draftEmailForBusiness(id: number): Promise<void> {
  const [biz] = await db
    .select()
    .from(scrapedBusinessesTable)
    .where(eq(scrapedBusinessesTable.id, id))
    .limit(1);
  // Allow cascade to (re)draft when status is "pending" (never drafted) or
  // "drafted" (drafted previously but without a completed ad — e.g., the ad
  // generation failed on the first attempt and the fallback drafted a no-ad
  // email; now that the ad is ready, refresh the draft to include it).
  // Skip "queued", "sent", and "opted-out" — those are terminal / in-flight.
  if (!biz || !biz.email) return;
  if (biz.emailStatus !== "pending" && biz.emailStatus !== "drafted") return;

  const { subject, bodyHtml } = buildEmailDraft({
    id: biz.id,
    googleId: biz.googleId,
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
    .where(eq(scrapedBusinessesTable.id, id));
}

// ── GET /api/outreach/click/:businessId  (PUBLIC — no auth) ───────────────────
// Records the email-button click, then redirects to the spot picker.
// Deliberately fire-and-forget on the DB write so a slow insert never delays
// the redirect the business owner sees.
router.get("/outreach/click/:businessId", async (req, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  if (businessId) {
    const ip = (
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      req.ip ??
      null
    );
    const ua = (req.headers["user-agent"] as string | undefined) ?? null;
    db.insert(outreachEmailClicksTable)
      .values({ businessId, ipAddress: ip, userAgent: ua })
      .catch((err) => logger.error({ err, businessId }, "outreach: click insert failed"));
  }
  res.redirect(302, `${APP_URL}/`);
});

// ── GET /api/admin/outreach/preview ───────────────────────────────────────────
router.get("/admin/outreach/preview", requireAdmin, async (req, res): Promise<void> => {
  const { city, state, category = "", limit = "50" } = req.query as Record<string, string>;
  if (!city?.trim() || !state?.trim()) {
    res.status(400).json({ error: "city and state are required" });
    return;
  }

  const threshold = cacheThreshold();

  // Count existing fresh records for this city + state, optionally filtered by
  // the leading keyword of the category query (e.g. "HVAC" from "HVAC contractor").
  const categoryKeyword = category.trim().split(/\s+/)[0] ?? "";
  const conditions = [
    ilike(scrapedBusinessesTable.city, city.trim()),
    eq(scrapedBusinessesTable.state, state.trim().toUpperCase()),
    gte(scrapedBusinessesTable.scrapedAt, threshold),
  ] as const;
  const categoryCondition = categoryKeyword
    ? ilike(scrapedBusinessesTable.category, `%${categoryKeyword}%`)
    : undefined;

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scrapedBusinessesTable)
    .where(categoryCondition ? and(...conditions, categoryCondition) : and(...conditions));

  const cached = row?.count ?? 0;
  const desiredNew = Math.max(1, Number(limit) || 50);
  // With auto-increment: Outscraper is asked for (cached + desiredNew) so the
  // dedup logic surfaces desiredNew net-new results from the tail of the ranked list.
  const outscraperLimit = Math.min(cached + desiredNew, 200);
  const estimatedCostUsd = ((outscraperLimit / 1000) * COST_PER_1K).toFixed(3);

  res.json({ cached, desiredNew, outscraperLimit, estimatedCostUsd, cacheWindowDays: CACHE_DAYS });
});

// ── GET /api/admin/outreach/businesses ────────────────────────────────────────
router.get("/admin/outreach/businesses", requireAdmin, async (req, res): Promise<void> => {
  const {
    city, state, email_status, logo_status, ad_status, q,
    limit = "50", offset = "0",
  } = req.query as Record<string, string>;

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
    db.select().from(scrapedBusinessesTable).where(where)
      .orderBy(desc(scrapedBusinessesTable.scrapedAt)).limit(lim).offset(off),
    db.select({ count: sql<number>`count(*)::int` })
      .from(scrapedBusinessesTable).where(where),
  ]);

  // Attach per-business click counts in a single aggregate query.
  const ids = rows.map((r) => r.id);
  const clickAggs = ids.length > 0
    ? await db.select({
        businessId:   outreachEmailClicksTable.businessId,
        clickCount:    sql<number>`count(*)::int`,
        lastClickedAt: sql<string | null>`max(${outreachEmailClicksTable.clickedAt})`,
      })
        .from(outreachEmailClicksTable)
        .where(inArray(outreachEmailClicksTable.businessId, ids))
        .groupBy(outreachEmailClicksTable.businessId)
    : [];
  const clickMap = new Map(clickAggs.map((r) => [r.businessId, r]));
  const businesses = rows.map((r) => ({
    ...r,
    clickCount:    clickMap.get(r.id)?.clickCount    ?? 0,
    lastClickedAt: clickMap.get(r.id)?.lastClickedAt ?? null,
  }));

  res.json({ businesses, total: countRow[0]?.count ?? 0, limit: lim, offset: off });
});

// ── GET /api/admin/outreach/no-website ────────────────────────────────────────
// Returns all scraped businesses where website IS NULL.
// ?city=  ?state=  filter by location.
// ?format=csv  returns a downloadable CSV instead of JSON.
router.get("/admin/outreach/no-website", requireAdmin, async (req, res): Promise<void> => {
  const { city, state, format } = req.query as { city?: string; state?: string; format?: string };

  const conditions = [isNull(scrapedBusinessesTable.website)];
  if (city) conditions.push(ilike(scrapedBusinessesTable.city, `%${city}%`));
  if (state) conditions.push(eq(scrapedBusinessesTable.state, state.toUpperCase()));

  const rows = await db.select({
    id:           scrapedBusinessesTable.id,
    businessName: scrapedBusinessesTable.businessName,
    address:      scrapedBusinessesTable.address,
    phone:        scrapedBusinessesTable.phone,
    category:     scrapedBusinessesTable.category,
    subtypes:     scrapedBusinessesTable.subtypes,
    city:         scrapedBusinessesTable.city,
    state:        scrapedBusinessesTable.state,
    scrapedAt:    scrapedBusinessesTable.scrapedAt,
  }).from(scrapedBusinessesTable)
    .where(and(...conditions))
    .orderBy(desc(scrapedBusinessesTable.scrapedAt));

  if (format === "csv") {
    const esc = (v: string | null | undefined): string =>
      v == null ? "" : `"${String(v).replace(/"/g, '""')}"`;
    const header = "Business Name,Address,Phone,Category,City,State,Scraped Date";
    const lines = rows.map((r) => [
      esc(r.businessName),
      esc(r.address),
      esc(r.phone),
      esc(r.category),
      esc(r.city),
      esc(r.state),
      esc(r.scrapedAt ? new Date(r.scrapedAt).toLocaleDateString("en-US") : null),
    ].join(","));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="no-website-businesses.csv"`);
    res.send([header, ...lines].join("\r\n"));
    return;
  }

  res.json({ businesses: rows, total: rows.length });
});

// ── GET /api/admin/outreach/businesses/:id ────────────────────────────────────
router.get("/admin/outreach/businesses/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [[row], [clickAgg]] = await Promise.all([
    db.select().from(scrapedBusinessesTable).where(eq(scrapedBusinessesTable.id, id)).limit(1),
    db.select({
      clickCount:    sql<number>`count(*)::int`,
      lastClickedAt: sql<string | null>`max(${outreachEmailClicksTable.clickedAt})`,
    }).from(outreachEmailClicksTable).where(eq(outreachEmailClicksTable.businessId, id)),
  ]);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, clickCount: clickAgg?.clickCount ?? 0, lastClickedAt: clickAgg?.lastClickedAt ?? null });
});

// ── PATCH /api/admin/outreach/businesses/:id ──────────────────────────────────
router.patch("/admin/outreach/businesses/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const mapped: Partial<typeof scrapedBusinessesTable.$inferInsert> = { updatedAt: new Date() };
  if ("emailStatus" in req.body) mapped.emailStatus = req.body.emailStatus;
  if ("email" in req.body) mapped.email = req.body.email;
  if ("phone" in req.body) mapped.phone = req.body.phone;
  if ("website" in req.body) mapped.website = req.body.website;
  if ("logoStatus" in req.body) mapped.logoStatus = req.body.logoStatus;
  if ("emailSubject" in req.body) mapped.emailSubject = String(req.body.emailSubject).slice(0, 500);
  if ("emailBodyHtml" in req.body) {
    // Strip script tags and on* event handlers from admin-edited HTML before persisting.
    // This is defence-in-depth; the admin UI is the only writer, but we sanitize anyway.
    mapped.emailBodyHtml = String(req.body.emailBodyHtml)
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");
  }

  const [updated] = await db.update(scrapedBusinessesTable)
    .set(mapped).where(eq(scrapedBusinessesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// ── DELETE /api/admin/outreach/businesses/:id ─────────────────────────────────
router.delete("/admin/outreach/businesses/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(scrapedBusinessesTable).where(eq(scrapedBusinessesTable.id, id));
  res.json({ ok: true });
});

// ── GET /api/admin/outreach/jobs ──────────────────────────────────────────────
router.get("/admin/outreach/jobs", requireAdmin, (_req, res): void => {
  const list = [...jobs.entries()].map(([id, j]) => ({ id, ...j }));
  list.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  res.json(list);
});

// ── GET /api/admin/outreach/job/:jobId ────────────────────────────────────────
router.get("/admin/outreach/job/:jobId", requireAdmin, (req, res): void => {
  const job = jobs.get(req.params.jobId);
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.json({ id: req.params.jobId, ...job });
});

// ── GET /api/admin/outreach/history ──────────────────────────────────────────
router.get("/admin/outreach/history", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      city: scrapedBusinessesTable.city,
      state: scrapedBusinessesTable.state,
      total: sql<number>`count(*)::int`,
      latestScrape: sql<string>`max(scraped_at)`,
      withEmail: sql<number>`count(*) filter (where email is not null)::int`,
      emailsSent: sql<number>`count(*) filter (where email_status = 'sent')::int`,
      emailsDrafted: sql<number>`count(*) filter (where email_status = 'drafted')::int`,
      adsGenerated: sql<number>`count(*) filter (where ad_status = 'generated')::int`,
      usableLogos: sql<number>`count(*) filter (where logo_status = 'usable')::int`,
    })
    .from(scrapedBusinessesTable)
    .groupBy(scrapedBusinessesTable.city, scrapedBusinessesTable.state)
    .orderBy(desc(sql`max(scraped_at)`));
  res.json(rows);
});

// ── POST /api/admin/outreach/scrape ───────────────────────────────────────────
router.post("/admin/outreach/scrape", requireAdmin, async (req, res): Promise<void> => {
  const { category, city, state, limit = 50 } = req.body as {
    category: string; city: string; state: string; limit?: number;
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
  const jobId = newJob("scrape", `${query} (want ${limit} new)`);
  res.json({ jobId, query });

  runScrapeJob(jobId, query, city.trim(), state.trim().toUpperCase(), category.trim(), Number(limit) || 50)
    .catch((err) => {
      const job = jobs.get(jobId);
      if (job) { job.status = "failed"; job.error = String(err); job.completedAt = new Date(); }
      logger.error({ err, jobId }, "adminScraper: scrape job failed");
    });
});

async function runScrapeJob(
  jobId: string, query: string, city: string, state: string, category: string, desiredNew: number,
): Promise<void> {
  const job = jobs.get(jobId)!;

  // Auto-increment: count how many businesses for this city+category are already
  // fresh in the 90-day cache, then ask Outscraper for (existing + desiredNew)
  // so the dedup logic naturally surfaces only the tail (net-new results).
  const categoryKeyword = category.split(/\s+/)[0] ?? category;
  const [existingRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scrapedBusinessesTable)
    .where(and(
      ilike(scrapedBusinessesTable.city, city),
      eq(scrapedBusinessesTable.state, state),
      ilike(scrapedBusinessesTable.category, `%${categoryKeyword}%`),
      gte(scrapedBusinessesTable.scrapedAt, cacheThreshold()),
    ));
  const existingCount = existingRow?.count ?? 0;
  const outscraperLimit = Math.min(existingCount + desiredNew, 200);

  jobAppend(jobId, `Already cached: ${existingCount} → requesting top ${outscraperLimit} from Outscraper`);
  jobAppend(jobId, `Searching: "${query}"`);

  let results;
  try {
    results = await searchBusinesses(query, outscraperLimit);
  } catch (err) {
    job.status = "failed"; job.error = String(err); job.completedAt = new Date();
    jobAppend(jobId, `❌ Outscraper error: ${String(err)}`);
    return;
  }

  job.total = results.length;
  jobAppend(jobId, `Found ${results.length} results from Outscraper`);

  const threshold = cacheThreshold();
  let newCount = 0, skipped = 0, withEmail = 0;

  for (const biz of results) {
    job.processed++;

    const [existing] = await db
      .select({ id: scrapedBusinessesTable.id, scrapedAt: scrapedBusinessesTable.scrapedAt })
      .from(scrapedBusinessesTable)
      .where(eq(scrapedBusinessesTable.googleId, biz.googleId))
      .limit(1);

    // Within 90-day cache window — skip at no cost
    if (existing && existing.scrapedAt >= threshold) {
      skipped++;
      job.skippedDuplicates = skipped;
      continue;
    }

    let email = biz.email;
    if (!email && biz.website) {
      try { email = await findEmailOnWebsite(biz.website); } catch { }
    }
    if (email) withEmail++;

    if (existing) {
      // Exists but older than 90 days — upsert with fresh data
      await db.update(scrapedBusinessesTable).set({
        address: biz.address || null,
        phone: biz.phone,
        website: biz.website,
        email: email ?? undefined,
        category: biz.category,
        subtypes: biz.subtypes,
        logoUrl: biz.logo ?? undefined,
        logoStatus: "pending",
        adStatus: "pending",
        emailStatus: "pending",
        logoVisionNotes: null,
        adImageUrl: null,
        adTemplate: null,
        emailSubject: null,
        emailBodyHtml: null,
        scrapedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(scrapedBusinessesTable.id, existing.id));
      newCount++;
      job.newCount = newCount;
      job.withEmail = withEmail;
      // Cascade pipeline for re-scraped row
      processLogoAndContinue(existing.id, biz.website, biz.logo).catch((err) =>
        logger.error({ err, id: existing.id }, "adminScraper: logo cascade failed"),
      );
    } else {
      // Brand new row
      try {
        const [inserted] = await db.insert(scrapedBusinessesTable).values({
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
          logoUrl: biz.logo ?? null,
          logoStatus: "pending",
        }).returning({ id: scrapedBusinessesTable.id });
        newCount++;
        job.newCount = newCount;
        job.withEmail = withEmail;
        if (inserted) {
          // Cascade pipeline
          processLogoAndContinue(inserted.id, biz.website, biz.logo).catch((err) =>
            logger.error({ err, id: inserted.id }, "adminScraper: logo cascade failed"),
          );
        }
      } catch (err) {
        jobAppend(jobId, `⚠ Insert failed for "${biz.name}": ${String(err).slice(0, 80)}`);
      }
    }
  }

  // Ceiling detection: Google returned fewer results than we requested AND no new
  // businesses were found → the full result set has been exhausted for this
  // category+city combination. Distinguish from the "all fresh in cache" case.
  const hitCeiling =
    results.length > 0 &&
    results.length < outscraperLimit &&
    newCount === 0;

  job.ceiling = hitCeiling;
  job.status = "done";
  job.completedAt = new Date();

  if (hitCeiling) {
    jobAppend(
      jobId,
      `⚠️ Google ceiling reached — returned ${results.length} results (requested ${outscraperLimit}), all already cached. No new businesses remain for this category in this city.`,
    );
    logger.info({ jobId, results: results.length, outscraperLimit }, "adminScraper: ceiling reached");
  } else {
    jobAppend(jobId, `✅ Done — ${newCount} new/updated, ${skipped} cached, ${withEmail} with email`);
    logger.info({ jobId, newCount, skipped, withEmail }, "adminScraper: scrape job complete");
  }
}

// ── POST /api/admin/outreach/businesses/:id/logo ──────────────────────────────
router.post("/admin/outreach/businesses/:id/logo", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [biz] = await db.select().from(scrapedBusinessesTable)
    .where(eq(scrapedBusinessesTable.id, id)).limit(1);
  if (!biz) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true, message: "Logo extraction started" });
  processLogoAndContinue(id, biz.website, biz.logoUrl).catch((err) =>
    logger.error({ err, id }, "adminScraper: logo processing error"),
  );
});

// ── POST /api/admin/outreach/businesses/:id/ad ────────────────────────────────
router.post("/admin/outreach/businesses/:id/ad", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!process.env.XAI_API_KEY) {
    res.status(503).json({ error: "XAI_API_KEY is not configured" }); return;
  }
  const [biz] = await db.select().from(scrapedBusinessesTable)
    .where(eq(scrapedBusinessesTable.id, id)).limit(1);
  if (!biz) { res.status(404).json({ error: "Not found" }); return; }
  if (!biz.email) {
    res.status(400).json({ error: "Cannot generate ad: no email address on file for this business" }); return;
  }
  await db.update(scrapedBusinessesTable)
    .set({ adStatus: "pending", adError: null, updatedAt: new Date() }).where(eq(scrapedBusinessesTable.id, id));
  res.json({ ok: true, message: "Ad generation started" });
  generateAdAndContinue(id, {
    bizName: biz.businessName, category: biz.category, phone: biz.phone,
    address: biz.address, city: biz.city, state: biz.state, website: biz.website,
    services: (biz.subtypes as string[]) ?? [],
  }).catch((err) => logger.error({ err, id }, "adminScraper: ad generation error"));
});

// ── POST /api/admin/outreach/businesses/:id/email-draft ───────────────────────
router.post("/admin/outreach/businesses/:id/email-draft", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [biz] = await db.select().from(scrapedBusinessesTable)
    .where(eq(scrapedBusinessesTable.id, id)).limit(1);
  if (!biz) { res.status(404).json({ error: "Not found" }); return; }

  const { subject, bodyHtml } = buildEmailDraft({
    id: biz.id, googleId: biz.googleId, businessName: biz.businessName, city: biz.city, state: biz.state,
    category: biz.category, phone: biz.phone, website: biz.website, adImageUrl: biz.adImageUrl,
  });
  const [updated] = await db.update(scrapedBusinessesTable)
    .set({ emailSubject: subject, emailBodyHtml: bodyHtml, emailStatus: "drafted", updatedAt: new Date() })
    .where(eq(scrapedBusinessesTable.id, id)).returning();
  res.json({ ok: true, subject, business: updated });
});

// ── POST /api/admin/outreach/businesses/:id/send ──────────────────────────────
router.post("/admin/outreach/businesses/:id/send", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "RESEND_API_KEY not configured" }); return; }

  const [biz] = await db.select().from(scrapedBusinessesTable)
    .where(eq(scrapedBusinessesTable.id, id)).limit(1);
  if (!biz) { res.status(404).json({ error: "Not found" }); return; }
  if (!biz.email) { res.status(400).json({ error: "No email address for this business" }); return; }
  if (biz.emailStatus !== "drafted") {
    res.status(400).json({ error: `Email must be in 'drafted' status before sending (current: ${biz.emailStatus})` });
    return;
  }
  if (!biz.emailBodyHtml || !biz.emailSubject) {
    res.status(400).json({ error: "No email draft content — generate a draft first" }); return;
  }

  let Resend: new (key: string) => any;
  try { ({ Resend } = await import("resend") as any); }
  catch { res.status(500).json({ error: "Resend module not available" }); return; }

  const resend = new Resend(apiKey);

  // Handle inline ad image: convert data: URI → inline attachment (CID).
  // Real email clients (Gmail, Outlook, Apple Mail) don't render base64 data:
  // URIs at all — they show a broken-image placeholder — even though it
  // renders fine in the admin preview (a plain browser tab). The generated
  // ad mockups are stored as JPEG data URIs (see generateAdForOutreach.ts),
  // so the mime type in this regex must match what's actually produced —
  // this previously only matched image/png and silently never fired for the
  // JPEG images we actually generate, leaving the raw base64 in the HTML.
  let htmlToSend = biz.emailBodyHtml;
  const attachments: Array<{ filename: string; content: string; content_id: string }> = [];
  const dataUriMatch = /src="(data:image\/(png|jpe?g|webp);base64,([^"]+))"/i.exec(htmlToSend);
  if (dataUriMatch) {
    const [fullMatch, _dataUri, ext, b64] = dataUriMatch;
    const safeExt = ext!.toLowerCase() === "jpg" ? "jpeg" : ext!.toLowerCase();
    attachments.push({ filename: `ad-mockup.${safeExt}`, content: b64!, content_id: "ad-mockup" });
    htmlToSend = htmlToSend.replace(fullMatch!, 'src="cid:ad-mockup"');
  }

  const sendPayload: Record<string, unknown> = {
    from: FROM_EMAIL, to: biz.email,
    subject: biz.emailSubject, html: htmlToSend,
  };
  if (attachments.length > 0) sendPayload.attachments = attachments;

  const result = await resend.emails.send(sendPayload);

  if (result.error) {
    req.log.error({ err: result.error, id }, "adminScraper: send email failed");
    res.status(500).json({ error: String(result.error?.message ?? result.error) }); return;
  }

  await db.update(scrapedBusinessesTable)
    .set({ emailStatus: "sent", updatedAt: new Date() }).where(eq(scrapedBusinessesTable.id, id));
  req.log.info({ id, email: biz.email }, "adminScraper: outreach email sent");
  res.json({ ok: true, emailId: result.data?.id });
});

// ── POST /api/admin/outreach/batch/logos ──────────────────────────────────────
router.post("/admin/outreach/batch/logos", requireAdmin, async (req, res): Promise<void> => {
  const { city, state, limit = 20 } = req.body as { city?: string; state?: string; limit?: number };
  const conditions: any[] = [eq(scrapedBusinessesTable.logoStatus, "pending")];
  if (city) conditions.push(ilike(scrapedBusinessesTable.city, city));
  if (state) conditions.push(eq(scrapedBusinessesTable.state, state.toUpperCase()));

  const pending = await db.select().from(scrapedBusinessesTable)
    .where(and(...conditions)).limit(Math.min(Number(limit) || 20, 50));
  if (pending.length === 0) { res.json({ ok: true, message: "No pending logos", count: 0 }); return; }

  const jobId = newJob("logo", `Batch logos: ${pending.length} businesses`);
  jobs.get(jobId)!.total = pending.length;
  res.json({ ok: true, jobId, count: pending.length });

  runBatchLogos(jobId, pending).catch((err) => {
    const j = jobs.get(jobId);
    if (j) { j.status = "failed"; j.error = String(err); j.completedAt = new Date(); }
    logger.error({ err, jobId }, "adminScraper: batch logos failed");
  });
});

async function runBatchLogos(jobId: string, businesses: typeof scrapedBusinessesTable.$inferSelect[]): Promise<void> {
  const job = jobs.get(jobId)!;
  // Pre-warm the headless browser once before the loop — avoids a cold-start
  // penalty on every business that needs the JS-render fallback.
  await warmBrowser();
  try {
    for (const biz of businesses) {
      await processLogoAndContinue(biz.id, biz.website, biz.logoUrl);
      job.processed++;
      job.newCount++;
      jobAppend(jobId, `✓ "${biz.businessName}"`);
    }
  } finally {
    await closeBrowser();
  }
  job.status = "done"; job.completedAt = new Date();
  jobAppend(jobId, `✅ Batch logos done — ${businesses.length} processed`);
}

// ── POST /api/admin/outreach/batch/ads ────────────────────────────────────────
router.post("/admin/outreach/batch/ads", requireAdmin, async (req, res): Promise<void> => {
  if (!process.env.XAI_API_KEY) { res.status(503).json({ error: "XAI_API_KEY not configured" }); return; }
  const { city, state, limit = 10, quality = false } = req.body as { city?: string; state?: string; limit?: number; quality?: boolean };

  // Ad generation no longer requires a usable logo — text-only fallback handles all cases
  const conditions: any[] = [
    eq(scrapedBusinessesTable.adStatus, "pending"),
    isNotNull(scrapedBusinessesTable.email),
  ];
  if (city) conditions.push(ilike(scrapedBusinessesTable.city, city));
  if (state) conditions.push(eq(scrapedBusinessesTable.state, state.toUpperCase()));

  const pending = await db.select().from(scrapedBusinessesTable)
    .where(and(...conditions)).limit(Math.min(Number(limit) || 10, 20));
  if (pending.length === 0) { res.json({ ok: true, message: "No pending ads", count: 0 }); return; }

  const jobId = newJob("ad", `Batch ads: ${pending.length} businesses`);
  jobs.get(jobId)!.total = pending.length;
  res.json({ ok: true, jobId, count: pending.length });

  runBatchAds(jobId, pending, quality).catch((err) => {
    const j = jobs.get(jobId);
    if (j) { j.status = "failed"; j.error = String(err); j.completedAt = new Date(); }
    logger.error({ err, jobId }, "adminScraper: batch ads failed");
  });
});

async function runBatchAds(jobId: string, businesses: typeof scrapedBusinessesTable.$inferSelect[], quality: boolean): Promise<void> {
  const job = jobs.get(jobId)!;
  for (const biz of businesses) {
    const params: OutreachAdParams = {
      bizName: biz.businessName, category: biz.category, phone: biz.phone,
      address: biz.address, city: biz.city, state: biz.state, website: biz.website,
      services: (biz.subtypes as string[]) ?? [],
      quality,
    };
    await generateAdAndContinue(biz.id, params);
    job.processed++;
    job.newCount++;
    jobAppend(jobId, `✓ "${biz.businessName}"`);
  }
  job.status = "done"; job.completedAt = new Date();
  jobAppend(jobId, `✅ Batch ads done — ${businesses.length} processed`);
}

// ── POST /api/admin/outreach/batch/email-drafts ───────────────────────────────
router.post("/admin/outreach/batch/email-drafts", requireAdmin, async (req, res): Promise<void> => {
  const { city, state, limit = 100 } = req.body as { city?: string; state?: string; limit?: number };
  const conditions: any[] = [eq(scrapedBusinessesTable.emailStatus, "pending")];
  if (city) conditions.push(ilike(scrapedBusinessesTable.city, city));
  if (state) conditions.push(eq(scrapedBusinessesTable.state, state.toUpperCase()));

  const pending = await db.select().from(scrapedBusinessesTable)
    .where(and(...conditions)).limit(Math.min(Number(limit) || 100, 200));
  if (pending.length === 0) { res.json({ ok: true, message: "No pending email drafts", count: 0 }); return; }

  let draftCount = 0;
  for (const biz of pending) {
    await draftEmailForBusiness(biz.id);
    draftCount++;
  }
  res.json({ ok: true, count: draftCount, message: `Drafted ${draftCount} emails` });
});

// ── GET /api/admin/outreach/stats ─────────────────────────────────────────────
router.get("/admin/outreach/stats", requireAdmin, async (_req, res): Promise<void> => {
  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scrapedBusinessesTable);

  const byStatus = await db
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

  res.json({ stats: byStatus, total: totalRow?.count ?? 0 });
});

// ── Public: GET /api/outreach/ad-image/:id ────────────────────────────────────
// Serves the stored ad image (PNG or JPEG) by business ID — no auth required,
// needed for <img> tags in emails and the claim section.
router.get("/outreach/ad-image/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).send("Invalid id"); return; }
  const [row] = await db
    .select({ adImageUrl: scrapedBusinessesTable.adImageUrl })
    .from(scrapedBusinessesTable)
    .where(eq(scrapedBusinessesTable.id, id))
    .limit(1);
  const dataUrl = row?.adImageUrl;
  if (!dataUrl?.startsWith("data:image/")) { res.status(404).send("Not found"); return; }
  const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!match) { res.status(404).send("Not found"); return; }
  res.setHeader("Content-Type", match[1]);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(Buffer.from(match[2], "base64"));
});

// ── Public: GET /api/outreach/claim-preview/:businessId ───────────────────────
// Returns business info + composite ad for the fast-lane claim section.
// No auth — opened when the business clicks "I Love My Ad" in the email.
router.get("/outreach/claim-preview/:businessId", async (req, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  if (!businessId) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select({
      id: scrapedBusinessesTable.id,
      businessName: scrapedBusinessesTable.businessName,
      city: scrapedBusinessesTable.city,
      state: scrapedBusinessesTable.state,
      category: scrapedBusinessesTable.category,
      phone: scrapedBusinessesTable.phone,
      website: scrapedBusinessesTable.website,
      adImageUrl: scrapedBusinessesTable.adImageUrl,
      adTemplate: scrapedBusinessesTable.adTemplate,
      emailStatus: scrapedBusinessesTable.emailStatus,
    })
    .from(scrapedBusinessesTable)
    .where(eq(scrapedBusinessesTable.id, businessId))
    .limit(1);

  // Return 404 for both non-existent and opted-out records — avoids
  // disclosing opted-out status to callers.
  if (!row || row.emailStatus === "opted-out") { res.status(404).json({ error: "Not found" }); return; }

  res.json({
    businessId: row.id,
    businessName: row.businessName,
    city: row.city,
    state: row.state,
    category: row.category ?? null,
    phone: row.phone ?? null,
    website: row.website ?? null,
    adImageUrl: row.adImageUrl ?? null,
    adTemplate: row.adTemplate ?? null,
  });
});

// ── Public: POST /api/outreach/claim-regenerate/:businessId ───────────────────
// Generates (or returns cached) a single-panel print-quality ad for the claim
// fast-lane. Rate-limited per-IP (10/hr) and globally (200/day).
router.post("/outreach/claim-regenerate/:businessId", async (req, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  if (!businessId) { res.status(400).json({ error: "Invalid id" }); return; }

  // Existence + opt-out validation comes FIRST — before cache or rate limits.
  // Both missing and opted-out return 404 (avoids enrollment disclosure).
  const [row] = await db
    .select({
      businessName: scrapedBusinessesTable.businessName,
      city: scrapedBusinessesTable.city,
      state: scrapedBusinessesTable.state,
      category: scrapedBusinessesTable.category,
      phone: scrapedBusinessesTable.phone,
      website: scrapedBusinessesTable.website,
      emailStatus: scrapedBusinessesTable.emailStatus,
    })
    .from(scrapedBusinessesTable)
    .where(eq(scrapedBusinessesTable.id, businessId))
    .limit(1);

  if (!row || row.emailStatus === "opted-out") { res.status(404).json({ error: "Not found" }); return; }

  // Return cached ad immediately — no Grok call needed.
  const cached = getCachedAd(businessId);
  if (cached) {
    res.json({ dataUrl: cached.dataUrl, template: cached.template, sizeKey: cached.sizeKey, cached: true });
    return;
  }

  // Abuse protection: per-IP and global rate limits.
  const ip = ((req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.ip ?? "unknown");
  if (!checkAndIncrementIpLimit(ip)) {
    res.status(429).json({ error: "Rate limit exceeded. Please try again in an hour." });
    return;
  }
  if (!checkAndIncrementGlobalCap()) {
    res.status(429).json({ error: "Daily regeneration limit reached. Please try again tomorrow." });
    return;
  }

  try {
    const adParams: OutreachAdParams = {
      bizName: row.businessName,
      category: row.category ?? null,
      phone: row.phone ?? null,
      address: null,
      city: row.city,
      state: row.state,
      website: row.website ?? null,
      skipComposite: true,
      quality: true,
    };
    const result = await generateAdForOutreach(adParams);
    setCachedAd(businessId, result.imageUrl, result.template, "l");
    res.json({ dataUrl: result.imageUrl, template: result.template, sizeKey: "l", cached: false });
  } catch (err: any) {
    logger.error({ err: err?.message, businessId }, "claim-regenerate: generateAdForOutreach failed");
    res.status(500).json({ error: "Ad generation failed. Please try again." });
  }
});

// ── Public: GET /api/outreach/unsubscribe ─────────────────────────────────────
// id parameter is the google_id (unique business identifier per spec)
router.get("/outreach/unsubscribe", async (req, res): Promise<void> => {
  const { id: googleId, token } = req.query as Record<string, string>;
  if (!googleId?.trim() || !token?.trim()) { res.status(400).send("Invalid unsubscribe link."); return; }

  const expected = unsubToken(googleId);
  if (token !== expected) { res.status(400).send("Invalid or expired unsubscribe token."); return; }

  await db.update(scrapedBusinessesTable)
    .set({ emailStatus: "opted-out", updatedAt: new Date() })
    .where(and(
      eq(scrapedBusinessesTable.googleId, googleId),
      or(
        eq(scrapedBusinessesTable.emailStatus, "sent"),
        eq(scrapedBusinessesTable.emailStatus, "drafted"),
      )!,
    ));

  res.send(`<!DOCTYPE html><html><head><title>Unsubscribed</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px;">
<h2>You've been unsubscribed.</h2>
<p>You will no longer receive outreach emails from My Town Postcard.</p>
</body></html>`);
});

export default router;
