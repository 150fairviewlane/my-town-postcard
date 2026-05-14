import { Router, type IRouter } from "express";
import OpenAI, { toFile } from "openai";

const router: IRouter = Router();

function getOpenAIClient(): OpenAI | null {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

const LAYOUT_SYSTEM =
  "You are an expert print advertising art director for local businesses. " +
  "Return ONLY valid JSON — no markdown fences, no extra text.";

// POST /api/ad-gen/layout — GPT-4o enriches ad copy + generates hero prompt
router.post("/ad-gen/layout", async (req, res): Promise<void> => {
  const openai = getOpenAIClient();
  if (!openai) {
    res.status(503).json({ error: "AI not configured" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const industry = String(body.industry ?? "");
  const bizLine1 = String(body.bizLine1 ?? "");
  if (!industry || !bizLine1) {
    res.status(400).json({ error: "industry and bizLine1 are required" });
    return;
  }

  const bizLine2 = String(body.bizLine2 ?? "");
  const tagline = String(body.tagline ?? "");
  const phone = String(body.phone ?? "");
  const address = String(body.address ?? "");
  const city = String(body.city ?? "");
  const menuArr = Array.isArray(body.menu) ? (body.menu as unknown[]).map(String).filter(Boolean) : [];
  const offerAmount = String(body.offerAmount ?? "");
  const offerItem = String(body.offerItem ?? "");
  const offerFine = String(body.offerFine ?? "");
  const accentColor = String(body.accentColor ?? "#C8541A");

  const prompt =
    "Generate layout JSON for a premium local direct-mail postcard ad.\n\n" +
    "Business: " + bizLine1 + (bizLine2 ? " / " + bizLine2 : "") + "\n" +
    "Industry: " + industry + "\n" +
    "Tagline input: " + (tagline || "(generate a compelling, specific tagline under 35 chars)") + "\n" +
    "Phone: " + phone + "\n" +
    "Address: " + address + (city ? ", " + city : "") + "\n" +
    "Menu/Services: " + (menuArr.join(", ") || "(generate 4 relevant items with prices)") + "\n" +
    "Special Offer: " + (offerAmount || "(generate a compelling offer)") + " " + offerItem + "\n" +
    "Fine Print: " + (offerFine || "1 per visit · with this postcard") + "\n" +
    "Accent Color: " + accentColor + "\n\n" +
    'Return this exact JSON structure:\n' +
    '{\n' +
    '  "headline1": "BUSINESS NAME in ALL CAPS, max 20 chars per word",\n' +
    '  "headline2": "memorable 1-3 word script accent, title case, max 14 chars",\n' +
    '  "tagline": "compelling tagline under 35 chars",\n' +
    '  "menu": [\n' +
    '    {"name": "Item or Service", "price": "$X.XX"},\n' +
    '    {"name": "Item or Service", "price": "$X.XX"},\n' +
    '    {"name": "Item or Service", "price": "$X.XX"},\n' +
    '    {"name": "Item or Service", "price": "$X.XX"}\n' +
    '  ],\n' +
    '  "offer": {\n' +
    '    "amount": "e.g. $5 OFF or FREE",\n' +
    '    "item": "short item description, 1-5 words",\n' +
    '    "fine": "1 per visit · with this postcard"\n' +
    '  },\n' +
    '  "heroPrompt": "90-word cinematic commercial food/product photography prompt: camera angle, lighting (backlit/golden hour/studio), subject focus, intentionally empty left 30% for text overlay, warm shallow depth of field, photorealistic, portrait 3:4 aspect, NO text or logos visible"\n' +
    '}';

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 900,
      messages: [
        { role: "system", content: LAYOUT_SYSTEM },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content ?? "";
    let layout: unknown;
    try {
      layout = JSON.parse(content);
    } catch {
      res.status(502).json({ error: "AI returned invalid JSON" });
      return;
    }
    res.json({ layout });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "GPT-4o request failed";
    res.status(502).json({ error: msg });
  }
});

// POST /api/ad-gen/hero — gpt-image-1 hero photo generation
router.post("/ad-gen/hero", async (req, res): Promise<void> => {
  const openai = getOpenAIClient();
  if (!openai) {
    res.status(503).json({ error: "AI not configured" });
    return;
  }

  const { prompt } = req.body as { prompt?: string };
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const appendix =
    " Photorealistic commercial photography. Absolutely NO text, words, numbers, prices, or logos anywhere in the image. " +
    "Intentionally darker/blurred left 30% of the frame reserved for text overlay. Portrait 3:4 crop. High-end print quality.";

  try {
    const imageRes = await openai.images.generate({
      model: "gpt-image-1",
      prompt: prompt + appendix,
      size: "1024x1536",
    });

    const b64 = imageRes.data?.[0]?.b64_json;
    if (!b64) {
      res.status(502).json({ error: "No image returned from AI" });
      return;
    }
    res.json({ imageUrl: "data:image/png;base64," + b64 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Image generation failed";
    res.status(502).json({ error: msg });
  }
});

// POST /api/ad-gen/polish — AI polish pass on the rendered canvas
router.post("/ad-gen/polish", async (req, res): Promise<void> => {
  const openai = getOpenAIClient();
  if (!openai) {
    res.status(503).json({ error: "AI not configured" });
    return;
  }

  const { imageData } = req.body as { imageData?: string };
  if (!imageData || typeof imageData !== "string") {
    res.status(400).json({ error: "imageData is required" });
    return;
  }

  const base64 = imageData.startsWith("data:") ? imageData.split(",")[1] : imageData;
  if (!base64) {
    res.status(400).json({ error: "Invalid imageData" });
    return;
  }

  const buffer = Buffer.from(base64, "base64");
  const file = await toFile(buffer, "ad.png", { type: "image/png" });

  const polishPrompt =
    "Refine this direct-mail advertisement into a premium professionally art-directed postcard. " +
    "Preserve ALL text content, phone numbers, prices, QR codes, branding, and layout exactly as shown. " +
    "Improve visual cohesion, lighting realism, texture blending, shadow harmony, color depth, " +
    "and overall print-ready polish. Do not alter any text or numbers.";

  try {
    const editRes = await openai.images.edit({
      model: "gpt-image-1",
      image: file,
      prompt: polishPrompt,
    });

    const b64 = editRes.data?.[0]?.b64_json;
    if (!b64) {
      res.status(502).json({ error: "No polished image returned" });
      return;
    }
    res.json({ imageUrl: "data:image/png;base64," + b64 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Polish pass failed";
    res.status(502).json({ error: msg });
  }
});

export default router;
