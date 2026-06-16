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

// 300 DPI canvas: 12" × 9" = 3600 × 2700 px
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

// GET /api/admin/campaigns/:campaignId/download-pdf?side=front|back|both
// iOS Safari requires a direct GET URL — blob/anchor.click() pattern doesn't work on iPad.
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

    const frontSpots = spots.filter((s) => (s.side ?? "front") === "front");
    const backSpots  = spots.filter((s) => s.side === "back");

    const doFront = side === "front" || side === "both";
    const doBack  = side === "back"  || side === "both";

    // Build composited images first (can be slow — fetch from Cloudinary)
    const [frontImg, backImg] = await Promise.all([
      doFront ? buildSideImage(frontSpots, FRONT_LAYOUT) : null,
      doBack  ? buildSideImage(backSpots,  BACK_LAYOUT)  : null,
    ]);

    // PDF page size in points: 12" × 9" at 72pt/inch
    const PAGE_W = 12 * 72; // 864pt
    const PAGE_H =  9 * 72; // 648pt

    const filename = `postcard-campaign-${campaignId}-${side}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: true });
    doc.pipe(res);

    if (frontImg) {
      doc.image(frontImg, 0, 0, { width: PAGE_W, height: PAGE_H });
    }
    if (backImg) {
      if (frontImg) doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
      doc.image(backImg, 0, 0, { width: PAGE_W, height: PAGE_H });
    }

    doc.end();
  } catch (err: unknown) {
    req.log?.error({ err }, "PDF generation failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "PDF generation failed" });
    }
  }
});

export default router;
