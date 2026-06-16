import { Router, type IRouter } from "express";
import sharp from "sharp";
import PDFDocument from "pdfkit";
import { eq } from "drizzle-orm";
import { db, spotsTable } from "@workspace/db";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";

// QR code buffer for mytownpostcard.com — generated once, cached for the
// lifetime of the process so PDF requests don't regenerate it every time.
let _qrCache: Buffer | null = null;
async function getQrBuffer(): Promise<Buffer> {
  if (!_qrCache) {
    _qrCache = await QRCode.toBuffer("https://mytownpostcard.com", {
      type: "png",
      width: 400,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    }) as Buffer;
  }
  return _qrCache;
}

const router: IRouter = Router();
const JWT_SECRET = process.env.SESSION_SECRET || "localspot-secret";

function requireAdmin(req: any, res: any, next: any): void {
  const headerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  const queryToken = typeof req.query?.tok === "string" ? req.query.tok : null;
  const token = headerToken ?? queryToken;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

// ─── PDF page dimensions ──────────────────────────────────────────────────────
// 12.25" × 9.25" with 0.125" bleed on all four sides (72 pt/inch)
const PAGE: [number, number] = [882, 666];
const BLEED_PT = 9;    // 0.125" × 72 = 9 pt
const INSET_PT = 2.5;  // half of 5pt gray gap between spots
const BG_COLOR = "#c8c8c8";
const TRIM_COLOR = "#ff0000";

// ─── Spot definitions in picker's 100px/inch coordinate space ─────────────────
interface SpotDef { gridArea: string; x: number; y: number; w: number; h: number }

const FRONT_SPOTS: SpotDef[] = [
  { gridArea: "mb",  x: 0,   y: 0,   w: 400, h: 500 },
  { gridArea: "dn",  x: 400, y: 0,   w: 400, h: 500 },
  { gridArea: "re",  x: 800, y: 0,   w: 400, h: 500 },
  { gridArea: "l1",  x: 0,   y: 500, w: 300, h: 400 },
  { gridArea: "l2",  x: 300, y: 500, w: 300, h: 400 },
  { gridArea: "l3",  x: 600, y: 500, w: 300, h: 400 },
  { gridArea: "l4",  x: 900, y: 500, w: 300, h: 400 },
];

const BACK_SPOTS: SpotDef[] = [
  { gridArea: "bxl",  x: 0,   y: 0,   w: 400, h: 500 },
  { gridArea: "bxl2", x: 400, y: 0,   w: 400, h: 500 },
  { gridArea: "bxl3", x: 800, y: 0,   w: 400, h: 500 },
  { gridArea: "bm1",  x: 0,   y: 500, w: 300, h: 200 },
  { gridArea: "bm2",  x: 300, y: 500, w: 300, h: 200 },
  { gridArea: "bm3",  x: 600, y: 500, w: 300, h: 200 },
  { gridArea: "bm4",  x: 900, y: 500, w: 300, h: 200 },
  { gridArea: "bs1",  x: 0,   y: 700, w: 200, h: 200 },
];

// House ad and EDDM occupy fixed positions on the back — not sold, drawn as vectors
const HOUSE_AD: Omit<SpotDef, "gridArea"> = { x: 200, y: 700, w: 600, h: 200 };
const EDDM_BLOCK: Omit<SpotDef, "gridArea"> = { x: 800, y: 700, w: 400, h: 200 };

// ─── Coordinate helpers ───────────────────────────────────────────────────────

// Convert picker 100px/inch rect → PDF points with bleed offset + gap inset
function toPts(s: { x: number; y: number; w: number; h: number }) {
  return {
    x: (s.x / 100) * 72 + BLEED_PT + INSET_PT,
    y: (s.y / 100) * 72 + BLEED_PT + INSET_PT,
    w: (s.w / 100) * 72 - 2 * INSET_PT,
    h: (s.h / 100) * 72 - 2 * INSET_PT,
  };
}

// Pixel dimensions for sharp resize at 300 DPI
function toPx300(s: { w: number; h: number }) {
  return {
    w: Math.round((s.w / 100) * 300),
    h: Math.round((s.h / 100) * 300),
  };
}

// ─── Image loading ────────────────────────────────────────────────────────────

async function loadImageBuffer(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith("data:")) {
      const commaIdx = url.indexOf(",");
      if (commaIdx === -1) return null;
      return Buffer.from(url.slice(commaIdx + 1), "base64");
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

type SpotRow = {
  gridArea: string;
  adFileUrl: string | null;
  templateData: string | null;
  status: string;
};

function resolveImageUrl(dbSpot: SpotRow | undefined): string | null {
  if (!dbSpot) return null;
  if (dbSpot.adFileUrl) return dbSpot.adFileUrl;
  if (dbSpot.templateData) {
    try {
      const td = JSON.parse(dbSpot.templateData) as Record<string, unknown>;
      if (typeof td.finishedAdUrl === "string") return td.finishedAdUrl;
    } catch { /* malformed JSON */ }
  }
  return null;
}

// ─── PDF drawing ──────────────────────────────────────────────────────────────

function drawPageChrome(doc: any): void {
  // Gray background extends to full bleed
  doc.rect(0, 0, PAGE[0], PAGE[1]).fill(BG_COLOR);
  // Red trim-line guide (printer crop marks)
  doc.rect(BLEED_PT, BLEED_PT, 864, 648).lineWidth(0.5).undash().stroke(TRIM_COLOR);
}

function drawHouseAd(doc: any): void {
  const c = toPts(HOUSE_AD);
  doc.rect(c.x, c.y, c.w, c.h).fill("#0f172a");
  const midY = c.y + c.h / 2;
  doc.fillColor("#ffffff")
    .fontSize(16)
    .font("Helvetica-Bold")
    .text("Shop, Dine & Buy Local", c.x, midY - 16, { width: c.w, align: "center" });
  doc.fontSize(10)
    .font("Helvetica")
    .fillColor("#ef4444")
    .text("mytownpostcard.com", c.x, midY + 4, { width: c.w, align: "center" });
}

function drawEddm(doc: any): void {
  const c = toPts(EDDM_BLOCK);
  doc.rect(c.x, c.y, c.w, c.h).fill("#ffffff");
  // Postal circle
  const cx = c.x + c.w / 2;
  const circleY = c.y + 28;
  doc.circle(cx, circleY, 22).lineWidth(2).stroke("#374151");
  // Indicia text
  const textTop = c.y + 54;
  doc.fillColor("#374151")
    .fontSize(7)
    .font("Helvetica-Bold")
    .text("PRESORTED STD",         c.x, textTop,      { width: c.w, align: "center" })
    .text("U.S. POSTAGE PAID",     c.x, textTop + 11, { width: c.w, align: "center" })
    .text("CLARKESVILLE, GA 30523",c.x, textTop + 22, { width: c.w, align: "center" })
    .text("LOCAL POSTAL CUSTOMER", c.x, textTop + 33, { width: c.w, align: "center" })
    .fontSize(9)
    .font("Helvetica-Bold")
    .text("EDDM",                  c.x, textTop + 47, { width: c.w, align: "center" });
}

async function drawSpots(
  doc: any,
  defs: SpotDef[],
  dbSpots: SpotRow[],
): Promise<void> {
  // Generate QR code once per PDF build (cached across calls in this process)
  const qrPng = await getQrBuffer();

  for (const def of defs) {
    const dbSpot = dbSpots.find((s) => s.gridArea === def.gridArea);
    const imageUrl = resolveImageUrl(dbSpot);
    const rawBuf = imageUrl ? await loadImageBuffer(imageUrl) : null;
    const c = toPts(def);
    const px = toPx300(def);

    if (rawBuf) {
      // QR code: 15% of the spot's shorter side, min 60px, with padding
      const qrSizePx = Math.max(60, Math.round(Math.min(px.w, px.h) * 0.15));
      const paddingPx = Math.max(8, Math.round(qrSizePx * 0.08));
      const qrResized = await sharp(qrPng)
        .resize(qrSizePx, qrSizePx)
        .png()
        .toBuffer();

      const imgBuf = await sharp(rawBuf)
        .resize(px.w, px.h, { fit: "fill" })
        .composite([{
          input: qrResized,
          left: px.w - qrSizePx - paddingPx,
          top:  px.h - qrSizePx - paddingPx,
        }])
        .jpeg({ quality: 92 })
        .toBuffer();

      doc.image(imgBuf, c.x, c.y, { width: c.w, height: c.h });
    } else {
      // Placeholder: light gray rectangle
      doc.rect(c.x, c.y, c.w, c.h).fill("#e5e7eb");
    }
  }
}

// ─── PDF buffer builder ───────────────────────────────────────────────────────

function buildPdfBuffer(
  drawFn: (doc: InstanceType<typeof PDFDocument>) => Promise<void>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: PAGE, margin: 0, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    drawFn(doc).then(() => doc.end()).catch(reject);
  });
}

// ─── Test route ───────────────────────────────────────────────────────────────

router.get("/pdf-test", async (_req: any, res: any) => {
  const buf = await buildPdfBuffer(async (doc) => {
    doc.rect(0, 0, PAGE[0], PAGE[1]).fill("#1d4ed8");
    doc.fillColor("white").fontSize(56).text("PDF TEST OK", 230, 290);
  });
  res.removeHeader("Transfer-Encoding");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="test.pdf"');
  res.setHeader("Content-Length", buf.length);
  res.setHeader("Cache-Control", "no-store");
  res.end(buf);
});

// ─── Main download route ──────────────────────────────────────────────────────
// GET /api/admin/campaigns/:campaignId/download-pdf?side=front|back|both&tok=…
// Fetches as blob on the frontend (fetch → blob URL → <a>.click()), delivered
// as octet-stream so iOS saves to Files app rather than trying to render inline.

router.get(
  "/admin/campaigns/:campaignId/download-pdf",
  requireAdmin,
  async (req: any, res: any) => {
    const campaignId = Number(req.params.campaignId);
    const side = ((req.query?.side as string) ?? "both") as "front" | "back" | "both";

    if (!Number.isFinite(campaignId) || campaignId <= 0) {
      res.status(400).json({ error: "Invalid campaign ID" });
      return;
    }
    if (!["front", "back", "both"].includes(side)) {
      res.status(400).json({ error: "side must be front | back | both" });
      return;
    }

    req.log?.info({ campaignId, side }, "pdf: request received");

    try {
      const allSpots = await db
        .select({
          gridArea: spotsTable.gridArea,
          adFileUrl: spotsTable.adFileUrl,
          templateData: spotsTable.templateData,
          status: spotsTable.status,
          side: spotsTable.side,
        })
        .from(spotsTable)
        .where(eq(spotsTable.campaignId, campaignId));

      req.log?.info({ spotCount: allSpots.length }, "pdf: spots fetched");

      const frontSpots = allSpots.filter((s) => (s.side ?? "front") === "front");
      const backSpots  = allSpots.filter((s) => s.side === "back");
      const doFront = side === "front" || side === "both";
      const doBack  = side === "back"  || side === "both";

      const pdfBuf = await buildPdfBuffer(async (doc) => {
        if (doFront) {
          drawPageChrome(doc);
          await drawSpots(doc, FRONT_SPOTS, frontSpots);
        }
        if (doBack) {
          if (doFront) doc.addPage({ size: PAGE, margin: 0 });
          drawPageChrome(doc);
          await drawSpots(doc, BACK_SPOTS, backSpots);
          drawHouseAd(doc);
          drawEddm(doc);
        }
      });

      req.log?.info({ pdfBytes: pdfBuf.length }, "pdf: built, sending");

      const filename = `postcard-campaign-${campaignId}-${side}-PRINT.pdf`;
      res.removeHeader("Transfer-Encoding");
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuf.length);
      res.setHeader("Cache-Control", "no-store");
      res.end(pdfBuf);
    } catch (err: unknown) {
      req.log?.error({ err }, "pdf: generation failed");
      if (!res.headersSent) {
        res.status(500).json({
          error: "PDF generation failed",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
  },
);

export default router;
