/**
 * stamp-magenta-qr-markers.ts
 *
 * Re-stamps the magenta (#FF00FF) square on each reference template image,
 * precisely co-centred with the QR card that rebuild-reference-qr-cards.ts
 * placed there.
 *
 * Position formula (matches rebuild-reference-qr-cards.ts and compositeQr.ts):
 *   qrSize   = round(min(imgW, imgH) × 0.15 × 0.80)   ← 80% of original
 *   cardSize = round(qrSize × 1.0375)
 *   cardLeft = imgW − cardSize − CARD_INSET
 *   cardTop  = imgH − cardSize − CARD_INSET
 *
 * The magenta square is placed at the same (cardLeft, cardTop) with side = cardSize,
 * guaranteeing it exactly covers the new QR card and nothing else.
 *
 * Run: pnpm --filter @workspace/scripts run stamp:magenta-qr-markers
 */

import path from "path";
import fs   from "fs";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ASSETS     = path.resolve(__dirname, "../../attached_assets");

const CARD_INSET    = 6;
const CARD_MARGIN   = 1.0375;
const SHRINK_FACTOR = 0.80;

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

async function main() {
  let ok = 0, skipped = 0;

  for (const { file } of TEMPLATES) {
    const filePath = path.join(ASSETS, file);
    if (!fs.existsSync(filePath)) {
      console.error(`MISSING: ${file}`);
      skipped++;
      continue;
    }

    const meta   = await sharp(filePath).metadata();
    const imgW   = meta.width!;
    const imgH   = meta.height!;
    const minDim = Math.min(imgW, imgH);

    const qrSize    = Math.max(32, Math.round(minDim * 0.15 * SHRINK_FACTOR));
    const cardSize  = Math.round(qrSize * CARD_MARGIN);
    const cardLeft  = imgW - cardSize - CARD_INSET;
    const cardTop   = imgH - cardSize - CARD_INSET;

    const svg = Buffer.from(
      `<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="${cardLeft}" y="${cardTop}" width="${cardSize}" height="${cardSize}" fill="#FF00FF"/>` +
      `</svg>`
    );

    const isJpeg = /\.(jpe?g)$/i.test(file);
    const outBuf = isJpeg
      ? await sharp(filePath).composite([{ input: svg, blend: "over" }]).jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer()
      : await sharp(filePath).composite([{ input: svg, blend: "over" }]).png().toBuffer();

    fs.writeFileSync(filePath, outBuf);
    console.log(
      `OK   ${file.padEnd(55)} ${imgW}×${imgH}` +
      `  cardSize=${cardSize}px  pos=(${cardLeft},${cardTop})`
    );
    ok++;
  }

  console.log(`\nDone: ${ok} stamped, ${skipped} skipped`);
}

main().catch(err => { console.error(err); process.exit(1); });
