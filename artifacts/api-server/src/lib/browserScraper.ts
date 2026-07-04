/// <reference lib="dom" />
import { chromium, type Browser } from "playwright-core";
import { logger } from "./logger.js";

// ── Junk-domain + placeholder filter (Node.js side) ──────────────────────────
const JUNK_DOMAINS = new Set([
  "example.com", "example.org", "example.net",
  "domain.com", "test.com", "localhost",
  "sentry.io", "wixpress.com", "squarespace.com",
  "wordpress.com", "shopify.com", "amazonaws.com", "cloudflare.com",
  "google.com", "googletagmanager.com", "googleapis.com",
  "facebook.com", "twitter.com", "instagram.com", "linkedin.com",
  "youtube.com", "apple.com", "microsoft.com", "jquery.com",
  "fontawesome.com", "w3.org", "schema.org", "goo.gl", "bit.ly",
  "ow.ly", "mailchimp.com", "hubspot.com", "zendesk.com",
  "intercom.io", "hotjar.com", "segment.com", "mixpanel.com",
]);

const JUNK_LOCAL_PARTS = new Set(["user", "test", "admin", "noreply", "no-reply"]);
const FALSE_POS_RE = /@\d+x?\.(png|jpg|jpeg|gif|svg|webp|ico|bmp|tiff|pdf|woff|woff2|ttf|eot)/i;
const EMAIL_RE = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g;

function isJunkEmail(email: string): boolean {
  if (FALSE_POS_RE.test(email)) return true;
  const atIdx = email.indexOf("@");
  const local = email.slice(0, atIdx).toLowerCase();
  const domain = email.slice(atIdx + 1).toLowerCase();
  if (JUNK_DOMAINS.has(domain)) return true;
  if (JUNK_LOCAL_PARTS.has(local) && domain.split(".").length <= 2) return true;
  return false;
}

function pickEmail(candidates: string[]): string | null {
  for (const e of candidates) {
    const lower = e.toLowerCase();
    if (!isJunkEmail(lower)) return lower;
  }
  return null;
}

// ── Singleton browser + 3-page concurrency gate ───────────────────────────────

let browser: Browser | null = null;

// Semaphore: at most PAGE_LIMIT pages open simultaneously across all callers.
const PAGE_LIMIT = 3;
let activePages = 0;
const waitQueue: Array<() => void> = [];

function acquirePage(): Promise<void> {
  if (activePages < PAGE_LIMIT) {
    activePages++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(() => { activePages++; resolve(); });
  });
}

function releasePage(): void {
  activePages--;
  const next = waitQueue.shift();
  if (next) next();
}

export async function warmBrowser(): Promise<void> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    logger.info("browserScraper: Chromium launched");
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    logger.info("browserScraper: Chromium closed");
  }
}

export interface BrowserScrapeResult {
  logoUrl: string | null;
  email: string | null;
}

/**
 * Visits a business website with a real headless browser (Playwright/Chromium),
 * waits for JS rendering, then extracts:
 *   - The most likely logo image (largest img in the top 20% of the page)
 *   - The first non-junk email found via mailto: links or visible text
 *
 * Browser-side evaluate calls return raw primitives only — all filtering and
 * ranking happens in Node.js to avoid tsx/esbuild __name serialization issues.
 *
 * Times out the whole visit at 15 s.
 */
export async function browserScrape(rawUrl: string): Promise<BrowserScrapeResult> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

  if (!browser) await warmBrowser();

  // Respect the 3-page concurrency limit before opening a new tab
  await acquirePage();
  const page = await browser!.newPage();
  try {
    await page.setExtraHTTPHeaders({
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    // Skip fonts to speed up load
    await page.route("**/*.{woff,woff2,ttf,otf,eot}", (route) => route.abort());

    // Try networkidle first; fall back to domcontentloaded for sites that keep
    // background activity alive (e.g. Longhornsteakhouse, Bigg Daddys).
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 12_000 });
    } catch {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 8_000 });
    }

    // ── Email: collect raw candidates from the rendered page ─────────────────
    // Each evaluate call returns only plain primitives — no closures, no helpers.

    const mailtoEmails = await page.evaluate(
      "Array.from(document.querySelectorAll(\"a[href^='mailto:']\")).map(a => a.href.replace(/^mailto:/i,'').split('?')[0] || '')",
    ) as string[];

    const bodyText = await page.evaluate("document.body ? document.body.innerText : ''") as string;

    // Extract from body text in Node.js (plain regex, no browser closure needed)
    const bodyEmails: string[] = [];
    EMAIL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EMAIL_RE.exec(bodyText)) !== null) {
      bodyEmails.push(m[1]!);
    }

    const email = pickEmail([...mailtoEmails, ...bodyEmails]);

    // ── Logo: collect image candidates from top 20% of viewport ──────────────
    type ImgData = { src: string; area: number; hasLogoHint: boolean; top: number };

    const imgCandidates = await page.evaluate(
      // Plain JS string — no TypeScript, no closures, no esbuild helpers
      `(function() {
        var viewH = window.innerHeight;
        var threshold = viewH * 0.20;
        var results = [];
        var imgs = document.querySelectorAll('img');
        for (var i = 0; i < imgs.length; i++) {
          var img = imgs[i];
          var rect = img.getBoundingClientRect();
          if (rect.top > threshold) continue;
          if (rect.width < 30 || rect.height < 30) continue;
          var src = img.currentSrc || img.src || img.getAttribute('src') || '';
          if (!src || (src.indexOf('data:') === 0 && src.length < 200)) continue;
          var hint = /logo/i.test(img.className) || /logo/i.test(img.id) || /logo/i.test(img.alt) || /logo/i.test(src);
          results.push({ src: src, area: rect.width * rect.height, hasLogoHint: hint, top: rect.top });
        }
        return results;
      })()`,
    ) as ImgData[];

    // Rank in Node.js: logo-hinted first, then largest, then highest
    imgCandidates.sort((a, b) => {
      if (a.hasLogoHint !== b.hasLogoHint) return a.hasLogoHint ? -1 : 1;
      if (b.area !== a.area) return b.area - a.area;
      return a.top - b.top;
    });

    const logoUrl = imgCandidates[0]?.src ?? null;
    return { logoUrl, email };

  } catch (err) {
    logger.warn({ err, url }, "browserScraper: page visit failed");
    return { logoUrl: null, email: null };
  } finally {
    await page.close().catch(() => {});
    releasePage();
  }
}
