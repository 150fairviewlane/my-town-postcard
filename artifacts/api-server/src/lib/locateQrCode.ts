/**
 * locateQrCode.ts — Magenta-marker QR detection and replacement for Grok-generated ads.
 *
 * Pipeline:
 *   1. The reference template images each have a solid magenta (#FF00FF) square
 *      stamped precisely over a new, 20%-smaller QR card in the bottom-right corner.
 *   2. Grok sees the reference and faithfully reproduces the magenta square in
 *      the generated ad at the same relative position.
 *   3. We scan the generated ad's raw RGBA pixels for magenta-range values,
 *      compute the bounding box centroid, then composite a real scannable QR card
 *      centred there. The card is 25% larger than the detected magenta (CARD_MARGIN
 *      1.25×) so it fully covers the magenta regardless of small reproduction variance.
 *   4. If no magenta is detected (fallback: Grok forgot the marker), we fall
 *      back to compositeQrOnto at the fixed bottom-right corner.
 *
 * Detection thresholds — tuned to survive JPEG q=85 compression:
 *   R ≥ 180,  G ≤ 80,  B ≥ 180
 * These tolerate ±30 value drift from pure #FF00FF while excluding all
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

// The detected magenta centroid positions the card; size comes from the spec,
// not from the detected bbox — see swapQrCode sizing block.

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
 * Detect the magenta marker in the image, then composite a real scannable QR
 * card centred on the detected position. The card is 1.25× the marker size so
 * it fully covers the magenta with no halo or blurring.
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
  // Use the spec qrSize for this spot type so the card is always consistent,
  // regardless of how large Grok reproduced the magenta marker. Cap so the
  // card fits entirely within the footer (bottom 20% of the image).
  const innerMargin = style.marginMultiplier ?? 1.0375;
  const footerH     = Math.round(imgH * 0.20);  // footer = bottom 20%
  const footerTop   = imgH - footerH;            // y-coord where footer begins
  const maxCardSize = footerH - 6;               // 6 px bottom inset matches compositeQr.CARD_INSET

  const specCardSize = Math.round(spec.qrSize * innerMargin);
  const cardSize     = Math.min(specCardSize, maxCardSize);
  const qrSize       = Math.max(Math.round(cardSize / innerMargin), 64);
  const qrOffset     = Math.floor((cardSize - qrSize) / 2);

  // Horizontal: centred on detected magenta centroid, clamped within image width.
  const cx       = Math.round(loc.x + loc.width  / 2);
  const cardLeft = Math.min(Math.max(0, Math.round(cx - cardSize / 2)), imgW - cardSize);

  // Vertical: centred on detected centroid but card top must be ≥ footerTop
  // so the card never encroaches into the body of the ad.
  const cy         = Math.round(loc.y + loc.height / 2);
  const cardTopRaw = Math.round(cy - cardSize / 2);
  const cardTop    = Math.min(
    Math.max(footerTop, cardTopRaw),  // never above the footer start
    imgH - cardSize,                   // never below image bottom
  );

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

  // ── Composite real QR card directly onto ad + verify ──────────────────────
  try {
    const compositedBuf: Buffer = await sharp(imageBuffer)
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
