import { Router, type IRouter } from "express";
import OpenAI from "openai";

const router: IRouter = Router();

const STYLE_MAP: Record<string, string> = {
  rustic: "rustic artisan with warm parchment tones, brush stroke textures, hand-lettered typography",
  dark:   "dark cinematic with dramatic lighting, deep shadows, bold contrast",
  bold:   "editorial magazine with clean white panels and strong Playfair Display typography",
  luxury: "luxury elegant with gold accents, double border frames, refined centered layout",
  bright: "retro poster with bold color bands, dynamic skewed elements, pill-shaped accents",
  clean:  "neon night with glowing typography and electric accent colors",
};

function getOpenAIClient(): OpenAI | null {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

router.post("/ai-upgrade", async (req, res): Promise<void> => {
  const openai = getOpenAIClient();
  if (!openai) {
    res.status(500).json({ error: "OpenAI integration not configured on server." });
    return;
  }

  const {
    photoUrl, bizName, industry, tagline,
    menu, offer, style,
  } = req.body ?? {};

  if (!photoUrl || !bizName) {
    res.status(400).json({ error: "photoUrl and bizName are required." });
    return;
  }

  const styleDesc = STYLE_MAP[style as string] ?? "professional print advertisement";
  const menuStr = Array.isArray(menu) && menu.length ? (menu as string[]).join(", ") : "various items";
  const offerStr = (offer as string) || "";

  const imageContent: OpenAI.Chat.ChatCompletionContentPart = (photoUrl as string).startsWith("data:")
    ? { type: "image_url", image_url: { url: photoUrl as string } }
    : { type: "image_url", image_url: { url: photoUrl as string, detail: "high" } };

  const visionInstruction = `You are a professional print ad designer. I am showing you a photo that will be the hero image for a local business advertisement. Analyze this photo and describe in 2-3 sentences the subject matter, lighting quality, composition, and mood. Then write a precise image generation prompt of 150-200 words that will create a stunning print advertisement using this photo's content and style as the hero visual.

The ad is for: ${bizName} — ${industry}
Tagline: ${tagline}
Style direction: ${styleDesc}

The image prompt must:
- Incorporate the photo subject as the central hero image, describing it specifically based on what you see
- Include artistic typography requirements: mix font sizes dramatically, some words much larger than others, rotate or angle text elements slightly, layer text at different depths, use script or cursive for the tagline
- Describe brush stroke textures, starburst lines, and ornamental decorative elements
- NOT include any phone numbers or street addresses
- Leave the bottom 18 percent of the image slightly darkened for a contact info overlay to be added later
- Be specific about colors, lighting, and composition
- Make it look like a $500 professional design

Return ONLY the image prompt text. No explanation, no preamble, nothing else.`;

  let enhancedPrompt: string;
  try {
    const visionRes = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: [imageContent, { type: "text", text: visionInstruction }],
      }],
    });

    enhancedPrompt = visionRes.choices?.[0]?.message?.content?.trim() ?? "";
    if (!enhancedPrompt) {
      res.status(502).json({ error: "No prompt returned from vision model. Please try again." });
      return;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Vision analysis failed.";
    res.status(502).json({ error: msg });
    return;
  }

  const businessPrompt = `Create a STUNNING professional print advertisement for a local business. This should look like an award-winning direct mail postcard ad — NOT a generic template.

BUSINESS: "${bizName}" — ${industry}
Tagline: "${tagline}"
Services/Menu: ${menuStr}${offerStr ? `\nSpecial Offer: "${offerStr}" — must appear in a dashed-border coupon box with large bold typography` : ""}

VISUAL STYLE: ${styleDesc}

The business name must appear with ARTISTIC DYNAMIC typography — mix font sizes dramatically, angle text elements, layer text at different depths, use script or cursive for the tagline. Include decorative brush strokes, paint textures, starburst lines, and ornamental dividers. Feature the menu items as a beautiful list with circular checkmarks or decorative bullets. Leave the bottom 18% slightly darkened for contact info overlay (DO NOT include phone number or address — these will be added as HTML text on top). Portrait orientation, 4:5 aspect ratio. Make it look like it cost $500 to design.`;

  try {
    const imageRes = await openai.images.generate({
      model: "gpt-image-1",
      prompt: enhancedPrompt + "\n\n" + businessPrompt,
      size: "1024x1536",
    });

    const b64 = imageRes.data?.[0]?.b64_json;
    if (!b64) {
      res.status(502).json({ error: "No image returned from image model. Please try again." });
      return;
    }

    res.json({ imageUrl: `data:image/png;base64,${b64}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Image generation failed.";
    res.status(502).json({ error: msg });
  }
});

export default router;
