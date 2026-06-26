/**
 * Measures Grok's drawn QR-placeholder position in saved pre-composite images.
 * Run AFTER generating test ads with the server in dev mode (NODE_ENV != production).
 *
 * Pre-composite images are saved to /tmp/grok-raw-{timestamp}-{sizeKey}.jpg
 * by cropAndQr in adGenGrok.ts.
 *
 * Approach:
 *   1. For each saved image, crop the bottom-30% × right-25% corner (footer QR zone).
 *   2. Sample the left-most strip of that crop to get the "true footer background" brightness.
 *   3. Find any pixels brighter than (footerAvg + BRIGHT_DELTA) — these are Grok's
 *      placeholder if it drew a lighter square, or nothing if it matched the footer color.
 *   4. Report the bounding box distance from the true image edges and compare against
 *      our composited card's expected position (CARD_INSET = 6 px from each edge).
 *
 * Run: pnpm --filter @workspace/scripts run measure:qr
 */
import sharp from "sharp";
import { readdir } from "fs/promises";
import path from "path";

// ── Must stay in sync with compositeQr.ts ────────────────────────────────
const CARD_INSET  = 6;
const CARD_MARGIN = 1.0375;

const QR = {
  xl: { qrSize: 180, imgW: 1200, imgH: 1500 },
  l:  { qrSize: 130, imgW: 900,  imgH: 1200 },
  m:  { qrSize: 90,  imgW: 900,  imgH: 600  },
  s:  { qrSize: 90,  imgW: 600,  imgH: 600  },
} as const;
// ─────────────────────────────────────────────────────────────────────────

/** How many brightness points above footer average before a pixel is "bright". */
const BRIGHT_DELTA = 40;

function getCardBounds(sizeKey: string) {
  const spec = QR[sizeKey.toLowerCase() as keyof typeof QR] ?? QR.xl;
  const cardSize = Math.round(spec.qrSize * CARD_MARGIN);
  return {
    cardSize,
    cardLeft:  spec.imgW - cardSize - CARD_INSET,
    cardTop:   spec.imgH - cardSize - CARD_INSET,
    cardRight: spec.imgW - CARD_INSET - 1,     // rightmost pixel of card
    cardBottom: spec.imgH - CARD_INSET - 1,    // bottommost pixel of card
    imgW: spec.imgW,
    imgH: spec.imgH,
  };
}

async function measure(imgPath: string, sizeKey: string) {
  const card = getCardBounds(sizeKey);
  const { imgW, imgH } = card;

  // Scan region: bottom 30% × right 30%
  const scanH = Math.round(imgH * 0.30);
  const scanW = Math.round(imgW * 0.30);
  const scanTop  = imgH - scanH;
  const scanLeft = imgW - scanW;

  let rawBuf: Buffer;
  try {
    const { data, info } = await sharp(imgPath)
      .extract({ left: scanLeft, top: scanTop, width: scanW, height: scanH })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    rawBuf = data as Buffer;
    const ch = info.channels; // 3 = RGB

    // Average brightness of the LEFT 25% of the scan strip — "safe" footer area
    // (phone/address text side, no placeholder).
    const safeW = Math.round(scanW * 0.25);
    let sumSafe = 0, nSafe = 0;
    for (let r = 0; r < scanH; r++) {
      for (let c = 0; c < safeW; c++) {
        const i = (r * scanW + c) * ch;
        sumSafe += ((rawBuf[i]! + rawBuf[i+1]! + rawBuf[i+2]!) / 3);
        nSafe++;
      }
    }
    const footerAvg = sumSafe / nSafe;
    const threshold = footerAvg + BRIGHT_DELTA;

    // Bounding box of pixels brighter than threshold
    let minR = scanH, maxR = -1, minC = scanW, maxC = -1;
    for (let r = 0; r < scanH; r++) {
      for (let c = 0; c < scanW; c++) {
        const i = (r * scanW + c) * ch;
        const b = (rawBuf[i]! + rawBuf[i+1]! + rawBuf[i+2]!) / 3;
        if (b > threshold) {
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
        }
      }
    }

    if (maxR === -1) {
      return {
        found: false,
        footerAvg: footerAvg.toFixed(0),
        threshold: threshold.toFixed(0),
      };
    }

    // Absolute positions in full image
    const absTop    = scanTop  + minR;
    const absLeft   = scanLeft + minC;
    const absBottom = scanTop  + maxR;
    const absRight  = scanLeft + maxC;

    return {
      found: true,
      gapRight:  imgW - absRight  - 1,   // px from right edge of bright region to image right
      gapBottom: imgH - absBottom - 1,   // px from bottom edge of bright region to image bottom
      topOverhang:  card.cardTop  - absTop,  // > 0 = bleeds above our card
      leftOverhang: card.cardLeft - absLeft, // > 0 = bleeds left of our card
      absLeft, absTop, absRight, absBottom,
      expectedGapRight:  CARD_INSET,
      expectedGapBottom: CARD_INSET,
      footerAvg: footerAvg.toFixed(0),
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
const files = await readdir("/tmp");
const rawFiles = files
  .filter(f => f.startsWith("grok-raw-") && f.endsWith(".jpg"))
  .sort()
  .slice(-8); // last 8 to avoid measuring stale ones

if (rawFiles.length === 0) {
  console.log("No pre-composite images found in /tmp/grok-raw-*.jpg");
  console.log("Generate test ads first (server must be running in dev mode).");
  process.exit(0);
}

console.log(`\nMeasuring Grok QR placeholder position in ${rawFiles.length} pre-composite image(s)`);
console.log(`Expected flush position: gapRight=${CARD_INSET}px, gapBottom=${CARD_INSET}px\n`);

console.log(
  "File".padEnd(42) + "Sz   gapR  gapB  ovhL  ovhT  footerAvg  verdict"
);
console.log("─".repeat(90));

let totalFound = 0, totalFlush = 0;

for (const f of rawFiles) {
  const sizeMatch = f.match(/grok-raw-\d+-(\w+)\.jpg/);
  const sizeKey = sizeMatch?.[1] ?? "xl";
  const result  = await measure(path.join("/tmp", f), sizeKey);

  const label = f.length > 41 ? f.slice(-41) : f;

  if ("error" in result) {
    console.log(`${label.padEnd(42)} ERROR: ${result.error}`);
    continue;
  }

  if (!result.found) {
    console.log(
      `${label.padEnd(42)}${sizeKey.padEnd(4)} —     —     —     —     avg=${result.footerAvg}   ` +
      `✅ no bright region (placeholder matches footer color)`,
    );
    totalFlush++;
    continue;
  }

  totalFound++;
  const r = result as Exclude<typeof result, { found: false } | { error: string }>;
  const flushR = r.gapRight  <= CARD_INSET + 4;
  const flushB = r.gapBottom <= CARD_INSET + 4;
  const flush  = flushR && flushB;
  if (flush) totalFlush++;

  const verdict = flush
    ? "✅ flush"
    : `⚠ offset: ${r.gapRight}px from right, ${r.gapBottom}px from bottom`;

  const oh = (n: number) => n > 0 ? `+${n}` : String(n);

  console.log(
    `${label.padEnd(42)}${sizeKey.padEnd(4)} ` +
    `${String(r.gapRight).padEnd(5)} ${String(r.gapBottom).padEnd(5)} ` +
    `${oh(r.leftOverhang).padEnd(5)} ${oh(r.topOverhang).padEnd(5)} ` +
    `avg=${r.footerAvg}   ${verdict}`,
  );
}

console.log(`\nResult: ${totalFlush}/${rawFiles.length} flush or no-region-detected`);
