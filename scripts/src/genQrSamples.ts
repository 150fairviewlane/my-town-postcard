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

const CARD_INSET = 6;
const PAD        = 4;
const TRACKING_URL = "https://mytownpostcard.com/go/sample-ad-2026";

const SPECS = {
  xl: { qrSize: 180, imgW: 1200, imgH: 1500 },
  l:  { qrSize: 130, imgW: 900,  imgH: 1200 },
  m:  { qrSize: 90,  imgW: 900,  imgH: 600  },
  s:  { qrSize: 90,  imgW: 600,  imgH: 600  },
} as const;

type SizeKey = keyof typeof SPECS;

const STYLES: Record<string, { fill: string; border: string }> = {
  "white-burgundy": { fill: "#FFFFFF", border: "#7B1418" },
  "cream-burgundy": { fill: "#FFF8F0", border: "#7B1418" },
  "white-gray":     { fill: "#FFFFFF", border: "#CCCCCC" },
};

const BG: Record<SizeKey, { r: number; g: number; b: number }> = {
  xl: { r: 115, g: 72,  b: 55  },
  l:  { r: 38,  g: 52,  b: 78  },
  m:  { r: 205, g: 190, b: 170 },
  s:  { r: 80,  g: 108, b: 70  },
};

function layout(qrSize: number, imgW: number, imgH: number) {
  const cardW = qrSize + PAD * 2;
  const cardH = qrSize + PAD * 2;
  return {
    cardW, cardH,
    cardLeft:  imgW - cardW - CARD_INSET,
    cardTop:   imgH - cardH - CARD_INSET,
    qrAbsLeft: imgW - cardW - CARD_INSET + PAD,
    qrAbsTop:  imgH - cardH - CARD_INSET + PAD,
  };
}

function cardSvg(cardW: number, cardH: number, style: { fill: string; border: string }): Buffer {
  return Buffer.from(
    `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="0.5" y="0.5" width="${cardW - 1}" height="${cardH - 1}" ` +
    `fill="${style.fill}" stroke="${style.border}" stroke-width="1"/>` +
    `</svg>`,
  );
}

let pass = 0, fail = 0;

for (const [sizeKey, spec] of Object.entries(SPECS) as [SizeKey, typeof SPECS[SizeKey]][]) {
  const L  = layout(spec.qrSize, spec.imgW, spec.imgH);
  const bg = BG[sizeKey];

  const stylesToRun = sizeKey === "xl"
    ? Object.entries(STYLES)
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

    const cardBase   = await sharp(cardSvg(L.cardW, L.cardH, style)).png().toBuffer();
    const cardWithQr = await sharp(cardBase)
      .composite([{ input: qrPng, left: PAD, top: PAD }])
      .png().toBuffer();

    const composite = await sharp(bgBuf)
      .composite([{ input: cardWithQr, left: L.cardLeft, top: L.cardTop }])
      .jpeg({ quality: 98, chromaSubsampling: "4:4:4" }).toBuffer();

    const { data: px, info } = await sharp(composite)
      .extract({ left: L.qrAbsLeft, top: L.qrAbsTop, width: spec.qrSize, height: spec.qrSize })
      .raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    const decoded = jsqr(new Uint8ClampedArray(px), info.width, info.height);
    const ok = decoded?.data === TRACKING_URL;
    ok ? pass++ : fail++;

    const fname = path.join(OUT, `sample-${sizeKey}-${styleName}.jpg`);
    await sharp(composite).toFile(fname);
    console.log(`${ok ? "✅" : "❌"} ${path.basename(fname)}  decode=${ok ? "PASS" : "FAIL"}`);
  }
}

console.log(`\nDecode verify total: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
