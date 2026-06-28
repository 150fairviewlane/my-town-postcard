/**
 * testNeighborhoodProFooter.ts — pilot verification for the neighborhood-pro programmatic footer.
 *
 * Creates a synthetic "Grok output" (dark green art body + lighter green footer zone that
 * simulates what Grok would have drawn) for each size tier, then runs buildNpFooterStack
 * through the full pipeline.
 *
 * Saves raw Grok-like inputs AND final outputs to /tmp/ for side-by-side visual comparison.
 *
 * Run: tsx src/scripts/testNeighborhoodProFooter.ts
 */

import sharp from "sharp";
import path  from "path";
import fs    from "fs";
import { buildNpFooterStack, NP_FOOTER_H } from "../lib/neighborhoodProFooter.js";
import type { SizeKey } from "../lib/neighborhoodProFooter.js";

const OUT          = "/tmp";
const TRACKING_URL = "https://mytownpostcard.com/go/green-leaf-lawn-spring2026";
const PHONE        = "(706) 555-0198";
const ADDRESS      = "123 Main St, Clarkesville GA";

const DIMS: Record<SizeKey, { w: number; h: number }> = {
  xl: { w: 1200, h: 1500 },
  l:  { w: 900,  h: 1200 },
  m:  { w: 900,  h: 600  },
  s:  { w: 600,  h: 600  },
};

/** Simulate what Grok actually outputs: forest-green body with design elements + a
 *  slightly-different-green footer zone (the part we will discard and replace). */
async function makeSyntheticGrokOutput(sk: SizeKey): Promise<Buffer> {
  const { w, h } = DIMS[sk];
  const footerH   = NP_FOOTER_H[sk];
  const artH      = h - footerH;

  const limeH      = Math.round(artH * 0.12);
  const splashW    = Math.round(w * 0.45);
  const splashH    = Math.round(artH * 0.22);

  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: 29, g: 58, b: 35 } },
  })
    .composite([
      {
        input: await sharp({
          create: { width: w, height: limeH, channels: 3,
                    background: { r: 90, g: 184, b: 76 } },
        }).png().toBuffer(),
        left: 0, top: Math.round(artH * 0.55),
      },
      {
        input: await sharp({
          create: { width: splashW, height: splashH, channels: 3,
                    background: { r: 255, g: 255, b: 255 } },
        }).png().toBuffer(),
        left: 0, top: Math.round(artH * 0.04),
      },
      {
        input: await sharp({
          create: { width: w, height: footerH, channels: 3,
                    background: { r: 38, g: 74, b: 45 } },
        }).png().toBuffer(),
        left: 0, top: artH,
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function main() {
  console.log("Neighborhood Pro Footer Pilot — test script");
  console.log("===========================================\n");

  const sizeKeys: SizeKey[] = ["xl", "l", "m", "s"];
  let allOk = true;

  for (const sk of sizeKeys) {
    const { w, h } = DIMS[sk];
    const footerH  = NP_FOOTER_H[sk];
    console.log(`── ${sk.toUpperCase()}  ${w}×${h}  (footer ${footerH}px, art ${h - footerH}px) ──`);

    const synth    = await makeSyntheticGrokOutput(sk);
    const rawPath  = path.join(OUT, `np_raw_${sk}.jpg`);
    fs.writeFileSync(rawPath, synth);
    console.log(`  Synthetic input : ${rawPath}  (${synth.length.toLocaleString()} bytes)`);

    const dataUrl  = await buildNpFooterStack(synth, sk, PHONE, ADDRESS, TRACKING_URL);
    const finalBuf = Buffer.from(dataUrl.split(",")[1] ?? "", "base64");
    const outPath  = path.join(OUT, `np_footer_${sk}.jpg`);
    fs.writeFileSync(outPath, finalBuf);
    console.log(`  Final output    : ${outPath}  (${finalBuf.length.toLocaleString()} bytes)`);

    const meta = await sharp(finalBuf).metadata();
    const ok   = meta.width === w && meta.height === h;
    if (!ok) allOk = false;
    console.log(`  Dimensions      : ${meta.width}×${meta.height}  →  ${ok ? "✅ match" : `❌ MISMATCH — expected ${w}×${h}`}\n`);
  }

  if (allOk) {
    console.log("✅ All size tiers passed dimension check.");
  } else {
    console.error("❌ One or more tiers have wrong dimensions — check the log above.");
    process.exit(1);
  }

  console.log("\nVisually inspect:");
  for (const sk of sizeKeys) {
    console.log(`  /tmp/np_raw_${sk}.jpg   ← synthetic Grok output (before)`);
    console.log(`  /tmp/np_footer_${sk}.jpg ← with real footer (after)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
