/**
 * One-shot sample generator for QR backing card visual review.
 * Run: pnpm --filter @workspace/scripts run gen:qr-samples
 */
import sharp from "sharp";
import QRCode from "qrcode";
import jsqr from "jsqr";
import { mkdirSync } from "fs";
import path from "path";

const OUT = path.resolve("./samples-qr");
mkdirSync(OUT, { recursive: true });

const CARD_INSET = 8;
const TRACKING_URL = "https://mytownpostcard.com/go/sample-ad-2026";

const SPECS = {
  xl: { qrSize: 180, imgW: 1200, imgH: 1500 },
  l:  { qrSize: 130, imgW: 900,  imgH: 1200 },
  m:  { qrSize: 90,  imgW: 900,  imgH: 600  },
  s:  { qrSize: 90,  imgW: 600,  imgH: 600  },
} as const;

type SizeKey = keyof typeof SPECS;

const STYLES = {
  "white-burgundy": { fill: "#FFFFFF", border: "#7B1418", labelColor: "#7B1418" },
  "cream-burgundy": { fill: "#FFF8F0", border: "#7B1418", labelColor: "#7B1418" },
  "white-gray":     { fill: "#FFFFFF", border: "#CCCCCC", labelColor: "#555555" },
};

type StyleKey = keyof typeof STYLES;

// Representative ad background colours — varied tones so we see contrast
const BG: Record<SizeKey, { r: number; g: number; b: number }> = {
  xl: { r: 115, g: 72,  b: 55  },  // warm rust mid-tone
  l:  { r: 38,  g: 52,  b: 78  },  // dark navy
  m:  { r: 205, g: 190, b: 170 },  // light warm cream
  s:  { r: 80,  g: 108, b: 70  },  // forest green
};

function computeLayout(qrSize: number, imgW: number, imgH: number) {
  const sidePad   = Math.max(12, Math.round(qrSize * 0.16));
  const topPad    = Math.max(18, Math.round(qrSize * 0.22));
  const bottomPad = sidePad;
  const cardW     = qrSize + 2 * sidePad;
  const cardH     = qrSize + topPad + bottomPad;
  const cardLeft  = imgW - cardW - CARD_INSET;
  const cardTop   = imgH - cardH - CARD_INSET;
  return {
    sidePad, topPad, cardW, cardH, cardLeft, cardTop,
    qrAbsLeft: cardLeft + sidePad,
    qrAbsTop:  cardTop  + topPad,
    fontSize:  Math.max(10, Math.round(qrSize * 0.11)),
    labelCY:   topPad / 2,
  };
}

function cardSvg(
  cardW: number, cardH: number,
  fontSize: number, labelCY: number,
  style: { fill: string; border: string; labelColor: string },
): Buffer {
  const ls = Math.max(1, Math.round(fontSize * 0.18));
  return Buffer.from(
    `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="0.5" y="0.5" width="${cardW - 1}" height="${cardH - 1}"` +
    ` fill="${style.fill}" stroke="${style.border}" stroke-width="1"/>` +
    `<text x="${cardW / 2}" y="${labelCY}"` +
    ` text-anchor="middle" dominant-baseline="central"` +
    ` font-family="Arial,Helvetica,sans-serif"` +
    ` font-size="${fontSize}" font-weight="700"` +
    ` letter-spacing="${ls}" fill="${style.labelColor}">SCAN ME</text>` +
    `</svg>`,
  );
}

let pass = 0, fail = 0;

for (const [sizeKey, spec] of Object.entries(SPECS) as [SizeKey, typeof SPECS[SizeKey]][]) {
  const L  = computeLayout(spec.qrSize, spec.imgW, spec.imgH);
  const bg = BG[sizeKey];

  // XL shows all 3 style variants; other sizes show only the default
  const stylesToRun: [StyleKey, typeof STYLES[StyleKey]][] =
    sizeKey === "xl"
      ? (Object.entries(STYLES) as [StyleKey, typeof STYLES[StyleKey]][])
      : [["white-burgundy", STYLES["white-burgundy"]]];

  for (const [styleName, style] of stylesToRun) {
    const bgBuf = await sharp({
      create: { width: spec.imgW, height: spec.imgH, channels: 3, background: bg },
    }).jpeg({ quality: 95 }).toBuffer();

    const qrPng = await QRCode.toBuffer(TRACKING_URL, {
      errorCorrectionLevel: "H", type: "png",
      width: spec.qrSize, margin: 4,
      color: { dark: "#000000", light: "#ffffff" },
    });

    const cardBase   = await sharp(cardSvg(L.cardW, L.cardH, L.fontSize, L.labelCY, style)).png().toBuffer();
    const cardWithQr = await sharp(cardBase)
      .composite([{ input: qrPng, left: L.sidePad, top: L.topPad }])
      .png().toBuffer();

    const composite = await sharp(bgBuf)
      .composite([{ input: cardWithQr, left: L.cardLeft, top: L.cardTop }])
      .jpeg({ quality: 98, chromaSubsampling: "4:4:4" }).toBuffer();

    // Decode-verify (exact region)
    const { data: px, info } = await sharp(composite)
      .extract({ left: L.qrAbsLeft, top: L.qrAbsTop, width: spec.qrSize, height: spec.qrSize })
      .raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    const decoded = jsqr(new Uint8ClampedArray(px), info.width, info.height);
    const ok = decoded?.data === TRACKING_URL;
    ok ? pass++ : fail++;

    const fname = path.join(OUT, `sample-${sizeKey}-${styleName}.jpg`);
    await sharp(composite).toFile(fname);

    const note = sizeKey === "s"
      ? `  ← S: card=${L.cardW}×${L.cardH} topPad=${L.topPad}px labelFont=${L.fontSize}px`
      : "";
    console.log(`${ok ? "✅" : "❌"} ${path.basename(fname)}  decode=${ok ? "PASS" : "FAIL"}${note}`);
  }
}

console.log(`\nDecode verify total: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
