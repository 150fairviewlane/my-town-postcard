/**
 * One-shot script: generate per-variant parchment-classic template reference images
 * via DALL-E 2 inpainting.
 *
 * The original templates have an orange pennant ribbon in the top-left corner.
 * Grok copies whatever it sees in the reference image, so variants 2 and 3 need
 * separate reference images with the pennant replaced by the correct logo zone.
 *
 * Approach:
 *  1. Resize the original template to 1024×1024 (DALL-E 2 requirement), keeping the
 *     top-left corner (where the pennant lives) in frame.
 *  2. Build a pixel mask: transparent = inpaint here, opaque white = keep exactly.
 *  3. Call DALL-E 2 /images/edits with the template + mask + prompt.
 *  4. Save the 1024×1024 result — used as a visual reference for Grok, so exact
 *     pixel dimensions don't matter.
 *
 * Outputs written to attached_assets/:
 *   parchment_classic_portrait_v2.png  — pennant gone, circular navy badge top-right
 *   parchment_classic_portrait_v3.png  — pennant gone, full-width forest-green banner top
 *   parchment_classic_landscape_v2.png — same for landscape
 *   parchment_classic_landscape_v3.png — same for landscape
 *
 * Run: pnpm --filter @workspace/scripts run generate-parchment-templates
 */

import OpenAI from "openai";
import { toFile } from "openai/uploads";
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const ASSETS = path.join(ROOT, "attached_assets");

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set.");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SIZE = 1024;

// ── Image helpers ─────────────────────────────────────────────────────────────

/**
 * Resize source image to 1024×1024 keeping the top-left content in frame.
 *
 * Portrait (1148×1371): scale width→1024 (factor 0.892), height becomes 1223,
 *   then crop to top 1024 rows. Pennant ~(0,0)-(249,282) fully preserved.
 *
 * Landscape (1536×1024): height is already 1024, just crop left 1024 cols.
 *   Pennant ~(0,0)-(266,234) fully preserved.
 */
async function prepImage(srcPath: string, isLandscape: boolean): Promise<Buffer> {
  return sharp(srcPath)
    .resize(SIZE, SIZE, { fit: "cover", position: isLandscape ? "left" : "top" })
    .ensureAlpha()
    .png()
    .toBuffer();
}

/**
 * Build a 1024×1024 RGBA mask PNG.
 *   opaque white (alpha 255) → keep original pixels
 *   transparent (alpha 0)    → DALL-E inpaints here
 */
async function makeMask(
  regions: Array<{ x1: number; y1: number; x2: number; y2: number }>,
): Promise<Buffer> {
  const raw = Buffer.alloc(SIZE * SIZE * 4, 255); // all white opaque
  for (const { x1, y1, x2, y2 } of regions) {
    for (let y = y1; y < Math.min(y2, SIZE); y++) {
      for (let x = x1; x < Math.min(x2, SIZE); x++) {
        raw[(y * SIZE + x) * 4 + 3] = 0; // fully transparent → inpaint
      }
    }
  }
  return sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .png()
    .toBuffer();
}

/** Call DALL-E 2 image-edit (inpainting) and return the result as a Buffer. */
async function callDalleEdit(
  imageBuffer: Buffer,
  maskBuffer: Buffer,
  prompt: string,
): Promise<Buffer> {
  const image = await toFile(imageBuffer, "image.png", { type: "image/png" });
  const mask  = await toFile(maskBuffer,  "mask.png",  { type: "image/png" });

  const response = await openai.images.edit({
    model: "gpt-image-1",
    image,
    mask,
    prompt,
    size: "1024x1024",
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-1 returned no image data");
  return Buffer.from(b64, "base64");
}

// ── Task definitions ──────────────────────────────────────────────────────────

interface Task {
  label: string;
  srcPath: string;
  isLandscape: boolean;
  maskRegions: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  prompt: string;
  outPath: string;
}

function buildTasks(): Task[] {
  const portraitSrc  = path.join(ASSETS, "mr_biscuits_template_no_logo_1778806527327.png");
  const landscapeSrc = path.join(ASSETS, "parchment_classic_landscape_1779162178190.png");

  // Portrait pennant in 1024×1024 (scale 1024/1148 ≈ 0.892):
  //   original ~(0,0)-(279,316) → scaled ~(0,0)-(249,282), erase box with margin (0,0)-(265,300)
  // Landscape pennant in 1024×1024 (no y-scale, left crop, scale = 1.0):
  //   original ~(0,0)-(266,234) → same in the 1024×1024 crop, erase with margin (0,0)-(285,255)

  // Landscape variants are generated separately once portrait is validated.
  // Uncomment the landscape tasks below when ready.
  return [
    // ── Portrait v2: circular navy badge top-right ───────────────────────────
    {
      label: "portrait v2 (circular badge)",
      srcPath: portraitSrc,
      isLandscape: false,
      maskRegions: [
        { x1: 0,   y1: 0,   x2: 265, y2: 300 }, // erase pennant (top-left)
        { x1: 800, y1: 0,   x2: 1024, y2: 220 }, // top-right: place circular badge
      ],
      prompt:
        "A warm parchment-textured advertising postcard with a cream and tan background. " +
        "The upper area has a dark green paintbrush-stroke headline band. " +
        "The left-center area has a column of orange circular checkmark service badges. " +
        "There is a dashed coupon box in the lower right and a dark footer strip at the bottom. " +
        "In the TOP-RIGHT corner there is a prominent circular emblem badge: navy blue double-ring border " +
        "on a cream parchment interior, clean and suitable for a business logo. " +
        "The top-left corner is plain clean parchment texture.",
      outPath: path.join(ASSETS, "parchment_classic_portrait_v2.png"),
    },

    // ── Portrait v3: full-width forest-green banner across top ───────────────
    {
      label: "portrait v3 (full-width banner)",
      srcPath: portraitSrc,
      isLandscape: false,
      maskRegions: [
        { x1: 0, y1: 0, x2: 1024, y2: 120 }, // full-width top strip (pennant + banner zone)
      ],
      prompt:
        "A warm parchment-textured advertising postcard with a cream and tan background. " +
        "The upper area (below the top banner) has a dark green paintbrush-stroke headline band. " +
        "The left-center area has a column of orange circular checkmark service badges. " +
        "There is a dashed coupon box and a dark footer strip at the bottom. " +
        "A SOLID DARK FOREST-GREEN rectangular banner spans the full width at the very top " +
        "edge of the card, approximately 90–110 pixels tall, edge to edge. " +
        "The banner is flat and clean with no pennant or ribbon shape.",
      outPath: path.join(ASSETS, "parchment_classic_portrait_v3.png"),
    },

    // ── Landscape v2 & v3: uncomment when ready to generate ─────────────────
    // {
    //   label: "landscape v2 (circular badge)",
    //   srcPath: landscapeSrc,
    //   isLandscape: true,
    //   maskRegions: [
    //     { x1: 0,   y1: 0,   x2: 285, y2: 255 },
    //     { x1: 800, y1: 0,   x2: 1024, y2: 220 },
    //   ],
    //   prompt:
    //     "A warm parchment-textured landscape advertising postcard with a cream and tan background. " +
    //     "The upper area has a dark green paintbrush-stroke headline band. " +
    //     "The left side has a column of orange circular checkmark service badges. " +
    //     "There is a dashed coupon box and a dark footer strip at the bottom. " +
    //     "In the TOP-RIGHT corner there is a prominent circular emblem badge: navy blue double-ring border " +
    //     "on a cream parchment interior, clean and suitable for a business logo. " +
    //     "The top-left corner is plain clean parchment texture.",
    //   outPath: path.join(ASSETS, "parchment_classic_landscape_v2.png"),
    // },
    // {
    //   label: "landscape v3 (full-width banner)",
    //   srcPath: landscapeSrc,
    //   isLandscape: true,
    //   maskRegions: [
    //     { x1: 0, y1: 0, x2: 1024, y2: 120 },
    //   ],
    //   prompt:
    //     "A warm parchment-textured landscape advertising postcard with a cream and tan background. " +
    //     "The upper area (below the top banner) has a dark green paintbrush-stroke headline band. " +
    //     "The left side has a column of orange circular checkmark service badges. " +
    //     "There is a dashed coupon box and a dark footer strip at the bottom. " +
    //     "A SOLID DARK FOREST-GREEN rectangular banner spans the full width at the very top " +
    //     "edge of the card, approximately 90-110 pixels tall, edge to edge. No pennant or ribbon.",
    //   outPath: path.join(ASSETS, "parchment_classic_landscape_v3.png"),
    // },
  ];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function generate(): Promise<void> {
  const tasks = buildTasks();

  for (const task of tasks) {
    console.log(`\n⏳  ${task.label} — preparing image and mask...`);
    const imageBuf = await prepImage(task.srcPath, task.isLandscape);
    const maskBuf  = await makeMask(task.maskRegions);

    console.log(`    calling DALL-E 2 inpainting...`);
    const resultBuf = await callDalleEdit(imageBuf, maskBuf, task.prompt);

    await sharp(resultBuf).png({ compressionLevel: 8 }).toFile(task.outPath);
    console.log(`✓   wrote ${path.relative(ROOT, task.outPath)}`);
  }

  console.log("\n✅  All variant template images generated via DALL-E 2 inpainting.");
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
