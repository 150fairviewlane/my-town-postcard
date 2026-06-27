/**
 * measure-corner-bleed.ts
 *
 * For each /tmp/grok-raw-*.jpg saved by cropAndQr (dev mode only):
 *   1. Extract the bottom-right 600×600 region.
 *   2. Estimate the "background" color by sampling a quiet strip in the
 *      bottom-left of the same image (far from any starburst).
 *   3. Walk every pixel in the corner region and flag it as "foreign" if its
 *      Euclidean RGB distance from the background exceeds DELTA_THRESHOLD.
 *   4. For every foreign pixel, compute its distance from the image corner
 *      (bottom-right absolute pixel = (imgW-1, imgH-1)).
 *   5. Report per-image and global worst-case max bleed.
 *
 * Run: pnpm --filter @workspace/scripts run measure-corner-bleed
 */

import sharp from "sharp";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

// How different (Euclidean RGB) a pixel must be to count as "foreign".
const DELTA_THRESHOLD = 45;
// How large a corner window to inspect (px, square) — generous to catch wide starbursts.
const INSPECT_SIZE = 600;
// Strip used to sample background color: bottom STRIP_H rows, left STRIP_W cols (far from corner).
const STRIP_H = 80;
const STRIP_W = 250;

function euclidean(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

async function measureImage(filePath: string): Promise<{
  file: string;
  imgW: number;
  imgH: number;
  bgColor: [number, number, number];
  maxBleedPx: number;
  foreignPixelCount: number;
}> {
  const buf = await readFile(filePath);
  const img = sharp(buf);
  const meta = await img.metadata();
  const imgW = meta.width!;
  const imgH = meta.height!;

  // ── 1. Sample background color from bottom-left quiet strip ──────────────
  const stripW = Math.min(STRIP_W, Math.floor(imgW * 0.25));
  const stripH = Math.min(STRIP_H, Math.floor(imgH * 0.15));
  const { data: stripData } = await sharp(buf)
    .extract({ left: 0, top: imgH - stripH, width: stripW, height: stripH })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Median R, G, B across all strip pixels.
  const reds: number[] = [], greens: number[] = [], blues: number[] = [];
  for (let i = 0; i < stripData.length; i += 3) {
    reds.push(stripData[i]!);
    greens.push(stripData[i + 1]!);
    blues.push(stripData[i + 2]!);
  }
  const med = (arr: number[]) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };
  const bgColor: [number, number, number] = [med(reds), med(greens), med(blues)];

  // ── 2. Extract bottom-right inspection window ────────────────────────────
  const winW = Math.min(INSPECT_SIZE, imgW);
  const winH = Math.min(INSPECT_SIZE, imgH);
  const winLeft = imgW - winW;
  const winTop  = imgH - winH;

  const { data: winData, info } = await sharp(buf)
    .extract({ left: winLeft, top: winTop, width: winW, height: winH })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // ── 3. Find foreign pixels, measure distance from corner (imgW-1, imgH-1) ─
  let maxBleedPx = 0;
  let foreignPixelCount = 0;
  const channels = info.channels as 3 | 4;

  for (let row = 0; row < winH; row++) {
    for (let col = 0; col < winW; col++) {
      const idx = (row * winW + col) * channels;
      const px: [number, number, number] = [winData[idx]!, winData[idx + 1]!, winData[idx + 2]!];
      if (euclidean(px, bgColor) > DELTA_THRESHOLD) {
        // Absolute coordinates in the full image.
        const absX = winLeft + col;
        const absY = winTop + row;
        // Distance from bottom-right corner.
        const dx = imgW - 1 - absX;
        const dy = imgH - 1 - absY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxBleedPx) maxBleedPx = dist;
        foreignPixelCount++;
      }
    }
  }

  return {
    file: filePath.split("/").pop()!,
    imgW, imgH,
    bgColor,
    maxBleedPx: Math.round(maxBleedPx),
    foreignPixelCount,
  };
}

async function main() {
  const tmpDir = "/tmp";
  const entries = await readdir(tmpDir);
  const rawFiles = entries
    .filter(f => f.startsWith("grok-raw-") && f.endsWith(".jpg"))
    .map(f => join(tmpDir, f))
    .sort();

  if (rawFiles.length === 0) {
    console.error("No /tmp/grok-raw-*.jpg files found. Generate images first.");
    process.exit(1);
  }

  console.log(`\nMeasuring corner bleed in ${rawFiles.length} raw Grok image(s)...\n`);
  console.log(
    "File".padEnd(45),
    "Dims".padEnd(12),
    "BG (R,G,B)".padEnd(14),
    "MaxBleed(px)".padEnd(14),
    "ForeignPx",
  );
  console.log("-".repeat(110));

  const results = await Promise.all(rawFiles.map(measureImage));

  let globalMax = 0;
  for (const r of results) {
    if (r.maxBleedPx > globalMax) globalMax = r.maxBleedPx;
    console.log(
      r.file.padEnd(45),
      `${r.imgW}×${r.imgH}`.padEnd(12),
      `(${r.bgColor.join(",")})`.padEnd(14),
      String(r.maxBleedPx).padEnd(14),
      r.foreignPixelCount,
    );
  }

  console.log("-".repeat(110));
  console.log(`\n▶ GLOBAL WORST-CASE MAX BLEED: ${globalMax} px from corner`);
  console.log(`▶ RECOMMENDED ERASE_ZONE_SIZE: ${globalMax + 60} px (worst-case + 60 px safety margin)`);
  console.log(`  (For XL: imgW=1200, imgH=1500 — zone covers last ${globalMax + 60}×${globalMax + 60} px of corner)\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
