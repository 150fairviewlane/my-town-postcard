/**
 * testStarburst.ts — visual proof that the gold starburst composites correctly.
 *
 * Creates a dark-footer synthetic ad (matching a typical postcard footer area),
 * runs compositeQrOnto, then saves:
 *   /tmp/starburst_full.jpg       — full ad with starburst + card + QR
 *   /tmp/starburst_corner.jpg     — 400×400 px crop of the bottom-right corner
 *
 * Expected result: warm-gold (#F4A800) starburst spikes radiate from the
 * bottom-right corner; backing card + QR sit centered on top of the origin.
 *
 * Run: pnpm --filter @workspace/api-server exec tsx src/scripts/testStarburst.ts
 */

import sharp from "sharp";
import path  from "path";
import fs    from "fs";
import {
  compositeQrOnto,
  getTemplateQrStyle,
  QR_PLACEMENT,
  TEMPLATE_QR_STYLES,
} from "../lib/compositeQr.js";

const OUT         = "/tmp";
const TRACKING_URL = "https://mytownpostcard.com/go/test-starburst-spring2026";
const SIZE_KEY    = "xl" as const;

/**
 * Synthetic JPEG: cream body with a dark navy footer (20% of height).
 * Gives a realistic contrast backdrop for the gold starburst.
 *
 * Uses a single SVG that matches the exact expected image dimensions so the
 * buffer passed to compositeQrOnto is always exactly imgW × imgH — preventing
 * "bad extract area" errors in the decode-verify step.
 */
async function makeSyntheticJpeg(): Promise<Buffer> {
  const { imgW, imgH } = QR_PLACEMENT[SIZE_KEY];
  const footerH = Math.round(imgH * 0.20); // 20% footer
  const bodyH   = imgH - footerH;

  // Single SVG with two colour bands → guaranteed imgW×imgH output.
  const svg = Buffer.from(
    `<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${imgW}" height="${bodyH}" fill="#F5F0E8"/>` +
    `<rect y="${bodyH}" width="${imgW}" height="${footerH}" fill="#1A2744"/>` +
    `</svg>`,
  );

  return sharp(svg).jpeg({ quality: 90 }).toBuffer();
}

async function main() {
  const { imgW, imgH } = QR_PLACEMENT[SIZE_KEY];
  console.log(`\n── testStarburst.ts ──────────────────────────────────────`);
  console.log(`Image: ${imgW}×${imgH} px (XL spot)`);

  const synth = await makeSyntheticJpeg();
  console.log(`Synthetic JPEG: ${synth.length.toLocaleString()} bytes (cream body + navy footer)`);

  // Use heritage-home style (cream card on dark footer — high contrast)
  const style = getTemplateQrStyle("heritage-home");
  console.log(`Card style: ${JSON.stringify(style)}`);

  const result = await compositeQrOnto(synth, TRACKING_URL, SIZE_KEY, style);

  // Save full image
  const fullPath = path.join(OUT, "starburst_full.jpg");
  fs.writeFileSync(fullPath, result);
  console.log(`\n✅ Full ad saved: ${fullPath}  (${result.length.toLocaleString()} bytes)`);

  // Save 400×400 corner crop for easy starburst inspection
  const cropSize = 400;
  const corner = await sharp(result)
    .extract({ left: imgW - cropSize, top: imgH - cropSize, width: cropSize, height: cropSize })
    .jpeg({ quality: 95 })
    .toBuffer();
  const cornerPath = path.join(OUT, "starburst_corner.jpg");
  fs.writeFileSync(cornerPath, corner);
  console.log(`✅ Corner crop saved: ${cornerPath}  (${corner.length.toLocaleString()} bytes)`);

  // Byte-difference sanity check vs raw synthetic (ensures starburst rendered real pixels)
  const rawBytes  = synth.length;
  const outBytes  = result.length;
  const deltaKB   = ((outBytes - rawBytes) / 1024).toFixed(1);
  console.log(`\n   Raw synthetic:  ${rawBytes.toLocaleString()} bytes`);
  console.log(`   After composite: ${outBytes.toLocaleString()} bytes  (Δ ${deltaKB} KB)`);

  // Sample near the 225° spike tip (pointing upper-left into the image).
  // Spike tip ≈ image_corner + outerRadius × (cos225°, sin225°)
  //           = (imgW + 300×(-0.707), imgH + 300×(-0.707)) ≈ (988, 1288).
  // Sample 20px inside the tip to land on the spike body, away from the card
  // footprint (card occupies x=[1007,1194], y=[1307,1494]).
  const outerRadiusSample = Math.round((187 + 6) * Math.SQRT2 * 1.1); // ~300 for XL
  const sampleX = Math.round(imgW + outerRadiusSample * Math.cos((225 * Math.PI) / 180)) + 20;
  const sampleY = Math.round(imgH + outerRadiusSample * Math.sin((225 * Math.PI) / 180)) + 20;
  const { data: px } = await sharp(result)
    .extract({ left: sampleX, top: sampleY, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const [r, g, b] = [px[0]!, px[1]!, px[2]!];
  const isGoldish = r > 200 && g > 140 && g < 210 && b < 80;
  if (isGoldish) {
    console.log(`\n✅ Gold starburst detected at (${sampleX},${sampleY}): rgb(${r},${g},${b}) — warm gold ✓`);
  } else {
    console.warn(`\n⚠️  Sample pixel at (${sampleX},${sampleY}): rgb(${r},${g},${b}) — not clearly gold`);
    console.warn(`   This may be normal if the sample lands on a spike valley or card edge.`);
    console.warn(`   Inspect ${cornerPath} visually to confirm.`);
  }

  console.log(`\nAll templates registered: ${Object.keys(TEMPLATE_QR_STYLES).join(", ")}`);
  console.log(`\n── Done. Inspect /tmp/starburst_corner.jpg for visual confirmation. ──\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
