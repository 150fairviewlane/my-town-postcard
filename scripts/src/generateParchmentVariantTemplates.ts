/**
 * One-shot script: generate per-variant parchment-classic template reference images.
 *
 * The original template images (v1) contain an orange pennant ribbon in the top-left
 * corner. Grok copies what it sees in the reference image, so variants 2 and 3 each
 * need a separate reference image with the pennant replaced by the correct logo shape.
 *
 * Outputs written to attached_assets/:
 *   parchment_classic_portrait_v2.png  — pennant erased, circular badge top-right
 *   parchment_classic_portrait_v3.png  — pennant erased, full-width banner top
 *   parchment_classic_landscape_v2.png — same for landscape
 *   parchment_classic_landscape_v3.png — same for landscape
 *
 * Run: pnpm --filter @workspace/scripts run generate-parchment-templates
 */

import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Walk up to workspace root (scripts/ lives one level under root)
const ROOT = path.resolve(__dirname, "..", "..");
const ASSETS = path.join(ROOT, "attached_assets");

// ── Helpers ──────────────────────────────────────────────────────────────────

function svgBuf(svg: string): Buffer {
  return Buffer.from(svg);
}

/**
 * Build an SVG overlay that:
 *  1. Paints a solid rectangle over the pennant area (to erase it).
 *  2. Draws the variant-specific logo shape.
 */
function makeV2SvgPortrait(): string {
  // Portrait: 1148 × 1371
  // Pennant erase: 0,0 → 290×326 with parchment background rgb(238,222,202)
  // Circular badge: top-right, center (1068, 90), radius 72, dark navy stroke
  const W = 1148;
  const H = 1371;
  const bgR = 238; const bgG = 222; const bgB = 202;
  const cx = 1060; const cy = 88; const r = 72;
  const darkColor = "#1e1e3c"; // deep navy — matches variant 2 "Inverted Dark" palette
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <!-- erase pennant -->
  <rect x="0" y="0" width="295" height="330" fill="rgb(${bgR},${bgG},${bgB})"/>
  <!-- circular badge ring (logo zone) -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgb(${bgR},${bgG},${bgB})" stroke="${darkColor}" stroke-width="5"/>
  <!-- inner ring to give double-ring seal look -->
  <circle cx="${cx}" cy="${cy}" r="${r - 10}" fill="none" stroke="${darkColor}" stroke-width="2"/>
  <!-- label inside badge -->
  <text x="${cx}" y="${cy + 7}" font-family="serif" font-size="18" font-weight="bold"
        fill="${darkColor}" text-anchor="middle" letter-spacing="2">LOGO</text>
</svg>`;
}

function makeV3SvgPortrait(): string {
  // Portrait: 1148 × 1371
  // Pennant erase: same, then full-width banner at top
  const W = 1148;
  const H = 1371;
  const bgR = 238; const bgG = 222; const bgB = 202;
  const bannerColor = "#225522"; // deep forest green — matches variant 3 "Fresh Green"
  const bannerH = 90;
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <!-- erase pennant -->
  <rect x="0" y="0" width="295" height="330" fill="rgb(${bgR},${bgG},${bgB})"/>
  <!-- full-width banner strip across top -->
  <rect x="0" y="0" width="${W}" height="${bannerH}" fill="${bannerColor}"/>
  <!-- label inside banner -->
  <text x="${W / 2}" y="${bannerH / 2 + 7}" font-family="sans-serif" font-size="20"
        font-weight="bold" fill="white" text-anchor="middle" letter-spacing="3">LOGO · HEADLINE BANNER</text>
</svg>`;
}

function makeV2SvgLandscape(): string {
  // Landscape: 1536 × 1024
  // Pennant erase: 0,0 → 280×248 with landscape bg rgb(238,218,186)
  // Circular badge: top-right, center (1456, 88), radius 72, dark navy stroke
  const W = 1536;
  const H = 1024;
  const bgR = 238; const bgG = 218; const bgB = 186;
  const cx = 1448; const cy = 88; const r = 72;
  const darkColor = "#1e1e3c";
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <!-- erase pennant -->
  <rect x="0" y="0" width="285" height="252" fill="rgb(${bgR},${bgG},${bgB})"/>
  <!-- circular badge ring (logo zone) -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgb(${bgR},${bgG},${bgB})" stroke="${darkColor}" stroke-width="5"/>
  <circle cx="${cx}" cy="${cy}" r="${r - 10}" fill="none" stroke="${darkColor}" stroke-width="2"/>
  <text x="${cx}" y="${cy + 7}" font-family="serif" font-size="18" font-weight="bold"
        fill="${darkColor}" text-anchor="middle" letter-spacing="2">LOGO</text>
</svg>`;
}

function makeV3SvgLandscape(): string {
  // Landscape: 1536 × 1024
  const W = 1536;
  const H = 1024;
  const bgR = 238; const bgG = 218; const bgB = 186;
  const bannerColor = "#225522";
  const bannerH = 90;
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <!-- erase pennant -->
  <rect x="0" y="0" width="285" height="252" fill="rgb(${bgR},${bgG},${bgB})"/>
  <!-- full-width banner strip across top -->
  <rect x="0" y="0" width="${W}" height="${bannerH}" fill="${bannerColor}"/>
  <text x="${W / 2}" y="${bannerH / 2 + 7}" font-family="sans-serif" font-size="20"
        font-weight="bold" fill="white" text-anchor="middle" letter-spacing="3">LOGO · HEADLINE BANNER</text>
</svg>`;
}

// ── Generate ─────────────────────────────────────────────────────────────────

async function generate(): Promise<void> {
  const portraitSrc = path.join(ASSETS, "mr_biscuits_template_no_logo_1778806527327.png");
  const landscapeSrc = path.join(ASSETS, "parchment_classic_landscape_1779162178190.png");

  const tasks: Array<{ src: string; svg: string; out: string }> = [
    { src: portraitSrc,  svg: makeV2SvgPortrait(),  out: path.join(ASSETS, "parchment_classic_portrait_v2.png")  },
    { src: portraitSrc,  svg: makeV3SvgPortrait(),  out: path.join(ASSETS, "parchment_classic_portrait_v3.png")  },
    { src: landscapeSrc, svg: makeV2SvgLandscape(), out: path.join(ASSETS, "parchment_classic_landscape_v2.png") },
    { src: landscapeSrc, svg: makeV3SvgLandscape(), out: path.join(ASSETS, "parchment_classic_landscape_v3.png") },
  ];

  for (const { src, svg, out } of tasks) {
    await sharp(src)
      .composite([{ input: svgBuf(svg), top: 0, left: 0 }])
      .png({ compressionLevel: 8 })
      .toFile(out);
    console.log("✓ wrote", path.relative(ROOT, out));
  }

  console.log("\nAll variant template images generated.");
}

generate().catch((err) => { console.error(err); process.exit(1); });
