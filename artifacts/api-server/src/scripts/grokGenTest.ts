/**
 * Visual QR-ban + STYLE-block regression test.
 *
 * Generates 5 ads across different templates using the same buildAdPrompt +
 * xAI API path as production. Saves each as a JPEG in /tmp/ for visual inspection:
 *   - Does Grok draw a fake QR anywhere in the image? (Bug 1 test)
 *   - Does overall ad quality hold without the STYLE boilerplate? (Point 4)
 *
 * Run: tsx src/scripts/grokGenTest.ts
 *
 * Requires XAI_API_KEY in env. Each generation takes ~30-60 s; all 5 run in
 * parallel (Promise.allSettled) so total wall-clock is ~60 s, not ~5 min.
 */

import fs   from "fs";
import path from "path";
import { buildAdPrompt, type AdPromptInput } from "../lib/buildAdPrompt.js";
import { logger } from "../lib/logger.js";

const XAI_KEY = process.env.XAI_API_KEY ?? "";
if (!XAI_KEY) { console.error("XAI_API_KEY not set"); process.exit(1); }

// ── Shared fixture — a realistic business so Grok has something to render ──
const BASE: Omit<AdPromptInput, "template" | "sizeKey"> = {
  bizName:  "Mountain View Dental",
  tagline:  "Gentle Care for the Whole Family",
  phone:    "(706) 839-2100",
  city:     "Clarkesville",
  address:  "812 Washington St, Clarkesville, GA 30523",
  website:  "mountainviewdental.com",
  industry: "Dental",
  menu:     ["New Patient Exam — $99", "Teeth Whitening — $299", "Emergency Appointments Available"],
  offer:    "Free Consultation for New Patients",
  offerFine: "Expires 8/31/2025. One per household.",
  photoUrl: "",
  logoData: "",
  generationIndex: 0,
};

// ── 5 templates: different QR styles, aesthetics, backgrounds ──────────────
const CASES: Array<{ template: string; sizeKey: string; label: string }> = [
  { template: "heritage-home",    sizeKey: "xl",     label: "heritage-home portrait" },
  { template: "brush-stroke",     sizeKey: "xl",     label: "brush-stroke portrait (circular QR card)" },
  { template: "sage-organic",     sizeKey: "xl",     label: "sage-organic portrait (dashed QR border)" },
  { template: "neighborhood-pro", sizeKey: "xl",     label: "neighborhood-pro portrait (borderless QR)" },
  { template: "parchment-classic",sizeKey: "medium", label: "parchment-classic landscape" },
];

async function generateOne(c: typeof CASES[0]): Promise<{ label: string; file: string; error?: string }> {
  const d: AdPromptInput = { ...BASE, template: c.template, sizeKey: c.sizeKey };
  const isLandscape = c.sizeKey === "medium" || c.sizeKey === "m";
  const prompt = buildAdPrompt(d, isLandscape);
  const bytes  = Buffer.byteLength(prompt, "utf8");
  console.log(`[${c.label}] prompt: ${bytes} bytes — calling xAI...`);

  const res = await fetch("https://api.x.ai/v1/images/generations", {
    method:  "POST",
    headers: { Authorization: `Bearer ${XAI_KEY}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ model: "grok-imagine-image-quality", prompt, n: 1 }),
  });

  if (!res.ok) {
    const txt = await res.text();
    return { label: c.label, file: "", error: `HTTP ${res.status}: ${txt.slice(0, 300)}` };
  }

  const body = await res.json() as Record<string, unknown>;
  const dataArr = Array.isArray(body.data) ? body.data as Array<Record<string,unknown>> : [];
  // xAI returns either url or b64_json depending on the request
  const imgUrl = dataArr[0]?.url as string | undefined;
  const imgB64 = dataArr[0]?.b64_json as string | undefined;

  const slug = c.template.replace(/-/g, "_") + "_" + c.sizeKey;
  const file = path.join("/tmp", `grok_test_${slug}.jpg`);

  if (imgB64) {
    fs.writeFileSync(file, Buffer.from(imgB64, "base64"));
  } else if (imgUrl) {
    const imgRes = await fetch(imgUrl);
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
    fs.writeFileSync(file, imgBuf);
  } else {
    return { label: c.label, file: "", error: `No image in response: ${JSON.stringify(body).slice(0, 200)}` };
  }
  console.log(`[${c.label}] ✅ saved → ${file}`);
  return { label: c.label, file };
}

async function main() {
  console.log(`Generating ${CASES.length} ads in parallel — may take ~60 s...\n`);
  const results = await Promise.allSettled(CASES.map(generateOne));

  console.log("\n── Results ─────────────────────────────────────────────────────");
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("  REJECTED:", r.reason);
    } else if (r.value.error) {
      console.error(`  FAIL [${r.value.label}]: ${r.value.error}`);
    } else {
      console.log(`  OK   [${r.value.label}]: ${r.value.file}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
