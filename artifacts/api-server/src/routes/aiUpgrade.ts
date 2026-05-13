import { Router, type IRouter } from "express";

const router: IRouter = Router();

const STYLE_MAP: Record<string, string> = {
  rustic: "rustic artisan with warm parchment tones, brush stroke textures, hand-lettered typography",
  dark:   "dark cinematic with dramatic lighting, deep shadows, bold contrast",
  bold:   "editorial magazine with clean white panels and strong Playfair Display typography",
  luxury: "luxury elegant with gold accents, double border frames, refined centered layout",
  bright: "retro poster with bold color bands, dynamic skewed elements, pill-shaped accents",
  clean:  "neon night with glowing typography and electric accent colors",
};

router.post("/ai-upgrade", async (req, res): Promise<void> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "OpenAI API key not configured on server." });
    return;
  }

  const {
    photoUrl, bizName, industry, tagline,
    menu, offer, style, phone, city, address,
  } = req.body ?? {};

  if (!photoUrl || !bizName) {
    res.status(400).json({ error: "photoUrl and bizName are required." });
    return;
  }

  const styleDesc = STYLE_MAP[style as string] ?? "professional print advertisement";
  const menuStr = Array.isArray(menu) && menu.length ? (menu as string[]).join(", ") : "various items";
  const offerStr = (offer as string) || "";

  const imageContent = (photoUrl as string).startsWith("data:")
    ? { type: "image_url", image_url: { url: photoUrl } }
    : { type: "image_url", image_url: { url: photoUrl, detail: "high" } };

  const visionInstruction = `You are a professional print ad designer. I am showing you a photo that will be the hero image for a local business advertisement. Analyze this photo and describe in 2-3 sentences the subject matter, lighting quality, composition, and mood. Then write a precise DALL-E 3 image generation prompt of 150-200 words that will create a stunning print advertisement using this photo's content and style as the hero visual.

The ad is for: ${bizName} — ${industry}
Tagline: ${tagline}
Style direction: ${styleDesc}

The DALL-E prompt must:
- Incorporate the photo subject as the central hero image, describing it specifically based on what you see
- Include artistic typography requirements: mix font sizes dramatically, some words much larger than others, rotate or angle text elements slightly, layer text at different depths, use script or cursive for the tagline
- Describe brush stroke textures, starburst lines, and ornamental decorative elements
- NOT include any phone numbers or street addresses
- Leave the bottom 18 percent of the image slightly darkened for a contact info overlay to be added later
- Be specific about colors, lighting, and composition
- Make it look like a $500 professional design

Return ONLY the DALL-E prompt text. No explanation, no preamble, nothing else.`;

  let enhancedPrompt: string;
  try {
    const visionRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 800,
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
    const msg = err instanceof Error ? err.message : "GPT-4o request failed.";
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
    const dalleRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: enhancedPrompt + "\n\n" + businessPrompt,
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
    const imageUrl = dalleData.data?.[0]?.url;
    if (!imageUrl) {
      res.status(502).json({ error: "No image returned from DALL-E. Please try again." });
      return;
    }

    res.json({ imageUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "DALL-E request failed.";
    res.status(502).json({ error: msg });
  }
});

export default router;
