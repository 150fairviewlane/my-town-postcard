import path from "node:path";
import fs from "node:fs";
import { buildAdPrompt, type AdPromptInput } from "./buildAdPrompt";
import { swapQrCode } from "./locateQrCode";
import { getTemplateQrStyle } from "./compositeQr";

/** Walk up from cwd until we find pnpm-workspace.yaml. */
function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const WORKSPACE_ROOT = findWorkspaceRoot();

const TEMPLATE_PORTRAIT: Record<string, string> = {
  "parchment-classic":  "mr_biscuits_template_no_logo_1778806527327.png",
  "neighborhood-pro":   "6300F2D5-6BF1-403E-A40B-7203E4E26402_1778948283280.jpeg",
  "at-your-service":    "IMG_0728_1779065210873.jpeg",
  "health-wellness":    "healthcare_generic_template_1779141099043.png",
  "home-elegance":      "home_services_no_text_1780946323885.png",
  "sage-organic":       "IMG_0832_1780946925550.png",
  "heritage-home":      "heritage_home_portrait.png",
  "wok-fire":           "image_1781029065584.png",
};

const CATEGORY_TEMPLATE: Record<string, string> = {
  "health":      "health-wellness",
  "medical":     "health-wellness",
  "dental":      "health-wellness",
  "restaurant":  "wok-fire",
  "food":        "wok-fire",
  "cafe":        "wok-fire",
  "pizza":       "wok-fire",
  "home":        "home-elegance",
  "roofing":     "home-elegance",
  "plumbing":    "home-elegance",
  "hvac":        "home-elegance",
  "landscaping": "home-elegance",
  "cleaning":    "home-elegance",
  "remodel":     "home-elegance",
  "contractor":  "neighborhood-pro",
  "electrician": "neighborhood-pro",
  "auto":        "at-your-service",
  "mechanic":    "at-your-service",
  "yoga":        "sage-organic",
  "spa":         "sage-organic",
  "wellness":    "sage-organic",
};

function pickTemplate(category: string | null): string {
  if (!category) return "parchment-classic";
  const lower = category.toLowerCase();
  for (const [kw, tmpl] of Object.entries(CATEGORY_TEMPLATE)) {
    if (lower.includes(kw)) return tmpl;
  }
  return "parchment-classic";
}

function toDataUrl(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function extractXaiImageUrl(body: Record<string, unknown>): string | null {
  const data = body["data"];
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0] as Record<string, unknown>;
  if (typeof first["url"] === "string") return first["url"];
  if (typeof first["b64_json"] === "string") {
    return `data:image/png;base64,${first["b64_json"]}`;
  }
  return null;
}

async function safeJson(resp: Response): Promise<Record<string, unknown>> {
  try {
    return (await resp.json()) as Record<string, unknown>;
  } catch {
    const text = await resp.text().catch(() => "");
    return { _raw: text };
  }
}

export interface OutreachAdParams {
  bizName: string;
  category: string | null;
  phone: string | null;
  address: string | null;
  city: string;
  state: string;
  website: string | null;
  services?: string[];
  logoUrl?: string | null;
}

export interface GeneratedAd {
  imageUrl: string;
  template: string;
}

/**
 * Generate a sample postcard ad for a business, for use in cold-email outreach.
 *
 * Uses the same buildAdPrompt() used by the normal customer ad-generator so the
 * structured layout rules (phone exactly once, QR slot in footer, etc.) are
 * identical. After Grok returns the image, swapQrCode() detects the magenta
 * placeholder and composites a real QR code pointing to the business's website.
 *
 * Returns a data URL (base64 JPEG) for storage.
 */
export async function generateAdForOutreach(
  params: OutreachAdParams,
): Promise<GeneratedAd> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY not configured");

  const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  const templateKey = pickTemplate(params.category);
  const templateFile = TEMPLATE_PORTRAIT[templateKey] ?? TEMPLATE_PORTRAIT["parchment-classic"]!;
  const tmplPath = path.join(WORKSPACE_ROOT, "attached_assets", templateFile);

  let imageRefs: Array<{ type: "image_url"; url: string }> = [];
  if (fs.existsSync(tmplPath)) {
    const buf  = fs.readFileSync(tmplPath);
    const mime = /\.jpe?g$/i.test(templateFile) ? "image/jpeg" : "image/png";
    imageRefs  = [{ type: "image_url", url: toDataUrl(buf, mime) }];
  }

  // Include the business logo as a second image reference when available
  let logoIncluded = false;
  if (params.logoUrl) {
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12_000);
      const logoResp = await fetch(params.logoUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: ctrl.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      if (logoResp.ok) {
        const logoBuf  = Buffer.from(await logoResp.arrayBuffer());
        const logoMime = (logoResp.headers.get("content-type") ?? "image/png").split(";")[0]!.trim();
        imageRefs.push({ type: "image_url", url: toDataUrl(logoBuf, logoMime) });
        logoIncluded = true;
      }
    } catch {
      // logo download failed — proceed without it
    }
  }

  // Build the structured prompt using the same function as the customer ad-generator.
  // This gives us the per-template layout rules, the "phone EXACTLY ONCE in footer"
  // guard, and the magenta QR placeholder instruction — all of which were missing
  // from the old hand-written outreach prompt.
  const promptInput: AdPromptInput = {
    bizName:   params.bizName,
    tagline:   "",
    phone:     params.phone ?? "",
    city:      params.city,
    address:   params.address ?? "",
    website:   params.website ?? "",
    industry:  params.category ?? "Local Business",
    menu:      params.services?.slice(0, 6) ?? [],
    offer:     "",
    offerFine: "",
    template:  templateKey,
    sizeKey:   "xl",
    photoUrl:  "",
    logoData:  logoIncluded ? (params.logoUrl ?? "") : "",
    generationIndex: 0,
  };
  const prompt = buildAdPrompt(promptInput, false, templateKey);

  const reqBody: Record<string, unknown> = {
    model: "grok-imagine-image",
    prompt,
    n: 1,
    aspect_ratio: "3:4",
  };
  if (imageRefs.length > 0) {
    reqBody["images"] = imageRefs;
  }

  const endpoint = imageRefs.length > 0
    ? "https://api.x.ai/v1/images/edits"
    : "https://api.x.ai/v1/images/generations";

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reqBody),
  });

  const respBody = await safeJson(resp);
  if (!resp.ok) {
    const errMsg =
      (respBody["error"] as Record<string, unknown> | undefined)?.["message"] ??
      respBody["error"] ??
      respBody["_raw"] ??
      `xAI error ${resp.status}`;
    throw new Error(`Ad generation failed: ${String(errMsg).slice(0, 300)}`);
  }

  const imageUrl = extractXaiImageUrl(respBody);
  if (!imageUrl) {
    throw new Error("xAI returned no image URL");
  }

  // Download image → buffer so we can run the QR swap step
  let imgBuf: Buffer;
  if (imageUrl.startsWith("data:")) {
    imgBuf = Buffer.from(imageUrl.split(",")[1] ?? "", "base64");
  } else {
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) throw new Error(`Failed to fetch generated image: ${imgResp.status}`);
    imgBuf = Buffer.from(await imgResp.arrayBuffer());
  }

  // Crop to exact portrait XL print dimensions (900×1200 px at 300 DPI)
  let sharp: typeof import("sharp");
  try {
    sharp = (await import("sharp")).default as unknown as typeof import("sharp");
    imgBuf = await (sharp as unknown as (buf: Buffer) => import("sharp").Sharp)(imgBuf)
      .resize(900, 1200, { fit: "cover", position: "centre" })
      .jpeg({ quality: 98, chromaSubsampling: "4:4:4" })
      .toBuffer();
  } catch {
    // sharp unavailable — continue with raw buffer; swapQrCode will handle it
  }

  // Composite a real scannable QR code over the magenta placeholder.
  // Target: business website (or fallback homepage). This is a sample ad shown
  // in the cold email — there is no tracking code yet (spot not purchased).
  const qrTarget = normalizeWebsite(params.website) ?? "https://mytownpostcard.com";
  const qrStyle  = getTemplateQrStyle(templateKey);
  try {
    imgBuf = await swapQrCode(imgBuf, qrTarget, "xl", qrStyle);
  } catch {
    // swapQrCode failure is non-fatal — store the ad without a QR rather than
    // failing the whole cascade (the magenta will be visible but the email still sends)
  }

  return {
    imageUrl: `data:image/jpeg;base64,${imgBuf.toString("base64")}`,
    template: templateKey,
  };
}

function normalizeWebsite(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
