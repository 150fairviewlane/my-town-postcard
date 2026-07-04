import path from "node:path";
import fs from "node:fs";

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
}

export interface GeneratedAd {
  imageUrl: string;
  template: string;
}

/**
 * Generate a sample postcard ad for a business, for use in cold-email outreach.
 * Uses xAI Grok Imagine with a template image for a high-quality result.
 * Returns a data URL (base64 PNG) for storage.
 */
export async function generateAdForOutreach(
  params: OutreachAdParams,
): Promise<GeneratedAd> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY not configured");

  const templateKey = pickTemplate(params.category);
  const templateFile = TEMPLATE_PORTRAIT[templateKey] ?? TEMPLATE_PORTRAIT["parchment-classic"]!;
  const tmplPath = path.join(WORKSPACE_ROOT, "attached_assets", templateFile);

  let imageRefs: Array<{ type: "image_url"; url: string }> = [];
  if (fs.existsSync(tmplPath)) {
    const buf = fs.readFileSync(tmplPath);
    const mime = /\.jpe?g$/i.test(templateFile) ? "image/jpeg" : "image/png";
    imageRefs = [{ type: "image_url", url: toDataUrl(buf, mime) }];
  }

  const { bizName, category, phone, address, city, state } = params;
  const industry = category ?? "local business";
  const fullAddr = [address, city, state].filter(Boolean).join(", ");
  const servicesList =
    params.services && params.services.length > 0
      ? params.services.slice(0, 5).join(", ")
      : industry;

  const prompt = imageRefs.length > 0
    ? `IMAGE 1 is the template. Create a professional postcard ad for:
Business: ${bizName}
Industry: ${industry}
Services: ${servicesList}
Phone: ${phone ?? "(not provided)"}
Address: ${fullAddr}
Modify the template to feature this business. Keep the overall layout and color scheme. Place the business name prominently. Use photorealistic images appropriate for ${industry}. Add phone number in footer. Keep design clean and professional for residential direct mail.`
    : `Create a professional full-color direct-mail postcard ad (portrait, 4x5 inches) for:
Business: ${bizName}
Industry: ${industry}
Services: ${servicesList}
Phone: ${phone ?? "(not provided)"}
Address: ${fullAddr}
Design a polished, print-ready postcard ad. Business name large and prominent. Include phone number. Warm, inviting colors. Professional photography-style imagery for ${industry}. This is a sample ad to show the business what their postcard could look like.`;

  const body: Record<string, unknown> = {
    model: "grok-2-image-1212",
    prompt,
    n: 1,
    aspect_ratio: "3:4",
  };
  if (imageRefs.length > 0) {
    body["images"] = imageRefs;
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
    body: JSON.stringify(body),
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

  if (imageUrl.startsWith("data:")) {
    return { imageUrl, template: templateKey };
  }

  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error(`Failed to fetch generated image: ${imgResp.status}`);
  const imgBuf = Buffer.from(await imgResp.arrayBuffer());

  let sharp: typeof import("sharp");
  try {
    sharp = (await import("sharp")).default as unknown as typeof import("sharp");
    const cropped = await (sharp as unknown as (buf: Buffer) => import("sharp").Sharp)(imgBuf)
      .resize(900, 1200, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
    return { imageUrl: `data:image/png;base64,${cropped.toString("base64")}`, template: templateKey };
  } catch {
    return { imageUrl: `data:image/png;base64,${imgBuf.toString("base64")}`, template: templateKey };
  }
}
