/**
 * rebuild-reference-qr-cards.ts
 *
 * For each of the 22 reference template images:
 *   1. Erases the old (oversized) QR card from the bottom-right corner.
 *   2. Composites a new QR card that is 80% the size of the old one.
 *   3. Stamps a solid magenta (#FF00FF) square exactly over the new card
 *      so the positions are always co-centred.
 *
 * Why: the previous stamp-magenta-qr-markers script used fractional cx/cy
 * position that didn't align with compositeQrOnto's CARD_INSET formula, so
 * the magenta square was smaller AND offset from the actual QR card — leaving
 * the original card peeking out around all four edges of the magenta.
 *
 * New positioning (matches compositeQr.ts):
 *   cardLeft = imgW − newCardSize − CARD_INSET
 *   cardTop  = imgH − newCardSize − CARD_INSET
 *
 * Run: pnpm --filter @workspace/scripts run rebuild:reference-qr-cards
 */

import path from "path";
import fs   from "fs";
import { fileURLToPath } from "url";
import sharp   from "sharp";
import QRCode  from "qrcode";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ASSETS     = path.resolve(__dirname, "../../attached_assets");

const CARD_INSET      = 6;
const CARD_MARGIN     = 1.0375;
const SHRINK_FACTOR   = 0.80;   // new card is 80% of old
const PLACEHOLDER_URL = "https://localspot.io";

const TEMPLATES: Array<{ file: string }> = [
  { file: "mr_biscuits_template_no_logo_1778806527327.png"          },
  { file: "made_fresh_template.png"                                  },
  { file: "6300F2D5-6BF1-403E-A40B-7203E4E26402_1778948283280.jpeg" },
  { file: "IMG_0728_1779065210873.jpeg"                              },
  { file: "healthcare_generic_template_1779141099043.png"            },
  { file: "home_services_no_text_1780946323885.png"                  },
  { file: "IMG_0832_1780946925550.png"                               },
  { file: "IMG_0836_1780951148325.png"                               },
  { file: "IMG_0839_1780955044987.png"                               },
  { file: "heritage_home_portrait.png"                               },
  { file: "image_1781029065584.png"                                  },
  { file: "parchment_classic_landscape_1779162178190.png"            },
  { file: "made_fresh_landscape_1779162178190.png"                   },
  { file: "IMG_0747_1779162178190.png"                               },
  { file: "IMG_0746_1779162178190.png"                               },
  { file: "healthcare_wellness_landscape_1779162178190.png"          },
  { file: "image_1780946327957.png"                                  },
  { file: "image_1780946917886.png"                                  },
  { file: "IMG_0837_1780951148325.png"                               },
  { file: "IMG_0838_1780955044987.png"                               },
  { file: "heritage_home_landscape.png"                              },
  { file: "image_1781029077663.png"                                  },
];

function computeQrSize(minDim: number): number {
  return Math.round(minDim * 0.15);
}

async function sampleBgColor(
  buf: Buffer,
  x: number,
  y: number,
  patchW = 20,
  patchH = 20,
): Promise<string> {
  const { data } = await sharp(buf)
    .extract({ left: x, top: y, width: patchW, height: patchH })
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const count = patchW * patchH;
  let rSum = 0, gSum = 0, bSum = 0;
  for (let i = 0; i < count; i++) {
    rSum += (data as Buffer)[i * 4]!;
    gSum += (data as Buffer)[i * 4 + 1]!;
    bSum += (data as Buffer)[i * 4 + 2]!;
  }
  const r = Math.round(rSum / count);
  const g = Math.round(gSum / count);
  const b = Math.round(bSum / count);
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
}

async function main() {
  let ok = 0, skipped = 0;

  for (const { file } of TEMPLATES) {
    const filePath = path.join(ASSETS, file);
    if (!fs.existsSync(filePath)) {
      console.error(`MISSING: ${file}`);
      skipped++;
      continue;
    }

    const srcBuf = fs.readFileSync(filePath);
    const meta   = await sharp(srcBuf).metadata();
    const imgW   = meta.width!;
    const imgH   = meta.height!;
    const minDim = Math.min(imgW, imgH);

    // ── Old card geometry (compositeQrOnto formula) ───────────────────────
    const oldQrSize   = computeQrSize(minDim);
    const oldCardSize = Math.round(oldQrSize * CARD_MARGIN);
    const oldCardLeft = imgW - oldCardSize - CARD_INSET;
    const oldCardTop  = imgH - oldCardSize - CARD_INSET;

    // ── Erase zone: old card + 8 px padding above and left ───────────────
    // Extend fully to the right and bottom edges (corner anchored).
    const eraseLeft = Math.max(0, oldCardLeft - 8);
    const eraseTop  = Math.max(0, oldCardTop  - 8);
    const eraseW    = imgW - eraseLeft;
    const eraseH    = imgH - eraseTop;

    // Sample background colour just above the erase zone (footer background)
    const sampleX = Math.max(0, Math.min(eraseLeft + 10, imgW - 21));
    const sampleY = Math.max(0, eraseTop - 25);
    const bgHex   = await sampleBgColor(srcBuf, sampleX, sampleY);

    // Erase: paint sampled colour over the old card + padding region
    const eraseSvg = Buffer.from(
      `<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="${eraseLeft}" y="${eraseTop}" width="${eraseW}" height="${eraseH}" fill="${bgHex}"/>` +
      `</svg>`
    );
    // Work entirely in PNG to avoid JPEG re-compression during intermediate steps
    let workBuf: Buffer = await sharp(srcBuf)
      .composite([{ input: eraseSvg, blend: "over" }])
      .png()
      .toBuffer();

    // ── New card geometry (80% of old, same corner anchor) ────────────────
    const newQrSize   = Math.max(32, Math.round(oldQrSize * SHRINK_FACTOR));
    const newCardSize = Math.round(newQrSize * CARD_MARGIN);
    const newCardLeft = imgW - newCardSize - CARD_INSET;
    const newCardTop  = imgH - newCardSize - CARD_INSET;
    const qrOffset    = Math.floor((newCardSize - newQrSize) / 2);

    // ── Build placeholder QR PNG ──────────────────────────────────────────
    const qrPng: Buffer = await QRCode.toBuffer(PLACEHOLDER_URL, {
      errorCorrectionLevel: "H",
      type:   "png",
      width:  newQrSize,
      margin: 4,
      color:  { dark: "#000000", light: "#ffffff" },
    });

    // ── Build white backing card ──────────────────────────────────────────
    const cardSvg = Buffer.from(
      `<svg width="${newCardSize}" height="${newCardSize}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${newCardSize}" height="${newCardSize}" ` +
      `rx="8" ry="8" fill="#ffffff"/>` +
      `</svg>`
    );
    const cardBase   = await sharp(cardSvg).png().toBuffer();
    const cardWithQr = await sharp(cardBase)
      .composite([{ input: qrPng, left: qrOffset, top: qrOffset }])
      .png()
      .toBuffer();

    // ── Composite new QR card onto erased image ───────────────────────────
    workBuf = await sharp(workBuf)
      .composite([{ input: cardWithQr, left: newCardLeft, top: newCardTop }])
      .png()
      .toBuffer();

    // ── Stamp magenta exactly over the new card (same bbox) ───────────────
    const magSvg = Buffer.from(
      `<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="${newCardLeft}" y="${newCardTop}" ` +
      `width="${newCardSize}" height="${newCardSize}" fill="#FF00FF"/>` +
      `</svg>`
    );
    workBuf = await sharp(workBuf)
      .composite([{ input: magSvg, blend: "over" }])
      .png()
      .toBuffer();

    // ── Write back in original format ─────────────────────────────────────
    const isJpeg = /\.(jpe?g)$/i.test(file);
    const outBuf = isJpeg
      ? await sharp(workBuf).jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer()
      : await sharp(workBuf).png().toBuffer();

    fs.writeFileSync(filePath, outBuf);
    console.log(
      `OK   ${file.padEnd(55)} ${imgW}×${imgH}` +
      `  old=${oldCardSize}px→new=${newCardSize}px` +
      `  pos=(${newCardLeft},${newCardTop})  bg=${bgHex}`
    );
    ok++;
  }

  console.log(`\nDone: ${ok} rebuilt, ${skipped} skipped`);
}

main().catch(err => { console.error(err); process.exit(1); });
