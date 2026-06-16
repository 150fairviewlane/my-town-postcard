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

// 300 DPI canvas: 12" × 9" = 3600 × 2700 px (print-ready quality).
// Delivered as application/octet-stream so iOS saves to Files instead of
// trying to render inline (which caused a blank page at any resolution).
const W = 3600;
const H = 2700;

interface SlotRect { x: number; y: number; w: number; h: number }

// Each sellable spot → pixel rect on the 3600×2700 canvas.
// 1 inch = 300 px, 1 column = 1 inch = 300 px, 1 row = 1 inch = 300 px.
const FRONT_LAYOUT: Record<string, SlotRect> = {
  mb:  { x: 0,    y: 0,    w: 1200, h: 1500 },
  dn:  { x: 1200, y: 0,    w: 1200, h: 1500 },
  re:  { x: 2400, y: 0,    w: 1200, h: 1500 },
  l1:  { x: 0,    y: 1500, w: 900,  h: 1200 },
  l2:  { x: 900,  y: 1500, w: 900,  h: 1200 },
  l3:  { x: 1800, y: 1500, w: 900,  h: 1200 },
  l4:  { x: 2700, y: 1500, w: 900,  h: 1200 },
};

const BACK_LAYOUT: Record<string, SlotRect> = {
  bxl:  { x: 0,    y: 0,    w: 1200, h: 1500 },
  bxl2: { x: 1200, y: 0,    w: 1200, h: 1500 },
  bxl3: { x: 2400, y: 0,    w: 1200, h: 1500 },
  bm1:  { x: 0,    y: 1500, w: 900,  h: 600  },
  bm2:  { x: 900,  y: 1500, w: 900,  h: 600  },
  bm3:  { x: 1800, y: 1500, w: 900,  h: 600  },
  bm4:  { x: 2700, y: 1500, w: 900,  h: 600  },
  bs1:  { x: 0,    y: 2100, w: 600,  h: 600  },
};

// Load an image from either a data: URI or an https:// URL.
// Returns null on any failure so the caller can use a placeholder instead.
async function loadImageBuffer(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith("data:")) {
      // data:image/jpeg;base64,<payload>  or  data:image/png;base64,<payload>
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

    // Prefer adFileUrl; fall back to templateData.finishedAdUrl (base64 data URL)
    let imageUrl: string | null = spot?.adFileUrl ?? null;
    if (!imageUrl && spot?.templateData) {
      try {
        const td = JSON.parse(spot.templateData) as Record<string, unknown>;
        if (typeof td.finishedAdUrl === "string") imageUrl = td.finishedAdUrl;
      } catch {
        // malformed JSON — skip
      }
    }

    const rawBuf = imageUrl ? await loadImageBuffer(imageUrl) : null;

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
        templateData: spotsTable.templateData,
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
    // octet-stream + attachment: iOS treats this as a file download (saves to
    // Files app) instead of trying to render inline (which showed a blank page).
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
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
