/**
 * inspect-corner-crops.ts
 *
 * Extracts the bottom-right 500×500 corner region from every /tmp/grok-raw-*.jpg
 * and saves it alongside the original for visual inspection.
 *
 * Also runs a targeted bleed measurement that only looks at the rightmost
 * 50% of image width (right 600px of 1200px) — this eliminates footer text/
 * phone numbers on the left side and isolates the starburst/corner element.
 *
 * Run: pnpm --filter @workspace/scripts run inspect:corners
 */

import sharp from "sharp";
import { readdir, writeFile } from "fs/promises";

const INSPECT_PX  = 500;   // corner crop square size
const DELTA       = 50;    // pixel brightness vs background threshold
// Only search for starburst in right 50% of image width
const RIGHT_FRACTION = 0.50;

async function main() {
  const files = (await readdir("/tmp"))
    .filter(f => f.startsWith("grok-raw-") && f.endsWith(".jpg"))
    .sort();

  if (!files.length) { console.error("No /tmp/grok-raw-*.jpg files found."); process.exit(1); }

  console.log(`\nAnalyzing ${files.length} raw images — corner-only bleed (right ${RIGHT_FRACTION*100}% of width):\n`);
  console.log("File".padEnd(42), "BG".padEnd(14), "MaxBleed".padEnd(12), "ForeignPx");
  console.log("-".repeat(85));

  const med = (arr: number[]) => { const s = [...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]!; };
  const dist2d = (x: number, y: number) => Math.sqrt(x*x + y*y);

  const results: number[] = [];

  for (const f of files) {
    const buf = await sharp(`/tmp/${f}`).toBuffer();
    const meta = await sharp(buf).metadata();
    const imgW = meta.width!, imgH = meta.height!;

    // Save corner crop
    const cropLeft = Math.max(0, imgW - INSPECT_PX);
    const cropTop  = Math.max(0, imgH - INSPECT_PX);
    const cropBuf  = await sharp(buf)
      .extract({ left: cropLeft, top: cropTop, width: imgW-cropLeft, height: imgH-cropTop })
      .jpeg({ quality: 90 })
      .toBuffer();
    await writeFile(`/tmp/corner-${f}`, cropBuf);

    // Sample background from bottom-LEFT strip (left 25% of width, bottom 80px)
    const stripW = Math.floor(imgW * 0.20);
    const stripH = 80;
    const { data: strip } = await sharp(buf)
      .extract({ left: 0, top: imgH - stripH, width: stripW, height: stripH })
      .raw().toBuffer({ resolveWithObject: true });
    const Rs: number[] = [], Gs: number[] = [], Bs: number[] = [];
    for (let i = 0; i < strip.length; i += 3) { Rs.push(strip[i]!); Gs.push(strip[i+1]!); Bs.push(strip[i+2]!); }
    const bg: [number,number,number] = [med(Rs), med(Gs), med(Bs)];

    // Targeted measurement: RIGHT 50% of image width, BOTTOM 40% of height.
    // This region contains only the starburst/corner element, not footer text.
    const zLeft = Math.floor(imgW * (1 - RIGHT_FRACTION));
    const zTop  = Math.floor(imgH * 0.60);
    const zW    = imgW - zLeft;
    const zH    = imgH - zTop;

    const { data: zone, info } = await sharp(buf)
      .extract({ left: zLeft, top: zTop, width: zW, height: zH })
      .raw().toBuffer({ resolveWithObject: true });

    const ch = info.channels as 3|4;
    let maxBleed = 0;
    let foreignPx = 0;

    for (let row = 0; row < zH; row++) {
      for (let col = 0; col < zW; col++) {
        const idx = (row * zW + col) * ch;
        const r = zone[idx]!, g = zone[idx+1]!, b = zone[idx+2]!;
        const d = Math.sqrt((r-bg[0])**2 + (g-bg[1])**2 + (b-bg[2])**2);
        if (d > DELTA) {
          // Distance from image corner (imgW-1, imgH-1)
          const absX = zLeft + col, absY = zTop + row;
          const bleed = dist2d(imgW-1-absX, imgH-1-absY);
          if (bleed > maxBleed) maxBleed = bleed;
          foreignPx++;
        }
      }
    }

    const mb = Math.round(maxBleed);
    results.push(mb);
    console.log(f.padEnd(42), `(${bg.join(",")})`.padEnd(14), String(mb).padEnd(12), foreignPx);
  }

  const globalMax = Math.max(...results);
  console.log("-".repeat(85));
  console.log(`\n▶ WORST-CASE BLEED (right-half zone only): ${globalMax} px from corner`);
  console.log(`▶ Glow disc radius (XL):                   374 px`);
  console.log(`▶ Bleed beyond glow disc:                  ${Math.max(0, globalMax - 374)} px`);
  console.log(`▶ RECOMMENDED ERASE_ZONE (+ 60px margin):  ${globalMax + 60} px`);
  console.log(`  XL image: erase last ${globalMax+60} × ${globalMax+60} px of bottom-right corner\n`);
}
main().catch(e => { console.error(e); process.exit(1); });
