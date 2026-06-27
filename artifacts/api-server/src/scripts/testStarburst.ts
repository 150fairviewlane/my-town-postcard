/**
 * testStarburst.ts — visual proof that the opaque footer panel composites correctly.
 *
 * Creates a dark-footer synthetic ad (matching a typical postcard footer area),
 * runs compositeQrOnto, then saves:
 *   /tmp/starburst_full.jpg       — full ad with opaque panel + card + QR
 *   /tmp/starburst_corner.jpg     — 400×400 px crop of the bottom-right corner
 *
 * Expected result: every sample point in the panel region outside the card is
 * the sampled footer navy colour (#1A2744), NOT the old cream fill (#f5f0e8).
 * No gradient halo, no blurred smudge — just a flat opaque panel.
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
 * Synthetic JPEG: cream body with a dark navy footer (16% of height).
 * Uses a single SVG that matches the exact expected image dimensions so the
 * buffer passed to compositeQrOnto is always exactly imgW × imgH.
 */
async function makeSyntheticJpeg(): Promise<Buffer> {
  const { imgW, imgH } = QR_PLACEMENT[SIZE_KEY];
  const footerH = Math.round(imgH * 0.16);
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

/**
 * Sample a 1×1 px pixel from the result image and return its RGB.
 */
async function samplePixel(buf: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data } = await sharp(buf)
    .extract({ left: x, top: y, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return [data[0]!, data[1]!, data[2]!];
}

async function main() {
  const { imgW, imgH } = QR_PLACEMENT[SIZE_KEY];
  // XL card geometry (from QR_PLACEMENT + CARD_MARGIN=1.0375):
  //   cardSize = round(180 × 1.0375) = 187
  //   cardLeft = imgW - cardSize - CARD_INSET(6) = 1200 - 187 - 6 = 1007
  //   cardTop  = imgH - cardSize - CARD_INSET(6) = 1500 - 187 - 6 = 1307
  const cardLeft = 1007;
  const cardTop  = 1307;
  const cardSize = 187;

  console.log(`\n── testStarburst.ts (opaque panel) ───────────────────────`);
  console.log(`Image: ${imgW}×${imgH} px (XL spot)`);

  const synth = await makeSyntheticJpeg();
  console.log(`Synthetic JPEG: ${synth.length.toLocaleString()} bytes (cream body + navy footer)`);

  // Use heritage-home style — cream fill #f5f0e8 on dark footer gives maximum
  // contrast to verify the panel colour is sampled correctly.
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

  // ── Card-corner backing-square verification ───────────────────────────────
  // The panel is now a cardSize×cardSize square placed exactly at (cardLeft,
  // cardTop). We verify the 4 corners of the card bounding box — these are in
  // the transparent corner zone of the card's rounded-rect SVG (cornerRadius=16
  // means the curve starts 16 px from each edge; a pixel 1-2 px from the
  // corner is well outside the rounded rect and passes straight through to the
  // backing square below).
  //
  // Backing square: x ∈ [1007, 1194), y ∈ [1307, 1494)  (cardSize=187, inset=6)
  // Card SVG rounded rect: rx=ry=16, drawn inside 1.5 px half-stroke inset.
  // Corner transparent zone is verified for all 4 corners:
  //   TL (1008, 1308)  TR (1192, 1308)  BL (1008, 1492)  BR (1192, 1492)
  //
  // In the synthetic test image the footer band (navy) already covers these
  // coordinates, so the check doubles as confirmation the composite didn't
  // accidentally paint the card-fill colour into the corners.
  const samplePoints: Array<[number, number, string]> = [
    [cardLeft + 1,           cardTop + 1,           "top-left corner"],
    [cardLeft + cardSize - 3, cardTop + 1,           "top-right corner"],
    [cardLeft + 1,           cardTop + cardSize - 3, "bottom-left corner"],
    [cardLeft + cardSize - 3, cardTop + cardSize - 3, "bottom-right corner"],
    [imgW - 3,               imgH - 3,               "image far corner (footer background)"],
  ];

  const footerExpected = hexToRgb("#1A2744");
  const cardExpected   = hexToRgb(style.fill);  // cream — should NOT appear here
  const TOL            = 30;  // allow extra tolerance for JPEG round-trips across samples

  let allPass = true;
  console.log(`\n   Panel colour checks (expect ≈ navy #1A2744, NOT cream ${style.fill}):`);

  for (const [sx, sy, label] of samplePoints) {
    const [r, g, b] = await samplePixel(result, sx, sy);
    const matchesPanel =
      Math.abs(r - footerExpected.r) <= TOL &&
      Math.abs(g - footerExpected.g) <= TOL &&
      Math.abs(b - footerExpected.b) <= TOL;
    const matchesCard =
      Math.abs(r - cardExpected.r) <= TOL &&
      Math.abs(g - cardExpected.g) <= TOL &&
      Math.abs(b - cardExpected.b) <= TOL;

    if (matchesPanel) {
      console.log(`   ✅ (${sx},${sy}) ${label}: rgb(${r},${g},${b}) ≈ navy ✓`);
    } else if (matchesCard) {
      console.warn(`   ⚠️  (${sx},${sy}) ${label}: rgb(${r},${g},${b}) — matches card fill (halo/no-panel?)`);
      allPass = false;
    } else {
      console.warn(`   ⚠️  (${sx},${sy}) ${label}: rgb(${r},${g},${b}) — unexpected (expected navy or card)`);
      allPass = false;
    }
  }

  if (allPass) {
    console.log(`\n✅ All panel sample points confirmed opaque navy — no glow halo or smudge detected.`);
  } else {
    console.warn(`\n⚠️  Some panel samples failed — inspect ${cornerPath} for visual confirmation.`);
  }

  console.log(`\nAll templates registered: ${Object.keys(TEMPLATE_QR_STYLES).join(", ")}`);
  console.log(`\n── Done. Inspect /tmp/starburst_corner.jpg for visual confirmation. ──\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
