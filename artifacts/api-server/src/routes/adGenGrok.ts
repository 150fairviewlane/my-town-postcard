import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import fs from "fs";
import path from "path";
import { logger } from "../lib/logger";

// Lazy-load sharp so the module can be evaluated at startup without requiring
// the native binary to be on disk. Only needed at image-processing call time.
// sharp uses `export =` (CJS), so dynamic import wraps it in { default: ... };
// we cast through `any` to satisfy TypeScript and unwrap at runtime.
let _sharpLoader: Promise<typeof import("sharp")> | null = null;
function getSharp(): Promise<typeof import("sharp")> {
  if (!_sharpLoader) {
    _sharpLoader = (import("sharp") as Promise<any>).then((m) => m.default ?? m);
  }
  return _sharpLoader!;
}
import { buildAdPrompt } from "../lib/buildAdPrompt";
import { compositeQrOnto, type SizeKey } from "../lib/compositeQr";
import { db, spotsTable } from "@workspace/db";
import { eq, and, ne, sql as drizzleSql } from "drizzle-orm";

function findWorkspaceRoot(): string {
  let dir = process.cwd();
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const WORKSPACE_ROOT = findWorkspaceRoot();

const router: IRouter = Router();

const GenerateSchema = z.object({
  bizName:   z.string().min(1, "bizName is required"),
  tagline:   z.string().optional().default(""),
  phone:     z.string().optional().default(""),
  city:      z.string().optional().default(""),
  address:   z.string().optional().default(""),
  website:   z.string().optional().default(""),
  industry:  z.string().optional().default("Local Business"),
  menu:      z.array(z.string()).optional().default([]),
  offer:     z.string().optional().default(""),
  offerFine: z.string().optional().default(""),
  template:  z.string().optional().default("parchment-classic"),
  sizeKey:   z.string().optional().default("xl"),
  photoUrl:  z.string().optional().default(""),
  logoData:  z.string().optional().default(""),
  generationIndex: z.number().int().optional().default(0),
  spotId:    z.number().int().optional(),
  campaignId: z.number().int().optional(),
  side:       z.string().optional(),
  primaryColor: z.string().optional().default(""),
  accentColor:  z.string().optional().default(""),
});




/** Convert a base64 data URL (data:image/png;base64,...) to a Blob. */
function dataUrlToBlob(dataUrl: string, defaultMime = "image/png"): Blob {
  const commaIdx = dataUrl.indexOf(",");
  const header   = commaIdx > 0 ? dataUrl.slice(0, commaIdx) : "";
  const mime     = header.match(/data:([^;]+)/)?.[1] ?? defaultMime;
  const b64      = commaIdx > 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  return new Blob([Buffer.from(b64, "base64")], { type: mime });
}

/**
 * Trusted image CDN hostnames that library photos may come from.
 * Only HTTPS URLs from these hosts are allowed as remote reference images.
 */
const ALLOWED_IMAGE_HOSTS = new Set([
  "images.unsplash.com",
  "images.pexels.com",
  "cdn.pixabay.com",
]);

const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB safety cap

/**
 * Fetch a remote image URL and return it as a Blob.
 * SSRF protection: only HTTPS URLs from the trusted CDN allowlist are fetched.
 * Enforces a 10 MB response size cap.
 */
async function remoteUrlToBlob(url: string): Promise<Blob> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Invalid photo URL"); }

  if (parsed.protocol !== "https:") throw new Error("Photo URL must use HTTPS");
  if (!ALLOWED_IMAGE_HOSTS.has(parsed.hostname))
    throw new Error(`Photo URL hostname '${parsed.hostname}' is not on the trusted image host list`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const r = await fetch(url, { signal: controller.signal, redirect: "error" });
    if (!r.ok) throw new Error(`Failed to fetch reference image (${r.status})`);
    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX_REMOTE_IMAGE_BYTES)
      throw new Error(`Reference image exceeds ${MAX_REMOTE_IMAGE_BYTES / 1024 / 1024} MB limit`);
    return new Blob([buf], { type: r.headers.get("content-type") ?? "image/jpeg" });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Safely parse a fetch Response as JSON. If the body is not valid JSON
 * (e.g. xAI returns plain-text "Expected request…" on some errors),
 * returns `{ _raw: <text> }` instead of throwing.
 */
async function safeJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { return { _raw: text }; }
}

/** Extract an image URL from an xAI images response body. Returns null if not found. */
function extractXaiImageUrl(body: Record<string, unknown>): string | null {
  const dataArr = Array.isArray(body["data"]) ? (body["data"] as Record<string, unknown>[]) : [];
  const item = dataArr[0];
  if (!item) return null;
  if (typeof item["url"] === "string" && item["url"])           return item["url"];
  if (typeof item["b64_json"] === "string" && item["b64_json"])
    return `data:image/png;base64,${item["b64_json"]}`;
  return null;
}

/** Resize and centre-crop a Grok-returned image URL to exact print pixel dimensions. */
async function cropToSpotDims(url: string, w: number, h: number): Promise<string> {
  try {
    const sharp = await getSharp();
    let buf: Buffer;
    if (url.startsWith("data:")) {
      buf = Buffer.from(url.split(",")[1] ?? "", "base64");
    } else {
      const resp = await fetch(url);
      if (!resp.ok) return url;
      buf = Buffer.from(await resp.arrayBuffer());
    }
    const out = await sharp(buf)
      .resize(w, h, { fit: "fill", kernel: "lanczos3" })
      .jpeg({ quality: 98, chromaSubsampling: "4:4:4" })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return url;
  }
}


/**
 * Fallback: call /v1/images/generations (text-to-image, JSON) when the model
 * doesn't support the /edits endpoint.  Returns the imageUrl or throws on error.
 */
async function callGenerationsJson(
  apiKey: string,
  prompt: string,
  bizName: string,
  log: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void },
): Promise<string> {
  log.warn({ bizName }, "grok-imagine edits not supported — falling back to /generations");
  const r = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "grok-imagine-image-quality", prompt, n: 1 }),
  });
  const body = await r.json() as Record<string, unknown>;
  log.info({ status: r.status, body: JSON.stringify(body).slice(0, 500), bizName }, "grok-imagine generations fallback response");
  if (!r.ok) {
    const msg = (body["error"] as Record<string, unknown> | undefined)?.["message"] as string
      ?? `xAI /generations error ${r.status}`;
    throw new Error(msg);
  }
  const dataArr = Array.isArray(body["data"]) ? (body["data"] as Record<string, unknown>[]) : [];
  const item = dataArr[0];
  if (item && typeof item["url"] === "string" && item["url"]) return item["url"];
  if (item && typeof item["b64_json"] === "string" && item["b64_json"])
    return `data:image/png;base64,${item["b64_json"]}`;
  throw new Error("No image returned from /generations fallback");
}

/**
 * Returns a standardised footer-region instruction shared by every ad template.
 * Phone, address, and QR code are anchored in the bottom band of the ad.
 * They may sit directly on composited imagery — no background bar required.
 */
function buildFooterZone(
  phone: string,
  address: string,
  phoneIconStyle: "circular-badge" | "inline-icon" | "minimal",
): string {
  const hasAddr = address !== "(none)";
  const addrRule = !hasAddr
    ? ""
    : address.length <= 28
      ? `"${address}" on a SINGLE line, same font size as the phone number.`
      : `"${address}" — street on line 1, city/state on line 2 (split at the natural comma; ` +
        `line 1 must NOT end with a comma). City/state MUST appear immediately below the street ` +
        `on the very next line — NEVER in a separate column or distant area. ` +
        `Same font size as phone number (never shrink text).`;
  const iconPrefix =
    phoneIconStyle === "circular-badge" ? "a circular phone-icon badge + " :
    phoneIconStyle === "inline-icon"    ? "a small phone icon + "           : "";

  return (
    "FOOTER REGION (bottom 15–20% of card): a SOLID DARK BACKGROUND BAR spanning the full card width — opaque, high contrast, no transparency or bleed into imagery above.\n" +
    "  PHONE NUMBER RULE — CRITICAL: the phone number must appear EXACTLY ONCE in the entire ad — ONLY inside this footer bar. NEVER place the phone number in any service panel, coupon zone, headline area, right column, or anywhere else outside the footer.\n" +
    `  LEFT — ${iconPrefix}phone "${phone}" in bold white, large and dominant. Zero digit changes.\n` +
    (hasAddr ? `  ADDRESS — directly below the phone number, left-aligned in the same left column (NEVER drift to a center or right column, NEVER appear in a separate area): ${addrRule}\n` : "") +
    "  RIGHT — small QR code graphic (max 0.5\"×0.5\" at print size). No coupon box, dashed frame, or decorative border.\n" +
    "  QR CODE RULE — CRITICAL: the QR code must appear EXACTLY ONCE in the entire ad — ONLY here in the footer bottom-right corner. NEVER place a QR code anywhere outside this footer — not in any coupon zone, service panel, headline area, or elsewhere.\n" +
    "  QR QUIET ZONE: 4-unit clear white border on all sides, no overlaps.\n" +
    "  TYPOGRAPHY: phone minimum 18pt bold white — the largest text in the footer bar; address minimum 14pt bold white. NEVER render the address text smaller than 12pt — if space is tight, shrink the coupon or reduce service panel height before reducing the address font size. No website URL text.\n\n"
  );
}

interface IndustryPhotos {
  hero:     string;
  c1:       string;
  c2:       string;
  c3:       string;
  p1:       string;
  p2:       string;
  outdoor:  string;
  interior: string;
}

function getIndustryPhotos(industry: string): IndustryPhotos {
  const ind = industry.toLowerCase();
  if (ind.includes("hvac") || ind.includes("heating") || ind.includes("cooling") || ind.includes("air condition")) {
    return {
      hero:     "a technician in uniform servicing a rooftop HVAC unit, clear blue sky background",
      c1:       "gleaming condenser units installed beside a home exterior",
      c2:       "close-up of a digital thermostat on a clean white wall",
      c3:       "happy homeowner relaxing in a comfortably cool living room",
      p1:       "technician inspecting ductwork inside a clean utility room",
      p2:       "modern air handler unit in a well-lit mechanical room",
      outdoor:  "HVAC technician working on condenser units outside a suburban home",
      interior: "bright clean utility room with a high-efficiency furnace and new ductwork",
    };
  }
  if (ind.includes("plumb")) {
    return {
      hero:     "a licensed plumber professionally installing a fixture in a bright modern bathroom",
      c1:       "gleaming new chrome faucet and sink in a clean bathroom",
      c2:       "plumber's tool belt with wrenches and pipe fittings",
      c3:       "happy homeowner in a beautifully renovated bathroom",
      p1:       "under-sink plumbing with new copper pipes",
      p2:       "water heater installation in a clean utility room",
      outdoor:  "plumber unloading tools from a professional service van in a driveway",
      interior: "bright modern kitchen with new plumbing fixtures under natural light",
    };
  }
  if (ind.includes("electric")) {
    return {
      hero:     "a licensed electrician working on a breaker panel in a clean residential setting",
      c1:       "modern electrical panel with labeled circuit breakers",
      c2:       "electrician installing recessed lighting in a bright room",
      c3:       "well-lit kitchen after professional lighting upgrade",
      p1:       "electrician checking wiring with a digital multimeter",
      p2:       "new smart outlet and USB charging port installation",
      outdoor:  "electrician on a ladder installing exterior lighting on a home",
      interior: "bright home interior with professionally installed pendant lights",
    };
  }
  if (ind.includes("roof")) {
    return {
      hero:     "roofing crew installing new architectural shingles on a residential home",
      c1:       "crisp new asphalt shingle roof on a beautiful suburban home",
      c2:       "roofer applying flashing around a chimney",
      c3:       "home exterior after complete roof replacement, strong curb appeal",
      p1:       "shingle samples and roofing materials spread on a workbench",
      p2:       "gutters and fascia freshly installed on a home",
      outdoor:  "roofing team on a residential roof under a clear sky",
      interior: "dry clean attic with new decking and insulation after re-roof",
    };
  }
  if (ind.includes("lawn") || ind.includes("landscap") || ind.includes("garden")) {
    return {
      hero:     "a professional landscaper mowing a lush green residential lawn in bright sunlight",
      c1:       "perfectly edged lawn with vibrant flower borders",
      c2:       "landscaper pruning hedges into clean geometric shapes",
      c3:       "beautiful patio garden with fresh mulch and colorful plantings",
      p1:       "riding mower on a wide open suburban lawn",
      p2:       "newly planted garden beds in front of a home",
      outdoor:  "landscaping crew working on a manicured front yard",
      interior: "bright sunlit backyard patio surrounded by lush mature landscaping",
    };
  }
  if (ind.includes("paint")) {
    return {
      hero:     "a professional painter applying fresh paint on a home exterior with precision",
      c1:       "freshly painted white exterior home with clean crisp trim",
      c2:       "painter rolling smooth interior wall in warm neutral tones",
      c3:       "beautifully painted living room with elegant accent wall",
      p1:       "painter's brush and paint cans on a clean drop cloth",
      p2:       "smooth freshly painted cabinet doors in a bright kitchen",
      outdoor:  "crew painting a home exterior with scaffolding in bright daylight",
      interior: "bright freshly painted living room with crisp white trim",
    };
  }
  if (ind.includes("clean")) {
    return {
      hero:     "a professional cleaner in uniform vacuuming a bright pristine living room",
      c1:       "sparkling clean kitchen with gleaming countertops and appliances",
      c2:       "cleaner mopping a spotless hardwood floor",
      c3:       "gleaming bathroom tile and mirrors after deep clean",
      p1:       "cleaning supplies and microfiber cloths neatly arranged",
      p2:       "bright clean home office after professional cleaning service",
      outdoor:  "cleaning team arriving at a home in a professional branded van",
      interior: "immaculate freshly cleaned living room bathed in natural light",
    };
  }
  if (ind.includes("pest")) {
    return {
      hero:     "a pest control technician in uniform inspecting a home exterior",
      c1:       "pest control professional applying treatment along a baseboard",
      c2:       "clean pest-free kitchen with gleaming countertops",
      c3:       "happy family in a comfortable pest-free home",
      p1:       "technician setting a professional pest trap device",
      p2:       "pest control equipment and protective gear in a service van",
      outdoor:  "pest control technician treating the perimeter of a suburban home",
      interior: "bright clean kitchen and pantry after professional pest treatment",
    };
  }
  if (ind.includes("dent")) {
    return {
      hero:     "a friendly dentist examining a patient in a modern dental office",
      c1:       "bright modern dental operatory with state-of-the-art equipment",
      c2:       "patient smiling with a beautiful healthy smile after treatment",
      c3:       "clean dental reception area with natural light and plants",
      p1:       "dentist reviewing digital X-rays on a high-resolution monitor",
      p2:       "hygienist performing a professional teeth cleaning",
      outdoor:  "welcoming modern dental office building exterior",
      interior: "bright cheerful dental waiting room with comfortable seating",
    };
  }
  if (ind.includes("medical") || ind.includes("health") || ind.includes("clinic") || ind.includes("doctor") || ind.includes("physician")) {
    return {
      hero:     "a friendly doctor in a white coat consulting with a patient in a modern exam room",
      c1:       "bright clean modern medical exam room with professional equipment",
      c2:       "doctor reviewing patient records on a tablet",
      c3:       "welcoming medical clinic reception area with natural light",
      p1:       "nurse taking a patient's vitals in a clinic",
      p2:       "modern diagnostic equipment in a clean exam room",
      outdoor:  "modern medical clinic building exterior with professional signage",
      interior: "bright comfortable waiting room with natural light and plants",
    };
  }
  if (ind.includes("vet") || ind.includes("pet") || ind.includes("animal")) {
    return {
      hero:     "a smiling veterinarian examining a healthy golden retriever on a clinic table",
      c1:       "vet technician comforting a cat during a wellness exam",
      c2:       "happy dog owner reuniting with their pet after treatment",
      c3:       "bright clean modern veterinary exam room",
      p1:       "puppy getting a checkup at a friendly animal clinic",
      p2:       "veterinarian reviewing pet health records on a tablet",
      outdoor:  "welcoming animal hospital exterior with a pet-friendly entrance",
      interior: "warm friendly veterinary waiting room with natural light",
    };
  }
  if (ind.includes("auto") || ind.includes("car") || ind.includes("mechanic") || ind.includes("tire")) {
    return {
      hero:     "a skilled auto mechanic servicing a car in a clean professional garage",
      c1:       "mechanic performing a precision oil change under a lifted vehicle",
      c2:       "clean modern auto service bay with professional equipment",
      c3:       "happy customer picking up their freshly serviced car",
      p1:       "technician using diagnostic equipment on a vehicle",
      p2:       "new tires installed on a car, gleaming alloy wheels",
      outdoor:  "clean professional auto service shop exterior with customer cars",
      interior: "spotless auto service bay with a car on a hydraulic lift",
    };
  }
  if (ind.includes("real estate") || ind.includes("realt") || ind.includes("home sale") || ind.includes("property")) {
    return {
      hero:     "a smiling real estate agent standing in front of a beautiful residential home",
      c1:       "bright open-concept kitchen in a staged home for sale",
      c2:       "real estate agent showing a family a beautiful living room",
      c3:       "beautifully landscaped home exterior with a sold sign",
      p1:       "cozy master bedroom with natural light and modern decor",
      p2:       "inviting backyard patio of a home for sale",
      outdoor:  "stunning curb appeal of a for-sale home in a friendly neighborhood",
      interior: "bright spacious living room with hardwood floors and large windows",
    };
  }
  if (ind.includes("restaurant") || ind.includes("food") || ind.includes("cafe") || ind.includes("bakery") || ind.includes("diner") || ind.includes("bistro") || ind.includes("pizza") || ind.includes("grill") || ind.includes("bar")) {
    return {
      hero:     "a beautifully plated signature dish with vibrant colors under warm restaurant lighting",
      c1:       "chef preparing fresh ingredients in a professional kitchen",
      c2:       "cozy inviting restaurant dining room with warm ambient lighting",
      c3:       "close-up of a tempting dessert or specialty drink",
      p1:       "sizzling pan of fresh seasonal ingredients being tossed",
      p2:       "artfully arranged appetizers on a rustic wooden board",
      outdoor:  "charming restaurant exterior with warm lighting and inviting entrance",
      interior: "warm cozy restaurant interior with diners enjoying their meals",
    };
  }
  if (ind.includes("salon") || ind.includes("beauty") || ind.includes("hair") || ind.includes("nail") || ind.includes("spa") || ind.includes("barber")) {
    return {
      hero:     "a skilled stylist creating a beautiful hair transformation in a modern salon",
      c1:       "gorgeous finished hairstyle under professional studio lighting",
      c2:       "clean modern salon interior with styling stations and mirrors",
      c3:       "happy client smiling at their reflection in a salon mirror",
      p1:       "stylist applying highlights with precision foils",
      p2:       "luxurious hair care products and tools neatly arranged",
      outdoor:  "stylish modern salon storefront with welcoming signage",
      interior: "bright airy salon interior with natural light and modern decor",
    };
  }
  if (ind.includes("gym") || ind.includes("fitness") || ind.includes("workout") || ind.includes("training") || ind.includes("yoga") || ind.includes("crossfit")) {
    return {
      hero:     "a personal trainer motivating a client through a dynamic workout in a modern gym",
      c1:       "rows of clean modern cardio and strength equipment in a bright gym",
      c2:       "group fitness class in an energetic bright studio",
      c3:       "athlete completing a strength training session with proper form",
      p1:       "close-up of weights and gym equipment in a professional facility",
      p2:       "clean locker room with modern amenities",
      outdoor:  "modern fitness center building exterior with motivational signage",
      interior: "bright spacious gym floor with high-end equipment and natural light",
    };
  }
  if (ind.includes("insur")) {
    return {
      hero:     "a friendly insurance agent meeting with a family in a professional office",
      c1:       "insurance agent reviewing a policy with a smiling client",
      c2:       "happy family standing in front of their protected home",
      c3:       "professional modern insurance office with welcoming decor",
      p1:       "agent shaking hands with a satisfied client",
      p2:       "insurance forms and documents on a clean organized desk",
      outdoor:  "professional insurance office building exterior",
      interior: "bright welcoming insurance office lobby with comfortable seating",
    };
  }
  if (ind.includes("daycare") || ind.includes("child") || ind.includes("preschool") || ind.includes("kinder")) {
    return {
      hero:     "happy children playing and learning in a bright colorful daycare classroom",
      c1:       "teacher reading to a group of engaged young children",
      c2:       "colorful safe outdoor play area with happy children",
      c3:       "clean bright classroom with learning materials and cheerful decor",
      p1:       "children doing arts and crafts at a colorful table",
      p2:       "teacher comforting and playing with toddlers",
      outdoor:  "inviting daycare building exterior with safe fenced playground",
      interior: "warm safe daycare room with age-appropriate toys and natural light",
    };
  }
  if (ind.includes("financ") || ind.includes("account") || ind.includes("tax") || ind.includes("wealth") || ind.includes("invest") || ind.includes("bank")) {
    return {
      hero:     "a professional financial advisor consulting with a client in a modern office",
      c1:       "financial advisor reviewing growth charts with a satisfied client",
      c2:       "clean modern financial office with large windows",
      c3:       "happy couple reviewing their financial plan",
      p1:       "professional reviewing financial documents at a tidy desk",
      p2:       "modern laptop displaying investment portfolio performance",
      outdoor:  "professional financial services office building exterior",
      interior: "bright modern financial office with clean desk and natural light",
    };
  }
  if (ind.includes("photo")) {
    return {
      hero:     "a professional photographer composing a portrait in a well-equipped studio",
      c1:       "beautifully lit family portrait captured by a professional",
      c2:       "wedding couple embracing in a romantic outdoor setting",
      c3:       "photographer reviewing stunning shots on a camera LCD",
      p1:       "professional camera with prime lens on a clean studio surface",
      p2:       "beautifully framed prints displayed in a photography studio",
      outdoor:  "photographer capturing a couple in a golden-hour outdoor session",
      interior: "professional photography studio with softboxes and clean white backdrop",
    };
  }
  return {
    hero:     `a professional ${industry} business providing excellent service to happy customers`,
    c1:       `professional ${industry} work being performed by a skilled technician`,
    c2:       `a satisfied customer with a completed ${industry} project`,
    c3:       `${industry} professional tools and equipment ready for service`,
    p1:       `${industry} specialist at work in a clean professional setting`,
    p2:       `${industry} team providing friendly professional service`,
    outdoor:  `${industry} business exterior with professional signage and welcoming entrance`,
    interior: `clean professional ${industry} workspace with natural light`,
  };
}

// ── POST /api/grok-ad-generator/generate ─────────────────────────────────────
router.post("/grok-ad-generator/generate", async (req, res): Promise<void> => {
  const parsed = GenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "XAI_API_KEY is not configured on this server." });
    return;
  }

  const d = parsed.data;

  // Medium (3"×2") is the only landscape spot size
  const isLandscape = ["medium", "m"].includes(d.sizeKey.toLowerCase());

  // Resolve template — "surprise-me" picks a random unused real template for this campaign side
  const isSurpriseMe = d.template === "surprise-me";
  let templateKey = d.template || "parchment-classic";

  if (templateKey === "surprise-me") {
    const TEMPLATE_POOL = [
      "parchment-classic", "made-fresh", "neighborhood-pro", "at-your-service",
      "health-wellness", "home-elegance", "sage-organic", "purple-sage",
      "brush-stroke", "wok-fire", "heritage-home",
    ];
    const usedTemplates = new Set<string>();
    if (d.campaignId != null && d.side) {
      try {
        const usedRows = await db
          .select({ tmpl: drizzleSql<string | null>`${spotsTable.templateData}::jsonb->>'template'` })
          .from(spotsTable)
          .where(and(
            eq(spotsTable.campaignId, d.campaignId),
            eq(spotsTable.side, d.side as "front" | "back"),
            d.spotId != null ? ne(spotsTable.id, d.spotId) : undefined,
          ));
        for (const row of usedRows) {
          if (row.tmpl && row.tmpl !== "surprise-me") usedTemplates.add(row.tmpl);
        }
      } catch (err) {
        req.log.warn({ err }, "surprise-me: failed to query used templates — using full pool");
      }
    }
    const available = TEMPLATE_POOL.filter(t => !usedTemplates.has(t));
    const pool = available.length > 0 ? available : TEMPLATE_POOL;
    templateKey = pool[Math.floor(Math.random() * pool.length)]!;
    req.log.info({ templateKey, usedCount: usedTemplates.size }, "surprise-me: selected random template");
  }

  // Load template PNG as raw buffer — portrait and landscape each have their own template images
  let tmplBuf: Buffer | null = null;
  let tmplMime = "image/png";
  const parchmentPortrait = "mr_biscuits_template_no_logo_1778806527327.png";
    const parchmentLandscape = "parchment_classic_landscape_1779162178190.png";
    const portraitFiles: Record<string, string> = {
      "parchment-classic": parchmentPortrait,
      "made-fresh":        "made_fresh_template.png",
      "neighborhood-pro":  "6300F2D5-6BF1-403E-A40B-7203E4E26402_1778948283280.jpeg",
      "at-your-service":   "IMG_0728_1779065210873.jpeg",
      "health-wellness":   "healthcare_generic_template_1779141099043.png",
      "home-elegance":     "home_services_no_text_1780946323885.png",
      "sage-organic":      "IMG_0832_1780946925550.png",
      "purple-sage":       "IMG_0836_1780951148325.png",
      "brush-stroke":      "IMG_0839_1780955044987.png",
      "heritage-home":     "heritage_home_portrait.png",
      "wok-fire":          "image_1781029065584.png",
    };
    const landscapeFiles: Record<string, string> = {
      "parchment-classic": parchmentLandscape,
      "made-fresh":        "made_fresh_landscape_1779162178190.png",
      "neighborhood-pro":  "IMG_0747_1779162178190.png",
      "at-your-service":   "IMG_0746_1779162178190.png",
      "health-wellness":   "healthcare_wellness_landscape_1779162178190.png",
      "home-elegance":     "image_1780946327957.png",
      "sage-organic":      "image_1780946917886.png",
      "purple-sage":       "IMG_0837_1780951148325.png",
      "brush-stroke":      "IMG_0838_1780955044987.png",
      "heritage-home":     "heritage_home_landscape.png",
      "wok-fire":          "image_1781029077663.png",
    };
    const fileMap = isLandscape ? landscapeFiles : portraitFiles;
    const tmplFilename = fileMap[templateKey] ?? fileMap["parchment-classic"]!;
    const tmplPath = path.join(WORKSPACE_ROOT, "attached_assets", tmplFilename);
    if (!fs.existsSync(tmplPath)) {
      res.status(500).json({ error: "Template file not found on server." });
      return;
    }
    tmplBuf = fs.readFileSync(tmplPath);
    tmplMime = /\.(jpe?g)$/i.test(tmplFilename) ? "image/jpeg" : "image/png";
    req.log.info({ templateKey, tmplFilename }, "template file loaded");

  // Map spot size → closest supported Grok aspect ratio
  // XL=4"×5" → 3:4 (4:5 unsupported; sharp crops to exact) | Large=3"×4" → 3:4
  // Medium=3"×2" → 3:2 (landscape) | Small=2"×2" → 1:1
  const aspectRatioMap: Record<string, string> = {
    xl: "3:4", large: "3:4", l: "3:4", medium: "3:2", small: "1:1", m: "3:2", s: "1:1",
  };
  const spotAspectRatio = aspectRatioMap[d.sizeKey.toLowerCase()] ?? "3:4";
  const isXL = ["xl", "x-large", "xlarge"].includes((d.sizeKey || "").toLowerCase());

  // Print dimensions at 300 DPI — sharp crops Grok output to these for screen-sharp quality
  const CROP_DIMS: Record<string, { w: number; h: number }> = {
    xl:     { w: 1200, h: 1500 },
    large:  { w: 900,  h: 1200 }, l: { w: 900,  h: 1200 },
    medium: { w: 900,  h: 600  }, m: { w: 900,  h: 600  },
    small:  { w: 600,  h: 600  }, s: { w: 600,  h: 600  },
  };
  const cropDim = CROP_DIMS[d.sizeKey.toLowerCase()] ?? { w: 400, h: 500 };

  // Resolve the spot's tracking code so we can composite a real QR after generation.
  // Falls back to null for preview/pre-payment generations — QR compositing is skipped gracefully.
  let spotTrackingCode: string | null = null;
  if (d.spotId != null) {
    try {
      const [spotRow] = await db
        .select({ trackingCode: spotsTable.trackingCode })
        .from(spotsTable)
        .where(eq(spotsTable.id, d.spotId))
        .limit(1);
      spotTrackingCode = spotRow?.trackingCode ?? null;
    } catch (tcErr) {
      req.log.warn({ tcErr, spotId: d.spotId }, "grok-imagine: failed to load tracking code — QR compositing will be skipped");
    }
  }

  const menuStr     = d.menu.filter(Boolean).map((m, i) => `  ${i + 1}. ${m}`).join("\n") || "  (none)";
  const menuCount   = d.menu.filter(Boolean).length;
  const fullAddress = [d.address, d.city].filter(Boolean).join(", ") || "(none)";
  const hasPhoto    = !!d.photoUrl;
  const hasLogo     = !!d.logoData;
  const ipc         = getIndustryPhotos(d.industry);

  // Website is intentionally excluded — a QR code graphic replaces it in the footer
  const businessBlock = [
    `Business Name : ${d.bizName}`,
    `Tagline       : ${d.tagline  || "(none)"}`,
    `Phone         : ${d.phone    || "(none)"}`,
    `Address       : ${fullAddress}`,
    `Industry      : ${d.industry}`,
    `Menu/Services :\n${menuStr}`,
    `Special Offer : ${d.offer    || "(none)"}`,
    `Fine Print    : ${d.offerFine || "(none)"}`,
  ].join("\n");

  // Build image reference lines for the prompt — one per image in the `images` array order
  // Landscape spots now use their own template reference images (same indexing scheme as portrait).
  const refLines: string[] = [];
  let imgIdx: number;
  let logoImg: number;

  if (isLandscape) {
    imgIdx = 1;
    if (templateKey !== "surprise-me") {
      const lsTmplDesc =
        templateKey === "parchment-classic"
          ? "the full landscape postcard layout with warm parchment texture, orange bookmark-ribbon pennant at top-left, a sweeping horizontal dark brush-stroke band for the headline, orange circular checkmark service badges on the left column, a dashed dark rectangular coupon box, and a dark footer strip with phone icon + QR code. Reproduce every zone, texture, and design element exactly."
          : templateKey === "made-fresh"
            ? "the full landscape postcard layout with a warm wood-table background. A white ceramic plate and gingham cloth prop sit on the left; a chalkboard 'Made Fresh For You' A-frame sign sits upper-right. A white paint-stroke panel provides the business info zone; a golden ticket-stub coupon shape sits on the right. Reproduce all textures, props, zones, and atmospheric lighting exactly."
            : templateKey === "neighborhood-pro"
              ? "the full landscape postcard layout on a deep forest-green background. Upper-left: large white brush-stroke splash panel (headline zone). Upper-right: full-bleed hero photo area. Middle: horizontal row of four diagonal-cut service photo panels each topped by a circular lime-green icon badge and a white brush-stroke label below. Lower-center: wide white brush-stroke area (offer/coupon zone). Footer: dark green bar with phone icon left, location pin center-left, and QR code lower-right. Reproduce every zone and shape exactly."
              : templateKey === "at-your-service"
                ? "the full landscape postcard layout on a light gray/cream textured background. Upper-left: large dark navy hexagonal badge (logo zone). Gold/yellow horizontal brush-stroke sweeping across the upper area. Upper-right: large hero photo zone blending naturally into the background. Center: wide dark navy band spanning full width with four circular white icon service badges. Lower-right: gold/yellow dashed-border coupon box. Footer: location-pin icon + address left; phone icon + phone center; QR code right. Reproduce every zone, shape, and color exactly."
                : templateKey === "home-elegance"
                  ? "the full landscape postcard layout on a cream/off-white background with dark navy blue and gold accents. Left side (organic cream blob wave area): dark navy hexagonal house-icon badge top-left; navy-bordered rounded-rect business-name box, smaller tagline box, and additional text-field boxes inside the cream blob; phone icon + address icon lower-left. Right side: large hero photo upper-right blending naturally into bg; dark navy lower-right section with three overlapping circular photos (interior living room, kitchen, outdoor service scene); four rounded-rect service card tiles each topped by a circular dark navy icon badge (house, tools, leaf, people); QR code square far right. Reproduce every zone, the cream/navy/gold color scheme, and the footer layout exactly."
                  : templateKey === "sage-organic"
                  ? "the full landscape postcard layout on a cream/beige textured background with dark olive/sage green and kraft paper accents. Upper-left: large dark olive green circle with botanical leaf sprig illustrations. Upper-left area: large white/cream rounded-rectangle business-name zone; below it a sweeping dark olive green paint brush stroke. Upper-right: large hero photo (natural/organic interior, plants, natural light) filling a curved wave cutout shape, no hard border. Middle row: four dark olive green circular icon badges (award ribbon, people/team, handshake, shield/checkmark) with thin vertical dividers; four equal cream rounded-rect service card tiles below. Lower olive wave band: three equal-width landscape photos side by side (interior, shop, garden/outdoor). Lower-right: kraft paper textured rectangle with dashed stitched border and scissors icon (coupon zone). Footer: dark olive strip with location pin icon + address field left, QR code right. Reproduce exactly."
                  : templateKey === "purple-sage"
                  ? "the full landscape postcard layout on a cream/beige background with muted lavender-purple and sage green accents. Upper-left: large muted purple decorative circle + dot grid pattern; sage green botanical leaf sprig (left, decorative). Large white/cream rounded-rect business-name panel upper-left; sweeping purple paint brush stroke below it. Upper-right: large circular hero photo in sage green ring border. Lower-right: two smaller overlapping circular photos (kitchen, outdoor patio). Middle: four muted sage green circular icon badges (professional, award, team, shield) with thin dividers; four cream rounded-rect service tiles below. Lower section: muted purple wave/blob band, sage green brush stroke. Footer: dark purple strip — phone icon + oval pill left, location pin + oval pill center, QR right. Reproduce exactly."
                  : templateKey === "brush-stroke"
                  ? "the full landscape postcard layout on a cream/parchment background with dark olive green and charcoal accents. Left half: large circular hero photo framed by a dark organic brush-stroke swoosh curving around the left side. Upper-right: dark olive green hexagonal house-icon badge (logo zone). A wide horizontal olive green paint brush stroke sweeps across the upper-right area — this is the headline/business-name zone. Thin dark horizontal rule with a small diamond separator below the brush stroke. Below: a horizontal row of four service columns, each with a circular olive-bordered icon badge on top (house, paint roller, crossed tools, water-tap faucet) and a short dark charcoal horizontal brush-stroke label in white below it. Footer: wide dark charcoal curved-top band spanning full width — circular phone icon + field left, circular location pin + field center, QR code square right. Reproduce every zone, the cream/olive/charcoal palette, the circular photo frame, and the footer exactly."
                  : templateKey === "wok-fire"
                    ? "the full landscape postcard layout on a near-black background with deep red, gold, and parchment accents. Upper-left: large torn-edge deep red paper panel (headline zone) with a gold bookmark-ribbon pennant at top-left corner and three gold circular brad accents along its left edge. Upper-right: large hero photo zone with natural edges — no hard rectangular border. Center: wide horizontal parchment/kraft torn-edge paper banner (tagline zone). Lower-left: golden ticket-stub coupon shape with dashed border and notched edges. Lower-right: dark chalkboard A-frame sign with wood frame (menu/services zone). Footer: location pin icon + address pill left, phone icon + phone pill center, QR code square right, gold arrow accent. Reproduce every zone and the footer layout exactly."
                    : "the full landscape postcard layout on a soft cream/off-white background. Upper-left: clinic/office photo inside an organic curved teal blob shape. Upper-center: large wide rounded-rectangle white headline panel; below it a teal pill-shaped tagline bar. Middle: four equal-width service panels with circular teal icon badges on top and white rounded-rectangle text boxes below. Lower-left: reception photo in an organic teal blob. Lower-right: stethoscope on a dark teal circular blob, plus a small white rounded QR box. Right edge: anatomical spine model prop. Footer: dark teal bar — circular phone icon badge + phone left; circular location pin icon badge + address right. Reproduce every zone, blob shape, and layout exactly.";
      refLines.push(`  • IMAGE ${imgIdx++} (LANDSCAPE TEMPLATE) — ${lsTmplDesc}`);
    }
    if (hasPhoto) {
      refLines.push(`  • IMAGE ${imgIdx++} (HERO PHOTO) — the product/service photograph. Seamlessly composite it into the hero photo zone with professional lighting and natural edge blending — no hard rectangular border.`);
    }
    logoImg = imgIdx;
    if (hasLogo) {
      refLines.push(`  • IMAGE ${imgIdx} (BUSINESS LOGO) — the exact business logo. Reproduce it pixel-perfect with no stylization, color changes, or distortion.`);
    }
  } else {
    refLines.push(
      templateKey === "made-fresh"
        ? "  • IMAGE 1 (TEMPLATE) — a bright, warm restaurant postcard layout featuring a natural wood table surface, " +
          "a chalkboard-style 'Made Fresh For You' sign, gingham cloth accents, a golden ticket coupon stub, " +
          "and a fresh white plate as the hero focal point. Preserve all zones, props, and warm editorial atmosphere exactly."
        : templateKey === "neighborhood-pro"
          ? "  • IMAGE 1 (TEMPLATE) — a bold outdoor-service postcard layout on a deep forest-green background. " +
            "Upper-left: two overlapping white paint-brush splash shapes that form a bright organic panel for the headline text. " +
            "Upper-right: large full-bleed hero photo zone (outdoor/service scene). " +
            "Middle band: a horizontal row of four diagonal-cut service photo panels, each topped by a circular green icon badge and a short white brush-stroke label beneath it. " +
            "Lower section: a wide white brush-stroke area for the special offer / coupon text. " +
            "Footer strip: dark green bar with a bold phone number on the left, a clean QR code box on the right, and three small circular decorative icon graphics between them. " +
            "Reproduce every zone, the forest-green background, all brush-stroke shapes, and the footer layout exactly."
          : templateKey === "at-your-service"
            ? "  • IMAGE 1 (TEMPLATE) — a home-services postcard on a light gray/off-white textured background with a navy blue and gold/yellow color scheme. " +
              "Upper-left: a large dark navy hexagonal badge emblem with a gold/yellow interior accent — this is the logo zone. " +
              "A bold horizontal gold/yellow paint-brush stroke sweeps across the upper third of the layout connecting the logo badge to the photo zone. " +
              "Upper-right: large hero photo zone blending naturally into the background without a hard border. " +
              "Center: a wide dark navy blue horizontal band spanning the full width. " +
              "On the navy band: a horizontal row of six circular white icon badges showing home-service icons (house, paint roller, lightbulb, faucet, door, wrench/tools). " +
              "Lower-right: a gold/yellow dashed-border coupon box. Lower-left: small gold/yellow triangle accent. " +
              "Footer: dark strip with a circular phone icon on the left and a QR code square on the right. " +
              "Reproduce every zone, the navy/gold color scheme, all geometric and brush-stroke shapes, and the footer layout exactly."
            : templateKey === "home-elegance"
              ? "  • IMAGE 1 (TEMPLATE) — a premium home-services postcard on a cream/off-white background with dark navy blue and gold accents. " +
                "Top-left: a dark navy hexagonal badge with a house/rooftop icon. " +
                "Upper-right: large hero photo (beautiful home exterior with landscaping) bleeding off the right and top edges, no hard border. " +
                "Left-center: a large organic cream/white blob wave shape containing a small house icon at top, a dark navy-bordered rounded-rectangle business-name box, a smaller rounded-rectangle tagline box, and a small gold dot separator. " +
                "Middle section: three overlapping circular photos (interior living room, kitchen, outdoor garden/service scene) arranged horizontally. " +
                "Lower section: a wide dark navy area with four equal rounded-rectangle service card tiles — each tile has a circular dark navy icon badge on top (house, tools, leaf, people icons) and a cream card body below. " +
                "Footer: dark navy strip — phone icon + phone left, address icon + field center-left, QR code right. " +
                "Reproduce every zone, the cream/navy/gold color scheme, all blob shapes, and the footer exactly."
              : templateKey === "sage-organic"
              ? "  • IMAGE 1 (TEMPLATE) — a botanical organic postcard on a cream/beige textured background with dark olive/sage green and kraft paper accents. " +
                "Top-left: large dark olive green circle with botanical leaf sprig illustrations (decorative accent, NOT a logo zone). " +
                "Upper-left: large white/cream rounded-rectangle business-name panel. Below it: a sweeping dark olive green paint brush stroke. " +
                "Upper-right: large hero photo (natural/organic interior or garden scene) in a curved wave cutout shape, no hard rectangular border. " +
                "Middle: four dark olive green circular icon badges (award ribbon, people/team, handshake, shield/checkmark) with thin vertical dividers between them; four equal cream rounded-rect service card tiles below. " +
                "Lower section: dark olive green wave/brush-stroke band with three equal-width landscape photos side by side (interior, shop, outdoor/garden). " +
                "Lower-right: kraft paper/cardboard textured rectangle with dashed stitched border and scissors icon (coupon zone). " +
                "Footer: dark olive green strip — location pin icon + address field left, QR code right. " +
                "Reproduce every zone, the cream/olive/kraft color scheme, all botanical elements, and the footer exactly."
              : templateKey === "purple-sage"
              ? "  • IMAGE 1 (TEMPLATE) — a premium lifestyle/home-services postcard on a cream/beige background with muted lavender-purple and sage green accents. " +
                "Top-left: large muted purple decorative circle + dot grid pattern (NOT a logo zone). Left side: sage green botanical leaf sprig (decorative). " +
                "Upper-left: large white/cream rounded-rectangle business-name panel. Below it: a sweeping muted purple paint brush stroke. " +
                "Upper-right: large circular hero photo (organic interior scene, plants, natural light) in a sage green ring border — perfectly circular, no rectangular frame. " +
                "Lower-right: two smaller overlapping circular photos (kitchen/dining scene, outdoor patio/pergola). " +
                "Middle: four muted sage green circular icon badges (professional, award/ribbon, team/people, shield) with thin vertical dividers between them; four cream rounded-rect service card tiles below. " +
                "Lower section: muted lavender-purple organic wave/blob band spanning full width; sage green brush stroke accent. " +
                "Footer: dark purple strip — phone icon + oval pill field left, location pin icon + oval pill field center, QR code right. " +
                "Reproduce every zone, the cream/purple/sage color scheme, all circular photo frames, and the footer exactly."
              : templateKey === "brush-stroke"
              ? "  • IMAGE 1 (TEMPLATE) — a home-services postcard on a cream/parchment background with dark olive green and charcoal accents. " +
                "Left half: large circular hero photo framed by a dark organic brush-stroke swoosh curving around the left side of the circle — no hard rectangular border outside the circle. " +
                "Upper-right: a dark olive green hexagonal house-icon badge (this is the logo zone). " +
                "A wide horizontal olive green paint brush stroke sweeps across the upper-right — this is the business-name headline zone. " +
                "Below the brush stroke: a thin dark horizontal rule with a small olive diamond separator in the center. " +
                "Middle-right: a vertical column of four service rows — each row has a circular olive-bordered icon badge (house, paint roller, crossed wrench/tools, water-tap faucet) on the left and a short dark charcoal horizontal brush-stroke shape with white text on the right. " +
                "Footer: wide dark charcoal curved-top band spanning full width — circular phone icon + text field left, circular location pin + text field center, QR code square right. " +
                "Reproduce every zone, the cream/olive/charcoal color scheme, all brush-stroke shapes, the circular photo frame, and the footer exactly."
            : templateKey === "health-wellness"
              ? "  • IMAGE 1 (TEMPLATE) — a health and wellness postcard on a soft cream/off-white background with teal and sage green accents. " +
                "Upper section: two overlapping clinic/office photos arranged inside organic curved teal blob shapes that bleed off the top and right edges. " +
                "Center: a large wide rounded-rectangle white panel — this is the headline/business-name zone. " +
                "Below the headline panel: a narrow teal pill-shaped bar for the tagline or sub-headline. " +
                "Middle section: four equal-width service panels side by side, each with a circular teal badge icon on top and a white rounded-rectangle text box beneath it. " +
                "Lower section: a reception/waiting-room photo in an organic curved blob shape on the left, and a teal stethoscope on a dark teal circular blob on the right. " +
                "Lower-right corner: a small white rounded square — this is the QR/contact box. " +
                "Footer: a dark teal horizontal bar spanning the full width. Left side has a circular phone icon badge + phone number field; right side has a circular location pin icon badge + address field. " +
                "Color palette: teal (#3d8b9c), sage green, cream/off-white. Reproduce every zone, blob shape, icon badge style, and footer layout exactly."
              : templateKey === "wok-fire"
              ? "  • IMAGE 1 (TEMPLATE) — a dramatic dark restaurant/food postcard on a near-black background with deep red, gold, and parchment accents. " +
                "Upper-left: large torn-edge deep red paper panel (headline/business-name zone) with a gold bookmark-ribbon pennant at its top-left corner and three gold circular brad accents along its left edge. " +
                "Upper-right: large hero photo zone — no hard rectangular border, natural edges blending into the dark background. " +
                "Center: wide horizontal parchment/kraft torn-edge paper banner (tagline zone). " +
                "Lower-left: golden ticket-stub coupon shape with dashed stitched border and notched edges. " +
                "Lower-right: dark chalkboard A-frame sign with wood frame (menu/services zone). " +
                "Footer: location pin icon + address pill left, phone icon + phone pill center-left, QR code square right, gold arrow accent. " +
                "Reproduce every zone, the near-black/red/gold/parchment color scheme, and the footer layout exactly."
              : "  • IMAGE 1 (TEMPLATE) — the full postcard layout with parchment texture, brush-stroke band, " +
                "pennant ribbon, circular checkmark badge, dashed coupon box, and dark footer strip. " +
                "Reproduce every zone, texture, and design element exactly.",
    );
    imgIdx = 2;
    if (hasPhoto) {
      refLines.push(`  • IMAGE ${imgIdx++} (HERO FOOD PHOTO) — the actual food/product photograph. Composite it into the main hero image zone with professional lighting and realistic shadow blending.`);
    }
    if (hasLogo) {
      refLines.push(`  • IMAGE ${imgIdx} (BUSINESS LOGO) — the exact business logo. Reproduce it pixel-perfect with no stylization, color changes, or distortion.`);
    }
    logoImg = hasPhoto ? 3 : 2;
  }
  const outputRequirements = isLandscape && templateKey === "parchment-classic"
    ? (
      "LAYOUT — reproduce the Parchment Classic LANDSCAPE template zones exactly:\n\n" +
      "  ZONE 1 — HEADLINE (dark horizontal brush-stroke band, upper area):\n" +
      `    Business name "${d.bizName}" in bold condensed all-caps slab serif, white or cream, rendered inside the dark brush-stroke sweep.\n` +
      `    ONLY IF the name has a common English category noun (Cafe, Grill, Pizza, Bar, etc.) — render ONLY that word in a flowing warm orange script. NEVER repeat any word.\n\n` +
      (hasLogo
        ? `  ZONE 2 — LOGO (orange bookmark-ribbon pennant, top-left corner):\n` +
          `    IMAGE ${logoImg} centered inside the orange pennant. Scale to fit with clear margin; preserve exact logo colors.\n` +
          (d.tagline ? `    Tagline: "${d.tagline}" in italic script beside the pennant.\n` : "") + "\n"
        : (d.tagline ? `  ZONE 2 — TAGLINE: "${d.tagline}" in italic script beside the pennant.\n\n` : "")) +
      "  ZONE 3 — SERVICE LIST (left column, parchment area):\n" +
      (menuStr !== "  (none)"
        ? `    Orange circular checkmark badges listing: ${menuStr}\n    Each item exactly once.\n\n`
        : "    Four orange circular checkmark badge items with relevant services for this business type.\n\n") +
      (hasPhoto
        ? `  ZONE 4 — HERO PHOTO (right-center area):\n    Composite IMAGE 2 into the right portion — blend edges into the parchment texture, no hard rectangular border. Cinematic lighting.\n\n`
        : "") +
      (d.offer
        ? `  ZONE 5 — COUPON (dashed dark rectangular box, lower-right):\n` +
          `    Inside: "${d.offer}" in bold white or cream text, large and prominent.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" smaller below.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +
      buildFooterZone(d.phone || "", fullAddress, "inline-icon") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps slab serif, white on dark brush-stroke\n" +
      "  • Script: warm orange, single English category noun only; never proper nouns\n" +
      "  • TEXT LEGIBILITY: every text element must be clearly readable — dark text on light zones, light text on dark zones. If any zone background is ambiguous, add a semi-opaque backing panel. Subtle 1px shadows are NOT sufficient.\n" +
      "  • NEVER render website URL as text"
    )
    : isLandscape && templateKey === "made-fresh"
    ? (
      "LAYOUT — reproduce the Made Fresh LANDSCAPE template zones exactly:\n\n" +
      "  BACKGROUND: the warm wood-table scene — gingham cloth, white plate, chalkboard 'Made Fresh For You' A-frame sign, and plant props — all exactly as in the template.\n\n" +
      (hasPhoto
        ? "  HERO FOOD PHOTO: Composite IMAGE 2 as the featured dish — place it on or near the white plate as the hero food item. Match warm editorial lighting.\n\n"
        : "") +
      `  ZONE A — WHITE PAINT-STROKE PANEL (lower-left, over the table):\n` +
      `    Business name "${d.bizName}" in bold condensed all-caps slab serif — large, dark, prominent.\n` +
      (d.tagline ? `    Tagline: "${d.tagline}" in handwriting-style italic script below the business name.\n` : "") +
      (hasLogo ? `    Logo (IMAGE ${logoImg}): upper corner of the white panel; preserve exact colors.\n` : "") + "\n" +
      (d.offer
        ? `  ZONE B — GOLDEN TICKET-STUB COUPON (lower-right):\n` +
          `    Inside: "${d.offer}" in bold dark text, large and prominent.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" smaller below.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +
      buildFooterZone(d.phone || "", fullAddress, "inline-icon") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Business name: bold condensed all-caps slab serif, dark on white panel\n" +
      "  • Tagline: handwriting-style italic, slightly smaller\n" +
      "  • TEXT LEGIBILITY: every text element must be clearly readable — dark text on light zones, light text on dark zones. If any zone background is ambiguous, add a semi-opaque backing panel. Subtle 1px shadows are NOT sufficient.\n" +
      "  • NEVER render website URL as text"
    )
    : isLandscape && templateKey === "neighborhood-pro"
    ? (
      "LAYOUT — reproduce the Neighborhood Pro LANDSCAPE template zones exactly:\n\n" +
      "  ZONE 1 — HEADLINE (upper-left, white brush-stroke splash panel):\n" +
      `    Business name "${d.bizName}" in bold condensed all-caps slab serif — very large, dark green or near-black.\n` +
      `    ONLY IF the name has a common English service-category word (Lawn, Cleaning, Roofing, etc.) — render ONLY that word in bright lime-green script at a slight angle. NEVER repeat any word.\n\n` +
      (hasLogo
        ? `  ZONE 1B — LOGO (IMAGE ${logoImg} inside the white brush-stroke panel). Scale to fit; preserve exact colors.\n` +
          (d.tagline ? `    Tagline: "${d.tagline}" in italic script, dark green, inside the white area.\n` : "") + "\n"
        : (d.tagline ? `  ZONE 1B — TAGLINE: "${d.tagline}" in italic script, dark green, inside the white splash area.\n\n` : "")) +
      "  ZONE 2 — HERO PHOTO (upper-right, full-bleed):\n" +
      (hasPhoto
        ? `    Seamlessly composite IMAGE 2 into the upper-right zone. Clean diagonal/curved cut where photo meets the green background. No rectangular border.\n\n`
        : `    Generate a photorealistic image: ${ipc.outdoor}. Full bleed into upper-right zone; no rectangular border.\n\n`) +
      "  ZONE 3 — SERVICE PANELS (middle horizontal row):\n" +
      (menuStr !== "  (none)"
        ? `    Render EXACTLY ${menuCount} diagonal-cut photo panel${menuCount !== 1 ? "s" : ""} — one per service listed. ` +
          "Do NOT add extra panels to fill unused slots, and do NOT place the Special Offer in any panel.\n" +
          "    Each panel: circular lime-green icon badge on top, white brush-stroke label below.\n" +
          `    Services: ${menuStr}\n    Each item exactly once.\n\n`
        : "    Four diagonal-cut photo panels, each with a circular lime-green icon badge on top and a white brush-stroke label below. Relevant service types for this business.\n\n") +
      (d.offer
        ? `  ZONE 4 — OFFER (wide white brush-stroke area, lower section):\n` +
          `    "${d.offer}" in bold dark-green text, large and prominent.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" smaller below.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +
      buildFooterZone(d.phone || "", fullAddress, "inline-icon") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps slab serif, dark green or near-black\n" +
      "  • Script: bright lime-green, single English service-category noun only\n" +
      "  • TEXT LEGIBILITY: every text element must be clearly readable — dark text on light zones, light text on dark zones. If any zone background is ambiguous, add a semi-opaque backing panel. Subtle 1px shadows are NOT sufficient.\n" +
      "  • NEVER render website URL as text"
    )
    : isLandscape && templateKey === "at-your-service"
    ? (
      "LAYOUT — reproduce the At Your Service LANDSCAPE template zones exactly:\n\n" +
      (hasLogo
        ? `  ZONE 1 — LOGO (IMAGE ${logoImg} centered inside the dark navy hexagonal badge, upper-left). Scale to fit; preserve exact colors.\n\n`
        : "") +
      `  ZONE 2 — HEADLINE (beside the hexagonal badge, upper-left):\n` +
      `    Business name "${d.bizName}" in bold condensed all-caps slab serif — very large, dark navy blue.\n` +
      `    ONLY IF the name has a common English service-category noun — render ONLY that word in gold/yellow script. NEVER repeat any word.\n` +
      (d.tagline ? `    Tagline: "${d.tagline}" in clean italic script, dark navy, below the headline.\n` : "") + "\n" +
      "  ZONE 3 — HERO PHOTO (upper-right, large photo zone):\n" +
      (hasPhoto
        ? `    Composite IMAGE 2 — blend left edge into the background; gold brush-stroke overlaps the photo at top. No hard border.\n\n`
        : `    Generate a photorealistic image: ${ipc.hero}. Fill upper-right zone, left edge blends naturally.\n\n`) +
      "  ZONE 4 — SERVICE BADGES (wide dark navy band, center full width):\n" +
      "    Four circular white icon service badges on the navy band.\n" +
      (menuStr !== "  (none)"
        ? `    Use icons for: ${menuStr}\n    Each service once only.\n\n`
        : "    Use home-service icons (house, paint roller, wrench, lightbulb). Each once only.\n\n") +
      (d.offer
        ? `  ZONE 5 — COUPON (gold/yellow dashed-border box, lower-right):\n` +
          `    "${d.offer}" in bold dark navy text, prominent.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" smaller below.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +
      buildFooterZone(d.phone || "", fullAddress, "circular-badge") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps slab serif, dark navy blue\n" +
      "  • Script: gold/yellow, single English service-category noun only\n" +
      "  • Gold/yellow brush stroke must remain visible in the upper area\n" +
      "  • TEXT LEGIBILITY: every text element must be clearly readable — dark text on light zones, light text on dark zones. If any zone background is ambiguous, add a semi-opaque backing panel. Subtle 1px shadows are NOT sufficient.\n" +
      "  • NEVER render website URL as text"
    )
    : isLandscape && templateKey === "health-wellness"
    ? (
      "LAYOUT — reproduce the Health & Wellness LANDSCAPE template zones exactly:\n\n" +
      "  ZONE 1 — PHOTOS (upper area, inside organic teal blob shapes):\n" +
      (hasPhoto
        ? `    Composite IMAGE 2 into the upper-left organic teal blob zone — edges blend naturally into the teal shape. Professional wellness lighting.\n` +
          "    Generate a complementary second clinic or wellness image for any remaining blob zone.\n\n"
        : `    Generate two photorealistic images for the teal blob zones: (1) ${ipc.p1}; (2) ${ipc.p2}. Edges blend naturally — no rectangular borders.\n\n`) +
      `  ZONE 2 — HEADLINE (large rounded-rectangle white panel, upper-center):\n` +
      `    "${d.bizName}" in bold condensed all-caps sans-serif — very large, dark teal or near-black. Each word EXACTLY ONCE — NEVER repeat.\n\n` +
      (d.tagline ? `  ZONE 3 — TAGLINE (teal pill-shaped bar below the white panel):\n    "${d.tagline}" in clean white sans-serif, centered inside the teal pill bar.\n\n` : "") +
      (menuStr !== "  (none)"
        ? `  ZONE 4 — SERVICE PANELS (EXACTLY ${menuCount} equal-width panel${menuCount !== 1 ? "s" : ""}, middle section):\n` +
          `    Render EXACTLY ${menuCount} panel${menuCount !== 1 ? "s" : ""} — do NOT add extras to fill unused slots, and do NOT place the Special Offer in any panel.\n` +
          "    Circular teal icon badge on top + white rounded-rectangle text box below per panel.\n" +
          `    Services: ${menuStr}\n    Each service exactly once.\n\n`
        : "  ZONE 4 — SERVICE PANELS (four equal-width, middle section):\n" +
          "    Circular teal icon badge on top + white rounded-rectangle text box below per panel.\n" +
          "    Relevant wellness/medical services for this practice. Each once only.\n\n") +
      (hasLogo ? `  LOGO: IMAGE ${logoImg} in an upper corner or within the headline panel. Preserve exact colors.\n\n` : "") +
      (d.offer
        ? `  ZONE 5 — OFFER (its own visually distinct zone — a teal-bordered rectangle, contrasting panel, or dashed coupon box; NEVER merged with or placed adjacent to the service panels):\n` +
          `    "${d.offer}" prominently inside this dedicated offer zone — large, bold text.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" smaller below, inside the same offer zone.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +
      buildFooterZone(d.phone || "", fullAddress, "circular-badge") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps sans-serif, dark teal or near-black\n" +
      "  • NEVER repeat any word from the business name\n" +
      "  • TEXT LEGIBILITY: every text element must be clearly readable — dark text on light zones, light text on dark zones. If any zone background is ambiguous, add a semi-opaque backing panel. Subtle 1px shadows are NOT sufficient.\n" +
      "  • NEVER render website URL as text"
    )
    : isLandscape && templateKey === "brush-stroke"
    ? (
      "LAYOUT — reproduce the Brush Stroke LANDSCAPE template zones exactly:\n\n" +

      "  ZONE 1 — HERO PHOTO (left half, large circular frame with dark swoosh border):\n" +
      (hasPhoto
        ? `    Composite IMAGE 2 into the large circular photo frame on the left half — a dark organic brush-stroke swoosh curves around the left side; keep it visible as a framing element. Blend edges naturally into the circular mask — no hard rectangular border. Professional cinematic lighting.\n\n`
        : `    Generate a photorealistic hero scene: ${ipc.hero}. Place inside the large circular frame with the dark organic swoosh curving around the left. No rectangular border.\n\n`) +

      "  ZONE 2 — LOGO BADGE (upper-right, dark olive green hexagonal badge):\n" +
      (hasLogo
        ? `    Place IMAGE ${logoImg} centered inside the dark olive green hexagonal house-icon badge upper-right. Scale to fit with clear margin — preserve exact logo colors and proportions.\n` +
          (d.tagline ? `    Tagline: "${d.tagline}" below the badge in clean italic, dark charcoal.\n` : "") +
          "\n"
        : d.tagline
          ? `  ZONE 2B — TAGLINE:\n    "${d.tagline}" in clean italic, dark charcoal, below the hexagonal badge.\n\n`
          : "") +

      "  ZONE 3 — BUSINESS NAME (inside the wide horizontal olive green brush-stroke band, upper-right):\n" +
      `    "${d.bizName}" in bold condensed all-caps sans-serif — large, white or cream, clearly legible against the olive green background.\n` +
      `    CRITICAL: Render the name EXACTLY — "${d.bizName}". Each word EXACTLY ONCE. NEVER repeat any word.\n` +
      "    Below the band: a thin dark horizontal rule with a small olive diamond separator in the center.\n\n" +

      (menuStr !== "  (none)"
        ? `  ZONE 4 — SERVICE COLUMNS (EXACTLY ${menuCount} column${menuCount !== 1 ? "s" : ""}, horizontal row below the diamond rule, right side):\n` +
          `    Render EXACTLY ${menuCount} column${menuCount !== 1 ? "s" : ""}. Do NOT add more columns or place the Special Offer here.\n` +
          "    Each column has TWO elements stacked:\n" +
          "    TOP: a circular olive-bordered icon badge with a relevant home-services icon (house, paint roller, crossed wrench/tools, faucet/water-tap, leaf, lightbulb, etc.)\n" +
          "    BOTTOM: a short dark charcoal horizontal brush-stroke shape with the service name in white or cream text\n" +
          `    Services: ${menuStr}\n` +
          "    Each service exactly once — never repeat.\n\n"
        : "  ZONE 4 — SERVICE COLUMNS (horizontal row, right side):\n" +
          "    Four columns. Each: circular olive-bordered icon badge on top (house, paint roller, crossed tools, water-tap) + dark charcoal brush-stroke label with white text below.\n\n") +

      (d.offer
        ? `  ZONE 5 — SPECIAL OFFER (visually distinct zone — a white rounded-rect or lightly outlined box, separate from service columns):\n` +
          `    "${d.offer}" in bold dark or olive text, prominently inside this dedicated zone.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" smaller below.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this offer zone.\n\n"
        : "") +

      buildFooterZone(d.phone || "", fullAddress, "circular-badge") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Business name: bold condensed all-caps sans-serif, white/cream inside the olive green brush-stroke band\n" +
      "  • Service labels: white/cream text inside dark charcoal brush-stroke shapes\n" +
      "  • NEVER repeat any word from the business name\n" +
      "  • NEVER render the website URL as visible text\n" +
      "  • NEVER render any hex color code or CSS value as visible text anywhere in the ad"
    )
    : isLandscape && templateKey === "wok-fire"
    ? (
      "LAYOUT — reproduce the Wok Fire LANDSCAPE template zones exactly:\n\n" +

      "  BACKGROUND: near-black with deep red, gold, and parchment accents throughout.\n\n" +

      (hasLogo
        ? `  ZONE 1 — LOGO (IMAGE ${logoImg} inside the gold bookmark-ribbon pennant, top-left corner of the red panel). Scale to fit with clear margin; preserve exact logo colors.\n` +
          (d.tagline ? `    Tagline: "${d.tagline}" in italic script, gold or cream, inside the red panel below the headline.\n` : "") +
          "\n"
        : d.tagline
          ? `  TAGLINE: "${d.tagline}" in italic script, gold or cream, inside the red panel below the headline.\n\n`
          : "") +

      `  ZONE 2 — HEADLINE (upper-left, inside the torn-edge deep red paper panel):\n` +
      `    "${d.bizName}" in bold condensed all-caps slab serif — very large, white or cream, maximum weight.\n` +
      `    CRITICAL: Render EXACTLY "${d.bizName}". Each word EXACTLY ONCE. NEVER repeat.\n\n` +

      "  ZONE 3 — HERO PHOTO (upper-right, wok/cooking action scene with flames):\n" +
      (hasPhoto
        ? `    Composite IMAGE 2 — dramatic cooking scene. Natural edges blending into dark background; no hard rectangular border. Cinematic lighting with flame and steam effects.\n\n`
        : `    Generate a dramatic photorealistic hero scene: ${ipc.hero}. Natural edges blending into dark background; no hard border.\n\n`) +

      (d.tagline
        ? `  ZONE 4 — TAGLINE BANNER (center, wide parchment/kraft torn-edge banner):\n` +
          `    Render "${d.tagline}" in dark serif or italic script on the parchment banner surface.\n\n`
        : "") +

      (d.offer
        ? `  ZONE 5 — COUPON (lower-left, golden ticket-stub — dashed stitched border, notched edges):\n` +
          `    "${d.offer}" in bold dark text inside the golden ticket-stub. Large and prominent.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" smaller below.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone.\n\n"
        : "") +

      (menuStr !== "  (none)"
        ? `  ZONE 6 — MENU/SERVICES (dark chalkboard A-frame sign, lower-right — EXACTLY ${menuCount} item${menuCount !== 1 ? "s" : ""}):\n` +
          `    Render EXACTLY ${menuCount} item${menuCount !== 1 ? "s" : ""} in white chalk-style text on the chalkboard surface. Wood frame visible. Do NOT add extras.\n` +
          `    Items: ${menuStr}\n    Each item exactly once.\n\n`
        : "  ZONE 6 — CHALKBOARD SIGN (lower-right): dark chalkboard A-frame with wood frame — leave board surface clean (no services provided).\n\n") +

      buildFooterZone(d.phone || "", fullAddress, "inline-icon") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps slab serif, white or cream, inside the deep red torn-paper panel\n" +
      "  • NEVER repeat any word from the business name\n" +
      "  • NEVER render the website URL as visible text\n" +
      "  • NEVER render any hex color code or CSS value as visible text anywhere in the ad"
    )
    : isLandscape
    ? (
      "You are completing a postcard ad using the provided \n" +
      "template image.\n\n" +
      "TEMPLATE INSTRUCTIONS:\n" +
      "  Follow the layout zones in the reference image exactly.\n" +
      "  The template has been color-transformed — use the colors\n" +
      "  shown in the reference image. Do not revert to any\n" +
      "  original or default color palette.\n" +
      "  This is landscape format — 3 inches wide by 2 inches tall. Arrange content zones horizontally.\n\n" +
      "BUSINESS CONTENT TO PLACE:\n" +
      `  HEADLINE: "${d.bizName}" — very large, dominant, placed\n` +
      "  in the headline zone shown in the template.\n" +
      (d.tagline ? `  TAGLINE: "${d.tagline}" — secondary prominence below headline.\n` : "") +
      "  HERO PHOTO: " + (hasPhoto
        ? "Supplied photo — composite into hero zone with organic edge blending. No hard rectangular border."
        : `Generate a photorealistic image: ${ipc.hero}. Residential and human scale.`) + "\n" +
      (hasLogo ? "  LOGO: Reproduce supplied logo pixel-perfect in logo zone. Zero stylization.\n" : "") +
      "  SERVICES: Place each service item in the service list zone exactly once.\n" +
      "  OFFER: Place special offer text in the coupon/offer zone.\n" +
      "  FOOTER: Phone number left, address below phone, QR code right.\n\n" +
      "QUALITY RULES:\n" +
      "  Follow template layout zones exactly\n" +
      "  Use template color palette shown — do not override\n" +
      "  All text has drop shadows or dark-field backlighting\n" +
      "  No hard rectangular photo borders\n" +
      "  No text floating on bare flat color\n" +
      "  No layout words as visible text (CENTER LEFT RIGHT ZONE)\n" +
      "  No content not provided in the business data below"
    )
    : templateKey === "neighborhood-pro"
    ? (
      "LAYOUT — reproduce the Neighborhood Pro template zones exactly as described:\n\n" +

      "  ZONE 1 — HEADLINE (upper-left, inside the white brush-stroke splash panel):\n" +
      `    Business name "${d.bizName}" rendered in bold condensed all-caps slab serif — very large, dark green or near-black, maximum weight, horizontal (no angle). ` +
      `    The text sits INSIDE the white paint-brush splash area; the white shape is the background for this headline.\n` +
      `    ONLY IF the business name contains a widely-recognised English business-category word (e.g. "Lawn", "Care", "Cleaning", "Roofing", "Plumbing", "Dental", "Grill", "Pizza") — render ONLY that one word in a flowing bright-green or lime-green script/cursive at a slight angle, large size. Do NOT apply to proper nouns or brand names. If no such word exists, use all-caps treatment only. NEVER repeat any word.\n\n` +

      (hasLogo
        ? `  ZONE 2 — LOGO${d.tagline ? " + TAGLINE" : ""} (inside the white brush-stroke panel, upper-left):\n` +
          `    Place IMAGE ${logoImg} inside the white brush-stroke splash area, above or beside the headline. Scale it to fit with clear margin — do not let it overflow the white shape. Preserve exact logo colors and proportions.\n` +
          (d.tagline ? `    Tagline: render "${d.tagline}" in a clean italic script, dark green, below the logo inside the white splash area.\n` : "") +
          "\n"
        : d.tagline
          ? `  ZONE 2 — TAGLINE (inside the white brush-stroke panel, below headline):\n` +
            `    "${d.tagline}" in a clean italic script, dark green, confident — placed inside the white splash area.\n\n`
          : "") +

      "  ZONE 3 — HERO IMAGE (upper-right, large full-bleed photo zone):\n" +
      (hasPhoto
        ? `    Take IMAGE 2 and SEAMLESSLY INTEGRATE it into the upper-right hero photo area:\n` +
          "    • Fill the entire upper-right zone with the photo — no rectangular frame or border.\n" +
          "    • Left edge: a clean diagonal or curved cut where photo meets the green background (match template exactly).\n" +
          "    • Professional outdoor lighting, vibrant color, cinematic quality. The photo must look native to the design.\n\n"
        : `    Generate a photorealistic image: ${ipc.outdoor}. Fill the entire upper-right zone with no rectangular border.\n\n`) +

      (menuStr !== "  (none)"
        ? `  ZONE 4 — SERVICES PANELS (EXACTLY ${menuCount} panel${menuCount !== 1 ? "s" : ""}, middle horizontal row):\n` +
          `    Render EXACTLY ${menuCount} diagonal-cut panel${menuCount !== 1 ? "s" : ""} — one per service listed. ` +
          "Do NOT add extra panels to fill unused template slots. Do NOT place the Special Offer in any service panel.\n" +
          "    Each panel: service photo behind diagonal-cut edge; circular dark-green badge with white icon above; short white brush-stroke label below.\n" +
          `    Services: ${menuStr}\n` +
          "    Each service name must appear exactly once across the entire ad.\n\n"
        : "  ZONE 4 — SERVICES PANELS (middle horizontal row):\n" +
          "    Reproduce the four diagonal-cut service photo panels from the template with relevant service imagery for this business type.\n" +
          "    Each panel has a circular green icon badge on top and a white brush-stroke label below.\n\n") +

      (d.offer
        ? "  ZONE 5 — SPECIAL OFFER (wide white brush-stroke area, lower section):\n" +
          `    Inside the large white brush-stroke shape: render "${d.offer}" in bold dark-green text, large and prominent.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" in smaller text below.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +

      buildFooterZone(d.phone || "", fullAddress, "inline-icon") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps slab serif, very large, dark green or near-black\n" +
      "  • Script accent: bright-green cursive ONLY for a single common English service-category noun in the business name — never for proper nouns or brand names; never duplicate any word\n" +
      "  • All text inside white brush-stroke areas: dark green or near-black for contrast\n" +
      "  • Fine print: smallest text, still legible\n" +
      "  • NEVER render the website URL as visible text"
    )
    : templateKey === "at-your-service"
    ? (
      "LAYOUT — reproduce the At Your Service template zones exactly as described:\n\n" +

      "  ZONE 1 — HEADLINE (upper-left, beside the hexagonal badge):\n" +
      `    Business name "${d.bizName}" in bold condensed all-caps slab serif — very large, dark navy blue, maximum weight, horizontal (no angle).\n` +
      `    ONLY IF the business name contains a widely-recognised English service-category word (e.g. "Plumbing", "Electric", "Roofing", "Painting", "Services", "Heating", "Cooling", "Lawn") — render ONLY that single word in a flowing gold/yellow script at a slight angle. Do NOT apply to proper nouns or brand names. If no such word exists, use all-caps only. NEVER repeat any word.\n\n` +

      (hasLogo
        ? `  ZONE 2 — LOGO (inside the navy hexagonal badge, upper-left):\n` +
          `    Place IMAGE ${logoImg} centered inside the dark navy hexagonal badge emblem. Scale it to fit with clear margin — it must not overflow the hexagon. Preserve exact logo colors and proportions. The hexagonal badge retains its dark navy border and gold/yellow accent fill.\n` +
          (d.tagline ? `    Tagline: render "${d.tagline}" in a clean italic script, navy blue, below the headline.\n` : "") +
          "\n"
        : d.tagline
          ? `  ZONE 2 — TAGLINE (below headline, upper-left):\n` +
            `    "${d.tagline}" in a clean italic script, dark navy blue, below the headline.\n\n`
          : "") +

      "  ZONE 3 — HERO IMAGE (upper-right, large photo zone):\n" +
      (hasPhoto
        ? `    Take IMAGE 2 and SEAMLESSLY INTEGRATE it into the upper-right hero photo zone:\n` +
          "    • Fill the entire upper-right area with the photo — blend the left edge naturally into the background; no hard rectangular border.\n" +
          "    • The gold/yellow brush stroke in the upper portion overlaps the photo zone — keep it visible overlapping the image.\n" +
          "    • Professional lighting, vibrant color, cinematic quality. Photo must look native to the design.\n\n"
        : `    Generate a photorealistic image: ${ipc.hero}. Fill the upper-right zone with no rectangular border, blending naturally into the off-white background.\n\n`) +

      "  ZONE 4 — SERVICE ICONS (on the navy horizontal band, center):\n" +
      "    Reproduce the wide dark navy blue horizontal band spanning the full card width.\n" +
      (menuStr !== "  (none)"
        ? `    On the band: a horizontal row of circular white icon badges, one per key service. Use icons representing: ${menuStr}. Keep the circular white badge style from the template. Each service must appear exactly once — no repeated labels or icons.\n\n`
        : "    On the band: a horizontal row of six circular white icon badges with home-service icons (house, paint roller, lightbulb, faucet, door, wrench/tools) as in the template.\n\n") +

      (d.offer
        ? "  ZONE 5 — SPECIAL OFFER (gold/yellow dashed-border coupon box, lower-right):\n" +
          `    Inside the gold/yellow dashed coupon rectangle: render "${d.offer}" in bold dark navy text, large and prominent.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" in smaller text below the offer.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +

      buildFooterZone(d.phone || "", fullAddress, "circular-badge") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps slab serif, very large, dark navy blue\n" +
      "  • Script accent: gold/yellow cursive ONLY for a single common English service-category noun — never for proper nouns or brand names; never duplicate any word\n" +
      "  • Gold/yellow brush stroke: must remain visible in the upper portion, overlapping the hero image zone\n" +
      "  • Fine print: smallest text, still legible\n" +
      "  • NEVER render the website URL as visible text"
    )
    : templateKey === "brush-stroke"
    ? (
      "LAYOUT — reproduce the Brush Stroke template zones exactly as described:\n\n" +

      "  ZONE 1 — HERO PHOTO (left half, inside the large circular frame with dark swoosh border):\n" +
      (hasPhoto
        ? `    Take IMAGE 2 and SEAMLESSLY COMPOSITE it into the large circular photo frame on the left half:\n` +
          "    • The photo sits inside a perfect circle. A dark organic brush-stroke swoosh curves around the left side — keep this dark swoosh visible as a framing element.\n" +
          "    • Blend edges naturally into the circular mask — no hard rectangular border outside the circle.\n" +
          "    • Professional lighting, cinematic quality.\n\n"
        : `    Generate a photorealistic hero scene: ${ipc.hero}. Place inside the large circular frame with the dark organic swoosh curving around the left. No rectangular border.\n\n`) +

      "  ZONE 2 — LOGO BADGE (upper-right, dark olive green hexagonal badge):\n" +
      (hasLogo
        ? `    Place IMAGE ${logoImg} centered inside the dark olive green hexagonal house-icon badge in the upper-right. Scale to fit with clear margin — preserve exact logo colors and proportions. The hexagonal badge retains its dark olive green border and house-icon styling.\n` +
          (d.tagline ? `    Tagline: "${d.tagline}" below the badge in clean italic, dark charcoal.\n` : "") +
          "\n"
        : d.tagline
          ? `  ZONE 2B — TAGLINE (upper-right, below hexagonal badge):\n    "${d.tagline}" in clean italic, dark charcoal.\n\n`
          : "") +

      "  ZONE 3 — BUSINESS NAME (inside the wide horizontal olive green brush-stroke band, upper-right):\n" +
      `    Render "${d.bizName}" in bold condensed all-caps sans-serif — large, white or cream, clearly legible against the olive green brush-stroke background.\n` +
      `    CRITICAL: Render the name EXACTLY — "${d.bizName}". Each word EXACTLY ONCE. NEVER repeat.\n` +
      "    Below the brush-stroke band: a thin dark horizontal rule with a small olive diamond separator in the center.\n\n" +

      (menuStr !== "  (none)"
        ? `  ZONE 4 — SERVICE ROWS (EXACTLY ${menuCount} row${menuCount !== 1 ? "s" : ""}, stacked vertically on the right side below the diamond rule):\n` +
          `    Render EXACTLY ${menuCount} row${menuCount !== 1 ? "s" : ""}. Do NOT add more rows or place the Special Offer in any row.\n` +
          "    Each row has TWO elements side by side:\n" +
          "    LEFT: a circular olive-bordered icon badge with a relevant home-services icon (house, paint roller, crossed wrench/tools, faucet/water-tap, leaf, lightbulb, etc.)\n" +
          "    RIGHT: a short dark charcoal horizontal brush-stroke shape with the service name in white or cream text inside it\n" +
          `    Services: ${menuStr}\n` +
          "    Each service exactly once — never repeat.\n\n"
        : "  ZONE 4 — SERVICE ROWS (right side, stacked vertically):\n" +
          "    Four rows stacked. Each: circular olive-bordered icon badge (house, paint roller, crossed tools, water-tap faucet) on the left + dark charcoal brush-stroke shape with white service label on the right.\n\n") +

      (d.offer
        ? "  ZONE 5 — SPECIAL OFFER (visually distinct area — white rounded-rect or lightly outlined box, clearly separated from service rows):\n" +
          `    Render "${d.offer}" in bold dark or olive text inside this dedicated offer zone.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" smaller below.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this offer zone.\n\n"
        : "") +

      buildFooterZone(d.phone || "", fullAddress, "circular-badge") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Business name: bold condensed all-caps sans-serif, white or cream inside the olive green brush-stroke band\n" +
      "  • Service labels: white or cream text inside dark charcoal brush-stroke shapes\n" +
      "  • NEVER repeat any word from the business name\n" +
      "  • Fine print: smallest text, still legible\n" +
      "  • NEVER render the website URL as visible text\n" +
      "  • NEVER render any hex color code or CSS value as visible text anywhere in the ad"
    )
    : templateKey === "health-wellness"
    ? (
      "LAYOUT — reproduce the Health & Wellness template zones exactly as described:\n\n" +

      "  ZONE 1 — HERO PHOTOS (upper section, inside organic teal blob shapes):\n" +
      (hasPhoto
        ? `    Seamlessly composite IMAGE 2 into the upper-right organic teal blob photo zone — no hard rectangular border, natural edges blending into the teal shape.\n` +
          "    Generate a second complementary wellness/clinic image for the upper-left blob zone.\n\n"
        : `    Generate two photorealistic images — one for each upper blob zone: (1) ${ipc.p1}; (2) ${ipc.p2}. No rectangular borders — blend naturally into the teal blob shapes.\n\n`) +

      "  ZONE 2 — HEADLINE (center, inside the large rounded-rectangle white panel):\n" +
      `    Business name: "${d.bizName}" in bold condensed all-caps sans-serif — very large, dark teal or near-black, maximum weight.\n` +
      `    CRITICAL: Render the business name EXACTLY as given — "${d.bizName}". ` +
      `    Each word must appear EXACTLY ONCE. NEVER repeat any individual word. If the name already contains a category word (e.g. "Chiropractic", "Wellness", "Health", "Dental"), do NOT add it again elsewhere.\n\n` +

      (d.tagline
        ? `  ZONE 3 — TAGLINE (teal pill-shaped bar below the white panel):\n` +
          `    Render "${d.tagline}" in clean white sans-serif, centered inside the teal pill bar.\n\n`
        : "") +

      (menuStr !== "  (none)"
        ? `  ZONE 4 — SERVICE PANELS (EXACTLY ${menuCount} equal-width panel${menuCount !== 1 ? "s" : ""}, middle section):\n` +
          `    Render EXACTLY ${menuCount} panel${menuCount !== 1 ? "s" : ""}. Do NOT add more panels to fill unused slots. Do NOT place the Special Offer in any service panel.\n` +
          "    Each panel has:\n" +
          "    • A circular teal badge with a white wellness/medical icon on top\n" +
          "    • A white rounded-rectangle text box below showing one service\n" +
          `    Use these services: ${menuStr}\n` +
          "    Each service must appear exactly once — never repeat.\n\n"
        : "  ZONE 4 — SERVICE PANELS (four equal-width panels, middle section):\n" +
          "    Reproduce the four-panel row with circular teal icon badges (spine, massage, leaf/wellness, doctor) and white rounded-rectangle text boxes relevant to this practice type.\n\n") +

      "  ZONE 5 — LOWER PHOTOS (organic blob shapes):\n" +
      `    Left: generate a photorealistic scene: ${ipc.interior}. Place inside an organic curved blob shape.\n` +
      "    Right: place a teal stethoscope or relevant medical prop on a dark teal circular blob shape.\n\n" +

      (d.offer
        ? "  ZONE 5B — SPECIAL OFFER:\n" +
          `    Render "${d.offer}" prominently in teal or dark text in an available white space area.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" in smaller text below.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +

      buildFooterZone(d.phone || "", fullAddress, "circular-badge") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Business name: bold condensed all-caps sans-serif, very large, dark teal or near-black\n" +
      "  • NEVER repeat any word from the business name — each word appears exactly once across the entire ad\n" +
      "  • Tagline: clean white sans-serif inside the teal pill bar, centered\n" +
      "  • Service labels: clean dark sans-serif inside white rounded-rectangle boxes\n" +
      "  • Fine print: smallest text, still legible\n" +
      "  • NEVER render the website URL as visible text"
    )
    : templateKey === "wok-fire"
    ? (
      "LAYOUT — reproduce the Wok Fire template zones exactly as described:\n\n" +

      "  ZONE 1 — HEADLINE (upper-left, inside the large torn-edge deep red paper panel):\n" +
      `    "${d.bizName}" in bold condensed all-caps slab serif — very large, white or cream, maximum weight inside the red panel.\n` +
      `    CRITICAL: Render the name EXACTLY — "${d.bizName}". Each word EXACTLY ONCE. NEVER repeat.\n\n` +

      "  ZONE 2 — PENNANT / LOGO (gold bookmark-ribbon pennant, top-left corner of the red panel):\n" +
      (hasLogo
        ? `    Place IMAGE ${logoImg} centered inside the gold pennant ribbon. Scale to fit with clear margin; preserve exact logo colors.\n` +
          (d.tagline ? `    Tagline: "${d.tagline}" in italic script, gold or cream, below the business name inside the red panel.\n` : "") +
          "\n"
        : d.tagline
          ? `    Tagline: "${d.tagline}" in italic script, gold or cream, below the business name inside the red panel.\n\n`
          : "") +

      "  ZONE 3 — HERO FOOD PHOTO (upper-right, dramatic wok/cooking action scene):\n" +
      (hasPhoto
        ? `    Composite IMAGE 2 into the upper-right hero zone — dramatic food/cooking action. Natural edges blending into the dark background; no hard rectangular border. Cinematic lighting with flame and steam effects.\n\n`
        : `    Generate a dramatic photorealistic hero scene: ${ipc.hero}. Fill upper-right zone with natural edges blending into dark background; no hard border.\n\n`) +

      (d.tagline
        ? `  ZONE 4 — TAGLINE BANNER (center, wide parchment/kraft torn-edge banner):\n` +
          `    Render "${d.tagline}" in dark serif or italic script on the parchment banner. Natural torn paper texture.\n\n`
        : "") +

      (d.offer
        ? "  ZONE 5 — COUPON (lower-left, golden ticket-stub — dashed stitched border, notched edges):\n" +
          `    Render "${d.offer}" in bold dark text inside the golden ticket-stub. Large and prominent.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" smaller below.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone.\n\n"
        : "") +

      (menuStr !== "  (none)"
        ? `  ZONE 6 — MENU/SERVICES (dark chalkboard A-frame sign, lower-right — EXACTLY ${menuCount} item${menuCount !== 1 ? "s" : ""}):\n` +
          `    Render EXACTLY ${menuCount} item${menuCount !== 1 ? "s" : ""} in white chalk-style text on the chalkboard surface. Wood frame visible.\n` +
          `    Do NOT add more items or place the Special Offer on the chalkboard.\n` +
          `    Items: ${menuStr}\n    Each item exactly once.\n\n`
        : "  ZONE 6 — CHALKBOARD SIGN (lower-right): dark chalkboard A-frame with wood frame — leave board surface clean (no services provided).\n\n") +

      buildFooterZone(d.phone || "", fullAddress, "inline-icon") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Business name: bold condensed all-caps slab serif, white or cream, inside the deep red torn-paper panel\n" +
      "  • NEVER repeat any word from the business name\n" +
      "  • Fine print: smallest text, still legible\n" +
      "  • NEVER render the website URL as visible text\n" +
      "  • NEVER render any hex color code or CSS value as visible text anywhere in the ad"
    )
    : templateKey === "home-elegance"
    ? (
      "LAYOUT — reproduce the Home Elegance template zones exactly:\n\n" +

      (hasLogo
        ? `  ZONE 1 — LOGO (IMAGE ${logoImg} centered inside the dark navy hexagonal badge, upper-left):\n` +
          "    Scale to fit with clear margin; preserve exact logo colors. The hexagonal badge retains its dark navy border.\n\n"
        : "") +

      `  ZONE 2 — HEADLINE (inside the cream blob wave area, left-center):\n` +
      `    "${d.bizName}" in bold condensed all-caps slab serif — very large, dark navy, maximum weight.\n` +
      `    CRITICAL: Render the name EXACTLY — "${d.bizName}". Each word EXACTLY ONCE. NEVER repeat.\n` +
      (d.tagline ? `    Tagline: "${d.tagline}" in clean italic script, dark navy, below the headline.\n` : "") + "\n" +

      "  ZONE 3 — HERO PHOTO (upper-right, large photo zone):\n" +
      (hasPhoto
        ? `    Take IMAGE 2 and SEAMLESSLY COMPOSITE it into the upper-right hero photo zone — blend left and bottom edges naturally into the cream background; no hard rectangular border. Cinematic lighting.\n\n`
        : `    Generate a photorealistic image: ${ipc.hero}. Fill the upper-right zone; blend edges naturally into the cream background; no hard border.\n\n`) +

      "  ZONE 3B — CIRCULAR PHOTOS (three overlapping circles, middle-right area):\n" +
      "    Generate three perfectly circular-cropped photos with subtle gold ring accents:\n" +
      `    Circle 1: ${ipc.c1}\n` +
      `    Circle 2: ${ipc.c2}\n` +
      `    Circle 3: ${ipc.c3}\n\n` +

      (menuStr !== "  (none)"
        ? `  ZONE 4 — SERVICE TILES (wide dark navy lower area — EXACTLY ${menuCount} tile${menuCount !== 1 ? "s" : ""}):\n` +
          `    Render EXACTLY ${menuCount} rounded-rectangle service tile${menuCount !== 1 ? "s" : ""} in the dark navy band — one per service. Each tile: circular dark navy icon badge on top, service name in cream below.\n` +
          "    Do NOT add extra tiles or place the Special Offer in any tile.\n" +
          `    Services: ${menuStr}\n    Each service exactly once.\n\n`
        : "  ZONE 4 — SERVICE TILES (wide dark navy lower area):\n" +
          "    Four rounded-rectangle service card tiles with circular dark navy icon badges (house, tools, leaf, people).\n\n") +

      (d.offer
        ? "  ZONE 5 — SPECIAL OFFER (visually distinct bordered box, lower area):\n" +
          `    Render "${d.offer}" in bold dark navy text, prominent.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" smaller below.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone.\n\n"
        : "") +

      buildFooterZone(d.phone || "", fullAddress, "circular-badge") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps slab serif, dark navy, very large\n" +
      "  • NEVER repeat any word from the business name\n" +
      "  • Fine print: smallest text, still legible\n" +
      "  • NEVER render the website URL as visible text\n" +
      "  • NEVER render any hex color code or CSS value as visible text anywhere in the ad"
    )
    : (
      "LAYOUT — render these zones in order from top to bottom:\n\n" +

      "  ZONE 1 — HEADLINE (top of ad, above everything else):\n" +
      `    Business name "${d.bizName}" uses a LAYERED TWO-FONT treatment:\n` +
      `    • Main words: bold condensed all-caps slab/block serif — very large, dominant, horizontal (no angle). Deep black or dark color, maximum weight.\n` +
      `    • ONLY IF the business name contains a common English category/industry word (e.g. "Cafe", "Grill", "Spa", "Pizza", "Bar", "Salon", "Dental", "Kitchen", "Bakery", "Bistro", "Diner") — render ONLY that one common-noun word in a flowing orange script/cursive at a slight downward angle (≈-8°), large size, warm orange color. Do NOT apply this treatment to proper nouns, brand names, foreign-language words, or any word that is not a widely-recognised English business-category noun. If no such common category word exists in the name, render the entire business name in the bold condensed all-caps treatment only — do NOT split or duplicate any word.\n` +
      `    Together these two styles create a premium editorial stacked headline — not a single flat font. NEVER render the same word twice in the headline.\n\n` +

      (hasLogo
        ? `  ZONE 2 — LOGO${d.tagline ? " + TAGLINE" : ""} (orange pennant ribbon, top-left corner):\n` +
          `    PENNANT: Copy the orange pennant ribbon from IMAGE 1 exactly — same height, same width, same shape. Its TOP EDGE must be flush with the TOP EDGE of the entire ad (touching the very top of the canvas). It sits in the top-left column. Do NOT move it down, elongate it, float it, or detach it from the top of the ad in any way.\n` +
          `    Logo: place IMAGE ${logoImg} at the very top of the ad, centered inside the pennant. Scale it DOWN until it fits comfortably within the pennant with a small margin on every side — the logo must not overflow or touch the pennant edges. Keep it small and tidy inside the flag shape. Preserve exact logo colors and proportions.\n` +
          (d.tagline ? `    Tagline: render "${d.tagline}" in a loose handwriting-style italic script at a slight upward angle (+5°–7°), large and confident, black — placed to the right of the pennant, below the headline.\n` : "") +
          "\n"
        : d.tagline
          ? `  ZONE 2 — TAGLINE (upper-left, below headline):\n` +
            `    "${d.tagline}" in a loose handwriting-style italic script at a slight upward angle (+5°–7°), large and confident, black.\n\n`
          : "") +

      "  ZONE 3 — HERO IMAGE (right-center, large feature area):\n" +
      (hasPhoto
        ? "    Take the food/dish from IMAGE 2 and SEAMLESSLY INTEGRATE it into the template's photo area as if it was professionally shot for this exact ad:\n" +
          "    • Blend the food's edges naturally into the surrounding dark brush-stroke/painted background — NO hard rectangular border or frame.\n" +
          "    • Match the lighting, shadows, perspective, and color grading to the warm, appetizing commercial food photography style of a high-end restaurant ad.\n" +
          "    • The food should look like it BELONGS in the design — not pasted on top. Adjust edges, add subtle plate shadows or gradient fade as needed for realism.\n" +
          "    • Preserve the dark painted brush-stroke swoosh behind and around the photo area exactly as in the template.\n\n"
        : `    Generate a photorealistic hero image: ${ipc.hero}. Cinematic quality, vibrant color. Blend it naturally into the dark brush-stroke background with no hard rectangular border.\n\n`) +

      (menuStr !== "  (none)"
        ? "  ZONE 4 — MENU / SERVICES (left-center card area):\n" +
          "    List each item clearly. Use a clean, legible sans-serif. Prices right-aligned if present.\n\n"
        : "") +

      (d.offer
        ? "  ZONE 5 — SPECIAL OFFER (dashed coupon box):\n" +
          `    "${d.offer}" in bold inside the dashed coupon rectangle. If fine print exists, render it smaller below.\n` +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +

      buildFooterZone(d.phone || "", fullAddress, "inline-icon") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps slab/block serif for the full business name. Apply the flowing orange script (angled ≈-8°) ONLY to a common English category noun within the name (e.g. Cafe, Grill, Spa, Pizza, Bar). NEVER split a proper noun, foreign word, or brand name into a second-line script — and NEVER render any word from the business name more than once.\n" +
      "  • Tagline: loose handwriting-style italic script, slight upward angle (+5°–7°), large, confident — never flat/horizontal\n" +
      "  • Logo: scaled small to fit ENTIRELY INSIDE the orange pennant ribbon; pennant stays fixed in top-left exactly as in the template\n" +
      "  • Footer phone/address: bold sans-serif, noticeably larger than fine print\n" +
      "  • Fine print / coupon terms: smallest text, still legible\n" +
      "  • NEVER render the website URL as visible text"
    );

  // Prompt assembled by the extracted pure function — see lib/buildAdPrompt.ts
  // Pass the already-resolved templateKey so the prompt and template reference image stay in sync.
  // When d.template was "surprise-me", templateKey is now the concrete template chosen from TEMPLATE_POOL.
  let adPrompt = buildAdPrompt(d, isLandscape, templateKey);

  // ── Surprise Me visual variations ──────────────────────────────────────────
  // Applied post-build so the base template prompt is generated first, then
  // these tweaks layer on top to produce distinctly varied Surprise Me results.
  // All three variations apply whenever isSurpriseMe.
  if (isSurpriseMe) {
    // Variation 1 — headline font style swap (bidirectional, full-phrase replacement)
    // Constrained to the first HEADLINE zone description line so template detail
    // copy and reference-image descriptions are never affected.
    adPrompt = adPrompt.replace(/(HEADLINE[^\n]+)/, (line) => {
      // slab/block serif templates → swap to geometric sans-serif
      if (/\bbold condensed all-caps slab(?:\/block)? serif\b/.test(line)) {
        return line.replace(
          /\bbold condensed all-caps slab(?:\/block)? serif\b/,
          "bold condensed all-caps geometric sans-serif",
        );
      }
      // sans-serif templates (sage-organic, purple-sage, health-wellness) → swap to slab serif
      if (/\bbold condensed all-caps (?:geometric )?sans-serif\b/.test(line)) {
        return line.replace(
          /\bbold condensed all-caps (?:geometric )?sans-serif\b/,
          "bold condensed all-caps slab serif",
        );
      }
      // heritage-home uses "bold serif" (no condensed qualifier) → swap to geometric sans-serif
      if (/\bbold serif\b/.test(line)) {
        return line.replace(/\bbold serif\b/, "bold geometric sans-serif");
      }
      return line;
    });

    // Variation 3 — swap coupon border style (runs before Variation 2 so the
    // accent-color sentence is always appended to the already-modified coupon line)
    // Targets COUPON and SPECIAL OFFER zone lines (templates use both headings).
    if (d.offer) {
      adPrompt = adPrompt.replace(/((?:COUPON|SPECIAL OFFER)[^\n]+)/, (line) => {
        if (line.includes("dashed")) {
          return line.replace(/dashed(?:-stitch)?/g, "solid filled");
        }
        if (line.includes("ticket-stub") || line.includes("torn-edge")) {
          return line
            .replace(/ticket-stub/g, "clean rectangular with diagonal stripe")
            .replace(/torn-edge/g, "clean rectangular with diagonal stripe");
        }
        return line;
      });
    }

    // Variation 2 — industry characteristic accent color on the coupon/offer zone
    // Targets COUPON and SPECIAL OFFER zone lines (templates use both headings).
    if (d.offer) {
      adPrompt = adPrompt.replace(
        /((?:COUPON|SPECIAL OFFER)[^\n]+)/,
        "$1 Use the industry's characteristic accent color — brighter or warmer than the primary palette — for the coupon border or background fill.",
      );
    }
  }

  // ── Enforce xAI 8000-byte prompt limit ───────────────────────────────────────
  // xAI enforces a hard byte limit, not a JS character limit. Multi-byte UTF-8
  // characters (curly quotes, em dashes, ×, bullets, etc.) inflate byte count
  // above JS .length — a 7900-char string can easily be 8100+ bytes. All checks
  // and truncation use Buffer.byteLength so the limit is always respected.
  const MAX_PROMPT_BYTES = 7800; // 200-byte headroom below the 8000-byte xAI cap
  /** UTF-8 byte length of a string */
  const promptBytes = (s: string) => Buffer.byteLength(s, "utf8");
  /** Truncate s to at most maxBytes, respecting UTF-8 multi-byte boundaries */
  const truncateToBytes = (s: string, maxBytes: number): string => {
    if (promptBytes(s) <= maxBytes) return s;
    const buf = Buffer.from(s, "utf8");
    // Walk back from maxBytes to avoid slicing inside a multi-byte sequence
    let end = maxBytes;
    while (end > 0 && (buf[end]! & 0xc0) === 0x80) end--;
    return buf.slice(0, end).toString("utf8");
  };

  let finalAdPrompt = adPrompt;
  if (promptBytes(finalAdPrompt) > MAX_PROMPT_BYTES) {
    const allItems = d.menu.filter(Boolean);
    for (const limit of [8, 5, 3, 1, 0]) {
      if (promptBytes(finalAdPrompt) <= MAX_PROMPT_BYTES) break;
      const kept = allItems.slice(0, limit);
      const menuReplacement =
        kept.length > 0
          ? kept.map((m, i) => `  ${i + 1}. ${m}`).join("\n") +
            (allItems.length > kept.length ? `\n  (+ ${allItems.length - kept.length} more)` : "")
          : "  (none)";
      finalAdPrompt = finalAdPrompt.replace(
        /Menu\/Services :\n[\s\S]*?(?=\nSpecial Offer )/,
        `Menu/Services :\n${menuReplacement}`,
      );
    }
    if (promptBytes(finalAdPrompt) > MAX_PROMPT_BYTES) {
      req.log.warn(
        { origBytes: promptBytes(adPrompt), trimmedBytes: promptBytes(finalAdPrompt) },
        "grok-imagine: prompt still over byte limit after menu trim — hard-truncating",
      );
      finalAdPrompt = truncateToBytes(finalAdPrompt, MAX_PROMPT_BYTES);
    } else {
      req.log.info(
        { origBytes: promptBytes(adPrompt), trimmedBytes: promptBytes(finalAdPrompt) },
        "grok-imagine: prompt trimmed to fit xAI 8000-byte limit",
      );
    }
  }

  // ── Build images array for xAI /images/edits ────────────────────────────────
  // grok-imagine-image-quality accepts up to 3 reference images as separate
  // `{ type: "image_url", url: "data:mime;base64,..." }` objects in an `images`
  // array (plural). Template is always first; photo and logo follow when present.
  const toDataUrl = (buf: Buffer, mime = "image/png") =>
    `data:${mime};base64,${buf.toString("base64")}`;

  // Post-process: resize + centre-crop Grok output to exact print pixel dimensions
  async function cropToSpotDims(url: string, w: number, h: number): Promise<string> {
    try {
      const sharp = await getSharp();
      let buf: Buffer;
      if (url.startsWith("data:")) {
        const b64 = url.split(",")[1] ?? "";
        buf = Buffer.from(b64, "base64");
      } else {
        const resp = await fetch(url);
        if (!resp.ok) return url;
        buf = Buffer.from(await resp.arrayBuffer());
      }
      const meta = await sharp(buf).metadata();
      req.log.debug({ nativeWidth: meta.width, nativeHeight: meta.height, nativeSize: buf.length, targetW: w, targetH: h }, "grok native output dimensions");
      const out = await sharp(buf)
        .resize(w, h, { fit: "fill", kernel: "lanczos3" })
        .jpeg({ quality: 98, chromaSubsampling: "4:4:4" })
        .toBuffer();
      return `data:image/jpeg;base64,${out.toString("base64")}`;
    } catch {
      return url; // graceful degradation — return original on any sharp error
    }
  }

  /**
   * Normalise sizeKey strings like "xl", "XL", "large", "l", "medium", "m", "small", "s"
   * into the canonical SizeKey union used by compositeQrOnto.
   */
  function toSizeKey(sk: string): SizeKey {
    const lower = sk.toLowerCase();
    if (lower === "xl" || lower === "x-large" || lower === "xlarge") return "xl";
    if (lower === "l"  || lower === "large")                          return "l";
    if (lower === "m"  || lower === "medium")                         return "m";
    if (lower === "s"  || lower === "small")                          return "s";
    return "xl";
  }

  /**
   * Crop image to print dimensions then composite a verified QR code.
   * Skips QR compositing (returns plain image) only when the spot has no tracking
   * code yet (pre-payment preview). For tracked spots, compositing/decode failures
   * are allowed to propagate — shipping an unverified QR is worse than a 502.
   */
  async function cropAndQr(url: string): Promise<string> {
    const dataUrl = await cropToSpotDims(url, cropDim.w, cropDim.h);
    if (!spotTrackingCode) return dataUrl;
    const appUrl      = (process.env.APP_URL ?? "").replace(/\/$/, "");
    const trackingUrl = `${appUrl}/go/${spotTrackingCode}`;
    const buf         = Buffer.from(dataUrl.split(",")[1] ?? "", "base64");
    const composited  = await compositeQrOnto(buf, trackingUrl, toSizeKey(d.sizeKey));
    return `data:image/jpeg;base64,${composited.toString("base64")}`;
  }

  // Start keepalive immediately — before photo/logo fetches AND the xAI call.
  // 2-second interval ensures no more than 2 s of silence between server writes,
  // preventing the Replit proxy from closing the connection during any async gap
  // (remote photo fetch, xAI generation, image crop) that might exceed its idle timeout.
  res.setHeader("Content-Type", "application/json");
  const keepAliveTimer = setInterval(() => { res.write("\n"); }, 2000);
  const endJson = (data: object) => {
    clearInterval(keepAliveTimer);
    res.end(JSON.stringify(data));
  };

  // NOTE: the try/catch starts here so that photo/logo fetch errors also return
  // a clean JSON response instead of letting Express fall back to an HTML page
  // (which causes JSON.parse to throw a cryptic "string did not match" error in
  // Safari and "Unexpected token '<'" in Chrome).
  try {
    type XaiImageRef = { type: "image_url"; url: string };
    // Template is skipped for landscape spots (no portrait template applies)
    const imageRefs: XaiImageRef[] = [];
    if (tmplBuf) {
      imageRefs.push({ type: "image_url", url: toDataUrl(tmplBuf, tmplMime) });
    }

    const MAX_INPUT_BYTES = 15 * 1024 * 1024; // 15 MB

    let photoOriginalBytes = 0;
    let photoResizedBytes  = 0;
    let logoOriginalBytes  = 0;
    let logoResizedBytes   = 0;

    // Load sharp lazily — only needed when photo/logo images need resizing
    const sharp = await getSharp();

    if (hasPhoto) {
      const blob = d.photoUrl.startsWith("data:")
        ? dataUrlToBlob(d.photoUrl)
        : await remoteUrlToBlob(d.photoUrl);
      const rawPhotoBuf = Buffer.from(await blob.arrayBuffer());
      photoOriginalBytes = rawPhotoBuf.length;
      if (photoOriginalBytes > MAX_INPUT_BYTES) {
        res.statusCode = 400;
        endJson({ error: "Image file too large. Please upload an image under 15MB." });
        return;
      }
      const sourceMime   = blob.type || "image/jpeg";
      const keepPhotoAlpha = sourceMime === "image/png";
      let photoOutBuf: Buffer;
      if (keepPhotoAlpha) {
        photoOutBuf = await sharp(rawPhotoBuf)
          .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
      } else {
        photoOutBuf = await sharp(rawPhotoBuf)
          .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 88 })
          .toBuffer();
      }
      photoResizedBytes = photoOutBuf.length;
      imageRefs.push({ type: "image_url", url: toDataUrl(photoOutBuf, keepPhotoAlpha ? "image/png" : "image/jpeg") });
    }

    if (hasLogo) {
      const logoBlob   = dataUrlToBlob(d.logoData);
      const rawLogoBuf = Buffer.from(await logoBlob.arrayBuffer());
      logoOriginalBytes = rawLogoBuf.length;
      if (logoOriginalBytes > MAX_INPUT_BYTES) {
        res.statusCode = 400;
        endJson({ error: "Image file too large. Please upload an image under 15MB." });
        return;
      }
      const logoOutBuf = await sharp(rawLogoBuf)
        .resize(800, 800, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      logoResizedBytes = logoOutBuf.length;
      imageRefs.push({ type: "image_url", url: toDataUrl(logoOutBuf, "image/png") });
    }

    if (hasPhoto || hasLogo) {
      req.log.info(
        {
          logoOriginalBytes,
          logoResizedBytes,
          photoOriginalBytes,
          photoResizedBytes,
        },
        "image resize summary",
      );
    }

    // ── No reference images → /generations is the correct endpoint ────────────
    // /images/edits requires at least one reference image. When none are provided
    // (e.g. Surprise Me with no uploaded photo or logo), route straight to the
    // text-to-image generations endpoint to avoid an empty-array rejection and
    // to get a more lenient moderation path for commercial advertising prompts.
    if (imageRefs.length === 0) {
      const genRes = await fetch("https://api.x.ai/v1/images/generations", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model:        "grok-imagine-image-quality",
          prompt:       finalAdPrompt,
          n:            1,
          aspect_ratio: spotAspectRatio,
          ...(isXL ? { resolution: "2k" } : {}),
        }),
      });
      const genBody = await safeJson(genRes);
      req.log.info(
        { status: genRes.status, body: JSON.stringify(genBody).slice(0, 500), bizName: d.bizName },
        "grok-imagine generations (text-only) raw response",
      );
      if (genRes.ok) {
        const genUrl = extractXaiImageUrl(genBody);
        if (genUrl) { endJson({ imageUrl: await cropAndQr(genUrl) }); return; }
      }
      // Extract error and check for content moderation
      const genErrRaw = genBody["error"];
      const genErrMsg =
        (typeof genErrRaw === "string" ? genErrRaw : undefined)
        ?? ((genErrRaw as Record<string, unknown> | undefined)?.["message"] as string | undefined)
        ?? (typeof genBody["_raw"] === "string" ? genBody["_raw"] : undefined)
        ?? `xAI API error ${genRes.status}`;
      const genErrLower = genErrMsg.toLowerCase();
      const isGenModerated =
        genErrLower.includes("content policy") || genErrLower.includes("content_policy") ||
        genErrLower.includes("moderat") || genErrLower.includes("safety") ||
        genErrLower.includes("violat") || genErrLower.includes("inappropriat") ||
        genErrLower.includes("rejected") || genErrLower.includes("blocked") ||
        genErrLower.includes("harmful");
      if (isGenModerated) {
        req.log.warn({ genErrMsg, bizName: d.bizName }, "grok-imagine generations: content moderation — retrying with safe prompt");
        const safeAdPrompt =
          `Professional direct-mail postcard advertisement for ${d.bizName}. ` +
          `Attractive, print-ready layout for a residential neighbourhood mailing. ` +
          `Business name large and prominent at the top. ` +
          (d.phone ? `Phone number: ${d.phone}. ` : "") +
          (fullAddress !== "(none)" ? `Address: ${fullAddress}. ` : "") +
          (d.offer ? `Feature this special offer: ${d.offer}. ` : "") +
          `Clean, warm, welcoming design with professional typography and a soft colour palette.`;
        const safeRes = await fetch("https://api.x.ai/v1/images/generations", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model:        "grok-imagine-image-quality",
            prompt:       safeAdPrompt,
            n:            1,
            aspect_ratio: spotAspectRatio,
            ...(isXL ? { resolution: "2k" } : {}),
          }),
        });
        const safeBody = await safeJson(safeRes);
        req.log.info(
          { status: safeRes.status, body: JSON.stringify(safeBody).slice(0, 500), bizName: d.bizName },
          "grok-imagine generations safe-prompt retry raw response",
        );
        if (safeRes.ok) {
          const safeUrl = extractXaiImageUrl(safeBody);
          if (safeUrl) { endJson({ imageUrl: await cropAndQr(safeUrl) }); return; }
        }
        req.log.error({ genErrMsg, bizName: d.bizName }, "grok-imagine generations: moderation persists after safe-prompt retry");
        endJson({ error: "moderated" });
        return;
      }
      req.log.error({ status: genRes.status, genErrMsg: genErrMsg, bizName: d.bizName }, "grok-imagine generations error");
      endJson({ error: genErrMsg });
      return;
    }

    const editsBody: Record<string, unknown> = {
      model:        "grok-imagine-image-quality",
      prompt:       finalAdPrompt,
      n:            1,
      images:       imageRefs,
      aspect_ratio: spotAspectRatio,
      ...(isXL ? { resolution: "2k" } : {}),
    };

    // ── Retry loop for transient overload errors ────────────────────────────
    let xaiRes!: Response;
    let body: Record<string, unknown> = {};
    for (let attempt = 0; attempt <= XAI_RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        const delay = XAI_RETRY_DELAYS_MS[attempt - 1]!;
        req.log.warn(
          { attempt, delayMs: delay, bizName: d.bizName },
          "grok-imagine: overload — waiting before retry",
        );
        await sleep(delay);
      }
      xaiRes = await fetch("https://api.x.ai/v1/images/edits", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(editsBody),
      });
      body = await safeJson(xaiRes);
      req.log.info(
        { attempt, status: xaiRes.status, body: JSON.stringify(body).slice(0, 500), bizName: d.bizName },
        "grok-imagine edits raw response",
      );
      if (xaiRes.ok) break;
      // Peek at the error to decide whether to retry
      const errPeekRaw = body["error"];
      const errPeekMsg =
        (typeof errPeekRaw === "string" ? errPeekRaw : undefined)
        ?? ((errPeekRaw as Record<string, unknown> | undefined)?.["message"] as string | undefined)
        ?? (typeof body["_raw"] === "string" ? body["_raw"] : undefined)
        ?? `xAI API error ${xaiRes.status}`;
      if (!isXaiOverload(xaiRes.status, errPeekMsg)) break; // non-overload: exit loop, handle below
      if (attempt === XAI_RETRY_DELAYS_MS.length) {
        // All retries exhausted — still overloaded
        req.log.error({ bizName: d.bizName }, "grok-imagine: overload persists after all retries");
        endJson({ error: "overloaded" });
        return;
      }
      req.log.warn(
        { attempt, errMsg: errPeekMsg, bizName: d.bizName },
        "grok-imagine: overload detected — will retry",
      );
    }

    if (!xaiRes.ok) {
      // body.error may be a plain string (xAI style) or { message: string } (OpenAI style)
      const errRaw = body["error"];
      const errMsg =
        (typeof errRaw === "string" ? errRaw : undefined)
        ?? ((errRaw as Record<string, unknown> | undefined)?.["message"] as string | undefined)
        ?? (typeof body["_raw"] === "string" ? body["_raw"] : undefined)
        ?? `xAI API error ${xaiRes.status}`;
      const errLower = errMsg.toLowerCase();

      // ── Case 1: explicit model-not-supported → fall back to text-only /generations
      const isModelNotSupported =
        errLower.includes("not support") ||
        errLower.includes("does not support") ||
        (errLower.includes("model") && errLower.includes("edit")) ||
        xaiRes.status === 404;

      if (isModelNotSupported) {
        req.log.warn({ errMsg, bizName: d.bizName }, "grok-imagine edits: model not supported — falling back to /generations");
        try {
          const fallbackUrl = await callGenerationsJson(apiKey, finalAdPrompt, d.bizName, req.log);
          endJson({ imageUrl: await cropAndQr(fallbackUrl), fallback: true });
          return;
        } catch (fbErr) {
          req.log.error({ editsErr: errMsg, fbErr }, "grok-imagine both edits and generations failed");
          endJson({ error: errMsg || "Ad generation failed" });
          return;
        }
      }

      // ── Case 2: image-array rejected → retry with template-only (no extra refs)
      // Some API versions may reject multi-image arrays; fall back to template alone.
      const isImageArrayIssue =
        (xaiRes.status === 400 || xaiRes.status === 422) &&
        (hasPhoto || hasLogo) &&
        (errLower.includes("image") || errLower.includes("array") ||
         errLower.includes("unexpected") || errLower.includes("invalid") ||
         errLower.includes("field") || errLower.includes("schema"));

      if (isImageArrayIssue && tmplBuf) {
        req.log.warn({ errMsg, bizName: d.bizName }, "grok-imagine edits: multi-image rejected — retrying with template only");
        const retryBody: Record<string, unknown> = {
          model:        "grok-imagine-image-quality",
          prompt:       finalAdPrompt,
          n:            1,
          images:       [{ type: "image_url", url: toDataUrl(tmplBuf, tmplMime) }],
          aspect_ratio: spotAspectRatio,
          resolution:   "2k",
        };
        const retryRes = await fetch("https://api.x.ai/v1/images/edits", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(retryBody),
        });
        const retryRespBody = await safeJson(retryRes);
        req.log.info(
          { status: retryRes.status, body: JSON.stringify(retryRespBody).slice(0, 500), bizName: d.bizName },
          "grok-imagine edits retry (template-only) raw response"
        );
        if (retryRes.ok) {
          const retryUrl = extractXaiImageUrl(retryRespBody);
          if (retryUrl) { endJson({ imageUrl: await cropAndQr(retryUrl) }); return; }
        }
        req.log.warn({ retryStatus: retryRes.status, origErr: errMsg }, "grok-imagine edits retry also failed");
      }

      // ── Case 3: content moderation → retry on /generations with stripped prompt
      const isContentModeration =
        (xaiRes.status === 400 || xaiRes.status === 422) &&
        (errLower.includes("content policy") || errLower.includes("content_policy") ||
         errLower.includes("moderat") || errLower.includes("safety") ||
         errLower.includes("violat") || errLower.includes("inappropriat") ||
         errLower.includes("rejected") || errLower.includes("blocked") ||
         errLower.includes("harmful"));

      if (isContentModeration) {
        req.log.warn({ errMsg, bizName: d.bizName }, "grok-imagine edits: content moderation — retrying on /generations with safe prompt");
        const safeAdPrompt =
          `Professional direct-mail postcard advertisement for ${d.bizName}. ` +
          `Attractive, print-ready layout for a residential neighbourhood mailing. ` +
          `Business name large and prominent at the top. ` +
          (d.phone ? `Phone number: ${d.phone}. ` : "") +
          (fullAddress !== "(none)" ? `Address: ${fullAddress}. ` : "") +
          (d.offer ? `Feature this special offer: ${d.offer}. ` : "") +
          `Clean, warm, welcoming design with professional typography and a soft colour palette.`;
        try {
          const safeUrl = await callGenerationsJson(apiKey, safeAdPrompt, d.bizName, req.log);
          endJson({ imageUrl: await cropAndQr(safeUrl) });
          return;
        } catch (safeErr) {
          const safeErrMsg = safeErr instanceof Error ? safeErr.message : String(safeErr);
          req.log.error({ origErr: errMsg, safeErr: safeErrMsg, bizName: d.bizName }, "grok-imagine moderation retry also failed");
          endJson({ error: "moderated" });
          return;
        }
      }

      // ── Case 4: all other errors → error in JSON body
      req.log.error({ status: xaiRes.status, errMsg, bizName: d.bizName }, "grok-imagine edits error");
      endJson({ error: errMsg });
      return;
    }

    const imageUrl = extractXaiImageUrl(body);
    if (!imageUrl) {
      req.log.warn({ body: JSON.stringify(body).slice(0, 300) }, "grok-imagine: no image in response");
      endJson({ error: "No image was returned — try again or simplify your prompt." });
      return;
    }

    endJson({ imageUrl: await cropAndQr(imageUrl) });
  } catch (err) {
    clearInterval(keepAliveTimer);
    const msg = err instanceof Error ? err.message : "Ad generation failed";
    req.log.error({ err: msg, bizName: d.bizName }, "grok-imagine error");
    if (!res.headersSent) {
      res.status(502).json({ error: msg });
    } else {
      res.end(JSON.stringify({ error: msg }));
    }
  }
});

// ── POST /api/grok-ad-generator/refine ───────────────────────────────────────
const RefineSchema = z.object({
  imageDataUrl: z.string().min(1, "imageDataUrl is required"),
  instruction:  z.string().min(1, "instruction is required").max(500),
  sizeKey:      z.string().optional().default("XL"),
  spotId:       z.number().int().optional(),
});

router.post("/grok-ad-generator/refine", async (req, res) => {
  const parsed = RefineSchema.safeParse(req.body);
  if (!parsed.success) {
    const msgs = parsed.error.issues.map((i) => i.message).join(", ");
    res.status(400).json({ error: msgs });
    return;
  }
  const { imageDataUrl, instruction, sizeKey, spotId: refineSpotId } = parsed.data;

  const apiKey = process.env["XAI_API_KEY"];
  if (!apiKey) {
    res.status(503).json({ error: "XAI_API_KEY is not configured." });
    return;
  }

  const match = imageDataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/s);
  if (!match) {
    res.status(400).json({ error: "imageDataUrl must be a valid base64 data URL." });
    return;
  }
  const mime = match[1] as string;
  const imageBuf = Buffer.from(match[2]!, "base64");

  // Same aspect ratios + print-quality crop dims as the generate endpoint
  // (4:5 is unsupported by xAI; 3:4 is the closest; sharp crops to exact pixel dims)
  const SIZE_MAP: Record<string, { w: number; h: number; aspect: string }> = {
    XL: { w: 1200, h: 1500, aspect: "3:4" },
    L:  { w: 900,  h: 1200, aspect: "3:4" },
    M:  { w: 900,  h: 600,  aspect: "3:2" },
    S:  { w: 600,  h: 600,  aspect: "1:1" },
  };
  const dim = SIZE_MAP[sizeKey.toUpperCase()] ?? SIZE_MAP["XL"]!;

  const refinePrompt =
    `You are editing a finished print-ready postcard advertisement image. ` +
    `Apply ONLY this specific change: "${instruction}". ` +
    `Keep every other element exactly as it appears — layout, colors, fonts, ` +
    `business name, phone number, address, coupon offer, photos, background, ` +
    `logo, and all remaining text. Do not add or remove anything beyond what ` +
    `the instruction explicitly requests. Output a complete finished ad at the ` +
    `same dimensions and print quality as the input.`;

  const xaiBody = {
    model:        "grok-imagine-image-quality",
    prompt:       refinePrompt,
    n:            1,
    images:       [{ type: "image_url", url: `data:${mime};base64,${imageBuf.toString("base64")}` }],
    aspect_ratio: dim.aspect,
    resolution:   "2k",
  };

  // Keep the connection alive while xAI processes (proxy timeout ~10 s).
  res.setHeader("Content-Type", "application/json");
  const refineKeepAliveTimer = setInterval(() => { res.write("\n"); }, 2000);
  const refineEndJson = (data: object) => {
    clearInterval(refineKeepAliveTimer);
    res.end(JSON.stringify(data));
  };

  try {
    // ── Retry loop for transient overload errors ────────────────────────────
    let xaiRes!: Response;
    let body: Record<string, unknown> = {};
    for (let attempt = 0; attempt <= XAI_RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        const delay = XAI_RETRY_DELAYS_MS[attempt - 1]!;
        req.log.warn({ attempt, delayMs: delay }, "grok-refine: overload — waiting before retry");
        await sleep(delay);
      }
      req.log.info({ attempt, instruction, sizeKey }, "grok-refine: calling xAI /images/edits");
      xaiRes = await fetch("https://api.x.ai/v1/images/edits", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(xaiBody),
      });
      body = await safeJson(xaiRes);
      req.log.info(
        { attempt, status: xaiRes.status, body: JSON.stringify(body).slice(0, 400) },
        "grok-refine raw response",
      );
      if (xaiRes.ok) break;
      const errPeekRaw = body["error"];
      const errPeekMsg =
        (typeof errPeekRaw === "string" ? errPeekRaw : undefined)
        ?? ((errPeekRaw as Record<string, unknown> | undefined)?.["message"] as string | undefined)
        ?? (typeof body["_raw"] === "string" ? body["_raw"] : undefined)
        ?? `xAI API error ${xaiRes.status}`;
      if (!isXaiOverload(xaiRes.status, errPeekMsg)) break;
      if (attempt === XAI_RETRY_DELAYS_MS.length) {
        req.log.error("grok-refine: overload persists after all retries");
        refineEndJson({ error: "overloaded" });
        return;
      }
      req.log.warn({ attempt, errMsg: errPeekMsg }, "grok-refine: overload detected — will retry");
    }

    if (!xaiRes.ok) {
      const errRaw = body["error"];
      const errMsg =
        (typeof errRaw === "string" ? errRaw : undefined)
        ?? ((errRaw as Record<string, unknown> | undefined)?.["message"] as string | undefined)
        ?? (typeof body["_raw"] === "string" ? body["_raw"] : undefined)
        ?? `xAI API error ${xaiRes.status}`;
      req.log.error({ status: xaiRes.status, errMsg }, "grok-refine error");
      refineEndJson({ error: errMsg });
      return;
    }

    const imageUrl = extractXaiImageUrl(body);
    if (!imageUrl) {
      req.log.warn({ body: JSON.stringify(body).slice(0, 300) }, "grok-refine: no image in response");
      refineEndJson({ error: "No image was returned — please try again." });
      return;
    }

    const refineCroppedUrl = await cropToSpotDims(imageUrl, dim.w, dim.h);

    // Composite QR onto the refined image if the spot has a tracking code.
    // Load tracking code inside the keepalive window (after the xAI call returns).
    // DB failures skip QR gracefully; compositing/verification failures propagate
    // as hard errors — same gate as generate for tracked spots.
    let refineFinalUrl = refineCroppedUrl;
    if (refineSpotId != null) {
      let refineTrackingCode: string | null = null;
      try {
        const [refineSpotRow] = await db
          .select({ trackingCode: spotsTable.trackingCode })
          .from(spotsTable)
          .where(eq(spotsTable.id, refineSpotId))
          .limit(1);
        refineTrackingCode = refineSpotRow?.trackingCode ?? null;
      } catch (dbErr) {
        req.log.warn({ dbErr, refineSpotId }, "grok-refine: DB error loading tracking code — QR compositing skipped");
      }
      if (refineTrackingCode) {
        // Hard gate: compositeQrOnto throws propagate to the outer catch → 502
        const refineAppUrl      = (process.env.APP_URL ?? "").replace(/\/$/, "");
        const refineTrackingUrl = `${refineAppUrl}/go/${refineTrackingCode}`;
        const refineSizeKey     = (() => {
          const lower = sizeKey.toLowerCase();
          if (lower === "xl" || lower === "x-large" || lower === "xlarge") return "xl" as const;
          if (lower === "l"  || lower === "large")                          return "l"  as const;
          if (lower === "m"  || lower === "medium")                         return "m"  as const;
          if (lower === "s"  || lower === "small")                          return "s"  as const;
          return "xl" as const;
        })();
        const refineBuf  = Buffer.from(refineCroppedUrl.split(",")[1] ?? "", "base64");
        const refineComp = await compositeQrOnto(refineBuf, refineTrackingUrl, refineSizeKey);
        refineFinalUrl   = `data:image/jpeg;base64,${refineComp.toString("base64")}`;
      }
    }

    refineEndJson({ imageUrl: refineFinalUrl });
  } catch (err) {
    clearInterval(refineKeepAliveTimer);
    const msg = err instanceof Error ? err.message : "Ad generation failed";
    req.log.error({ err: msg }, "grok-refine error");
    if (!res.headersSent) {
      res.status(502).json({ error: msg });
    } else {
      res.end(JSON.stringify({ error: msg }));
    }
  }
});

// ── GET /api/grok-ad-generator — Smart Ad Studio ─────────────────────────────
router.get("/grok-ad-generator", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(SMART_HTML);
});

// ── GET /api/grok-ad-generator-classic — original template picker ─────────────
router.get("/grok-ad-generator-classic", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(CLASSIC_HTML);
});

// ── GET /api/grok-ad-generator/template-preview/:key — serve template thumbnails ──
router.get("/grok-ad-generator/template-preview/:key", (req, res) => {
  const key = req.params["key"];
  const fileMap: Record<string, string> = {
    "parchment-classic":             "mr_biscuits_template_no_logo_1778806527327.png",
    "made-fresh":                    "made_fresh_template.png",
    "neighborhood-pro":              "6300F2D5-6BF1-403E-A40B-7203E4E26402_1778948283280.jpeg",
    "at-your-service":               "IMG_0728_1779065210873.jpeg",
    "health-wellness":               "healthcare_generic_template_1779141099043.png",
    "home-elegance":                 "home_services_no_text_1780946323885.png",
    "sage-organic":                  "IMG_0832_1780946925550.png",
    "purple-sage":                   "IMG_0836_1780951148325.png",
    "brush-stroke":                  "IMG_0839_1780955044987.png",
    "heritage-home":                 "heritage_home_portrait.png",
    "wok-fire":                      "image_1781029065584.png",
    "surprise-me":                   "surprise_me_template.png",
    // landscape variants
    "parchment-classic-landscape":   "parchment_classic_landscape_1779162178190.png",
    "made-fresh-landscape":          "made_fresh_landscape_1779162178190.png",
    "neighborhood-pro-landscape":    "IMG_0747_1779162178190.png",
    "at-your-service-landscape":     "IMG_0746_1779162178190.png",
    "health-wellness-landscape":     "healthcare_wellness_landscape_1779162178190.png",
    "home-elegance-landscape":       "image_1780946327957.png",
    "sage-organic-landscape":        "image_1780946917886.png",
    "purple-sage-landscape":         "IMG_0837_1780951148325.png",
    "brush-stroke-landscape":        "IMG_0838_1780955044987.png",
    "heritage-home-landscape":       "heritage_home_landscape.png",
    "wok-fire-landscape":            "image_1781029077663.png",
  };
  const filename = fileMap[key];
  if (!filename) { res.status(404).send("Not found"); return; }
  const p = path.join(WORKSPACE_ROOT, "attached_assets", filename);
  if (!fs.existsSync(p)) { res.status(404).send("Not found"); return; }
  const mime = /\.(jpe?g)$/i.test(filename) ? "image/jpeg" : "image/png";
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "public, max-age=86400");
  fs.createReadStream(p).pipe(res);
});

export default router;

// ── Inline HTML ───────────────────────────────────────────────────────────────
// ── xAI overload-retry helpers ────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isXaiOverload(status: number, errMsg: string): boolean {
  const lower = errMsg.toLowerCase();
  return status === 503 || status === 429 ||
    lower.includes("overload") ||
    lower.includes("temporarily");
}

// 3 retries at 3 s / 6 s / 12 s → up to ~21 s of silent back-off before giving up
const XAI_RETRY_DELAYS_MS = [3000, 6000, 12000] as const;

// ── SMART_HTML — Smart Ad Studio (auto-template gallery + color swatches) ─────
const SMART_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Town Postcard &#8212; Ad Generator</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700&family=Crimson+Pro:ital@0;1&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
:root{
  --burg:#7C1C2E;--burg-dark:#5a1220;--burg-pale:#f9eaed;
  --ink:#0f1117;--ink-mid:#374151;--ink-light:#6B7280;
  --surface:#F4F1ED;--card:#fff;--border:#E2DDD6;
  --green:#1a5c3a;--xai:#1a1a2e;
}
body{font-family:'DM Sans',sans-serif;background:var(--surface);color:var(--ink);display:flex;flex-direction:column}
.hdr{background:#fff;padding:0 28px;display:flex;align-items:center;justify-content:space-between;height:54px;border-bottom:3px solid var(--burg);flex-shrink:0}
.brand{font-family:'Bebas Neue',sans-serif;font-size:27px;color:var(--xai);letter-spacing:.08em;display:flex;align-items:center;gap:10px}
.brand span{color:var(--burg)}
.brand-logo{height:42px;width:auto;display:block;flex-shrink:0}
.hdr-badge{background:linear-gradient(135deg,#7C1C2E,#9b2c3e);color:#fff;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:4px 14px;border-radius:20px}
.layout{display:grid;grid-template-columns:1fr 1fr 400px;flex:1;min-height:0;overflow:hidden}
.fpanel{background:var(--card);border-right:1.5px solid var(--border);padding:18px 18px 24px;overflow-y:auto;display:flex;flex-direction:column;gap:14px}
.mpanel{background:var(--surface);border-right:1.5px solid var(--border);padding:18px 18px 24px;overflow-y:auto;display:flex;flex-direction:column;gap:14px}
.ptitle{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:.06em;margin-bottom:2px}
.psub{font-family:'Crimson Pro',serif;font-style:italic;font-size:15px;color:var(--ink-light);line-height:1.4;margin-bottom:4px}
.sec-label{font-size:13px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--burg);padding-bottom:8px;border-bottom:1.5px solid var(--burg-pale);margin-bottom:8px}
.field{margin-bottom:8px}
.field:last-child{margin-bottom:0}
.field label{display:block;font-size:13.5px;font-weight:600;color:var(--ink-mid);margin-bottom:3px;letter-spacing:.05em;text-transform:uppercase}
.field input,.field select{width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:7px;font-family:'DM Sans',sans-serif;font-size:14px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.field input:focus,.field select:focus{border-color:var(--burg);background:#fff}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.menu-list{display:flex;flex-direction:column;gap:5px;margin-bottom:7px}
.mrow{display:flex;gap:6px;align-items:center}
.mrow input{flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:'DM Sans',sans-serif;font-size:13.5px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.mrow input:focus{border-color:var(--burg);background:#fff}
.rm-btn{width:24px;height:24px;border-radius:5px;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-light);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;line-height:1}
.rm-btn:hover{border-color:#c0392b;color:#c0392b;background:#fef2f2}
.add-btn{font-size:13px;font-weight:600;color:var(--burg);background:none;border:1.5px dashed var(--burg);border-radius:6px;padding:5px 12px;cursor:pointer;width:100%;transition:all .2s;font-family:'DM Sans',sans-serif}
.add-btn:hover{background:var(--burg-pale)}
/* Swatches */
.swatches-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px}
.swatch-card{border:2px solid var(--border);border-radius:9px;padding:9px 11px;cursor:pointer;display:flex;align-items:center;gap:10px;transition:all .18s;background:#fafaf8}
.swatch-card:hover{border-color:var(--burg);background:#fff}
.swatch-card.active{border-color:var(--burg);box-shadow:0 0 0 2px var(--burg);background:#fff}
.swatch-circles{display:flex;gap:4px;flex-shrink:0}
.swatch-circle{width:28px;height:28px;border-radius:50%;border:1.5px solid rgba(0,0,0,.1)}
.swatch-name{font-size:11px;font-weight:700;color:var(--ink);line-height:1.3;letter-spacing:.02em}
/* Upload */
.photo-logo-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}
.logo-col{display:flex;flex-direction:column;gap:8px}
.lib-section{margin-top:10px}
.lib-label{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-light);margin-bottom:6px}
.img-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.img-thumb{position:relative;aspect-ratio:4/3;border-radius:6px;overflow:hidden;cursor:pointer;border:2.5px solid transparent;transition:all .2s}
.img-thumb:hover{transform:scale(1.03)}
.img-thumb.selected{border-color:var(--burg);box-shadow:0 0 0 1.5px var(--burg)}
.img-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.img-thumb .chk{display:none;position:absolute;top:3px;right:3px;background:var(--burg);color:#fff;border-radius:50%;width:16px;height:16px;font-size:9px;font-weight:900;align-items:center;justify-content:center}
.img-thumb.selected .chk{display:flex}
.img-empty,.img-loading{grid-column:1/-1;padding:14px 8px;text-align:center;font-size:13px;color:var(--ink-light);line-height:1.5}
.upload-zone{border:2px dashed var(--border);border-radius:8px;padding:14px 10px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s;background:var(--surface);position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100px}
.upload-zone.logo-zone{min-height:75px}
.upload-zone:hover:not(.has-file){border-color:var(--burg);background:var(--burg-pale)}
.upload-zone.has-file{border-color:var(--green);background:#f0fdf4;padding:6px;justify-content:flex-start;align-items:stretch;min-height:0}
.logo-zone.has-file{min-height:75px;justify-content:center;align-items:center;padding:6px}
.upload-zone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;z-index:2}
.upload-placeholder{display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none}
.upload-icon{font-size:22px;opacity:.45}
.upload-label{font-size:13px;font-weight:600;color:var(--ink-mid);margin-top:2px}
.upload-sub{font-size:11.5px;color:var(--ink-light);margin-top:1px;line-height:1.3;max-width:130px}
.upload-zone.has-file .upload-placeholder{display:none}
.upload-preview{display:none;width:100%;height:auto;object-fit:contain;border-radius:5px}
.upload-zone.has-file .upload-preview{display:block}
.logo-zone.has-file .upload-preview{width:auto;max-height:60px;margin:0 auto}
.upload-clear{position:absolute;top:5px;right:5px;z-index:3;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;border:none;cursor:pointer;font-size:13px;display:none;align-items:center;justify-content:center;line-height:1}
.upload-zone.has-file .upload-clear{display:flex}
.fnote{font-size:11.5px;color:var(--ink-light);line-height:1.4}
/* Generate button */
.gen-btn{width:100%;padding:14px 16px;background:linear-gradient(135deg,#b91c1c,#7C1C2E);color:#fff;border:none;border-radius:10px;font-family:'Bebas Neue',sans-serif;font-size:19px;letter-spacing:.16em;cursor:pointer;transition:all .25s;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 18px rgba(124,28,46,.55)}
.gen-btn:hover:not(:disabled){background:linear-gradient(135deg,#dc2626,#9b2235);transform:translateY(-1px);box-shadow:0 8px 28px rgba(124,28,46,.7)}
.gen-btn:active:not(:disabled){transform:translateY(0);box-shadow:0 2px 10px rgba(124,28,46,.4)}
.gen-btn:disabled{background:#4b5563;box-shadow:none;cursor:not-allowed;transform:none;color:rgba(255,255,255,.5)}
.gen-spark{font-size:17px;animation:sp 2s ease-in-out infinite}
@keyframes sp{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}
.err-box{padding:14px 16px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;font-size:14px;color:#991b1b;line-height:1.5;display:none;margin-top:4px}
.err-box.visible{display:block}
.field-error{border-color:#ef4444 !important;box-shadow:0 0 0 3px rgba(239,68,68,.25) !important;animation:field-shake .35s ease}
@keyframes field-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
/* Right panel */
.rpanel{background:#111827;display:flex;flex-direction:column;overflow:hidden}
.rpanel-header{padding:14px 18px 12px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.1)}
.rpanel-scroll{flex:1;overflow-y:auto;padding:12px 18px 18px;display:flex;flex-direction:column;gap:12px}
.preview-area{position:relative;flex-shrink:0;min-height:200px;display:flex;align-items:flex-start;justify-content:center;background:#1f2937;border-radius:12px;overflow:hidden}
.preview-ph{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:rgba(255,255,255,.35);font-size:13.5px;text-align:center;padding:24px;line-height:1.5;min-height:260px;width:100%}
.preview-ph-icon{font-size:44px;opacity:.6}
.preview-img{width:100%;height:auto;object-fit:contain;display:block}
/* Generation overlay */
.gen-overlay{display:none;position:absolute;inset:0;border-radius:12px;flex-direction:column;align-items:center;justify-content:center;gap:18px;z-index:10;background:rgba(15,17,25,.82);backdrop-filter:blur(4px)}
.gen-overlay.visible{display:flex}
.gen-overlay-ring{width:56px;height:56px;border:4px solid rgba(255,255,255,.12);border-top-color:#f97316;border-radius:50%;animation:spin 1s linear infinite}
.gen-overlay-dots{display:flex;gap:8px;align-items:center}
.gen-overlay-dot{width:8px;height:8px;border-radius:50%;background:#f97316;animation:dot-pulse 1.2s ease-in-out infinite}
.gen-overlay-dot:nth-child(2){animation-delay:.2s}
.gen-overlay-dot:nth-child(3){animation-delay:.4s}
@keyframes dot-pulse{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}
.gen-overlay-text{font-size:14px;font-weight:600;color:rgba(255,255,255,.75);letter-spacing:.06em;text-transform:uppercase}
.gen-overlay-sub{font-size:12px;color:rgba(255,255,255,.38);font-weight:400;margin-top:-10px}
/* Thumb strip */
.thumb-strip{display:flex;gap:6px;flex-wrap:nowrap}
.thumb-item{width:80px;height:80px;flex-shrink:1;border-radius:7px;overflow:hidden;cursor:pointer;border:2.5px solid transparent;transition:all .18s;background:#1f2937}
.thumb-item:hover{border-color:rgba(255,255,255,.4)}
.thumb-item.selected{border-color:#f97316;box-shadow:0 0 0 1px #f97316}
.thumb-item img{width:100%;height:100%;object-fit:cover;display:block}
.thumb-loading{width:80px;height:80px;flex-shrink:1;border-radius:7px;background:#1f2937;border:2px dashed #374151;display:flex;align-items:center;justify-content:center}
.slot-spinner{width:22px;height:22px;border:2.5px solid #374151;border-top-color:#f97316;border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.use-btn{width:100%;padding:12px 16px;background:var(--green);color:#fff;border:none;border-radius:10px;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:background .2s;display:none;letter-spacing:.03em}
.use-btn.visible{display:block}
.use-btn:hover{background:#144d30}
.dl-btn-rp{width:100%;padding:10px 16px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.8);border:1.5px solid rgba(255,255,255,.2);border-radius:10px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;display:none}
.dl-btn-rp.visible{display:block}
.dl-btn-rp:hover{background:rgba(255,255,255,.15)}
/* Refine panel */
.refine-panel{display:none;background:rgba(255,255,255,.06);border-radius:10px;padding:12px 14px}
.refine-panel.visible{display:block}
.refine-label{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.45);margin-bottom:8px}
.refine-row{display:flex;gap:7px}
.refine-input{flex:1;padding:9px 11px;border:1.5px solid rgba(255,255,255,.15);border-radius:7px;font-family:'DM Sans',sans-serif;font-size:13px;color:#fff;background:rgba(255,255,255,.08);outline:none;transition:border-color .2s}
.refine-input:focus{border-color:rgba(255,255,255,.4);background:rgba(255,255,255,.12)}
.refine-input::placeholder{color:rgba(255,255,255,.3)}
.refine-btn{padding:9px 16px;background:var(--burg);color:#fff;border:none;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;transition:background .2s;flex-shrink:0}
.refine-btn:hover:not(:disabled){background:var(--burg-dark)}
.refine-btn:disabled{opacity:.5;cursor:not-allowed}
.refine-err{font-size:12px;color:#fca5a5;margin-top:7px;display:none;line-height:1.4}
.refine-err.visible{display:block}
/* Lightbox */
.lightbox{display:none;position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;align-items:center;justify-content:center;padding:20px}
.lightbox.visible{display:flex}
.lb-close{position:fixed;top:18px;right:22px;width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.15);color:#fff;border:none;cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;transition:background .2s;z-index:1;font-family:'DM Sans',sans-serif}
.lb-close:hover{background:rgba(255,255,255,.3)}
.lb-content{display:flex;flex-direction:column;align-items:center;gap:14px;max-width:90vw}
.lb-img{max-width:100%;max-height:68vh;object-fit:contain;border-radius:6px;box-shadow:0 24px 64px rgba(0,0,0,.7)}
.lb-tmpl-name{color:rgba(255,255,255,.55);font-size:12px;font-weight:700;letter-spacing:.2em;text-transform:uppercase}
.lb-actions{display:flex;gap:12px}
.lb-select-btn{padding:14px 48px;background:var(--green);color:#fff;border:none;border-radius:11px;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:background .2s;letter-spacing:.04em}
.lb-select-btn:hover{background:#144d30}
.lb-dl-btn{padding:14px 24px;background:rgba(255,255,255,.12);color:#fff;border:1.5px solid rgba(255,255,255,.3);border-radius:11px;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:600;cursor:pointer;transition:all .2s}
.lb-dl-btn:hover{background:rgba(255,255,255,.22)}
/* Toast */
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:var(--ink);color:#fff;padding:10px 22px;border-radius:30px;font-size:14px;font-weight:600;box-shadow:0 8px 32px rgba(0,0,0,.3);transition:transform .3s cubic-bezier(.34,1.56,.64,1);z-index:9998;pointer-events:none}
.toast.show{transform:translateX(-50%) translateY(0)}
/* Taken dialog */
#takenOverlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9997;align-items:center;justify-content:center;padding:16px}
#takenOverlay.visible{display:flex}
#takenCard{background:#fff;border-radius:14px;max-width:400px;width:100%;padding:32px 28px;box-shadow:0 24px 64px rgba(0,0,0,.45);text-align:center}
.tc-icon{font-size:42px;margin-bottom:12px;line-height:1}
.tc-title{font-weight:900;font-size:20px;color:#0f1117;margin:0 0 10px;font-family:'Bebas Neue',sans-serif;letter-spacing:.05em}
.tc-body{color:#6B7280;font-size:13px;line-height:1.65;margin:0 0 24px}
.tc-industry{color:#0f1117;font-weight:700}
.tc-btn{display:block;width:100%;padding:12px 0;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;letter-spacing:.03em;transition:opacity .15s;border:none;margin-bottom:8px}
.tc-btn:last-child{margin-bottom:0}
.tc-btn.primary{background:#0f1117;color:#fff}
.tc-btn.secondary{background:#fff;color:#7C1C2E;border:2px solid #7C1C2E}
@media(max-width:860px){.layout{grid-template-columns:1fr 1fr}html,body{height:auto;overflow:auto}.rpanel{grid-column:1/-1;height:auto;overflow:visible}.rpanel-scroll{overflow:visible;height:auto}.fpanel,.mpanel{overflow:visible}.thumb-strip{flex-wrap:nowrap;overflow-x:auto}}
@media(max-width:640px){.layout{grid-template-columns:1fr}.rpanel{grid-column:auto}.photo-logo-row{grid-template-columns:1fr}}
</style>
</head>
<body>

<header class="hdr">
  <div class="brand"><img class="brand-logo" src="/mailbox-logo.png" alt="">My Town <span>Postcard</span></div>
  <div class="hdr-badge">&#10024; Ad Generator</div>
</header>

<div class="toast" id="toast"></div>

<div class="layout">

  <!-- LEFT: FORM PANEL -->
  <div class="fpanel">
    <div>
      <div class="ptitle">Ad Generator</div>
      <div class="psub">Enter your business details below. Pick your colors and photo in the middle panel, then click Generate for a print-ready postcard ad.</div>
    </div>

    <div>
      <div class="sec-label">Business Info</div>
      <div class="field"><label>Business Name *</label><input type="text" id="bizName" placeholder="Mr. Biscuit's Cafe" oninput="onFormChange()"></div>
      <div class="field">
        <label>Industry</label>
        <select id="industry" onchange="onIndustryChange()">
          <option value="">&mdash; Select &mdash;</option>
          <option>Pizza Restaurant</option><option>Mexican Restaurant</option><option>Chinese Restaurant</option>
          <option>Breakfast &amp; Cafe</option><option>Bar &amp; Grill</option><option>Italian Restaurant</option>
          <option>Bakery</option><option>Coffee Shop</option><option>Dentist</option>
          <option>Medical &amp; Healthcare</option><option>Chiropractor</option><option>Veterinarian</option>
          <option>HVAC</option><option>Plumber</option><option>Electrician</option>
          <option>Lawn &amp; Landscaping</option><option>Roofing</option><option>Painting</option>
          <option>Cleaning Service</option><option>Pest Control</option><option>Real Estate</option>
          <option>Insurance</option><option>Auto Repair</option><option>Salon &amp; Beauty</option>
          <option>Barbershop</option><option>Gym &amp; Fitness</option><option>Pet Services</option>
          <option>Financial Services</option><option>Daycare</option><option>Photography</option>
          <option>Retail Shop</option><option>Other Service</option>
        </select>
      </div>
      <div class="field"><label>Tagline / Slogan</label><input type="text" id="tagline" placeholder="From-Scratch Biscuits &amp; Boba!"></div>
      <div class="frow">
        <div class="field"><label>Phone</label><input type="text" id="phone" placeholder="(706) 754-0105"></div>
        <div class="field"><label>City, State</label><input type="text" id="city" placeholder="Clarkesville, GA"></div>
      </div>
      <div class="field"><label>Street Address</label><input type="text" id="address" placeholder="596 W Louise St"></div>
      <div class="field"><label>Website / URL</label><input type="text" id="website" placeholder="mytownpostcard.com"></div>
      <div class="field"><label>Contact Email <span style="font-weight:400;color:var(--ink-light)">(for order)</span></label><input type="email" id="email" placeholder="owner@mrbiscuitscafe.com"></div>
    </div>

    <div>
      <div class="sec-label">Menu Items / Services (up to 4)</div>
      <div class="menu-list" id="menuList"></div>
      <button class="add-btn" onclick="addMenuItem()">+ Add Item</button>
    </div>

    <div>
      <div class="sec-label">Special Offer / Coupon</div>
      <div class="field"><label>Offer</label><input type="text" id="offer" placeholder="$1 OFF Any Biscuit"></div>
      <div class="field"><label>Fine Print</label><input type="text" id="offerFine" placeholder="1 per visit &middot; with this postcard"></div>
    </div>

  </div>

  <!-- MIDDLE: VISUAL INPUTS -->
  <div class="mpanel">
    <div>
      <div class="sec-label">&#127775; Brand Color Palette</div>
      <div class="swatches-grid" id="swatchesGrid"></div>
      <p class="fnote">Auto-selected for your industry &mdash; click any pair to switch.</p>
    </div>

    <div class="logo-col">
      <div class="sec-label" style="margin-top:0">Logo <span style="font-weight:400;font-size:11px;color:var(--ink-light);text-transform:none;letter-spacing:0">(optional)</span></div>
      <div class="upload-zone logo-zone" id="logoZone">
        <input type="file" accept="image/*" onchange="handleLogoUpload(this)">
        <div class="upload-placeholder">
          <div class="upload-icon">&#127991;&#65039;</div>
          <div class="upload-label">Upload logo</div>
          <div class="upload-sub">PNG with transparency preferred</div>
        </div>
        <img class="upload-preview" id="logoPreview" alt="Logo">
        <button class="upload-clear" title="Remove" onclick="clearLogo(event)">&#10005;</button>
      </div>
      <p class="fnote" style="margin-top:5px">Placed upper-left exactly as provided.</p>
    </div>

    <div>
      <div class="sec-label" style="margin-top:0">Primary Photo</div>
      <div class="upload-zone" id="photoZone">
        <input type="file" accept="image/*" onchange="handlePhotoUpload(this)">
        <div class="upload-placeholder">
          <div class="upload-icon">&#128248;</div>
          <div class="upload-label">Upload a photo</div>
          <div class="upload-sub">Food, product, or storefront</div>
        </div>
        <img class="upload-preview" id="photoPreview" alt="Photo">
        <button class="upload-clear" title="Remove" onclick="clearPhoto(event)">&#10005;</button>
      </div>
      <p class="fnote" style="margin-top:5px">Skip to let AI auto-generate a photo.</p>
      <div class="lib-section">
        <div class="lib-label">Or pick from library</div>
        <div id="libGrid" class="img-grid">
          <div class="img-empty">Select an industry above to load photos.</div>
        </div>
      </div>
    </div>
  </div>

  <!-- RIGHT: GENERATE + PREVIEW + GALLERY -->
  <div class="rpanel">
    <div class="rpanel-header">
      <button class="gen-btn" id="genBtn" onclick="generate()" disabled>
        <span class="gen-spark">&#9889;</span>
        <span id="genLabel">Generate My Ad</span>
      </button>
    </div>
    <div class="rpanel-scroll">
      <div class="preview-area" id="previewArea">
        <div class="preview-ph" id="previewPh">
          <div class="preview-ph-icon">&#127912;</div>
          <div>Fill in your business info,<br>then click Generate.</div>
        </div>
        <img class="preview-img" id="previewImg" alt="Ad preview" style="display:none">
        <div class="gen-overlay" id="genOverlay">
          <div class="gen-overlay-ring"></div>
          <div class="gen-overlay-dots">
            <div class="gen-overlay-dot"></div>
            <div class="gen-overlay-dot"></div>
            <div class="gen-overlay-dot"></div>
          </div>
          <div class="gen-overlay-text" id="genOverlayText">Generating&hellip;</div>
          <div class="gen-overlay-sub" id="genOverlaySub">This takes about 30 seconds</div>
        </div>
      </div>
      <div class="err-box" id="errBox"></div>
      <div class="thumb-strip" id="thumbStrip"></div>
      <div class="refine-panel" id="refinePanel">
        <div class="refine-label">Suggest a Change</div>
        <div class="refine-row">
          <input class="refine-input" id="refineInput" type="text" placeholder='e.g. "Change the font" or "Remove the tagline"' maxlength="500" onkeydown="if(event.key==='Enter')refineCurrentAd()">
          <button class="refine-btn" id="refineBtn" onclick="refineCurrentAd()">Apply</button>
        </div>
        <div class="refine-err" id="refineErr"></div>
      </div>
      <button class="use-btn" id="useBtn" onclick="selectCurrentAd()">&#10003; Use This Ad &rarr;</button>
      <button class="dl-btn-rp" id="dlBtn" onclick="downloadSelected()">&#8595; Download</button>
    </div>
  </div>
</div>

<!-- Lightbox -->
<div id="lightbox" class="lightbox" onclick="onLightboxClick(event)">
  <button class="lb-close" onclick="closeLightbox()">&#10005;</button>
  <div class="lb-content" onclick="event.stopPropagation()">
    <img id="lbImg" class="lb-img" alt="Ad preview">
    <div class="lb-tmpl-name" id="lbTmplName"></div>
    <div class="lb-actions">
      <button class="lb-select-btn" onclick="selectAdFromLightbox()">&#10003; Select This Ad</button>
      <button class="lb-dl-btn" onclick="downloadFromLightbox()">&#8595; Download</button>
    </div>
  </div>
</div>

<!-- Industry conflict dialog -->
<div id="takenOverlay">
  <div id="takenCard">
    <div class="tc-icon">&#9888;&#65039;</div>
    <div class="tc-title">That Category is Taken</div>
    <p class="tc-body"><span class="tc-industry" id="takenIndustryName"></span> is already reserved on this postcard. Each category is exclusive &mdash; one business per industry per mailing.</p>
    <button class="tc-btn primary" onclick="closeTakenDialog()">Choose a Different Category</button>
    <button class="tc-btn secondary" onclick="goRequestOptions()">Request More Options &rarr;</button>
  </div>
</div>

<script>
function esc(s){ var d=document.createElement('div');d.textContent=String(s||'');return d.innerHTML; }

// ── State ──────────────────────────────────────────────────────────────────────
var _variations = [];          // [{imageUrl, templateKey, templateName}]
var _sessionUsedTemplates = [];// templates used this session
var _campaignUsedTemplates = [];
var _activeSwatchIdx = 1;
var _spotSize = 'XL';
var _spotId = 0;
var _campaignId = 0;
var _side = 'front';
var _takenCategories = [];
var _selectedPhotoUrl = '';
var _logoData = '';
var _isGenerating = false;
var _lightboxVariationIdx = -1;
var _selectedVarIdx = -1;
var _isRefining = false;

// ── Data ───────────────────────────────────────────────────────────────────────
var COLOR_SWATCHES = [
  {name:'Classic Red \u00b7 Gold',    p:'#c0392b',a:'#f39c12'},
  {name:'Deep Navy \u00b7 Amber',     p:'#1a3d5c',a:'#c8a84b'},
  {name:'Forest Green \u00b7 Sage',   p:'#2e7d32',a:'#8bc34a'},
  {name:'Royal Purple \u00b7 Lilac',  p:'#6a1b9a',a:'#ce93d8'},
  {name:'Warm Espresso \u00b7 Cream', p:'#4a2c1a',a:'#d4a574'},
  {name:'Steel Blue \u00b7 Sky',      p:'#1565c0',a:'#42a5f5'},
];

var INDUSTRY_SWATCH_IDX = {
  'Pizza Restaurant':0,'Mexican Restaurant':2,'Chinese Restaurant':0,
  'Breakfast & Cafe':4,'Bar & Grill':1,'Italian Restaurant':0,
  'Bakery':4,'Coffee Shop':4,'Dentist':5,'Medical & Healthcare':5,
  'Chiropractor':5,'Veterinarian':2,'HVAC':5,'Plumber':5,
  'Electrician':1,'Lawn & Landscaping':2,'Roofing':1,'Painting':3,
  'Cleaning Service':5,'Pest Control':2,'Real Estate':1,'Insurance':1,
  'Auto Repair':1,'Salon & Beauty':3,'Barbershop':1,'Gym & Fitness':0,
  'Pet Services':2,'Financial Services':1,'Daycare':0,'Photography':4,
  'Retail Shop':3,'Other Service':1,
};

var INDUSTRY_TEMPLATES = {
  'Pizza Restaurant':    ['wok-fire','made-fresh','parchment-classic','neighborhood-pro','at-your-service','sage-organic'],
  'Mexican Restaurant':  ['made-fresh','wok-fire','parchment-classic','neighborhood-pro','sage-organic','brush-stroke'],
  'Chinese Restaurant':  ['wok-fire','made-fresh','parchment-classic','neighborhood-pro','sage-organic','at-your-service'],
  'Breakfast & Cafe':    ['parchment-classic','made-fresh','sage-organic','purple-sage','neighborhood-pro','health-wellness'],
  'Bar & Grill':         ['wok-fire','made-fresh','parchment-classic','neighborhood-pro','brush-stroke','heritage-home'],
  'Italian Restaurant':  ['made-fresh','wok-fire','parchment-classic','sage-organic','heritage-home','neighborhood-pro'],
  'Bakery':              ['parchment-classic','made-fresh','sage-organic','purple-sage','health-wellness','neighborhood-pro'],
  'Coffee Shop':         ['parchment-classic','made-fresh','sage-organic','purple-sage','neighborhood-pro','health-wellness'],
  'Dentist':             ['health-wellness','at-your-service','home-elegance','heritage-home','neighborhood-pro','brush-stroke'],
  'Medical & Healthcare':['health-wellness','at-your-service','home-elegance','heritage-home','neighborhood-pro','brush-stroke'],
  'Chiropractor':        ['health-wellness','at-your-service','home-elegance','heritage-home','neighborhood-pro','purple-sage'],
  'Veterinarian':        ['sage-organic','health-wellness','neighborhood-pro','purple-sage','brush-stroke','at-your-service'],
  'HVAC':                ['at-your-service','neighborhood-pro','brush-stroke','heritage-home','home-elegance','parchment-classic'],
  'Plumber':             ['at-your-service','neighborhood-pro','brush-stroke','heritage-home','home-elegance','parchment-classic'],
  'Electrician':         ['at-your-service','neighborhood-pro','brush-stroke','heritage-home','home-elegance','parchment-classic'],
  'Lawn & Landscaping':  ['neighborhood-pro','sage-organic','brush-stroke','at-your-service','home-elegance','parchment-classic'],
  'Roofing':             ['at-your-service','brush-stroke','heritage-home','neighborhood-pro','home-elegance','parchment-classic'],
  'Painting':            ['brush-stroke','at-your-service','neighborhood-pro','home-elegance','heritage-home','sage-organic'],
  'Cleaning Service':    ['neighborhood-pro','at-your-service','health-wellness','home-elegance','brush-stroke','sage-organic'],
  'Pest Control':        ['neighborhood-pro','at-your-service','brush-stroke','home-elegance','heritage-home','parchment-classic'],
  'Real Estate':         ['home-elegance','heritage-home','at-your-service','purple-sage','brush-stroke','neighborhood-pro'],
  'Insurance':           ['heritage-home','home-elegance','at-your-service','health-wellness','neighborhood-pro','brush-stroke'],
  'Auto Repair':         ['at-your-service','brush-stroke','neighborhood-pro','heritage-home','home-elegance','wok-fire'],
  'Salon & Beauty':      ['purple-sage','sage-organic','health-wellness','parchment-classic','home-elegance','made-fresh'],
  'Barbershop':          ['heritage-home','brush-stroke','at-your-service','neighborhood-pro','parchment-classic','wok-fire'],
  'Gym & Fitness':       ['neighborhood-pro','at-your-service','wok-fire','brush-stroke','heritage-home','health-wellness'],
  'Pet Services':        ['sage-organic','neighborhood-pro','health-wellness','purple-sage','brush-stroke','parchment-classic'],
  'Financial Services':  ['heritage-home','home-elegance','at-your-service','health-wellness','brush-stroke','neighborhood-pro'],
  'Daycare':             ['health-wellness','sage-organic','purple-sage','neighborhood-pro','parchment-classic','made-fresh'],
  'Photography':         ['purple-sage','sage-organic','home-elegance','heritage-home','brush-stroke','parchment-classic'],
  'Retail Shop':         ['purple-sage','sage-organic','parchment-classic','home-elegance','made-fresh','neighborhood-pro'],
};

var DEFAULT_TEMPLATES = ['parchment-classic','made-fresh','at-your-service','neighborhood-pro','home-elegance','heritage-home'];

var TEMPLATE_NAMES = {
  'parchment-classic':'Parchment Classic','made-fresh':'Made Fresh',
  'health-wellness':'Health & Wellness','at-your-service':'At Your Service',
  'neighborhood-pro':'Neighborhood Pro','home-elegance':'Home Elegance',
  'sage-organic':'Sage Organic','purple-sage':'Purple Sage',
  'brush-stroke':'Brush Stroke','heritage-home':'Heritage Home',
  'wok-fire':'Wok Fire','surprise-me':'Surprise Me',
};

var TAGLINE_DEFAULTS = {
  'Pizza Restaurant':'Fresh-Made Pizza, Fast & Hot!',
  'Mexican Restaurant':'Authentic Flavors, Made Fresh Daily',
  'Chinese Restaurant':'Traditional Recipes, Modern Taste',
  'Breakfast & Cafe':'Start Your Morning Right',
  'Bar & Grill':'Great Food, Cold Drinks, Good Times',
  'Italian Restaurant':'Authentic Italian \u2014 From Our Kitchen to Yours',
  'Bakery':'Baked Fresh Every Morning',
  'Coffee Shop':'Your Daily Dose of Delicious',
  'Dentist':'Healthy Smiles for the Whole Family',
  'Medical & Healthcare':'Caring for Our Community',
  'Chiropractor':'Pain Relief \u2014 Feel Better Fast',
  'Veterinarian':'Compassionate Care for Your Pets',
  'HVAC':'Comfort Year-Round, Service You Trust',
  'Plumber':'Fast, Reliable Plumbing \u2014 24/7',
  'Electrician':'Safe, Reliable Electrical Service',
  'Lawn & Landscaping':'Beautiful Lawns, Zero Hassle',
  'Roofing':'Protecting Your Home, Rain or Shine',
  'Painting':'Transform Your Space \u2014 Inside & Out',
  'Cleaning Service':'Spotless Results, Every Time',
  'Pest Control':'Protecting Homes & Families',
  'Real Estate':'Your Local Real Estate Expert',
  'Insurance':'Coverage You Can Count On',
  'Auto Repair':'Honest Service, Expert Repairs',
  'Salon & Beauty':'Look and Feel Your Best',
  'Barbershop':'Sharp Cuts, Great Service',
  'Gym & Fitness':'Get Fit, Feel Amazing',
  'Pet Services':'Treating Your Pets Like Family',
  'Financial Services':'Building Your Financial Future',
  'Daycare':'Safe, Nurturing Care for Your Child',
  'Photography':'Capturing Your Priceless Moments',
  'Retail Shop':'Something for Everyone \u2014 Shop Local',
};

var OFFER_DEFAULTS = {
  'Pizza Restaurant':    ['BOGO Tuesday \u2014 Buy One, Get One 50% Off','One per order \u00b7 with this postcard'],
  'Mexican Restaurant':  ['FREE Chips & Salsa with Any Entr\u00e9e','One per table \u00b7 with this postcard'],
  'Chinese Restaurant':  ['10% OFF Your First Order','With this postcard'],
  'Breakfast & Cafe':    ['$1 OFF Any Breakfast Plate','One per visit \u00b7 with this postcard'],
  'Bar & Grill':         ['Happy Hour 3\u20136pm \u2014 $3 Draft Beers','Dine-in only \u00b7 with this postcard'],
  'Italian Restaurant':  ['FREE Dessert with Entr\u00e9e Purchase','One per table \u00b7 with this postcard'],
  'Bakery':              ['Buy a Dozen, Get 2 FREE','With this postcard'],
  'Coffee Shop':         ['FREE Pastry with Any Latte','One per visit \u00b7 with this postcard'],
  'Dentist':             ['New Patient Special \u2014 Exam + X-Rays $49','New patients only \u00b7 call to schedule'],
  'Medical & Healthcare':['New Patient Visit \u2014 $99 Flat','New patients only \u00b7 call for details'],
  'Chiropractor':        ['First Visit \u2014 Exam + Adjustment $49','New patients only \u00b7 call to schedule'],
  'Veterinarian':        ['10% OFF First Wellness Visit','New clients only \u00b7 with this postcard'],
  'HVAC':                ['FREE System Check \u2014 $89 Value','Call today to schedule'],
  'Plumber':             ['$25 OFF Any Service Call','With this postcard'],
  'Electrician':         ['FREE Safety Inspection \u2014 No Obligation','Call to schedule \u00b7 with this postcard'],
  'Lawn & Landscaping':  ['FREE First Mow with Monthly Service','New customers only \u00b7 call today'],
  'Roofing':             ['FREE Roof Inspection \u2014 No Pressure','Call or text to schedule'],
  'Painting':            ['10% OFF Any Interior Painting Job','With this postcard \u00b7 mention ad'],
  'Cleaning Service':    ['$20 OFF First Home Cleaning','New customers only \u00b7 with this postcard'],
  'Pest Control':        ['FREE Inspection + $20 OFF First Treatment','With this postcard'],
  'Real Estate':         ['FREE Home Valuation \u2014 No Obligation','Call or text to schedule'],
  'Insurance':           ['FREE Coverage Review \u2014 Could Save You 30%','No obligation \u00b7 call today'],
  'Auto Repair':         ['FREE Multi-Point Inspection with Any Service','With this postcard'],
  'Salon & Beauty':      ['$10 OFF First Visit','New clients only \u00b7 with this postcard'],
  'Barbershop':          ['First Cut $15 \u2014 New Customers Only','With this postcard'],
  'Gym & Fitness':       ['First Month FREE \u2014 No Contract','New members only \u00b7 call to enroll'],
  'Pet Services':        ['10% OFF First Grooming Appointment','New clients only \u00b7 with this postcard'],
  'Financial Services':  ['FREE 30-Minute Consultation','No obligation \u00b7 call to schedule'],
  'Daycare':             ['First Week FREE \u2014 Schedule a Tour Today','New enrollments only \u00b7 call for details'],
  'Photography':         ['$50 OFF Your First Session','With this postcard \u00b7 book in advance'],
  'Retail Shop':         ['10% OFF Entire Purchase \u2014 Show This Card','In-store only \u00b7 one use per customer'],
};

var MENU_DEFAULTS = {
  'Pizza Restaurant':    ['Pepperoni Pizza $12.99','Margherita Pizza $10.99','Chicken Wings $8.99','Caesar Salad $7.99'],
  'Mexican Restaurant':  ['Tacos (3) $9.99','Burrito Bowl $10.99','Nachos Supreme $8.99','Guacamole & Chips $6.99'],
  'Chinese Restaurant':  ['General Tso\u2019s Chicken $11.99','Fried Rice $8.99','Spring Rolls (3) $5.99','Wonton Soup $6.99'],
  'Breakfast & Cafe':    ['Bacon Egg & Cheese $5.99','Pancake Stack $7.99','Breakfast Plate $8.99','Coffee & Muffin $4.99'],
  'Bar & Grill':         ['Cheeseburger & Fries $12.99','BBQ Ribs Half Rack $16.99','Chicken Tenders $10.99','Loaded Nachos $9.99'],
  'Italian Restaurant':  ['Fettuccine Alfredo $13.99','Chicken Parmigiana $14.99','Lasagna $12.99','Tiramisu $6.99'],
  'Bakery':              ['Fresh Sourdough Loaf $7.99','Croissants (2) $4.99','Custom Cakes \u2014 Call for Pricing','Muffins 6-Pack $8.99'],
  'Coffee Shop':         ['Latte $5.49','Cold Brew $4.99','Espresso $3.49','Pastry of the Day $3.99'],
  'Dentist':             ['New Patient Exam $49','Teeth Whitening $199','Dental Cleaning $79','Emergency \u2014 Same Day'],
  'Medical & Healthcare':['New Patient Visit $99','Annual Wellness Exam','Lab Work In-House','Telehealth Available'],
  'Chiropractor':        ['Initial Exam & X-Rays $49','Spinal Adjustment $45','Massage Therapy $60/hr','Family Plans Available'],
  'Veterinarian':        ['Wellness Exam $45','Vaccinations from $25','Dental Cleaning $150','Spay/Neuter Packages'],
  'HVAC':                ['AC Tune-Up $79','Heating Inspection $69','Emergency Service 24/7','Free Estimates'],
  'Plumber':             ['Drain Clearing $99','Water Heater Install','Leak Detection & Repair','Free Estimates'],
  'Electrician':         ['Panel Upgrade \u2014 Call','Outlet Installation $75','EV Charger Install','Free Safety Inspection'],
  'Lawn & Landscaping':  ['Weekly Mowing from $35','Mulch & Bed Prep','Irrigation Install','Free Lawn Analysis'],
  'Roofing':             ['Free Roof Inspection','Storm Damage Repair','New Roof Install','Gutter Cleaning'],
  'Painting':            ['Interior Room from $250','Exterior Painting','Cabinet Refinishing','Free Color Consultation'],
  'Cleaning Service':    ['Home Cleaning from $99','Deep Clean','Move-In/Out Clean','Commercial Services'],
  'Pest Control':        ['General Pest Control $89','Free Termite Inspection','Mosquito Treatment','Annual Protection Plans'],
  'Real Estate':         ['Free Home Valuation','Buyer Representation','Seller\u2019s Market Experts','Free Consultation'],
  'Insurance':           ['Auto Insurance Quotes','Home & Renters Coverage','Life Insurance Plans','Free Policy Review'],
  'Auto Repair':         ['Oil Change from $39','Brake Service','Free Diagnostics','Tires & Alignment'],
  'Salon & Beauty':      ['Haircut & Style from $35','Color & Highlights','Blowout $45','Balayage from $85'],
  'Barbershop':          ['Classic Cut $20','Fade & Design $25','Hot Towel Shave $30','Kid\u2019s Cut $15'],
  'Gym & Fitness':       ['Monthly Membership $39','Personal Training','Group Classes Included','Free Week Trial'],
  'Pet Services':        ['Dog Grooming from $45','Boarding from $35/night','Doggy Daycare','Training Packages'],
  'Financial Services':  ['Free Consultation','Retirement Planning','Tax Preparation','Investment Review'],
  'Daycare':             ['Full-Time Enrollment','Part-Time Available','Ages 6 Weeks\u20135 Years','Hot Meals Provided'],
  'Photography':         ['Family Portraits from $149','Event Photography','Headshots $99','Prints & Albums Available'],
  'Retail Shop':         ['New Arrivals Weekly','Gift Cards Available','Layaway & Special Orders','Call for Hours'],
};

// ── Swatch rendering ───────────────────────────────────────────────────────────
function renderSwatches(){
  var grid = document.getElementById('swatchesGrid');
  if(!grid) return;
  grid.innerHTML = COLOR_SWATCHES.map(function(sw,i){
    return '<div class="swatch-card' + (i===_activeSwatchIdx?' active':'') + '" onclick="selectSwatch(' + i + ')" title="' + esc(sw.name) + '">'
      + '<div class="swatch-circles">'
      + '<div class="swatch-circle" style="background:' + sw.p + '"></div>'
      + '<div class="swatch-circle" style="background:' + sw.a + '"></div>'
      + '</div>'
      + '<div class="swatch-name">' + esc(sw.name) + '</div>'
      + '</div>';
  }).join('');
}

function selectSwatch(i){
  _activeSwatchIdx = i;
  renderSwatches();
}

// ── Preview + thumbnail gallery ────────────────────────────────────────────────
function renderVariations(){
  var previewPh  = document.getElementById('previewPh');
  var previewImg = document.getElementById('previewImg');
  var thumbStrip = document.getElementById('thumbStrip');
  var useBtn     = document.getElementById('useBtn');
  var dlBtn      = document.getElementById('dlBtn');
  if(!previewPh || !previewImg || !thumbStrip) return;

  if(_variations.length === 0 && !_isGenerating){
    previewPh.style.display  = 'flex';
    previewImg.style.display = 'none';
    thumbStrip.innerHTML = '';
    if(useBtn) useBtn.classList.remove('visible');
    if(dlBtn)  dlBtn.classList.remove('visible');
    return;
  }

  // Determine which variation to show as main preview
  var showIdx = (_selectedVarIdx >= 0 && _selectedVarIdx < _variations.length)
    ? _selectedVarIdx : _variations.length - 1;

  if(_variations.length > 0){
    var v = _variations[showIdx];
    previewPh.style.display  = 'none';
    previewImg.style.display = 'block';
    previewImg.src = v.imageUrl;
    if(useBtn) useBtn.classList.add('visible');
    if(dlBtn)  dlBtn.classList.add('visible');
  }

  // Thumbnail strip — only show when a 2nd generation has started
  // (i.e. 2+ variations exist, or 1 variation + currently generating)
  var showThumbs = _variations.length >= 2 || (_variations.length === 1 && _isGenerating);
  var html = '';
  if(showThumbs){
    for(var i = 0; i < _variations.length; i++){
      var isSelected = i === showIdx;
      html += '<div class="thumb-item' + (isSelected ? ' selected' : '') + '" onclick="previewAd(' + i + ')" title="Ad ' + (i+1) + '">'
        + '<img src="' + esc(_variations[i].imageUrl) + '" alt="" loading="lazy">'
        + '</div>';
    }
    if(_isGenerating){
      html += '<div class="thumb-loading"><div class="slot-spinner"></div></div>';
    }
  }
  thumbStrip.innerHTML = html;

  // Show refine panel once there's at least one ad
  var refinePanel = document.getElementById('refinePanel');
  if(refinePanel) refinePanel.classList.toggle('visible', _variations.length > 0);
}

function previewAd(idx){
  if(idx < 0 || idx >= _variations.length) return;
  _selectedVarIdx = idx;
  renderVariations();
}

function selectCurrentAd(){
  var idx = (_selectedVarIdx >= 0 && _selectedVarIdx < _variations.length)
    ? _selectedVarIdx : _variations.length - 1;
  if(idx < 0) return;
  selectAd(idx);
}

function downloadSelected(){
  var idx = (_selectedVarIdx >= 0 && _selectedVarIdx < _variations.length)
    ? _selectedVarIdx : _variations.length - 1;
  if(idx < 0) return;
  var v = _variations[idx];
  var bizName = document.getElementById('bizName').value.trim();
  downloadAd(v.imageUrl, bizName);
}

async function refineCurrentAd(){
  var input = document.getElementById('refineInput');
  var errEl = document.getElementById('refineErr');
  var btn   = document.getElementById('refineBtn');
  var instruction = input ? input.value.trim() : '';
  if(errEl){ errEl.textContent = ''; errEl.classList.remove('visible'); }
  if(!instruction){
    if(errEl){ errEl.textContent = 'Please describe the change you want (e.g. "Change the font to bold").'; errEl.classList.add('visible'); }
    return;
  }
  var idx = (_selectedVarIdx >= 0 && _selectedVarIdx < _variations.length)
    ? _selectedVarIdx : _variations.length - 1;
  if(idx < 0 || !_variations[idx]) return;
  var imageDataUrl = _variations[idx].imageUrl;
  if(!imageDataUrl) return;
  if(btn){ btn.disabled = true; btn.textContent = 'Applying\u2026'; }
  _isRefining = true;
  showOverlay('Applying your change\u2026', 'Editing the current ad');
  try{
    var resp = await fetch('/api/grok-ad-generator/refine', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ imageDataUrl: imageDataUrl, instruction: instruction, sizeKey: _spotSize || 'XL' }),
    });
    var data = await resp.json();
    if(!resp.ok || data.error){
      var msg = data.error || 'Refinement failed \u2014 please try again.';
      if(errEl){
        errEl.textContent = '\u26a0\ufe0f ' + (msg === 'overloaded'
          ? 'The AI is busy right now \u2014 please try again in a moment.'
          : msg === 'moderated'
          ? 'The content filter blocked this change. Try rewording and click Apply again.'
          : msg);
        errEl.classList.add('visible');
      }
    } else {
      _variations[idx].imageUrl = data.imageUrl;
      if(input) input.value = '';
      renderVariations();
      showToast('Change applied!');
    }
  } catch(err){
    if(errEl){ errEl.textContent = '\u26a0\ufe0f Network error: ' + (err instanceof Error ? err.message : String(err)); errEl.classList.add('visible'); }
  }
  hideOverlay();
  _isRefining = false;
  if(btn){ btn.disabled = false; btn.textContent = 'Apply'; }
}

// ── Template selection ─────────────────────────────────────────────────────────
function getNextTemplate(){
  var industry = document.getElementById('industry').value || '';
  var ranked = INDUSTRY_TEMPLATES[industry] || DEFAULT_TEMPLATES;
  var excluded = _campaignUsedTemplates.concat(_sessionUsedTemplates);
  var available = ranked.filter(function(k){ return excluded.indexOf(k) === -1; });
  return available.length > 0 ? available[0] : ranked[0];
}

// ── Overlay helpers ────────────────────────────────────────────────────────────
function showOverlay(text, sub){
  var el = document.getElementById('genOverlay');
  var textEl = document.getElementById('genOverlayText');
  var subEl  = document.getElementById('genOverlaySub');
  if(textEl) textEl.textContent = text || 'Generating\u2026';
  if(subEl)  subEl.textContent  = sub  || 'This takes about 30 seconds';
  if(el) el.classList.add('visible');
}
function hideOverlay(){
  var el = document.getElementById('genOverlay');
  if(el) el.classList.remove('visible');
}

// ── Generate ───────────────────────────────────────────────────────────────────
async function generate(){
  if(_isGenerating || _variations.length >= 6) return;
  var biz = document.getElementById('bizName').value.trim();
  if(!biz){ showErr('Please enter a business name above.'); return; }
  hideErr();
  _isGenerating = true;
  document.getElementById('genBtn').disabled = true;
  showOverlay(_variations.length === 0 ? 'Generating your ad\u2026' : 'Generating a new variation\u2026', 'This takes about 30 seconds');
  renderVariations();
  var templateKey = getNextTemplate();
  var sw = COLOR_SWATCHES[_activeSwatchIdx] || COLOR_SWATCHES[1];
  var body = {
    bizName:      biz,
    tagline:      document.getElementById('tagline').value.trim(),
    phone:        document.getElementById('phone').value.trim(),
    city:         document.getElementById('city').value.trim(),
    address:      document.getElementById('address').value.trim(),
    website:      document.getElementById('website').value.trim(),
    industry:     document.getElementById('industry').value || 'Local Business',
    menu:         getMenu(),
    offer:        document.getElementById('offer').value.trim(),
    offerFine:    document.getElementById('offerFine').value.trim(),
    photoUrl:     _selectedPhotoUrl,
    logoData:     _logoData,
    template:     templateKey,
    sizeKey:      _spotSize || 'XL',
    spotId:       _spotId || undefined,
    campaignId:   _campaignId || undefined,
    side:         _side || undefined,
    generationIndex: _variations.length,
    primaryColor: sw.p,
    accentColor:  sw.a,
  };
  try{
    var resp = await fetch('/api/grok-ad-generator/generate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    var data = await resp.json();
    _isGenerating = false;
    hideOverlay();
    if(!resp.ok || data.error){
      var msg = data.error || 'Generation failed \u2014 please try again.';
      showErr(msg === 'overloaded'
        ? 'The image generator is busy right now \u2014 please try again in a moment.'
        : msg === 'moderated'
        ? 'Our AI content filter blocked this ad. Try rephrasing your services and click Generate again.'
        : msg);
    } else {
      _sessionUsedTemplates.push(templateKey);
      _variations.push({imageUrl:data.imageUrl, templateKey:templateKey, templateName:TEMPLATE_NAMES[templateKey]||templateKey});
      showToast('Ad ready! View it in the preview \u2192');
    }
  }catch(err){
    _isGenerating = false;
    hideOverlay();
    showErr('Network error: ' + (err instanceof Error ? err.message : String(err)));
  }
  renderVariations();
  updateGenButton();
}

function updateGenButton(){
  var btn = document.getElementById('genBtn');
  var lbl = document.getElementById('genLabel');
  if(!btn||!lbl) return;
  if(_variations.length >= 6){
    btn.style.display = 'none';
  } else {
    btn.style.display = '';
    var biz = document.getElementById('bizName').value.trim();
    btn.disabled = !biz || _isGenerating;
    lbl.textContent = _variations.length === 0 ? 'Generate My Ad' : '\u21ba Regenerate Ad';
  }
}

// ── Lightbox ───────────────────────────────────────────────────────────────────
function openLightbox(idx){
  var v = _variations[idx];
  if(!v) return;
  _lightboxVariationIdx = idx;
  document.getElementById('lbImg').src = v.imageUrl;
  document.getElementById('lbTmplName').textContent = v.templateName;
  document.getElementById('lightbox').classList.add('visible');
}

function closeLightbox(){
  document.getElementById('lightbox').classList.remove('visible');
  _lightboxVariationIdx = -1;
}

function onLightboxClick(evt){ if(evt.target===document.getElementById('lightbox')) closeLightbox(); }

function downloadFromLightbox(){
  var v = _variations[_lightboxVariationIdx];
  if(!v) return;
  downloadAd(v.imageUrl, document.getElementById('bizName').value.trim());
}

// ── Select ad ─────────────────────────────────────────────────────────────────
function selectAdFromLightbox(){
  if(_lightboxVariationIdx < 0) return;
  selectAd(_lightboxVariationIdx);
}

function selectAd(idx){
  var v = _variations[idx];
  if(!v) return;
  var bizName = document.getElementById('bizName').value.trim();
  var email   = document.getElementById('email').value.trim();
  if(!bizName){
    showErr('Please enter your business name before continuing.');
    fieldHighlight('bizName');
    closeLightbox();
    return;
  }
  if(!email){
    showErr('Please enter a contact email so we can send your order confirmation.');
    fieldHighlight('email');
    closeLightbox();
    return;
  }
  hideErr();
  var formData = {
    businessName:  bizName,
    industry:      document.getElementById('industry').value || 'Local Business',
    email:         email,
    phone:         document.getElementById('phone').value.trim(),
    city:          document.getElementById('city').value.trim(),
    address:       document.getElementById('address').value.trim(),
    website:       document.getElementById('website').value.trim(),
    tagline:       document.getElementById('tagline').value.trim(),
    offer:         document.getElementById('offer').value.trim(),
    offerFine:     document.getElementById('offerFine').value.trim(),
    menuItems:     getMenu(),
    finishedAdUrl: v.imageUrl,
    template:      v.templateKey,
    sizeKey:       _spotSize || 'XL',
  };
  try{
    var urlParams = new URLSearchParams(window.location.search);
    localStorage.setItem('localspot:grok:pendingAd', JSON.stringify({
      formData:     formData,
      pickerSpotId: urlParams.get('spotId') || '',
      spotSize:     urlParams.get('spotSize') || 'XL',
      savedAt:      Date.now(),
    }));
  }catch(e){}
  closeLightbox();
  if(window.opener && !window.opener.closed){
    window.opener.postMessage({ type: 'grok-ad-result', formData: formData }, '*');
    window.opener.focus();
    showToast('Ad sent! Completing your reservation\u2026');
    setTimeout(function(){ window.close(); }, 1400);
  } else {
    downloadAd(v.imageUrl, bizName);
    showToast('Ad saved! Upload it from your spot upload page to complete your order.');
  }
}

function downloadAd(url, bizName){
  if(!url) return;
  var a = document.createElement('a');
  a.href = url;
  a.download = 'my-town-ad-' + (bizName||'ad').replace(/\\s+/g,'-') + '-' + Date.now() + '.png';
  a.click();
}

// ── Form helpers ───────────────────────────────────────────────────────────────
function onFormChange(){
  var biz = document.getElementById('bizName').value.trim();
  if(_variations.length < 6 && !_isGenerating){
    document.getElementById('genBtn').disabled = !biz;
  }
}

function onIndustryChange(){
  var industry = document.getElementById('industry').value;
  if(industry && _takenCategories.indexOf(industry) !== -1){ showTakenDialog(industry); return; }
  loadLibrary();
  var list = document.getElementById('menuList'); list.innerHTML = '';
  var defs = MENU_DEFAULTS[industry];
  if(defs) defs.slice(0,4).forEach(function(v){ addMenuItem(v); });
  var tEl = document.getElementById('tagline'); if(tEl) tEl.value = TAGLINE_DEFAULTS[industry]||'';
  var op = OFFER_DEFAULTS[industry];
  document.getElementById('offer').value     = op ? op[0] : '';
  document.getElementById('offerFine').value = op ? op[1] : '';
  if(industry){
    var si = INDUSTRY_SWATCH_IDX[industry];
    if(si !== undefined){ _activeSwatchIdx = si; renderSwatches(); }
  }
}

function addMenuItem(val){
  val = val || '';
  var list = document.getElementById('menuList');
  if(list.children.length >= 4) return;
  var row = document.createElement('div'); row.className = 'mrow';
  var inp = document.createElement('input'); inp.type='text'; inp.placeholder='Item Name $Price'; inp.value=val;
  var rm  = document.createElement('button'); rm.className='rm-btn'; rm.title='Remove'; rm.innerHTML='&#215;';
  rm.onclick = function(){ this.parentElement.remove(); };
  row.appendChild(inp); row.appendChild(rm);
  list.appendChild(row);
}

function getMenu(){
  return Array.from(document.querySelectorAll('.mrow input'))
    .map(function(i){ return i.value.trim(); }).filter(Boolean).slice(0,4);
}

// ── Photo / library ────────────────────────────────────────────────────────────
async function loadLibrary(){
  var industry = document.getElementById('industry').value;
  var grid = document.getElementById('libGrid');
  if(!industry){ grid.innerHTML = '<div class="img-empty">Select an industry above.</div>'; return; }
  grid.innerHTML = '<div class="img-loading">Loading library photos&hellip;</div>';
  try{
    var r = await fetch('/api/image-library?industry=' + encodeURIComponent(industry));
    var data = await r.json();
    var imgs = data.images || [];
    if(!imgs.length){ grid.innerHTML = '<div class="img-empty">No photos yet. Upload your own above.</div>'; return; }
    grid.innerHTML = imgs.map(function(img,i){
      return '<div class="img-thumb" id="lthumb-'+i+'" onclick="selectLibPhoto('+i+',this)">'
        + '<img src="'+esc(img.thumb_url)+'" loading="lazy" alt="">'
        + '<div class="chk">&#10003;</div>'
        + '<input type="hidden" id="lurl-'+i+'" value="'+esc(img.image_url)+'">'
        + '</div>';
    }).join('');
  }catch(e){ grid.innerHTML = '<div class="img-empty">Error loading library: ' + e.message + '</div>'; }
}

function selectLibPhoto(i, el){
  document.querySelectorAll('.img-thumb').forEach(function(t){ t.classList.remove('selected'); });
  el.classList.add('selected');
  _selectedPhotoUrl = document.getElementById('lurl-'+i).value;
}

function handlePhotoUpload(input){
  var file = input.files[0]; if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e){
    _selectedPhotoUrl = e.target.result;
    document.querySelectorAll('.img-thumb').forEach(function(t){ t.classList.remove('selected'); });
    document.getElementById('photoPreview').src = e.target.result;
    document.getElementById('photoZone').classList.add('has-file');
  };
  reader.readAsDataURL(file);
}

function clearPhoto(evt){
  evt.preventDefault(); evt.stopPropagation();
  _selectedPhotoUrl = '';
  var zone = document.getElementById('photoZone');
  zone.classList.remove('has-file');
  document.getElementById('photoPreview').src = '';
  var inp = zone.querySelector('input[type=file]'); if(inp) inp.value='';
}

function handleLogoUpload(input){
  var file = input.files[0]; if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e){
    _logoData = e.target.result;
    document.getElementById('logoPreview').src = e.target.result;
    document.getElementById('logoZone').classList.add('has-file');
  };
  reader.readAsDataURL(file);
}

function clearLogo(evt){
  evt.preventDefault(); evt.stopPropagation();
  _logoData = '';
  var zone = document.getElementById('logoZone');
  zone.classList.remove('has-file');
  document.getElementById('logoPreview').src = '';
  var inp = zone.querySelector('input[type=file]'); if(inp) inp.value='';
}

// ── Taken-industry dialog ──────────────────────────────────────────────────────
function applyTakenIndustries(){
  var sel = document.getElementById('industry');
  if(!sel) return;
  for(var i=0;i<sel.options.length;i++){
    var opt = sel.options[i];
    if(!opt.value) continue;
    var taken = _takenCategories.indexOf(opt.text) !== -1;
    opt.disabled = taken;
    opt.style.color = taken ? '#aaa' : '';
    opt.style.fontStyle = taken ? 'italic' : '';
  }
}

function showTakenDialog(industry){
  var el = document.getElementById('takenIndustryName');
  if(el) el.textContent = industry;
  document.getElementById('takenOverlay').classList.add('visible');
}

function closeTakenDialog(){
  document.getElementById('takenOverlay').classList.remove('visible');
  var sel = document.getElementById('industry'); if(sel) sel.value = '';
}

function goRequestOptions(){
  document.getElementById('takenOverlay').classList.remove('visible');
  var industry = (document.getElementById('takenIndustryName')||{}).textContent || '';
  var bizName  = document.getElementById('bizName').value.trim();
  var url = '/request-options?category=' + encodeURIComponent(industry);
  if(bizName) url += '&bizName=' + encodeURIComponent(bizName);
  window.open(url, '_blank');
  var sel = document.getElementById('industry'); if(sel) sel.value = '';
}

// ── UI helpers ─────────────────────────────────────────────────────────────────
function fieldHighlight(id){
  var el = document.getElementById(id); if(!el) return;
  el.classList.remove('field-error'); void el.offsetWidth;
  el.classList.add('field-error');
  el.scrollIntoView({behavior:'smooth',block:'center'});
  el.addEventListener('input',function c(){ el.classList.remove('field-error'); el.removeEventListener('input',c); });
}

function showErr(msg){
  var box = document.getElementById('errBox');
  box.textContent = '\u26a0\ufe0f ' + msg;
  box.classList.add('visible');
  box.scrollIntoView({behavior:'smooth',block:'start'});
}

function hideErr(){ document.getElementById('errBox').classList.remove('visible'); }

function showToast(msg){
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 3500);
}

// ── Prefill ────────────────────────────────────────────────────────────────────
(function prefill(){
  var params = new URLSearchParams(window.location.search);
  _spotSize   = params.get('spotSize') || 'XL';
  _spotId     = parseInt(params.get('spotId') || '0', 10) || 0;
  _campaignId = parseInt(params.get('campaignId') || '0', 10) || 0;
  _side       = params.get('side') || 'front';
  var takenParam = params.get('taken') || '';
  _takenCategories = takenParam ? takenParam.split(',').map(function(s){ return s.trim(); }).filter(Boolean) : [];
  applyTakenIndustries();
  renderSwatches();
  renderVariations();
  // Fetch server-side taken categories
  fetch('/api/campaigns/active/taken-categories')
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(data){ if(data && Array.isArray(data.takenCategories)){ _takenCategories = data.takenCategories; applyTakenIndustries(); } })
    .catch(function(){});
  // Fetch campaign-used templates
  if(_campaignId && _spotId){
    fetch('/api/campaigns/' + _campaignId + '/used-templates?spotId=' + _spotId)
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(data){ if(data){ _campaignUsedTemplates = (_side==='back' ? data.back : data.front) || []; } })
      .catch(function(){});
  }
  // Prefill from URL params or use demo data
  var urlBiz      = params.get('bizName') || '';
  var urlIndustry = params.get('industry') || '';
  if(urlBiz){
    var el = document.getElementById('bizName'); if(el) el.value = urlBiz;
    if(urlIndustry){
      var sel = document.getElementById('industry');
      for(var i=0;i<sel.options.length;i++){
        if(sel.options[i].text === urlIndustry){ sel.selectedIndex=i; break; }
      }
    }
    onIndustryChange();
  } else {
    var demo = {
      bizName:"",tagline:"From-Scratch Biscuits & Boba!",
      phone:"(706) 754-0105",city:"Clarkesville, GA",address:"596 W Louise St",
      website:"mytownpostcard.com",offer:"$1 OFF Any Biscuit",
      offerFine:"1 per visit \u00b7 with this postcard"
    };
    Object.keys(demo).forEach(function(id){ var e=document.getElementById(id); if(e) e.value=demo[id]; });
    onIndustryChange();
  }
  onFormChange();
})();
</script>
</body>
</html>`;


// ── CLASSIC_HTML — original full template picker ──────────────────────────────
const CLASSIC_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Town Postcard &mdash; My Town Ad Generator</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700&family=Crimson+Pro:ital@0;1&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
:root{
  --burg:#7C1C2E;--burg-dark:#5a1220;--burg-pale:#f9eaed;
  --ink:#0f1117;--ink-mid:#374151;--ink-light:#6B7280;
  --surface:#F4F1ED;--card:#fff;--border:#E2DDD6;
  --green:#1a5c3a;--xai:#1a1a2e;
}
body{font-family:'DM Sans',sans-serif;background:var(--surface);color:var(--ink);display:flex;flex-direction:column}

.hdr{background:#fff;padding:0 28px;display:flex;align-items:center;justify-content:space-between;height:54px;border-bottom:3px solid var(--burg);flex-shrink:0}
.brand{font-family:'Bebas Neue',sans-serif;font-size:27px;color:var(--xai);letter-spacing:.08em;display:flex;align-items:center;gap:10px}
.brand span{color:var(--burg)}
.brand-logo{height:42px;width:auto;display:block;flex-shrink:0}
.hdr-badge{background:var(--burg);color:#fff;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:4px 12px;border-radius:20px;display:flex;align-items:center;gap:6px}

.layout{display:grid;grid-template-columns:400px 1fr;flex:1;min-height:0;overflow:hidden}

.fpanel{background:var(--card);border-right:1.5px solid var(--border);padding:18px 18px 60px;overflow-y:auto;display:flex;flex-direction:column;gap:14px}
.ptitle{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:.06em;margin-bottom:2px}
.psub{font-family:'Crimson Pro',serif;font-style:italic;font-size:15px;color:var(--ink-light);line-height:1.4;margin-bottom:4px}
.sec-label{font-size:13px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--burg);padding-bottom:8px;border-bottom:1.5px solid var(--burg-pale);margin-bottom:8px}
.field{margin-bottom:8px}
.field:last-child{margin-bottom:0}
.field label{display:block;font-size:13.5px;font-weight:600;color:var(--ink-mid);margin-bottom:3px;letter-spacing:.05em;text-transform:uppercase}
.field input,.field select{width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:7px;font-family:'DM Sans',sans-serif;font-size:14px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.field input:focus,.field select:focus{border-color:var(--burg);background:#fff}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.menu-list{display:flex;flex-direction:column;gap:5px;margin-bottom:7px}
.mrow{display:flex;gap:6px;align-items:center}
.mrow input{flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:'DM Sans',sans-serif;font-size:13.5px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.mrow input:focus{border-color:var(--burg);background:#fff}
.rm-btn{width:24px;height:24px;border-radius:5px;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-light);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;line-height:1}
.rm-btn:hover{border-color:#c0392b;color:#c0392b;background:#fef2f2}
.add-btn{font-size:13px;font-weight:600;color:var(--burg);background:none;border:1.5px dashed var(--burg);border-radius:6px;padding:5px 12px;cursor:pointer;width:100%;transition:all .2s;font-family:'DM Sans',sans-serif}
.add-btn:hover{background:var(--burg-pale)}

.rpanel{background:#ECEAE6;padding:18px 22px 22px;overflow-y:auto;display:flex;flex-direction:column;gap:14px}
.rpanel>*{flex-shrink:0}

.card{background:var(--card);border:1.5px solid var(--border);border-radius:11px;overflow:hidden}
.card-hdr{padding:11px 16px;border-bottom:1px solid var(--border);background:#FAFAF8;display:flex;align-items:center;justify-content:space-between}
.card-title{font-size:15px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--burg)}
.card-body{padding:14px 16px}

.tmpl-preview{display:flex;align-items:center;gap:12px}
.tmpl-img{width:64px;height:80px;object-fit:cover;border-radius:6px;border:1.5px solid var(--border)}
.tmpl-info{flex:1}
.tmpl-name{font-size:13px;font-weight:700;color:var(--ink)}
.tmpl-sub{font-size:11px;color:var(--ink-light);margin-top:2px}
.tmpl-badge{display:inline-flex;align-items:center;gap:4px;background:#f0fdf4;border:1px solid var(--green);color:var(--green);font-size:12px;font-weight:700;padding:2px 8px;border-radius:99px;margin-top:5px}

/* ── Template grid ───────────────────────────────────────── */
.tmpl-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:5px}
.tmpl-card{border:2px solid var(--border);border-radius:7px;overflow:hidden;cursor:pointer;transition:all .18s;background:#fff;display:flex;flex-direction:column}
.tmpl-card:hover:not(.disabled){border-color:var(--burg);box-shadow:0 2px 8px rgba(124,28,46,.15)}
.tmpl-card.active{border-color:var(--green);box-shadow:0 0 0 1px var(--green)}
.tmpl-card.disabled{cursor:default;opacity:.55}
/* Orientation-aware thumbnail — aspect-ratio set via orientation class on .tmpl-grid */
.tmpl-thumb{width:100%;object-fit:contain;display:block;background:#f0ede8;flex-shrink:0}
.tmpl-grid.portrait  .tmpl-thumb{aspect-ratio:4/5}
.tmpl-grid.landscape .tmpl-thumb{aspect-ratio:5/4}
.tmpl-grid.square    .tmpl-thumb{aspect-ratio:1/1}
.tmpl-card-name{font-size:11px;font-weight:700;color:var(--ink);padding:3px 5px 1px;line-height:1.2}
.tmpl-card-sub{display:none}
.tmpl-sel-badge{display:inline-flex;align-items:center;gap:2px;background:#f0fdf4;border:1px solid var(--green);color:var(--green);font-size:10px;font-weight:700;padding:1px 5px;border-radius:99px;margin:0 5px 4px}
.cs-badge{display:inline-flex;align-items:center;background:#f3f4f6;border:1px solid #d1d5db;color:#9ca3af;font-size:10px;font-weight:700;padding:1px 5px;border-radius:99px;margin:0 5px 4px;letter-spacing:.04em;text-transform:uppercase}
/* Landscape placeholder — shown when spot is landscape and no landscape templates exist */
.tmpl-landscape-ph{display:none;padding:22px 16px;text-align:center;background:#f8f7f5;border-radius:9px;border:2px dashed var(--border)}
.tmpl-landscape-ph.visible{display:block}
.tmpl-landscape-ph-icon{font-size:30px;margin-bottom:8px}
.tmpl-landscape-ph-title{font-size:14px;font-weight:700;color:var(--ink-mid);margin-bottom:4px}
.tmpl-landscape-ph-sub{font-size:13px;color:var(--ink-light);line-height:1.5}

/* ── Photo library ───────────────────────────────────────── */
.img-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.img-thumb{position:relative;aspect-ratio:4/3;border-radius:6px;overflow:hidden;cursor:pointer;border:2.5px solid transparent;transition:all .2s}
.img-thumb:hover{transform:scale(1.03)}
.img-thumb.selected{border-color:var(--burg);box-shadow:0 0 0 1.5px var(--burg)}
.img-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.img-thumb .chk{display:none;position:absolute;top:3px;right:3px;background:var(--burg);color:#fff;border-radius:50%;width:16px;height:16px;font-size:9px;font-weight:900;align-items:center;justify-content:center}
.img-thumb.selected .chk{display:flex}
.img-empty{grid-column:1/-1;padding:14px 8px;text-align:center;font-size:13px;color:var(--ink-light);line-height:1.5}
.img-loading{grid-column:1/-1;padding:14px 8px;text-align:center;font-size:13px;color:var(--ink-light)}
.fnote{font-size:12px;color:var(--ink-light);margin-top:5px;line-height:1.4}

/* ── Side-by-side photo + logo ────────────────────────────── */
.photo-logo-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}
.logo-col{display:flex;flex-direction:column;gap:8px}
.lib-section{margin-top:10px}
.lib-label{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-light);margin-bottom:6px}

/* ── Upload zones ─────────────────────────────────────────── */
.upload-zone{border:2px dashed var(--border);border-radius:8px;padding:14px 10px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s;background:var(--surface);position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:110px}
.upload-zone.photo-zone{min-height:130px}
.upload-zone.logo-zone{min-height:80px}
.upload-zone:hover:not(.has-file){border-color:var(--burg);background:var(--burg-pale)}
.upload-zone.has-file{border-color:var(--green);background:#f0fdf4;padding:6px;justify-content:flex-start;align-items:stretch;min-height:0}
/* Logo zone keeps its fixed height when a file is loaded — thumbnail only */
.logo-zone.has-file{min-height:80px;justify-content:center;align-items:center;padding:6px}
.upload-zone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;z-index:2}
/* Placeholder content (icon + text) */
.upload-placeholder{display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none}
.upload-icon{font-size:22px;opacity:.45}
.upload-label{font-size:13.5px;font-weight:600;color:var(--ink-mid);margin-top:2px}
.upload-sub{font-size:12px;color:var(--ink-light);margin-top:1px;line-height:1.3;max-width:140px}
/* Hide placeholder and show full image when file is loaded */
.upload-zone.has-file .upload-placeholder{display:none}
.upload-preview{display:none;width:100%;height:auto;object-fit:contain;border-radius:5px}
.upload-zone.has-file .upload-preview{display:block}
/* Logo thumbnail — constrained to zone height, centered */
.logo-zone.has-file .upload-preview{width:auto;max-height:64px;margin:0 auto}
/* Clear-upload button */
.upload-clear{position:absolute;top:5px;right:5px;z-index:3;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;border:none;cursor:pointer;font-size:13px;display:none;align-items:center;justify-content:center;line-height:1}
.upload-zone.has-file .upload-clear{display:flex}

.gen-btn{width:100%;padding:13px 16px;background:linear-gradient(135deg,#1a1a2e,#3D1A6B);color:#fff;border:none;border-radius:10px;font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:.14em;cursor:pointer;transition:all .25s;display:flex;align-items:center;justify-content:center;gap:8px}
.gen-btn:hover:not(:disabled){background:linear-gradient(135deg,#2a2a4e,#5a2490);transform:translateY(-1px);box-shadow:0 6px 24px rgba(80,30,180,.35)}
.gen-btn:disabled{background:#888;cursor:not-allowed;transform:none;box-shadow:none}
.gen-spark{font-size:17px;animation:sp 2s ease-in-out infinite}
@keyframes sp{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}

.loading-panel{background:var(--card);border:1.5px solid var(--border);border-radius:11px;padding:18px 14px;text-align:center;display:none}
.loading-panel.visible{display:block}
.spinner{width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--burg);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 10px}
@keyframes spin{to{transform:rotate(360deg)}}
.loading-title{font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:.08em;color:var(--ink);margin-bottom:4px}
.loading-sub{font-size:13px;color:var(--ink-light);line-height:1.4}

.result-panel{background:var(--card);border:1.5px solid var(--border);border-radius:11px;overflow:hidden;display:none}
.result-panel.visible{display:block}
.result-hdr{padding:8px 12px;border-bottom:1px solid var(--border);background:#FAFAF8;display:flex;align-items:center;justify-content:space-between}
.result-title{font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--green)}
.result-img-wrap{display:flex;justify-content:center;background:#f5f3f0}
.result-img{display:block;width:100%;height:auto;object-fit:contain;border-radius:0}
.result-actions{padding:8px 10px;display:flex;gap:6px;flex-wrap:wrap;border-top:1px solid var(--border);align-items:center}
.act-btn{padding:9px 18px;border-radius:8px;font-size:13.5px;font-weight:600;cursor:pointer;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-mid);transition:all .2s;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:6px}
.act-btn:hover:not(:disabled){border-color:var(--burg);color:var(--burg)}
.act-btn.primary{background:var(--green);border-color:var(--green);color:#fff;font-size:14.5px;font-weight:700}
.act-btn.primary:hover:not(:disabled){background:#144d30}
.act-btn.ml{margin-left:auto}

.err-box{padding:14px 16px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;font-size:14px;color:#991b1b;line-height:1.5;display:none}
.err-box.visible{display:block}
.field-error{border-color:#ef4444 !important;box-shadow:0 0 0 3px rgba(239,68,68,.25) !important;animation:field-shake .35s ease}
@keyframes field-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}

.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:var(--ink);color:#fff;padding:10px 22px;border-radius:30px;font-size:14px;font-weight:600;box-shadow:0 8px 32px rgba(0,0,0,.3);transition:transform .3s cubic-bezier(.34,1.56,.64,1);z-index:999;pointer-events:none}
.toast.show{transform:translateX(-50%) translateY(0)}

@media(max-width:860px){.layout{grid-template-columns:1fr;overflow:auto}html,body{height:auto;overflow:auto}.fpanel,.rpanel{overflow:visible}.photo-logo-row{grid-template-columns:1fr}}

/* ── Industry conflict dialog ──────────────────────────────── */
#takenOverlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:9999;align-items:center;justify-content:center;padding:16px}
#takenOverlay.visible{display:flex}
#takenCard{background:#fff;border-radius:14px;max-width:400px;width:100%;padding:32px 28px;box-shadow:0 24px 64px rgba(0,0,0,0.45);text-align:center;font-family:'DM Sans',sans-serif}
#takenCard .tc-icon{font-size:42px;margin-bottom:12px;line-height:1}
#takenCard .tc-title{font-weight:900;font-size:20px;color:#0f1117;margin:0 0 10px;font-family:'Bebas Neue',sans-serif;letter-spacing:.05em}
#takenCard .tc-body{color:#6B7280;font-size:13px;line-height:1.65;margin:0 0 24px}
#takenCard .tc-industry{color:#0f1117;font-weight:700}
.tc-btn{display:block;width:100%;padding:12px 0;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;letter-spacing:.03em;transition:opacity .15s;border:none;margin-bottom:8px}
.tc-btn:last-child{margin-bottom:0}
.tc-btn.primary{background:#0f1117;color:#fff}
.tc-btn.secondary{background:#fff;color:#7C1C2E;border:2px solid #7C1C2E}

/* ── Refine panel ─────────────────────────────────────────── */
.refine-panel{padding:11px 12px 10px;border-top:1.5px solid var(--border);background:#f8f7f4}
.refine-label{font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-mid);margin-bottom:7px}
.refine-row{display:flex;gap:7px}
.refine-input{flex:1;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--ink);background:#fff;outline:none;transition:border-color .2s}
.refine-input:focus{border-color:var(--burg)}
.refine-input::placeholder{color:#b0aaa4}
.refine-btn{padding:8px 16px;background:var(--burg);color:#fff;border:none;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;transition:background .2s;flex-shrink:0}
.refine-btn:hover:not(:disabled){background:var(--burg-dark)}
.refine-btn:disabled{background:#aaa;cursor:not-allowed}
.refine-err{font-size:13px;color:#991b1b;margin-top:6px;display:none;line-height:1.4}
.refine-err.visible{display:block}
.refine-loading{font-size:13px;color:var(--ink-light);margin-top:6px;display:none;line-height:1.4}
.refine-loading.visible{display:block}
.refine-footer{display:flex;align-items:center;justify-content:space-between;margin-top:5px}
.refine-hint{font-size:12px;color:var(--ink-light);line-height:1.4}
.refine-revert-btn{background:none;border:none;font-size:13px;color:var(--burg);cursor:pointer;padding:0;font-family:'DM Sans',sans-serif;text-decoration:underline;text-underline-offset:2px;transition:color .2s;white-space:nowrap}
.refine-revert-btn:hover{color:var(--burg-dark)}

/* ── Portrait-mode hint banner ────────────────────────────── */
#rotateHint{display:none;background:#fdf8ef;border:1.5px solid #C9A84C;border-radius:8px;padding:10px 14px;margin-bottom:10px;align-items:center;gap:10px;font-size:13px;color:#374151;flex-shrink:0}
#rotateHint.visible{display:flex}
.rotate-hint-icon{font-size:18px;flex-shrink:0}
.rotate-hint-text{flex:1;line-height:1.4}
.rotate-hint-close{width:22px;height:22px;border:none;background:none;cursor:pointer;color:#9ca3af;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;border-radius:4px;flex-shrink:0;line-height:1;padding:0;font-family:sans-serif}
.rotate-hint-close:hover{background:#f3f0ea;color:#374151}

/* ── Responsive template grid ─────────────────────────────── */
@media(max-width:700px){.tmpl-grid{grid-template-columns:repeat(4,1fr)}}
@media(max-width:480px){.tmpl-grid{grid-template-columns:repeat(3,1fr)}}
</style>
</head>
<body>

<header class="hdr">
  <div class="brand"><img class="brand-logo" src="/mailbox-logo.png" alt="">My Town <span>Postcard</span></div>
  <div class="hdr-badge">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
    My Town Ad Generator
  </div>
</header>

<div class="toast" id="toast"></div>

<div class="layout">

  <!-- LEFT: FORM -->
  <div class="fpanel">
    <div>
      <div class="ptitle">Ad Generator</div>
      <div class="psub">Fill in your details, pick a photo, and let our AI generate your finished postcard ad &mdash; no console, no file attachments.</div>
    </div>

    <div>
      <div class="sec-label">Business Info</div>
      <div class="field"><label>Business Name *</label><input type="text" id="bizName" placeholder="Mr. Biscuit's Cafe" oninput="onFormChange()"></div>
      <div class="field"><label>Industry</label>
        <select id="industry" onchange="onIndustryChange()">
          <option value="">&mdash; Select &mdash;</option>
          <option>Pizza Restaurant</option><option>Mexican Restaurant</option><option>Chinese Restaurant</option>
          <option>Breakfast &amp; Cafe</option><option>Bar &amp; Grill</option><option>Italian Restaurant</option>
          <option>Bakery</option><option>Coffee Shop</option><option>Dentist</option>
          <option>Medical &amp; Healthcare</option><option>Chiropractor</option><option>Veterinarian</option>
          <option>HVAC</option><option>Plumber</option><option>Electrician</option>
          <option>Lawn &amp; Landscaping</option><option>Roofing</option><option>Painting</option>
          <option>Cleaning Service</option><option>Pest Control</option><option>Real Estate</option>
          <option>Insurance</option><option>Auto Repair</option><option>Salon &amp; Beauty</option>
          <option>Barbershop</option><option>Gym &amp; Fitness</option><option>Pet Services</option>
          <option>Financial Services</option><option>Daycare</option><option>Photography</option>
          <option>Retail Shop</option><option>Other Service</option>
        </select>
      </div>
      <div class="field"><label>Tagline / Slogan</label><input type="text" id="tagline" placeholder="From-Scratch Biscuits &amp; Boba!"></div>
      <div class="frow">
        <div class="field"><label>Phone *</label><input type="text" id="phone" placeholder="(706) 754-0105"></div>
        <div class="field"><label>City, State</label><input type="text" id="city" placeholder="Clarkesville, GA"></div>
      </div>
      <div class="field"><label>Street Address</label><input type="text" id="address" placeholder="596 W Louise St"></div>
      <div class="field"><label>Website / URL</label><input type="text" id="website" placeholder="mytownpostcard.com"></div>
      <div class="field"><label>Contact Email <span style="font-weight:400;color:var(--ink-light)">(for reservation)</span></label><input type="email" id="email" placeholder="owner@mrbiscuitscafe.com"></div>
    </div>

    <div>
      <div class="sec-label">Menu Items / Services (up to 4)</div>
      <div class="menu-list" id="menuList"></div>
      <button class="add-btn" onclick="addMenuItem()">+ Add Item</button>
    </div>

    <div>
      <div class="sec-label">Special Offer / Coupon</div>
      <div class="field"><label>Offer</label><input type="text" id="offer" placeholder="$1 OFF Any Biscuit"></div>
      <div class="field"><label>Fine Print</label><input type="text" id="offerFine" placeholder="1 per visit &middot; with this postcard"></div>
    </div>
  </div>

  <!-- RIGHT: TEMPLATE + IMAGES + GENERATE + RESULT -->
  <div class="rpanel">

    <!-- Template -->
    <div class="card">
      <div class="card-hdr">
        <div class="card-title">Choose a Template</div>
        <span id="tmplOrientationLabel" style="font-size:12px;color:var(--ink-light)"></span>
      </div>
      <div class="card-body" style="padding:10px 12px">
        <!-- Portrait-mode hint: shown only on narrow portrait screens, dismissible for session -->
        <div id="rotateHint">
          <span class="rotate-hint-icon">&#8635;</span>
          <span class="rotate-hint-text">Tip: rotate your phone to landscape for the best view of templates</span>
          <button class="rotate-hint-close" onclick="dismissRotateHint()" aria-label="Dismiss">&times;</button>
        </div>
        <!-- Shown when every template on this side is already taken -->
        <div id="tmplAllUsedBanner" style="display:none;margin-bottom:8px;padding:7px 10px;background:#fff7ed;border:1px solid #f59e0b;border-radius:6px;font-size:13px;color:#92400e;font-weight:600;">
          All styles are already in use on this side — choose any to reuse a style.
        </div>
        <!-- Grid shown for portrait & square; hidden for landscape -->
        <div class="tmpl-grid portrait" id="tmplGrid">
          <div class="tmpl-card active" id="tmpl-parchment-classic" onclick="selectTemplate('parchment-classic')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/parchment-classic" alt="Parchment Classic" onerror="this.style.background='#e8e3dc'">
            <div class="tmpl-card-name">Parchment Classic</div>
            <div class="tmpl-card-sub">Parchment &middot; Brush stroke &middot; Rustic charm</div>
            <div class="tmpl-sel-badge" id="badge-parchment-classic">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-made-fresh" onclick="selectTemplate('made-fresh')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/made-fresh" alt="Made Fresh" onerror="this.style.background='#f0f9f0'">
            <div class="tmpl-card-name">Made Fresh</div>
            <div class="tmpl-card-sub">Warm wood &middot; Chalkboard &middot; Fresh &amp; modern</div>
            <div class="tmpl-sel-badge" id="badge-made-fresh" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-health-wellness" onclick="selectTemplate('health-wellness')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/health-wellness" alt="Health &amp; Wellness" onerror="this.style.background='#e8f5f5'">
            <div class="tmpl-card-name">Health &amp; Wellness</div>
            <div class="tmpl-card-sub">Teal &amp; sage &middot; Medical &amp; wellness &middot; Calming</div>
            <div class="tmpl-sel-badge" id="badge-health-wellness" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-at-your-service" onclick="selectTemplate('at-your-service')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/at-your-service" alt="At Your Service" onerror="this.style.background='#1a2744'">
            <div class="tmpl-card-name">At Your Service</div>
            <div class="tmpl-card-sub">Navy &amp; gold &middot; Home services &middot; Professional</div>
            <div class="tmpl-sel-badge" id="badge-at-your-service" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-neighborhood-pro" onclick="selectTemplate('neighborhood-pro')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/neighborhood-pro" alt="Neighborhood Pro" onerror="this.style.background='#e8f5e9'">
            <div class="tmpl-card-name">Neighborhood Pro</div>
            <div class="tmpl-sel-badge" id="badge-neighborhood-pro" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-home-elegance" onclick="selectTemplate('home-elegance')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/home-elegance" alt="Home Elegance" onerror="this.style.background='#0f2040'">
            <div class="tmpl-card-name">Home Elegance</div>
            <div class="tmpl-card-sub">Navy &middot; Gold &middot; Circular photos &middot; Premium</div>
            <div class="tmpl-sel-badge" id="badge-home-elegance" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-sage-organic" onclick="selectTemplate('sage-organic')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/sage-organic" alt="Sage Organic" onerror="this.style.background='#3d4a2a'">
            <div class="tmpl-card-name">Sage Organic</div>
            <div class="tmpl-card-sub">Olive green &middot; Botanical &middot; Kraft coupon</div>
            <div class="tmpl-sel-badge" id="badge-sage-organic" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-purple-sage" onclick="selectTemplate('purple-sage')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/purple-sage" alt="Purple Sage" onerror="this.style.background='#7b6d9e'">
            <div class="tmpl-card-name">Purple Sage</div>
            <div class="tmpl-card-sub">Lavender &middot; Sage green &middot; Circular photos</div>
            <div class="tmpl-sel-badge" id="badge-purple-sage" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-brush-stroke" onclick="selectTemplate('brush-stroke')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/brush-stroke" alt="Brush Stroke" onerror="this.style.background='#4a5a2a'">
            <div class="tmpl-card-name">Brush Stroke</div>
            <div class="tmpl-card-sub">Olive &amp; parchment &middot; Home services &middot; Circular photo</div>
            <div class="tmpl-sel-badge" id="badge-brush-stroke" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-heritage-home" onclick="selectTemplate('heritage-home')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/heritage-home" alt="Heritage Home" onerror="this.style.background='#6b1a2a'">
            <div class="tmpl-card-name">Heritage Home</div>
            <div class="tmpl-card-sub">Burgundy &amp; cream &middot; Home services &middot; Premium</div>
            <div class="tmpl-sel-badge" id="badge-heritage-home" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-wok-fire" onclick="selectTemplate('wok-fire')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/wok-fire" alt="Wok Fire" onerror="this.style.background='#1a0505'">
            <div class="tmpl-card-name">Wok Fire</div>
            <div class="tmpl-card-sub">Dark &amp; dramatic &middot; Restaurant &middot; Red &amp; gold</div>
            <div class="tmpl-sel-badge" id="badge-wok-fire" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-surprise-me" onclick="selectTemplate('surprise-me')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/surprise-me" alt="Surprise Me" onerror="this.style.background='linear-gradient(135deg,#7b1418,#1b2a4a,#1c3a1c)';this.style.display='flex';this.style.alignItems='center';this.style.justifyContent='center';this.innerHTML='<span style=font-size:2em>&#10067;</span>'">
            <div class="tmpl-card-name">Surprise Me</div>
            <div class="tmpl-card-sub">AI invents &middot; Industry-driven &middot; Fully original</div>
            <div class="tmpl-sel-badge" id="badge-surprise-me" style="display:none">&#10003; Selected</div>
          </div>
        </div>
        <!-- Landscape template grid (shown only when spot is landscape) -->
        <div class="tmpl-grid landscape" id="tmplLandscapeGrid" style="display:none">
          <div class="tmpl-card active" id="tmpl-ls-parchment-classic" onclick="selectTemplate('parchment-classic')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/parchment-classic-landscape" alt="Parchment Classic" onerror="this.style.background='#e8e3dc'">
            <div class="tmpl-card-name">Parchment Classic</div>
            <div class="tmpl-card-sub">Parchment &middot; Brush stroke &middot; Rustic charm</div>
            <div class="tmpl-sel-badge" id="badge-ls-parchment-classic">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-ls-made-fresh" onclick="selectTemplate('made-fresh')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/made-fresh-landscape" alt="Made Fresh" onerror="this.style.background='#f0f9f0'">
            <div class="tmpl-card-name">Made Fresh</div>
            <div class="tmpl-card-sub">Warm wood &middot; Chalkboard &middot; Fresh &amp; modern</div>
            <div class="tmpl-sel-badge" id="badge-ls-made-fresh" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-ls-health-wellness" onclick="selectTemplate('health-wellness')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/health-wellness-landscape" alt="Health &amp; Wellness" onerror="this.style.background='#e8f5f5'">
            <div class="tmpl-card-name">Health &amp; Wellness</div>
            <div class="tmpl-card-sub">Teal &amp; sage &middot; Medical &amp; wellness &middot; Calming</div>
            <div class="tmpl-sel-badge" id="badge-ls-health-wellness" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-ls-at-your-service" onclick="selectTemplate('at-your-service')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/at-your-service-landscape" alt="At Your Service" onerror="this.style.background='#1a2744'">
            <div class="tmpl-card-name">At Your Service</div>
            <div class="tmpl-card-sub">Navy &amp; gold &middot; Home services &middot; Professional</div>
            <div class="tmpl-sel-badge" id="badge-ls-at-your-service" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-ls-neighborhood-pro" onclick="selectTemplate('neighborhood-pro')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/neighborhood-pro-landscape" alt="Neighborhood Pro" onerror="this.style.background='#e8f5e9'">
            <div class="tmpl-card-name">Neighborhood Pro</div>
            <div class="tmpl-card-sub">Forest green &middot; Outdoor &middot; Service panels</div>
            <div class="tmpl-sel-badge" id="badge-ls-neighborhood-pro" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-ls-home-elegance" onclick="selectTemplate('home-elegance')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/home-elegance-landscape" alt="Home Elegance" onerror="this.style.background='#0f2040'">
            <div class="tmpl-card-name">Home Elegance</div>
            <div class="tmpl-card-sub">Navy &middot; Gold &middot; Circular photos &middot; Premium</div>
            <div class="tmpl-sel-badge" id="badge-ls-home-elegance" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-ls-sage-organic" onclick="selectTemplate('sage-organic')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/sage-organic-landscape" alt="Sage Organic" onerror="this.style.background='#3d4a2a'">
            <div class="tmpl-card-name">Sage Organic</div>
            <div class="tmpl-card-sub">Olive green &middot; Botanical &middot; Kraft coupon</div>
            <div class="tmpl-sel-badge" id="badge-ls-sage-organic" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-ls-purple-sage" onclick="selectTemplate('purple-sage')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/purple-sage-landscape" alt="Purple Sage" onerror="this.style.background='#7b6d9e'">
            <div class="tmpl-card-name">Purple Sage</div>
            <div class="tmpl-card-sub">Lavender &middot; Sage green &middot; Circular photos</div>
            <div class="tmpl-sel-badge" id="badge-ls-purple-sage" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-ls-brush-stroke" onclick="selectTemplate('brush-stroke')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/brush-stroke-landscape" alt="Brush Stroke" onerror="this.style.background='#4a5a2a'">
            <div class="tmpl-card-name">Brush Stroke</div>
            <div class="tmpl-card-sub">Olive &amp; parchment &middot; Home services &middot; Circular photo</div>
            <div class="tmpl-sel-badge" id="badge-ls-brush-stroke" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-ls-heritage-home" onclick="selectTemplate('heritage-home')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/heritage-home-landscape" alt="Heritage Home" onerror="this.style.background='#6b1a2a'">
            <div class="tmpl-card-name">Heritage Home</div>
            <div class="tmpl-card-sub">Burgundy &amp; cream &middot; Home services &middot; Premium</div>
            <div class="tmpl-sel-badge" id="badge-ls-heritage-home" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-ls-wok-fire" onclick="selectTemplate('wok-fire')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/wok-fire-landscape" alt="Wok Fire" onerror="this.style.background='#1a0505'">
            <div class="tmpl-card-name">Wok Fire</div>
            <div class="tmpl-card-sub">Dark &amp; dramatic &middot; Restaurant &middot; Red &amp; gold</div>
            <div class="tmpl-sel-badge" id="badge-ls-wok-fire" style="display:none">&#10003; Selected</div>
          </div>
          <div class="tmpl-card" id="tmpl-ls-surprise-me" onclick="selectTemplate('surprise-me')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/surprise-me" alt="Surprise Me" onerror="this.style.background='linear-gradient(135deg,#7b1418,#1b2a4a,#1c3a1c)';this.style.display='flex';this.style.alignItems='center';this.style.justifyContent='center';this.innerHTML='<span style=font-size:2em>&#10067;</span>'">
            <div class="tmpl-card-name">Surprise Me</div>
            <div class="tmpl-card-sub">AI invents &middot; Industry-driven &middot; Fully original</div>
            <div class="tmpl-sel-badge" id="badge-ls-surprise-me" style="display:none">&#10003; Selected</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Hero Photo + Logo — side by side -->
    <div class="photo-logo-row">

      <!-- Left: Primary Photo -->
      <div class="card">
        <div class="card-hdr">
          <div class="card-title">Primary Photo</div>
          <span style="font-size:12px;color:var(--ink-light)" id="photoStatus">Optional</span>
        </div>
        <div class="card-body">
          <!-- Upload zone -->
          <div class="upload-zone photo-zone" id="photoZone">
            <input type="file" accept="image/*" onchange="handlePhotoUpload(this)">
            <div class="upload-placeholder">
              <div class="upload-icon">&#128248;</div>
              <div class="upload-label">Upload a photo</div>
              <div class="upload-sub">Food, product, or storefront &mdash; JPG, PNG, WebP</div>
            </div>
            <img class="upload-preview" id="photoPreview" alt="Photo preview">
            <button class="upload-clear" title="Remove photo" onclick="clearPhoto(event)">&#10005;</button>
          </div>
          <p class="fnote" style="margin-top:6px">Skip to let our AI generate a photo automatically.</p>
          <!-- Library grid always visible below -->
          <div class="lib-section">
            <div class="lib-label">Or pick from library</div>
            <div id="libGrid" class="img-grid">
              <div class="img-empty">Select an industry above to load photos.</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Logo + Generate -->
      <div class="logo-col">
        <div class="card">
          <div class="card-hdr">
            <div class="card-title">Company Logo</div>
            <span style="font-size:12px;color:var(--ink-light)" id="logoStatus">Optional</span>
          </div>
          <div class="card-body">
            <div class="upload-zone logo-zone" id="logoZone">
              <input type="file" accept="image/*" onchange="handleLogoUpload(this)">
              <div class="upload-placeholder">
                <div class="upload-icon">&#127991;&#65039;</div>
                <div class="upload-label">Upload logo</div>
                <div class="upload-sub">PNG with transparency preferred</div>
              </div>
              <img class="upload-preview" id="logoPreview" alt="Logo preview">
              <button class="upload-clear" title="Remove logo" onclick="clearLogo(event)">&#10005;</button>
            </div>
            <p class="fnote" style="margin-top:8px">Placed in the upper-left corner exactly as provided.</p>
          </div>
        </div>

        <!-- Generate button -->
        <button class="gen-btn" id="genBtn" onclick="generate()" disabled>
          <span class="gen-spark">&#9889;</span>
          <span id="genLabel">Generate My Ad</span>
        </button>

        <!-- Loading -->
        <div class="loading-panel" id="loadingPanel">
          <div class="spinner"></div>
          <div class="loading-title">My Town AI is designing your ad&hellip;</div>
          <div class="loading-sub">Usually 20&ndash;45 seconds. Our AI is compositing your images and placing your business text.</div>
        </div>

        <!-- Error -->
        <div class="err-box" id="errBox"></div>

        <!-- Result -->
        <div class="result-panel" id="resultPanel">
          <div class="result-hdr">
            <div class="result-title">&#10003; Your Ad</div>
            <button class="act-btn" onclick="resetResult()" style="padding:4px 10px;font-size:12px">&#8634; Start Over</button>
          </div>
          <div class="result-img-wrap"><img class="result-img" id="resultImg" alt="Generated ad"></div>
          <div class="result-actions">
            <button class="act-btn primary" onclick="useThisAd()">&#10003; Use This Ad</button>
            <button class="act-btn" onclick="downloadAd()">&#8595; Download</button>
            <button class="act-btn" onclick="generate()">&#8634; Regenerate</button>
          </div>
          <div class="refine-panel" id="refinePanel">
            <div class="refine-label">&#9998; Refine this ad</div>
            <div class="refine-row">
              <input type="text" id="refineInput" class="refine-input"
                placeholder='e.g. "Remove the word Shield" or "Change the phone number to 706-555-1234"'
                maxlength="300" onkeydown="if(event.key==='Enter')refineAd()">
              <button class="refine-btn" id="refineBtn" onclick="refineAd()">Apply</button>
            </div>
            <div class="refine-loading" id="refineLoading">&#8987; My Town AI is applying your change&hellip; (20&ndash;40 seconds)</div>
            <div class="refine-err" id="refineErr"></div>
            <div class="refine-footer">
              <div class="refine-hint">Type any correction and hit Apply. Our AI will update the ad without regenerating from scratch.</div>
              <button class="refine-revert-btn" id="refineRevertBtn" style="display:none" onclick="revertAd()">&#8617; Revert to original</button>
            </div>
          </div>
        </div>

      </div>

    </div>

  </div>
</div>

<script>
function esc(str){ var d=document.createElement('div');d.textContent=String(str||'');return d.innerHTML; }
var _selectedPhotoUrl = '';
var _logoData = '';
var _resultUrl = '';
var _generationCount = 0;
var _originalResultUrl = '';
var _activeTemplate = 'parchment-classic';
var _spotSize = 'XL';
var _spotId = 0;

var _takenCategories = [];
var _usedTemplates = [];
var _campaignId = 0;
var _side = 'front';

// ── Portrait-mode hint banner ────────────────────────────────────────────────
(function(){
  if(sessionStorage.getItem('rotateHintDismissed')) return;
  var hint = document.getElementById('rotateHint');
  if(!hint) return;
  var mq = window.matchMedia('(max-width:860px) and (orientation: portrait)');
  function update(e){ hint.classList.toggle('visible', e.matches); }
  update(mq);
  if(typeof mq.addEventListener === 'function') mq.addEventListener('change', update);
  else mq.addListener(update); // Safari <14 fallback
})();
function dismissRotateHint(){
  sessionStorage.setItem('rotateHintDismissed','1');
  var hint = document.getElementById('rotateHint');
  if(hint) hint.classList.remove('visible');
}

function applyUsedTemplates(){
  var KEYS = ['parchment-classic','made-fresh','health-wellness','at-your-service','neighborhood-pro','home-elegance','sage-organic','purple-sage'];
  var allUsed = _usedTemplates.length > 0 && KEYS.every(function(k){ return _usedTemplates.indexOf(k) !== -1; });

  // Banner: visible only when every template is already in use
  var banner = document.getElementById('tmplAllUsedBanner');
  if(banner) banner.style.display = allUsed ? 'block' : 'none';

  // Auto-fallback: if the current selection is taken and alternatives exist, pick the first free one
  if(!allUsed && _usedTemplates.indexOf(_activeTemplate) !== -1){
    var firstFree = KEYS.filter(function(k){ return _usedTemplates.indexOf(k) === -1; })[0];
    if(firstFree) selectTemplate(firstFree);
  }

  if(allUsed){
    // All templates taken — keep every card clickable, just show the banner
    return;
  }

  // Disable individual used cards
  var prefixes = ['tmpl-', 'tmpl-ls-'];
  prefixes.forEach(function(pfx){
    KEYS.forEach(function(key){
      var card = document.getElementById(pfx + key);
      if(!card) return;
      var used = _usedTemplates.indexOf(key) !== -1;
      if(used){
        card.classList.add('disabled');
        card.onclick = null;
        var badge = card.querySelector('.tmpl-sel-badge');
        if(badge){ badge.style.display='none'; }
        var existingNote = card.querySelector('.tmpl-used-note');
        if(!existingNote){
          var note = document.createElement('div');
          note.className = 'tmpl-used-note';
          note.style.cssText = 'font-size:11px;color:#7c1c2e;font-weight:700;padding:2px 5px 4px;';
          note.textContent = 'Used';
          card.appendChild(note);
        }
      }
    });
  });
}

function applyTakenIndustries(){
  var sel = document.getElementById('industry');
  if(!sel) return;
  for(var i=0;i<sel.options.length;i++){
    var opt = sel.options[i];
    if(!opt.value) continue;
    var taken = _takenCategories.indexOf(opt.text) !== -1;
    opt.disabled = taken;
    opt.style.color  = taken ? '#aaa' : '';
    opt.style.fontStyle = taken ? 'italic' : '';
  }
}

function showTakenDialog(industry){
  var overlay = document.getElementById('takenOverlay');
  var nameEl  = document.getElementById('takenIndustryName');
  if(nameEl) nameEl.textContent = industry;
  if(overlay) overlay.classList.add('visible');
}
function closeTakenDialog(){
  var overlay = document.getElementById('takenOverlay');
  if(overlay) overlay.classList.remove('visible');
  // Reset select back to empty
  var sel = document.getElementById('industry');
  if(sel) sel.value = '';
}
function goRequestOptions(){
  var overlay = document.getElementById('takenOverlay');
  if(overlay) overlay.classList.remove('visible');
  var industry = document.getElementById('takenIndustryName').textContent || '';
  var bizName = (document.getElementById('bizName') || {}).value || '';
  var url = '/request-options?category=' + encodeURIComponent(industry);
  if(bizName.trim()) url += '&bizName=' + encodeURIComponent(bizName.trim());
  window.open(url, '_blank');
  // Reset select too
  var sel = document.getElementById('industry');
  if(sel) sel.value = '';
}

// ── Orientation-aware template grid ────────────────────────────────────────
var SIZE_DIMS = { XL:{w:400,h:500}, L:{w:300,h:400}, M:{w:300,h:200}, S:{w:200,h:200} };
function getOrientation(sizeKey){
  var d = SIZE_DIMS[sizeKey] || SIZE_DIMS.XL;
  return d.h > d.w ? 'portrait' : d.w > d.h ? 'landscape' : 'square';
}
function applyTemplateOrientation(){
  var orientation = getOrientation(_spotSize);
  var pgrid = document.getElementById('tmplGrid');
  var lgrid = document.getElementById('tmplLandscapeGrid');
  var lbl   = document.getElementById('tmplOrientationLabel');
  var d = SIZE_DIMS[_spotSize] || SIZE_DIMS.XL;
  if(lbl) lbl.textContent = orientation.charAt(0).toUpperCase()+orientation.slice(1)+' \u00b7 '+d.w/100+'\u2033\u00d7'+d.h/100+'\u2033';
  var isLandscape = orientation === 'landscape';
  if(pgrid){ pgrid.classList.remove('portrait','landscape','square'); pgrid.classList.add(orientation); pgrid.style.display = isLandscape ? 'none' : 'grid'; }
  if(lgrid){ lgrid.style.display = isLandscape ? 'grid' : 'none'; }
  // Refresh the active-card state in whichever grid is now visible
  selectTemplate(_activeTemplate);
}

function selectTemplate(key){
  _activeTemplate = key;
  document.querySelectorAll('.tmpl-card').forEach(function(c){ c.classList.remove('active'); });
  document.querySelectorAll('.tmpl-sel-badge').forEach(function(b){ b.style.display='none'; });
  // Portrait grid
  var card = document.getElementById('tmpl-' + key);
  if(card){ card.classList.add('active'); }
  var badge = document.getElementById('badge-' + key);
  if(badge){ badge.style.display=''; }
  // Landscape grid
  var lcard = document.getElementById('tmpl-ls-' + key);
  if(lcard){ lcard.classList.add('active'); }
  var lbadge = document.getElementById('badge-ls-' + key);
  if(lbadge){ lbadge.style.display=''; }
}

function onFormChange(){
  var biz = document.getElementById('bizName').value.trim();
  document.getElementById('genBtn').disabled = !biz;
}

var TAGLINE_DEFAULTS = {
  'Pizza Restaurant':      'Fresh-Made Pizza, Fast & Hot!',
  'Mexican Restaurant':    'Authentic Flavors, Made Fresh Daily',
  'Chinese Restaurant':    'Traditional Recipes, Modern Taste',
  'Breakfast & Cafe':      'Start Your Morning Right',
  'Bar & Grill':           'Great Food, Cold Drinks, Good Times',
  'Italian Restaurant':    'Authentic Italian — From Our Kitchen to Yours',
  'Bakery':                'Baked Fresh Every Morning',
  'Coffee Shop':           'Your Daily Dose of Delicious',
  'Dentist':               'Healthy Smiles for the Whole Family',
  'Medical & Healthcare':  'Caring for Our Community',
  'Chiropractor':          'Pain Relief — Feel Better Fast',
  'Veterinarian':          'Compassionate Care for Your Pets',
  'HVAC':                  'Comfort Year-Round, Service You Trust',
  'Plumber':               'Fast, Reliable Plumbing — 24/7',
  'Electrician':           'Safe, Reliable Electrical Service',
  'Lawn & Landscaping':    'Beautiful Lawns, Zero Hassle',
  'Roofing':               'Protecting Your Home, Rain or Shine',
  'Painting':              'Transform Your Space — Inside & Out',
  'Cleaning Service':      'Spotless Results, Every Time',
  'Pest Control':          'Protecting Homes & Families',
  'Real Estate':           'Your Local Real Estate Expert',
  'Insurance':             'Coverage You Can Count On',
  'Auto Repair':           'Honest Service, Expert Repairs',
  'Salon & Beauty':        'Look and Feel Your Best',
  'Barbershop':            'Sharp Cuts, Great Service',
  'Gym & Fitness':         'Get Fit, Feel Amazing',
  'Pet Services':          'Treating Your Pets Like Family',
  'Financial Services':    'Building Your Financial Future',
  'Daycare':               'Safe, Nurturing Care for Your Child',
  'Photography':           'Capturing Your Priceless Moments',
  'Retail Shop':           'Something for Everyone — Shop Local',
};

var OFFER_DEFAULTS = {
  'Pizza Restaurant':      ['BOGO Tuesday — Buy One, Get One 50% Off','One per order \u00b7 with this postcard'],
  'Mexican Restaurant':    ['FREE Chips & Salsa with Any Entrée','One per table \u00b7 with this postcard'],
  'Chinese Restaurant':    ['10% OFF Your First Order','With this postcard'],
  'Breakfast & Cafe':      ['$1 OFF Any Breakfast Plate','One per visit \u00b7 with this postcard'],
  'Bar & Grill':           ['Happy Hour 3\u20136pm \u2014 $3 Draft Beers','Dine-in only \u00b7 with this postcard'],
  'Italian Restaurant':    ['FREE Dessert with Entrée Purchase','One per table \u00b7 with this postcard'],
  'Bakery':                ['Buy a Dozen, Get 2 FREE','With this postcard'],
  'Coffee Shop':           ['FREE Pastry with Any Latte','One per visit \u00b7 with this postcard'],
  'Dentist':               ['New Patient Special — Exam + X-Rays $49','New patients only \u00b7 call to schedule'],
  'Medical & Healthcare':  ['New Patient Visit — $99 Flat','New patients only \u00b7 call for details'],
  'Chiropractor':          ['First Visit — Exam + Adjustment $49','New patients only \u00b7 call to schedule'],
  'Veterinarian':          ['10% OFF First Wellness Visit','New clients only \u00b7 with this postcard'],
  'HVAC':                  ['FREE System Check — $89 Value','Call today to schedule'],
  'Plumber':               ['$25 OFF Any Service Call','With this postcard'],
  'Electrician':           ['FREE Safety Inspection — No Obligation','Call to schedule \u00b7 with this postcard'],
  'Lawn & Landscaping':    ['FREE First Mow with Monthly Service','New customers only \u00b7 call today'],
  'Roofing':               ['FREE Roof Inspection — No Pressure','Call or text to schedule'],
  'Painting':              ['10% OFF Any Interior Painting Job','With this postcard \u00b7 mention ad'],
  'Cleaning Service':      ['$20 OFF First Home Cleaning','New customers only \u00b7 with this postcard'],
  'Pest Control':          ['FREE Inspection + $20 OFF First Treatment','With this postcard'],
  'Real Estate':           ['FREE Home Valuation — No Obligation','Call or text to schedule'],
  'Insurance':             ['FREE Coverage Review — Could Save You 30%','No obligation \u00b7 call today'],
  'Auto Repair':           ['FREE Multi-Point Inspection with Any Service','With this postcard'],
  'Salon & Beauty':        ['$10 OFF First Visit','New clients only \u00b7 with this postcard'],
  'Barbershop':            ['First Cut $15 — New Customers Only','With this postcard'],
  'Gym & Fitness':         ['First Month FREE — No Contract','New members only \u00b7 call to enroll'],
  'Pet Services':          ['10% OFF First Grooming Appointment','New clients only \u00b7 with this postcard'],
  'Financial Services':    ['FREE 30-Minute Consultation','No obligation \u00b7 call to schedule'],
  'Daycare':               ['First Week FREE — Schedule a Tour Today','New enrollments only \u00b7 call for details'],
  'Photography':           ['$50 OFF Your First Session','With this postcard \u00b7 book in advance'],
  'Retail Shop':           ['10% OFF Entire Purchase — Show This Card','In-store only \u00b7 one use per customer'],
};

var MENU_DEFAULTS = {
  'Pizza Restaurant':      ['Pepperoni Pizza $12.99','Margherita Pizza $10.99','Chicken Wings $8.99','Caesar Salad $7.99'],
  'Mexican Restaurant':    ['Tacos (3) $9.99','Burrito Bowl $10.99','Nachos Supreme $8.99','Guacamole & Chips $6.99'],
  'Chinese Restaurant':    ["General Tso's Chicken $11.99",'Fried Rice $8.99','Spring Rolls (3) $5.99','Wonton Soup $6.99'],
  'Breakfast & Cafe':      ['Bacon Egg & Cheese $5.99','Pancake Stack $7.99','Breakfast Plate $8.99','Coffee & Muffin $4.99'],
  'Bar & Grill':           ['Cheeseburger & Fries $12.99','BBQ Ribs Half Rack $16.99','Chicken Tenders $10.99','Loaded Nachos $9.99'],
  'Italian Restaurant':    ['Fettuccine Alfredo $13.99','Chicken Parmigiana $14.99','Lasagna $12.99','Tiramisu $6.99'],
  'Bakery':                ['Fresh Sourdough Loaf $7.99','Croissants (2) $4.99','Custom Cakes — Call for Pricing','Muffins 6-Pack $8.99'],
  'Coffee Shop':           ['Latte $5.49','Cold Brew $4.99','Espresso $3.49','Pastry of the Day $3.99'],
  'Dentist':               ['New Patient Exam $49','Teeth Whitening $199','Dental Cleaning $79','Emergency — Same Day'],
  'Medical & Healthcare':  ['New Patient Visit $99','Annual Wellness Exam','Lab Work In-House','Telehealth Available'],
  'Chiropractor':          ['Initial Exam & X-Rays $49','Spinal Adjustment $45','Massage Therapy $60/hr','Family Plans Available'],
  'Veterinarian':          ['Wellness Exam $45','Vaccinations from $25','Dental Cleaning $150','Spay/Neuter Packages'],
  'HVAC':                  ['AC Tune-Up $79','Heating Inspection $69','Emergency Service 24/7','Free Estimates'],
  'Plumber':               ['Drain Clearing $99','Water Heater Install','Leak Detection & Repair','Free Estimates'],
  'Electrician':           ['Panel Upgrade — Call','Outlet Installation $75','EV Charger Install','Free Safety Inspection'],
  'Lawn & Landscaping':    ['Weekly Mowing from $35','Mulch & Bed Prep','Irrigation Install','Free Lawn Analysis'],
  'Roofing':               ['Free Roof Inspection','Storm Damage Repair','New Roof Install','Gutter Cleaning'],
  'Painting':              ['Interior Room from $250','Exterior Painting','Cabinet Refinishing','Free Color Consultation'],
  'Cleaning Service':      ['Home Cleaning from $99','Deep Clean','Move-In/Out Clean','Commercial Services'],
  'Pest Control':          ['General Pest Control $89','Free Termite Inspection','Mosquito Treatment','Annual Protection Plans'],
  'Real Estate':           ['Free Home Valuation','Buyer Representation',"Seller's Market Experts",'Free Consultation'],
  'Insurance':             ['Auto Insurance Quotes','Home & Renters Coverage','Life Insurance Plans','Free Policy Review'],
  'Auto Repair':           ['Oil Change from $39','Brake Service','Free Diagnostics','Tires & Alignment'],
  'Salon & Beauty':        ['Haircut & Style from $35','Color & Highlights','Blowout $45','Balayage from $85'],
  'Barbershop':            ['Classic Cut $20','Fade & Design $25','Hot Towel Shave $30',"Kid's Cut $15"],
  'Gym & Fitness':         ['Monthly Membership $39','Personal Training','Group Classes Included','Free Week Trial'],
  'Pet Services':          ['Dog Grooming from $45','Boarding from $35/night','Doggy Daycare','Training Packages'],
  'Financial Services':    ['Free Consultation','Retirement Planning','Tax Preparation','Investment Review'],
  'Daycare':               ['Full-Time Enrollment','Part-Time Available','Ages 6 Weeks\u20135 Years','Hot Meals Provided'],
  'Photography':           ['Family Portraits from $149','Event Photography','Headshots $99','Prints & Albums Available'],
  'Retail Shop':           ['New Arrivals Weekly','Gift Cards Available','Layaway & Special Orders','Call for Hours'],
};

function onIndustryChange(){
  var industry = document.getElementById('industry').value;
  if(industry && _takenCategories.indexOf(industry) !== -1){
    showTakenDialog(industry);
    return;
  }
  loadLibrary();
  // Menu items
  var list = document.getElementById('menuList');
  list.innerHTML = '';
  var menuDefaults = MENU_DEFAULTS[industry];
  var _menuCap = getOrientation(_spotSize) === 'landscape' ? 3 : 4;
  if(menuDefaults) menuDefaults.slice(0, _menuCap).forEach(function(v){ addMenuItem(v); });
  // Tagline
  var taglineEl = document.getElementById('tagline');
  taglineEl.value = TAGLINE_DEFAULTS[industry] || '';
  // Offer + fine print
  var offerPair = OFFER_DEFAULTS[industry];
  document.getElementById('offer').value    = offerPair ? offerPair[0] : '';
  document.getElementById('offerFine').value = offerPair ? offerPair[1] : '';
}

// (tab system removed — library is always visible below the upload zone)

function addMenuItem(val){
  val = val || '';
  var list = document.getElementById('menuList');
  if(list.children.length >= 4) return;
  var row = document.createElement('div'); row.className = 'mrow';
  var inp = document.createElement('input'); inp.type='text'; inp.placeholder='Item Name $Price'; inp.value=val;
  var rm  = document.createElement('button'); rm.className='rm-btn'; rm.title='Remove'; rm.textContent='\\u00d7';
  rm.onclick = function(){ this.parentElement.remove(); };
  row.appendChild(inp); row.appendChild(rm);
  list.appendChild(row);
}

function getMenu(){
  return Array.from(document.querySelectorAll('.mrow input'))
    .map(function(i){ return i.value.trim(); }).filter(Boolean).slice(0,4);
}

async function loadLibrary(){
  var industry = document.getElementById('industry').value;
  var grid = document.getElementById('libGrid');
  if(!industry){
    grid.innerHTML = '<div class="img-empty">Select an industry above to load photos.</div>';
    return;
  }
  grid.innerHTML = '<div class="img-loading">Loading library photos&hellip;</div>';
  try{
    var r = await fetch('/api/image-library?industry=' + encodeURIComponent(industry));
    var data = await r.json();
    var imgs = data.images || [];
    if(!imgs.length){
      grid.innerHTML = '<div class="img-empty">No approved photos for this industry yet. Upload your own photo above.</div>';
      return;
    }
    grid.innerHTML = imgs.map(function(img,i){
      return '<div class="img-thumb" id="lthumb-'+i+'" onclick="selectLibPhoto('+i+',this)" title="'+esc(img.photographer_credit)+'">'
        + '<img src="'+esc(img.thumb_url)+'" loading="lazy" alt="">'
        + '<div class="chk">\\u2713</div>'
        + '<input type="hidden" id="lurl-'+i+'" value="'+esc(img.image_url)+'">'
        + '</div>';
    }).join('');
  }catch(e){
    grid.innerHTML = '<div class="img-empty">Error loading library: ' + e.message + '</div>';
  }
}

function selectLibPhoto(i, el){
  document.querySelectorAll('.img-thumb').forEach(function(t){ t.classList.remove('selected'); });
  el.classList.add('selected');
  _selectedPhotoUrl = document.getElementById('lurl-'+i).value;
  document.getElementById('photoStatus').textContent = '\\u2713 Photo selected';
  document.getElementById('photoStatus').style.color = 'var(--green)';
}

function handlePhotoUpload(input){
  var file = input.files[0]; if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e){
    _selectedPhotoUrl = e.target.result;
    // Deselect any library photo
    document.querySelectorAll('.img-thumb').forEach(function(t){ t.classList.remove('selected'); });
    var prev = document.getElementById('photoPreview');
    prev.src = e.target.result;
    document.getElementById('photoZone').classList.add('has-file');
    document.getElementById('photoStatus').textContent = '\\u2713 Uploaded';
    document.getElementById('photoStatus').style.color = 'var(--green)';
  };
  reader.readAsDataURL(file);
}

function clearPhoto(evt){
  evt.preventDefault(); evt.stopPropagation();
  _selectedPhotoUrl = '';
  var zone = document.getElementById('photoZone');
  zone.classList.remove('has-file');
  var prev = document.getElementById('photoPreview'); prev.src = '';
  var inp = zone.querySelector('input[type=file]'); if(inp) inp.value = '';
  document.getElementById('photoStatus').textContent = 'Optional';
  document.getElementById('photoStatus').style.color = '';
}

function handleLogoUpload(input){
  var file = input.files[0]; if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e){
    _logoData = e.target.result;
    var prev = document.getElementById('logoPreview');
    prev.src = e.target.result;
    document.getElementById('logoZone').classList.add('has-file');
    document.getElementById('logoStatus').textContent = '\\u2713 Uploaded';
    document.getElementById('logoStatus').style.color = 'var(--green)';
  };
  reader.readAsDataURL(file);
}

function clearLogo(evt){
  evt.preventDefault(); evt.stopPropagation();
  _logoData = '';
  var zone = document.getElementById('logoZone');
  zone.classList.remove('has-file');
  var prev = document.getElementById('logoPreview'); prev.src = '';
  var inp = zone.querySelector('input[type=file]'); if(inp) inp.value = '';
  document.getElementById('logoStatus').textContent = 'Optional';
  document.getElementById('logoStatus').style.color = '';
}

async function generate(){
  var biz = document.getElementById('bizName').value.trim();
  if(!biz){ alert('Please enter a business name.'); return; }

  hideResult(); hideErr();
  document.getElementById('genBtn').disabled = true;
  document.getElementById('genLabel').textContent = 'Generating\\u2026';
  document.getElementById('loadingPanel').classList.add('visible');

  var body = {
    bizName:   biz,
    tagline:   document.getElementById('tagline').value.trim(),
    phone:     document.getElementById('phone').value.trim(),
    city:      document.getElementById('city').value.trim(),
    address:   document.getElementById('address').value.trim(),
    website:   document.getElementById('website').value.trim(),
    industry:  document.getElementById('industry').value || 'Local Business',
    menu:      getMenu(),
    offer:     document.getElementById('offer').value.trim(),
    offerFine: document.getElementById('offerFine').value.trim(),
    photoUrl:  _selectedPhotoUrl,
    logoData:  _logoData,
    template:  _activeTemplate,
    sizeKey:   _spotSize || 'XL',
    spotId:    _spotId || undefined,
    generationIndex: _generationCount,
  };

  try{
    var resp = await fetch('/api/grok-ad-generator/generate', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    var data = await resp.json();
    document.getElementById('loadingPanel').classList.remove('visible');
    if(!resp.ok || data.error){
      var grokErr = data.error || 'Generation failed \\u2014 please try again.';
      showErr(grokErr === 'overloaded'
        ? 'The image generator is busy right now \\u2014 please try again in a moment.'
        : grokErr === 'moderated'
        ? 'Our AI\\u2019s content filter blocked this ad. Try rephrasing your services list to avoid clinical or procedure-specific terms, then click Generate again.'
        : grokErr);
    } else {
      _generationCount++;
      _resultUrl = data.imageUrl;
      showResult(data.imageUrl);
      showToast('Ad generated! Review it below.');
    }
  }catch(err){
    document.getElementById('loadingPanel').classList.remove('visible');
    showErr('Network error: ' + (err instanceof Error ? err.message : String(err)));
  }

  document.getElementById('genBtn').disabled = false;
  document.getElementById('genLabel').textContent = 'Generate My Ad';
}

function showResult(url, keepOriginal){
  var panel = document.getElementById('resultPanel');
  var img = document.getElementById('resultImg');
  panel.classList.add('visible');
  var rp = document.querySelector('.rpanel');
  function scrollDown(){
    img.scrollIntoView({ behavior:'smooth', block:'nearest' });
    rp.scrollTop = rp.scrollHeight;
  }
  img.onload = function(){ scrollDown(); };
  img.src = url;
  // Fallback: scroll immediately in case image is already cached
  setTimeout(scrollDown, 120);
  // Reset refine state on fresh generation (not on refine updates)
  if(!keepOriginal){
    _originalResultUrl = url;
    document.getElementById('refineInput').value = '';
    document.getElementById('refineErr').classList.remove('visible');
    document.getElementById('refineLoading').classList.remove('visible');
    var revertBtn = document.getElementById('refineRevertBtn');
    if(revertBtn) revertBtn.style.display = 'none';
    var refineBtn = document.getElementById('refineBtn');
    if(refineBtn){ refineBtn.disabled = false; refineBtn.textContent = 'Apply'; }
  }
}

async function refineAd(){
  var instruction = document.getElementById('refineInput').value.trim();
  var errEl = document.getElementById('refineErr');
  var loadingEl = document.getElementById('refineLoading');
  errEl.textContent = ''; errEl.classList.remove('visible');
  if(!instruction){
    errEl.textContent = 'Please describe the change you want (e.g. "Remove the word Shield").';
    errEl.classList.add('visible');
    return;
  }
  if(!_resultUrl){ return; }
  var btn = document.getElementById('refineBtn');
  btn.disabled = true; btn.textContent = 'Applying\u2026';
  loadingEl.classList.add('visible');
  try{
    var resp = await fetch('/api/grok-ad-generator/refine', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        imageDataUrl: _resultUrl,
        instruction:  instruction,
        sizeKey:      _spotSize || 'XL',
      }),
    });
    var data = await resp.json();
    loadingEl.classList.remove('visible');
    if(!resp.ok || data.error){
      var refErr = data.error || 'Refinement failed \u2014 please try again.';
      errEl.textContent = '\u26a0\ufe0f ' + (refErr === 'overloaded'
        ? 'The image generator is busy right now \u2014 please try again in a moment.'
        : refErr === 'moderated'
        ? 'Our AI\u2019s content filter blocked this adjustment. Try rewording your instruction and click Refine again.'
        : refErr);
      errEl.classList.add('visible');
    } else {
      _resultUrl = data.imageUrl;
      document.getElementById('resultImg').src = data.imageUrl;
      document.getElementById('refineInput').value = '';
      if(data.imageUrl !== _originalResultUrl){
        var revertBtn = document.getElementById('refineRevertBtn');
        if(revertBtn) revertBtn.style.display = '';
      }
      showToast('Ad refined! Review the changes below.');
    }
  } catch(err){
    loadingEl.classList.remove('visible');
    errEl.textContent = '\u26a0\ufe0f Network error: ' + (err instanceof Error ? err.message : String(err));
    errEl.classList.add('visible');
  }
  btn.disabled = false; btn.textContent = 'Apply';
}

function revertAd(){
  if(!_originalResultUrl) return;
  _resultUrl = _originalResultUrl;
  document.getElementById('resultImg').src = _originalResultUrl;
  var revertBtn = document.getElementById('refineRevertBtn');
  if(revertBtn) revertBtn.style.display = 'none';
  document.getElementById('refineErr').classList.remove('visible');
  showToast('Reverted to original.');
}

function hideResult(){
  document.getElementById('resultPanel').classList.remove('visible');
}

function resetResult(){
  hideResult(); _resultUrl = '';
}

function showErr(msg){
  var box = document.getElementById('errBox');
  box.textContent = '\\u26a0\\ufe0f ' + msg;
  box.classList.add('visible');
  box.scrollIntoView({ behavior:'smooth', block:'start' });
}

function hideErr(){ document.getElementById('errBox').classList.remove('visible'); }

function fieldHighlight(id){
  var el = document.getElementById(id);
  if(!el) return;
  // Remove then re-add so animation replays if triggered again
  el.classList.remove('field-error');
  void el.offsetWidth; // force reflow
  el.classList.add('field-error');
  el.scrollIntoView({ behavior:'smooth', block:'center' });
  el.addEventListener('input', function clear(){ el.classList.remove('field-error'); el.removeEventListener('input', clear); });
}

function useThisAd(){
  if(!_resultUrl){ return; }
  var bizName = document.getElementById('bizName').value.trim();
  var email   = document.getElementById('email') ? document.getElementById('email').value.trim() : '';
  if(!bizName){
    showErr('Please enter your business name (scroll up) before continuing.');
    fieldHighlight('bizName');
    return;
  }
  if(!email){
    showErr('Please enter a contact email (scroll up) so we can send your order confirmation.');
    fieldHighlight('email');
    return;
  }
  hideErr();
  var formData = {
    businessName:  bizName,
    industry:      document.getElementById('industry').value || 'Local Business',
    email:         email,
    phone:         document.getElementById('phone').value.trim(),
    city:          document.getElementById('city').value.trim(),
    address:       document.getElementById('address').value.trim(),
    website:       document.getElementById('website').value.trim(),
    tagline:       document.getElementById('tagline').value.trim(),
    offer:         document.getElementById('offer').value.trim(),
    offerFine:     document.getElementById('offerFine').value.trim(),
    menuItems:     getMenu(),
    finishedAdUrl: _resultUrl,
    template:      _activeTemplate,
    sizeKey:       _spotSize || 'XL',
  };
  // Persist the ad to localStorage so the parent window can recover it if
  // it reloaded (Vite HMR in dev, accidental browser refresh in prod) after
  // the popup was opened.  The parent reads this key on mount and offers a
  // "Resume your ad" banner.  Use try/catch so storage errors never block.
  try {
    var urlParams = new URLSearchParams(window.location.search);
    localStorage.setItem('localspot:grok:pendingAd', JSON.stringify({
      formData:     formData,
      pickerSpotId: urlParams.get('spotId') || '',
      spotSize:     urlParams.get('spotSize') || 'XL',
      savedAt:      Date.now(),
    }));
  } catch(e) {}
  if(window.opener && !window.opener.closed){
    window.opener.postMessage({ type: 'grok-ad-result', formData: formData }, '*');
    window.opener.focus();
    showToast('Ad sent! Completing your reservation\\u2026');
    setTimeout(function(){ window.close(); }, 1400);
  } else {
    downloadAd();
    showToast('Ad saved! Upload it from your spot\\u2019s upload page to complete your order.');
  }
}

function downloadAd(){
  if(!_resultUrl) return;
  var a = document.createElement('a');
  a.href = _resultUrl;
  a.download = 'my-town-ad-' + document.getElementById('bizName').value.trim().replace(/\\s+/g,'-') + '-' + Date.now() + '.png';
  a.click();
}

function showToast(msg){
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 3500);
}

// Prefill — use URL params if provided, otherwise load Mr. Biscuit's Cafe demo
(function prefill(){
  var params = new URLSearchParams(window.location.search);
  _spotSize = params.get('spotSize') || 'XL';
  _spotId = parseInt(params.get('spotId') || '0', 10) || 0;
  _campaignId = parseInt(params.get('campaignId') || '0', 10) || 0;
  _side = params.get('side') || 'front';
  var takenParam = params.get('taken') || '';
  _takenCategories = takenParam ? takenParam.split(',').map(function(s){ return s.trim(); }).filter(Boolean) : [];
  applyTakenIndustries();
  // Fetch taken categories from the API so standalone use is accurate
  fetch('/api/campaigns/active/taken-categories')
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(data){
      if(data && Array.isArray(data.takenCategories)){
        // Server is authoritative — replace entirely so stale URL params
        // don't keep a category grayed out after it's been freed.
        _takenCategories = data.takenCategories.slice();
        applyTakenIndustries();
      }
    })
    .catch(function(){});
  // Fetch used templates for this campaign side so the picker hides already-used ones
  if(_campaignId && _spotId){
    fetch('/api/campaigns/' + _campaignId + '/used-templates?spotId=' + _spotId)
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(data){
        if(data){
          _usedTemplates = (_side === 'back' ? data.back : data.front) || [];
          applyUsedTemplates();
        }
      })
      .catch(function(){});
  }
  applyTemplateOrientation();
  var urlBiz = params.get('bizName') || '';
  var urlIndustry = params.get('industry') || '';
  if(urlBiz){
    // Opened from the spot picker — pre-fill with provided params
    var el = document.getElementById('bizName'); if(el) el.value = urlBiz;
    var selEl = document.getElementById('industry');
    if(urlIndustry){
      for(var i=0;i<selEl.options.length;i++){
        if(selEl.options[i].text === urlIndustry){ selEl.selectedIndex=i; break; }
      }
    }
    onIndustryChange();
  } else {
    // No params — load demo prefill
    var f = {
      bizName:"", tagline:"From-Scratch Biscuits & Boba!",
      phone:"(706) 754-0105", city:"Clarkesville, GA", address:"596 W Louise St",
      website:"mytownpostcard.com", offer:"$1 OFF Any Biscuit",
      offerFine:"1 per visit \\u00b7 with this postcard"
    };
    Object.keys(f).forEach(function(id){ var el=document.getElementById(id); if(el) el.value=f[id]; });
  }
  onFormChange();
  loadLibrary();
})();
</script>

<!-- Industry conflict dialog -->
<div id="takenOverlay">
  <div id="takenCard">
    <div class="tc-icon">&#9888;&#65039;</div>
    <div class="tc-title">That Category is Taken</div>
    <p class="tc-body"><span class="tc-industry" id="takenIndustryName"></span> is already reserved on this postcard. Each category is exclusive — one business per industry per mailing.</p>
    <button class="tc-btn primary" onclick="closeTakenDialog()">Choose a Different Category</button>
    <button class="tc-btn secondary" onclick="goRequestOptions()">Request More Options &rarr;</button>
  </div>
</div>
</body>
</html>`;
