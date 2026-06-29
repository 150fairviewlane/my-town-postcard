/**
 * scan-template-qr-positions.ts
 *
 * One-time script: scans every reference template image with jsQR and prints
 * the normalized QR centroid + size so they can be hardcoded as a lookup table
 * in locateQrCode.ts.
 *
 * Run: pnpm --filter @workspace/scripts run scan-template-qr-positions
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import jsqr from "jsqr";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, "../../");
const ASSETS = path.join(WORKSPACE_ROOT, "attached_assets");

const TEMPLATES: Array<{ key: string; file: string }> = [
  // Portrait
  { key: "parchment-classic",           file: "mr_biscuits_template_no_logo_1778806527327.png" },
  { key: "made-fresh",                  file: "made_fresh_template.png" },
  { key: "neighborhood-pro",            file: "6300F2D5-6BF1-403E-A40B-7203E4E26402_1778948283280.jpeg" },
  { key: "at-your-service",             file: "IMG_0728_1779065210873.jpeg" },
  { key: "health-wellness",             file: "healthcare_generic_template_1779141099043.png" },
  { key: "home-elegance",              file: "home_services_no_text_1780946323885.png" },
  { key: "sage-organic",               file: "IMG_0832_1780946925550.png" },
  { key: "purple-sage",                file: "IMG_0836_1780951148325.png" },
  { key: "brush-stroke",               file: "IMG_0839_1780955044987.png" },
  { key: "heritage-home",              file: "heritage_home_portrait.png" },
  { key: "wok-fire",                   file: "image_1781029065584.png" },
  // Landscape
  { key: "parchment-classic-landscape",  file: "parchment_classic_landscape_1779162178190.png" },
  { key: "made-fresh-landscape",         file: "made_fresh_landscape_1779162178190.png" },
  { key: "neighborhood-pro-landscape",   file: "IMG_0747_1779162178190.png" },
  { key: "at-your-service-landscape",    file: "IMG_0746_1779162178190.png" },
  { key: "health-wellness-landscape",    file: "healthcare_wellness_landscape_1779162178190.png" },
  { key: "home-elegance-landscape",     file: "image_1780946327957.png" },
  { key: "sage-organic-landscape",      file: "image_1780946917886.png" },
  { key: "purple-sage-landscape",       file: "IMG_0837_1780951148325.png" },
  { key: "brush-stroke-landscape",      file: "IMG_0838_1780955044987.png" },
  { key: "heritage-home-landscape",     file: "heritage_home_landscape.png" },
  { key: "wok-fire-landscape",          file: "image_1781029077663.png" },
];

async function scan() {
  const results: Record<string, { cx_frac: number; cy_frac: number; size_frac: number } | "NOT_FOUND"> = {};

  for (const { key, file } of TEMPLATES) {
    const filePath = path.join(ASSETS, file);
    if (!fs.existsSync(filePath)) {
      console.error(`MISSING: ${key} → ${file}`);
      results[key] = "NOT_FOUND";
      continue;
    }

    const { data, info } = await sharp(filePath)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

    const found = jsqr(new Uint8ClampedArray(data), info.width, info.height);
    if (!found) {
      console.log(`NO_QR:  ${key} (${info.width}×${info.height})  ← ${file}`);
      results[key] = "NOT_FOUND";
      continue;
    }

    const loc = found.location;
    const x  = Math.min(loc.topLeftCorner.x,  loc.bottomLeftCorner.x);
    const y  = Math.min(loc.topLeftCorner.y,   loc.topRightCorner.y);
    const x2 = Math.max(loc.topRightCorner.x,  loc.bottomRightCorner.x);
    const y2 = Math.max(loc.bottomLeftCorner.y, loc.bottomRightCorner.y);
    const w  = x2 - x;
    const h  = y2 - y;
    const cx = x + w / 2;
    const cy = y + h / 2;

    const cx_frac   = parseFloat((cx / info.width).toFixed(4));
    const cy_frac   = parseFloat((cy / info.height).toFixed(4));
    const size_frac = parseFloat((Math.max(w, h) / Math.min(info.width, info.height)).toFixed(4));

    console.log(`OK:     ${key.padEnd(30)} cx=${cx_frac} cy=${cy_frac} size=${size_frac}  (${info.width}×${info.height})`);
    results[key] = { cx_frac, cy_frac, size_frac };
  }

  console.log("\n--- Paste into locateQrCode.ts ---\n");
  console.log("export const TEMPLATE_QR_POSITIONS: Record<string, { cx_frac: number; cy_frac: number; size_frac: number }> = {");
  for (const [key, val] of Object.entries(results)) {
    if (val === "NOT_FOUND") {
      console.log(`  // "${key}": NOT FOUND — no QR detected`);
    } else {
      console.log(`  "${key}": { cx_frac: ${val.cx_frac}, cy_frac: ${val.cy_frac}, size_frac: ${val.size_frac} },`);
    }
  }
  console.log("};");
}

scan().catch(err => { console.error(err); process.exit(1); });
