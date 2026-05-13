import { Router, type IRouter } from "express";
import OpenAI from "openai";

const router: IRouter = Router();

const STYLE_ATMOSPHERE: Record<string, string> = {
  rustic: "warm rustic parchment atmosphere with brush stroke paint textures, earthy ochre and burnt sienna tones, vintage decorative ornamental borders, warm golden lighting that glows from behind",
  dark:   "dark cinematic atmosphere with deep dramatic shadows, rich vignette edges, subtle crimson spotlight glow, film noir depth and mystery",
  bold:   "editorial magazine atmosphere with clean photographic clarity, crisp white negative space zones in the lower half, bold architectural composition",
  luxury: "luxury dark atmosphere with rich deep blacks, subtle warm gold light rays, elegant bokeh depth of field, high-end product photography feel",
  bright: "retro poster atmosphere with vibrant saturated colors, bold graphic paint strokes across the frame, energetic carnival poster energy",
  clean:  "neon night atmosphere with deep dark background, electric accent color light bloom, subtle chromatic aberration, cinematic urban night photography",
};

const DALLE_APPEND = "Photorealistic commercial photography style. Shot on professional camera with natural lighting. No AI-rendered or illustrated look. No painterly, artistic, or cartoon elements. Hyper-realistic food photography or product photography aesthetic — the kind used in premium restaurant menus or national advertising campaigns. Shallow depth of field with beautiful bokeh where appropriate. Rich, true-to-life colors with professional color grading. Abstract atmospheric background only. Absolutely no text, letters, numbers, words, signs, menus, or readable content of any kind anywhere in the image.";

function getOpenAIClient(): OpenAI | null {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

router.post("/ai-enhance", async (req, res): Promise<void> => {
  const openai = getOpenAIClient();
  if (!openai) {
    res.status(500).json({ error: "OpenAI integration not configured on server." });
    return;
  }

  const { photoUrl, bizName, industry, style, color, tagline } = req.body ?? {};

  if (!photoUrl || !bizName) {
    res.status(400).json({ error: "photoUrl and bizName are required." });
    return;
  }

  const atmosphere = STYLE_ATMOSPHERE[style as string] ?? "professional print advertisement atmosphere";

  const imageContent: OpenAI.Chat.ChatCompletionContentPart = (photoUrl as string).startsWith("data:")
    ? { type: "image_url", image_url: { url: photoUrl as string } }
    : { type: "image_url", image_url: { url: photoUrl as string, detail: "high" } };

  const visionInstruction = `You are an expert art director for premium print advertising. I am showing you a hero photograph that will be used in a local business advertisement.

Analyze this photo carefully and return a single precise DALL-E 3 image generation prompt of exactly 120-150 words.

The prompt must describe ONLY a background atmospheric layer — NOT a complete advertisement. It will be used as the background layer behind HTML text overlays, so it must NOT contain any text, business names, phone numbers, prices, menus, or coupon boxes.

The background should:

- Extend and enhance the visual atmosphere of the provided photo
- Apply this style atmosphere: ${atmosphere}
- Use color tones harmonizing with: ${color}
- Be appropriate for a ${industry} business
- Include decorative atmospheric elements matching the style (brush strokes, light rays, bokeh, textures, ornamental borders — depending on style)
- Have the bottom 20 percent of the image darkened for text legibility
- Be portrait orientation 4 by 5 ratio
- Look like it was shot by a professional commercial photographer for a $500 print advertisement — photorealistic, not illustrated or AI-rendered
- Use photorealistic commercial photography language in the prompt (lens type, lighting setup, camera angle, depth of field) to ensure DALL-E renders realistically

Do NOT include: any text, words, numbers, prices, phone numbers, business names, menu items, or coupon shapes.
Return ONLY the DALL-E prompt. No explanation, no preamble.`;

  let enhancedPrompt: string;
  try {
    const visionRes = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 600,
      messages: [{
        role: "user",
        content: [imageContent, { type: "text", text: visionInstruction }],
      }],
    });

    enhancedPrompt = visionRes.choices?.[0]?.message?.content?.trim() ?? "";
    if (!enhancedPrompt) {
      res.status(502).json({ error: "No prompt returned from GPT-4o. Please try again." });
      return;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "GPT-4o vision request failed.";
    res.status(502).json({ error: msg });
    return;
  }

  try {
    const imageRes = await openai.images.generate({
      model: "gpt-image-1",
      prompt: enhancedPrompt + "\n\n" + DALLE_APPEND,
      size: "1024x1536",
    });

    const b64 = imageRes.data?.[0]?.b64_json;
    if (!b64) {
      res.status(502).json({ error: "No image returned from image model. Please try again." });
      return;
    }

    res.json({ backgroundUrl: `data:image/png;base64,${b64}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Image generation failed.";
    res.status(502).json({ error: msg });
  }
});

export default router;
