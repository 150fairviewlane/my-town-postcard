/**
 * findBrokenQrAds.ts
 *
 * Two checks, both must pass before a campaign batch goes to print:
 *
 * SECTION 1 — Legacy broken ads (pre-server-side QR compositing):
 *   Spots where ad_file_url is a Grok-generated base64 JPEG. These were
 *   generated before server-side QR compositing was added and contain an
 *   AI-drawn (non-scannable) QR placeholder. Needs a regeneration pass.
 *
 * SECTION 2 — Generic preview QR not yet swapped to real tracking QR:
 *   Paid spots with a real tracking code whose templateData.finishedAdUrl
 *   (Grok ad stored as a data: URL) still has a QR that decodes to either
 *   the business's own website or the mytownpostcard.com homepage, rather
 *   than the spot's real /go/<slug> tracking URL. Indicates the post-payment
 *   QR swap failed or didn't run. Needs a manual swap.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run find:broken-qr-ads
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { and, isNotNull, like, eq } from "drizzle-orm";
import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";
import sharp from "sharp";
import jsqr from "jsqr";

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

const { Pool } = pg;

// Minimal inline table definitions — keeps the script self-contained.
const spotsTable = pgTable("spots", {
  id:           serial("id").primaryKey(),
  campaignId:   integer("campaign_id").notNull(),
  businessName: text("business_name"),
  gridArea:     text("grid_area").notNull(),
  status:       text("status").notNull(),
  size:         text("size").notNull(),
  trackingCode: text("tracking_code"),
  adFileUrl:    text("ad_file_url"),
  templateData: text("template_data"),
});

const campaignsTable = pgTable("campaigns", {
  id:   serial("id").primaryKey(),
  name: text("name").notNull(),
});

// Mirror of compositeQr.ts QR_PLACEMENT — keep in sync with that file.
const QR_PLACEMENT: Record<string, { qrSize: number; right: number; bottom: number }> = {
  xl: { qrSize: 180, right: 20, bottom: 20 },
  l:  { qrSize: 130, right: 16, bottom: 16 },
  m:  { qrSize: 90,  right: 12, bottom: 12 },
  s:  { qrSize: 90,  right: 12, bottom: 12 },
};

function toSizeKey(raw: string | null | undefined): string {
  const lower = (raw ?? "").toLowerCase();
  if (lower === "xl" || lower === "x-large" || lower === "xlarge") return "xl";
  if (lower === "l"  || lower === "large")                          return "l";
  if (lower === "m"  || lower === "medium")                         return "m";
  if (lower === "s"  || lower === "small")                          return "s";
  return "xl";
}

async function decodeQrRegion(
  dataUrl: string,
  sizeKey: string,
): Promise<string | null> {
  const placement = QR_PLACEMENT[sizeKey] ?? QR_PLACEMENT.xl!;
  const buf = Buffer.from(dataUrl.split(",")[1] ?? "", "base64");

  let imgW: number;
  let imgH: number;
  try {
    const meta = await sharp(buf).metadata();
    imgW = meta.width  ?? 1200;
    imgH = meta.height ?? 1500;
  } catch {
    return null;
  }

  const left = imgW - placement.qrSize - placement.right;
  const top  = imgH - placement.qrSize - placement.bottom;
  if (left < 0 || top < 0) return null;

  try {
    const { data, info } = await sharp(buf)
      .extract({ left, top, width: placement.qrSize, height: placement.qrSize })
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

    const decoded = jsqr(new Uint8ClampedArray(data), info.width, info.height);
    return decoded?.data ?? null;
  } catch {
    return null;
  }
}

const pad = (s: string | number | null, n: number) =>
  String(s ?? "").substring(0, n).padEnd(n);

type SpotRow = {
  id: number;
  campaignId: number;
  campaignName: string | null;
  businessName: string | null;
  gridArea: string;
  size: string;
  trackingCode: string | null;
  templateData: string | null;
};

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  let anyProblems = false;

  // ── SECTION 1: Legacy broken ads (ad_file_url is a bare base64 JPEG) ─────────
  const legacyRows = await db
    .select({
      id:           spotsTable.id,
      campaignId:   spotsTable.campaignId,
      campaignName: campaignsTable.name,
      businessName: spotsTable.businessName,
      gridArea:     spotsTable.gridArea,
      status:       spotsTable.status,
    })
    .from(spotsTable)
    .leftJoin(campaignsTable, eq(spotsTable.campaignId, campaignsTable.id))
    .where(
      and(
        isNotNull(spotsTable.adFileUrl),
        like(spotsTable.adFileUrl, "data:image/jpeg;base64,%"),
      ),
    )
    .orderBy(spotsTable.campaignId, spotsTable.id);

  if (legacyRows.length > 0) {
    anyProblems = true;
    console.log(`\n⚠️  SECTION 1 — ${legacyRows.length} spot(s) with legacy Grok base64 JPEG ad_file_url (non-scannable AI-drawn QR):\n`);
    const COL = { id: 6, camp: 6, name: 16, biz: 30, grid: 8, stat: 10 };
    console.log(`${pad("ID", COL.id)} ${pad("CampID", COL.camp)} ${pad("Campaign", COL.name)} ${pad("Business", COL.biz)} ${pad("Grid", COL.grid)} ${pad("Status", COL.stat)}`);
    console.log("─".repeat(Object.values(COL).reduce((a, b) => a + b, 0) + 5));
    for (const r of legacyRows) {
      console.log(`${pad(r.id, COL.id)} ${pad(r.campaignId, COL.camp)} ${pad(r.campaignName, COL.name)} ${pad(r.businessName, COL.biz)} ${pad(r.gridArea, COL.grid)} ${pad(r.status, COL.stat)}`);
    }
    console.log(`\nThese ${legacyRows.length} ads need a regeneration pass in the admin ad generator.\n`);
  } else {
    console.log("✅  SECTION 1 — No legacy Grok base64 JPEG ads found.\n");
  }

  // ── SECTION 2: Paid spots whose templateData QR decodes to a non-tracking URL ──
  // Finds spots where the post-payment QR swap failed or didn't run.
  const candidateRows: SpotRow[] = await db
    .select({
      id:           spotsTable.id,
      campaignId:   spotsTable.campaignId,
      campaignName: campaignsTable.name,
      businessName: spotsTable.businessName,
      gridArea:     spotsTable.gridArea,
      size:         spotsTable.size,
      trackingCode: spotsTable.trackingCode,
      templateData: spotsTable.templateData,
    })
    .from(spotsTable)
    .leftJoin(campaignsTable, eq(spotsTable.campaignId, campaignsTable.id))
    .where(
      and(
        eq(spotsTable.status, "paid"),
        isNotNull(spotsTable.trackingCode),
        isNotNull(spotsTable.templateData),
        like(spotsTable.templateData, '%"finishedAdUrl":"data:image%'),
      ),
    )
    .orderBy(spotsTable.campaignId, spotsTable.id);

  const swapNeededSpots: Array<SpotRow & { decodedUrl: string }> = [];
  const decodeFailSpots: SpotRow[] = [];

  console.log(`Checking QR regions for ${candidateRows.length} paid spot(s) with Grok templateData ads...`);

  for (const row of candidateRows) {
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(row.templateData!) as Record<string, unknown>; }
    catch { decodeFailSpots.push(row); continue; }

    const finishedAdUrl = parsed.finishedAdUrl;
    if (typeof finishedAdUrl !== "string" || !finishedAdUrl.startsWith("data:image")) continue;

    const sizeKey = toSizeKey(typeof parsed.sizeKey === "string" ? parsed.sizeKey : row.size);
    const decoded = await decodeQrRegion(finishedAdUrl, sizeKey);

    if (decoded === null) {
      // QR region unreadable — may indicate missing QR or image corruption.
      decodeFailSpots.push(row);
    } else {
      // A real tracking URL looks like: https://<host>/go/<slug>
      // Any URL that doesn't contain "/go/" is a pre-swap preview QR.
      const isRealTrackingUrl = decoded.includes("/go/");
      if (!isRealTrackingUrl) {
        swapNeededSpots.push({ ...row, decodedUrl: decoded });
      }
    }
  }

  if (swapNeededSpots.length > 0 || decodeFailSpots.length > 0) {
    anyProblems = true;
    const COL2 = { id: 6, camp: 6, name: 16, biz: 26, grid: 8, tc: 32 };
    const header = `${pad("ID", COL2.id)} ${pad("CampID", COL2.camp)} ${pad("Campaign", COL2.name)} ${pad("Business", COL2.biz)} ${pad("Grid", COL2.grid)} ${pad("TrackingCode", COL2.tc)}`;
    const rule = "─".repeat(Object.values(COL2).reduce((a, b) => a + b, 0) + 5);

    if (swapNeededSpots.length > 0) {
      console.log(`\n⚠️  SECTION 2A — ${swapNeededSpots.length} spot(s) where QR decodes to a preview URL, not the real tracking URL (swap didn't run or failed):\n`);
      console.log(header); console.log(rule);
      for (const r of swapNeededSpots) {
        console.log(`${pad(r.id, COL2.id)} ${pad(r.campaignId, COL2.camp)} ${pad(r.campaignName, COL2.name)} ${pad(r.businessName, COL2.biz)} ${pad(r.gridArea, COL2.grid)} ${pad(r.trackingCode, COL2.tc)}`);
        console.log(`       decoded QR → ${r.decodedUrl}`);
      }
      console.log(`\nRun swapGrokQrInTemplateData(spotId) for each of these spots.\n`);
    }

    if (decodeFailSpots.length > 0) {
      console.log(`\n⚠️  SECTION 2B — ${decodeFailSpots.length} spot(s) where QR region could not be decoded (investigate manually):\n`);
      console.log(header); console.log(rule);
      for (const r of decodeFailSpots) {
        console.log(`${pad(r.id, COL2.id)} ${pad(r.campaignId, COL2.camp)} ${pad(r.campaignName, COL2.name)} ${pad(r.businessName, COL2.biz)} ${pad(r.gridArea, COL2.grid)} ${pad(r.trackingCode, COL2.tc)}`);
      }
    }
  } else if (candidateRows.length > 0) {
    console.log("✅  SECTION 2 — All paid Grok ads have real tracking QRs.\n");
  } else {
    console.log("✅  SECTION 2 — No paid Grok templateData ads found to check.\n");
  }

  await pool.end();
  process.exit(anyProblems ? 1 : 0);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
