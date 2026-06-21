import { Router, type IRouter } from "express";
import OpenAI, { toFile } from "openai";
import Anthropic from "@anthropic-ai/sdk";
import jwt from "jsonwebtoken";
import { db, generatedAdsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const router: IRouter = Router();
const JWT_SECRET = process.env.SESSION_SECRET || "localspot-secret";

function requireAdmin(req: any, res: any, next: any): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  try { jwt.verify(auth.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Invalid or expired token" }); }
}

function getXAI(): { apiKey: string } | null {
  const apiKey = process.env.XAI_API_KEY;
  return apiKey ? { apiKey } : null;
}

function getOpenAI(): OpenAI | null {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

function getAnthropic(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

// ── Vision: write an art-director prompt from the uploaded image ────────────

const VISION_DIRECTIVE = `You are an expert art director for premium direct-mail print advertising.
Analyze this advertisement image carefully and write a single precise image generation prompt of 120–150 words
that describes a PROFESSIONALLY REDESIGNED version of this ad.
Include: composition and layout, lighting and atmosphere, color palette, visual style, and mood.
The result should look like it was produced for a high-end national advertising campaign.
Return ONLY the generation prompt — no preamble, no explanation, no labels.`;

async function enhanceWithGpt4o(openai: OpenAI, imageData: string, userPrompt: string): Promise<string> {
  const visionRes = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 600,
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageData, detail: "high" } } as any,
        { type: "text", text: VISION_DIRECTIVE + "\n\nUser direction: " + userPrompt },
      ],
    }],
  });
  const enhanced = visionRes.choices?.[0]?.message?.content?.trim() ?? "";
  if (!enhanced) throw new Error("GPT-4o returned no prompt");
  return enhanced;
}

async function enhanceWithClaude(anthropic: Anthropic, imageData: string, userPrompt: string): Promise<string> {
  const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data URL");
  const mediaType = match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  const b64data = match[2];

  const claudeRes = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 600,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: b64data } },
        { type: "text", text: VISION_DIRECTIVE + "\n\nUser direction: " + userPrompt },
      ],
    }],
  });
  const enhanced = claudeRes.content?.[0]?.type === "text" ? claudeRes.content[0].text.trim() : "";
  if (!enhanced) throw new Error("Claude returned no prompt");
  return enhanced;
}

// ── Generators ──────────────────────────────────────────────────────────────

const GPT_IMAGE_SUFFIX = "Photorealistic commercial photography style. Professional studio lighting. Rich, true-to-life colors. No text, letters, numbers, or readable content of any kind.";
async function generateWithGptImage1(openai: OpenAI, prompt: string): Promise<string> {
  const imgRes = await openai.images.generate({
    model: "gpt-image-1",
    prompt: prompt + "\n\n" + GPT_IMAGE_SUFFIX,
    size: "1024x1536",
  });
  const b64 = imgRes.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-1 returned no image");
  return `data:image/png;base64,${b64}`;
}

/** Send the uploaded image directly to gpt-image-1's edit endpoint — no vision bridge. */
async function generateWithGptImageEdit(openai: OpenAI, imageData: string, userPrompt: string): Promise<string> {
  const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data URL");
  const buffer = Buffer.from(match[2], "base64");
  const file   = await toFile(buffer, "upload.png", { type: match[1] });

  const imgRes = await (openai.images as any).edit({
    model:  "gpt-image-1",
    image:  file,
    prompt: userPrompt,
    size:   "1024x1536",
  });
  const b64 = imgRes.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-1 edit returned no image");
  return `data:image/png;base64,${b64}`;
}

/** Send the uploaded image directly to Grok's /images/edits — no prompt enhancement. */
async function generateWithGrokEdit(imageData: string, userPrompt: string): Promise<string> {
  const xai = getXAI();
  if (!xai) throw new Error("XAI_API_KEY not configured");

  const body = {
    model:  "grok-imagine-image-quality",
    prompt: userPrompt,
    n:      1,
    images: [{ type: "image_url", url: imageData }],
  };
  const res  = await fetch("https://api.x.ai/v1/images/edits", {
    method:  "POST",
    headers: { Authorization: `Bearer ${xai.apiKey}`, "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    const msg = (json?.error as Record<string, unknown>)?.message;
    throw new Error(typeof msg === "string" ? msg : `xAI edits error ${res.status}`);
  }
  const data = Array.isArray(json?.data) ? (json.data as Record<string, unknown>[]) : [];
  const item = data[0];
  if (typeof item?.b64_json === "string") return `data:image/png;base64,${item.b64_json}`;
  if (typeof item?.url === "string" && item.url) return item.url;
  throw new Error("No image returned from xAI /images/edits");
}

// ── Pipeline definitions ────────────────────────────────────────────────────

const MODEL_META: Record<string, { label: string; desc: string }> = {
  "gpt4o-enhanced":  { label: "GPT-4o → gpt-image-1",       desc: "GPT-4o vision analysis → enhanced prompt → gpt-image-1 generation" },
  "claude-enhanced": { label: "Claude → gpt-image-1",        desc: "Claude vision analysis → enhanced prompt → gpt-image-1 generation" },
  "gpt-image-edit":  { label: "gpt-image-1 (direct edit)",   desc: "Uploaded image sent directly to gpt-image-1 edit endpoint — no vision bridge" },
  "grok-image-edit": { label: "Grok (direct edit)",          desc: "Uploaded image sent directly to Grok /images/edits — no prompt enhancement" },
};

async function runPipeline(
  modelId: string,
  openai: OpenAI,
  anthropic: Anthropic | null,
  imageData: string,
  userPrompt: string,
): Promise<string> {
  switch (modelId) {
    case "gpt4o-enhanced": {
      const prompt = await enhanceWithGpt4o(openai, imageData, userPrompt);
      return generateWithGptImage1(openai, prompt);
    }
    case "claude-enhanced": {
      if (!anthropic) throw new Error("Anthropic API key not configured");
      const prompt = await enhanceWithClaude(anthropic, imageData, userPrompt);
      return generateWithGptImage1(openai, prompt);
    }
    case "gpt-image-edit":
      return generateWithGptImageEdit(openai, imageData, userPrompt);
    case "grok-image-edit":
      return generateWithGrokEdit(imageData, userPrompt);
    default:
      throw new Error(`Unknown model: ${modelId}`);
  }
}

// ── Routes ──────────────────────────────────────────────────────────────────

// List metadata only — imageData is NOT returned here to keep the response small.
// Images are fetched individually via GET /admin/generated-ads/:id/image.
router.get("/admin/generated-ads", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        id:        generatedAdsTable.id,
        model:     generatedAdsTable.model,
        label:     generatedAdsTable.label,
        prompt:    generatedAdsTable.prompt,
        createdAt: generatedAdsTable.createdAt,
      })
      .from(generatedAdsTable)
      .orderBy(desc(generatedAdsTable.createdAt));
    res.json({ ads: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "DB error" });
  }
});

// Serve raw image bytes for a single ad. No auth header possible on <img src>,
// so requireAdmin is intentionally omitted; the page itself is admin-gated.
router.get("/admin/generated-ads/:id/image", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).send("Invalid id"); return; }
  try {
    const [row] = await db
      .select({ imageData: generatedAdsTable.imageData })
      .from(generatedAdsTable)
      .where(eq(generatedAdsTable.id, id));
    if (!row) { res.status(404).send("Not found"); return; }
    const match = row.imageData.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) { res.status(500).send("Invalid image data"); return; }
    res.setHeader("Content-Type", match[1]);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(Buffer.from(match[2], "base64"));
  } catch (err) {
    res.status(500).send("Error");
  }
});

router.delete("/admin/generated-ads/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(generatedAdsTable).where(eq(generatedAdsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "DB error" });
  }
});

router.post("/admin/ai-model-test", requireAdmin, async (req, res): Promise<void> => {
  const { imageData, prompt, models } = req.body ?? {};

  if (!imageData || typeof imageData !== "string") { res.status(400).json({ error: "imageData is required" }); return; }
  if (!prompt    || typeof prompt    !== "string") { res.status(400).json({ error: "prompt is required" });    return; }
  if (!Array.isArray(models) || models.length === 0) { res.status(400).json({ error: "At least one model must be selected" }); return; }

  const openai = getOpenAI();
  if (!openai) { res.status(500).json({ error: "OpenAI integration not configured" }); return; }
  const anthropic = getAnthropic();

  type ModelResult = {
    id: number | null; model: string; label: string; desc: string;
    imageUrl: string | null; timeTaken: number; error: string | null;
  };

  const tasks = (models as string[]).map(async (modelId): Promise<ModelResult> => {
    const meta = MODEL_META[modelId] ?? { label: modelId, desc: "" };
    const start = Date.now();
    try {
      const imageUrl = await runPipeline(modelId, openai, anthropic, imageData, prompt);
      const [saved] = await db.insert(generatedAdsTable).values({
        model: modelId, label: meta.label, prompt, imageData: imageUrl,
      }).returning({ id: generatedAdsTable.id });
      return { id: saved?.id ?? null, model: modelId, label: meta.label, desc: meta.desc, imageUrl, timeTaken: Date.now() - start, error: null };
    } catch (err) {
      return { id: null, model: modelId, label: meta.label, desc: meta.desc, imageUrl: null, timeTaken: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
    }
  });

  const settled = await Promise.allSettled(tasks);
  const results = settled.map(r =>
    r.status === "fulfilled" ? r.value :
    { id: null, model: "unknown", label: "Unknown", desc: "", imageUrl: null, timeTaken: 0, error: "Unexpected failure" }
  );
  res.json({ results });
});

export default router;
