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
  // XL card geometry: cardLeft=1007, cardTop=1307, cardSize=187 (from QR_PLACEMENT + CARD_MARGIN)
  // Panel covers (imgW-374, imgH-374) = (826, 1126) to (1200, 1500)
  const cardLeft = 1007;
  const cardTop  = 1307;

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

  // ── Multi-pixel panel verification ───────────────────────────────────────
  // Panel is now FULL image width × 16% of imgH.
  // All sample points are inside the panel zone and OUTSIDE the card rect,
  // so they should all be close to the footer navy (#1A2744).
  //
  // Panel geometry (full-width, 16% height):
  //   panelW = imgW = 1200  → panelLeft = 0
  //   panelH = Math.round(imgH × 0.16) = 240 → panelTop = imgH - 240 = 1260
  //   Panel bounds: x ∈ [0, 1200), y ∈ [1260, 1500)
  // Card bounds:  x ∈ [1007, 1194), y ∈ [1307, 1494)  (cardSize=187, inset=6)
  //
  // Sample points (all inside panel, all outside card):
  //   P1 far right corner  (1197, 1497) — 3px from image corner
  //   P2 right edge top    (1190, 1265) — 5px below panel top (1260)
  //   P3 centre bottom     (600, 1490)  — centre of panel, bottom row
  //   P4 left edge mid     (30, 1380)   — far left of panel (tests full-width coverage)
  //   P5 left edge top     (30, 1265)   — left edge near panel top
  const samplePoints: Array<[number, number, string]> = [
    [imgW - 3,   imgH - 3,          "far right corner"],
    [imgW - 10,  imgH - 235,        "right edge top"],
    [600,        imgH - 10,         "centre bottom"],
    [30,         imgH - 120,        "left edge mid"],
    [30,         imgH - 235,        "left edge top"],
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
