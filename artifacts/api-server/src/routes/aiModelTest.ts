import { Router, type IRouter } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import jwt from "jsonwebtoken";
import { db, generatedAdsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();
const JWT_SECRET = process.env.SESSION_SECRET || "localspot-secret";

function requireAdmin(req: any, res: any, next: any): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  try { jwt.verify(auth.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Invalid or expired token" }); }
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

const VISION_DIRECTIVE = `You are an expert art director for premium direct-mail print advertising.
Analyze this advertisement image carefully and write a single precise image generation prompt of 120–150 words
that describes a PROFESSIONALLY REDESIGNED version of this ad.
Include: composition and layout, lighting and atmosphere, color palette, visual style, and mood.
The result should look like it was produced for a high-end national advertising campaign.
Return ONLY the generation prompt — no preamble, no explanation, no labels.`;

const QUALITY_SUFFIX = "Photorealistic commercial photography style. Professional studio lighting. Rich, true-to-life colors with expert color grading. No text, letters, numbers, or readable content of any kind.";

async function runGpt4oEnhanced(openai: OpenAI, imageData: string, userPrompt: string): Promise<string> {
  const imageContent: OpenAI.Chat.ChatCompletionContentPart = {
    type: "image_url",
    image_url: { url: imageData, detail: "high" } as any,
  };

  const visionRes = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 600,
    messages: [{
      role: "user",
      content: [
        imageContent,
        { type: "text", text: VISION_DIRECTIVE + "\n\nUser direction: " + userPrompt },
      ],
    }],
  });

  const enhanced = visionRes.choices?.[0]?.message?.content?.trim() ?? "";
  if (!enhanced) throw new Error("GPT-4o returned no prompt");

  const imgRes = await openai.images.generate({
    model: "gpt-image-1",
    prompt: enhanced + "\n\n" + QUALITY_SUFFIX,
    size: "1024x1536",
  });

  const b64 = imgRes.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-1 returned no image");
  return `data:image/png;base64,${b64}`;
}

async function runClaudeEnhanced(openai: OpenAI, anthropic: Anthropic, imageData: string, userPrompt: string): Promise<string> {
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

  const imgRes = await openai.images.generate({
    model: "gpt-image-1",
    prompt: enhanced + "\n\n" + QUALITY_SUFFIX,
    size: "1024x1536",
  });

  const b64 = imgRes.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-1 returned no image");
  return `data:image/png;base64,${b64}`;
}

async function runDirect(openai: OpenAI, userPrompt: string): Promise<string> {
  const imgRes = await openai.images.generate({
    model: "gpt-image-1",
    prompt: userPrompt + "\n\n" + QUALITY_SUFFIX,
    size: "1024x1536",
  });
  const b64 = imgRes.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-1 returned no image");
  return `data:image/png;base64,${b64}`;
}

const MODEL_META: Record<string, { label: string; desc: string }> = {
  "gpt4o-enhanced":  { label: "GPT-4o → gpt-image-1",  desc: "GPT-4o vision analysis → enhanced prompt → gpt-image-1 generation" },
  "claude-enhanced": { label: "Claude → gpt-image-1",   desc: "Claude vision analysis → enhanced prompt → gpt-image-1 generation" },
  "direct":          { label: "gpt-image-1 Direct",      desc: "User prompt sent directly to gpt-image-1 (no image analysis)" },
};

// GET /api/admin/generated-ads — list all saved results, newest first
router.get("/admin/generated-ads", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(generatedAdsTable)
      .orderBy(desc(generatedAdsTable.createdAt));
    res.json({ ads: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "DB error" });
  }
});

// DELETE /api/admin/generated-ads/:id — remove a single saved ad
router.delete("/admin/generated-ads/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const { eq } = await import("drizzle-orm");
    await db.delete(generatedAdsTable).where(eq(generatedAdsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "DB error" });
  }
});

// POST /api/admin/ai-model-test — run models in parallel, save successes to DB
router.post("/admin/ai-model-test", requireAdmin, async (req, res): Promise<void> => {
  const { imageData, prompt, models } = req.body ?? {};

  if (!imageData || typeof imageData !== "string") {
    res.status(400).json({ error: "imageData is required" }); return;
  }
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "prompt is required" }); return;
  }
  if (!Array.isArray(models) || models.length === 0) {
    res.status(400).json({ error: "At least one model must be selected" }); return;
  }

  const openai = getOpenAI();
  const anthropic = getAnthropic();

  if (!openai) {
    res.status(500).json({ error: "OpenAI integration not configured (AI_INTEGRATIONS_OPENAI_BASE_URL missing)" }); return;
  }

  type ModelResult = {
    id: number | null;
    model: string; label: string; desc: string;
    imageUrl: string | null; timeTaken: number; error: string | null;
  };

  const tasks = (models as string[]).map(async (modelId): Promise<ModelResult> => {
    const meta = MODEL_META[modelId] ?? { label: modelId, desc: "" };
    const start = Date.now();
    try {
      let imageUrl: string;
      if (modelId === "gpt4o-enhanced") {
        imageUrl = await runGpt4oEnhanced(openai, imageData, prompt);
      } else if (modelId === "claude-enhanced") {
        if (!anthropic) throw new Error("Anthropic API key not configured");
        imageUrl = await runClaudeEnhanced(openai, anthropic, imageData, prompt);
      } else if (modelId === "direct") {
        imageUrl = await runDirect(openai, prompt);
      } else {
        throw new Error(`Unknown model: ${modelId}`);
      }

      // Persist to DB
      const [saved] = await db.insert(generatedAdsTable).values({
        model: modelId,
        label: meta.label,
        prompt,
        imageData: imageUrl,
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
