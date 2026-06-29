/**
 * stamp-magenta-qr-markers.ts
 *
 * Adds a solid magenta (#FF00FF) square over the QR placeholder area of every
 * reference template image. Grok sees this in the reference and reproduces the
 * magenta square in its output, giving us a reliable detection target.
 *
 * Position strategy:
 *   Portrait templates  — cx_frac=0.89, cy_frac=0.92  (matches parchment-classic scan)
 *   Landscape templates — cx_frac=0.89, cy_frac=0.87
 *   Size                — 11% of min(imgW, imgH)
 *
 * Run: pnpm --filter @workspace/scripts run stamp:magenta-qr-markers
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ASSETS     = path.resolve(__dirname, "../../attached_assets");

// cx_frac, cy_frac — normalised centroid within the reference image
// size_frac        — square side as fraction of min(imgW, imgH)
const PORTRAIT_CX   = 0.89;
const PORTRAIT_CY   = 0.92;
const LANDSCAPE_CX  = 0.89;
const LANDSCAPE_CY  = 0.87;
const SIZE_FRAC     = 0.11;   // ~10% side; gives a visible, Grok-copyable marker

const TEMPLATES: Array<{ file: string; landscape: boolean }> = [
  // Portrait
  { file: "mr_biscuits_template_no_logo_1778806527327.png",         landscape: false },
  { file: "made_fresh_template.png",                                 landscape: false },
  { file: "6300F2D5-6BF1-403E-A40B-7203E4E26402_1778948283280.jpeg",landscape: false },
  { file: "IMG_0728_1779065210873.jpeg",                             landscape: false },
  { file: "healthcare_generic_template_1779141099043.png",           landscape: false },
  { file: "home_services_no_text_1780946323885.png",                 landscape: false },
  { file: "IMG_0832_1780946925550.png",                              landscape: false },
  { file: "IMG_0836_1780951148325.png",                              landscape: false },
  { file: "IMG_0839_1780955044987.png",                              landscape: false },
  { file: "heritage_home_portrait.png",                              landscape: false },
  { file: "image_1781029065584.png",                                 landscape: false },
  // Landscape
  { file: "parchment_classic_landscape_1779162178190.png",           landscape: true  },
  { file: "made_fresh_landscape_1779162178190.png",                  landscape: true  },
  { file: "IMG_0747_1779162178190.png",                              landscape: true  },
  { file: "IMG_0746_1779162178190.png",                              landscape: true  },
  { file: "healthcare_wellness_landscape_1779162178190.png",         landscape: true  },
  { file: "image_1780946327957.png",                                 landscape: true  },
  { file: "image_1780946917886.png",                                 landscape: true  },
  { file: "IMG_0837_1780951148325.png",                              landscape: true  },
  { file: "IMG_0838_1780955044987.png",                              landscape: true  },
  { file: "heritage_home_landscape.png",                             landscape: true  },
  { file: "image_1781029077663.png",                                 landscape: true  },
];

async function main() {
  let ok = 0;
  let skipped = 0;

  for (const { file, landscape } of TEMPLATES) {
    const filePath = path.join(ASSETS, file);
    if (!fs.existsSync(filePath)) {
      console.error(`MISSING: ${file}`);
      skipped++;
      continue;
    }

    const meta = await sharp(filePath).metadata();
    const imgW = meta.width!;
    const imgH = meta.height!;

    const cxFrac = landscape ? LANDSCAPE_CX : PORTRAIT_CX;
    const cyFrac = landscape ? LANDSCAPE_CY : PORTRAIT_CY;
    const side   = Math.round(SIZE_FRAC * Math.min(imgW, imgH));
    const cx     = Math.round(cxFrac * imgW);
    const cy     = Math.round(cyFrac * imgH);
    const left   = Math.max(0, cx - Math.floor(side / 2));
    const top    = Math.max(0, cy - Math.floor(side / 2));
    const w      = Math.min(side, imgW - left);
    const h      = Math.min(side, imgH - top);

    const svg = Buffer.from(
      `<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="${left}" y="${top}" width="${w}" height="${h}" fill="#FF00FF"/>` +
      `</svg>`
    );

    const isJpeg  = /\.(jpe?g)$/i.test(file);
    const outBuf  = isJpeg
      ? await sharp(filePath).composite([{ input: svg, blend: "over" }]).jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer()
      : await sharp(filePath).composite([{ input: svg, blend: "over" }]).png().toBuffer();

    fs.writeFileSync(filePath, outBuf);
    console.log(`OK   ${file.padEnd(55)} ${imgW}×${imgH}  magenta at (${left},${top}) ${w}×${h}`);
    ok++;
  }

  console.log(`\nDone: ${ok} stamped, ${skipped} skipped`);
}

main().catch(err => { console.error(err); process.exit(1); });
