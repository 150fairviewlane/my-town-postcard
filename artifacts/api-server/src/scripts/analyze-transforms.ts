/**
 * analyze-transforms.ts — quality metric analysis for palette-transformed templates
 *
 * Run with:
 *   pnpm --filter @workspace/api-server run analyze:transforms
 *
 * Checks each image in test-output/ against three production-suitability metrics:
 *   1. FOOTER DARKNESS    — bottom 10% avg luminance < 80  (dark enough for white text)
 *   2. HEADLINE CONTRAST  — top 40% luminance range > 100  (not flat / readable zones present)
 *   3. COLOR VIBRANCY     — avg HSV saturation 0.15–0.85   (not grey, not garish)
 */

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const OUTPUT_DIR = path.resolve(import.meta.dirname, "../../test-output");

// ── Pixel math helpers ────────────────────────────────────────────────────────

function avgLuminance(data: Buffer, channels: number): number {
  let sum = 0;
  const pixels = data.length / channels;
  for (let i = 0; i < data.length; i += channels) {
    sum += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  }
  return pixels === 0 ? 0 : sum / pixels;
}

function luminanceRange(data: Buffer, channels: number): number {
  let lo = 255, hi = 0;
  for (let i = 0; i < data.length; i += channels) {
    const l = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    if (l < lo) lo = l;
    if (l > hi) hi = l;
  }
  return hi - lo;
}

function avgSaturation(data: Buffer, channels: number): number {
  let sum = 0;
  const pixels = data.length / channels;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    sum += max === 0 ? 0 : (max - min) / max;
  }
  return pixels === 0 ? 0 : sum / pixels;
}

// ── Per-image analysis ────────────────────────────────────────────────────────

interface Result {
  filename: string;
  footerLum: number;
  contrastRange: number;
  saturation: number;
  footerPass: boolean;
  contrastPass: boolean;
  satPass: boolean;
  verdict: "PASS" | "FAIL";
}

async function analyze(filename: string): Promise<Result> {
  const fp = path.join(OUTPUT_DIR, filename);
  const meta = await sharp(fp).metadata();
  const w = meta.width!;
  const h = meta.height!;

  // 1. Footer darkness — bottom 10%
  const footerTop    = Math.floor(h * 0.9);
  const footerHeight = h - footerTop;
  const { data: fd, info: fi } = await sharp(fp)
    .extract({ left: 0, top: footerTop, width: w, height: footerHeight })
    .resize({ width: 120 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const footerLum = avgLuminance(fd, fi.channels);

  // 2. Headline zone contrast — top 40%
  const headlineHeight = Math.floor(h * 0.4);
  const { data: hd, info: hi } = await sharp(fp)
    .extract({ left: 0, top: 0, width: w, height: headlineHeight })
    .resize({ width: 120 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const contrastRange = luminanceRange(hd, hi.channels);

  // 3. Color vibrancy — full image saturation
  const { data: sd, info: si } = await sharp(fp)
    .resize({ width: 120 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const saturation = avgSaturation(sd, si.channels);

  const footerPass   = footerLum < 80;
  const contrastPass = contrastRange > 100;
  const satPass      = saturation >= 0.15 && saturation <= 0.85;
  const verdict      = footerPass && contrastPass && satPass ? "PASS" : "FAIL";

  return { filename, footerLum, contrastRange, saturation, footerPass, contrastPass, satPass, verdict };
}

// ── Sorting ───────────────────────────────────────────────────────────────────

const TEMPLATE_ORDER = [
  "parchment-classic",
  "made-fresh",
  "neighborhood-pro",
  "at-your-service",
  "health-wellness",
];
const PALETTE_ORDER = [
  "cool-shift",
  "warm-deepen",
  "rich-dark",
  "fresh-light",
  "complementary",
  "muted-mono",
];

function sortKey(filename: string): string {
  const base = filename.replace(/\.png$/, "");
  const variant = base.endsWith("_flipped") ? "b" : "a";
  // Strip variant suffix to find template+palette
  const stem = base.replace(/_(?:normal|flipped)$/, "");

  let tIdx = 99, pIdx = 99;
  for (let i = 0; i < TEMPLATE_ORDER.length; i++) {
    if (stem.startsWith(TEMPLATE_ORDER[i]! + "_")) {
      tIdx = i;
      const palettePart = stem.slice(TEMPLATE_ORDER[i]!.length + 1);
      pIdx = PALETTE_ORDER.indexOf(palettePart);
      break;
    }
  }
  return `${String(tIdx).padStart(2, "0")}_${String(pIdx).padStart(2, "0")}_${variant}`;
}

// ── Table formatting ──────────────────────────────────────────────────────────

function pad(s: string, n: number) { return s.padEnd(n); }
function rpad(s: string, n: number) { return s.padStart(n); }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const files = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.endsWith(".png"))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  if (files.length === 0) {
    console.error("No PNG files found in test-output/. Run test:transforms first.");
    process.exit(1);
  }

  console.log(`\nAnalyzing ${files.length} images...\n`);

  const results: Result[] = [];
  for (const f of files) {
    const r = await analyze(f);
    results.push(r);
    process.stdout.write(".");
  }
  console.log("\n");

  // ── Table ─────────────────────────────────────────────────────────────────
  const COL = {
    filename:       52,
    footerLum:       9,
    contrastRange:  14,
    saturation:     10,
    verdict:         7,
  };

  const header =
    pad("filename",       COL.filename)  + " | " +
    pad("footer_lum",     COL.footerLum) + " | " +
    pad("contrast_range", COL.contrastRange) + " | " +
    pad("saturation",     COL.saturation) + " | " +
    "verdict";

  const divider = "-".repeat(header.length);
  console.log(header);
  console.log(divider);

  for (const r of results) {
    const footerStr   = rpad(r.footerLum.toFixed(1), COL.footerLum)  + (r.footerPass   ? " " : "✗");
    const contrastStr = rpad(r.contrastRange.toFixed(1), COL.contrastRange) + (r.contrastPass ? " " : "✗");
    const satStr      = rpad(r.saturation.toFixed(3), COL.saturation) + (r.satPass      ? " " : "✗");
    console.log(
      pad(r.filename,    COL.filename) + " | " +
      footerStr.padEnd(COL.footerLum + 1) + " | " +
      contrastStr.padEnd(COL.contrastRange + 1) + " | " +
      satStr.padEnd(COL.saturation + 1) + " | " +
      r.verdict
    );
  }

  console.log(divider);

  // ── Summary ───────────────────────────────────────────────────────────────
  const passes = results.filter(r => r.verdict === "PASS");
  const fails  = results.filter(r => r.verdict === "FAIL");

  console.log(`\nSUMMARY: ${passes.length} PASS  /  ${fails.length} FAIL  /  ${results.length} total\n`);

  if (passes.length > 0) {
    console.log("PASSING filenames:");
    for (const r of passes) {
      console.log(`  ✓  ${r.filename}`);
    }
  } else {
    console.log("No images passed all three checks.");
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
