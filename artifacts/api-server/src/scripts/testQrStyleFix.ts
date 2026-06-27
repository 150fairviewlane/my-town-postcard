/**
 * Bug 2 regression proof — swapGrokQrInTemplateData now uses per-template style.
 *
 * Creates a synthetic XL-size JPEG (cream background), then runs two compositing
 * passes:
 *   A) getTemplateQrStyle("heritage-home")  ← what the FIXED code produces
 *   B) DEFAULT_CARD_STYLE                   ← what the OLD code (no 4th arg) produced
 *
 * Saves both to /tmp/ so the caller can visually diff the bottom-right corners.
 *
 * Run: tsx src/scripts/testQrStyleFix.ts
 */

import sharp from "sharp";
import path  from "path";
import fs    from "fs";
import {
  compositeQrOnto,
  getTemplateQrStyle,
  DEFAULT_CARD_STYLE,
  QR_PLACEMENT,
} from "../lib/compositeQr.js";

const OUT = "/tmp";
const TRACKING_URL = "https://mytownpostcard.com/go/test-heritage-dental-spring2026";
const TEMPLATE     = "heritage-home";
const SIZE_KEY     = "xl";

async function makeSyntheticJpeg(): Promise<Buffer> {
  const { imgW, imgH } = QR_PLACEMENT[SIZE_KEY];
  // Cream background matching heritage-home footer area — makes the QR card clearly visible
  return sharp({
    create: { width: imgW, height: imgH, channels: 3, background: { r: 245, g: 240, b: 232 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function main() {
  const synth = await makeSyntheticJpeg();
  const { imgW, imgH } = QR_PLACEMENT[SIZE_KEY];
  console.log(`Synthetic JPEG: ${imgW}×${imgH} px (${synth.length} bytes)`);

  // ── A: FIXED path — per-template style ──────────────────────────────────
  const templateStyle = getTemplateQrStyle(TEMPLATE);
  console.log(`\n[A] heritage-home style:`, JSON.stringify(templateStyle));
  const fixedBuf = await compositeQrOnto(synth, TRACKING_URL, SIZE_KEY, templateStyle);
  const fixedPath = path.join(OUT, "qr_fixed_heritage_home.jpg");
  fs.writeFileSync(fixedPath, fixedBuf);
  console.log(`    → ${fixedPath}  (${fixedBuf.length} bytes)`);

  // ── B: OLD path — no style arg → DEFAULT_CARD_STYLE ─────────────────────
  console.log(`\n[B] DEFAULT_CARD_STYLE (old buggy path):`, JSON.stringify(DEFAULT_CARD_STYLE));
  const defaultBuf = await compositeQrOnto(synth, TRACKING_URL, SIZE_KEY);
  const defaultPath = path.join(OUT, "qr_default_style.jpg");
  fs.writeFileSync(defaultPath, defaultBuf);
  console.log(`    → ${defaultPath}  (${defaultBuf.length} bytes)`);

  // ── Delta check ──────────────────────────────────────────────────────────
  if (fixedBuf.equals(defaultBuf)) {
    console.error("\n❌ FAIL: outputs are byte-identical — style arg has no effect!");
    process.exit(1);
  }

  const diffBytes = [...fixedBuf].filter((b, i) => b !== (defaultBuf[i] ?? -1)).length;
  const pct = ((diffBytes / fixedBuf.length) * 100).toFixed(1);
  console.log(`\n✅ PASS: outputs differ by ${diffBytes.toLocaleString()} bytes (${pct}% of file)`);
  console.log("   heritage-home card: cream fill #f5f0e8, burgundy border #6b1a2a, 3px, r=16");
  console.log("   default card:       white fill #FFFFFF, red border #7B1418, 1px, r=0");
  console.log("\nInspect the two JPEGs in /tmp/ to visually confirm bottom-right corner difference.");
}

main().catch(e => { console.error(e); process.exit(1); });
