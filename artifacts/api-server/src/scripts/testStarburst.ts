/**
 * testStarburst.ts — visual proof that the glow disc composites correctly.
 *
 * Creates a dark-footer synthetic ad (matching a typical postcard footer area),
 * runs compositeQrOnto, then saves:
 *   /tmp/starburst_full.jpg       — full ad with glow disc + card + QR
 *   /tmp/starburst_corner.jpg     — 400×400 px crop of the bottom-right corner
 *
 * Expected result: a smooth radial-gradient quarter-circle (color = template's
 * CardStyle.fill) fades from the bottom-right corner into the ad. The backing
 * card + QR sit centred on top of the disc origin.
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
 * Gives a realistic contrast backdrop for the glow disc.
 *
 * Uses a single SVG that matches the exact expected image dimensions so the
 * buffer passed to compositeQrOnto is always exactly imgW × imgH — preventing
 * "bad extract area" errors in the decode-verify step.
 */
async function makeSyntheticJpeg(): Promise<Buffer> {
  const { imgW, imgH } = QR_PLACEMENT[SIZE_KEY];
  const footerH = Math.round(imgH * 0.20); // 20% footer
  const bodyH   = imgH - footerH;

  const svg = Buffer.from(
    `<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${imgW}" height="${bodyH}" fill="#F5F0E8"/>` +
    `<rect y="${bodyH}" width="${imgW}" height="${footerH}" fill="#1A2744"/>` +
    `</svg>`,
  );

  return sharp(svg).jpeg({ quality: 90 }).toBuffer();
}

/** Parse "#rrggbb" → { r, g, b } */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) throw new Error(`Cannot parse fill hex: ${hex}`);
  return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) };
}

async function main() {
  const { imgW, imgH } = QR_PLACEMENT[SIZE_KEY];
  console.log(`\n── testStarburst.ts (glow disc) ──────────────────────────`);
  console.log(`Image: ${imgW}×${imgH} px (XL spot)`);

  const synth = await makeSyntheticJpeg();
  console.log(`Synthetic JPEG: ${synth.length.toLocaleString()} bytes (cream body + navy footer)`);

  // Use heritage-home style — cream fill #f5f0e8 on a dark footer gives high
  // contrast to verify the disc colour.
  const style = getTemplateQrStyle("heritage-home");
  console.log(`Card style: ${JSON.stringify(style)}`);

  const result = await compositeQrOnto(synth, TRACKING_URL, SIZE_KEY, style);

  // ── Save outputs ──────────────────────────────────────────────────────────
  const fullPath = path.join(OUT, "starburst_full.jpg");
  fs.writeFileSync(fullPath, result);
  console.log(`\n✅ Full ad saved: ${fullPath}  (${result.length.toLocaleString()} bytes)`);

  const cropSize = 400;
  const corner = await sharp(result)
    .extract({ left: imgW - cropSize, top: imgH - cropSize, width: cropSize, height: cropSize })
    .jpeg({ quality: 95 })
    .toBuffer();
  const cornerPath = path.join(OUT, "starburst_corner.jpg");
  fs.writeFileSync(cornerPath, corner);
  console.log(`✅ Corner crop saved: ${cornerPath}  (${corner.length.toLocaleString()} bytes)`);

  // ── Byte-size sanity ──────────────────────────────────────────────────────
  const rawBytes = synth.length;
  const outBytes = result.length;
  const deltaKB  = ((outBytes - rawBytes) / 1024).toFixed(1);
  console.log(`\n   Raw synthetic:   ${rawBytes.toLocaleString()} bytes`);
  console.log(`   After composite: ${outBytes.toLocaleString()} bytes  (Δ ${deltaKB} KB)`);

  // ── Disc colour verification ──────────────────────────────────────────────
  // Sample in the CARD_INSET strip — the 6px margin between the card's right/
  // bottom edge and the image edge. This region sits on the glow disc at nearly
  // 100% opacity (≈ 5px from disc centre), so the pixel should match style.fill
  // within JPEG compression tolerance (±20 per channel).
  //
  // XL geometry (CARD_INSET = 6):
  //   card right  = imgW − cardSize − CARD_INSET + cardSize = imgW − 6 = 1194
  //   card bottom = imgH − cardSize − CARD_INSET + cardSize = imgH − 6 = 1494
  //   sample at (imgW − 3, imgH − 3) = (1197, 1497) — well inside image bounds,
  //   outside the card, and only ~4 px from the disc centre → near-full opacity.
  const sampleX = imgW - 3;
  const sampleY = imgH - 3;
  const { data: px } = await sharp(result)
    .extract({ left: sampleX, top: sampleY, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const [sampR, sampG, sampB] = [px[0]!, px[1]!, px[2]!];
  const expected = hexToRgb(style.fill);
  const TOL = 20;
  const matches =
    Math.abs(sampR - expected.r) <= TOL &&
    Math.abs(sampG - expected.g) <= TOL &&
    Math.abs(sampB - expected.b) <= TOL;

  if (matches) {
    console.log(
      `\n✅ Glow disc detected at (${sampleX},${sampleY}): ` +
      `rgb(${sampR},${sampG},${sampB}) ≈ ${style.fill} (fill colour ✓)`,
    );
  } else {
    console.warn(
      `\n⚠️  Sample pixel at (${sampleX},${sampleY}): rgb(${sampR},${sampG},${sampB}) — ` +
      `expected ≈ ${style.fill} = rgb(${expected.r},${expected.g},${expected.b}) ±${TOL}`,
    );
    console.warn(`   Inspect ${cornerPath} to verify the glow disc is rendering.`);
  }

  console.log(`\nAll templates registered: ${Object.keys(TEMPLATE_QR_STYLES).join(", ")}`);
  console.log(`\n── Done. Inspect /tmp/starburst_corner.jpg for visual confirmation. ──\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
