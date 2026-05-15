import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import fs from "fs";
import path from "path";

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

  // Load template PNG as raw buffer (used as multipart binary)
  const templateKey = d.template || "parchment-classic";
  const tmplFilename =
    templateKey === "made-fresh"
      ? "made_fresh_template.png"
      : "mr_biscuits_template_no_logo_1778806527327.png";
  const tmplPath = path.join(WORKSPACE_ROOT, "attached_assets", tmplFilename);
  if (!fs.existsSync(tmplPath)) {
    res.status(500).json({ error: "Template file not found on server." });
    return;
  }
  const tmplBuf = fs.readFileSync(tmplPath);

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
  const refLines: string[] = [
    templateKey === "made-fresh"
      ? "  • IMAGE 1 (TEMPLATE) — a bright, warm restaurant postcard layout featuring a natural wood table surface, " +
        "a chalkboard-style 'Made Fresh For You' sign, gingham cloth accents, a golden ticket coupon stub, " +
        "and a fresh white plate as the hero focal point. Preserve all zones, props, and warm editorial atmosphere exactly."
      : "  • IMAGE 1 (TEMPLATE) — the full postcard layout with parchment texture, brush-stroke band, " +
        "pennant ribbon, circular checkmark badge, dashed coupon box, and dark footer strip. " +
        "Reproduce every zone, texture, and design element exactly.",
  ];
  let imgIdx = 2;
  if (hasPhoto) {
    refLines.push(`  • IMAGE ${imgIdx++} (HERO FOOD PHOTO) — the actual food/product photograph. Composite it into the main hero image zone with professional lighting and realistic shadow blending.`);
  }
  if (hasLogo) {
    refLines.push(`  • IMAGE ${imgIdx} (BUSINESS LOGO) — the exact business logo. Reproduce it pixel-perfect with no stylization, color changes, or distortion.`);
  }

  const logoImg = hasPhoto ? 3 : 2;
  const outputRequirements =
    "LAYOUT — render these zones in order from top to bottom:\n\n" +

    "  ZONE 1 — HEADLINE (top of ad, above everything else):\n" +
    `    Business name "${d.bizName}" uses a LAYERED TWO-FONT treatment:\n` +
    `    • Main words: bold condensed all-caps slab/block serif — very large, dominant, horizontal (no angle). Deep black or dark color, maximum weight.\n` +
    `    • ONLY IF the business name itself contains a second word that is a category/descriptor (e.g. "Cafe" in "Mr. Biscuit's Cafe", "Grill" in "Sam's Grill", "Spa" in "Lotus Spa") — render ONLY that word from the actual name in a flowing orange script/cursive at a slight downward angle (≈-8°), large size, warm orange color. Do NOT invent or add any word that is not literally part of the provided business name.\n` +
    `    Together these two styles create a premium editorial stacked headline — not a single flat font.\n\n` +

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
    `    Address: "${fullAddress}" — bold, styled, not plain body text.\n` +
    "    QR code: place a clean, square QR code graphic in the lower-right of the footer. Do NOT render the website URL as text anywhere on the ad.\n\n" +

    "TYPOGRAPHIC RULES:\n" +
    "  • Headline: layered two-font treatment — bold condensed slab caps (horizontal) + flowing orange script for descriptors (angled ≈-8°)\n" +
    "  • Tagline: loose handwriting-style italic script, slight upward angle (+5°–7°), large, confident — never flat/horizontal\n" +
    "  • Logo: scaled small to fit ENTIRELY INSIDE the orange pennant ribbon; pennant stays fixed in top-left exactly as in the template\n" +
    "  • Footer phone/address: bold sans-serif, noticeably larger than fine print\n" +
    "  • Fine print / coupon terms: smallest text, still legible\n" +
    "  • NEVER render the website URL as visible text";

  const adPrompt =
    "You are a world-class print advertising art director and expert photo compositor. " +
    "Create a PRINT-READY premium postcard ad by taking the template layout and seamlessly integrating " +
    "the provided food photo into it — the result must look like a single cohesive ad designed by a top agency, " +
    "not a template with a photo pasted on top.\n\n" +
    `REFERENCE IMAGES: You are provided ${refLines.length} reference image${refLines.length > 1 ? "s" : ""}. ` +
    "Treat them as distinct inputs — do NOT merge their design styles or treat any of them as already finished:\n" +
    refLines.join("\n") + "\n\n" +
    outputRequirements + "\n" +
    "STYLE: high-end editorial advertising aesthetic. Cinematic food photography with rich, vibrant color and " +
    "professional lighting. Bold confident typography hierarchy. Premium color palette — deep, saturated, controlled. " +
    "Every element is intentionally placed; nothing looks accidental or generic. Print-ready sharpness throughout.\n\n" +
    "CRITICAL: Every piece of text must appear EXACTLY as specified. " +
    "Phone numbers, prices, business name — zero tolerance for errors. No website URL text anywhere.\n\n" +
    "BUSINESS DETAILS:\n" + businessBlock;

  // ── Build images array for xAI /images/edits ────────────────────────────────
  // grok-imagine-image-quality accepts up to 3 reference images as separate
  // `{ type: "image_url", url: "data:mime;base64,..." }` objects in an `images`
  // array (plural). Template is always first; photo and logo follow when present.
  const toDataUrl = (buf: Buffer, mime = "image/png") =>
    `data:${mime};base64,${buf.toString("base64")}`;

  // NOTE: the try/catch starts here so that photo/logo fetch errors also return
  // a clean JSON response instead of letting Express fall back to an HTML page
  // (which causes JSON.parse to throw a cryptic "string did not match" error in
  // Safari and "Unexpected token '<'" in Chrome).
  try {
    type XaiImageRef = { type: "image_url"; url: string };
    const imageRefs: XaiImageRef[] = [
      { type: "image_url", url: toDataUrl(tmplBuf, "image/png") },
    ];

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
      aspect_ratio: "2:3",
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
          res.json({ imageUrl: fallbackUrl, fallback: true });
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

      if (isImageArrayIssue) {
        req.log.warn({ errMsg, bizName: d.bizName }, "grok-imagine edits: multi-image rejected — retrying with template only");
        const retryBody: Record<string, unknown> = {
          model:        "grok-imagine-image-quality",
          prompt:       adPrompt,
          n:            1,
          images:       [{ type: "image_url", url: toDataUrl(tmplBuf) }],
          aspect_ratio: "2:3",
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
          if (retryUrl) { res.json({ imageUrl: retryUrl }); return; }
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

    res.json({ imageUrl });
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
    "parchment-classic": "mr_biscuits_template_no_logo_1778806527327.png",
    "made-fresh":        "made_fresh_template.png",
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

.tmpl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.tmpl-card{border:2px solid var(--border);border-radius:9px;overflow:hidden;cursor:pointer;transition:all .18s;background:#fff}
.tmpl-card:hover:not(.disabled){border-color:var(--burg);box-shadow:0 2px 12px rgba(124,28,46,.15)}
.tmpl-card.active{border-color:var(--green);box-shadow:0 0 0 1px var(--green)}
.tmpl-card.disabled{cursor:default;opacity:.55}
.tmpl-thumb{width:100%;height:72px;object-fit:cover;display:block;background:#f0ede8}
.tmpl-card-name{font-size:10px;font-weight:700;color:var(--ink);padding:5px 7px 1px;line-height:1.2}
.tmpl-card-sub{font-size:9px;color:var(--ink-light);padding:0 7px 4px;line-height:1.3}
.tmpl-sel-badge{display:inline-flex;align-items:center;gap:3px;background:#f0fdf4;border:1px solid var(--green);color:var(--green);font-size:9px;font-weight:700;padding:2px 6px;border-radius:99px;margin:0 7px 6px}
.cs-badge{display:inline-flex;align-items:center;background:#f3f4f6;border:1px solid #d1d5db;color:#9ca3af;font-size:9px;font-weight:700;padding:2px 6px;border-radius:99px;margin:0 7px 6px;letter-spacing:.04em;text-transform:uppercase}

.tabs{display:flex;border-bottom:1.5px solid var(--border);margin-bottom:12px}
.tab{flex:1;padding:8px;font-size:11px;font-weight:700;color:var(--ink-light);background:none;border:none;cursor:pointer;letter-spacing:.06em;text-transform:uppercase;border-bottom:2.5px solid transparent;margin-bottom:-1.5px;transition:all .2s;font-family:'DM Sans',sans-serif}
.tab.active{color:var(--burg);border-bottom-color:var(--burg)}
.tab-panel{display:none}
.tab-panel.active{display:block}

.img-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.img-thumb{position:relative;aspect-ratio:4/3;border-radius:6px;overflow:hidden;cursor:pointer;border:2.5px solid transparent;transition:all .2s}
.img-thumb:hover{transform:scale(1.04)}
.img-thumb.selected{border-color:var(--burg);box-shadow:0 0 0 1.5px var(--burg)}
.img-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.img-thumb .chk{display:none;position:absolute;top:3px;right:3px;background:var(--burg);color:#fff;border-radius:50%;width:16px;height:16px;font-size:9px;font-weight:900;align-items:center;justify-content:center}
.img-thumb.selected .chk{display:flex}
.img-empty{grid-column:1/-1;padding:18px;text-align:center;font-size:12px;color:var(--ink-light);line-height:1.5}
.img-loading{grid-column:1/-1;padding:18px;text-align:center;font-size:12px;color:var(--ink-light)}
.fnote{font-size:10px;color:var(--ink-light);margin-top:5px;line-height:1.4}

.upload-zone{border:2px dashed var(--border);border-radius:8px;padding:14px;text-align:center;cursor:pointer;transition:all .2s;background:var(--surface);position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center}
.upload-zone.photo-zone{min-height:120px}
.upload-zone.logo-zone{min-height:100px}
.upload-zone:hover{border-color:var(--burg);background:var(--burg-pale)}
.upload-zone.has-file{border-color:var(--green);background:#f0fdf4}
.upload-zone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.upload-icon{font-size:20px;opacity:.5;margin-bottom:3px}
.upload-label{font-size:12px;font-weight:600;color:var(--ink-mid)}
.upload-sub{font-size:10px;color:var(--ink-light);margin-top:2px}
.upload-preview{width:100%;max-height:160px;object-fit:contain;border-radius:5px;margin-top:8px;display:none;background:#f5f5f5}

.gen-btn{max-width:280px;margin:0 auto;padding:13px 28px;background:linear-gradient(135deg,#1a1a2e,#3D1A6B);color:#fff;border:none;border-radius:10px;font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:.14em;cursor:pointer;transition:all .25s;display:flex;align-items:center;justify-content:center;gap:10px}
.gen-btn:hover:not(:disabled){background:linear-gradient(135deg,#2a2a4e,#5a2490);transform:translateY(-1px);box-shadow:0 6px 24px rgba(80,30,180,.35)}
.gen-btn:disabled{background:#888;cursor:not-allowed;transform:none;box-shadow:none}
.gen-spark{font-size:17px;animation:sp 2s ease-in-out infinite}
@keyframes sp{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}

.loading-panel{background:var(--card);border:1.5px solid var(--border);border-radius:11px;padding:32px;text-align:center;display:none}
.loading-panel.visible{display:block}
.spinner{width:44px;height:44px;border:4px solid var(--border);border-top-color:var(--burg);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px}
@keyframes spin{to{transform:rotate(360deg)}}
.loading-title{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:.08em;color:var(--ink);margin-bottom:6px}
.loading-sub{font-size:12px;color:var(--ink-light);line-height:1.5}

.result-panel{background:var(--card);border:1.5px solid var(--border);border-radius:11px;overflow:hidden;display:none}
.result-panel.visible{display:block}
.result-hdr{padding:12px 16px;border-bottom:1px solid var(--border);background:#FAFAF8;display:flex;align-items:center;justify-content:space-between}
.result-title{font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--green)}
.result-img-wrap{padding:16px;display:flex;justify-content:center;background:#f5f3f0}
.result-img{display:block;width:100%;max-width:340px;object-fit:contain;border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,.15)}
.result-actions{padding:14px 16px;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border);align-items:center}
.act-btn{padding:9px 18px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-mid);transition:all .2s;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:6px}
.act-btn:hover:not(:disabled){border-color:var(--burg);color:var(--burg)}
.act-btn.primary{background:var(--green);border-color:var(--green);color:#fff;font-size:13px;font-weight:700}
.act-btn.primary:hover:not(:disabled){background:#144d30}
.act-btn.ml{margin-left:auto}

.err-box{padding:14px 16px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;font-size:12.5px;color:#991b1b;line-height:1.5;display:none}
.err-box.visible{display:block}

.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:var(--ink);color:#fff;padding:10px 22px;border-radius:30px;font-size:13px;font-weight:600;box-shadow:0 8px 32px rgba(0,0,0,.3);transition:transform .3s cubic-bezier(.34,1.56,.64,1);z-index:999;pointer-events:none}
.toast.show{transform:translateX(-50%) translateY(0)}

@media(max-width:860px){.layout{grid-template-columns:1fr;overflow:auto}html,body{height:auto;overflow:auto}.fpanel,.rpanel{overflow:visible}}
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
      <div class="card-hdr"><div class="card-title">Template</div></div>
      <div class="card-body" style="padding:10px 12px">
        <div class="tmpl-grid">
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
            <div class="tmpl-thumb" style="display:flex;align-items:center;justify-content:center;font-size:24px;background:#f5f5f5">&#128396;</div>
            <div class="tmpl-card-name" style="color:#bbb">Bold &amp; Modern</div>
            <div class="cs-badge">Coming Soon</div>
          </div>
          <div class="tmpl-card disabled">
            <div class="tmpl-thumb" style="display:flex;align-items:center;justify-content:center;font-size:24px;background:#f0f4ff">&#127807;</div>
            <div class="tmpl-card-name" style="color:#bbb">Clean &amp; Minimal</div>
            <div class="cs-badge">Coming Soon</div>
          </div>
          <div class="tmpl-card disabled">
            <div class="tmpl-thumb" style="display:flex;align-items:center;justify-content:center;font-size:24px;background:#1a1a2e">&#128293;</div>
            <div class="tmpl-card-name" style="color:#bbb">Dark &amp; Bold</div>
            <div class="cs-badge">Coming Soon</div>
          </div>
          <div class="tmpl-card disabled">
            <div class="tmpl-thumb" style="display:flex;align-items:center;justify-content:center;font-size:24px;background:#f5fff5">&#127968;</div>
            <div class="tmpl-card-name" style="color:#bbb">Neighborhood Pro</div>
            <div class="cs-badge">Coming Soon</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Food Photo -->
    <div class="card">
      <div class="card-hdr">
        <div class="card-title">Food / Hero Photo</div>
        <span style="font-size:10px;color:var(--ink-light)" id="photoStatus">None selected</span>
      </div>
      <div class="card-body">
        <div class="tabs">
          <button class="tab active" onclick="switchTab('lib')">&#128247; From Library</button>
          <button class="tab" onclick="switchTab('upload')">&#8679; Upload Your Own</button>
        </div>
        <div class="tab-panel active" id="tabLib">
          <div id="libGrid" class="img-grid">
            <div class="img-empty">Select an industry above to load photos from the library.</div>
          </div>
          <p class="fnote" id="libNote" style="display:none">Click a photo to select it as the hero image.</p>
        </div>
        <div class="tab-panel" id="tabUpload">
          <div class="upload-zone photo-zone" id="photoZone">
            <input type="file" accept="image/*" onchange="handlePhotoUpload(this)">
            <div class="upload-icon">&#128248;</div>
            <div class="upload-label">Upload a photo</div>
            <div class="upload-sub">Food, product, or storefront &mdash; JPG, PNG, WebP</div>
            <img class="upload-preview" id="photoPreview">
          </div>
          <p class="fnote">Grok will composite this into the hero area of the template.</p>
        </div>
      </div>
    </div>

    <!-- Logo -->
    <div class="card">
      <div class="card-hdr">
        <div class="card-title">Company Logo <span style="color:var(--ink-light);font-weight:400;letter-spacing:0;text-transform:none;font-size:10px">(optional)</span></div>
        <span style="font-size:10px;color:var(--ink-light)" id="logoStatus">Not provided</span>
      </div>
      <div class="card-body">
        <div class="upload-zone logo-zone" id="logoZone">
          <input type="file" accept="image/*" onchange="handleLogoUpload(this)">
          <div class="upload-icon">&#127991;&#65039;</div>
          <div class="upload-label">Upload logo</div>
          <div class="upload-sub">PNG with transparency preferred</div>
          <img class="upload-preview" id="logoPreview">
        </div>
        <p class="fnote">Placed in the upper-left corner exactly as provided.</p>
      </div>
    </div>

    <!-- Generate button -->
    <button class="gen-btn" id="genBtn" onclick="generate()" disabled>
      <span class="gen-spark">&#9889;</span>
      <span id="genLabel">Generate My Ad with Grok</span>
    </button>

    <!-- Loading -->
    <div class="loading-panel" id="loadingPanel">
      <div class="spinner"></div>
      <div class="loading-title">Grok is designing your ad&hellip;</div>
      <div class="loading-sub">Usually 20&ndash;45 seconds &mdash; Grok is analyzing your template, compositing your images, and placing your business text.</div>
    </div>

    <!-- Error -->
    <div class="err-box" id="errBox"></div>

    <!-- Result -->
    <div class="result-panel" id="resultPanel">
      <div class="result-hdr">
        <div class="result-title">&#10003; Your Grok-Generated Ad</div>
        <button class="act-btn" onclick="resetResult()" style="padding:5px 12px;font-size:11px">&#8634; Start Over</button>
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

<script>
function esc(str){ var d=document.createElement('div');d.textContent=String(str||'');return d.innerHTML; }
var _selectedPhotoUrl = '';
var _logoData = '';
var _resultUrl = '';
var _activeTab = 'lib';
var _activeTemplate = 'parchment-classic';
var _spotSize = 'XL';

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
  if(_activeTab === 'lib') loadLibrary();
  var industry = document.getElementById('industry').value;
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

function switchTab(tab){
  _activeTab = tab;
  document.querySelectorAll('.tab').forEach(function(t,i){
    t.classList.toggle('active', (tab==='lib' && i===0)||(tab==='upload' && i===1));
  });
  document.getElementById('tabLib').classList.toggle('active', tab==='lib');
  document.getElementById('tabUpload').classList.toggle('active', tab==='upload');
  if(tab==='lib') loadLibrary();
}

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
  var note = document.getElementById('libNote');
  if(!industry){
    grid.innerHTML = '<div class="img-empty">Select an industry above to load photos from the library.</div>';
    note.style.display = 'none';
    return;
  }
  grid.innerHTML = '<div class="img-loading">Loading library photos&hellip;</div>';
  note.style.display = 'none';
  try{
    var r = await fetch('/api/image-library?industry=' + encodeURIComponent(industry));
    var data = await r.json();
    var imgs = data.images || [];
    if(!imgs.length){
      grid.innerHTML = '<div class="img-empty">No approved photos for this industry yet.<br>Switch to the &ldquo;Upload&rdquo; tab to use your own photo.</div>';
      return;
    }
    grid.innerHTML = imgs.map(function(img,i){
      return '<div class="img-thumb" id="lthumb-'+i+'" onclick="selectLibPhoto('+i+',this)" title="'+esc(img.photographer_credit)+'">'
        + '<img src="'+esc(img.thumb_url)+'" loading="lazy" alt="">'
        + '<div class="chk">\\u2713</div>'
        + '<input type="hidden" id="lurl-'+i+'" value="'+esc(img.image_url)+'">'
        + '</div>';
    }).join('');
    note.style.display = 'block';
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
    var prev = document.getElementById('photoPreview');
    prev.src = e.target.result; prev.style.display = 'block';
    document.getElementById('photoZone').classList.add('has-file');
    document.getElementById('photoZone').querySelector('.upload-label').textContent = '\\u2713 Photo ready';
    document.getElementById('photoStatus').textContent = '\\u2713 Uploaded';
    document.getElementById('photoStatus').style.color = 'var(--green)';
  };
  reader.readAsDataURL(file);
}

function handleLogoUpload(input){
  var file = input.files[0]; if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e){
    _logoData = e.target.result;
    var prev = document.getElementById('logoPreview');
    prev.src = e.target.result; prev.style.display = 'block';
    document.getElementById('logoZone').classList.add('has-file');
    document.getElementById('logoZone').querySelector('.upload-label').textContent = '\\u2713 Logo ready';
    document.getElementById('logoStatus').textContent = '\\u2713 Uploaded';
    document.getElementById('logoStatus').style.color = 'var(--green)';
  };
  reader.readAsDataURL(file);
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
    window.opener.postMessage({ type: 'grok-ad-result', formData: formData }, '*');
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
</body>
</html>`;
