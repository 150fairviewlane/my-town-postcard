import { Router, type IRouter } from "express";
import sharp from "sharp";
import PDFDocument from "pdfkit";
import { eq } from "drizzle-orm";
import { db, spotsTable } from "@workspace/db";
import jwt from "jsonwebtoken";

const router: IRouter = Router();
const JWT_SECRET = process.env.SESSION_SECRET || "localspot-secret";

// Accepts token via Authorization header OR ?tok= query param.
// The query-param fallback is required for window.open() on iOS Safari,
// which cannot send custom headers for direct URL navigations.
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

// 150 DPI canvas: 12" × 9" = 1800 × 1350 px.
// 300 DPI (9.7 MP) causes Safari's PDF renderer to show a blank page;
// 150 DPI (2.4 MP) renders correctly and is still sharp for proofing.
const W = 1800;
const H = 1350;

interface SlotRect { x: number; y: number; w: number; h: number }

// Each sellable spot → pixel rect on the 1800×1350 canvas.
// 1 inch = 150 px, 1 column = 1 inch = 150 px, 1 row = 1 inch = 150 px.
const FRONT_LAYOUT: Record<string, SlotRect> = {
  mb:  { x: 0,    y: 0,   w: 600, h: 750 },
  dn:  { x: 600,  y: 0,   w: 600, h: 750 },
  re:  { x: 1200, y: 0,   w: 600, h: 750 },
  l1:  { x: 0,    y: 750, w: 450, h: 600 },
  l2:  { x: 450,  y: 750, w: 450, h: 600 },
  l3:  { x: 900,  y: 750, w: 450, h: 600 },
  l4:  { x: 1350, y: 750, w: 450, h: 600 },
};

const BACK_LAYOUT: Record<string, SlotRect> = {
  bxl:  { x: 0,    y: 0,    w: 600, h: 750 },
  bxl2: { x: 600,  y: 0,    w: 600, h: 750 },
  bxl3: { x: 1200, y: 0,    w: 600, h: 750 },
  bm1:  { x: 0,    y: 750,  w: 450, h: 300 },
  bm2:  { x: 450,  y: 750,  w: 450, h: 300 },
  bm3:  { x: 900,  y: 750,  w: 450, h: 300 },
  bm4:  { x: 1350, y: 750,  w: 450, h: 300 },
  bs1:  { x: 0,    y: 1050, w: 300, h: 300 },
};

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

type SpotRow = { gridArea: string; adFileUrl: string | null; status: string };

async function buildSideImage(
  spots: SpotRow[],
  layout: Record<string, SlotRect>,
): Promise<Buffer> {
  const base = sharp({
    create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } },
  });

  const composites: sharp.OverlayOptions[] = [];

  for (const [gridArea, pos] of Object.entries(layout)) {
    const spot = spots.find((s) => s.gridArea === gridArea);
    const rawBuf = spot?.adFileUrl ? await fetchBuffer(spot.adFileUrl) : null;

    let tile: Buffer;
    if (rawBuf) {
      tile = await sharp(rawBuf)
        .resize(pos.w, pos.h, { fit: "cover", position: "centre" })
        .jpeg({ quality: 92 })
        .toBuffer();
    } else {
      tile = await sharp({
        create: { width: pos.w, height: pos.h, channels: 3, background: { r: 240, g: 240, b: 240 } },
      }).jpeg({ quality: 80 }).toBuffer();
    }

    composites.push({ input: tile, left: pos.x, top: pos.y });
  }

  return base.composite(composites).jpeg({ quality: 92 }).toBuffer();
}

// Collect a PDFKit doc into a Buffer before sending — streaming (doc.pipe)
// delivers partial bytes to iOS Safari which shows a blank page.
function buildPdfBuffer(
  drawFn: (doc: InstanceType<typeof PDFDocument>) => void,
  pageSize: [number, number],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: pageSize, margin: 0, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    drawFn(doc);
    doc.end();
  });
}

// Minimal test route — open /api/pdf-test on iPad to confirm PDF delivery works.
router.get("/pdf-test", async (_req: any, res: any) => {
  const PAGE: [number, number] = [864, 648];
  const buf = await buildPdfBuffer((doc) => {
    doc.rect(0, 0, 864, 648).fill("#1d4ed8");
    doc.fillColor("white").fontSize(56).text("PDF TEST OK", 220, 270);
  }, PAGE);
  res.removeHeader("Transfer-Encoding");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="test.pdf"');
  res.setHeader("Content-Length", buf.length);
  res.setHeader("Cache-Control", "no-store");
  res.end(buf);
});

// GET /api/admin/campaigns/:campaignId/download-pdf?side=front|back|both
// Uses window.open() on the frontend — iOS Safari displays it in the native
// PDF viewer (share sheet → Save to Files from there).
router.get("/admin/campaigns/:campaignId/download-pdf", requireAdmin, async (req: any, res: any) => {
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
    const spots = await db
      .select({
        gridArea: spotsTable.gridArea,
        adFileUrl: spotsTable.adFileUrl,
        status: spotsTable.status,
        side: spotsTable.side,
      })
      .from(spotsTable)
      .where(eq(spotsTable.campaignId, campaignId));

    req.log?.info({ spotCount: spots.length }, "pdf: spots fetched");

    const frontSpots = spots.filter((s) => (s.side ?? "front") === "front");
    const backSpots  = spots.filter((s) => s.side === "back");

    const doFront = side === "front" || side === "both";
    const doBack  = side === "back"  || side === "both";

    const [frontImg, backImg] = await Promise.all([
      doFront ? buildSideImage(frontSpots, FRONT_LAYOUT) : null,
      doBack  ? buildSideImage(backSpots,  BACK_LAYOUT)  : null,
    ]);

    req.log?.info(
      { frontBytes: frontImg?.length ?? 0, backBytes: backImg?.length ?? 0 },
      "pdf: images composited",
    );

    // 12" × 9" at 72pt/inch
    const PAGE: [number, number] = [864, 648];

    const pdfBuf = await buildPdfBuffer((doc) => {
      if (frontImg) {
        doc.image(frontImg, 0, 0, { width: 864, height: 648 });
      }
      if (backImg) {
        if (frontImg) doc.addPage({ size: PAGE, margin: 0 });
        doc.image(backImg, 0, 0, { width: 864, height: 648 });
      }
    }, PAGE);

    req.log?.info({ pdfBytes: pdfBuf.length }, "pdf: pdf built, sending");

    const filename = `postcard-campaign-${campaignId}-${side}.pdf`;
    res.removeHeader("Transfer-Encoding");
    res.setHeader("Content-Type", "application/pdf");
    // 'inline' tells Safari to show the PDF in its viewer rather than download
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuf.length);
    res.setHeader("Cache-Control", "no-store");
    res.end(pdfBuf);
  } catch (err: unknown) {
    req.log?.error({ err }, "PDF generation failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "PDF generation failed" });
    }
  }
});

export default router;
