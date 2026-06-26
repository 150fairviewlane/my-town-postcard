/**
 * compositeQr.ts — server-side QR code compositing for Grok-generated ads.
 *
 * Generates a real, scannable QR code (ECL H) and composites it onto an ad
 * image buffer inside a square backing card anchored flush to the bottom-right
 * corner.
 *
 * Card sizing — physical-inch based, always a square:
 *   cardSize (px) = round(qrSize × 1.15)
 *   The 1.15× factor adds a 15% margin on every side (QR centered within card).
 *   DPI cancels out of the formula (qrPx/DPI × 1.15 × DPI = qrPx × 1.15), so
 *   the same formula holds regardless of which size's DPI we use.
 *
 * Physical card sizes by spot size:
 *   XL  →  207 px  ≈ 0.69" square  (qrSize 180 px, 4"×5" print)
 *   L   →  150 px  ≈ 0.50" square  (qrSize 130 px, 3"×4" print)
 *   M   →  104 px  ≈ 0.35" square  (qrSize  90 px, 3"×2" print)
 *   S   →  104 px  ≈ 0.35" square  (qrSize  90 px, 2"×2" print)
 *
 * Telemetry:
 *   After compositing, a 20-px strip just above the card top edge is sampled.
 *   If average brightness > BLEED_THRESHOLD the logger emits a WARN so any
 *   future drift (Grok placeholder exceeding card bounds) is visible in logs
 *   rather than silently reintroducing the exposed-corner bug.
 */

import { logger } from "./logger";
import QRCode from "qrcode";
import jsqr from "jsqr";

export type SizeKey = "xl" | "l" | "m" | "s";

// ── Per-size ad dimensions + QR render size ────────────────────────────────
interface QrSpec {
  qrSize: number;
  imgW:   number;
  imgH:   number;
}

export const QR_PLACEMENT: Record<SizeKey, QrSpec> = {
  xl: { qrSize: 180, imgW: 1200, imgH: 1500 },
  l:  { qrSize: 130, imgW: 900,  imgH: 1200 },
  m:  { qrSize: 90,  imgW: 900,  imgH: 600  },
  s:  { qrSize: 90,  imgW: 600,  imgH: 600  },
};

// ── Backing-card visual style ──────────────────────────────────────────────
export interface CardStyle {
  fill:   string; // card background hex (e.g. "#FFFFFF")
  border: string; // border stroke hex   (e.g. "#7B1418")
}

export const DEFAULT_CARD_STYLE: CardStyle = {
  fill:   "#FFFFFF",
  border: "#7B1418",
};

export const CREAM_CARD_STYLE: CardStyle = {
  fill:   "#FFF8F0",
  border: "#7B1418",
};

export const GRAY_BORDER_STYLE: CardStyle = {
  fill:   "#FFFFFF",
  border: "#CCCCCC",
};

// ── Layout constants ──────────────────────────────────────────────────────
/** px inset from the image edge to the card's outer edge */
const CARD_INSET = 6;

/** 1.15× physical margin — card is always this multiple of the QR size */
const CARD_MARGIN = 1.15;

/**
 * Average pixel brightness threshold (0-255) above which the strip just above
 * the card is considered suspiciously light — indicating Grok's placeholder
 * may have bled outside the card's covered zone.
 */
const BLEED_THRESHOLD = 220;

/** Height (px) of the bleed-detection strip above the card top edge */
const BLEED_CHECK_H = 20;

// ── Card layout computed from QR spec ─────────────────────────────────────
export interface CardLayout {
  /** Side length of the square card in pixels */
  cardSize:  number;
  cardLeft:  number;
  cardTop:   number;
  /** QR origin in card-local coordinates (symmetric on all sides) */
  qrOffset:  number;
  /** QR origin in full-image coordinates (for decode verify + bleed check) */
  qrAbsLeft: number;
  qrAbsTop:  number;
}

export function computeCardLayout(spec: QrSpec): CardLayout {
  const { qrSize, imgW, imgH } = spec;

  // Square card sized to the QR's physical print size + 15% margin.
  // DPI cancels: qrSize_inches × 1.15 × DPI = qrSize_px × 1.15.
  const cardSize = Math.round(qrSize * CARD_MARGIN);

  // QR centered within the square card (equal margin all sides).
  const qrOffset = Math.floor((cardSize - qrSize) / 2);

  const cardLeft = imgW - cardSize - CARD_INSET;
  const cardTop  = imgH - cardSize - CARD_INSET;

  return {
    cardSize, cardLeft, cardTop,
    qrOffset,
    qrAbsLeft: cardLeft + qrOffset,
    qrAbsTop:  cardTop  + qrOffset,
  };
}

// ── SVG backing-card builder ───────────────────────────────────────────────
function makeCardSvg(cardSize: number, style: CardStyle): Buffer {
  const svg =
    `<svg width="${cardSize}" height="${cardSize}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="0.5" y="0.5" width="${cardSize - 1}" height="${cardSize - 1}" ` +
    `fill="${style.fill}" stroke="${style.border}" stroke-width="1"/>` +
    `</svg>`;
  return Buffer.from(svg);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Composite a real, scannable QR code onto an ad image buffer.
 *
 * @param imageBuffer  JPEG buffer of the ad (already cropped to print dims)
 * @param trackingUrl  Full URL the QR should encode, e.g. "https://app.com/go/slug"
 * @param spotSize     Spot size key; controls card/QR pixel sizes and placement
 * @param style        Optional card visual style; defaults to white + burgundy border
 * @returns            JPEG buffer (98 % quality) with backing card + QR composited
 * @throws             If QR generation fails or post-composite decode check fails
 */
export async function compositeQrOnto(
  imageBuffer: Buffer,
  trackingUrl: string,
  spotSize: SizeKey,
  style: CardStyle = DEFAULT_CARD_STYLE,
): Promise<Buffer> {
  const sharpMod = await (import("sharp") as Promise<any>);
  const sharp    = (sharpMod.default ?? sharpMod) as typeof import("sharp");

  const spec   = QR_PLACEMENT[spotSize] ?? QR_PLACEMENT.xl;
  const layout = computeCardLayout(spec);

  logger.info(
    { spotSize, cardSize: layout.cardSize, cardLeft: layout.cardLeft, cardTop: layout.cardTop,
      qrOffset: layout.qrOffset, qrAbsLeft: layout.qrAbsLeft, qrAbsTop: layout.qrAbsTop },
    "compositeQrOnto: compositing QR backing card",
  );

  // ── 1. Generate QR PNG ────────────────────────────────────────────────────
  // ECL H: 30 % recovery — survives partial obscuring by print imperfections.
  // margin:4 = 4 QR modules of quiet zone on every side (ISO 18004 minimum).
  const qrPng: Buffer = await QRCode.toBuffer(trackingUrl, {
    errorCorrectionLevel: "H",
    type:   "png",
    width:  spec.qrSize,
    margin: 4,
    color:  { dark: "#000000", light: "#ffffff" },
  });

  // ── 2. Render square SVG backing card to PNG ──────────────────────────────
  const cardBase = await sharp(makeCardSvg(layout.cardSize, style)).png().toBuffer();

  // ── 3. Composite QR centered inside square card ───────────────────────────
  // qrOffset is symmetric on all four sides.
  const cardWithQr = await sharp(cardBase)
    .composite([{ input: qrPng, left: layout.qrOffset, top: layout.qrOffset }])
    .png()
    .toBuffer();

  // ── 4. Composite card+QR onto ad ─────────────────────────────────────────
  const compositedBuffer: Buffer = await sharp(imageBuffer)
    .composite([{ input: cardWithQr, left: layout.cardLeft, top: layout.cardTop }])
    .jpeg({ quality: 98, chromaSubsampling: "4:4:4" })
    .toBuffer();

  // ── 5. Decode-verify ──────────────────────────────────────────────────────
  // Crop to just the QR PNG region so complex ad imagery can't confuse jsqr.
  const { data: qrPixels, info: qrInfo } = await sharp(compositedBuffer)
    .extract({
      left:   layout.qrAbsLeft,
      top:    layout.qrAbsTop,
      width:  spec.qrSize,
      height: spec.qrSize,
    })
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const decoded = jsqr(
    new Uint8ClampedArray(qrPixels),
    qrInfo.width,
    qrInfo.height,
  );

  if (!decoded) {
    throw new Error(
      `compositeQrOnto: QR decode verification failed after compositing. ` +
      `spotSize="${spotSize}" cardLeft=${layout.cardLeft} cardTop=${layout.cardTop} ` +
      `qrAbsLeft=${layout.qrAbsLeft} qrAbsTop=${layout.qrAbsTop} qrSize=${spec.qrSize}.`,
    );
  }

  if (decoded.data !== trackingUrl) {
    throw new Error(
      `compositeQrOnto: QR content mismatch — ` +
      `expected "${trackingUrl}" but decoded "${decoded.data}".`,
    );
  }

  // ── 6. Telemetry — detect Grok placeholder bleed above card ──────────────
  // Sample a strip directly above the card. If Grok's reserved-zone placeholder
  // extends taller than the card, those pixels will be suspiciously bright
  // (white/near-white background of the placeholder). This is purely diagnostic;
  // it does NOT alter the output.
  const checkH = Math.min(BLEED_CHECK_H, layout.cardTop);
  if (checkH > 0) {
    try {
      const strip = await sharp(compositedBuffer)
        .extract({
          left:   layout.cardLeft,
          top:    layout.cardTop - checkH,
          width:  layout.cardSize,
          height: checkH,
        })
        .removeAlpha()
        .raw()
        .toBuffer();

      let brightnessSum = 0;
      for (let i = 0; i < strip.length; i++) brightnessSum += strip[i]!;
      const avgBrightness = brightnessSum / strip.length;

      if (avgBrightness > BLEED_THRESHOLD) {
        logger.warn(
          { spotSize, cardLeft: layout.cardLeft, cardTop: layout.cardTop,
            cardSize: layout.cardSize, avgBrightnessAboveCard: avgBrightness.toFixed(1),
            threshold: BLEED_THRESHOLD },
          "compositeQrOnto: bright region detected above card — " +
          "Grok placeholder may exceed card bounds (exposed corner risk)",
        );
      }
    } catch (err) {
      // Bleed check is non-blocking telemetry — never fail the whole composite for it.
      logger.warn({ err, spotSize }, "compositeQrOnto: bleed-check extraction failed (non-fatal)");
    }
  }

  return compositedBuffer;
}
