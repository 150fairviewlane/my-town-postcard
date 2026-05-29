import { db, campaignsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Turn a territory / county name into a clean URL slug.
//   "White / Habersham Counties" -> "white-habersham"
//   "Fulton County — North"      -> "fulton-north"
//   "Alpharetta / Milton / Roswell" -> "alpharetta-milton-roswell"
// Strips the words "county"/"counties", treats "/" as a separator, lowercases,
// and drops every non-alphanumeric character.
export function generateSlug(name: string): string {
  return name
    .replace(/\//g, " ")
    .replace(/\bcount(?:y|ies)\b/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join("-");
}

// Resolve a collision-free campaign slug. Appends -2, -3, ... until the slug is
// free in the campaigns table. Always returns a non-empty slug (falls back to
// "territory" if the name has no usable characters).
export async function generateUniqueCampaignSlug(name: string): Promise<string> {
  const base = generateSlug(name) || "territory";
  let candidate = base;
  let n = 1;
  // Bounded loop — in practice resolves on the first or second try.
  for (let attempt = 0; attempt < 1000; attempt++) {
    const [existing] = await db
      .select({ id: campaignsTable.id })
      .from(campaignsTable)
      .where(eq(campaignsTable.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
  // Extremely unlikely fallback — disambiguate with a timestamp.
  return `${base}-${Date.now()}`;
}
