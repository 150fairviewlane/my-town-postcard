/**
 * Sample generator for QR backing card visual review.
 * Run: pnpm --filter @workspace/scripts run gen:qr-samples
 */
import sharp from "sharp";
import QRCode from "qrcode";
import jsqr from "jsqr";
import path from "path";
import { mkdirSync } from "fs";

const OUT = "/home/runner/workspace/attached_assets";
mkdirSync(OUT, { recursive: true });

// ── Must stay in sync with compositeQr.ts ─────────────────────────────────
const CARD_INSET  = 6;
const CARD_MARGIN = 1.0375;

const QR_PLACEMENT = {
  xl: { qrSize: 180, imgW: 1200, imgH: 1500 },
  l:  { qrSize: 130, imgW: 900,  imgH: 1200 },
  m:  { qrSize: 90,  imgW: 900,  imgH: 600  },
  s:  { qrSize: 90,  imgW: 600,  imgH: 600  },
} as const;

function layout(qrSize: number, imgW: number, imgH: number) {
  const cardSize = Math.round(qrSize * CARD_MARGIN);
  const qrOffset = Math.floor((cardSize - qrSize) / 2);
  const cardLeft = imgW - cardSize - CARD_INSET;
  const cardTop  = imgH - cardSize - CARD_INSET;
  return { cardSize, qrOffset, cardLeft, cardTop,
           qrAbsLeft: cardLeft + qrOffset,
           qrAbsTop:  cardTop  + qrOffset };
}
// ──────────────────────────────────────────────────────────────────────────

const STYLE = { fill: "#FFFFFF", border: "#7B1418" };
const URL   = "https://mytownpostcard.com/go/sample-ad-2026";

const BG = {
  xl: { c: [115, 72,  55 ] as const, f: [55,  25, 15 ] as const },
  l:  { c: [38,  52,  78 ] as const, f: [18,  28, 55 ] as const },
  m:  { c: [205, 190, 170] as const, f: [50,  50, 50 ] as const },
  s:  { c: [80,  108, 70 ] as const, f: [35,  55, 28 ] as const },
};

function cardSvg(sz: number): Buffer {
  return Buffer.from(
    `<svg width="${sz}" height="${sz}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="0.5" y="0.5" width="${sz-1}" height="${sz-1}" ` +
    `fill="${STYLE.fill}" stroke="${STYLE.border}" stroke-width="1"/></svg>`,
  );
}

async function makeTestImage(
  imgW: number, imgH: number,
  [cr,cg,cb]: readonly [number,number,number],
  [fr,fg,fb]: readonly [number,number,number],
): Promise<Buffer> {
  const fH = Math.round(imgH * 0.20);
  const footer = await sharp({
    create: { width: imgW, height: fH, channels: 3, background: { r: fr, g: fg, b: fb } },
  }).png().toBuffer();
  return sharp({
    create: { width: imgW, height: imgH, channels: 3, background: { r: cr, g: cg, b: cb } },
  })
    .composite([{ input: footer, top: imgH - fH, left: 0 }])
    .jpeg({ quality: 95 }).toBuffer();
}

console.log(
  "\nPhysical print dims at 300 DPI:\n" +
  "  XL 1200×1500→4\"×5\"   L 900×1200→3\"×4\"   M 900×600→3\"×2\"   S 600×600→2\"×2\"\n" +
  "  cardSize = round(qrSize × 1.15)  [DPI cancels]\n"
);
console.log("Size  qrPx  cardPx  cardIn  qrOff  cardL  cardT  qrAbsL  qrAbsT  decode  bleed");
console.log("────  ────  ──────  ──────  ─────  ─────  ─────  ──────  ──────  ──────  ─────");

let pass = 0, fail = 0;

for (const [sz, spec] of Object.entries(QR_PLACEMENT) as [keyof typeof QR_PLACEMENT, typeof QR_PLACEMENT[keyof typeof QR_PLACEMENT]][]) {
  const L = layout(spec.qrSize, spec.imgW, spec.imgH);
  const bg = BG[sz];

  const bgBuf  = await makeTestImage(spec.imgW, spec.imgH, bg.c, bg.f);
  const qrPng  = await QRCode.toBuffer(URL, {
    errorCorrectionLevel: "H", type: "png",
    width: spec.qrSize, margin: 4,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const cardBase   = await sharp(cardSvg(L.cardSize)).png().toBuffer();
  const cardWithQr = await sharp(cardBase)
    .composite([{ input: qrPng, left: L.qrOffset, top: L.qrOffset }])
    .png().toBuffer();
  const composite = await sharp(bgBuf)
    .composite([{ input: cardWithQr, left: L.cardLeft, top: L.cardTop }])
    .jpeg({ quality: 98, chromaSubsampling: "4:4:4" }).toBuffer();

  // Decode verify
  const { data: px, info } = await sharp(composite)
    .extract({ left: L.qrAbsLeft, top: L.qrAbsTop, width: spec.qrSize, height: spec.qrSize })
    .raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const decoded = jsqr(new Uint8ClampedArray(px), info.width, info.height);
  const ok = decoded?.data === URL;
  ok ? pass++ : fail++;

  // Bleed check: strip above card top
  const checkH = Math.min(20, L.cardTop);
  let bleedStr = "—";
  if (checkH > 0) {
    const strip = await sharp(composite)
      .extract({ left: L.cardLeft, top: L.cardTop - checkH, width: L.cardSize, height: checkH })
      .removeAlpha().raw().toBuffer();
    let s = 0; for (let i = 0; i < strip.length; i++) s += strip[i]!;
    const avg = s / strip.length;
    bleedStr = avg > 220 ? `⚠${avg.toFixed(0)}` : `ok(${avg.toFixed(0)})`;
  }

  await sharp(composite).toFile(path.join(OUT, `qr-c-${sz}.jpg`));
  const cardIn = (L.cardSize / 300).toFixed(2);
  console.log(
    `${sz.padEnd(4)}  ${String(spec.qrSize).padEnd(4)}  ${String(L.cardSize).padEnd(6)}  ${cardIn}"  ` +
    `${String(L.qrOffset).padEnd(5)}  ${String(L.cardLeft).padEnd(5)}  ${String(L.cardTop).padEnd(5)}  ` +
    `${String(L.qrAbsLeft).padEnd(6)}  ${String(L.qrAbsTop).padEnd(6)}  ${ok ? "✅" : "❌"}      ${bleedStr}`,
  );
}

console.log(`\nResult: ${pass}/4 PASS${fail ? `  ⛔ ${fail} FAIL` : "  ✅ all clear"}`);
if (fail > 0) process.exit(1);
