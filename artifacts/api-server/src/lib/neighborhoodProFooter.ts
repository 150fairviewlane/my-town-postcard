/**
 * neighborhoodProFooter.ts — programmatic footer compositor for the neighborhood-pro template.
 *
 * Pilot approach: instead of asking Grok to draw a footer with a QR placeholder
 * that later needs to be erased and re-composited, we:
 *   1. Take Grok's full-size output (same total dimensions as before).
 *   2. Crop the bottom NP_FOOTER_H[sizeKey] pixels — that is where Grok drew its
 *      imperfect footer. We throw that slice away.
 *   3. Sample the very last few pixel rows of the cropped art to get the exact
 *      seam color (Grok's green drifts slightly between calls).
 *   4. Build a clean programmatic footer: green background + lime accent bar +
 *      phone bullet + address bullet + real scannable QR code in a white card.
 *   5. Stack art + footer — total height is identical to the original CROP_DIMS.
 */

import QRCode from "qrcode";
import { logger } from "./logger.js";

export type SizeKey = "xl" | "l" | "m" | "s";

/** Pixels to strip from Grok's output and replace with the real footer. */
export const NP_FOOTER_H: Record<SizeKey, number> = {
  xl: 210,
  l:  168,
  m:  105,
  s:  105,
};

const LIME        = "#5ab84c";
const FALLBACK_BG = "#1d3a23";

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Sample the median RGB from the bottom 3 rows of artBuf.
 * Returns a #rrggbb hex string.
 * artBuf must be a Sharp-readable buffer already cropped to artH.
 */
async function sampleBottomColor(
  artBuf: Buffer,
  imgW:   number,
  artH:   number,
): Promise<string> {
  try {
    const sharp = (await import("sharp") as any).default ?? (await import("sharp"));
    const sampleH = 3;
    const raw = await sharp(artBuf)
      .extract({ left: 0, top: artH - sampleH, width: imgW, height: sampleH })
      .removeAlpha()
      .raw()
      .toBuffer();

    const reds: number[] = [], greens: number[] = [], blues: number[] = [];
    for (let i = 0; i < raw.length; i += 3) {
      reds.push(raw[i] as number);
      greens.push(raw[i + 1] as number);
      blues.push(raw[i + 2] as number);
    }
    const med = (arr: number[]) => {
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)] as number;
    };
    const r = med(reds), g = med(greens), b = med(blues);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  } catch (err) {
    logger.warn({ err }, "neighborhoodProFooter: bottom-edge sampling failed — using fallback color");
    return FALLBACK_BG;
  }
}

/** Render the footer strip as a JPEG buffer. */
async function buildFooterStrip(opts: {
  footerW: number;
  footerH: number;
  phone:   string;
  address: string;
  qrUrl:   string;
  bgHex:   string;
}): Promise<Buffer> {
  const sharp = (await import("sharp") as any).default ?? (await import("sharp"));
  const { footerW, footerH, phone, address, qrUrl, bgHex } = opts;

  const accentH    = Math.max(2, Math.round(footerH * 0.025));
  const bulletR    = Math.round(footerH * 0.11);
  const leftPad    = Math.round(footerH * 0.10);
  const fontSize   = Math.round(footerH * 0.20);
  const smallFont  = Math.round(footerH * 0.14);

  const bulletX    = leftPad + bulletR;
  const textX      = bulletX + bulletR + Math.round(leftPad * 0.6);

  const row1Y      = Math.round(footerH * 0.37);
  const row2Y      = Math.round(footerH * 0.73);
  const fontOff    = Math.round(fontSize  * 0.36);
  const smallOff   = Math.round(smallFont * 0.36);

  const qrSize     = Math.round(footerH * 0.64);
  const qrCardPad  = Math.round(footerH * 0.07);
  const qrCardSide = qrSize + qrCardPad * 2;
  const qrCardR    = Math.round(qrCardSide * 0.08);
  const rightPad   = leftPad;
  const qrCardX    = footerW - qrCardSide - rightPad;
  const qrCardY    = Math.round((footerH - qrCardSide) / 2);

  const maxTextW   = Math.max(10, qrCardX - textX - Math.round(leftPad * 0.5));

  const qrPng = await QRCode.toBuffer(qrUrl || "https://mytownpostcard.com", {
    errorCorrectionLevel: "H",
    type: "png",
    width: qrSize,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${footerW}" height="${footerH}">
  <rect width="${footerW}" height="${footerH}" fill="${bgHex}"/>
  <rect width="${footerW}" height="${accentH}" fill="${LIME}"/>

  <circle cx="${bulletX}" cy="${row1Y}" r="${bulletR}" fill="${LIME}"/>
  <text x="${textX}" y="${row1Y + fontOff}"
        font-family="Liberation Sans,DejaVu Sans,Arial,sans-serif"
        font-size="${fontSize}" font-weight="bold" fill="white"
        textLength="${maxTextW}" lengthAdjust="spacingAndGlyphs"
  >${escXml(phone || "")}</text>

  <circle cx="${bulletX}" cy="${row2Y}" r="${bulletR}" fill="${LIME}"/>
  <text x="${textX}" y="${row2Y + smallOff}"
        font-family="Liberation Sans,DejaVu Sans,Arial,sans-serif"
        font-size="${smallFont}" fill="white"
        textLength="${maxTextW}" lengthAdjust="spacingAndGlyphs"
  >${escXml(address || "")}</text>

  <rect x="${qrCardX}" y="${qrCardY}" width="${qrCardSide}" height="${qrCardSide}"
        fill="white" rx="${qrCardR}" ry="${qrCardR}"/>
</svg>`;

  const footerBase = await sharp(Buffer.from(svg)).png().toBuffer();

  return sharp(footerBase)
    .composite([{ input: qrPng, left: qrCardX + qrCardPad, top: qrCardY + qrCardPad }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

/**
 * Crop Grok's footer zone off the output, build a real footer, stack, return data-URL.
 *
 * @param grokBuf   Full-size Grok JPEG buffer (at CROP_DIMS dimensions).
 * @param sizeKey   Tier: "xl" | "l" | "m" | "s".
 * @param phone     Business phone string.
 * @param address   Full address string ("Street, City ST").
 * @param qrUrl     Tracking URL or preview URL for the QR code.
 * @returns         data:image/jpeg;base64,... at the original total dimensions.
 */
export async function buildNpFooterStack(
  grokBuf: Buffer,
  sizeKey: SizeKey,
  phone:   string,
  address: string,
  qrUrl:   string,
): Promise<string> {
  const sharp = (await import("sharp") as any).default ?? (await import("sharp"));

  const dimMap: Record<SizeKey, { w: number; h: number }> = {
    xl: { w: 1200, h: 1500 },
    l:  { w: 900,  h: 1200 },
    m:  { w: 900,  h: 600  },
    s:  { w: 600,  h: 600  },
  };

  const { w, h } = dimMap[sizeKey];
  const footerH  = NP_FOOTER_H[sizeKey];
  const artH     = h - footerH;

  const artBuf = await sharp(grokBuf)
    .extract({ left: 0, top: 0, width: w, height: artH })
    .jpeg({ quality: 95 })
    .toBuffer();

  const bgHex    = await sampleBottomColor(artBuf, w, artH);
  const footerBuf = await buildFooterStrip({ footerW: w, footerH, phone, address, qrUrl, bgHex });

  const finalBuf = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      { input: artBuf,    left: 0, top: 0     },
      { input: footerBuf, left: 0, top: artH  },
    ])
    .jpeg({ quality: 95 })
    .toBuffer();

  return `data:image/jpeg;base64,${finalBuf.toString("base64")}`;
}
