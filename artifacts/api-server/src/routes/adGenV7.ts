import { Router, type IRouter } from "express";
import OpenAI, { toFile } from "openai";
import { z } from "zod";

const router: IRouter = Router();

function getOpenAIClient(): OpenAI | null {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const LayoutRequestSchema = z.object({
  industry: z.string().min(1, "industry is required"),
  bizLine1: z.string().min(1, "bizLine1 is required"),
  bizLine2: z.string().optional().default(""),
  tagline: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  address: z.string().optional().default(""),
  city: z.string().optional().default(""),
  menu: z.array(z.string()).optional().default([]),
  offerAmount: z.string().optional().default(""),
  offerItem: z.string().optional().default(""),
  offerFine: z.string().optional().default(""),
  accentColor: z.string().optional().default("#C8541A"),
});

const MenuItemSchema = z.object({
  name: z.string(),
  price: z.string().optional().default(""),
});

const LayoutResponseSchema = z.object({
  headline1: z.string().min(1),
  headline2: z.string().optional().default(""),
  tagline: z.string().optional().default(""),
  palette: z
    .object({
      accent: z.string().optional().default("#C8541A"),
      dark: z.string().optional().default("#1C1B1A"),
    })
    .optional()
    .default({}),
  menu: z.array(MenuItemSchema).optional().default([]),
  offer: z
    .object({
      amount: z.string().optional().default(""),
      item: z.string().optional().default(""),
      fine: z.string().optional().default(""),
    })
    .optional()
    .default({}),
  heroPrompt: z.string().optional().default(""),
});

const HeroRequestSchema = z.object({
  prompt: z.string().min(1, "prompt is required"),
});

const PolishRequestSchema = z.object({
  imageData: z.string().min(1, "imageData is required"),
});

const LAYOUT_SYSTEM =
  "You are an expert print advertising art director for local businesses. " +
  "Return ONLY valid JSON — no markdown fences, no extra text.";

// POST /api/ad-gen/layout — GPT-4o enriches ad copy + generates hero prompt
router.post("/ad-gen/layout", async (req, res): Promise<void> => {
  const parsed = LayoutRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid request" });
    return;
  }

  const openai = getOpenAIClient();
  if (!openai) {
    res.status(503).json({ error: "AI not configured" });
    return;
  }

  const { industry, bizLine1, bizLine2, tagline, phone, address, city, menu,
          offerAmount, offerItem, offerFine, accentColor } = parsed.data;

  const menuStr = menu.filter(Boolean).join(", ");

  const prompt =
    "Generate layout JSON for a premium local direct-mail postcard ad.\n\n" +
    "Business: " + bizLine1 + (bizLine2 ? " / " + bizLine2 : "") + "\n" +
    "Industry: " + industry + "\n" +
    "Tagline input: " + (tagline || "(generate a compelling, specific tagline under 35 chars)") + "\n" +
    "Phone: " + phone + "\n" +
    "Address: " + address + (city ? ", " + city : "") + "\n" +
    "Menu/Services: " + (menuStr || "(generate 4 relevant items with prices)") + "\n" +
    "Special Offer: " + (offerAmount || "(generate a compelling offer)") + " " + offerItem + "\n" +
    "Fine Print: " + (offerFine || "1 per visit · with this postcard") + "\n" +
    "Accent Color: " + accentColor + "\n\n" +
    "Return this exact JSON structure:\n" +
    "{\n" +
    '  "headline1": "BUSINESS NAME in ALL CAPS, max 20 chars per word",\n' +
    '  "tagline": "compelling tagline under 35 chars — this is the ONLY line that appears below the business name",\n' +
    '  "menu": [\n' +
    '    {"name": "Item or Service", "price": "$X.XX"},\n' +
    '    {"name": "Item or Service", "price": "$X.XX"},\n' +
    '    {"name": "Item or Service", "price": "$X.XX"},\n' +
    '    {"name": "Item or Service", "price": "$X.XX"}\n' +
    "  ],\n" +
    '  "offer": {\n' +
    '    "amount": "e.g. $5 OFF or FREE",\n' +
    '    "item": "short item description, 1-5 words",\n' +
    '    "fine": "1 per visit · with this postcard"\n' +
    "  },\n" +
    '  "palette": {\n' +
    '    "accent": "#hex — primary brand accent color that complements the industry and personality",\n' +
    '    "dark": "#hex — rich dark text/background color (near-black or very dark brown)"\n' +
    "  },\n" +
    '  "heroPrompt": "90-word cinematic commercial food/product photography prompt: camera angle, lighting, subject focus, intentionally empty left 30% for text overlay, warm shallow depth of field, photorealistic, portrait 3:4 aspect, NO text or logos visible"\n' +
    "}";

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
    let rawLayout: unknown;
    try {
      rawLayout = JSON.parse(content);
    } catch {
      res.status(502).json({ error: "AI returned invalid JSON" });
      return;
    }

    // Validate the AI response against our schema
    const layoutParsed = LayoutResponseSchema.safeParse(rawLayout);
    if (!layoutParsed.success) {
      req.log?.warn({ issues: layoutParsed.error.errors }, "AI layout response failed schema validation");
      // Return raw content as-is with a warning — don't block the user
      res.json({ layout: rawLayout, warning: "AI response had unexpected shape" });
      return;
    }

    res.json({ layout: layoutParsed.data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "GPT-4o request failed";
    res.status(502).json({ error: msg });
  }
});

// POST /api/ad-gen/hero — gpt-image-1 hero photo generation
router.post("/ad-gen/hero", async (req, res): Promise<void> => {
  const parsed = HeroRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid request" });
    return;
  }

  const openai = getOpenAIClient();
  if (!openai) {
    res.status(503).json({ error: "AI not configured" });
    return;
  }

  const appendix =
    " Photorealistic commercial photography. Absolutely NO text, words, numbers, prices, or logos anywhere in the image. " +
    "Intentionally darker/blurred left 30% of the frame reserved for text overlay. Portrait 3:4 crop. High-end print quality.";

  try {
    const imageRes = await openai.images.generate({
      model: "gpt-image-1",
      prompt: parsed.data.prompt + appendix,
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
  const parsed = PolishRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid request" });
    return;
  }

  const openai = getOpenAIClient();
  if (!openai) {
    res.status(503).json({ error: "AI not configured" });
    return;
  }

  const { imageData } = parsed.data;
  const base64 = imageData.startsWith("data:") ? imageData.split(",")[1] : imageData;
  if (!base64) {
    res.status(400).json({ error: "Invalid imageData format" });
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
