const BASE_URL = "https://api.app.outscraper.com";

export interface OutscraperBusiness {
  googleId: string;
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  email: string | null;
  category: string | null;
  subtypes: string[];
  logo: string | null;
  facebookUrl: string | null;
}

function getApiKey(): string {
  const key = process.env.OUTSCRAPER_API_KEY;
  if (!key) throw new Error("OUTSCRAPER_API_KEY environment variable is not set");
  return key;
}

/** Search Google Maps businesses via Outscraper. */
export async function searchBusinesses(
  query: string,
  limit = 50,
): Promise<OutscraperBusiness[]> {
  const apiKey = getApiKey();

  const url = new URL(`${BASE_URL}/maps/search-v3`);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(Math.min(limit, 200)));
  url.searchParams.set("language", "en");
  url.searchParams.set("async", "false");
  url.searchParams.set("dropDuplicates", "true");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);

  let resp: Response;
  try {
    resp = await fetch(url.toString(), {
      headers: {
        "X-API-KEY": apiKey,
        "Accept": "application/json",
      },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Outscraper API error ${resp.status}: ${text.slice(0, 400)}`);
  }

  const data = (await resp.json()) as { status?: string; data?: unknown };

  if (data.status && data.status !== "OK" && data.status !== "Success") {
    throw new Error(`Outscraper non-OK status: ${data.status}`);
  }

  // Outscraper returns one of two shapes depending on endpoint/version:
  //   Nested (async-style):  { data: [[result, result, ...]] }
  //   Flat (sync):           { data: [result, result, ...] }
  let results: Record<string, unknown>[] = [];
  if (Array.isArray(data?.data)) {
    const first = (data.data as unknown[])[0];
    if (Array.isArray(first)) {
      // nested: data[0] is the results array
      results = first as Record<string, unknown>[];
    } else if (first && typeof first === "object") {
      // flat: data itself is the results array
      results = data.data as Record<string, unknown>[];
    }
  }

  return results.map((r) => normalizeResult(r));
}

function normalizeResult(r: Record<string, unknown>): OutscraperBusiness {
  const googleId =
    (r["place_id"] as string | undefined) ??
    (r["google_id"] as string | undefined) ??
    (r["cid"] as string | undefined) ??
    `${String(r["name"] ?? "")}-${String(r["full_address"] ?? r["address"] ?? "")}`;

  const subtypes = Array.isArray(r["subtypes"])
    ? (r["subtypes"] as unknown[]).filter((s): s is string => typeof s === "string")
    : [];

  const email = pickFirstEmail(r);

  return {
    googleId,
    name: String(r["name"] ?? ""),
    address: String(r["full_address"] ?? r["address"] ?? ""),
    phone: (r["phone"] as string | null | undefined) ?? null,
    website: (r["site"] as string | null | undefined) ?? (r["website"] as string | null | undefined) ?? null,
    email,
    category: (r["type"] as string | null | undefined) ?? (r["category"] as string | null | undefined) ?? null,
    subtypes,
    logo: (r["logo"] as string | null | undefined) ?? null,
    facebookUrl: (r["site_facebook"] as string | null | undefined) ?? null,
  };
}

function pickFirstEmail(r: Record<string, unknown>): string | null {
  const raw = r["email"] ?? r["emails"];
  if (!raw) return null;
  if (typeof raw === "string" && raw.includes("@")) return raw.trim();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item.includes("@")) return item.trim();
      if (typeof item === "object" && item && "email" in item) {
        const e = (item as Record<string, unknown>)["email"];
        if (typeof e === "string" && e.includes("@")) return e.trim();
      }
    }
  }
  return null;
}
