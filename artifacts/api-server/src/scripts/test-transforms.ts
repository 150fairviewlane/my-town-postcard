/**
 * test-transforms.ts — standalone visual inspection script
 *
 * Applies 6 conservative Sharp palette transforms (+ horizontal flip) to
 * 5 portrait template images and saves all 60 results to test-output/.
 *
 * Run with:
 *   pnpm --filter @workspace/api-server run test:transforms
 *
 * OUTPUT: artifacts/api-server/test-output/
 * FILES:  [templateKey]_[paletteName]_[normal|flipped].png  (60 total)
 *
 * IMPORTANT: This script is exploration-only. It does NOT modify adGenGrok.ts
 * or any other production file.
 */

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

// ── Path resolution ───────────────────────────────────────────────────────────
// src/scripts/ → ../../.. → artifacts/api-server → .. → artifacts → .. → repo root
const REPO_ROOT      = path.resolve(import.meta.dirname, "../../../..");
const ASSETS_DIR     = path.join(REPO_ROOT, "attached_assets");
const OUTPUT_DIR     = path.resolve(import.meta.dirname, "../../test-output");

// ── Template definitions ──────────────────────────────────────────────────────
const TEMPLATES: { key: string; filename: string }[] = [
  { key: "parchment-classic", filename: "mr_biscuits_template_no_logo_1778806527327.png" },
  { key: "made-fresh",        filename: "made_fresh_template.png" },
  { key: "neighborhood-pro",  filename: "6300F2D5-6BF1-403E-A40B-7203E4E26402_1778948283280.jpeg" },
  { key: "at-your-service",   filename: "IMG_0728_1779065210873.jpeg" },
  { key: "health-wellness",   filename: "healthcare_generic_template_1779141099043.png" },
];

// ── Palette definitions ───────────────────────────────────────────────────────
interface Palette {
  name: string;
  description: string;
  hue: number;
  saturation: number;
  brightness: number;
}

const CONSERVATIVE_PALETTES: Palette[] = [
  {
    name: "cool-shift",
    description: "Shifts warm tones toward cool blues/teals.",
    hue: 150, saturation: 0.9, brightness: 1.0,
  },
  {
    name: "warm-deepen",
    description: "Deepens and warms the palette.",
    hue: -40, saturation: 1.15, brightness: 0.95,
  },
  {
    name: "rich-dark",
    description: "Darkens overall palette for a premium moodier look.",
    hue: 0, saturation: 1.1, brightness: 0.75,
  },
  {
    name: "fresh-light",
    description: "Lightens and desaturates slightly for a fresh clean look.",
    hue: 0, saturation: 0.75, brightness: 1.2,
  },
  {
    name: "complementary",
    description: "Shifts to complementary color — most dramatic but still recognizable.",
    hue: 180, saturation: 0.85, brightness: 1.0,
  },
  {
    name: "muted-mono",
    description: "Desaturates heavily for near-monochromatic look.",
    hue: 0, saturation: 0.25, brightness: 1.05,
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Optional --template=<key> CLI filter (e.g. --template=neighborhood-pro)
  const templateArg = process.argv.find(a => a.startsWith("--template="));
  const templateFilter = templateArg ? templateArg.split("=")[1] : null;
  const templates = templateFilter
    ? TEMPLATES.filter(t => t.key === templateFilter)
    : TEMPLATES;

  if (templateFilter && templates.length === 0) {
    console.error(`No template found with key "${templateFilter}".`);
    process.exit(1);
  }

  const generated: string[] = [];

  for (const template of templates) {
    const inputPath = path.join(ASSETS_DIR, template.filename);

    if (!fs.existsSync(inputPath)) {
      console.warn(`  ⚠ SKIP ${template.key}: file not found at ${inputPath}`);
      continue;
    }

    const rawBuf = fs.readFileSync(inputPath);
    console.log(`  → Processing ${template.key} (${template.filename})`);

    // ── Footer-darkening pre-pass (neighborhood-pro only) ─────────────────────
    let templateBuffer: Buffer;
    if (template.key === "neighborhood-pro") {
      const meta = await sharp(rawBuf).metadata();
      const w = meta.width!;
      const h = meta.height!;
      const footerH = Math.ceil(h * 0.12);

      // Semi-transparent dark rectangle covering the bottom 12%
      const overlayBuf = await sharp({
        create: {
          width: w,
          height: footerH,
          channels: 4,
          background: { r: 20, g: 20, b: 20, alpha: 200 },
        },
      })
        .png()
        .toBuffer();

      templateBuffer = await sharp(rawBuf)
        .composite([{ input: overlayBuf, gravity: "south" }])
        .png()
        .toBuffer();

      console.log(`     ↳ footer-darkening overlay applied (bottom 12%, rgba 20/20/20/200)`);
    } else {
      templateBuffer = rawBuf;
    }

    for (const palette of CONSERVATIVE_PALETTES) {
      // Normal variant
      const normalBuf = await sharp(templateBuffer)
        .modulate({ hue: palette.hue, saturation: palette.saturation, brightness: palette.brightness })
        .png()
        .toBuffer();
      const normalName = `${template.key}_${palette.name}_normal.png`;
      fs.writeFileSync(path.join(OUTPUT_DIR, normalName), normalBuf);
      generated.push(normalName);

      // Flipped variant
      const flippedBuf = await sharp(templateBuffer)
        .modulate({ hue: palette.hue, saturation: palette.saturation, brightness: palette.brightness })
        .flop()
        .png()
        .toBuffer();
      const flippedName = `${template.key}_${palette.name}_flipped.png`;
      fs.writeFileSync(path.join(OUTPUT_DIR, flippedName), flippedBuf);
      generated.push(flippedName);
    }
  }

  console.log(`\nGenerated ${generated.length} files in test-output/`);
  for (const name of generated) {
    console.log(`  ${name}`);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
