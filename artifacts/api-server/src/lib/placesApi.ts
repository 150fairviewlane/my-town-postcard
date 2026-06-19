const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY ?? "";

export interface PlaceResult {
  displayName: string;
  phone: string | null;
  website: string | null;
  address: string | null;
}

async function searchOnePage(
  query: string,
  pageToken?: string,
): Promise<{ results: PlaceResult[]; nextPageToken?: string }> {
  const body: Record<string, unknown> = { textQuery: query };
  if (pageToken) body.pageToken = pageToken;

  const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": PLACES_API_KEY,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.id,nextPageToken",
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 429) {
    throw Object.assign(new Error("Google Places quota / rate limit hit"), { status: 429 });
  }
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Google Places API error ${resp.status}: ${errText}`);
  }

  const data = (await resp.json()) as {
    places?: Array<{
      displayName?: { text?: string };
      nationalPhoneNumber?: string;
      websiteUri?: string;
      formattedAddress?: string;
    }>;
    nextPageToken?: string;
  };

  return {
    results: (data.places ?? []).map((p) => ({
      displayName: p.displayName?.text ?? "Unknown",
      phone: p.nationalPhoneNumber ?? null,
      website: p.websiteUri ?? null,
      address: p.formattedAddress ?? null,
    })),
    nextPageToken: data.nextPageToken,
  };
}

/** Paginates up to 3 pages (Google's documented max per query). */
export async function searchAllPages(query: string): Promise<PlaceResult[]> {
  const all: PlaceResult[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const { results, nextPageToken } = await searchOnePage(query, pageToken);
    all.push(...results);
    pageToken = nextPageToken;
    pages++;
    if (nextPageToken && pages < 3) {
      await new Promise((r) => setTimeout(r, 600));
    }
  } while (pageToken && pages < 3);

  return all;
}
