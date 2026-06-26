/**
 * compositeQr.ts — server-side QR code compositing for Grok-generated ads.
 *
 * Generates a real, scannable QR code (ECL H) and composites it onto an ad
 * image buffer inside a plain backing card (white fill, thin burgundy border,
 * "SCAN ME" label) anchored to the bottom-right corner.  After compositing, a
 * programmatic jsqr decode step verifies the QR is scannable — throws on fail.
 *
 * Card sizing: ~16% of qrSize as side/bottom padding, ~22% as top padding
 * (label area).  Card is inset 8 px from the image edge.
 */

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
  fill:        string; // card background hex  (e.g. "#FFFFFF")
  border:      string; // 1 px stroke hex      (e.g. "#7B1418")
  labelColor:  string; // "SCAN ME" text hex   (e.g. "#7B1418")
}

export const DEFAULT_CARD_STYLE: CardStyle = {
  fill:       "#FFFFFF",
  border:     "#7B1418",
  labelColor: "#7B1418",
};

export const CREAM_CARD_STYLE: CardStyle = {
  fill:       "#FFF8F0",
  border:     "#7B1418",
  labelColor: "#7B1418",
};

export const GRAY_BORDER_STYLE: CardStyle = {
  fill:       "#FFFFFF",
  border:     "#CCCCCC",
  labelColor: "#555555",
};

// ── Card layout computed from QR spec ─────────────────────────────────────
const CARD_INSET = 8; // px from image edge to card outer edge

export interface CardLayout {
  cardW:      number;
  cardH:      number;
  sidePad:    number;
  topPad:     number;
  bottomPad:  number;
  cardLeft:   number;
  cardTop:    number;
  qrAbsLeft:  number; // QR origin in full-image coords (for decode verify)
  qrAbsTop:   number;
  fontSize:   number;
  labelCY:    number; // label centre-Y in card-local coords
}

export function computeCardLayout(spec: QrSpec): CardLayout {
  const { qrSize, imgW, imgH } = spec;
  const sidePad   = Math.max(12, Math.round(qrSize * 0.16));
  const topPad    = Math.max(18, Math.round(qrSize * 0.22));
  const bottomPad = sidePad;
  const cardW     = qrSize + 2 * sidePad;
  const cardH     = qrSize + topPad + bottomPad;
  const cardLeft  = imgW - cardW - CARD_INSET;
  const cardTop   = imgH - cardH - CARD_INSET;
  return {
    cardW, cardH, sidePad, topPad, bottomPad,
    cardLeft, cardTop,
    qrAbsLeft: cardLeft + sidePad,
    qrAbsTop:  cardTop  + topPad,
    fontSize:  Math.max(10, Math.round(qrSize * 0.11)),
    labelCY:   topPad / 2,
  };
}

// ── SVG backing-card builder ───────────────────────────────────────────────
function makeCardSvg(layout: CardLayout, style: CardStyle): Buffer {
  const { cardW, cardH, fontSize, labelCY } = layout;
  const { fill, border, labelColor } = style;
  const letterSpacing = Math.max(1, Math.round(fontSize * 0.18));
  const svg = `\
<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0.5" y="0.5" width="${cardW - 1}" height="${cardH - 1}"
        fill="${fill}" stroke="${border}" stroke-width="1"/>
  <text x="${cardW / 2}" y="${labelCY}"
        text-anchor="middle" dominant-baseline="central"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}" font-weight="700"
        letter-spacing="${letterSpacing}"
        fill="${labelColor}">SCAN ME</text>
</svg>`;
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

  // ── 2. Render SVG backing card to PNG ─────────────────────────────────────
  const cardBase = await sharp(makeCardSvg(layout, style)).png().toBuffer();

  // ── 3. Composite QR centred inside card (offset = sidePad / topPad) ───────
  const cardWithQr = await sharp(cardBase)
    .composite([{ input: qrPng, left: layout.sidePad, top: layout.topPad }])
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

  return compositedBuffer;
}
