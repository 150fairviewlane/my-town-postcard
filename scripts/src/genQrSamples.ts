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

const CARD_INSET   = 6;
const PAD          = 4;
const FOOTER_COVER = 0.20;
const URL          = "https://mytownpostcard.com/go/sample-ad-2026";

const SPECS: Record<string, { qrSize: number; imgW: number; imgH: number }> = {
  xl: { qrSize: 180, imgW: 1200, imgH: 1500 },
  l:  { qrSize: 130, imgW: 900,  imgH: 1200 },
  m:  { qrSize: 90,  imgW: 900,  imgH: 600  },
  s:  { qrSize: 90,  imgW: 600,  imgH: 600  },
};

// Contrasting backgrounds so the card + footer zone are clearly visible
const BG: Record<string, { r: number; g: number; b: number; footerR: number; footerG: number; footerB: number }> = {
  xl: { r: 115, g: 72,  b: 55,  footerR: 60,  footerG: 30,  footerB: 20  },  // warm rust + dark footer
  l:  { r: 38,  g: 52,  b: 78,  footerR: 20,  footerG: 30,  footerB: 55  },  // dark navy
  m:  { r: 205, g: 190, b: 170, footerR: 50,  footerG: 50,  footerB: 50  },  // cream + dark footer
  s:  { r: 80,  g: 108, b: 70,  footerR: 40,  footerG: 60,  footerB: 35  },  // forest green
};

const STYLE = { fill: "#FFFFFF", border: "#7B1418" };

function layout(qrSize: number, imgW: number, imgH: number) {
  const cardW  = qrSize + PAD * 2;
  const cardH  = Math.max(qrSize + PAD * 2, Math.round(imgH * FOOTER_COVER));
  const cardLeft = imgW - cardW - CARD_INSET;
  const cardTop  = imgH - cardH - CARD_INSET;
  const qrLeft   = PAD;
  const qrTop    = cardH - qrSize - PAD;        // bottom-anchored
  return { cardW, cardH, cardLeft, cardTop, qrLeft, qrTop,
           qrAbsLeft: cardLeft + qrLeft,
           qrAbsTop:  cardTop  + qrTop };
}

function cardSvg(cardW: number, cardH: number): Buffer {
  return Buffer.from(
    `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="0.5" y="0.5" width="${cardW - 1}" height="${cardH - 1}" ` +
    `fill="${STYLE.fill}" stroke="${STYLE.border}" stroke-width="1"/>` +
    `</svg>`,
  );
}

// Draw a realistic dark footer bar so the card-vs-footer alignment is legible
async function makeTestImage(imgW: number, imgH: number, bg: typeof BG["xl"]): Promise<Buffer> {
  const footerH = Math.round(imgH * FOOTER_COVER);
  // content area
  const content = await sharp({
    create: { width: imgW, height: imgH - footerH, channels: 3,
              background: { r: bg.r, g: bg.g, b: bg.b } },
  }).png().toBuffer();
  // footer bar
  const footer = await sharp({
    create: { width: imgW, height: footerH, channels: 3,
              background: { r: bg.footerR, g: bg.footerG, b: bg.footerB } },
  }).png().toBuffer();
  return sharp({
    create: { width: imgW, height: imgH, channels: 3,
              background: { r: bg.r, g: bg.g, b: bg.b } },
  })
    .composite([
      { input: content, top: 0,           left: 0 },
      { input: footer,  top: imgH - footerH, left: 0 },
    ])
    .jpeg({ quality: 95 }).toBuffer();
}

let pass = 0, fail = 0;
console.log("Size  cardW  cardH  qrLeft  qrTop(in-card)  qrAbsTop  decode");
console.log("────  ─────  ─────  ──────  ─────────────   ────────  ──────");

for (const [sz, spec] of Object.entries(SPECS)) {
  const L  = layout(spec.qrSize, spec.imgW, spec.imgH);
  const bg = BG[sz];

  const bgBuf = await makeTestImage(spec.imgW, spec.imgH, bg);
  const qrPng = await QRCode.toBuffer(URL, {
    errorCorrectionLevel: "H", type: "png",
    width: spec.qrSize, margin: 4,
    color: { dark: "#000000", light: "#ffffff" },
  });

  const cardBase   = await sharp(cardSvg(L.cardW, L.cardH)).png().toBuffer();
  const cardWithQr = await sharp(cardBase)
    .composite([{ input: qrPng, left: L.qrLeft, top: L.qrTop }])
    .png().toBuffer();

  const composite = await sharp(bgBuf)
    .composite([{ input: cardWithQr, left: L.cardLeft, top: L.cardTop }])
    .jpeg({ quality: 98, chromaSubsampling: "4:4:4" }).toBuffer();

  // Decode verify — exact QR region only
  const { data: px, info } = await sharp(composite)
    .extract({ left: L.qrAbsLeft, top: L.qrAbsTop, width: spec.qrSize, height: spec.qrSize })
    .raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const decoded = jsqr(new Uint8ClampedArray(px), info.width, info.height);
  const ok = decoded?.data === URL;
  ok ? pass++ : fail++;

  const fname = path.join(OUT, `qr-b-${sz}.jpg`);
  await sharp(composite).toFile(fname);

  console.log(
    `${sz.padEnd(4)}  ${String(L.cardW).padEnd(5)}  ${String(L.cardH).padEnd(5)}  ` +
    `${String(L.qrLeft).padEnd(6)}  ${String(L.qrTop).padEnd(15)} ` +
    `${String(L.qrAbsTop).padEnd(8)}  ${ok ? "✅ PASS" : "❌ FAIL"}`,
  );
}

console.log(`\nTotal: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
