/**
 * compositeQr.ts — server-side QR code compositing for Grok-generated ads.
 *
 * Generates a real, scannable QR code (ECL H) and composites it onto an ad
 * image buffer inside a square backing card anchored flush to the bottom-right
 * corner.
 *
 * Card sizing — physical-inch based, always a square:
 *   cardSize (px) = round(qrSize × marginMultiplier)
 *   The default multiplier (CARD_MARGIN = 1.0375) adds a thin border strip on
 *   every side. Per-template styles may override via the optional
 *   `marginMultiplier` field on CardStyle (e.g. circular cards need ≥1.45×
 *   so the QR's square corners stay inside the inscribed circle).
 *   DPI cancels out of the formula, so the result is DPI-independent.
 *
 * Physical card sizes by spot size (default 1.0375× multiplier):
 *   XL  →  187 px  ≈ 0.62" square  (qrSize 180 px, 4"×5" print)
 *   L   →  135 px  ≈ 0.45" square  (qrSize 130 px, 3"×4" print)
 *   M   →   93 px  ≈ 0.31" square  (qrSize  90 px, 3"×2" print)
 *   S   →   93 px  ≈ 0.31" square  (qrSize  90 px, 2"×2" print)
 *
 * Circular cards (circularCard: true):
 *   cornerRadius is overridden to Math.floor(cardSize / 2) at render time.
 *   Use marginMultiplier ≥ 1.45 — at the default 1.0375× the QR's diagonal
 *   (side × √2) would exceed the circle's diameter and corners would clip.
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
  fill:          string;          // card background hex (e.g. "#FFFFFF")
  border:        string;          // border stroke hex   (e.g. "#7B1418")
  borderWidth:   number;          // stroke width in px
  cornerRadius:  number;          // SVG rx/ry — 0 = sharp corners; ignored when circularCard=true
  dashPattern:   number[] | null; // SVG stroke-dasharray; null = solid

  /**
   * When true, cornerRadius is overridden to Math.floor(cardSize / 2) at
   * render time, producing a true circle. Requires marginMultiplier ≥ 1.45 so
   * the QR's square corners clear the circle's edge.
   */
  circularCard?: true;

  /**
   * Multiplier applied to qrSize to compute the square card side length.
   * Defaults to CARD_MARGIN (1.0375×) when absent.
   * Circular cards should use ≥ 1.45× — at 1.0375× the QR diagonal exceeds
   * the circle diameter and corners poke outside the fill area.
   */
  marginMultiplier?: number;

  /** @internal Marks this as a placeholder pending per-template design. */
  _placeholder?: true;
}

/** Placeholder used for templates not yet assigned a final style. */
const PLACEHOLDER_QR_STYLE: CardStyle = {
  fill:         "#FFFFFF",
  border:       "#CCCCCC",
  borderWidth:  1,
  cornerRadius: 0,
  dashPattern:  null,
  _placeholder: true,
};

export const DEFAULT_CARD_STYLE: CardStyle = {
  fill:         "#FFFFFF",
  border:       "#7B1418",
  borderWidth:  1,
  cornerRadius: 0,
  dashPattern:  null,
};

export const CREAM_CARD_STYLE: CardStyle = {
  fill:         "#FFF8F0",
  border:       "#7B1418",
  borderWidth:  1,
  cornerRadius: 0,
  dashPattern:  null,
};

export const GRAY_BORDER_STYLE: CardStyle = {
  fill:         "#FFFFFF",
  border:       "#CCCCCC",
  borderWidth:  1,
  cornerRadius: 0,
  dashPattern:  null,
};

// ── Per-template QR card styles ───────────────────────────────────────────
/**
 * Maps each ad template key to its QR backing-card visual style.
 * Fields:
 *   fill             — card background (matches footer bar color for seamless blend)
 *   border           — accent outline color matching the template's design language
 *   borderWidth      — stroke width in px
 *   cornerRadius     — SVG rx/ry; 0 = square corners; ignored when circularCard=true
 *   dashPattern      — stroke-dasharray for dashed/stitched styles; null = solid
 *   circularCard     — if true, cornerRadius is set to Math.floor(cardSize/2) at render time
 *   marginMultiplier — overrides CARD_MARGIN for this template; circular cards use 1.45
 *
 * Finalized: heritage-home, health-wellness, parchment-classic, sage-organic,
 *            at-your-service, brush-stroke.
 * Remaining 6 templates use PLACEHOLDER_QR_STYLE and emit a startup warning.
 */
export const TEMPLATE_QR_STYLES: Record<string, CardStyle> = {
  // ── Finalized ────────────────────────────────────────────────────────────
  "heritage-home":     { fill: "#f5f0e8", border: "#6b1a2a", borderWidth: 3, cornerRadius: 16, dashPattern: null },
  "health-wellness":   { fill: "#ffffff", border: "#1f5c5c", borderWidth: 3, cornerRadius: 22, dashPattern: null },
  "parchment-classic": { fill: "#1c1a18", border: "#c9742f", borderWidth: 3, cornerRadius: 0,  dashPattern: null },
  "sage-organic":      { fill: "#f4ede1", border: "#6b7c4f", borderWidth: 3, cornerRadius: 10, dashPattern: [8, 6] },
  "at-your-service":   { fill: "#1a2744", border: "#c9a84c", borderWidth: 3, cornerRadius: 0,  dashPattern: [10, 5] },
  "brush-stroke":      { fill: "#2b2620", border: "#7a8c4a", borderWidth: 3, cornerRadius: 0,  dashPattern: null, circularCard: true, marginMultiplier: 1.45 },
  "made-fresh":        { fill: "#1f1a14", border: "#c9a84c", borderWidth: 3, cornerRadius: 0,  dashPattern: null },
  // borderWidth: 0 — flat fill, no outline; stroke attrs omitted entirely in makeCardSvg
  "neighborhood-pro":  { fill: "#1d3a23", border: "#1d3a23", borderWidth: 0, cornerRadius: 0,  dashPattern: null },
  // ── TODO: replace with per-template values ───────────────────────────────
  "home-elegance":     { ...PLACEHOLDER_QR_STYLE },
  "purple-sage":       { ...PLACEHOLDER_QR_STYLE },
  "wok-fire":          { ...PLACEHOLDER_QR_STYLE },
  "surprise-me":       { ...PLACEHOLDER_QR_STYLE },
};

/**
 * Returns the finalized (or placeholder) QR card style for a given template.
 * Unknown keys fall back to DEFAULT_CARD_STYLE.
 */
export function getTemplateQrStyle(templateKey: string): CardStyle {
  return TEMPLATE_QR_STYLES[templateKey] ?? DEFAULT_CARD_STYLE;
}

// ── Layout constants ──────────────────────────────────────────────────────
/** px inset from the image edge to the card's outer edge */
const CARD_INSET = 6;

/**
 * Default card size multiplier — card side = round(qrSize × CARD_MARGIN).
 * Gives a thin background strip (~3 px at XL) beyond the QR's own quiet zone.
 * Override per-template via CardStyle.marginMultiplier.
 */
const CARD_MARGIN = 1.0375;

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

/**
 * Compute the card and QR placement for a given QR spec and optional style.
 * When style.marginMultiplier is set it overrides the global CARD_MARGIN,
 * allowing circular cards to use a wider multiplier (≥ 1.45) so the QR's
 * square corners clear the inscribed circle's edge.
 */
export function computeCardLayout(spec: QrSpec, style?: Pick<CardStyle, "marginMultiplier">): CardLayout {
  const { qrSize, imgW, imgH } = spec;
  const multiplier = style?.marginMultiplier ?? CARD_MARGIN;

  const cardSize = Math.round(qrSize * multiplier);

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

// ── Startup warning for placeholder template styles ───────────────────────
{
  const pendingTemplates = Object.entries(TEMPLATE_QR_STYLES)
    .filter(([, s]) => s._placeholder)
    .map(([k]) => k);
  if (pendingTemplates.length > 0) {
    logger.warn(
      { templates: pendingTemplates },
      "compositeQr: QR card styles not yet finalized for these templates — using placeholder (white/#CCCCCC border)",
    );
  }
}

// ── SVG backing-card builder ───────────────────────────────────────────────
/**
 * Render the backing card as an SVG buffer.
 * @param cardSize  Side length in px (card is always square)
 * @param style     Visual style
 * @param effectiveCornerRadius  Computed corner radius (may differ from style.cornerRadius
 *                               when circularCard=true sets it to Math.floor(cardSize/2))
 */
function makeCardSvg(cardSize: number, style: CardStyle, effectiveCornerRadius: number): Buffer {
  const sw = style.borderWidth;

  // When borderWidth is 0 we omit stroke/stroke-width entirely rather than
  // emitting stroke-width="0". Even though the SVG spec says a zero-width
  // stroke is not painted, some rasterizers may still produce a sub-pixel
  // anti-aliasing artifact when the stroke attribute is present with a color.
  // Skipping the attribute is the only safe guarantee of a clean flat fill.
  const hasBorder = sw > 0;
  const half = hasBorder ? sw / 2 : 0;
  const inset = hasBorder ? sw : 0;
  const strokeAttrs = hasBorder
    ? ` stroke="${style.border}" stroke-width="${sw}"${style.dashPattern ? ` stroke-dasharray="${style.dashPattern.join(" ")}"` : ""}`
    : "";

  const svg =
    `<svg width="${cardSize}" height="${cardSize}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="${half}" y="${half}" width="${cardSize - inset}" height="${cardSize - inset}" ` +
    `rx="${effectiveCornerRadius}" ry="${effectiveCornerRadius}" fill="${style.fill}"${strokeAttrs}/>` +
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
  const layout = computeCardLayout(spec, style);

  // For circularCard styles, override cornerRadius to exactly half the card side.
  // This produces a true circle: rx = ry = width/2 = height/2 on a square element.
  const effectiveCornerRadius = style.circularCard
    ? Math.floor(layout.cardSize / 2)
    : style.cornerRadius;

  logger.info(
    { spotSize, cardSize: layout.cardSize, cardLeft: layout.cardLeft, cardTop: layout.cardTop,
      qrOffset: layout.qrOffset, qrAbsLeft: layout.qrAbsLeft, qrAbsTop: layout.qrAbsTop,
      cornerRadius: effectiveCornerRadius, circularCard: style.circularCard ?? false,
      marginMultiplier: style.marginMultiplier ?? CARD_MARGIN },
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
  const cardBase = await sharp(makeCardSvg(layout.cardSize, style, effectiveCornerRadius)).png().toBuffer();

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
