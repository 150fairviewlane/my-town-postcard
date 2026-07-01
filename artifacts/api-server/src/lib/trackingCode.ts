import jsqr from "jsqr";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { db, spotsTable, campaignsTable, type Spot } from "@workspace/db";
import { compositeQrOnto, getTemplateQrStyle, QR_PLACEMENT, type SizeKey, type CardStyle } from "./compositeQr";
import { logger } from "./logger";

// Convert any string into a URL-safe lowercase slug. Strips accents, replaces
// runs of non-alphanumerics with a single dash, trims leading/trailing dashes,
// and caps length so we never produce monstrous codes.
function slugify(input: string, max: number): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

function randomSuffix(): string {
  // 4 chars of base36 → ~1.7M values; more than enough to break collisions
  // for businesses sharing the same slug + campaign.
  return Math.random().toString(36).slice(2, 6);
}

/**
 * Idempotently assign a tracking code to a spot.
 *
 * - Returns the existing code if one is already set (never regenerates).
 * - Otherwise generates a slug like `<business>-<campaign>` (e.g.
 *   `romas-pizza-spring2026`) and persists it.
 * - On a unique-constraint collision (two spots with the same business name
 *   in the same campaign — extremely rare), retries with a short random
 *   suffix until it lands a unique value or runs out of attempts.
 *
 * Safe to call from both the Stripe webhook and the synchronous
 * /checkout/confirm route — first writer wins, second one's UPDATE either
 * sees the same code already set (idempotent path) or fails with 23505 and
 * we re-fetch and return.
 */
export async function ensureTrackingCode(spot: Spot): Promise<string> {
  if (spot.trackingCode && spot.trackingCode.length > 0) {
    return spot.trackingCode;
  }

  const [campaign] = await db
    .select({ id: campaignsTable.id, name: campaignsTable.name })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, spot.campaignId))
    .limit(1);

  const bizSlug = slugify(spot.businessName ?? "", 40) || `spot-${spot.id}`;
  const campaignSlug =
    (campaign && slugify(campaign.name, 24)) || `c${spot.campaignId}`;
  const base = `${bizSlug}-${campaignSlug}`;

  let candidate = base;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const [updated] = await db
        .update(spotsTable)
        .set({ trackingCode: candidate })
        .where(eq(spotsTable.id, spot.id))
        .returning({ trackingCode: spotsTable.trackingCode });

      if (updated?.trackingCode) {
        return updated.trackingCode;
      }
      // Spot row vanished between the read and the write — surface clearly.
      throw new Error(
        `Spot ${spot.id} not found while assigning tracking code`,
      );
    } catch (err: any) {
      // 23505 = unique_violation. Either another writer set the same code
      // (re-fetch and return theirs) or our slug collides with an unrelated
      // spot's code (retry with a suffix).
      if (err?.code === "23505") {
        const [latest] = await db
          .select({ trackingCode: spotsTable.trackingCode })
          .from(spotsTable)
          .where(eq(spotsTable.id, spot.id))
          .limit(1);
        if (latest?.trackingCode) return latest.trackingCode;

        candidate = `${base}-${randomSuffix()}`;
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `Failed to generate a unique tracking code for spot ${spot.id} after multiple attempts`,
  );
}

/**
 * Detect the preview QR already embedded in `buf` with jsQR, then composite
 * a new tracking QR (encoding `trackingUrl`) at the exact detected centre —
 * no glow disc, no fixed-corner formula.
 *
 * Falls back to `compositeQrOnto` (fixed corner) only when jsQR cannot locate
 * the preview QR. After compositing, verifies the final image with jsQR:
 *   - No QR found   → logger.error (compositing failed entirely)
 *   - Wrong URL     → logger.error (old QR still dominant — double-QR risk)
 *   - Correct URL   → logger.info  (success)
 * Both error paths fall back to `compositeQrOnto` so a usable ad is always saved.
 */
async function replacePreviewQr(
  buf: Buffer,
  trackingUrl: string,
  sizeKey: SizeKey,
  style: CardStyle,
): Promise<Buffer> {
  const sharpMod = await (import("sharp") as Promise<any>);
  const sharp    = (sharpMod.default ?? sharpMod) as typeof import("sharp");

  // ── 1. Detect the preview QR bounding box ──────────────────────────────────
  const { data: rawPx, info } = await sharp(buf)
    .raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const detected = jsqr(new Uint8ClampedArray(rawPx), info.width, info.height);

  if (!detected) {
    logger.warn({ sizeKey }, "swapGrokQr: jsQR found no preview QR in stored image — falling back to fixed-corner");
    return compositeQrOnto(buf, trackingUrl, sizeKey, style);
  }

  // ── 2. Derive card placement from detected centre ──────────────────────────
  const tl = detected.location.topLeftCorner;
  const br = detected.location.bottomRightCorner;
  const cx = Math.round((tl.x + br.x) / 2);
  const cy = Math.round((tl.y + br.y) / 2);

  const spec        = QR_PLACEMENT[sizeKey] ?? QR_PLACEMENT.xl;
  const innerMargin = style.marginMultiplier ?? 1.0375;
  const cardSize    = Math.round(spec.qrSize * innerMargin);
  const qrSize      = spec.qrSize;
  const qrOffset    = Math.floor((cardSize - qrSize) / 2);
  const cardLeft    = Math.min(Math.max(0, cx - Math.floor(cardSize / 2)), info.width  - cardSize);
  const cardTop     = Math.min(Math.max(0, cy - Math.floor(cardSize / 2)), info.height - cardSize);

  logger.info(
    { sizeKey, cx, cy, cardLeft, cardTop, cardSize, qrSize, previewUrl: detected.data },
    "swapGrokQr: preview QR detected — replacing at detected centre",
  );

  // ── 3. Build tracking QR + backing card (no glow disc — already baked in) ──
  const qrPng: Buffer = await QRCode.toBuffer(trackingUrl, {
    errorCorrectionLevel: "H",
    type:   "png",
    width:  qrSize,
    margin: 4,
    color:  { dark: "#000000", light: "#ffffff" },
  });

  const effectiveCornerRadius = style.circularCard ? Math.floor(cardSize / 2) : style.cornerRadius;
  const sw          = style.borderWidth;
  const hasBorder   = sw > 0;
  const half        = hasBorder ? sw / 2 : 0;
  const inset       = hasBorder ? sw : 0;
  const strokeAttrs = hasBorder
    ? ` stroke="${style.border}" stroke-width="${sw}"${style.dashPattern ? ` stroke-dasharray="${style.dashPattern.join(" ")}"` : ""}`
    : "";
  const cardSvg = Buffer.from(
    `<svg width="${cardSize}" height="${cardSize}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="${half}" y="${half}" width="${cardSize - inset}" height="${cardSize - inset}" ` +
    `rx="${effectiveCornerRadius}" ry="${effectiveCornerRadius}" fill="${style.fill}"${strokeAttrs}/>` +
    `</svg>`,
  );
  const cardBase   = await sharp(cardSvg).png().toBuffer();
  const cardWithQr = await sharp(cardBase)
    .composite([{ input: qrPng, left: qrOffset, top: qrOffset }])
    .png()
    .toBuffer();

  // ── 4. Composite at detected position ─────────────────────────────────────
  const composited = await sharp(buf)
    .composite([{ input: cardWithQr, left: cardLeft, top: cardTop }])
    .jpeg({ quality: 98, chromaSubsampling: "4:4:4" })
    .toBuffer();

  // ── 5. Verify exactly one correct QR in the final image ───────────────────
  const { data: verPx, info: verInfo } = await sharp(composited)
    .raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const verDecoded = jsqr(new Uint8ClampedArray(verPx), verInfo.width, verInfo.height);

  if (!verDecoded) {
    logger.error(
      { sizeKey, cardLeft, cardTop, trackingUrl },
      "swapGrokQr: post-composite QR count=0 — no QR readable in final image; falling back to fixed-corner",
    );
    return compositeQrOnto(buf, trackingUrl, sizeKey, style);
  }

  if (verDecoded.data !== trackingUrl) {
    logger.error(
      { sizeKey, cardLeft, cardTop, expected: trackingUrl, got: verDecoded.data },
      "swapGrokQr: post-composite QR mismatch — old preview QR still dominant (double-QR risk); falling back to fixed-corner",
    );
    return compositeQrOnto(buf, trackingUrl, sizeKey, style);
  }

  logger.info(
    { sizeKey, cardLeft, cardTop, cardSize },
    "swapGrokQr: tracking QR composited and verified at detected position — single QR confirmed",
  );
  return composited;
}

/**
 * After a spot is marked paid and its tracking code is assigned, if the spot's
 * Grok-generated ad (stored as a data: URL in templateData.finishedAdUrl) still
 * carries a generic preview QR (pointing at the business website or the
 * mytownpostcard.com homepage), this function re-composites the real tracking QR
 * at the same pixel coordinates and updates the DB row.
 *
 * Safe to call concurrently — compositing at fixed coordinates is naturally
 * idempotent (second write produces identical pixels). Fire-and-forget from
 * both checkout.ts and webhooks.ts; callers must catch and warn-log.
 *
 * The existing order-INSERT race gate already ensures only one of the two callers
 * reaches this function per spot, but even if both ran the result would be identical.
 */
export async function swapGrokQrInTemplateData(spotId: number): Promise<void> {
  const [spot] = await db
    .select({
      trackingCode: spotsTable.trackingCode,
      templateData: spotsTable.templateData,
      size:         spotsTable.size,
    })
    .from(spotsTable)
    .where(eq(spotsTable.id, spotId))
    .limit(1);

  if (!spot?.trackingCode || !spot.templateData) return;

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(spot.templateData) as Record<string, unknown>; }
  catch { return; }

  const finishedAdUrl = parsed.finishedAdUrl;
  if (typeof finishedAdUrl !== "string" || !finishedAdUrl.startsWith("data:image")) return;

  // Prefer sizeKey stored in templateData (set by the Grok popup at save time);
  // fall back to spot.size from the DB if the field is missing.
  const sizeRaw = (typeof parsed.sizeKey === "string" ? parsed.sizeKey : spot.size ?? "").toLowerCase();
  const sizeKey: SizeKey =
    sizeRaw === "xl" || sizeRaw === "x-large" || sizeRaw === "xlarge" ? "xl" :
    sizeRaw === "l"  || sizeRaw === "large"                           ? "l"  :
    sizeRaw === "m"  || sizeRaw === "medium"                          ? "m"  :
    sizeRaw === "s"  || sizeRaw === "small"                           ? "s"  : "xl";

  // Read the template key stored at ad-generation time so the QR backing card
  // uses the correct per-template style rather than DEFAULT_CARD_STYLE.
  // Falls through to DEFAULT_CARD_STYLE via getTemplateQrStyle's own ?? fallback
  // when the field is genuinely absent or holds an unrecognized key — explicit,
  // not a silent default-parameter path.
  const templateKey = typeof parsed.template === "string" ? parsed.template : "";
  const qrStyle     = getTemplateQrStyle(templateKey);

  const trackingUrl = `${(process.env.APP_URL ?? "https://mytownpostcard.com").replace(/\/$/, "")}/go/${spot.trackingCode}`;
  const buf         = Buffer.from(finishedAdUrl.split(",")[1] ?? "", "base64");
  const composited  = await replacePreviewQr(buf, trackingUrl, sizeKey, qrStyle);
  const newDataUrl  = `data:image/jpeg;base64,${composited.toString("base64")}`;

  await db
    .update(spotsTable)
    .set({ templateData: JSON.stringify({ ...parsed, finishedAdUrl: newDataUrl }) })
    .where(eq(spotsTable.id, spotId));
}
