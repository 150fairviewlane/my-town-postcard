/**
 * locateQrCode.ts — Magenta-marker QR detection and replacement for Grok-generated ads.
 *
 * Pipeline:
 *   1. The reference template images each have a solid magenta (#FF00FF) square
 *      stamped over the QR placeholder area.
 *   2. Grok sees the reference and faithfully reproduces the magenta square in
 *      the generated ad at the same relative position.
 *   3. We scan the generated ad's raw RGBA pixels for magenta-range values,
 *      compute the bounding box, blur that region (erasing Grok's fake QR and
 *      the magenta marker), then composite a real scannable QR card centred there.
 *   4. If no magenta is detected (fallback: Grok forgot the marker), we fall
 *      back to compositeQrOnto at the fixed bottom-right corner.
 *
 * Detection thresholds — tuned to survive JPEG q=85 compression:
 *   R ≥ 180,  G ≤ 80,  B ≥ 180
 * These tolerate ±30px drift from the pure #FF00FF value while excluding all
 * warm tones, cool blues, and neutrals that appear in real ad artwork.
 */

import QRCode from "qrcode";
import { logger } from "./logger";
import {
  compositeQrOnto,
  type CardStyle,
  type SizeKey,
  QR_PLACEMENT,
} from "./compositeQr";
import jsqr from "jsqr";

// ── Magenta detection thresholds ───────────────────────────────────────────────
const MAG_R_MIN = 180;
const MAG_G_MAX = 80;
const MAG_B_MIN = 180;

// Minimum matching pixels before we trust the detection
const MIN_PIXEL_COUNT = 100;

// Blur region is this many times the detected marker size on each side,
// covering the full QR including quiet zone.
const BLUR_PAD_MULTIPLIER = 1.5;

// Sharp blur sigma — strong enough to erase any QR pattern
const BLUR_SIGMA = 18;

// Card sizing constants (mirrors compositeQr.ts)
const CARD_MARGIN     = 1.0375;
const MAX_CARD_W_FRAC = 0.35;
const MAX_CARD_H_FRAC = 0.30;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface QrLocation {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Detection ──────────────────────────────────────────────────────────────────

/**
 * Locate the magenta marker square in the given image buffer using raw pixel scan.
 * Returns the axis-aligned bounding box of all magenta pixels, or null.
 */
export async function locateQrCode(imageBuffer: Buffer): Promise<QrLocation | null> {
  const sharpMod = await (import("sharp") as Promise<any>);
  const sharp    = (sharpMod.default ?? sharpMod) as typeof import("sharp");

  const { data, info } = await sharp(imageBuffer)
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let matchCount = 0;
  const ch = info.channels; // 4 (RGBA)

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * ch;
      const r = (data as Buffer)[i]!;
      const g = (data as Buffer)[i + 1]!;
      const b = (data as Buffer)[i + 2]!;
      if (r >= MAG_R_MIN && g <= MAG_G_MAX && b >= MAG_B_MIN) {
        matchCount++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (matchCount < MIN_PIXEL_COUNT) return null;

  return {
    x:      minX,
    y:      minY,
    width:  maxX - minX,
    height: maxY - minY,
  };
}

// ── Compositing ────────────────────────────────────────────────────────────────

/**
 * Detect the magenta marker in the image, blur that region (erasing Grok's fake
 * QR and the marker itself), then composite a real scannable QR card centred there.
 *
 * Falls back to compositeQrOnto (fixed bottom-right corner) on any failure.
 */
export async function swapQrCode(
  imageBuffer: Buffer,
  trackingUrl: string,
  spotSize: SizeKey,
  style: CardStyle,
): Promise<Buffer> {
  const sharpMod = await (import("sharp") as Promise<any>);
  const sharp    = (sharpMod.default ?? sharpMod) as typeof import("sharp");

  const spec = QR_PLACEMENT[spotSize] ?? QR_PLACEMENT.xl;
  const { imgW, imgH } = spec;

  // ── Detection ─────────────────────────────────────────────────────────────
  let loc: QrLocation | null;
  try {
    loc = await locateQrCode(imageBuffer);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn({ reason, spotSize }, "swapQrCode: magenta scan threw — falling back to fixed-corner");
    return compositeQrOnto(imageBuffer, trackingUrl, spotSize, style);
  }

  if (!loc) {
    logger.warn(
      { spotSize },
      "swapQrCode: no magenta marker detected — falling back to fixed-corner compositing",
    );
    return compositeQrOnto(imageBuffer, trackingUrl, spotSize, style);
  }

  logger.info(
    { spotSize, detected: loc },
    "swapQrCode: magenta marker detected — compositing real QR at detected position",
  );

  // ── Size the replacement card ──────────────────────────────────────────────
  const rawSize = Math.max(loc.width, loc.height);
  const maxCard = Math.min(
    Math.round(imgW * MAX_CARD_W_FRAC),
    Math.round(imgH * MAX_CARD_H_FRAC),
  );
  const cardSize = Math.min(Math.round(rawSize * CARD_MARGIN), maxCard);
  const qrSize   = Math.max(Math.round(cardSize / (style.marginMultiplier ?? CARD_MARGIN)), 64);
  const qrOffset = Math.floor((cardSize - qrSize) / 2);

  // Centre card on detected marker centroid, clamped to image bounds
  const cx       = Math.round(loc.x + loc.width  / 2);
  const cy       = Math.round(loc.y + loc.height / 2);
  const cardLeft = Math.min(Math.max(0, Math.round(cx - cardSize / 2)), imgW - cardSize);
  const cardTop  = Math.min(Math.max(0, Math.round(cy - cardSize / 2)), imgH - cardSize);

  // ── Blur the magenta region + surrounding area ─────────────────────────────
  // Padding ensures the blur covers Grok's full QR graphic including quiet zone,
  // not just the magenta marker square itself.
  const blurSize = Math.round(rawSize * BLUR_PAD_MULTIPLIER);
  const blurLeft = Math.min(Math.max(0, Math.round(cx - blurSize / 2)), imgW - blurSize);
  const blurTop  = Math.min(Math.max(0, Math.round(cy - blurSize / 2)), imgH - blurSize);
  const blurW    = Math.min(blurSize, imgW - blurLeft);
  const blurH    = Math.min(blurSize, imgH - blurTop);

  const blurredPatch = await sharp(imageBuffer)
    .extract({ left: blurLeft, top: blurTop, width: blurW, height: blurH })
    .blur(BLUR_SIGMA)
    .toBuffer();

  const blurredBase = await sharp(imageBuffer)
    .composite([{ input: blurredPatch, left: blurLeft, top: blurTop }])
    .toBuffer();

  // ── Build real QR PNG ──────────────────────────────────────────────────────
  const qrPng: Buffer = await QRCode.toBuffer(trackingUrl, {
    errorCorrectionLevel: "H",
    type:   "png",
    width:  qrSize,
    margin: 4,
    color:  { dark: "#000000", light: "#ffffff" },
  });

  // ── Build SVG backing card ─────────────────────────────────────────────────
  const sw          = style.borderWidth;
  const hasBorder   = sw > 0;
  const half        = hasBorder ? sw / 2 : 0;
  const inset       = hasBorder ? sw : 0;
  const effectiveCr = style.circularCard
    ? Math.floor(cardSize / 2)
    : style.cornerRadius;
  const strokeAttrs = hasBorder
    ? ` stroke="${style.border}" stroke-width="${sw}"${
        style.dashPattern ? ` stroke-dasharray="${style.dashPattern.join(" ")}"` : ""
      }`
    : "";
  const cardSvg = Buffer.from(
    `<svg width="${cardSize}" height="${cardSize}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="${half}" y="${half}" width="${cardSize - inset}" height="${cardSize - inset}" ` +
    `rx="${effectiveCr}" ry="${effectiveCr}" fill="${style.fill}"${strokeAttrs}/>` +
    `</svg>`,
  );

  const cardBase   = await sharp(cardSvg).png().toBuffer();
  const cardWithQr = await sharp(cardBase)
    .composite([{ input: qrPng, left: qrOffset, top: qrOffset }])
    .png()
    .toBuffer();

  // ── Composite real QR card onto blurred base + verify ─────────────────────
  try {
    const compositedBuf: Buffer = await sharp(blurredBase)
      .composite([{ input: cardWithQr, left: cardLeft, top: cardTop }])
      .jpeg({ quality: 98, chromaSubsampling: "4:4:4" })
      .toBuffer();

    // Decode-verify: crop to just the composited QR region
    const qrAbsLeft = cardLeft + qrOffset;
    const qrAbsTop  = cardTop  + qrOffset;
    const { data: vPixels, info: vInfo } = await sharp(compositedBuf)
      .extract({ left: qrAbsLeft, top: qrAbsTop, width: qrSize, height: qrSize })
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

    const decoded = jsqr(new Uint8ClampedArray(vPixels), vInfo.width, vInfo.height);
    if (!decoded) {
      throw new Error("QR not decodable after compositing");
    }
    if (decoded.data !== trackingUrl) {
      throw new Error(`QR content mismatch — expected "${trackingUrl}" got "${decoded.data}"`);
    }

    logger.info(
      { spotSize, cardSize, cardLeft, cardTop, qrSize },
      "swapQrCode: composite OK — QR verified",
    );
    return compositedBuf;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn({ reason, spotSize }, "swapQrCode: composite/verify failed — falling back to fixed-corner");
    return compositeQrOnto(imageBuffer, trackingUrl, spotSize, style);
  }
}
