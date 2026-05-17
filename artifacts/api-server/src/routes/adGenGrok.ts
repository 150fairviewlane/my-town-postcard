import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import fs from "fs";
import path from "path";
import sharp from "sharp";

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

  // Load template PNG as raw buffer — skipped for landscape (no portrait template applies)
  const templateKey = d.template || "parchment-classic";
  let tmplBuf: Buffer | null = null;
  let tmplMime = "image/png";
  if (!isLandscape) {
    const tmplFilename =
      templateKey === "made-fresh"
        ? "made_fresh_template.png"
        : templateKey === "neighborhood-pro"
          ? "6300F2D5-6BF1-403E-A40B-7203E4E26402_1778948283280.jpeg"
          : "mr_biscuits_template_no_logo_1778806527327.png";
    const tmplPath = path.join(WORKSPACE_ROOT, "attached_assets", tmplFilename);
    if (!fs.existsSync(tmplPath)) {
      res.status(500).json({ error: "Template file not found on server." });
      return;
    }
    tmplBuf = fs.readFileSync(tmplPath);
    tmplMime = /\.(jpe?g)$/i.test(tmplFilename) ? "image/jpeg" : "image/png";
  }

  // Map spot size → closest supported Grok aspect ratio
  // XL=4"×5" → 3:4 (4:5 unsupported; sharp crops to exact) | Large=3"×4" → 3:4
  // Medium=3"×2" → 3:2 (landscape) | Small=2"×2" → 1:1
  const aspectRatioMap: Record<string, string> = {
    xl: "3:4", large: "3:4", l: "3:4", medium: "3:2", small: "1:1", m: "3:2", s: "1:1",
  };
  const spotAspectRatio = aspectRatioMap[d.sizeKey.toLowerCase()] ?? "3:4";

  // Print dimensions at 300 DPI — sharp crops Grok output to these for screen-sharp quality
  const CROP_DIMS: Record<string, { w: number; h: number }> = {
    xl:     { w: 1200, h: 1500 },
    large:  { w: 900,  h: 1200 }, l: { w: 900,  h: 1200 },
    medium: { w: 900,  h: 600  }, m: { w: 900,  h: 600  },
    small:  { w: 600,  h: 600  }, s: { w: 600,  h: 600  },
  };
  const cropDim = CROP_DIMS[d.sizeKey.toLowerCase()] ?? { w: 400, h: 500 };

  const menuStr     = d.menu.filter(Boolean).map((m, i) => `  ${i + 1}. ${m}`).join("\n") || "  (none)";
  const fullAddress = [d.address, d.city].filter(Boolean).join(", ") || "(none)";
  const hasPhoto    = !!d.photoUrl;
  const hasLogo     = !!d.logoData;

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
  // For landscape (medium) there is no portrait template, so indices start at 1.
  const refLines: string[] = [];
  let imgIdx: number;
  let logoImg: number;

  if (isLandscape) {
    imgIdx = 1;
    if (hasPhoto) {
      refLines.push(`  • IMAGE ${imgIdx++} (HERO PHOTO) — the product/service photograph. Use as the dominant hero visual filling the right portion of the ad.`);
    }
    if (hasLogo) {
      refLines.push(`  • IMAGE ${imgIdx} (BUSINESS LOGO) — the exact business logo. Reproduce it pixel-perfect with no stylization, color changes, or distortion.`);
    }
    logoImg = hasPhoto ? 2 : 1;
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
            "Footer strip: dark green bar with a bold phone number on the left, a clean QR code box on the right, and small circular trust-badge icons (shield, star, leaf) between them. " +
            "Reproduce every zone, the forest-green background, all brush-stroke shapes, and the footer layout exactly."
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
  const outputRequirements = isLandscape
    ? (
      "LAYOUT — this is a LANDSCAPE (3\"×2\") ad, wider than tall. Arrange all elements left-to-right:\n\n" +

      "  LEFT COLUMN (≈40% of width) — BRAND BLOCK:\n" +
      (hasLogo
        ? `    • Logo (IMAGE ${logoImg}): place in the upper-left, large and prominent. Preserve exact colors and proportions. Clear margin on all sides.\n`
        : "") +
      `    • Business name "${d.bizName}" in bold condensed all-caps slab serif — large, very high contrast against the background. Maximum weight.\n` +
      (d.tagline ? `    • Tagline "${d.tagline}" in italic script, slightly smaller, directly below the business name.\n` : "") +
      (d.offer
        ? `    • Special offer "${d.offer}" displayed prominently — bold, high contrast, clearly readable.\n` +
          (d.offerFine ? `      Fine print: "${d.offerFine}" in small text below the offer.\n` : "")
        : "") +
      `    • Phone "${d.phone || ""}" in bold sans-serif, large enough to read at a glance.\n\n` +

      "  RIGHT SIDE (≈60% of width) — HERO VISUAL:\n" +
      (hasPhoto
        ? `    • Hero image: use IMAGE 1 as a full-bleed cinematic fill for the entire right portion. No hard rectangular border — blend edges naturally into the background. Professional lighting, vibrant color.\n\n`
        : `    • Hero image: generate a photorealistic cinematic scene relevant to this business. Vibrant color, professional commercial photography quality, full-bleed into the right zone.\n\n`) +

      "  FOOTER STRIP (full width, bottom edge):\n" +
      `    • Address "${fullAddress}" in small bold text, left side.\n` +
      "    • QR code graphic (small, square) in the bottom-right corner.\n" +
      "    • Thin dark bar background for footer contrast.\n\n" +

      "TYPOGRAPHIC RULES:\n" +
      "  • Business name: bold condensed all-caps slab serif, maximum weight, very high contrast\n" +
      "  • Phone: bold sans-serif, large and instantly readable\n" +
      "  • All text crisp and legible — no thin strokes on busy backgrounds\n" +
      "  • NEVER render the website URL as visible text\n" +
      "  • No dead space — every area filled with purposeful content"
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
        : `    Generate a photorealistic outdoor service scene appropriate for this business — bright daylight, vibrant green tones, professional composition. Fill the entire upper-right zone with no rectangular border.\n\n`) +

      (menuStr !== "  (none)"
        ? "  ZONE 4 — SERVICES PANELS (middle horizontal row):\n" +
          "    Reproduce the four diagonal-cut panel row from the template. Each panel shows a relevant service photo behind a diagonal-cut edge.\n" +
          "    Above each panel: a circular dark-green badge with a white icon inside representing the service.\n" +
          "    Below each panel: a short white brush-stroke label with the service name in dark bold text.\n" +
          `    Use the following services from the business details: ${menuStr}\n\n`
        : "  ZONE 4 — SERVICES PANELS (middle horizontal row):\n" +
          "    Reproduce the four diagonal-cut service photo panels from the template with relevant service imagery for this business type.\n" +
          "    Each panel has a circular green icon badge on top and a white brush-stroke label below.\n\n") +

      (d.offer
        ? "  ZONE 5 — SPECIAL OFFER (wide white brush-stroke area, lower section):\n" +
          `    Inside the large white brush-stroke shape: render "${d.offer}" in bold dark-green text, large and prominent.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" in smaller text below.\n` : "") +
          "\n"
        : "") +

      "  ZONE 6 — FOOTER (dark green bar at very bottom):\n" +
      `    Left: phone number "${d.phone || ""}" in very BOLD white sans-serif — large, instantly readable. Zero digit changes.\n` +
      (fullAddress !== "(none)" ? `    Below or beside phone: address "${fullAddress}" in white sans-serif, readable size — at least half the height of the phone number. Must appear verbatim — no changes.\n` : "") +
      `    Center: three small circular trust-badge icons (shield, star, leaf) as in the template.\n` +
      "    Right: a clean square QR code box. Do NOT render the website URL as text.\n\n" +

      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps slab serif, very large, dark green or near-black\n" +
      "  • Script accent: bright-green cursive ONLY for a single common English service-category noun in the business name — never for proper nouns or brand names; never duplicate any word\n" +
      "  • All text inside white brush-stroke areas: dark green or near-black for contrast\n" +
      "  • Footer text: white, bold sans-serif\n" +
      "  • Fine print: smallest text, still legible\n" +
      "  • NEVER render the website URL as visible text"
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
        : `    Generate a photorealistic, appetizing hero image for this business — cinematic quality, appetizing styling, vibrant color. Blend it naturally into the dark brush-stroke background with no hard rectangular border.\n\n`) +

      (menuStr !== "  (none)"
        ? "  ZONE 4 — MENU / SERVICES (left-center card area):\n" +
          "    List each item clearly. Use a clean, legible sans-serif. Prices right-aligned if present.\n\n"
        : "") +

      (d.offer
        ? "  ZONE 5 — SPECIAL OFFER (dashed coupon box):\n" +
          `    "${d.offer}" in bold inside the dashed coupon rectangle. If fine print exists, render it smaller below.\n\n`
        : "") +

      "  ZONE 6 — FOOTER (dark strip at very bottom):\n" +
      `    Phone: "${d.phone || ""}" — BOLD, large, easy to read at a glance. Zero digit changes.\n` +
      (fullAddress !== "(none)" ? `    Address: "${fullAddress}" — must appear verbatim in the footer in clearly legible bold text, noticeably larger than fine print. Do not omit, abbreviate, or change.\n` : "") +
      "    QR code: place a clean, square QR code graphic in the lower-right of the footer. Do NOT render the website URL as text anywhere on the ad.\n\n" +

      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps slab/block serif for the full business name. Apply the flowing orange script (angled ≈-8°) ONLY to a common English category noun within the name (e.g. Cafe, Grill, Spa, Pizza, Bar). NEVER split a proper noun, foreign word, or brand name into a second-line script — and NEVER render any word from the business name more than once.\n" +
      "  • Tagline: loose handwriting-style italic script, slight upward angle (+5°–7°), large, confident — never flat/horizontal\n" +
      "  • Logo: scaled small to fit ENTIRELY INSIDE the orange pennant ribbon; pennant stays fixed in top-left exactly as in the template\n" +
      "  • Footer phone/address: bold sans-serif, noticeably larger than fine print\n" +
      "  • Fine print / coupon terms: smallest text, still legible\n" +
      "  • NEVER render the website URL as visible text"
    );

  const adPrompt =
    (isLandscape
      ? "You are a world-class print advertising art director. " +
        "Create a PRINT-READY premium LANDSCAPE postcard ad for a local business — " +
        "the result must look like a single cohesive ad designed by a top agency.\n\n"
      : "You are a world-class print advertising art director and expert photo compositor. " +
        "Create a PRINT-READY premium postcard ad by taking the template layout and seamlessly integrating " +
        "the business details and any provided reference photos into it — the result must look like a single cohesive ad designed by a top agency, " +
        "not a template with content pasted on top.\n\n") +
    (refLines.length > 0
      ? `REFERENCE IMAGES: You are provided ${refLines.length} reference image${refLines.length > 1 ? "s" : ""}. ` +
        "Treat them as distinct inputs — do NOT merge their design styles or treat any of them as already finished:\n" +
        refLines.join("\n") + "\n\n"
      : "") +
    outputRequirements + "\n" +
    "STYLE: high-end editorial advertising aesthetic. Cinematic photography with rich, vibrant color and " +
    "professional lighting. Bold confident typography hierarchy. Premium color palette — deep, saturated, controlled. " +
    "Every element is intentionally placed; nothing looks accidental or generic. Print-ready sharpness throughout.\n\n" +
    "CRITICAL: Every piece of text must appear EXACTLY as specified. " +
    "Phone numbers, prices, business name, and address — zero tolerance for errors or omissions. " +
    (fullAddress !== "(none)" ? `The address "${fullAddress}" MUST be visible in the footer — do not skip it. ` : "") +
    "No website URL text anywhere.\n\n" +
    "BUSINESS DETAILS:\n" + businessBlock;

  // ── Build images array for xAI /images/edits ────────────────────────────────
  // grok-imagine-image-quality accepts up to 3 reference images as separate
  // `{ type: "image_url", url: "data:mime;base64,..." }` objects in an `images`
  // array (plural). Template is always first; photo and logo follow when present.
  const toDataUrl = (buf: Buffer, mime = "image/png") =>
    `data:${mime};base64,${buf.toString("base64")}`;

  // Post-process: resize + centre-crop Grok output to exact print pixel dimensions
  async function cropToSpotDims(url: string, w: number, h: number): Promise<string> {
    try {
      let buf: Buffer;
      if (url.startsWith("data:")) {
        const b64 = url.split(",")[1] ?? "";
        buf = Buffer.from(b64, "base64");
      } else {
        const resp = await fetch(url);
        if (!resp.ok) return url;
        buf = Buffer.from(await resp.arrayBuffer());
      }
      const out = await sharp(buf)
        .resize(w, h, { fit: "cover", position: "centre", kernel: "lanczos3" })
        .jpeg({ quality: 98, chromaSubsampling: "4:4:4" })
        .toBuffer();
      return `data:image/jpeg;base64,${out.toString("base64")}`;
    } catch {
      return url; // graceful degradation — return original on any sharp error
    }
  }

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

    if (hasPhoto) {
      const blob = d.photoUrl.startsWith("data:")
        ? dataUrlToBlob(d.photoUrl)
        : await remoteUrlToBlob(d.photoUrl);
      const photoBuf = Buffer.from(await blob.arrayBuffer());
      imageRefs.push({ type: "image_url", url: toDataUrl(photoBuf, blob.type || "image/jpeg") });
    }

    if (hasLogo) {
      const logoBlob = dataUrlToBlob(d.logoData);
      const logoBuf = Buffer.from(await logoBlob.arrayBuffer());
      imageRefs.push({ type: "image_url", url: toDataUrl(logoBuf, logoBlob.type || "image/png") });
    }

    const editsBody: Record<string, unknown> = {
      model:        "grok-imagine-image-quality",
      prompt:       adPrompt,
      n:            1,
      images:       imageRefs,
      aspect_ratio: spotAspectRatio,
      resolution:   "2k",
    };
    const xaiRes = await fetch("https://api.x.ai/v1/images/edits", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(editsBody),
    });

    const body = await safeJson(xaiRes);
    req.log.info(
      { status: xaiRes.status, body: JSON.stringify(body).slice(0, 500), bizName: d.bizName },
      "grok-imagine edits raw response"
    );

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
          const fallbackUrl = await callGenerationsJson(apiKey, adPrompt, d.bizName, req.log);
          res.json({ imageUrl: await cropToSpotDims(fallbackUrl, cropDim.w, cropDim.h), fallback: true });
          return;
        } catch (fbErr) {
          req.log.error({ editsErr: errMsg, fbErr }, "grok-imagine both edits and generations failed");
          res.status(502).json({ error: errMsg || "Grok API request failed" });
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
          prompt:       adPrompt,
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
          if (retryUrl) { res.json({ imageUrl: await cropToSpotDims(retryUrl, cropDim.w, cropDim.h) }); return; }
        }
        req.log.warn({ retryStatus: retryRes.status, origErr: errMsg }, "grok-imagine edits retry also failed");
      }

      // ── Case 3: all other errors → 502 with xAI message
      req.log.error({ status: xaiRes.status, errMsg, bizName: d.bizName }, "grok-imagine edits error");
      res.status(502).json({ error: errMsg });
      return;
    }

    const imageUrl = extractXaiImageUrl(body);
    if (!imageUrl) {
      req.log.warn({ body: JSON.stringify(body).slice(0, 300) }, "grok-imagine: no image in response");
      res.status(502).json({
        error: "Grok returned a response but no image was found — try again or simplify your prompt.",
      });
      return;
    }

    res.json({ imageUrl: await cropToSpotDims(imageUrl, cropDim.w, cropDim.h) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Grok API request failed";
    req.log.error({ err: msg, bizName: d.bizName }, "grok-imagine error");
    res.status(502).json({ error: msg });
  }
});

// ── GET /api/grok-ad-generator — serve the HTML tool ─────────────────────────
router.get("/grok-ad-generator", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(GROK_HTML);
});

// ── GET /api/grok-ad-generator/template-preview/:key — serve template thumbnails ──
router.get("/grok-ad-generator/template-preview/:key", (req, res) => {
  const key = req.params["key"];
  const fileMap: Record<string, string> = {
    "parchment-classic":   "mr_biscuits_template_no_logo_1778806527327.png",
    "made-fresh":          "made_fresh_template.png",
    "neighborhood-pro":    "6300F2D5-6BF1-403E-A40B-7203E4E26402_1778948283280.jpeg",
  };
  const filename = fileMap[key];
  if (!filename) { res.status(404).send("Not found"); return; }
  const p = path.join(WORKSPACE_ROOT, "attached_assets", filename);
  if (!fs.existsSync(p)) { res.status(404).send("Not found"); return; }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400");
  fs.createReadStream(p).pipe(res);
});

export default router;

// ── Inline HTML ───────────────────────────────────────────────────────────────
const GROK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Town Postcard &mdash; Grok Ad Generator</title>
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

.hdr{background:var(--xai);padding:0 28px;display:flex;align-items:center;justify-content:space-between;height:54px;border-bottom:3px solid var(--burg);flex-shrink:0}
.brand{font-family:'Bebas Neue',sans-serif;font-size:21px;color:#fff;letter-spacing:.08em}
.brand span{color:#C8A882}
.hdr-badge{background:var(--burg);color:#fff;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:4px 12px;border-radius:20px;display:flex;align-items:center;gap:6px}

.layout{display:grid;grid-template-columns:400px 1fr;flex:1;min-height:0;overflow:hidden}

.fpanel{background:var(--card);border-right:1.5px solid var(--border);padding:18px 18px 60px;overflow-y:auto;display:flex;flex-direction:column;gap:14px}
.ptitle{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:.06em;margin-bottom:2px}
.psub{font-family:'Crimson Pro',serif;font-style:italic;font-size:14px;color:var(--ink-light);line-height:1.4;margin-bottom:4px}
.sec-label{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--burg);padding-bottom:8px;border-bottom:1.5px solid var(--burg-pale);margin-bottom:8px}
.field{margin-bottom:8px}
.field:last-child{margin-bottom:0}
.field label{display:block;font-size:10.5px;font-weight:600;color:var(--ink-mid);margin-bottom:3px;letter-spacing:.05em;text-transform:uppercase}
.field input,.field select{width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:7px;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.field input:focus,.field select:focus{border-color:var(--burg);background:#fff}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.menu-list{display:flex;flex-direction:column;gap:5px;margin-bottom:7px}
.mrow{display:flex;gap:6px;align-items:center}
.mrow input{flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:'DM Sans',sans-serif;font-size:12px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.mrow input:focus{border-color:var(--burg);background:#fff}
.rm-btn{width:24px;height:24px;border-radius:5px;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-light);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;line-height:1}
.rm-btn:hover{border-color:#c0392b;color:#c0392b;background:#fef2f2}
.add-btn{font-size:11px;font-weight:600;color:var(--burg);background:none;border:1.5px dashed var(--burg);border-radius:6px;padding:5px 12px;cursor:pointer;width:100%;transition:all .2s;font-family:'DM Sans',sans-serif}
.add-btn:hover{background:var(--burg-pale)}

.rpanel{background:#ECEAE6;padding:18px 22px 22px;overflow-y:auto;display:flex;flex-direction:column;gap:14px}
.rpanel>*{flex-shrink:0}

.card{background:var(--card);border:1.5px solid var(--border);border-radius:11px;overflow:hidden}
.card-hdr{padding:11px 16px;border-bottom:1px solid var(--border);background:#FAFAF8;display:flex;align-items:center;justify-content:space-between}
.card-title{font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--burg)}
.card-body{padding:14px 16px}

.tmpl-preview{display:flex;align-items:center;gap:12px}
.tmpl-img{width:64px;height:80px;object-fit:cover;border-radius:6px;border:1.5px solid var(--border)}
.tmpl-info{flex:1}
.tmpl-name{font-size:13px;font-weight:700;color:var(--ink)}
.tmpl-sub{font-size:11px;color:var(--ink-light);margin-top:2px}
.tmpl-badge{display:inline-flex;align-items:center;gap:4px;background:#f0fdf4;border:1px solid var(--green);color:var(--green);font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;margin-top:5px}

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
.tmpl-card-name{font-size:9px;font-weight:700;color:var(--ink);padding:3px 5px 1px;line-height:1.2}
.tmpl-card-sub{display:none}
.tmpl-sel-badge{display:inline-flex;align-items:center;gap:2px;background:#f0fdf4;border:1px solid var(--green);color:var(--green);font-size:8px;font-weight:700;padding:1px 5px;border-radius:99px;margin:0 5px 4px}
.cs-badge{display:inline-flex;align-items:center;background:#f3f4f6;border:1px solid #d1d5db;color:#9ca3af;font-size:8px;font-weight:700;padding:1px 5px;border-radius:99px;margin:0 5px 4px;letter-spacing:.04em;text-transform:uppercase}
/* Landscape placeholder — shown when spot is landscape and no landscape templates exist */
.tmpl-landscape-ph{display:none;padding:22px 16px;text-align:center;background:#f8f7f5;border-radius:9px;border:2px dashed var(--border)}
.tmpl-landscape-ph.visible{display:block}
.tmpl-landscape-ph-icon{font-size:30px;margin-bottom:8px}
.tmpl-landscape-ph-title{font-size:12px;font-weight:700;color:var(--ink-mid);margin-bottom:4px}
.tmpl-landscape-ph-sub{font-size:11px;color:var(--ink-light);line-height:1.5}

/* ── Photo library ───────────────────────────────────────── */
.img-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.img-thumb{position:relative;aspect-ratio:4/3;border-radius:6px;overflow:hidden;cursor:pointer;border:2.5px solid transparent;transition:all .2s}
.img-thumb:hover{transform:scale(1.03)}
.img-thumb.selected{border-color:var(--burg);box-shadow:0 0 0 1.5px var(--burg)}
.img-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.img-thumb .chk{display:none;position:absolute;top:3px;right:3px;background:var(--burg);color:#fff;border-radius:50%;width:16px;height:16px;font-size:9px;font-weight:900;align-items:center;justify-content:center}
.img-thumb.selected .chk{display:flex}
.img-empty{grid-column:1/-1;padding:14px 8px;text-align:center;font-size:11px;color:var(--ink-light);line-height:1.5}
.img-loading{grid-column:1/-1;padding:14px 8px;text-align:center;font-size:11px;color:var(--ink-light)}
.fnote{font-size:10px;color:var(--ink-light);margin-top:5px;line-height:1.4}

/* ── Side-by-side photo + logo ────────────────────────────── */
.photo-logo-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}
.logo-col{display:flex;flex-direction:column;gap:8px}
.lib-section{margin-top:10px}
.lib-label{font-size:9.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-light);margin-bottom:6px}

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
.upload-label{font-size:11.5px;font-weight:600;color:var(--ink-mid);margin-top:2px}
.upload-sub{font-size:10px;color:var(--ink-light);margin-top:1px;line-height:1.3;max-width:120px}
/* Hide placeholder and show full image when file is loaded */
.upload-zone.has-file .upload-placeholder{display:none}
.upload-preview{display:none;width:100%;height:auto;object-fit:contain;border-radius:5px}
.upload-zone.has-file .upload-preview{display:block}
/* Logo thumbnail — constrained to zone height, centered */
.logo-zone.has-file .upload-preview{width:auto;max-height:64px;margin:0 auto}
/* Clear-upload button */
.upload-clear{position:absolute;top:5px;right:5px;z-index:3;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;border:none;cursor:pointer;font-size:11px;display:none;align-items:center;justify-content:center;line-height:1}
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
.loading-title{font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:.08em;color:var(--ink);margin-bottom:4px}
.loading-sub{font-size:10px;color:var(--ink-light);line-height:1.4}

.result-panel{background:var(--card);border:1.5px solid var(--border);border-radius:11px;overflow:hidden;display:none}
.result-panel.visible{display:block}
.result-hdr{padding:8px 12px;border-bottom:1px solid var(--border);background:#FAFAF8;display:flex;align-items:center;justify-content:space-between}
.result-title{font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--green)}
.result-img-wrap{display:flex;justify-content:center;background:#f5f3f0}
.result-img{display:block;width:100%;aspect-ratio:2/3;object-fit:contain;border-radius:0}
.result-actions{padding:8px 10px;display:flex;gap:6px;flex-wrap:wrap;border-top:1px solid var(--border);align-items:center}
.act-btn{padding:9px 18px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-mid);transition:all .2s;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:6px}
.act-btn:hover:not(:disabled){border-color:var(--burg);color:var(--burg)}
.act-btn.primary{background:var(--green);border-color:var(--green);color:#fff;font-size:13px;font-weight:700}
.act-btn.primary:hover:not(:disabled){background:#144d30}
.act-btn.ml{margin-left:auto}

.err-box{padding:14px 16px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;font-size:12.5px;color:#991b1b;line-height:1.5;display:none}
.err-box.visible{display:block}

.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:var(--ink);color:#fff;padding:10px 22px;border-radius:30px;font-size:13px;font-weight:600;box-shadow:0 8px 32px rgba(0,0,0,.3);transition:transform .3s cubic-bezier(.34,1.56,.64,1);z-index:999;pointer-events:none}
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
</style>
</head>
<body>

<header class="hdr">
  <div class="brand">My Town <span>Postcard</span></div>
  <div class="hdr-badge">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
    Grok Ad Generator
  </div>
</header>

<div class="toast" id="toast"></div>

<div class="layout">

  <!-- LEFT: FORM -->
  <div class="fpanel">
    <div>
      <div class="ptitle">Grok Ad Generator</div>
      <div class="psub">Fill in your details, pick a photo, and let Grok generate your finished postcard ad via API &mdash; no console, no file attachments.</div>
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
      <div class="field"><label>Website / URL</label><input type="text" id="website" placeholder="mrbiscuitscafe.com"></div>
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
        <div class="card-title">Template</div>
        <span id="tmplOrientationLabel" style="font-size:10px;color:var(--ink-light)"></span>
      </div>
      <div class="card-body" style="padding:10px 12px">
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
          <div class="tmpl-card disabled">
            <div class="tmpl-thumb" style="display:flex;align-items:center;justify-content:center;font-size:22px;background:#f5f5f5">&#128396;</div>
            <div class="tmpl-card-name" style="color:#bbb">Bold &amp; Modern</div>
            <div class="cs-badge">Coming Soon</div>
          </div>
          <div class="tmpl-card disabled">
            <div class="tmpl-thumb" style="display:flex;align-items:center;justify-content:center;font-size:22px;background:#f0f4ff">&#127807;</div>
            <div class="tmpl-card-name" style="color:#bbb">Clean &amp; Minimal</div>
            <div class="cs-badge">Coming Soon</div>
          </div>
          <div class="tmpl-card disabled">
            <div class="tmpl-thumb" style="display:flex;align-items:center;justify-content:center;font-size:22px;background:#1a1a2e">&#128293;</div>
            <div class="tmpl-card-name" style="color:#bbb">Dark &amp; Bold</div>
            <div class="cs-badge">Coming Soon</div>
          </div>
          <div class="tmpl-card" id="tmpl-neighborhood-pro" onclick="selectTemplate('neighborhood-pro')">
            <img class="tmpl-thumb" src="/api/grok-ad-generator/template-preview/neighborhood-pro" alt="Neighborhood Pro" onerror="this.style.background='#e8f5e9'">
            <div class="tmpl-card-name">Neighborhood Pro</div>
            <div class="tmpl-sel-badge" id="badge-neighborhood-pro" style="display:none">&#10003; Selected</div>
          </div>
        </div>
        <!-- Landscape placeholder (shown only when spot is landscape) -->
        <div class="tmpl-landscape-ph" id="tmplLandscapePh">
          <div class="tmpl-landscape-ph-icon">&#128444;&#65039;</div>
          <div class="tmpl-landscape-ph-title">Landscape templates coming soon</div>
          <div class="tmpl-landscape-ph-sub">Your ad will still be generated &mdash; Grok will fill the landscape canvas with your business info and photo.</div>
        </div>
      </div>
    </div>

    <!-- Hero Photo + Logo — side by side -->
    <div class="photo-logo-row">

      <!-- Left: Hero Photo -->
      <div class="card">
        <div class="card-hdr">
          <div class="card-title">Hero Photo</div>
          <span style="font-size:10px;color:var(--ink-light)" id="photoStatus">None selected</span>
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
            <span style="font-size:10px;color:var(--ink-light)" id="logoStatus">Optional</span>
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
          <div class="loading-title">Grok is designing your ad&hellip;</div>
          <div class="loading-sub">Usually 20&ndash;45 seconds. Grok is compositing your images and placing your business text.</div>
        </div>

        <!-- Error -->
        <div class="err-box" id="errBox"></div>

        <!-- Result -->
        <div class="result-panel" id="resultPanel">
          <div class="result-hdr">
            <div class="result-title">&#10003; Your Ad</div>
            <button class="act-btn" onclick="resetResult()" style="padding:4px 10px;font-size:10px">&#8634; Start Over</button>
          </div>
          <div class="result-img-wrap"><img class="result-img" id="resultImg" alt="Generated ad"></div>
          <div class="result-actions">
            <button class="act-btn primary" onclick="useThisAd()">&#10003; Use This Ad</button>
            <button class="act-btn" onclick="downloadAd()">&#8595; Download</button>
            <button class="act-btn" onclick="generate()">&#8634; Regenerate</button>
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
var _activeTemplate = 'parchment-classic';
var _spotSize = 'XL';
var _takenCategories = [];

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
  var grid = document.getElementById('tmplGrid');
  var ph   = document.getElementById('tmplLandscapePh');
  var lbl  = document.getElementById('tmplOrientationLabel');
  var d = SIZE_DIMS[_spotSize] || SIZE_DIMS.XL;
  if(lbl) lbl.textContent = orientation.charAt(0).toUpperCase()+orientation.slice(1)+' \u00b7 '+d.w/100+'\u2033\u00d7'+d.h/100+'\u2033';
  if(!grid) return;
  grid.classList.remove('portrait','landscape','square');
  grid.classList.add(orientation);
  var isLandscape = orientation === 'landscape';
  grid.style.display = isLandscape ? 'none' : 'grid';
  if(ph) ph.classList.toggle('visible', isLandscape);
}

function selectTemplate(key){
  if(_activeTemplate === key) return;
  _activeTemplate = key;
  document.querySelectorAll('.tmpl-card').forEach(function(c){ c.classList.remove('active'); });
  document.querySelectorAll('.tmpl-sel-badge').forEach(function(b){ b.style.display='none'; });
  var card = document.getElementById('tmpl-' + key);
  var badge = document.getElementById('badge-' + key);
  if(card){ card.classList.add('active'); }
  if(badge){ badge.style.display=''; }
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
  if(menuDefaults) menuDefaults.forEach(function(v){ addMenuItem(v); });
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
  document.getElementById('photoStatus').textContent = 'None selected';
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
  };

  try{
    var resp = await fetch('/api/grok-ad-generator/generate', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    document.getElementById('loadingPanel').classList.remove('visible');
    var data = await resp.json();
    if(!resp.ok || data.error){
      showErr(data.error || 'Generation failed \\u2014 please try again.');
    } else {
      _resultUrl = data.imageUrl;
      showResult(data.imageUrl);
      showToast('Ad generated! Review it below.');
    }
  }catch(err){
    document.getElementById('loadingPanel').classList.remove('visible');
    showErr('Network error: ' + (err instanceof Error ? err.message : String(err)));
  }

  document.getElementById('genBtn').disabled = false;
  document.getElementById('genLabel').textContent = 'Generate My Ad with Grok';
}

function showResult(url){
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

function useThisAd(){
  if(!_resultUrl){ return; }
  var formData = {
    businessName:  document.getElementById('bizName').value.trim(),
    industry:      document.getElementById('industry').value || 'Local Business',
    email:         (document.getElementById('email') ? document.getElementById('email').value.trim() : ''),
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
  if(window.opener && !window.opener.closed){
    window.opener.postMessage({ type: 'grok-ad-result', formData: formData }, window.location.origin);
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
  a.download = 'grok-ad-' + document.getElementById('bizName').value.trim().replace(/\\s+/g,'-') + '-' + Date.now() + '.png';
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
  var takenParam = params.get('taken') || '';
  _takenCategories = takenParam ? takenParam.split(',').map(function(s){ return s.trim(); }).filter(Boolean) : [];
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
      bizName:"Mr. Biscuit's Cafe", tagline:"From-Scratch Biscuits & Boba!",
      phone:"(706) 754-0105", city:"Clarkesville, GA", address:"596 W Louise St",
      website:"mrbiscuitscafe.com", offer:"$1 OFF Any Biscuit",
      offerFine:"1 per visit \\u00b7 with this postcard"
    };
    Object.keys(f).forEach(function(id){ var el=document.getElementById(id); if(el) el.value=f[id]; });
    var sel = document.getElementById('industry');
    for(var i=0;i<sel.options.length;i++){
      if(sel.options[i].text === 'Breakfast & Cafe'){ sel.selectedIndex=i; break; }
    }
    ['Bacon Egg & Cheese Biscuit $5.99','Boba Tea (any flavor) $4.50','Gravy Biscuit $3.99','Breakfast Plate $7.99']
      .forEach(function(v){ addMenuItem(v); });
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
