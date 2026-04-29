/**
 * One-off asset generation for the LocalSpot industry image library.
 *
 * What this does:
 *   1. Crops the 6 food photos out of attached_assets/IMG_0564_1777433532123.png
 *      (Mr. Biscuit's menu) and saves them under
 *      artifacts/localspot/public/industries/restaurants/mr-biscuits/.
 *   2. Calls OpenAI's gpt-image-1 (via the Replit AI Integrations proxy) to
 *      generate 5 new themed restaurant photos for Mr. Biscuit's.
 *   3. Writes a manifest.json describing every image with a `tag` so the ad
 *      template can pick a sensible photo by role (`hero`, `food-detail`,
 *      `interior`, `drink`).
 *
 * Run from the repo root with:
 *   pnpm --filter @workspace/scripts run gen-restaurant-assets
 *
 * Requires AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY
 * env vars (set up via setupReplitAIIntegrations).
 */

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import OpenAI from "openai";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const MENU_SRC = path.join(
  REPO_ROOT,
  "attached_assets",
  "IMG_0564_1777433532123.png",
);
const OUT_DIR = path.join(
  REPO_ROOT,
  "artifacts",
  "localspot",
  "public",
  "industries",
  "restaurants",
  "mr-biscuits",
);

type Tag = "hero" | "food-detail" | "interior" | "drink";

interface ManifestEntry {
  file: string;
  source: "menu-crop" | "gpt-image-1";
  tag: Tag;
  caption: string;
  width: number;
  height: number;
}

// Approximate crop boxes for the 6 photos around the menu.
// Source image is 2752 × 2064 px. Coordinates were tuned by visual
// inspection of the source PNG so each crop sits inside the photo's
// black border without clipping content.
const MENU_CROPS: Array<{
  out: string;
  tag: Tag;
  caption: string;
  left: number;
  top: number;
  width: number;
  height: number;
}> = [
  {
    out: "menu-bagel-cream-cheese.jpg",
    tag: "food-detail",
    caption: "New York kettle-boiled bagel with cream cheese",
    left: 130, top: 90, width: 510, height: 480,
  },
  {
    out: "menu-bagel-plain.jpg",
    tag: "food-detail",
    caption: "Golden plain bagel close-up",
    left: 2155, top: 90, width: 510, height: 460,
  },
  {
    out: "menu-biscuit-egg-cheese.jpg",
    tag: "hero",
    caption: "Buttermilk biscuit with egg and American cheese",
    left: 130, top: 740, width: 510, height: 480,
  },
  {
    out: "menu-chicken-biscuit.jpg",
    tag: "hero",
    caption: "Crispy chicken tender biscuit on red checker paper",
    left: 2155, top: 740, width: 510, height: 480,
  },
  {
    out: "menu-croissant.jpg",
    tag: "food-detail",
    caption: "Flaky French butter croissant",
    left: 130, top: 1370, width: 510, height: 500,
  },
  {
    out: "menu-croissant-breakfast.jpg",
    tag: "hero",
    caption: "Croissant breakfast sandwich with bacon, egg, and cheese",
    left: 2155, top: 1370, width: 510, height: 500,
  },
];

interface GenSpec {
  out: string;
  tag: Tag;
  caption: string;
  size: "1024x1024" | "1536x1024" | "1024x1536";
  prompt: string;
}

const GEN_SPECS: GenSpec[] = [
  {
    out: "gen-buttermilk-biscuit-hero.jpg",
    tag: "hero",
    caption: "Tall, golden, hand-rolled buttermilk biscuit (hero shot)",
    size: "1536x1024",
    prompt:
      "Photo-realistic close-up of a single tall, flaky golden-brown buttermilk biscuit on a small white plate, melted butter glistening on top, scattered crumbs, sitting on a rustic wooden farmhouse table, warm morning sunlight from the side, shallow depth of field, soft natural shadows, food magazine style, no text, no watermark, no logo.",
  },
  {
    out: "gen-breakfast-plate.jpg",
    tag: "hero",
    caption: "Country breakfast plate with biscuit, eggs, bacon, sausage gravy",
    size: "1536x1024",
    prompt:
      "Photo-realistic Southern country breakfast plate served on a simple white diner plate: split buttermilk biscuit smothered in creamy white sausage gravy, two over-easy eggs, three strips of crispy bacon, two link sausages, sprig of parsley garnish. Top-down 30-degree angle on a checkered red-and-white tablecloth. Soft warm window light, professional food photography, vivid but natural colors, no text, no watermark, no logo.",
  },
  {
    out: "gen-cafe-interior.jpg",
    tag: "interior",
    caption: "Cozy small-town Georgia café interior, morning",
    size: "1536x1024",
    prompt:
      "Photo-realistic interior of a cozy small-town Georgia breakfast café in the morning: warm wood floors, a few small wooden tables with white ceramic mugs, vintage tin ceiling, exposed Edison bulb pendant lights, chalkboard menu in the background slightly out of focus, soft golden sunrise light streaming through large storefront windows, two empty barstools at the counter. Inviting, friendly, lived-in feeling, no people in frame, no readable text on signage, no watermark, no logo.",
  },
  {
    out: "gen-iced-boba-lineup.jpg",
    tag: "drink",
    caption: "Lineup of three colorful iced boba teas",
    size: "1536x1024",
    prompt:
      "Photo-realistic studio shot of three tall clear plastic cups of iced bubble tea (boba) lined up side by side on a light marble counter: a creamy taro lavender, a classic milk tea with brown tapioca pearls, and a vibrant bright red strawberry boba. Each has a wide pink straw and visible black or honey tapioca pearls at the bottom, condensation on the cups. Bright daylight, soft shadow, clean and inviting. No text, no watermark, no logo.",
  },
  {
    out: "gen-chicken-biscuit-detail.jpg",
    tag: "food-detail",
    caption: "Crispy chicken tender biscuit close-up on checker paper",
    size: "1024x1024",
    prompt:
      "Photo-realistic close-up of a fried chicken tender biscuit sandwich split open to show the crispy panko-crusted chicken between two halves of a tall flaky buttermilk biscuit, served on red-and-white gingham checkered deli paper in a small woven basket. Side-front 45-degree angle. Soft warm overhead light, steam rising gently, vivid natural colors, food magazine quality, no text, no watermark, no logo.",
  },
];

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function cropMenu(): Promise<ManifestEntry[]> {
  const entries: ManifestEntry[] = [];
  const meta = await sharp(MENU_SRC).metadata();
  console.log(`menu source: ${meta.width}×${meta.height}`);

  for (const c of MENU_CROPS) {
    const outPath = path.join(OUT_DIR, c.out);
    await sharp(MENU_SRC)
      .extract({ left: c.left, top: c.top, width: c.width, height: c.height })
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toFile(outPath);
    const cropMeta = await sharp(outPath).metadata();
    entries.push({
      file: c.out,
      source: "menu-crop",
      tag: c.tag,
      caption: c.caption,
      width: cropMeta.width ?? 0,
      height: cropMeta.height ?? 0,
    });
    console.log(`  cropped → ${c.out} (${cropMeta.width}×${cropMeta.height})`);
  }
  return entries;
}

async function generateImages(): Promise<ManifestEntry[]> {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) {
    throw new Error(
      "Missing AI_INTEGRATIONS_OPENAI_BASE_URL or AI_INTEGRATIONS_OPENAI_API_KEY env vars.",
    );
  }
  const client = new OpenAI({ baseURL, apiKey });

  const entries: ManifestEntry[] = [];
  for (const spec of GEN_SPECS) {
    const outPath = path.join(OUT_DIR, spec.out);
    try {
      // Skip if already generated (re-runs are cheap).
      await fs.access(outPath);
      const m = await sharp(outPath).metadata();
      console.log(`  skip (exists) → ${spec.out}`);
      entries.push({
        file: spec.out,
        source: "gpt-image-1",
        tag: spec.tag,
        caption: spec.caption,
        width: m.width ?? 0,
        height: m.height ?? 0,
      });
      continue;
    } catch {
      // not present, generate
    }

    console.log(`  generating → ${spec.out} (${spec.size})…`);
    const resp = await client.images.generate({
      model: "gpt-image-1",
      prompt: spec.prompt,
      size: spec.size,
      n: 1,
    });
    const b64 = resp.data?.[0]?.b64_json;
    if (!b64) throw new Error(`gpt-image-1 returned no image for ${spec.out}`);
    const png = Buffer.from(b64, "base64");

    // Convert PNG → JPG (smaller for web). Keep native res; JPG quality 86.
    await sharp(png)
      .jpeg({ quality: 86, mozjpeg: true })
      .toFile(outPath);

    const m = await sharp(outPath).metadata();
    entries.push({
      file: spec.out,
      source: "gpt-image-1",
      tag: spec.tag,
      caption: spec.caption,
      width: m.width ?? 0,
      height: m.height ?? 0,
    });
    console.log(`    saved (${m.width}×${m.height})`);
  }
  return entries;
}

async function main(): Promise<void> {
  await ensureDir(OUT_DIR);
  console.log(`Output dir: ${OUT_DIR}\n`);

  console.log("[1/2] Cropping menu photos…");
  const cropped = await cropMenu();

  console.log("\n[2/2] Generating restaurant images via gpt-image-1…");
  const generated = await generateImages();

  const manifest = {
    industry: "restaurants",
    business: "mr-biscuits",
    description:
      "Image library for Mr. Biscuit's Café — used as the showcase for Restaurant Template 1 and as a fallback pool when restaurant ads ship without uploaded photos.",
    images: [...cropped, ...generated],
  };
  const manifestPath = path.join(OUT_DIR, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nWrote manifest → ${manifestPath}`);
  console.log(`Total images: ${manifest.images.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
