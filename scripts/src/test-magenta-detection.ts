/**
 * test-magenta-detection.ts
 *
 * Proof-of-concept for magenta-border QR detection:
 *   1. Load a reference image where we know the QR position (parchment-classic).
 *   2. Composite a solid magenta (#FF00FF) square over the QR region.
 *   3. Save the annotated image to /tmp so we can visually inspect it.
 *   4. Run Sharp raw-pixel analysis to detect the magenta region.
 *   5. Report detected bbox vs. expected bbox.
 *
 * Run: pnpm --filter @workspace/scripts run test:magenta-detection
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ASSETS     = path.resolve(__dirname, "../../attached_assets");

// ── Config ─────────────────────────────────────────────────────────────────
// Parchment-classic: known QR position from scan-template-qr-positions output
const TEMPLATE_FILE = "mr_biscuits_template_no_logo_1778806527327.png";
const QR_CX_FRAC    = 0.8897;
const QR_CY_FRAC    = 0.919;
const QR_SIZE_FRAC  = 0.1039;   // fraction of min(imgW, imgH)

// Magenta detection thresholds — tuned for #FF00FF through JPEG drift
const MAG_R_MIN = 180;
const MAG_G_MAX = 80;
const MAG_B_MIN = 180;

// Minimum number of matching pixels before we consider it a real detection
const MIN_PIXEL_COUNT = 100;

async function main() {
  const srcPath = path.join(ASSETS, TEMPLATE_FILE);
  if (!fs.existsSync(srcPath)) {
    console.error(`Source not found: ${srcPath}`);
    process.exit(1);
  }

  // ── Step 1: get image dimensions ─────────────────────────────────────────
  const meta  = await sharp(srcPath).metadata();
  const imgW  = meta.width!;
  const imgH  = meta.height!;
  console.log(`Image: ${imgW}×${imgH}`);

  // ── Step 2: compute expected bbox ─────────────────────────────────────────
  const rawSize    = Math.round(QR_SIZE_FRAC * Math.min(imgW, imgH));
  const cx         = Math.round(QR_CX_FRAC * imgW);
  const cy         = Math.round(QR_CY_FRAC * imgH);
  const halfSize   = Math.floor(rawSize / 2);
  const sqLeft     = Math.max(0, cx - halfSize);
  const sqTop      = Math.max(0, cy - halfSize);
  const sqW        = Math.min(rawSize, imgW - sqLeft);
  const sqH        = Math.min(rawSize, imgH - sqTop);

  console.log(`\nExpected QR bbox: left=${sqLeft} top=${sqTop} w=${sqW} h=${sqH}`);
  console.log(`Expected centroid: cx=${cx} cy=${cy}`);

  // ── Step 3: composite magenta square onto the image ───────────────────────
  // Solid #FF00FF SVG rect over the QR area
  const magentaSvg = Buffer.from(
    `<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="${sqLeft}" y="${sqTop}" width="${sqW}" height="${sqH}" fill="#FF00FF" opacity="1"/>` +
    `</svg>`
  );

  const annotated = await sharp(srcPath)
    .composite([{ input: magentaSvg, blend: "over" }])
    .png()   // keep as PNG first so no JPEG drift in the annotation step
    .toBuffer();

  // Save PNG version (no JPEG drift)
  const pngOut = "/tmp/magenta-test-raw.png";
  fs.writeFileSync(pngOut, annotated);
  console.log(`\nAnnotated PNG saved → ${pngOut}`);

  // Also save a JPEG version to simulate real Grok output quality
  const jpegBuf = await sharp(annotated)
    .jpeg({ quality: 85, chromaSubsampling: "4:4:4" })
    .toBuffer();
  const jpegOut = "/tmp/magenta-test-jpeg.jpg";
  fs.writeFileSync(jpegOut, jpegBuf);
  console.log(`Annotated JPEG saved → ${jpegOut}`);

  // ── Step 4: detect magenta on JPEG (harder case) ──────────────────────────
  for (const [label, buf] of [["PNG", annotated], ["JPEG (q=85)", jpegBuf]] as [string, Buffer][]) {
    console.log(`\n─── Detection on ${label} ───`);

    const { data, info } = await sharp(buf)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let matchCount = 0;
    const channels = info.channels; // 4 (RGBA)

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * channels;
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;

        if (r >= MAG_R_MIN && g <= MAG_G_MAX && b >= MAG_B_MIN) {
          matchCount++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (matchCount < MIN_PIXEL_COUNT) {
      console.log(`  ✗ Detection FAILED — only ${matchCount} matching pixels (need ≥${MIN_PIXEL_COUNT})`);
      continue;
    }

    const detW  = maxX - minX;
    const detH  = maxY - minY;
    const detCx = Math.round(minX + detW / 2);
    const detCy = Math.round(minY + detH / 2);

    console.log(`  ✓ Detection OK — ${matchCount.toLocaleString()} matching pixels`);
    console.log(`  Detected bbox:  left=${minX} top=${minY} w=${detW} h=${detH}`);
    console.log(`  Detected centroid: cx=${detCx} cy=${detCy}`);
    console.log(`  Centroid error: Δx=${Math.abs(detCx - cx)}px  Δy=${Math.abs(detCy - cy)}px`);

    const sizeErr = Math.abs(Math.max(detW, detH) - rawSize);
    console.log(`  Size error: ${sizeErr}px  (detected ${Math.max(detW, detH)}px vs expected ${rawSize}px)`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
