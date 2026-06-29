/**
 * testFlattenLayer.ts — before/after comparison of the flatten disc.
 *
 * For every template (and two spot sizes — xl, m) we:
 *   1. Synthesise a "dirty" ad: cream body + dark footer + a gold spiky starburst
 *      polygon drawn in the bottom-right corner (simulates Grok drawing one there).
 *   2. Composite WITHOUT the flatten layer (old pipeline) → before_<tmpl>_<size>.jpg
 *   3. Composite WITH the flatten layer (new pipeline) → after_<tmpl>_<size>.jpg
 *   4. Save 300×300 corner crops for each.
 *   5. Pixel-verify the AFTER corner matches style.fill within tolerance.
 *
 * Run:
 *   pnpm --filter @workspace/api-server exec tsx src/scripts/testFlattenLayer.ts
 *
 * Outputs: /tmp/flatten_test/
 */

import sharp from "sharp";
import path  from "path";
import fs    from "fs";
import QRCode from "qrcode";
import {
  compositeQrOnto,
  getTemplateQrStyle,
  TEMPLATE_QR_STYLES,
  QR_PLACEMENT,
  computeCardLayout,
  type SizeKey,
  type CardStyle,
} from "../lib/compositeQr.js";

const OUT         = "/tmp/flatten_test";
const TRACKING_URL = "https://mytownpostcard.com/go/test-flatten-spring2026";
const CROP_SIZE   = 300;
const TOL         = 25;

const SIZE_KEYS: SizeKey[] = ["xl", "m"];

fs.mkdirSync(OUT, { recursive: true });

/** Parse "#rrggbb" → { r, g, b } */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) throw new Error(`Cannot parse fill hex: ${hex}`);
  return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) };
}

/**
 * Synthetic ad: cream body + dark footer + gold spiky star burst in the
 * bottom-right corner (a regular 12-point star polygon).
 */
async function makeDirtyJpeg(imgW: number, imgH: number): Promise<Buffer> {
  const footerH = Math.round(imgH * 0.20);
  const bodyH   = imgH - footerH;

  // Starburst star polygon centred at (imgW, imgH) — bottom-right corner.
  // outer radius 20% of min dim, inner radius 40% of outer.
  const outerR = Math.round(Math.min(imgW, imgH) * 0.20);
  const innerR = Math.round(outerR * 0.40);
  const points = 12;
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const r     = i % 2 === 0 ? outerR : innerR;
    pts.push(`${imgW + r * Math.cos(angle)},${imgH + r * Math.sin(angle)}`);
  }

  const svg = Buffer.from(
    `<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${imgW}" height="${bodyH}" fill="#F5F0E8"/>` +
    `<rect y="${bodyH}" width="${imgW}" height="${footerH}" fill="#1A2744"/>` +
    // White address text in footer (typical Grok content)
    `<text x="20" y="${bodyH + Math.round(footerH * 0.55)}" ` +
    `font-family="sans-serif" font-size="${Math.round(footerH * 0.35)}" fill="white" font-weight="bold">` +
    `(706) 555-0100  |  596 Main St, Clarkesville GA` +
    `</text>` +
    // Gold starburst polygon in corner
    `<polygon points="${pts.join(" ")}" fill="#FFD700" opacity="0.95"/>` +
    // Extra gold glow circle
    `<circle cx="${imgW}" cy="${imgH}" r="${Math.round(outerR * 0.6)}" fill="#FFC400" opacity="0.7"/>` +
    `</svg>`,
  );

  return sharp(svg).jpeg({ quality: 90 }).toBuffer();
}

/**
 * Old pipeline: glow disc + card only, no flatten layer.
 * Reimplements just enough of compositeQrOnto to skip the flatten step.
 */
async function compositeLegacy(
  imageBuffer: Buffer,
  trackingUrl: string,
  sk: SizeKey,
  style: CardStyle,
): Promise<Buffer> {
  const sharpMod = await (import("sharp") as Promise<any>);
  const s = (sharpMod.default ?? sharpMod) as typeof import("sharp");

  const spec   = QR_PLACEMENT[sk] ?? QR_PLACEMENT.xl;
  const layout = computeCardLayout(spec, style);
  const effectiveCornerRadius = style.circularCard
    ? Math.floor(layout.cardSize / 2) : style.cornerRadius;

  // QR
  const qrPng: Buffer = await QRCode.toBuffer(trackingUrl, {
    errorCorrectionLevel: "H", type: "png",
    width: spec.qrSize, margin: 4,
    color: { dark: "#000000", light: "#ffffff" },
  });

  // Backing card SVG
  const sw = style.borderWidth;
  const hasBorder = sw > 0;
  const half = hasBorder ? sw / 2 : 0;
  const inset = hasBorder ? sw : 0;
  const strokeAttrs = hasBorder
    ? ` stroke="${style.border}" stroke-width="${sw}"${style.dashPattern ? ` stroke-dasharray="${style.dashPattern.join(" ")}"` : ""}`
    : "";
  const cardSvg = Buffer.from(
    `<svg width="${layout.cardSize}" height="${layout.cardSize}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="${half}" y="${half}" width="${layout.cardSize - inset}" height="${layout.cardSize - inset}" ` +
    `rx="${effectiveCornerRadius}" ry="${effectiveCornerRadius}" fill="${style.fill}"${strokeAttrs}/>` +
    `</svg>`,
  );
  const cardBase  = await s(cardSvg).png().toBuffer();
  const cardWithQr = await s(cardBase)
    .composite([{ input: qrPng, left: layout.qrOffset, top: layout.qrOffset }])
    .png().toBuffer();

  // Glow disc only (no flatten)
  const discRadius = Math.round(layout.cardSize * 2.0);
  const glowSvg = Buffer.from(
    `<svg width="${discRadius}" height="${discRadius}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><radialGradient id="g" cx="${discRadius}" cy="${discRadius}" r="${discRadius}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0%" stop-color="${style.fill}" stop-opacity="1"/>` +
    `<stop offset="100%" stop-color="${style.fill}" stop-opacity="0"/>` +
    `</radialGradient></defs>` +
    `<rect width="${discRadius}" height="${discRadius}" fill="url(#g)"/>` +
    `</svg>`,
  );
  const glowPng = await s(glowSvg).png().toBuffer();

  return s(imageBuffer)
    .composite([
      { input: glowPng,   left: spec.imgW - discRadius,  top: spec.imgH - discRadius },
      { input: cardWithQr, left: layout.cardLeft,         top: layout.cardTop },
    ])
    .jpeg({ quality: 98, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

async function cornerCrop(buf: Buffer, imgW: number, imgH: number): Promise<Buffer> {
  return sharp(buf)
    .extract({ left: imgW - CROP_SIZE, top: imgH - CROP_SIZE, width: CROP_SIZE, height: CROP_SIZE })
    .jpeg({ quality: 95 })
    .toBuffer();
}

interface Result { template: string; size: SizeKey; pass: boolean; pixel: string; expected: string; }

async function main() {
  console.log(`\n── testFlattenLayer.ts ─────────────────────────────────────`);
  console.log(`Output dir: ${OUT}`);
  console.log(`Templates: ${Object.keys(TEMPLATE_QR_STYLES).length}`);
  console.log(`Sizes: ${SIZE_KEYS.join(", ")}\n`);

  const results: Result[] = [];

  for (const sk of SIZE_KEYS) {
    const spec = QR_PLACEMENT[sk];
    const { imgW, imgH } = spec;

    for (const [tmpl, style] of Object.entries(TEMPLATE_QR_STYLES)) {
      process.stdout.write(`  [${sk}] ${tmpl.padEnd(20)} … `);

      const dirty = await makeDirtyJpeg(imgW, imgH);
      const slug  = `${tmpl}_${sk}`;

      // BEFORE (legacy pipeline, no flatten)
      const before = await compositeLegacy(dirty, TRACKING_URL, sk, style);
      const beforeCrop = await cornerCrop(before, imgW, imgH);
      fs.writeFileSync(path.join(OUT, `before_${slug}.jpg`), beforeCrop);

      // AFTER (new pipeline with flatten)
      const after = await compositeQrOnto(dirty, TRACKING_URL, sk, style);
      const afterCrop = await cornerCrop(after, imgW, imgH);
      fs.writeFileSync(path.join(OUT, `after_${slug}.jpg`), afterCrop);

      // Pixel check on AFTER: sample 3px from corner (inside flatten zone)
      const sampleX = imgW - 3;
      const sampleY = imgH - 3;
      const { data: px } = await sharp(after)
        .extract({ left: sampleX, top: sampleY, width: 1, height: 1 })
        .removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const [r, g, b] = [px[0]!, px[1]!, px[2]!];
      const exp = hexToRgb(style.fill);
      const pass =
        Math.abs(r - exp.r) <= TOL &&
        Math.abs(g - exp.g) <= TOL &&
        Math.abs(b - exp.b) <= TOL;

      results.push({
        template: tmpl, size: sk, pass,
        pixel:    `rgb(${r},${g},${b})`,
        expected: `${style.fill} = rgb(${exp.r},${exp.g},${exp.b})`,
      });
      console.log(`${pass ? "✅" : "⚠️ "} corner=${pass ? "fill✓" : "MISMATCH"}  pixel=${r},${g},${b} exp≈${style.fill}`);
    }
  }

  // Summary
  const passed  = results.filter(r => r.pass).length;
  const failed  = results.filter(r => !r.pass).length;
  console.log(`\n── Summary ────────────────────────────────────────────────`);
  console.log(`  ${passed} / ${results.length} pixel checks PASS  (${failed} FAIL)\n`);
  if (failed > 0) {
    for (const r of results.filter(x => !x.pass)) {
      console.warn(`  ⚠️  ${r.template} [${r.size}]: got ${r.pixel} expected ${r.expected}`);
    }
  }
  console.log(`\nCorner crops written to ${OUT}/`);
  console.log(`  before_<template>_<size>.jpg — old pipeline (no flatten)`);
  console.log(`  after_<template>_<size>.jpg  — new pipeline (with flatten)`);
  console.log(`── Done ───────────────────────────────────────────────────\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
