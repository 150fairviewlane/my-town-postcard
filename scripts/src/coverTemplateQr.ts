/**
 * coverTemplateQr.ts
 *
 * For each of the 22 active reference template images:
 *   1. Restore the clean original from git commit 123665e (no prior damage)
 *   2. Apply the template's operation:
 *      - "cover": paint a solid magenta rectangle over an existing QR code or
 *                 white placeholder card (5% padding already included in coords)
 *      - "footer": extend the canvas downward with a dark footer strip and
 *                  paint a magenta QR-marker square inside it
 *
 * Bounding boxes were determined by local-variance detection on clean originals,
 * then visually verified. Zero runtime detection — hardcoded coords for reliability.
 *
 * When adding a new template, run:
 *   pnpm --filter @workspace/scripts run detect:qr-box <filename>
 * to locate the QR bounding box and get a ready-to-paste entry for TEMPLATE_OPS.
 *
 * Run:  pnpm --filter @workspace/scripts run cover:template-qr
 */

import sharp from "sharp";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const ASSETS_DIR = path.join(WORKSPACE_ROOT, "attached_assets");
const CLEAN_COMMIT = "123665e91e5862f69f756288a24c35fada3e3935";

// ── Operation types ────────────────────────────────────────────────────────────
// "cover"  → composite a magenta rect at (x,y,w,h) over the existing image
// "footer" → extend canvas downward by footerH px (filled with footerRgb),
//            then paint a qrSize×qrSize magenta square in the right side of
//            the new strip, vertically centred, with a 20px right margin
type CoverOp  = { kind: "cover";  x: number; y: number; w: number; h: number };
type FooterOp = { kind: "footer"; footerH: number; footerRgb: [number,number,number]; qrSize: number };
type TemplateOp = CoverOp | FooterOp;

const TEMPLATE_OPS: Record<string, TemplateOp> = {
  // ── Portrait ─────────────────────────────────────────────────────────────────
  "mr_biscuits_template_no_logo_1778806527327.png":
    { kind: "cover", x: 940, y: 1178, w: 160, h: 160 },

  // Made Fresh portrait: no QR in clean original → add dark footer + magenta marker
  "made_fresh_template.png":
    { kind: "footer", footerH: 160, footerRgb: [25, 25, 24], qrSize: 130 },

  "6300F2D5-6BF1-403E-A40B-7203E4E26402_1778948283280.jpeg":
    { kind: "cover", x: 840, y: 1057, w: 176, h: 194 },

  "IMG_0728_1779065210873.jpeg":
    { kind: "cover", x: 777, y: 930, w: 134, h: 160 },

  // Health & Wellness portrait: white placeholder card in footer → cover with magenta
  "healthcare_generic_template_1779141099043.png":
    { kind: "cover", x: 848, y: 1179, w: 218, h: 173 },

  "home_services_no_text_1780946323885.png":
    { kind: "cover", x: 731, y: 987, w: 133, h: 118 },

  "IMG_0832_1780946925550.png":
    { kind: "cover", x: 944, y: 1313, w: 126, h: 126 },

  "IMG_0836_1780951148325.png":
    { kind: "cover", x: 872, y: 1305, w: 142, h: 126 },

  "IMG_0839_1780955044987.png":
    { kind: "cover", x: 880, y: 1281, w: 126, h: 142 },

  "heritage_home_portrait.png":
    { kind: "cover", x: 834, y: 1317, w: 160, h: 152 },

  "image_1781029065584.png":
    { kind: "cover", x: 705, y: 1261, w: 218, h: 184 },

  // ── Landscape ────────────────────────────────────────────────────────────────
  "parchment_classic_landscape_1779162178190.png":
    { kind: "cover", x: 1317, y: 777, w: 160, h: 194 },

  // Made Fresh landscape: no QR in clean original → add dark footer + magenta marker
  "made_fresh_landscape_1779162178190.png":
    { kind: "footer", footerH: 120, footerRgb: [25, 25, 24], qrSize: 110 },

  "IMG_0747_1779162178190.png":
    { kind: "cover", x: 1350, y: 850, w: 142, h: 168 },

  // At Your Service landscape: QR in the lower-right footer strip
  "IMG_0746_1779162178190.png":
    { kind: "cover", x: 1405, y: 832, w: 126, h: 154 },

  // Health & Wellness landscape: white placeholder card → cover with magenta
  "healthcare_wellness_landscape_1779162178190.png":
    { kind: "cover", x: 1221, y: 763, w: 322, h: 227 },

  "image_1780946327957.png":
    { kind: "cover", x: 1072, y: 680, w: 152, h: 126 },

  "image_1780946917886.png":
    { kind: "cover", x: 1113, y: 720, w: 110, h: 110 },

  "IMG_0837_1780951148325.png":
    { kind: "cover", x: 1302, y: 875, w: 126, h: 126 },

  "IMG_0838_1780955044987.png":
    { kind: "cover", x: 1310, y: 851, w: 134, h: 134 },

  "heritage_home_landscape.png":
    { kind: "cover", x: 1333, y: 826, w: 160, h: 168 },

  "image_1781029077663.png":
    { kind: "cover", x: 1093, y: 850, w: 160, h: 160 },
};

async function makeMagenta(w: number, h: number): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: 255, g: 0, b: 255 } },
  }).png().toBuffer();
}

async function applyCover(imgBuffer: Buffer, op: CoverOp, destPath: string): Promise<void> {
  const magenta = await makeMagenta(op.w, op.h);
  await sharp(imgBuffer)
    .composite([{ input: magenta, left: op.x, top: op.y }])
    .toFile(destPath);
}

async function applyFooter(imgBuffer: Buffer, op: FooterOp, destPath: string): Promise<void> {
  const meta = await sharp(imgBuffer).metadata();
  const origW = meta.width!;
  const origH = meta.height!;

  // Extend canvas downward
  const extended = await sharp(imgBuffer)
    .extend({
      bottom: op.footerH,
      background: { r: op.footerRgb[0], g: op.footerRgb[1], b: op.footerRgb[2] },
    })
    .toBuffer();

  // Magenta square: right-aligned (20px margin), vertically centred in new strip
  const qrX = origW - op.qrSize - 20;
  const qrY = origH + Math.floor((op.footerH - op.qrSize) / 2);
  const magenta = await makeMagenta(op.qrSize, op.qrSize);

  await sharp(extended)
    .composite([{ input: magenta, left: qrX, top: qrY }])
    .toFile(destPath);
}

async function main() {
  const files = Object.keys(TEMPLATE_OPS);
  console.log(`\n=== coverTemplateQr: ${files.length} template images ===\n`);

  let covered = 0, footed = 0, errors = 0;

  for (const filename of files) {
    const destPath = path.join(ASSETS_DIR, filename);
    const op = TEMPLATE_OPS[filename];

    // Restore clean original from git
    let imgBuffer: Buffer;
    try {
      imgBuffer = execSync(
        `git --no-optional-locks show ${CLEAN_COMMIT}:attached_assets/${filename}`,
        { maxBuffer: 20 * 1024 * 1024 }
      );
    } catch (e) {
      console.error(`  ✗ ${filename}: git restore failed — ${(e as Error).message}`);
      errors++;
      continue;
    }

    try {
      if (op.kind === "cover") {
        await applyCover(imgBuffer, op, destPath);
        console.log(`[cover]  ${filename}\n  x=${op.x} y=${op.y} w=${op.w} h=${op.h}  ✓\n`);
        covered++;
      } else {
        await applyFooter(imgBuffer, op, destPath);
        const meta = await sharp(imgBuffer).metadata();
        const origW = meta.width!, origH = meta.height!;
        const qrX = origW - op.qrSize - 20;
        const qrY = origH + Math.floor((op.footerH - op.qrSize) / 2);
        console.log(`[footer] ${filename}\n  extend +${op.footerH}px (rgb${op.footerRgb}), magenta ${op.qrSize}px @ ${qrX},${qrY}  ✓\n`);
        footed++;
      }
    } catch (e) {
      console.error(`  ✗ ${filename}: operation failed — ${(e as Error).message}`);
      errors++;
    }
  }

  console.log(`=== Result: ${covered} covered, ${footed} footer-extended, ${errors} errors ===\n`);
  if (errors > 0) process.exit(1);
}

main();
