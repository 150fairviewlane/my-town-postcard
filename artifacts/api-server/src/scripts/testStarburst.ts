/**
 * testStarburst.ts — visual proof that the opaque footer panel composites correctly.
 *
 * Creates a dark-footer synthetic ad (matching a typical postcard footer area),
 * runs compositeQrOnto, then saves:
 *   /tmp/starburst_full.jpg       — full ad with opaque panel + card + QR
 *   /tmp/starburst_corner.jpg     — 400×400 px crop of the bottom-right corner
 *
 * Expected result: the bottom-right corner is covered by an opaque rectangle
 * whose colour matches the synthetic navy footer (#1A2744). The backing card
 * (cream #f5f0e8) + QR sit on top with a crisp drop shadow.
 *
 * The strip between the card's right/bottom edges and the image edge should be
 * the footer panel colour — no gradient halo, no blurred fill, pure navy.
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
 * Gives a realistic contrast backdrop for the opaque panel.
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
  console.log(`\n── testStarburst.ts (opaque panel) ───────────────────────`);
  console.log(`Image: ${imgW}×${imgH} px (XL spot)`);

  const synth = await makeSyntheticJpeg();
  console.log(`Synthetic JPEG: ${synth.length.toLocaleString()} bytes (cream body + navy footer)`);

  // Use heritage-home style — cream fill #f5f0e8 on a dark navy footer gives
  // maximum contrast to verify the panel colour is sampled correctly.
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

  // ── Panel colour verification ─────────────────────────────────────────────
  // Sample the extreme corner pixel (3 px in from each edge). This falls
  // inside the opaque panel (which covers a 374×374 px square anchored at the
  // corner) and outside the card itself. The panel colour is sampled from the
  // synthetic footer band (#1A2744 navy) so the pixel should be navy,
  // NOT the card fill colour (#f5f0e8 cream).
  //
  // XL geometry — card placed at (1007, 1307) inside a 1200×1500 image:
  //   corner pixel (1197, 1497) is 193 px below and 7 px right of the card edge
  //   → squarely inside the panel, outside the card.
  const sampleX = imgW - 3;
  const sampleY = imgH - 3;
  const { data: px } = await sharp(result)
    .extract({ left: sampleX, top: sampleY, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const [sampR, sampG, sampB] = [px[0]!, px[1]!, px[2]!];

  // Expected: the panel colour — sampled from the navy footer (#1A2744).
  // We allow ±20 per channel for JPEG compression round-trips.
  const footerExpected = hexToRgb("#1A2744");
  const cardExpected   = hexToRgb(style.fill);  // #f5f0e8 cream — should NOT be here
  const TOL = 20;

  const matchesPanel =
    Math.abs(sampR - footerExpected.r) <= TOL &&
    Math.abs(sampG - footerExpected.g) <= TOL &&
    Math.abs(sampB - footerExpected.b) <= TOL;

  const matchesCard =
    Math.abs(sampR - cardExpected.r) <= TOL &&
    Math.abs(sampG - cardExpected.g) <= TOL &&
    Math.abs(sampB - cardExpected.b) <= TOL;

  if (matchesPanel) {
    console.log(
      `\n✅ Opaque panel detected at (${sampleX},${sampleY}): ` +
      `rgb(${sampR},${sampG},${sampB}) ≈ footer navy #1A2744 ✓`,
    );
  } else if (matchesCard) {
    console.warn(
      `\n⚠️  Corner pixel matches card fill (${style.fill}) instead of panel colour — ` +
      `opaque panel may not be composited at (${sampleX},${sampleY}): rgb(${sampR},${sampG},${sampB})`,
    );
  } else {
    console.warn(
      `\n⚠️  Unexpected corner pixel at (${sampleX},${sampleY}): rgb(${sampR},${sampG},${sampB})`,
    );
    console.warn(`   Expected panel colour ≈ #1A2744 = rgb(${footerExpected.r},${footerExpected.g},${footerExpected.b}) ±${TOL}`);
    console.warn(`   Inspect ${cornerPath} for visual confirmation.`);
  }

  console.log(`\nAll templates registered: ${Object.keys(TEMPLATE_QR_STYLES).join(", ")}`);
  console.log(`\n── Done. Inspect /tmp/starburst_corner.jpg for visual confirmation. ──\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
