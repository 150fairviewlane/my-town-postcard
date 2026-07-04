import { browserScrape } from "./browserScraper.js";

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

// Generic local-parts that are almost certainly not real contact addresses
const JUNK_LOCAL_PARTS = new Set(["user", "test", "admin", "noreply", "no-reply"]);

// Extensions that appear after @ in false-positive image/asset filenames
// e.g. "photo@2x.png", "icon@1.5x.svg"
const FALSE_POS_RE = /@\d+x?\.(png|jpg|jpeg|gif|svg|webp|ico|bmp|tiff|pdf|woff|woff2|ttf|eot)/i;

const EMAIL_RE = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g;
const MAILTO_RE = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
const CONTACT_HREF_RE = /href=["']([^"']*\/contact[^"'#?]*)["']/gi;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function isJunkEmail(email: string): boolean {
  if (FALSE_POS_RE.test(email)) return true;
  const [local = "", domain = ""] = email.split("@");
  if (JUNK_DOMAINS.has(domain)) return true;
  // Reject "user@domain.com" style placeholders: generic local + short domain
  if (JUNK_LOCAL_PARTS.has(local.toLowerCase()) && domain.split(".").length <= 2) return true;
  return false;
}

function pickBestEmail(html: string): string | null {
  const candidates: string[] = [];

  // Priority 1 — explicit mailto links
  let m: RegExpExecArray | null;
  MAILTO_RE.lastIndex = 0;
  while ((m = MAILTO_RE.exec(html)) !== null) candidates.push(m[1]!.toLowerCase());

  // Priority 2 — plain-text matches
  EMAIL_RE.lastIndex = 0;
  while ((m = EMAIL_RE.exec(html)) !== null) candidates.push(m[1]!.toLowerCase());

  for (const email of candidates) {
    if (!isJunkEmail(email)) return email;
  }
  return null;
}

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function politeDelay(): Promise<void> {
  const ms = 700 + Math.random() * 1100;
  return new Promise((r) => setTimeout(r, ms));
}

// Common contact/about paths to probe directly, in priority order
const COMMON_PATHS = ["/contact", "/contact-us", "/about", "/about-us", "/reach-us", "/get-in-touch"];

/**
 * Tries to find an email address for a given website URL.
 * 1. Homepage fetch + regex
 * 2. Contact link found in homepage HTML
 * 3. Common paths probed directly (/contact, /contact-us, /about, /about-us)
 * 4. Headless browser fallback for JS-rendered sites
 * Returns null if nothing found or the site errors/times out.
 */
export async function findEmailOnWebsite(rawUrl: string): Promise<string | null> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

  // 1. Fetch homepage
  const homeHtml = await fetchHtml(url);
  if (homeHtml) {
    const homeEmail = pickBestEmail(homeHtml);
    if (homeEmail) return homeEmail;

    // 2. Follow contact link found in homepage HTML
    let contactUrl: string | null = null;
    let cm: RegExpExecArray | null;
    CONTACT_HREF_RE.lastIndex = 0;
    while ((cm = CONTACT_HREF_RE.exec(homeHtml)) !== null) {
      const href = cm[1]!;
      if (href.startsWith("http")) {
        contactUrl = href;
        break;
      }
      if (href.startsWith("/")) {
        try {
          contactUrl = `${new URL(url).origin}${href}`;
        } catch { /* skip malformed */ }
        break;
      }
    }
    if (contactUrl) {
      await politeDelay();
      const contactHtml = await fetchHtml(contactUrl);
      if (contactHtml) {
        const contactEmail = pickBestEmail(contactHtml);
        if (contactEmail) return contactEmail;
      }
    }

    // 3. Probe common paths directly (catches pages that exist but aren't linked)
    let origin: string;
    try { origin = new URL(url).origin; } catch { origin = url; }
    for (const path of COMMON_PATHS) {
      const candidate = `${origin}${path}`;
      if (candidate === contactUrl) continue; // already tried
      await politeDelay();
      const pathHtml = await fetchHtml(candidate);
      if (!pathHtml) continue;
      const pathEmail = pickBestEmail(pathHtml);
      if (pathEmail) return pathEmail;
    }
  }

  // 4. Headless browser fallback — catches JS-rendered sites (React SPAs, Wix, Squarespace)
  const browserResult = await browserScrape(url);
  return browserResult.email;
}
