const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type FilterResult =
  | { pass: true; dataUrl: string; notes: string }
  | { pass: false; notes: string };

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
  if (width < 80 || height < 80) {
    return `Too small (${width}×${height}px — minimum 80×80)`;
  }
  const ratio = width / height;
  if (ratio > 6 || ratio < 0.17) {
    return `Extreme aspect ratio (${ratio.toFixed(2)}:1) — likely a banner not a logo`;
  }
  return null;
}

/** Stage 2: xAI grok-2-vision-1212 logo quality check. Returns { pass, notes }. */
async function visionCheck(
  dataUrl: string,
  apiKey: string,
): Promise<{ pass: boolean; notes: string }> {
  const PROMPT =
    "You are a quality reviewer for a local print advertising company.\n" +
    "Examine this image carefully. Is it a clean, recognizable business logo " +
    "that would look good on a printed postcard (white or light background, not a photo, " +
    "not a full-page banner, not a screenshot, not a watermark)?\n" +
    "Reply with exactly: PASS or FAIL\n" +
    "Then on the same line after a dash, give a brief reason (max 15 words).";

  const body = {
    model: "grok-2-vision-1212",
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
    max_tokens: 60,
    temperature: 0,
  };

  try {
    const resp = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      return { pass: false, notes: `Vision API error ${resp.status}` };
    }
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data?.choices?.[0]?.message?.content?.trim() ?? "";
    const pass = text.toUpperCase().startsWith("PASS");
    const dashIdx = text.indexOf("-");
    const notes = dashIdx >= 0 ? text.slice(dashIdx + 1).trim() : text.slice(4).trim();
    return { pass, notes: notes || (pass ? "Looks good" : "Rejected by vision model") };
  } catch (err) {
    return { pass: false, notes: `Vision check failed: ${String(err).slice(0, 80)}` };
  }
}

/**
 * Filter a logo URL through Stage 1 (dimensions) and Stage 2 (vision).
 * Returns a FilterResult indicating pass/fail + notes.
 */
export async function filterLogo(logoUrl: string): Promise<FilterResult> {
  const apiKey = process.env.XAI_API_KEY;

  const downloaded = await downloadImage(logoUrl);
  if (!downloaded) {
    return { pass: false, notes: "Could not download logo image" };
  }

  const { buf, mime } = downloaded;

  const dimFail = await checkDimensions(buf);
  if (dimFail) {
    return { pass: false, notes: dimFail };
  }

  const b64 = buf.toString("base64");
  const safeMime = mime || "image/png";
  const dataUrl = `data:${safeMime};base64,${b64}`;

  if (!apiKey) {
    return { pass: true, dataUrl, notes: "Dimensions OK (vision check skipped — XAI_API_KEY not set)" };
  }

  const { pass, notes } = await visionCheck(dataUrl, apiKey);
  if (!pass) {
    return { pass: false, notes };
  }
  return { pass: true, dataUrl, notes };
}
