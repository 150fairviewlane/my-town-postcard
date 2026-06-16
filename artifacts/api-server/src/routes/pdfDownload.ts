import { Router, type IRouter } from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import PDFDocument from "pdfkit";
import { eq } from "drizzle-orm";
import { db, spotsTable, campaignsTable } from "@workspace/db";
import jwt from "jsonwebtoken";

const router: IRouter = Router();
const JWT_SECRET = process.env.SESSION_SECRET || "localspot-secret";

// Absolute path to the mailbox logo in the frontend public folder.
// import.meta.url is the source file's URL regardless of CWD, so this
// resolves correctly whether the API server is launched from the workspace
// root or from artifacts/api-server.
const LOGO_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../localspot/public/mailbox-logo.png",
);

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

async function loadLocalFile(absolutePath: string): Promise<Buffer | null> {
  try {
    const buf = await fs.readFile(absolutePath);
    return buf;
  } catch (err) {
    // Log so we can see which path failed in server logs
    process.stderr.write(`loadLocalFile failed: ${absolutePath} — ${String(err)}\n`);
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
  doc.rect(0, 0, PAGE[0], PAGE[1]).fill(BG_COLOR);
}

// Draw house ad matching the picker's AdHouse component:
//   Top ~44%: cream bg (#f4f3ef), mailbox logo, red divider, "My Town Postcard" + tagline
//   Bottom ~56%: navy bg (#0d1d36), "ADVERTISE HERE!", 3 label columns, QR code
async function drawHouseAd(
  doc: any,
  logoBuffer: Buffer | null,
  qrBuffer: Buffer | null,
): Promise<void> {
  const c = toPts(HOUSE_AD);

  const topH = Math.round(c.h * 0.44); // ~61 pt  (cream section)
  const botH = c.h - topH;             // ~78 pt  (navy section)
  const botY = c.y + topH;

  // ── Top section (cream) ──────────────────────────────────────────────────
  doc.rect(c.x, c.y, c.w, topH).fill("#f4f3ef");

  let contentStartX = c.x + 8;

  if (logoBuffer) {
    try {
      const meta = await sharp(logoBuffer).metadata();
      const aspect = (meta.width ?? 1) / (meta.height ?? 1);
      const logoH = topH - 8;
      const logoW = Math.round(logoH * aspect);
      const jpgBuf = await sharp(logoBuffer)
        .resize(logoW * 3, logoH * 3)
        .jpeg({ quality: 92 })
        .toBuffer();
      doc.image(jpgBuf, c.x + 8, c.y + 4, { width: logoW, height: logoH });
      contentStartX = c.x + 8 + logoW + 8;
    } catch {
      // Fall through to text-only brand block
    }
  }

  // Red vertical divider
  const divH = Math.round(topH * 0.65);
  const divY = c.y + Math.round(topH * 0.175);
  doc.rect(contentStartX, divY, 2, divH).fill("#991b1b");

  // Brand text to the right of divider
  const brandX = contentStartX + 7;
  const brandW = c.x + c.w - brandX - 6;

  // "My Town Postcard" — two-color inline via two text calls on same line
  const nameY = c.y + Math.round(topH * 0.22);
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#0d1d36")
    .text("My Town ", brandX, nameY, { continued: true, lineBreak: false });
  doc.fillColor("#991b1b").text("Postcard", { lineBreak: false });

  // Tagline
  doc.font("Helvetica").fontSize(7).fillColor("#0d1d36")
    .text("LOCAL REACH.  REAL RESULTS.", brandX, nameY + 18, {
      width: brandW,
      characterSpacing: 1.5,
    });

  // ── Bottom section (navy) ────────────────────────────────────────────────
  doc.rect(c.x, botY, c.w, botH).fill("#0d1d36");

  // "ADVERTISE HERE!" — left side, large Impact-style (Helvetica-Bold)
  const advX = c.x + 8;
  const advFontSize = Math.round(botH * 0.21);
  doc.font("Helvetica-Bold").fontSize(advFontSize).fillColor("#ffffff")
    .text("ADVERTISE", advX, botY + Math.round(botH * 0.1), { lineBreak: false });
  doc.text("HERE!", advX, botY + Math.round(botH * 0.1) + advFontSize + 2, { lineBreak: false });

  // QR code — right side
  const qrSize = Math.round(botH * 0.62); // ~48 pt
  const qrPad = 4;
  const qrX = c.x + c.w - qrSize - 10;
  const qrY = botY + Math.round((botH - qrSize - 12) / 2);

  if (qrBuffer) {
    try {
      const qrJpg = await sharp(qrBuffer)
        .resize(qrSize * 3, qrSize * 3)
        .jpeg({ quality: 88 })
        .toBuffer();
      // White padding box
      doc.rect(qrX - qrPad, qrY - qrPad, qrSize + qrPad * 2, qrSize + qrPad * 2)
        .fill("#ffffff");
      doc.image(qrJpg, qrX, qrY, { width: qrSize, height: qrSize });
      // "Scan to advertise" caption
      doc.font("Helvetica").fontSize(5.5).fillColor("#ffffff").fillOpacity(0.65)
        .text("Scan to advertise", qrX - qrPad, qrY + qrSize + qrPad + 2, {
          width: qrSize + qrPad * 2,
          align: "center",
        });
      doc.fillOpacity(1);
    } catch { /* skip QR if resize fails */ }
  }

  // Three label columns between "ADVERTISE HERE!" and QR
  const advEndX = advX + 70; // approx right edge of ADVERTISE HERE! text
  const colsRight = qrBuffer ? qrX - 10 : c.x + c.w - 10;
  const colsW = colsRight - advEndX;

  if (colsW > 30) {
    const colW = colsW / 3;
    const labels = [
      ["Reach 5,000", "Homes In", "Your Town"],
      ["USPS Every", "Door Direct", "Mail"],
      ["Targeted.", "Local.", "Effective."],
    ];

    labels.forEach((lines, i) => {
      const colX = advEndX + i * colW;

      // Thin white vertical divider before each column (except first)
      if (i > 0) {
        doc.rect(colX, botY + Math.round(botH * 0.14), 1, Math.round(botH * 0.72))
          .fillOpacity(0.35).fill("#ffffff").fillOpacity(1);
      }

      // Red circle "icon" placeholder
      const circR = Math.round(botH * 0.13);
      const circCX = colX + colW / 2;
      const circCY = botY + circR + Math.round(botH * 0.1);
      doc.circle(circCX, circCY, circR).fill("#c41c1c");

      // Column label text
      const labelY = circCY + circR + 4;
      doc.font("Helvetica").fontSize(6).fillColor("#ffffff")
        .text(lines.join("\n"), colX + 2, labelY, {
          width: colW - 4,
          align: "center",
          lineGap: 0.5,
        });
    });
  }
}

// Draw EDDM block matching the picker's AdEDDM component:
//   Light gray bg (#f8f8f8), gray border, two concentric circles at top center,
//   postal indicia text below with divider before LOCAL POSTAL CUSTOMER / EDDM.
function drawEddm(doc: any, eddmCity: string, eddmZip: string): void {
  const c = toPts(EDDM_BLOCK);

  // Background
  doc.rect(c.x, c.y, c.w, c.h).fill("#f8f8f8");
  // Border (inset by half lineWidth so it stays inside the rect)
  doc.rect(c.x + 1, c.y + 1, c.w - 2, c.h - 2).lineWidth(1.5).stroke("#aaaaaa");

  // Two concentric circles centered horizontally in the upper portion
  const cx = c.x + c.w / 2;
  const outerR = 22;
  const innerR = 13;
  const circCY = c.y + 32;

  // Outer circle — solid stroke
  doc.circle(cx, circCY, outerR).lineWidth(2).stroke("#555555");

  // Inner circle — dashed stroke
  doc.circle(cx, circCY, innerR).dash(3, { space: 2 }).lineWidth(1.5).stroke("#555555");
  doc.undash(); // restore solid stroke for subsequent drawing

  // Postal text below circles
  const textTop = circCY + outerR + 7;
  const textW = c.w - 16;
  const textX = c.x + 8;

  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#333333")
    .text("PRESORTED STD",     textX, textTop,      { width: textW, align: "center", characterSpacing: 0.8 })
    .text("U.S. POSTAGE PAID", textX, textTop + 11, { width: textW, align: "center", characterSpacing: 0.8 })
    .text(`${eddmCity.toUpperCase()}, GA ${eddmZip}`, textX, textTop + 22, { width: textW, align: "center", characterSpacing: 0.8 });

  // Horizontal divider
  const divY = textTop + 33;
  doc.moveTo(textX + 12, divY).lineTo(textX + textW - 12, divY)
    .lineWidth(0.75).stroke("#cccccc");

  // LOCAL POSTAL CUSTOMER + EDDM
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#333333")
    .text("LOCAL POSTAL CUSTOMER", textX, divY + 5, { width: textW, align: "center", characterSpacing: 0.8 });
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333")
    .text("EDDM", textX, divY + 17, { width: textW, align: "center", characterSpacing: 2.5 });
}

async function drawSpots(
  doc: any,
  defs: SpotDef[],
  dbSpots: SpotRow[],
): Promise<void> {
  for (const def of defs) {
    const dbSpot = dbSpots.find((s) => s.gridArea === def.gridArea);
    const imageUrl = resolveImageUrl(dbSpot);
    const rawBuf = imageUrl ? await loadImageBuffer(imageUrl) : null;
    const c = toPts(def);
    const px = toPx300(def);

    if (rawBuf) {
      const imgBuf = await sharp(rawBuf)
        .resize(px.w, px.h, { fit: "fill" })
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
      const doFront = side === "front" || side === "both";
      const doBack  = side === "back"  || side === "both";

      // Fetch spots and campaign info in parallel
      const [allSpots, [campaign]] = await Promise.all([
        db
          .select({
            gridArea: spotsTable.gridArea,
            adFileUrl: spotsTable.adFileUrl,
            templateData: spotsTable.templateData,
            status: spotsTable.status,
            side: spotsTable.side,
          })
          .from(spotsTable)
          .where(eq(spotsTable.campaignId, campaignId)),
        db
          .select({
            zipCode: campaignsTable.zipCode,
            cityList: campaignsTable.cityList,
            territory: campaignsTable.territory,
          })
          .from(campaignsTable)
          .where(eq(campaignsTable.id, campaignId))
          .limit(1),
      ]);

      req.log?.info({ spotCount: allSpots.length }, "pdf: spots fetched");

      // Derive EDDM city from cityList → territory → fallback
      const rawCity =
        campaign?.cityList?.split(",")[0]?.trim() ||
        campaign?.territory?.split(",")[0]?.trim() ||
        "Clarkesville";
      const eddmCity = rawCity;
      const eddmZip  = campaign?.zipCode || "30523";

      // Pre-fetch assets needed for back-side static blocks
      let logoBuffer: Buffer | null = null;
      let qrBuffer: Buffer | null = null;
      if (doBack) {
        [logoBuffer, qrBuffer] = await Promise.all([
          loadLocalFile(LOGO_PATH),
          loadImageBuffer(
            "https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=" +
              encodeURIComponent("https://mytownpostcard.com"),
          ),
        ]);
        req.log?.info({ hasLogo: !!logoBuffer, hasQr: !!qrBuffer }, "pdf: assets loaded");
      }

      const frontSpots = allSpots.filter((s) => (s.side ?? "front") === "front");
      const backSpots  = allSpots.filter((s) => s.side === "back");

      const pdfBuf = await buildPdfBuffer(async (doc) => {
        if (doFront) {
          drawPageChrome(doc);
          await drawSpots(doc, FRONT_SPOTS, frontSpots);
        }
        if (doBack) {
          if (doFront) doc.addPage({ size: PAGE, margin: 0 });
          drawPageChrome(doc);
          await drawSpots(doc, BACK_SPOTS, backSpots);
          await drawHouseAd(doc, logoBuffer, qrBuffer);
          drawEddm(doc, eddmCity, eddmZip);
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
