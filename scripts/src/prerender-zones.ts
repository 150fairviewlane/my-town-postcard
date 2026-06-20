/**
 * prerender-zones.ts
 *
 * Build-time prerender step for territory landing pages.
 *
 * After the Vite build writes artifacts/localspot/dist/public/index.html,
 * this script queries the DB for every published campaign that has a slug,
 * derives the place name using the same logic as TerritoryLandingPage.tsx,
 * and writes <slug>/index.html into the dist folder with the correct
 * <title> and <meta name="description"> already in the HTML source.
 *
 * The static server serves these files before the "/* → index.html" rewrite
 * rule, so Googlebot and other crawlers see the city-specific meta tags
 * without executing JavaScript.  Real users still get the full SPA.
 *
 * Usage (called automatically via postbuild):
 *   pnpm --filter @workspace/scripts run prerender-zones
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { eq, and, isNotNull } from "drizzle-orm";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolved from scripts/src/ → workspace root → artifacts/localspot/dist/public
const DIST_DIR = path.resolve(
  __dirname,
  "../../artifacts/localspot/dist/public",
);

// ─── Minimal inline schema (mirrors lib/db/src/schema/campaigns.ts) ───────────

const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  territory: text("territory").notNull(),
  slug: text("slug").unique(),
  isPublished: boolean("is_published").notNull().default(false),
  cityList: text("city_list"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Place-name derivation (mirrors TerritoryLandingPage.tsx) ─────────────────

function derivePlaceName(campaign: {
  territory: string;
  cityList?: string | null;
}): string {
  const territory = (campaign.territory ?? "").trim();
  const cityListRaw = (campaign.cityList ?? "").trim();
  const cities = cityListRaw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const hubCity = cities.length === 1 ? cities[0] : null;
  return hubCity ?? territory ?? "";
}

// ─── HTML injection ───────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildHtml(
  templateHtml: string,
  title: string,
  description: string,
): string {
  // Replace the generic title tag
  let html = templateHtml.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(title)}</title>`,
  );

  // Inject description meta right after the closing </title> tag.
  // Falls back to inserting before </head> if the title replacement missed.
  const descTag = `<meta name="description" content="${escapeHtml(description)}" />`;

  if (html.includes("</title>")) {
    html = html.replace("</title>", `</title>\n    ${descTag}`);
  } else {
    html = html.replace("</head>", `  ${descTag}\n</head>`);
  }

  return html;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[prerender-zones] DATABASE_URL is not set — skipping.");
    process.exit(0);
  }

  const indexPath = path.join(DIST_DIR, "index.html");
  if (!fs.existsSync(indexPath)) {
    console.error(
      `[prerender-zones] ${indexPath} not found — run the Vite build first.`,
    );
    process.exit(1);
  }

  const templateHtml = fs.readFileSync(indexPath, "utf-8");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    // Fetch all published campaigns that have a slug
    const campaigns = await db
      .select({
        id: campaignsTable.id,
        slug: campaignsTable.slug,
        territory: campaignsTable.territory,
        cityList: campaignsTable.cityList,
      })
      .from(campaignsTable)
      .where(
        and(
          eq(campaignsTable.isPublished, true),
          isNotNull(campaignsTable.slug),
        ),
      );

    if (campaigns.length === 0) {
      console.log("[prerender-zones] No published campaigns with slugs found.");
      return;
    }

    let written = 0;

    for (const campaign of campaigns) {
      const slug = campaign.slug as string; // guaranteed non-null by WHERE clause
      const place = derivePlaceName(campaign);

      if (!place) {
        console.warn(
          `[prerender-zones] Skipping slug "${slug}" — no place name could be derived.`,
        );
        continue;
      }

      const title = `${place} Postcard Advertising | My Town Postcard`;
      const description = `Reach 5,000 ${place} homes with a 9×12 co-op postcard. Reserve your spot today.`;

      const html = buildHtml(templateHtml, title, description);

      const slugDir = path.join(DIST_DIR, slug);
      fs.mkdirSync(slugDir, { recursive: true });
      fs.writeFileSync(path.join(slugDir, "index.html"), html, "utf-8");

      console.log(`[prerender-zones] ✓ /${slug}  →  "${title}"`);
      written++;
    }

    console.log(
      `[prerender-zones] Done — ${written} zone page(s) prerendered into ${DIST_DIR}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[prerender-zones] Fatal error:", err);
  process.exit(1);
});
