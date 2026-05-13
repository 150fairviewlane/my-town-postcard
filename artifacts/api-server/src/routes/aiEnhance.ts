import { Router, type IRouter } from "express";

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

router.post("/ai-enhance", async (req, res): Promise<void> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "OPENAI_API_KEY is not configured on the server." });
    return;
  }

  const { photoUrl, bizName, industry, style, color, tagline } = req.body ?? {};

  if (!photoUrl || !bizName) {
    res.status(400).json({ error: "photoUrl and bizName are required." });
    return;
  }

  const atmosphere = STYLE_ATMOSPHERE[style as string] ?? "professional print advertisement atmosphere";

  const imageContent = (photoUrl as string).startsWith("data:")
    ? { type: "image_url", image_url: { url: photoUrl } }
    : { type: "image_url", image_url: { url: photoUrl, detail: "high" } };

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
    const visionRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: [imageContent, { type: "text", text: visionInstruction }],
        }],
      }),
    });

    if (!visionRes.ok) {
      const e = await visionRes.json().catch(() => ({})) as { error?: { message?: string } };
      res.status(502).json({ error: e?.error?.message ?? `GPT-4o error ${visionRes.status}` });
      return;
    }

    const visionData = await visionRes.json() as { choices?: { message?: { content?: string } }[] };
    enhancedPrompt = visionData.choices?.[0]?.message?.content?.trim() ?? "";
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
    const dalleRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: enhancedPrompt + "\n\n" + DALLE_APPEND,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "url",
      }),
    });

    if (!dalleRes.ok) {
      const e = await dalleRes.json().catch(() => ({})) as { error?: { message?: string } };
      res.status(502).json({ error: e?.error?.message ?? `DALL-E error ${dalleRes.status}` });
      return;
    }

    const dalleData = await dalleRes.json() as { data?: { url?: string }[] };
    const backgroundUrl = dalleData.data?.[0]?.url;
    if (!backgroundUrl) {
      res.status(502).json({ error: "No image returned from DALL-E. Please try again." });
      return;
    }

    res.json({ backgroundUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "DALL-E request failed.";
    res.status(502).json({ error: msg });
  }
});

export default router;
