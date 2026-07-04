import { browserScrape } from "./browserScraper.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface LogoResult {
  url: string;
  method: "json-ld" | "og-image" | "img-tag" | "favicon" | "outscraper" | "browser";
}

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") ?? "";
    if (!ct.includes("html")) return null;
    return await resp.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function extractJsonLdLogo(html: string, base: string): string | null {
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = ldRe.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1]!);
      const candidates: unknown[] = Array.isArray(obj) ? obj : [obj];
      for (const c of candidates) {
        if (!c || typeof c !== "object") continue;
        const node = c as Record<string, unknown>;
        if (!["Organization", "LocalBusiness", "Store", "Restaurant"].includes(String(node["@type"] ?? ""))) continue;
        const logo = node["logo"];
        if (typeof logo === "string" && logo.startsWith("http")) return logo;
        if (logo && typeof logo === "object") {
          const l = logo as Record<string, unknown>;
          const src = l["url"] ?? l["contentUrl"];
          if (typeof src === "string" && src.startsWith("http")) return src;
        }
        const img = node["image"];
        if (typeof img === "string" && /logo/i.test(img)) return resolveUrl(img, base);
      }
    } catch {
    }
  }
  return null;
}

function extractOgImage(html: string, base: string): string | null {
  const re = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i;
  const m = re.exec(html);
  if (!m) return null;
  return resolveUrl(m[1]!, base);
}

function extractLogoImg(html: string, base: string): string | null {
  const imgRe = /<img[^>]+>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const tag = m[0]!;
    const hasLogoHint =
      /class=["'][^"']*logo[^"']*["']/i.test(tag) ||
      /id=["'][^"']*logo[^"']*["']/i.test(tag) ||
      /alt=["'][^"']*logo[^"']*["']/i.test(tag) ||
      /src=["'][^"']*logo[^"']*["']/i.test(tag);
    if (!hasLogoHint) continue;
    const srcMatch = /src=["']([^"']+)["']/i.exec(tag);
    if (!srcMatch) continue;
    const resolved = resolveUrl(srcMatch[1]!, base);
    if (resolved) return resolved;
  }
  return null;
}

function extractFavicon(html: string, base: string): string | null {
  const candidates = [
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+rel=["']icon["'][^>]+sizes=["'][^"']*["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+\.ico)["'][^>]*>/i,
  ];
  for (const re of candidates) {
    const m = re.exec(html);
    if (m) return resolveUrl(m[1]!, base);
  }
  return null;
}

/**
 * Try to find a logo for the given business website.
 * Fast path: json-ld → og-image → img-tag → favicon → outscraper URL.
 * Headless browser fallback: used when all fast-path strategies return null,
 * to handle JS-rendered sites (React SPAs, Wix, Squarespace).
 */
export async function extractLogo(
  website: string | null,
  outscraperLogoUrl: string | null,
): Promise<LogoResult | null> {
  if (website) {
    const normalizedBase = website.startsWith("http") ? website : `https://${website}`;
    const html = await fetchHtml(normalizedBase);
    if (html) {
      const jsonLd = extractJsonLdLogo(html, normalizedBase);
      if (jsonLd) return { url: jsonLd, method: "json-ld" };

      const og = extractOgImage(html, normalizedBase);
      if (og) return { url: og, method: "og-image" };

      const logo = extractLogoImg(html, normalizedBase);
      if (logo) return { url: logo, method: "img-tag" };

      const fav = extractFavicon(html, normalizedBase);
      if (fav) return { url: fav, method: "favicon" };
    }

    // Headless browser fallback — for JS-rendered sites that return empty HTML shells
    const browserResult = await browserScrape(normalizedBase);
    if (browserResult.logoUrl) return { url: browserResult.logoUrl, method: "browser" };
  }

  if (outscraperLogoUrl) {
    return { url: outscraperLogoUrl, method: "outscraper" };
  }

  return null;
}
