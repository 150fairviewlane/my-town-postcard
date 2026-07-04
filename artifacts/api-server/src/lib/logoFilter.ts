const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Current xAI multimodal model (grok-2-vision-1212 was retired)
const XAI_VISION_MODEL = "grok-4.3";

export type FilterResult =
  | { pass: true; notes: string }
  | { pass: false; needsReview: boolean; notes: string };

/** Download an image URL, returning its buffer and mime type. */
async function downloadImage(url: string): Promise<{ buf: Buffer; mime: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") ?? "";
    const isImage =
      ct.startsWith("image/") ||
      /\.(png|jpg|jpeg|gif|webp|ico|svg)$/i.test(url);
    if (!isImage) return null;
    const ab = await resp.arrayBuffer();
    return { buf: Buffer.from(ab), mime: ct.split(";")[0]!.trim() || "image/png" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Stage 1: dimensions + aspect-ratio check using sharp. Returns null on pass, string reason on fail. */
async function checkDimensions(buf: Buffer): Promise<string | null> {
  let sharpModule: typeof import("sharp");
  try {
    sharpModule = (await import("sharp")).default as unknown as typeof import("sharp");
  } catch {
    return null;
  }

  let meta: import("sharp").Metadata;
  try {
    meta = await (sharpModule as unknown as (buf: Buffer) => import("sharp").Sharp)(buf).metadata();
  } catch {
    return "Could not parse image metadata";
  }

  const { width = 0, height = 0 } = meta;
  if (width < 100 || height < 100) {
    return `Too small (${width}×${height}px — minimum 100×100)`;
  }
  const ratio = width / height;
  if (ratio > 4 || ratio < 0.25) {
    return `Extreme aspect ratio (${ratio.toFixed(2)}:1) — likely a banner not a logo`;
  }
  return null;
}

/**
 * Stage 2: xAI vision logo quality check.
 * Passes the original image URL directly — no base64 encoding needed.
 * Retries once on API/network errors before returning needsReview=true.
 */
async function visionCheck(
  imageUrl: string,
  apiKey: string,
): Promise<{ pass: boolean; needsReview: boolean; notes: string }> {
  const PROMPT =
    "You are a quality reviewer for a local print advertising company.\n" +
    "Examine this image carefully. Is it a clean, recognizable business logo " +
    "that would look good on a printed postcard (white or light background, not a photo, " +
    "not a full-page banner, not a screenshot, not a watermark)?\n" +
    "Reply with exactly: PASS or FAIL\n" +
    "Then on the same line after a dash, give a brief reason (max 15 words).";

  const body = JSON.stringify({
    model: XAI_VISION_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
    max_tokens: 60,
    temperature: 0,
  });

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body,
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        if (attempt < 2) continue; // retry once
        // Persistent API error — not a quality rejection, needs human review
        return {
          pass: false,
          needsReview: true,
          notes: `Vision API error ${resp.status}: ${errText.slice(0, 120)}`,
        };
      }

      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data?.choices?.[0]?.message?.content?.trim() ?? "";
      const pass = text.toUpperCase().startsWith("PASS");
      const dashIdx = text.indexOf("-");
      const notes = dashIdx >= 0 ? text.slice(dashIdx + 1).trim() : text.slice(4).trim();
      return {
        pass,
        needsReview: false,
        notes: notes || (pass ? "Looks good" : "Rejected by vision model"),
      };
    } catch (err) {
      if (attempt < 2) continue; // retry once on network error
      return {
        pass: false,
        needsReview: true,
        notes: `Vision check failed: ${String(err).slice(0, 80)}`,
      };
    }
  }

  // Should be unreachable
  return { pass: false, needsReview: true, notes: "Vision check: unexpected exit" };
}

/**
 * Filter a logo URL through Stage 1 (dimensions) and Stage 2 (vision).
 * Returns a FilterResult indicating pass/fail + notes.
 * On vision API errors, returns needsReview=true rather than treating it as a rejection.
 */
export async function filterLogo(logoUrl: string): Promise<FilterResult> {
  const apiKey = process.env.XAI_API_KEY;

  const downloaded = await downloadImage(logoUrl);
  if (!downloaded) {
    return { pass: false, needsReview: false, notes: "Could not download logo image" };
  }

  const { buf } = downloaded;

  const dimFail = await checkDimensions(buf);
  if (dimFail) {
    return { pass: false, needsReview: false, notes: dimFail };
  }

  if (!apiKey) {
    return { pass: true, notes: "Dimensions OK (vision check skipped — XAI_API_KEY not set)" };
  }

  // xAI rejects plain http:// image URLs — upgrade to https before calling vision API
  const safeUrl = logoUrl.replace(/^http:\/\//i, "https://");
  const { pass, needsReview, notes } = await visionCheck(safeUrl, apiKey);
  if (!pass) {
    return { pass: false, needsReview, notes };
  }
  return { pass: true, notes };
}
