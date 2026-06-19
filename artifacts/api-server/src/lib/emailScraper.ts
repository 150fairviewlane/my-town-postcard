const JUNK_DOMAINS = new Set([
  "example.com", "sentry.io", "wixpress.com", "squarespace.com",
  "wordpress.com", "shopify.com", "amazonaws.com", "cloudflare.com",
  "google.com", "googletagmanager.com", "googleapis.com",
  "facebook.com", "twitter.com", "instagram.com", "linkedin.com",
  "youtube.com", "apple.com", "microsoft.com", "jquery.com",
  "fontawesome.com", "w3.org", "schema.org", "goo.gl", "bit.ly",
  "ow.ly", "mailchimp.com", "hubspot.com", "zendesk.com",
  "intercom.io", "hotjar.com", "segment.com", "mixpanel.com",
]);

// Extensions that appear after @ in false-positive image/asset filenames
// e.g. "photo@2x.png", "icon@1.5x.svg"
const FALSE_POS_RE = /@\d+x?\.(png|jpg|jpeg|gif|svg|webp|ico|bmp|tiff|pdf|woff|woff2|ttf|eot)/i;

const EMAIL_RE = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g;
const MAILTO_RE = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
const CONTACT_HREF_RE = /href=["']([^"']*\/contact[^"'#?]*)["']/gi;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function pickBestEmail(html: string): string | null {
  const candidates: string[] = [];

  // Priority 1 — explicit mailto links
  let m: RegExpExecArray | null;
  MAILTO_RE.lastIndex = 0;
  while ((m = MAILTO_RE.exec(html)) !== null) candidates.push(m[1].toLowerCase());

  // Priority 2 — plain-text matches
  EMAIL_RE.lastIndex = 0;
  while ((m = EMAIL_RE.exec(html)) !== null) candidates.push(m[1].toLowerCase());

  for (const email of candidates) {
    const domain = email.split("@")[1] ?? "";
    if (JUNK_DOMAINS.has(domain)) continue;
    // Reject false positives like "photo@2x.png"
    if (FALSE_POS_RE.test(email)) continue;
    return email;
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

/**
 * Tries to find an email address for a given website URL.
 * Checks homepage first, then follows the first "contact" link found.
 * Returns null if nothing found or the site errors/times out.
 */
export async function findEmailOnWebsite(rawUrl: string): Promise<string | null> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

  // 1. Fetch homepage
  const homeHtml = await fetchHtml(url);
  if (!homeHtml) return null;

  const homeEmail = pickBestEmail(homeHtml);
  if (homeEmail) return homeEmail;

  // 2. Look for a contact page link
  let contactUrl: string | null = null;
  let cm: RegExpExecArray | null;
  CONTACT_HREF_RE.lastIndex = 0;
  while ((cm = CONTACT_HREF_RE.exec(homeHtml)) !== null) {
    const href = cm[1];
    if (href.startsWith("http")) {
      contactUrl = href;
      break;
    }
    if (href.startsWith("/")) {
      try {
        const origin = new URL(url).origin;
        contactUrl = `${origin}${href}`;
      } catch { /* skip malformed */ }
      break;
    }
  }
  if (!contactUrl) return null;

  await politeDelay();

  const contactHtml = await fetchHtml(contactUrl);
  if (!contactHtml) return null;
  return pickBestEmail(contactHtml);
}
