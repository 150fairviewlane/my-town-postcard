/**
 * compositeQr.ts — server-side QR code compositing for Grok-generated ads.
 *
 * Generates a real, scannable QR code PNG (ECL H) and composites it onto a
 * JPEG image buffer at a fixed location in the footer bottom-right corner.
 * After compositing, a programmatic decode step verifies the QR is scannable
 * and encodes the expected URL — throws if the verification fails.
 */

import QRCode from "qrcode";
import jsqr from "jsqr";

export type SizeKey = "xl" | "l" | "m" | "s";

/**
 * Per-size QR placement lookup.
 * All pixel dimensions match the CROP_DIMS used in adGenGrok.ts at 300 DPI:
 *   xl  → 1200 × 1500   l → 900 × 1200   m → 900 × 600   s → 600 × 600
 * qrSize is the total rendered QR PNG size (modules + quiet zone included).
 * right/bottom are the pixel margins from the image edge.
 */
interface QrPlacement {
  qrSize: number; // total QR PNG side length in pixels
  right: number;  // distance from right edge of image
  bottom: number; // distance from bottom edge of image
  imgW: number;   // expected image width (sanity reference)
  imgH: number;   // expected image height
}

export const QR_PLACEMENT: Record<SizeKey, QrPlacement> = {
  xl: { qrSize: 180, right: 20, bottom: 20, imgW: 1200, imgH: 1500 },
  l:  { qrSize: 130, right: 16, bottom: 16, imgW: 900,  imgH: 1200 },
  m:  { qrSize: 90,  right: 12, bottom: 12, imgW: 900,  imgH: 600  },
  s:  { qrSize: 90,  right: 12, bottom: 12, imgW: 600,  imgH: 600  },
};

/**
 * Composite a real, scannable QR code onto an ad image buffer.
 *
 * @param imageBuffer  - JPEG buffer of the ad (already cropped to print dims)
 * @param trackingUrl  - Full URL the QR should encode, e.g. "https://app.com/go/slug"
 * @param spotSize     - Spot size key; controls QR pixel size and placement coordinates
 * @returns            - JPEG buffer (98% quality) with QR composited in footer bottom-right
 * @throws             - If QR generation fails or the post-composite decode check fails
 */
export async function compositeQrOnto(
  imageBuffer: Buffer,
  trackingUrl: string,
  spotSize: SizeKey,
): Promise<Buffer> {
  const sharpMod = await (import("sharp") as Promise<any>);
  const sharp = (sharpMod.default ?? sharpMod) as typeof import("sharp");

  const placement = QR_PLACEMENT[spotSize] ?? QR_PLACEMENT.xl;

  // ── Generate QR PNG ────────────────────────────────────────────────────────
  // ECL H (30% recovery capacity) ensures the QR is still scannable even when
  // partially obscured by logo/creative overlays or print imperfections.
  // margin:4 = 4 QR modules of quiet zone on every side (ISO 18004 minimum).
  const qrPng: Buffer = await QRCode.toBuffer(trackingUrl, {
    errorCorrectionLevel: "H",
    type: "png",
    width: placement.qrSize, // total output size including quiet zone
    margin: 4,
    color: { dark: "#000000", light: "#ffffff" },
  });

  // ── Composite position ─────────────────────────────────────────────────────
  const left = placement.imgW - placement.qrSize - placement.right;
  const top  = placement.imgH - placement.qrSize - placement.bottom;

  // ── Composite and re-encode ────────────────────────────────────────────────
  const compositedBuffer: Buffer = await sharp(imageBuffer)
    .composite([{ input: qrPng, top, left }])
    .jpeg({ quality: 98, chromaSubsampling: "4:4:4" })
    .toBuffer();

  // ── Decode-verify ─────────────────────────────────────────────────────────
  // Extract raw RGBA pixels from the composited JPEG and confirm the QR
  // is scannable and encodes the exact expected URL.
  const { data: rawPixels, info } = await sharp(compositedBuffer)
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const decoded = jsqr(
    new Uint8ClampedArray(rawPixels),
    info.width,
    info.height,
  );

  if (!decoded) {
    throw new Error(
      `compositeQrOnto: QR decode verification failed — the QR was not detected in the composited image. ` +
      `Check quiet zone, qrSize, and placement for spotSize="${spotSize}". ` +
      `Placement: left=${left}, top=${top}, qrSize=${placement.qrSize}.`,
    );
  }

  if (decoded.data !== trackingUrl) {
    throw new Error(
      `compositeQrOnto: QR content mismatch — ` +
      `expected "${trackingUrl}" but decoded "${decoded.data}". ` +
      `This indicates a QR generation error.`,
    );
  }

  return compositedBuffer;
}
