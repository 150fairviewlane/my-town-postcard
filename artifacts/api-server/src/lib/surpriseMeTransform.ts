import * as fs from "fs";
import * as path from "path";

// Lazy-load sharp so this module can be evaluated at startup without requiring
// the native binary to be on disk. The binary is only needed at call time.
let _sharpLoader: Promise<typeof import("sharp")["default"]> | null = null;
function getSharp(): Promise<typeof import("sharp")["default"]> {
  if (!_sharpLoader) _sharpLoader = import("sharp").then((m) => m.default);
  return _sharpLoader;
}

export const TRANSFORM_FAMILIES = {
  "parchment-classic": {
    description: "Warm lifestyle, food, hospitality businesses",
    industries: [
      "restaurant", "dining", "food", "bakery", "cafe", "coffee",
      "catering", "florist", "flower", "yoga", "nutrition", "organic",
      "farm", "garden", "winery", "brewery", "distillery", "juice",
      "smoothie", "dessert", "ice cream", "candy", "chocolate",
      "deli", "sandwich", "burger", "taco", "pizza", "sushi",
      "thai", "chinese", "italian", "mexican", "indian", "bbq",
      "steakhouse", "seafood", "buffet",
    ],
  },
  "made-fresh": {
    description: "Artisan, boutique, creative businesses",
    industries: [
      "retail", "shop", "store", "boutique", "salon", "hair", "nail",
      "barbershop", "barber", "spa", "massage", "beauty", "makeup",
      "photography", "art", "gallery", "craft", "jewelry", "clothing",
      "fashion", "apparel", "gifts", "antique", "consignment",
      "furniture", "decor", "interior", "staging", "floral",
    ],
  },
  "neighborhood-pro": {
    description: "Trade, service, contractor businesses",
    industries: [
      "hvac", "heating", "cooling", "air conditioning", "plumbing",
      "plumber", "electrical", "electrician", "roofing", "roofer",
      "contractor", "construction", "handyman", "remodeling",
      "renovation", "flooring", "painting", "painter", "pressure",
      "gutters", "windows", "siding", "insulation", "pest",
      "exterminator", "locksmith", "garage", "auto", "automotive",
      "mechanic", "towing", "landscaping", "lawn", "tree",
      "irrigation", "moving", "storage", "cleaning", "maid",
      "janitorial", "security", "alarm", "insurance", "legal",
      "accounting", "finance", "real estate", "mortgage",
      "healthcare", "medical", "dental", "veterinary", "fitness",
      "gym", "childcare", "daycare", "education", "tutoring",
    ],
  },
} as const;

export type TransformFamily = keyof typeof TRANSFORM_FAMILIES;

export const APPROVED_PALETTES = [
  { name: "cool-shift",    hue: 150,  saturation: 0.9,  brightness: 1.0  },
  { name: "warm-deepen",   hue: -40,  saturation: 1.15, brightness: 0.95 },
  { name: "rich-dark",     hue: 0,    saturation: 1.1,  brightness: 0.75 },
  { name: "complementary", hue: 180,  saturation: 0.85, brightness: 1.0  },
] as const;

export const FRESH_LIGHT_PALETTE = {
  name: "fresh-light",
  hue: 0,
  saturation: 0.75,
  brightness: 1.2,
} as const;

export const TRANSFORM_PORTRAIT_FILES: Record<TransformFamily, string> = {
  "parchment-classic": "mr_biscuits_template_no_logo_1778806527327.png",
  "made-fresh":        "made_fresh_template.png",
  "neighborhood-pro":  "6300F2D5-6BF1-403E-A40B-7203E4E26402_1778948283280.jpeg",
};

export const TRANSFORM_LANDSCAPE_FILES: Record<TransformFamily, string> = {
  "parchment-classic": "parchment_classic_landscape_1779162178190.png",
  "made-fresh":        "made_fresh_landscape_1779162178190.png",
  "neighborhood-pro":  "IMG_0747_1779162178190.png",
};

export function getFamilyForIndustry(industry: string): TransformFamily {
  const i = (industry || "").toLowerCase();
  for (const [family, config] of Object.entries(TRANSFORM_FAMILIES)) {
    if (config.industries.some((keyword) => i.includes(keyword))) {
      return family as TransformFamily;
    }
  }
  return "neighborhood-pro";
}

export function getPalettesForFamily(family: TransformFamily) {
  const base = [...APPROVED_PALETTES] as Array<{
    name: string;
    hue: number;
    saturation: number;
    brightness: number;
  }>;
  if (family === "parchment-classic" || family === "made-fresh") {
    base.push({ ...FRESH_LIGHT_PALETTE });
  }
  return base;
}

export interface TransformResult {
  buffer:  Buffer;
  mime:    "image/png";
  family:  TransformFamily;
  palette: string;
  flipped: boolean;
}

export async function generateSurpriseMeTemplate(
  industry:          string,
  isLandscape:       boolean,
  workspaceRoot:     string,
  combinationIndex?: number,
): Promise<TransformResult | null> {
  try {
    const sharp = await getSharp();
    const family = getFamilyForIndustry(industry);
    const palettes = getPalettesForFamily(family);

    const combinations: Array<{
      palette: { name: string; hue: number; saturation: number; brightness: number };
      flipped: boolean;
    }> = [];
    for (const palette of palettes) {
      combinations.push({ palette, flipped: false });
      combinations.push({ palette, flipped: true });
    }

    const idx =
      combinationIndex !== undefined
        ? Math.abs(combinationIndex) % combinations.length
        : Math.floor(Math.random() * combinations.length);
    const selected = combinations[idx]!;

    const fileMap = isLandscape ? TRANSFORM_LANDSCAPE_FILES : TRANSFORM_PORTRAIT_FILES;
    const filename = fileMap[family];
    const templatePath = path.join(workspaceRoot, "attached_assets", filename);

    if (!fs.existsSync(templatePath)) {
      console.error(`[surpriseMeTransform] Template not found: ${templatePath}`);
      return null;
    }

    let templateBuffer = fs.readFileSync(templatePath);

    if (family === "neighborhood-pro") {
      const metadata = await sharp(templateBuffer).metadata();
      const w = metadata.width  ?? 1000;
      const h = metadata.height ?? 1400;
      const footerHeight = Math.ceil(h * 0.12);

      const overlayBuffer = await sharp({
        create: {
          width:      w,
          height:     footerHeight,
          channels:   4,
          background: { r: 20, g: 20, b: 20, alpha: 200 },
        },
      })
        .png()
        .toBuffer();

      templateBuffer = Buffer.from(
        await sharp(templateBuffer)
          .composite([{ input: overlayBuffer, gravity: "south" }])
          .toBuffer()
      );
    }

    let pipeline = sharp(templateBuffer).modulate({
      hue:        selected.palette.hue,
      saturation: selected.palette.saturation,
      brightness: selected.palette.brightness,
    });

    if (selected.flipped) {
      pipeline = pipeline.flop();
    }

    const outputBuffer = await pipeline.png().toBuffer();

    return {
      buffer:  outputBuffer,
      mime:    "image/png",
      family,
      palette: selected.palette.name,
      flipped: selected.flipped,
    };

  } catch (err) {
    console.error("[surpriseMeTransform] Error:", err);
    return null;
  }
}
