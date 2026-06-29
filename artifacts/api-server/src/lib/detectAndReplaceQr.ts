/**
 * detectAndReplaceQr — detect-and-replace QR pipeline for the at-your-service pilot.
 *
 * Flow (2 AI calls total, no cleanup pass):
 *   1. GPT-4o vision (with 30-second timeout): detect all QR cluster candidates in the
 *      Grok-generated image, pick the one with the largest area.
 *   2. Composite a real scannable QR card centered on the detected cluster bbox.
 *
 * Fallback: any failure (missing key, timeout, zero candidates, composite/decode error)
 * falls back automatically to compositeQrOnto (fixed bottom-right corner approach) so a
 * usable ad with a scannable QR is always produced.
 *
 * Caller contract: imageBuffer must already be resized to print dimensions matching
 * QR_PLACEMENT[spotSize] (i.e. cropToSpotDims must have run first).
 */

import OpenAI from "openai";
import QRCode from "qrcode";
import jsqr from "jsqr";
import { logger } from "./logger";
import {
  compositeQrOnto,
  type CardStyle,
  type SizeKey,
  QR_PLACEMENT,
} from "./compositeQr";

// ── Vision downscale ──────────────────────────────────────────────────────────
// GPT-4o receives a scaled-down copy to reduce token cost.
// We always scale to VISION_MAX_W wide (preserving aspect ratio) so coordinates
// are rescaled by a single uniform factor per dimension.
const VISION_MAX_W = 600;

// ── Sizing parameters (must match qrBboxPipeline.ts) ─────────────────────────
/** Multiplier applied to the detected cluster's larger dimension to size the card. */
const CARD_SCALE = 1.3;
/** Label-inflation guard: clip cluster's larger dim to this fraction of image height
 *  before multiplying, so a long text label beside the QR doesn't over-inflate the card. */
const LABEL_CLIP_FRAC = 0.20;
/** Hard cap: card cannot exceed this fraction of image width. */
const MAX_CARD_W_FRAC = 0.35;
/** Hard cap: card cannot exceed this fraction of image height. */
const MAX_CARD_H_FRAC = 0.25;

// ── Detection timeout ─────────────────────────────────────────────────────────
const DETECT_TIMEOUT_MS = 30_000;

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawCandidate {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: "high" | "medium" | "low";
  notes: string;
}

interface ScaledCandidate extends RawCandidate {
  area: number;
}

interface ClusterFound {
  found: true;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: "high" | "medium" | "low";
  notes: string;
  candidateCount: number;
}
interface ClusterNotFound {
  found: false;
  reason: string;
}
type DetectResult = ClusterFound | ClusterNotFound;

// ── GPT-4o detection prompt ───────────────────────────────────────────────────

const DETECT_SYSTEM =
  "You are a precise computer-vision assistant. " +
  "Return ONLY valid JSON with no markdown, no commentary, no explanation.";

const DETECT_USER =
  "This is a print-ready postcard advertisement. " +
  "It contains a QR code placeholder the designer drew during generation — " +
  "it may look like a partial or stylized QR code with visible module squares " +
  "and finder-pattern corners, possibly with a backing card, border, or text label attached.\n\n" +
  "Find ALL visible QR-related clusters. For EACH cluster, return a bounding box that includes:\n" +
  "• The QR pattern itself (the module grid + finder-square corners)\n" +
  "• Any backing card or colored panel the QR sits on\n" +
  "• Any border or frame around the card\n" +
  "• Any text label directly attached (e.g. 'Scan for menu', 'Visit us online')\n\n" +
  "Return a JSON array — each element:\n" +
  '{"x1":<left px>,"y1":<top px>,"x2":<right px>,"y2":<bottom px>,"confidence":"high"|"medium"|"low","notes":"<brief description>"}\n\n' +
  "Coordinates are in the image you received. If no QR placeholder is visible, return [].";

// ── Cluster detection ─────────────────────────────────────────────────────────

async function detectQrCluster(
  imageBuffer: Buffer,
  imgW: number,
  imgH: number,
  openaiKey: string,
): Promise<DetectResult> {
  const sharpMod = await (import("sharp") as Promise<any>);
  const sharp    = (sharpMod.default ?? sharpMod) as typeof import("sharp");

  // Downsample to vision size (preserve aspect ratio)
  const visionBuf = await sharp(imageBuffer)
    .resize(VISION_MAX_W, undefined, { fit: "inside", kernel: "lanczos3" })
    .jpeg({ quality: 85 })
    .toBuffer();
  const { info: visionInfo } = await sharp(visionBuf).toBuffer({ resolveWithObject: true });
  const visionW = visionInfo.width;
  const visionH = visionInfo.height;
  const scaleX  = imgW / visionW;
  const scaleY  = imgH / visionH;

  const b64 = visionBuf.toString("base64");

  // maxRetries: 0 — the SDK's default of 2 would allow up to 3 × 30 s = 90 s of waiting
  // before throwing.  We need a hard 30-second ceiling so the fallback fires promptly.
  const client = new OpenAI({ apiKey: openaiKey, timeout: DETECT_TIMEOUT_MS, maxRetries: 0 });

  const resp = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: DETECT_SYSTEM },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}`, detail: "high" } },
          { type: "text", text: DETECT_USER },
        ],
      },
    ],
    max_tokens: 512,
  });

  const raw = (resp.choices[0]?.message?.content ?? "").trim();

  let parsed: RawCandidate[];
  try {
    const jsonStart = raw.indexOf("[");
    const jsonEnd   = raw.lastIndexOf("]");
    if (jsonStart === -1 || jsonEnd === -1) throw new Error("no JSON array in response");
    parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as RawCandidate[];
    if (!Array.isArray(parsed)) throw new Error("parsed value is not an array");
  } catch (e) {
    return { found: false, reason: `JSON parse failed: ${String(e)} — raw: ${raw.slice(0, 200)}` };
  }

  if (parsed.length === 0) {
    return { found: false, reason: "no candidates found (empty array)" };
  }

  // Scale back to original image coords + compute area; sort largest first
  const scaled: ScaledCandidate[] = parsed
    .filter((c) => typeof c.x1 === "number" && typeof c.y1 === "number" && typeof c.x2 === "number" && typeof c.y2 === "number")
    .map((c) => ({
      x1: Math.round(c.x1 * scaleX),
      y1: Math.round(c.y1 * scaleY),
      x2: Math.round(c.x2 * scaleX),
      y2: Math.round(c.y2 * scaleY),
      confidence: c.confidence,
      notes: c.notes ?? "",
      area: Math.round((c.x2 - c.x1) * (c.y2 - c.y1) * scaleX * scaleY),
    }))
    .sort((a, b) => b.area - a.area);

  if (scaled.length === 0) {
    return { found: false, reason: "no valid candidates after filtering" };
  }

  const best = scaled[0]!;
  return {
    found: true,
    x1: best.x1,
    y1: best.y1,
    x2: best.x2,
    y2: best.y2,
    confidence: best.confidence,
    notes: best.notes,
    candidateCount: scaled.length,
  };
}

// ── QR composite at detected bbox ─────────────────────────────────────────────

async function compositeQrAtBbox(
  imageBuffer: Buffer,
  cluster: ClusterFound,
  trackingUrl: string,
  imgW: number,
  imgH: number,
  style: CardStyle,
): Promise<Buffer> {
  const sharpMod = await (import("sharp") as Promise<any>);
  const sharp    = (sharpMod.default ?? sharpMod) as typeof import("sharp");

  const clusterW = cluster.x2 - cluster.x1;
  const clusterH = cluster.y2 - cluster.y1;
  const largerDim = Math.max(clusterW, clusterH);

  // Label-inflation guard: clip before multiplying so a long text label extending
  // beside/below the QR doesn't push the card size beyond the actual QR+backing shape.
  const clippedDim = Math.min(largerDim, Math.round(imgH * LABEL_CLIP_FRAC));

  // Hard cap scales with image dimensions; always fires for label-inflated clusters
  // on current postcard resolutions (cap < clip × 1.3).
  const maxCard  = Math.min(Math.round(imgW * MAX_CARD_W_FRAC), Math.round(imgH * MAX_CARD_H_FRAC));
  const cardSize = Math.min(Math.round(clippedDim * CARD_SCALE), maxCard);

  // QR size: fill card with a small margin strip (same formula as CARD_MARGIN in compositeQr.ts)
  const qrSize = Math.max(Math.round(cardSize / (style.marginMultiplier ?? 1.0375)), 64);

  // Center card on detected cluster bbox, clamped to image bounds
  const cx       = Math.round((cluster.x1 + cluster.x2) / 2);
  const cy       = Math.round((cluster.y1 + cluster.y2) / 2);
  const cardLeft = Math.min(Math.max(0, Math.round(cx - cardSize / 2)), imgW - cardSize);
  const cardTop  = Math.min(Math.max(0, Math.round(cy - cardSize / 2)), imgH - cardSize);
  const qrOffset = Math.floor((cardSize - qrSize) / 2);

  // ── 1. Generate QR PNG ──────────────────────────────────────────────────────
  const qrPng: Buffer = await QRCode.toBuffer(trackingUrl, {
    errorCorrectionLevel: "H",
    type:   "png",
    width:  qrSize,
    margin: 4,
    color:  { dark: "#000000", light: "#ffffff" },
  });

  // ── 2. Build SVG backing card ───────────────────────────────────────────────
  const sw       = style.borderWidth;
  const hasBorder = sw > 0;
  const half     = hasBorder ? sw / 2 : 0;
  const inset    = hasBorder ? sw : 0;
  const effectiveCornerRadius = style.circularCard
    ? Math.floor(cardSize / 2)
    : style.cornerRadius;
  const strokeAttrs = hasBorder
    ? ` stroke="${style.border}" stroke-width="${sw}"${style.dashPattern ? ` stroke-dasharray="${style.dashPattern.join(" ")}"` : ""}`
    : "";
  const cardSvg = Buffer.from(
    `<svg width="${cardSize}" height="${cardSize}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="${half}" y="${half}" width="${cardSize - inset}" height="${cardSize - inset}" ` +
    `rx="${effectiveCornerRadius}" ry="${effectiveCornerRadius}" fill="${style.fill}"${strokeAttrs}/>` +
    `</svg>`,
  );

  // ── 3. Composite QR into card ───────────────────────────────────────────────
  const cardBase   = await sharp(cardSvg).png().toBuffer();
  const cardWithQr = await sharp(cardBase)
    .composite([{ input: qrPng, left: qrOffset, top: qrOffset }])
    .png()
    .toBuffer();

  // ── 4. Composite card onto ad ───────────────────────────────────────────────
  const compositedBuf: Buffer = await sharp(imageBuffer)
    .composite([{ input: cardWithQr, left: cardLeft, top: cardTop }])
    .jpeg({ quality: 98, chromaSubsampling: "4:4:4" })
    .toBuffer();

  // ── 5. Decode-verify ────────────────────────────────────────────────────────
  const qrAbsLeft = cardLeft + qrOffset;
  const qrAbsTop  = cardTop  + qrOffset;
  const { data: qrPixels, info: qrInfo } = await sharp(compositedBuf)
    .extract({ left: qrAbsLeft, top: qrAbsTop, width: qrSize, height: qrSize })
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const decoded = jsqr(new Uint8ClampedArray(qrPixels), qrInfo.width, qrInfo.height);
  if (!decoded) {
    throw new Error(
      `detectAndReplaceQr: QR decode verification failed. ` +
      `cardLeft=${cardLeft} cardTop=${cardTop} qrSize=${qrSize}`,
    );
  }
  if (decoded.data !== trackingUrl) {
    throw new Error(
      `detectAndReplaceQr: QR content mismatch — ` +
      `expected "${trackingUrl}" got "${decoded.data}"`,
    );
  }

  return compositedBuf;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect the QR placeholder cluster in imageBuffer, then composite a real scannable
 * QR card centered on the detected bbox.
 *
 * On any failure (missing key, timeout, no candidates, composite error, decode failure)
 * falls back to compositeQrOnto (fixed bottom-right corner) and always returns a usable buffer.
 *
 * @param imageBuffer  JPEG buffer already resized to the print dimensions for spotSize
 * @param trackingUrl  Full URL the QR should encode
 * @param spotSize     Spot size key — used for QR sizing caps and the fallback compositor
 * @param style        Card visual style (from TEMPLATE_QR_STYLES["at-your-service"])
 */
export async function detectAndReplaceQr(
  imageBuffer: Buffer,
  trackingUrl: string,
  spotSize: SizeKey,
  style: CardStyle,
): Promise<Buffer> {
  const openaiKey = process.env.OPENAI_API_KEY ?? "";
  if (!openaiKey) {
    logger.warn("detectAndReplaceQr: OPENAI_API_KEY not set — falling back to fixed-corner compositing");
    return compositeQrOnto(imageBuffer, trackingUrl, spotSize, style);
  }

  const spec = QR_PLACEMENT[spotSize] ?? QR_PLACEMENT.xl;
  const { imgW, imgH } = spec;

  // ── Detection ────────────────────────────────────────────────────────────────
  let cluster: DetectResult;
  try {
    cluster = await detectQrCluster(imageBuffer, imgW, imgH, openaiKey);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn({ reason, spotSize }, "detectAndReplaceQr: detection threw — falling back to fixed-corner");
    return compositeQrOnto(imageBuffer, trackingUrl, spotSize, style);
  }

  if (!cluster.found) {
    logger.warn(
      { reason: cluster.reason, spotSize },
      "detectAndReplaceQr: no cluster detected — falling back to fixed-corner compositing",
    );
    return compositeQrOnto(imageBuffer, trackingUrl, spotSize, style);
  }

  // Detection succeeded — log the result
  const cW = cluster.x2 - cluster.x1;
  const cH = cluster.y2 - cluster.y1;
  logger.info(
    {
      spotSize,
      candidateCount: cluster.candidateCount,
      chosen: { x1: cluster.x1, y1: cluster.y1, x2: cluster.x2, y2: cluster.y2, w: cW, h: cH },
      confidence: cluster.confidence,
      notes: cluster.notes,
    },
    "detectAndReplaceQr: cluster detected — compositing real QR",
  );

  // ── Composite ────────────────────────────────────────────────────────────────
  try {
    const result = await compositeQrAtBbox(
      imageBuffer, cluster, trackingUrl, imgW, imgH, style,
    );

    const largerDim  = Math.max(cW, cH);
    const clippedDim = Math.min(largerDim, Math.round(imgH * LABEL_CLIP_FRAC));
    const maxCard    = Math.min(Math.round(imgW * MAX_CARD_W_FRAC), Math.round(imgH * MAX_CARD_H_FRAC));
    const cardSize   = Math.min(Math.round(clippedDim * CARD_SCALE), maxCard);
    const coverage   = Math.round((cardSize / largerDim) * 100);

    logger.info(
      { spotSize, cardSize, largerDim, clippedDim, coverage: `${coverage}%`, confidence: cluster.confidence },
      "detectAndReplaceQr: composite OK — QR verified",
    );
    return result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn({ reason, spotSize }, "detectAndReplaceQr: composite/verify failed — falling back to fixed-corner");
    return compositeQrOnto(imageBuffer, trackingUrl, spotSize, style);
  }
}
