/**
 * coverTemplateQr.ts
 *
 * For each of the 22 active reference template images:
 *   1. Restore the clean original from git commit 123665e (no prior QR-fix damage)
 *   2. If the image has a QR code: paint a solid magenta rectangle exactly 5% larger
 *      than the QR bounding box — nothing else in the image is touched.
 *   3. If the image has no QR code: restore it as-is (healthcare + made-fresh templates).
 *
 * Bounding boxes were determined by local-variance detection on the clean originals,
 * then visually verified. Zero runtime detection — hardcoded coordinates for reliability.
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

// ── Magenta box coordinates (5% padding already included) ──────────────────
// { x, y, w, h } in pixels. null = no QR in this image, restore as-is.
type MagentaBox = { x: number; y: number; w: number; h: number } | null;

const TEMPLATE_QR: Record<string, MagentaBox> = {
  // ── Portrait ──────────────────────────────────────────────────────────────
  "mr_biscuits_template_no_logo_1778806527327.png": { x: 940, y: 1178, w: 160, h: 160 },
  "made_fresh_template.png": null, // no QR in clean original
  "6300F2D5-6BF1-403E-A40B-7203E4E26402_1778948283280.jpeg": { x: 840, y: 1057, w: 176, h: 194 },
  "IMG_0728_1779065210873.jpeg": { x: 777, y: 930, w: 134, h: 160 },
  "healthcare_generic_template_1779141099043.png": null, // no QR in clean original
  "home_services_no_text_1780946323885.png": { x: 731, y: 987, w: 133, h: 118 },
  "IMG_0832_1780946925550.png": { x: 944, y: 1313, w: 126, h: 126 },
  "IMG_0836_1780951148325.png": { x: 872, y: 1305, w: 142, h: 126 },
  "IMG_0839_1780955044987.png": { x: 880, y: 1281, w: 126, h: 142 },
  "heritage_home_portrait.png": { x: 834, y: 1317, w: 160, h: 152 },
  "image_1781029065584.png": { x: 705, y: 1261, w: 218, h: 184 },

  // ── Landscape ─────────────────────────────────────────────────────────────
  "parchment_classic_landscape_1779162178190.png": { x: 1317, y: 777, w: 160, h: 194 },
  "made_fresh_landscape_1779162178190.png": null, // no QR in clean original
  "IMG_0747_1779162178190.png": { x: 1350, y: 850, w: 142, h: 168 },
  "IMG_0746_1779162178190.png": { x: 1390, y: 818, w: 142, h: 168 },
  "healthcare_wellness_landscape_1779162178190.png": null, // no QR in clean original
  "image_1780946327957.png": { x: 1072, y: 680, w: 152, h: 126 },
  "image_1780946917886.png": { x: 1113, y: 720, w: 110, h: 110 },
  "IMG_0837_1780951148325.png": { x: 1302, y: 875, w: 126, h: 126 },
  "IMG_0838_1780955044987.png": { x: 1310, y: 851, w: 134, h: 134 },
  "heritage_home_landscape.png": { x: 1333, y: 826, w: 160, h: 168 },
  "image_1781029077663.png": { x: 1093, y: 850, w: 160, h: 160 },
};

async function main() {
  const files = Object.keys(TEMPLATE_QR);
  console.log(`\n=== coverTemplateQr: ${files.length} template images ===\n`);

  let fixed = 0, skipped = 0, errors = 0;

  for (const filename of files) {
    const destPath = path.join(ASSETS_DIR, filename);
    const box = TEMPLATE_QR[filename];
    const tag = box ? "[QR]" : "[NO QR]";

    // Step 1: restore clean original from git
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

    if (!box) {
      // No QR — write the restored original as-is
      fs.writeFileSync(destPath, imgBuffer);
      console.log(`${tag} ${filename}\n  ✓ restored (no QR to cover)\n`);
      skipped++;
      continue;
    }

    // Step 2: composite a solid magenta rectangle over the QR region
    try {
      const magentaPng = await sharp({
        create: { width: box.w, height: box.h, channels: 3, background: { r: 255, g: 0, b: 255 } },
      })
        .png()
        .toBuffer();

      await sharp(imgBuffer)
        .composite([{ input: magentaPng, left: box.x, top: box.y }])
        .toFile(destPath);

      console.log(
        `${tag} ${filename}\n  magenta cover: x=${box.x} y=${box.y} w=${box.w} h=${box.h}\n  ✓ done\n`
      );
      fixed++;
    } catch (e) {
      console.error(`  ✗ ${filename}: composite failed — ${(e as Error).message}`);
      errors++;
    }
  }

  console.log(
    `=== Result: ${fixed} QR covered, ${skipped} restored clean, ${errors} errors ===\n`
  );
  if (errors > 0) process.exit(1);
}

main();
