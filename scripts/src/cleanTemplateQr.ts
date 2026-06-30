/**
 * cleanTemplateQr.ts
 *
 * Removes all QR / QR-like remnants from every active reference template image.
 *
 * Strategy per image:
 *  1. Scan raw pixels for the magenta square (R>200, G<60, B>180)
 *  2. Sample footer background color from the far-left of the footer band
 *  3. Paint an aggressive erase rect over the entire bottom-right corner
 *     (minX-600 to right edge, minY-200 to bottom)
 *  4. Re-draw a clean solid-magenta square anchored to the bottom-right corner
 *  5. Save back to the original file
 *
 * Run:  pnpm --filter @workspace/scripts tsx src/cleanTemplateQr.ts
 */

import sharp from "sharp";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const ASSETS_DIR = path.join(WORKSPACE_ROOT, "attached_assets");

// All 22 active reference template images (portrait + landscape)
const PORTRAIT_FILES: Array<[string, string]> = [
  ["parchment-classic", "mr_biscuits_template_no_logo_1778806527327.png"],
  ["made-fresh",        "made_fresh_template.png"],
  ["neighborhood-pro",  "6300F2D5-6BF1-403E-A40B-7203E4E26402_1778948283280.jpeg"],
  ["at-your-service",   "IMG_0728_1779065210873.jpeg"],
  ["health-wellness",   "healthcare_generic_template_1779141099043.png"],
  ["home-elegance",     "home_services_no_text_1780946323885.png"],
  ["sage-organic",      "IMG_0832_1780946925550.png"],
  ["purple-sage",       "IMG_0836_1780951148325.png"],
  ["brush-stroke",      "IMG_0839_1780955044987.png"],
  ["heritage-home",     "heritage_home_portrait.png"],
  ["wok-fire",          "image_1781029065584.png"],
];

const LANDSCAPE_FILES: Array<[string, string]> = [
  ["parchment-classic", "parchment_classic_landscape_1779162178190.png"],
  ["made-fresh",        "made_fresh_landscape_1779162178190.png"],
  ["neighborhood-pro",  "IMG_0747_1779162178190.png"],
  ["at-your-service",   "IMG_0746_1779162178190.png"],
  ["health-wellness",   "healthcare_wellness_landscape_1779162178190.png"],
  ["home-elegance",     "image_1780946327957.png"],
  ["sage-organic",      "image_1780946917886.png"],
  ["purple-sage",       "IMG_0837_1780951148325.png"],
  ["brush-stroke",      "IMG_0838_1780955044987.png"],
  ["heritage-home",     "heritage_home_landscape.png"],
  ["wok-fire",          "image_1781029077663.png"],
];

const MAGENTA_MIN_SIZE = 60; // min dimension of drawn magenta square

function medianOf(arr: number[]): number {
  if (arr.length === 0) return 0;
  arr.sort((a, b) => a - b);
  return arr[Math.floor(arr.length / 2)]!;
}

async function processImage(label: string, filename: string, orientation: string): Promise<"fixed" | "skipped" | "no-magenta"> {
  const filePath = path.join(ASSETS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠ SKIP (file not found): ${filename}`);
    return "skipped";
  }

  const img = sharp(filePath).ensureAlpha();
  const { width, height } = await img.metadata() as { width: number; height: number };
  const raw = await img.raw().toBuffer();
  const CH = 4; // RGBA after ensureAlpha

  // 1. Find magenta square bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let magentaCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * CH;
      const r = raw[i]!, g = raw[i + 1]!, b = raw[i + 2]!;
      if (r > 200 && g < 60 && b > 180) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        magentaCount++;
      }
    }
  }

  if (magentaCount < 30) {
    console.log(`  ⚠ NO-MAGENTA in ${filename} (${magentaCount} matching pixels)`);
    return "no-magenta";
  }

  const magW = maxX - minX + 1;
  const magH = maxY - minY + 1;
  console.log(`    magenta: x=${minX}–${maxX}, y=${minY}–${maxY} (${magW}×${magH}) | img ${width}×${height}`);

  // 2. Sample footer background color from far-left of footer band
  //    Sample at x=10..50, y=center of magenta ± 20 (guaranteed away from QR)
  const sampleMidY = Math.round((minY + maxY) / 2);
  const sampleX0 = 10, sampleX1 = Math.min(50, minX - 10);
  const sampleY0 = Math.max(0, sampleMidY - 20);
  const sampleY1 = Math.min(height - 1, sampleMidY + 20);

  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = sampleY0; y <= sampleY1; y++) {
    for (let x = Math.max(0, sampleX0); x <= Math.max(sampleX0, sampleX1); x++) {
      const i = (y * width + x) * CH;
      rs.push(raw[i]!);
      gs.push(raw[i + 1]!);
      bs.push(raw[i + 2]!);
    }
  }

  const bgR = medianOf(rs), bgG = medianOf(gs), bgB = medianOf(bs);
  console.log(`    bg sample: rgb(${bgR},${bgG},${bgB})`);

  // 3. Build erase rectangle — aggressively covers entire bottom-right corner
  //    Go 600px left of magenta and 200px above it to catch any QR size
  const eraseLeft = Math.max(0, minX - 600);
  const eraseTop  = Math.max(0, minY - 200);
  const eraseW = width - eraseLeft;
  const eraseH = height - eraseTop;

  const eraseBuf = await sharp({
    create: { width: eraseW, height: eraseH, channels: 3, background: { r: bgR, g: bgG, b: bgB } },
  }).png().toBuffer();

  // 4. Re-draw clean magenta square anchored to bottom-right corner
  const drawW = Math.max(magW, MAGENTA_MIN_SIZE);
  const drawH = Math.max(magH, MAGENTA_MIN_SIZE);
  const drawLeft = width - drawW;
  const drawTop  = height - drawH;

  const magBuf = await sharp({
    create: { width: drawW, height: drawH, channels: 3, background: { r: 255, g: 0, b: 255 } },
  }).png().toBuffer();

  // 5. Composite and save (write to tmp first, then rename atomically)
  const isJpeg = /\.(jpe?g)$/i.test(filename);
  const tmpPath = filePath + ".tmp";

  const pipeline = sharp(filePath).composite([
    { input: eraseBuf, left: eraseLeft, top: eraseTop, blend: "over" },
    { input: magBuf,   left: drawLeft,  top: drawTop,  blend: "over" },
  ]);

  if (isJpeg) {
    await pipeline.jpeg({ quality: 95 }).toFile(tmpPath);
  } else {
    await pipeline.png({ compressionLevel: 6 }).toFile(tmpPath);
  }

  fs.renameSync(tmpPath, filePath);
  console.log(`    ✓ FIXED`);
  return "fixed";
}

async function main() {
  const all: Array<[string, string, string]> = [
    ...PORTRAIT_FILES.map(([l, f]) => [l, f, "portrait"] as [string, string, string]),
    ...LANDSCAPE_FILES.map(([l, f]) => [l, f, "landscape"] as [string, string, string]),
  ];

  console.log(`\n=== cleanTemplateQr: ${all.length} template images ===\n`);
  let fixed = 0, skipped = 0, noMagenta = 0;

  for (const [label, filename, orientation] of all) {
    console.log(`[${all.indexOf([label, filename, orientation]) < 11 ? "P" : "L"}] ${label} — ${filename}`);
    const result = await processImage(label, filename, orientation);
    if (result === "fixed") fixed++;
    else if (result === "skipped") skipped++;
    else noMagenta++;
  }

  console.log(`\n=== Result: ${fixed} fixed, ${skipped} file-not-found, ${noMagenta} missing-magenta ===`);
  if (noMagenta > 0) {
    console.warn("⚠  Images with no-magenta need a magenta square added manually before use.");
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
