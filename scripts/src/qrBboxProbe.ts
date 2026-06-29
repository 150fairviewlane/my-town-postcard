/**
 * QR bounding-box detection probe.
 *
 * Prototype only — not a pipeline change.
 *
 * Generates 6 ads using the ORIGINAL approach: text-to-image via grok-imagine,
 * with a prompt that naturally invites a QR code but contains ZERO corner
 * restrictions, reserved-zone language, or cleanup instructions.  The goal is
 * to measure whether a GPT-4o vision call can reliably return a usable pixel
 * bounding box for the QR-like element Grok draws.
 *
 * Run:
 *   pnpm --filter @workspace/scripts run probe:qr-bbox
 *
 * Output: per-sample result table + JSON written to /tmp/qr-bbox-probe.json
 */

import OpenAI from "openai";
import sharp from "sharp";
import { writeFile } from "fs/promises";

// ── Config ─────────────────────────────────────────────────────────────────

const XAI_API_KEY  = process.env.XAI_API_KEY  ?? "";
const OPENAI_KEY   = process.env.OPENAI_API_KEY ?? "";

if (!XAI_API_KEY)  { console.error("XAI_API_KEY not set"); process.exit(1); }
if (!OPENAI_KEY)   { console.error("OPENAI_API_KEY not set"); process.exit(1); }

/** XL portrait — same dimensions as production */
const IMG_W  = 1200;
const IMG_H  = 1500;

/** Downsample to this width before sending to vision API (keeps token cost down) */
const VISION_W = 600;
const VISION_H = 750;

// ── Business fixtures ─────────────────────────────────────────────────────

const BUSINESSES = [
  { name: "Roma's Pizza",            type: "restaurant",       phone: "(706) 754-0100", website: "romaspizza.com" },
  { name: "Miguel's Tires & Auto",   type: "auto repair shop", phone: "(706) 754-0105", website: "miguelstires.com" },
  { name: "Happy Paws Pet Grooming", type: "pet grooming salon", phone: "(706) 754-0300", website: "happypawsga.com" },
  { name: "Blue Ridge Landscaping",  type: "landscaping company", phone: "(706) 754-0200", website: "blueridgeland.com" },
  { name: "Mountain View Plumbing",  type: "plumbing service",  phone: "(706) 754-0400", website: "mvplumbing.com" },
  { name: "Sunrise Family Bakery",   type: "bakery",            phone: "(706) 754-0500", website: "sunrisebakeryga.com" },
] as const;

// ── Generation prompt ─────────────────────────────────────────────────────

function buildPrompt(b: (typeof BUSINESSES)[number]): string {
  return (
    `Print-quality portrait postcard advertisement for ${b.name}, a ${b.type} ` +
    `in Clarkesville, GA.  Phone: ${b.phone}.  Website: ${b.website}.` +
    `\n\nDesign requirements:` +
    `\n• Full-bleed background with rich texture or photorealistic imagery` +
    `\n• Business name as a dominant, highly readable headline` +
    `\n• 3–4 key services or menu highlights` +
    `\n• Phone number and address in a footer bar at the bottom` +
    `\n• A QR code linking to the business website — place it wherever it looks best in the design` +
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
      aspect_ratio: "2:3",    // closest to 4"×5" portrait
      resolution:   "2k",
    }),
  });
  const body = await res.json() as XaiResponse;
  if (!res.ok) {
    throw new Error(`xAI ${res.status}: ${JSON.stringify(body.error)}`);
  }
  const item = body.data?.[0];
  if (!item) throw new Error("xAI: no data in response");

  if (item.b64_json) {
    return Buffer.from(item.b64_json, "base64");
  }
  if (item.url) {
    const dl = await fetch(item.url);
    return Buffer.from(await dl.arrayBuffer());
  }
  throw new Error("xAI: neither url nor b64_json in response item");
}

// ── GPT-4o vision detection ───────────────────────────────────────────────

interface BboxResult {
  found: true;
  x1: number; y1: number;
  x2: number; y2: number;
  confidence: "high" | "medium" | "low";
  notes: string;
}
interface NotFoundResult { found: false; notes?: string }
type VisionResult = BboxResult | NotFoundResult;

async function detectQrBbox(imgBuf: Buffer, imgW: number, imgH: number): Promise<VisionResult> {
  const openai = new OpenAI({ apiKey: OPENAI_KEY });

  // Resize to VISION_W×VISION_H before sending — keeps token cost low
  const resized = await sharp(imgBuf)
    .resize(VISION_W, VISION_H, { fit: "fill" })
    .jpeg({ quality: 90 })
    .toBuffer();
  const b64 = resized.toString("base64");

  const scaleX = imgW / VISION_W;
  const scaleY = imgH / VISION_H;

  const visionPrompt =
    `This is a printed postcard advertisement image (${VISION_W}×${VISION_H} px as sent, ` +
    `representing a ${imgW}×${imgH} px original).` +
    `\n\nLook carefully for any QR code or QR-code-like graphic — even a visually illustrated ` +
    `one that may not be machine-readable.  A QR code looks like a square filled with a grid ` +
    `of dark and light modules, typically with three bold square "finder patterns" in the corners.` +
    `\n\nReturn ONLY valid JSON, no other text:` +
    `\n• If a QR code / QR placeholder IS visible: ` +
    `{"found":true,"x1":<int>,"y1":<int>,"x2":<int>,"y2":<int>,"confidence":"high"|"medium"|"low","notes":"<brief>"}` +
    `  where coordinates are in pixels of THIS image (${VISION_W}×${VISION_H}).` +
    `\n• If NO QR code or QR placeholder is visible: {"found":false}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 120,
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}`, detail: "high" } },
        { type: "text", text: visionPrompt },
      ],
    }],
  });

  const raw = response.choices[0]?.message.content?.trim() ?? "";
  let parsed: VisionResult;
  try {
    // Strip markdown fences if present
    const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    parsed = JSON.parse(json) as VisionResult;
  } catch {
    return { found: false, notes: `parse-error: ${raw.slice(0, 120)}` };
  }

  // Scale coordinates back to original image space
  if (parsed.found) {
    parsed.x1 = Math.round(parsed.x1 * scaleX);
    parsed.y1 = Math.round(parsed.y1 * scaleY);
    parsed.x2 = Math.round(parsed.x2 * scaleX);
    parsed.y2 = Math.round(parsed.y2 * scaleY);
  }

  return parsed;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Expected corner position of our composited QR card (XL).  For comparison only. */
const EXPECTED = { x: 1007, y: 1307, w: 187, h: 187 }; // cardLeft / cardTop / cardSize

function formatBbox(r: VisionResult): string {
  if (!r.found) return `NOT FOUND${(r as NotFoundResult).notes ? ` (${(r as NotFoundResult).notes})` : ""}`;
  const w = r.x2 - r.x1;
  const h = r.y2 - r.y1;
  const dxRight  = IMG_W  - r.x2;  // gap from right edge
  const dyBottom = IMG_H  - r.y2;  // gap from bottom edge
  return (
    `[${r.x1},${r.y1}→${r.x2},${r.y2}] ${w}×${h}px  ` +
    `gap R${dxRight}px B${dyBottom}px  conf:${r.confidence}`
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

interface SampleRecord {
  business: string;
  generated: boolean;
  visionResult: VisionResult | { error: string };
  durationMs: number;
}

const results: SampleRecord[] = [];

console.log("\n=== QR Bounding-Box Detection Probe ===");
console.log(`Generating ${BUSINESSES.length} ads (no corner restrictions, no cleanup pass)\n`);

for (const [i, biz] of BUSINESSES.entries()) {
  const label = `[${i+1}/${BUSINESSES.length}] ${biz.name}`;
  process.stdout.write(`${label} — generating...`);
  const t0 = Date.now();

  let imgBuf: Buffer | null = null;
  try {
    imgBuf = await generateAd(biz);
    process.stdout.write(` done (${((Date.now()-t0)/1000).toFixed(1)}s), detecting...`);

    // Save for manual review
    await writeFile(`/tmp/qr-bbox-probe-${i+1}-${biz.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.jpg`, imgBuf);

    const vRes = await detectQrBbox(imgBuf, IMG_W, IMG_H);
    const elapsed = Date.now() - t0;
    console.log(` ${formatBbox(vRes)}  [${(elapsed/1000).toFixed(1)}s total]`);
    results.push({ business: biz.name, generated: true, visionResult: vRes, durationMs: elapsed });
  } catch (err: unknown) {
    const elapsed = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(` ERROR: ${msg}`);
    results.push({
      business: biz.name,
      generated: imgBuf !== null,
      visionResult: { error: msg },
      durationMs: elapsed,
    });
  }
}

// ── Summary ───────────────────────────────────────────────────────────────

const generated = results.filter(r => r.generated).length;
const detected  = results.filter(r => r.generated && "found" in r.visionResult && (r.visionResult as VisionResult).found).length;
const highConf  = results.filter(r => {
  const v = r.visionResult as VisionResult;
  return "found" in v && v.found && (v as BboxResult).confidence === "high";
}).length;

console.log("\n─── Summary ────────────────────────────────────────────────────");
console.log(`Generated:     ${generated}/${results.length}`);
console.log(`QR detected:   ${detected}/${generated} (${Math.round(detected/Math.max(generated,1)*100)}%)`);
console.log(`High-conf:     ${highConf}/${generated}`);
console.log(`Expected corner (production): x${EXPECTED.x} y${EXPECTED.y}  ${EXPECTED.w}×${EXPECTED.h}px`);

console.log("\n─── Per-sample bounding boxes (original image coordinates) ─────");
for (const r of results) {
  const v = r.visionResult as VisionResult;
  if (!("found" in v)) { console.log(`  ${r.business}: ERROR`); continue; }
  if (!v.found) { console.log(`  ${r.business}: NOT FOUND`); continue; }
  const b = v as BboxResult;
  const w = b.x2 - b.x1;
  const h = b.y2 - b.y1;
  console.log(`  ${r.business}:`);
  console.log(`    bbox  : [${b.x1}, ${b.y1}] → [${b.x2}, ${b.y2}]  (${w}×${h}px)`);
  console.log(`    corner: x${IMG_W - b.x2}px from right, y${IMG_H - b.y2}px from bottom`);
  console.log(`    conf  : ${b.confidence}   notes: ${b.notes}`);
}

const jsonPath = "/tmp/qr-bbox-probe.json";
await writeFile(jsonPath, JSON.stringify(results, null, 2));
console.log(`\nFull results → ${jsonPath}`);
console.log("Generated images → /tmp/qr-bbox-probe-*.jpg\n");
