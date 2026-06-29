/**
 * locateQrCode.ts — jsQR-based QR detection and replacement for Grok-generated ads.
 *
 * Uses Sharp to decode the image to raw RGBA, then jsQR to find the QR code
 * Grok drew from the reference image. If found, composites a real scannable
 * QR card centered on the detected position. Falls back to compositeQrOnto
 * (fixed bottom-right corner) if jsQR finds nothing.
 *
 * No API calls — purely local, synchronous detection.
 */

import jsqr from "jsqr";
import QRCode from "qrcode";
import { logger } from "./logger";
import {
  compositeQrOnto,
  type CardStyle,
  type SizeKey,
  QR_PLACEMENT,
} from "./compositeQr";

export interface QrLocation {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Card size multiplier applied to the detected QR width to produce the backing
// card size. Mirrors CARD_MARGIN in compositeQr.ts so the replacement card
// matches the visual footprint of the original.
const CARD_MARGIN = 1.0375;

// Hard cap: card cannot exceed these fractions of image dimensions.
const MAX_CARD_W_FRAC = 0.35;
const MAX_CARD_H_FRAC = 0.30;

// ── Detection ──────────────────────────────────────────────────────────────────

/**
 * Locate a QR code in the given image buffer using jsQR.
 * Returns the axis-aligned bounding box of the detected QR pattern, or null.
 */
export async function locateQrCode(imageBuffer: Buffer): Promise<QrLocation | null> {
  const sharpMod = await (import("sharp") as Promise<any>);
  const sharp    = (sharpMod.default ?? sharpMod) as typeof import("sharp");

  const { data, info } = await sharp(imageBuffer)
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const result = jsqr(new Uint8ClampedArray(data), info.width, info.height);
  if (!result) return null;

  const loc = result.location;
  const x   = Math.min(loc.topLeftCorner.x,  loc.bottomLeftCorner.x);
  const y   = Math.min(loc.topLeftCorner.y,   loc.topRightCorner.y);
  const x2  = Math.max(loc.topRightCorner.x,  loc.bottomRightCorner.x);
  const y2  = Math.max(loc.bottomLeftCorner.y, loc.bottomRightCorner.y);

  return {
    x:      Math.round(x),
    y:      Math.round(y),
    width:  Math.round(x2 - x),
    height: Math.round(y2 - y),
  };
}

// ── Compositing ────────────────────────────────────────────────────────────────

/**
 * Detect Grok's QR placeholder in the image and swap it with a real scannable QR.
 *
 * Pipeline:
 *   1. jsQR scans the RGBA pixel data for QR finder patterns.
 *   2. If found, a real backing card + QR is composited centered on the detected bbox.
 *   3. The composited QR is decode-verified.
 *   4. Any failure — detection miss, composite error, verify failure — falls back
 *      to compositeQrOnto (fixed bottom-right corner), so a scannable QR always
 *      appears on the final ad.
 *
 * @param imageBuffer  JPEG buffer already resized to print dimensions for spotSize
 * @param trackingUrl  Full URL the real QR should encode
 * @param spotSize     Spot size key — used for sizing caps and the fallback compositor
 * @param style        Card visual style (from TEMPLATE_QR_STYLES)
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
    logger.warn({ reason, spotSize }, "swapQrCode: jsQR threw — falling back to fixed-corner");
    return compositeQrOnto(imageBuffer, trackingUrl, spotSize, style);
  }

  if (!loc) {
    logger.warn(
      { spotSize },
      "swapQrCode: no QR detected by jsQR — falling back to fixed-corner compositing",
    );
    return compositeQrOnto(imageBuffer, trackingUrl, spotSize, style);
  }

  logger.info(
    { spotSize, detected: loc },
    "swapQrCode: QR detected — compositing real QR at detected position",
  );

  // ── Size the replacement card ──────────────────────────────────────────────
  // jsQR returns the QR module grid; add CARD_MARGIN to include the backing card border.
  const rawSize  = Math.max(loc.width, loc.height);
  const maxCard  = Math.min(
    Math.round(imgW * MAX_CARD_W_FRAC),
    Math.round(imgH * MAX_CARD_H_FRAC),
  );
  const cardSize  = Math.min(Math.round(rawSize * CARD_MARGIN), maxCard);
  const qrSize    = Math.max(Math.round(cardSize / (style.marginMultiplier ?? CARD_MARGIN)), 64);
  const qrOffset  = Math.floor((cardSize - qrSize) / 2);

  // Center card on detected QR centroid, clamped to image bounds
  const cx       = Math.round(loc.x + loc.width  / 2);
  const cy       = Math.round(loc.y + loc.height / 2);
  const cardLeft = Math.min(Math.max(0, Math.round(cx - cardSize / 2)), imgW - cardSize);
  const cardTop  = Math.min(Math.max(0, Math.round(cy - cardSize / 2)), imgH - cardSize);

  // ── Build real QR PNG ──────────────────────────────────────────────────────
  const qrPng: Buffer = await QRCode.toBuffer(trackingUrl, {
    errorCorrectionLevel: "H",
    type:   "png",
    width:  qrSize,
    margin: 4,
    color:  { dark: "#000000", light: "#ffffff" },
  });

  // ── Build SVG backing card ─────────────────────────────────────────────────
  const sw              = style.borderWidth;
  const hasBorder       = sw > 0;
  const half            = hasBorder ? sw / 2 : 0;
  const inset           = hasBorder ? sw : 0;
  const effectiveCr     = style.circularCard
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

  // ── Composite onto ad + verify ─────────────────────────────────────────────
  try {
    const compositedBuf: Buffer = await sharp(imageBuffer)
      .composite([{ input: cardWithQr, left: cardLeft, top: cardTop }])
      .jpeg({ quality: 98, chromaSubsampling: "4:4:4" })
      .toBuffer();

    // Decode-verify: crop to just the composited QR so surrounding ad art can't
    // confuse jsQR during verification.
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
