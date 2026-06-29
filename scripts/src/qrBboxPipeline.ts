/**
 * QR detect-and-replace pipeline — full prototype run.
 *
 * Pipeline per ad (2 AI calls total, no cleanup pass):
 *   1. grok-imagine generate  — prompt nudge asks for ~140-150px placeholder QR
 *   2. GPT-4o vision detect   — bounding box of ENTIRE cluster (QR + card + frame + label)
 *   3. Composite              — real scannable QR card at 1.3× cluster's larger dim,
 *                               centered on bbox center, capped at 18% of image height
 *
 * Runs the same 6 businesses from the bbox probe and reports:
 *   • Detection success rate and confidence
 *   • Per-ad coverage (card px vs cluster px) — Mountain View Plumbing flagged ★
 *   • AI call count and cost comparison vs old blank-corner + cleanup approach
 *
 * Run:
 *   pnpm --filter @workspace/scripts run pipeline:qr-bbox
 */

import OpenAI from "openai";
import QRCode from "qrcode";
import sharp from "sharp";
import { writeFile } from "fs/promises";

// ── Config ─────────────────────────────────────────────────────────────────

const XAI_API_KEY = process.env.XAI_API_KEY  ?? "";
const OPENAI_KEY  = process.env.OPENAI_API_KEY ?? "";

if (!XAI_API_KEY) { console.error("XAI_API_KEY not set"); process.exit(1); }
if (!OPENAI_KEY)  { console.error("OPENAI_API_KEY not set"); process.exit(1); }

/** Downsample to this size before sending to vision API (keeps token cost low). */
const VISION_W = 600;
const VISION_H = 750;

// ── Business fixtures (same as probe) ─────────────────────────────────────

const BUSINESSES = [
  { name: "Roma's Pizza",            type: "restaurant",          phone: "(706) 754-0100", website: "https://romaspizza.com" },
  { name: "Miguel's Tires & Auto",   type: "auto repair shop",    phone: "(706) 754-0105", website: "https://miguelstires.com" },
  { name: "Happy Paws Pet Grooming", type: "pet grooming salon",  phone: "(706) 754-0300", website: "https://happypawsga.com" },
  { name: "Blue Ridge Landscaping",  type: "landscaping company", phone: "(706) 754-0200", website: "https://blueridgeland.com" },
  { name: "Mountain View Plumbing",  type: "plumbing service",    phone: "(706) 754-0400", website: "https://mvplumbing.com" },
  { name: "Sunrise Family Bakery",   type: "bakery",              phone: "(706) 754-0500", website: "https://sunrisebakeryga.com" },
] as const;

// ── Generation prompt with size nudge ─────────────────────────────────────

function buildPrompt(b: (typeof BUSINESSES)[number]): string {
  return (
    `Print-quality portrait postcard advertisement for ${b.name}, a ${b.type} ` +
    `in Clarkesville, GA.  Phone: ${b.phone}.  Website: ${b.website}.` +
    `\n\nDesign requirements:` +
    `\n• Full-bleed background with rich texture or photorealistic imagery` +
    `\n• Business name as a dominant, highly readable headline` +
    `\n• 3–4 key services or menu highlights` +
    `\n• Phone number and address in a footer bar at the bottom` +
    // SIZE NUDGE: bias Grok toward a smaller placeholder so 1.3× card has less heavy lifting
    `\n• A small, compact QR code linking to the business website — ` +
    `draw it approximately 140–150 pixels across (noticeably smaller than a typical QR code), ` +
    `placed wherever it looks natural in the design` +
    `\n• 300 DPI print quality, 4"×5" portrait orientation` +
    `\n• Professional, locally-appealing small-business aesthetic`
  );
}

// ── xAI image generation ──────────────────────────────────────────────────

interface XaiResponse {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: unknown;
}

async function generateAd(b: (typeof BUSINESSES)[number]): Promise<Buffer> {
  const res = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:        "grok-imagine-image-quality",
      prompt:       buildPrompt(b),
      n:            1,
      aspect_ratio: "2:3",
      resolution:   "2k",
    }),
  });
  const body = await res.json() as XaiResponse;
  if (!res.ok) throw new Error(`xAI ${res.status}: ${JSON.stringify(body.error)}`);
  const item = body.data?.[0];
  if (!item) throw new Error("xAI: no data in response");
  if (item.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item.url) {
    const dl = await fetch(item.url);
    return Buffer.from(await dl.arrayBuffer());
  }
  throw new Error("xAI: neither url nor b64_json in response");
}

// ── Cluster bbox detection ─────────────────────────────────────────────────
// Asks for the ENTIRE visual cluster: QR shape + backing card + border/frame + label text.
// Coordinates returned in vision-image space, scaled back to original image space.

// A single candidate cluster returned by GPT-4o (coordinates in vision space until scaled)
interface Candidate {
  x1: number; y1: number; x2: number; y2: number;
  confidence: "high" | "medium" | "low";
  notes: string;
}

interface ClusterBox {
  found: true;
  x1: number; y1: number; x2: number; y2: number;
  confidence: "high" | "medium" | "low";
  notes: string;
  /** All candidates GPT-4o returned, scaled to original image space, sorted largest→smallest. */
  allCandidates: Array<Candidate & { area: number }>;
}
interface NotFound { found: false; notes?: string }
type DetectResult = ClusterBox | NotFound;

async function detectCluster(
  imgBuf: Buffer,
  actualW: number,
  actualH: number,
): Promise<DetectResult> {
  const openai = new OpenAI({ apiKey: OPENAI_KEY });

  const resized = await sharp(imgBuf)
    .resize(VISION_W, VISION_H, { fit: "fill" })
    .jpeg({ quality: 90 })
    .toBuffer();

  const scaleX = actualW / VISION_W;
  const scaleY = actualH / VISION_H;

  // Ask for ALL QR-like clusters; we pick the largest by area in code so the
  // selection is inspectable and not hidden inside the model's internal judgment.
  const prompt =
    `This is a printed postcard advertisement (${VISION_W}×${VISION_H} px as shown, ` +
    `original is ${actualW}×${actualH} px).` +
    `\n\nFind EVERY QR code or QR-like visual cluster in the image — there may be more than one. ` +
    `A cluster = the QR code pattern PLUS every directly attached element: ` +
    `backing card or panel, border or frame, adjacent label text (e.g. "Scan for…"). ` +
    `Return one bounding box per cluster that encloses all attached elements together.` +
    `\n\nReturn ONLY valid JSON, no other text:` +
    `\n• One or more found:` +
    ` {"candidates":[` +
    `{"x1":<int>,"y1":<int>,"x2":<int>,"y2":<int>,"confidence":"high"|"medium"|"low",` +
    `"notes":"<what is in this cluster>"},` +
    `...` +
    `]}` +
    `  (coordinates in THIS image's pixel space, ${VISION_W}×${VISION_H})` +
    `\n• Nothing found: {"candidates":[]}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 400,
    messages: [{
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${resized.toString("base64")}`,
            detail: "high",
          },
        },
        { type: "text", text: prompt },
      ],
    }],
  });

  const raw = response.choices[0]?.message.content?.trim() ?? "";
  let rawCandidates: Candidate[];
  try {
    const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(json) as { candidates?: Candidate[] };
    rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  } catch {
    return { found: false, notes: `parse-error: ${raw.slice(0, 120)}` };
  }

  if (rawCandidates.length === 0) {
    return { found: false, notes: "GPT-4o returned empty candidates array" };
  }

  // Scale every candidate from vision space → original image space, compute area
  const scaled = rawCandidates.map(c => ({
    x1: Math.round(c.x1 * scaleX),
    y1: Math.round(c.y1 * scaleY),
    x2: Math.round(c.x2 * scaleX),
    y2: Math.round(c.y2 * scaleY),
    confidence: c.confidence,
    notes: c.notes,
    area: (c.x2 - c.x1) * (c.y2 - c.y1),   // area in vision-space px (scaling cancels for ranking)
  }));

  // Sort largest → smallest so logs always list them in priority order
  scaled.sort((a, b) => b.area - a.area);

  // Largest area = target cluster (most likely the dominant QR the model missed last time)
  const best = scaled[0]!;

  return {
    found: true,
    x1: best.x1, y1: best.y1, x2: best.x2, y2: best.y2,
    confidence: best.confidence,
    notes: best.notes,
    allCandidates: scaled,
  };
}

// ── Real QR card compositor ────────────────────────────────────────────────

function makeCardSvg(sz: number): Buffer {
  // Clean white card with thin dark border — prototype neutral style
  const bw = Math.max(2, Math.round(sz * 0.016));
  const half = bw / 2;
  return Buffer.from(
    `<svg width="${sz}" height="${sz}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="${half}" y="${half}" width="${sz - bw}" height="${sz - bw}" ` +
    `fill="#ffffff" stroke="#1a1a1a" stroke-width="${bw}" rx="4"/>` +
    `</svg>`,
  );
}

interface CompositeResult {
  resultBuf: Buffer;
  cardSize: number;
  coverageRatio: number;
  cardLeft: number;
  cardTop: number;
}

async function compositeRealQr(
  imgBuf: Buffer,
  cluster: ClusterBox,
  url: string,
  imgW: number,
  imgH: number,
): Promise<CompositeResult> {
  const clusterW = cluster.x2 - cluster.x1;
  const clusterH = cluster.y2 - cluster.y1;
  const largerDim = Math.max(clusterW, clusterH);

  // Clip the cluster's larger dimension before multiplying so that a long text label
  // extending beside/below the QR doesn't inflate the card size beyond what the
  // actual QR + backing-card shape needs (20% of image height is a generous upper bound
  // for any real QR element; text labels routinely push clusters beyond that).
  const clippedDim = Math.min(largerDim, Math.round(imgH * 0.20));

  // 1.3× the clipped dimension; hard cap scales with image dimensions rather than
  // anchoring to a fixed percentage that breaks on taller images (e.g. 2K at 2496px).
  const maxCard = Math.min(Math.round(imgW * 0.35), Math.round(imgH * 0.25));
  const cardSize = Math.min(Math.round(clippedDim * 1.3), maxCard);

  // Center on detected cluster bbox
  const cx = Math.round((cluster.x1 + cluster.x2) / 2);
  const cy = Math.round((cluster.y1 + cluster.y2) / 2);

  // Clamp so card never bleeds outside image bounds
  const cardLeft = Math.max(0, Math.min(cx - Math.floor(cardSize / 2), imgW - cardSize));
  const cardTop  = Math.max(0, Math.min(cy - Math.floor(cardSize / 2), imgH - cardSize));

  // QR code fills ~72% of card interior (quiet zone handled by qrcode library)
  const qrSize = Math.round(cardSize * 0.72);
  const qrPng = await QRCode.toBuffer(url, {
    errorCorrectionLevel: "H",
    type: "png",
    width: qrSize,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });

  // Build card: white backing SVG → composite QR centered
  const cardBase    = await sharp(makeCardSvg(cardSize)).png().toBuffer();
  const qrOffset    = Math.floor((cardSize - qrSize) / 2);
  const cardWithQr  = await sharp(cardBase)
    .composite([{ input: qrPng, left: qrOffset, top: qrOffset }])
    .png()
    .toBuffer();

  // Composite onto generated ad image
  const resultBuf = await sharp(imgBuf)
    .composite([{ input: cardWithQr, left: cardLeft, top: cardTop }])
    .jpeg({ quality: 95 })
    .toBuffer();

  return { resultBuf, cardSize, coverageRatio: cardSize / largerDim, cardLeft, cardTop };
}

// ── Main ──────────────────────────────────────────────────────────────────

interface SampleResult {
  business: string;
  generated: boolean;
  actualW?: number;
  actualH?: number;
  cluster: DetectResult | { error: string };
  card?: { size: number; coverageRatio: number; left: number; top: number };
  aiCalls: number;
  durationMs: number;
}

const results: SampleResult[] = [];
const OUT = "/tmp";

console.log("\n=== QR Detect-and-Replace Pipeline — 6-sample run ===");
console.log("Spec: generate (size nudge) → cluster detect → 1.3× composite, no cleanup pass");
console.log("AI calls per ad: 2  (1 grok-imagine generate + 1 GPT-4o vision detect)\n");

for (const [i, biz] of BUSINESSES.entries()) {
  const isMVP  = biz.name.includes("Plumbing");
  const label  = `[${i+1}/6] ${biz.name}${isMVP ? " ★" : ""}`;
  process.stdout.write(`${label} — generating...`);
  const t0 = Date.now();
  let aiCalls = 0;

  let imgBuf: Buffer | null = null;
  let actualW = 0;
  let actualH = 0;

  try {
    imgBuf = await generateAd(biz);
    aiCalls++;
    const meta = await sharp(imgBuf).metadata();
    actualW = meta.width!;
    actualH = meta.height!;

    process.stdout.write(` ${actualW}×${actualH}, detecting cluster...`);

    const cluster = await detectCluster(imgBuf, actualW, actualH);
    aiCalls++;

    if (!cluster.found) {
      const elapsed = Date.now() - t0;
      const why = (cluster as NotFound).notes ?? "";
      console.log(` ✗ NOT DETECTED${why ? ` (${why})` : ""}`);
      // Save raw image for inspection
      const slug = biz.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      await writeFile(`${OUT}/pipeline-${i+1}-${slug}-NODETECT.jpg`, imgBuf);
      results.push({ business: biz.name, generated: true, actualW, actualH, cluster, aiCalls, durationMs: elapsed });
      continue;
    }

    const cb = cluster as ClusterBox;
    const cW  = cb.x2 - cb.x1;
    const cH  = cb.y2 - cb.y1;

    process.stdout.write(` cluster ${cW}×${cH}px conf:${cb.confidence}, compositing...`);

    const comp = await compositeRealQr(imgBuf, cb, biz.website, actualW, actualH);

    const elapsed     = Date.now() - t0;
    const pct         = (comp.coverageRatio * 100).toFixed(0);
    const coverageTag = comp.coverageRatio >= 1.3 ? "✅" : comp.coverageRatio >= 1.0 ? "⚠ partial" : "✗ under";

    console.log(
      ` ${coverageTag}  card=${comp.cardSize}px / cluster=${Math.max(cW,cH)}px (${pct}%)` +
      (isMVP ? " ← frame check" : "") +
      `  [${(elapsed/1000).toFixed(1)}s]`,
    );

    const slug = biz.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    await writeFile(`${OUT}/pipeline-${i+1}-${slug}.jpg`, comp.resultBuf);

    results.push({
      business: biz.name,
      generated: true,
      actualW,
      actualH,
      cluster,
      card: { size: comp.cardSize, coverageRatio: comp.coverageRatio, left: comp.cardLeft, top: comp.cardTop },
      aiCalls,
      durationMs: elapsed,
    });

  } catch (err: unknown) {
    const elapsed = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(` ERROR: ${msg}`);
    results.push({ business: biz.name, generated: imgBuf !== null, cluster: { error: msg }, aiCalls, durationMs: elapsed });
  }
}

// ── Summary ───────────────────────────────────────────────────────────────

const generated  = results.filter(r => r.generated).length;
const detected   = results.filter(r => "found" in (r.cluster as DetectResult) && (r.cluster as DetectResult).found).length;
const highConf   = results.filter(r => {
  const c = r.cluster as ClusterBox;
  return c.found && c.confidence === "high";
}).length;
const fullCover  = results.filter(r => (r.card?.coverageRatio ?? 0) >= 1.3).length;

console.log("\n─── Summary ─────────────────────────────────────────────────────────");
console.log(`Generated:         ${generated}/6`);
console.log(`Cluster detected:  ${detected}/${generated}  (${Math.round(detected/Math.max(generated,1)*100)}%)`);
console.log(`High confidence:   ${highConf}/${generated}`);
console.log(`Full coverage ≥130%: ${fullCover}/${detected} composited`);

console.log("\n─── Per-ad detail ───────────────────────────────────────────────────");
for (const r of results) {
  const isMVP = r.business.includes("Plumbing");
  const mark  = isMVP ? "★ " : "  ";
  const c = r.cluster as ClusterBox | NotFound | { error: string };

  if ("error" in c) {
    console.log(`${mark}${r.business}: API ERROR`);
    continue;
  }
  if (!c.found) {
    console.log(`${mark}${r.business}: cluster NOT detected (${(c as NotFound).notes ?? "no notes"})`);
    continue;
  }
  const cb   = c as ClusterBox;
  const cW   = cb.x2 - cb.x1;
  const cH   = cb.y2 - cb.y1;
  const card = r.card;

  // Format all candidates (always shown so every ad is fully inspectable)
  const isMiguel = r.business.includes("Miguel");
  const candidateLines = cb.allCandidates.map((ca, idx) => {
    const caW = ca.x2 - ca.x1, caH = ca.y2 - ca.y1;
    const chosen = idx === 0 ? " ← CHOSEN (largest area)" : "";
    return `      [${idx+1}] [${ca.x1},${ca.y1}]→[${ca.x2},${ca.y2}] ${caW}×${caH}px ` +
           `area=${ca.area}  conf:${ca.confidence}  "${ca.notes}"${chosen}`;
  }).join("\n");

  console.log(
    `${mark}${r.business}:\n` +
    `    image        : ${r.actualW}×${r.actualH}px\n` +
    `    candidates   : ${cb.allCandidates.length} found\n` +
    candidateLines + "\n" +
    `    chosen bbox  : [${cb.x1},${cb.y1}]→[${cb.x2},${cb.y2}]  (${cW}×${cH}px)  conf:${cb.confidence}\n` +
    `    chosen desc  : ${cb.notes}\n` +
    (card
      ? `    card placed  : ${card.size}px sq @ [${card.left},${card.top}], ` +
        `coverage ${(card.coverageRatio*100).toFixed(0)}% of cluster ${Math.max(cW,cH)}px` +
        (isMVP ? `  ← red frame must be covered` : "") +
        (isMiguel ? `  ← was footer-area miss last run; verify body-area now` : "")
      : `    card         : NOT composited (detection failed)`) +
    `\n    AI calls     : ${r.aiCalls}  time: ${(r.durationMs/1000).toFixed(1)}s`,
  );
}

console.log("\n─── AI call comparison ───────────────────────────────────────────────");
console.log("  New pipeline (this run):");
console.log("    • 1 grok-imagine generate");
console.log("    • 1 GPT-4o vision cluster detect");
console.log("    = 2 AI calls per ad, no editing calls");
console.log("\n  Old blank-corner + cleanup approach:");
console.log("    • 1 grok-imagine generate");
console.log("    • 1 xAI /images/edits corner-cleanup  ← eliminated");
console.log("    • Occasional moderation retry (1–2 extra generate/edit calls)");
console.log("    = 2 AI calls minimum, commonly 3–4 with retries");
console.log("\n  Savings: corner-cleanup xAI image-edit call eliminated entirely.");
console.log("  GPT-4o vision detect costs ~$0.01–0.02 vs xAI image-edit at full image cost.");

await writeFile(`${OUT}/pipeline-results.json`, JSON.stringify(results, null, 2));
console.log(`\nImages → ${OUT}/pipeline-*.jpg`);
console.log(`JSON   → ${OUT}/pipeline-results.json\n`);
