/**
 * compositeQr.ts — server-side QR code compositing for Grok-generated ads.
 *
 * Generates a real, scannable QR code (ECL H) and composites it onto an ad
 * image buffer. Compositing order (bottom to top):
 *   1. Glow disc — soft radial-gradient circle anchored at the bottom-right
 *      image corner. Uses each template's own CardStyle.fill color, fading
 *      from full opacity at the corner to transparent at the disc edge.
 *      Creates a natural vignette that makes the backing card look embedded
 *      in the ad rather than pasted on.
 *   2. Square backing card — sits centred on the glow disc origin.
 *   3. QR code — centred inside the backing card.
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
 * Glow disc geometry:
 *   discRadius = round(cardSize × DISC_RADIUS_MULTIPLIER)
 *   The disc centre is at the image corner (imgW, imgH). Only the upper-left
 *   quadrant of the disc is visible within the image bounds — appearing as a
 *   soft quarter-circle halo in the bottom-right corner of the ad.
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

  /**
   * Sentinel for the startup enforcement guard. Set this to `true` on any
   * temporary / placeholder entry — the server will refuse to start until a
   * real style replaces it. Never set on a production entry.
   */
  _placeholder?: true;
}


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
 * All 12 templates are finalized. Adding a new template key requires a real
 * CardStyle entry here — the startup guard below throws if any entry is missing.
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
  "home-elegance":     { fill: "#0f1f3d", border: "#c9a84c", borderWidth: 3, cornerRadius: 16, dashPattern: null },
  "purple-sage":       { fill: "#3d2f4a", border: "#9b7fb0", borderWidth: 3, cornerRadius: 16, dashPattern: null },
  "wok-fire":          { fill: "#1a1310", border: "#c9a84c", borderWidth: 3, cornerRadius: 0,  dashPattern: null },
  "surprise-me":       { fill: "#1c1a18", border: "#c9a84c", borderWidth: 2, cornerRadius: 0, dashPattern: null },
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

// ── Glow disc constant ────────────────────────────────────────────────────
/**
 * discRadius = round(cardSize × DISC_RADIUS_MULTIPLIER).
 * At 2.0× the disc extends one full card-width beyond each edge of the card,
 * giving a visible soft halo that frames the card without overwhelming it.
 */
const DISC_RADIUS_MULTIPLIER = 2.0;

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

// ── Startup enforcement: every registered template must have a real CardStyle ─
// This runs at module-load time. If any template key is missing from
// TEMPLATE_QR_STYLES (or was accidentally given a _placeholder entry), the
// server refuses to start rather than silently serving a generic white card.
// To add a new template: add its key + a real CardStyle to TEMPLATE_QR_STYLES.
{
  const missingStyles = Object.entries(TEMPLATE_QR_STYLES)
    .filter(([, s]) => s._placeholder)
    .map(([k]) => k);
  if (missingStyles.length > 0) {
    throw new Error(
      `compositeQr: missing real CardStyle for template(s): ${missingStyles.join(", ")}. ` +
      `Add a finalized entry to TEMPLATE_QR_STYLES before starting the server.`,
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

// ── Glow disc SVG builder ──────────────────────────────────────────────────

/**
 * Render a soft radial-gradient disc as a square SVG buffer.
 *
 * The disc centre is at the SVG's bottom-right corner (radius, radius), so
 * only the upper-left quadrant of the gradient circle is visible within the
 * SVG viewport. The gradient runs from `fillHex` at full opacity at the
 * centre to `fillHex` at zero opacity at the disc edge — producing a smooth
 * quarter-circle vignette with no hard outline.
 *
 * Place the resulting buffer at (imgW − radius, imgH − radius) to align the
 * disc centre with the image's bottom-right corner pixel.
 *
 * @param radius   Disc radius in pixels; also the SVG width and height.
 * @param fillHex  Fill colour as a hex string (e.g. "#1A2744"). Should match
 *                 the template's CardStyle.fill for visual coherence.
 */
function makeGlowDiscSvg(radius: number, fillHex: string): Buffer {
  const svg =
    `<svg width="${radius}" height="${radius}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs>` +
    `<radialGradient id="g" cx="${radius}" cy="${radius}" r="${radius}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0%" stop-color="${fillHex}" stop-opacity="1"/>` +
    `<stop offset="100%" stop-color="${fillHex}" stop-opacity="0"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect width="${radius}" height="${radius}" fill="url(#g)"/>` +
    `</svg>`;
  return Buffer.from(svg);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Composite a soft glow disc + real scannable QR code onto an ad image.
 *
 * Compositing order (bottom to top):
 *   1. Glow disc — soft radial-gradient quarter-circle at the bottom-right
 *      image corner, using the template's own CardStyle.fill colour.
 *   2. Square backing card centred over the disc origin.
 *   3. QR code centred inside the backing card.
 *
 * @param imageBuffer  JPEG buffer of the ad (already cropped to print dims)
 * @param trackingUrl  Full URL the QR should encode, e.g. "https://app.com/go/slug"
 * @param spotSize     Spot size key; controls card/QR pixel sizes and placement
 * @param style        Optional card visual style; defaults to white + burgundy border
 * @returns            JPEG buffer (98 % quality) with glow disc + backing card + QR composited
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

  // ── 3.5. Erase corner starburst with blur-extend fill ────────────────────
  // Visual measurement across 17 raw Grok images: starburst/badge shapes placed
  // in the bottom-right corner extend up to ≥564 px diagonal from that corner
  // (5 of 17 images exceeded the 400 px measurement crop; reliably measured
  // worst-case: 530 px). ERASE_ZONE sizes add a safety margin on top of that.
  //
  // Algorithm:
  //   1. Define a square erase zone anchored at the bottom-right corner.
  //   2. Extract a broader surrounding region (erase zone + 50% outward in
  //      both axes) so the blur samples clean non-starburst footer pixels
  //      at the edges of the sample.
  //   3. Apply a strong Gaussian blur (σ = 60) — at this sigma the colour
  //      from the surrounding clean strip bleeds into the starburst zone,
  //      producing a smooth, background-matching fill rather than a flat patch.
  //   4. Crop the blurred result to exactly the erase zone dimensions.
  //   5. Composite the blurred fill over the image corner → erasedBase.
  // The glow disc + QR card are then composited on top of erasedBase in step 4.
  const ERASE_ZONE_PX: Record<SizeKey, number> = { xl: 600, l: 480, m: 280, s: 280 };
  const eraseSize  = ERASE_ZONE_PX[spotSize] ?? 600;
  const eraseLeft  = Math.max(0, spec.imgW - eraseSize);
  const eraseTop   = Math.max(0, spec.imgH - eraseSize);
  const eraseW     = spec.imgW - eraseLeft;
  const eraseH     = spec.imgH - eraseTop;

  // Expand the sample region 50 % beyond the erase boundary so the blur mixes
  // in clean background pixels from outside the starburst area.
  const sampExtra  = Math.round(eraseSize * 0.50);
  const sampLeft   = Math.max(0, eraseLeft - sampExtra);
  const sampTop    = Math.max(0, eraseTop  - sampExtra);
  const sampW      = spec.imgW - sampLeft;
  const sampH      = spec.imgH - sampTop;

  // Blur the full sample region — PNG intermediate to avoid JPEG re-compression.
  const blurredSamp: Buffer = await sharp(imageBuffer)
    .extract({ left: sampLeft, top: sampTop, width: sampW, height: sampH })
    .blur(60)
    .png()
    .toBuffer();

  // Crop the blurred result to just the erase-zone footprint.
  const eraseFill: Buffer = await sharp(blurredSamp)
    .extract({
      left:   eraseLeft - sampLeft,
      top:    eraseTop  - sampTop,
      width:  eraseW,
      height: eraseH,
    })
    .png()
    .toBuffer();

  // Composite blurred fill over the starburst corner → use as base for step 4.
  const erasedBase: Buffer = await sharp(imageBuffer)
    .composite([{ input: eraseFill, left: eraseLeft, top: eraseTop }])
    .jpeg({ quality: 98, chromaSubsampling: "4:4:4" })
    .toBuffer();

  // ── 4. Composite glow disc then card+QR onto erasedBase (single pass) ─────
  // discRadius = cardSize × 2.0, extending one full card-width beyond each
  // card edge. The disc centre sits at the image corner (imgW, imgH) so only
  // the upper-left quadrant of the gradient circle is visible in the ad.
  const discRadius = Math.round(layout.cardSize * DISC_RADIUS_MULTIPLIER);
  const glowDiscPng = await sharp(makeGlowDiscSvg(discRadius, style.fill)).png().toBuffer();

  const compositedBuffer: Buffer = await sharp(erasedBase)
    .composite([
      // Layer 1 (bottom): soft gradient halo anchored at image corner.
      { input: glowDiscPng, left: spec.imgW - discRadius, top: spec.imgH - discRadius },
      // Layer 2 (top): backing card + QR centred on the disc origin.
      { input: cardWithQr, left: layout.cardLeft, top: layout.cardTop },
    ])
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

/**
 * Scan a raw image buffer for any QR code pattern using jsQR.
 * Returns true if jsQR decodes a QR code anywhere in the image.
 *
 * Used by the ad generator QR guard (adGenGrok.ts) to detect Grok-hallucinated
 * QR codes in the raw output BEFORE server-side compositing adds the real one.
 * Resizes to ≤800 px to keep the pixel array small and jsQR fast.
 */
export async function detectQrInBuffer(buf: Buffer): Promise<boolean> {
  const sharpMod = await (import("sharp") as Promise<any>);
  const sharp    = (sharpMod.default ?? sharpMod) as typeof import("sharp");
  const { data, info } = await sharp(buf)
    .resize(800, 800, { fit: "inside", withoutEnlargement: true })
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });
  const decoded = jsqr(new Uint8ClampedArray(data), info.width, info.height);
  return decoded !== null;
}
