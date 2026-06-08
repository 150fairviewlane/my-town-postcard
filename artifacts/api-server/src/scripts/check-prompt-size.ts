/**
 * Prompt-size regression guard — run with:
 *   pnpm --filter @workspace/api-server run check:prompt-size
 *
 * PURPOSE
 * -------
 * xAI's API silently rejects payloads over ~8,000 bytes.  The runtime
 * trimmer in adGenGrok.ts is a last-resort safety net, but it fires only
 * in production.  This script is the build-time gate: it verifies that
 * every template × orientation combination stays under 7,800 UTF-8 bytes
 * even with worst-case user inputs, so structural bloat is caught before
 * it can ever reach production.
 *
 * PASS:  ✓ All 12 template×orientation prompts are under 7,800 bytes
 * FAIL:  Lists every offending combo with its byte count and overage
 */

import { buildAdPrompt, type AdPromptInput } from "../lib/buildAdPrompt.js";

const MAX_BYTES = 7_800;

// ── Worst-case fixture ────────────────────────────────────────────────────────
// 100-char business name, 20 menu items × 60 chars each, 200-char tagline,
// 200-char offer, 150-char fine print, 150-char address — per spec.
const WORST_CASE: Omit<AdPromptInput, "template" | "sizeKey"> = {
  bizName:   "A".repeat(100),
  tagline:   "T".repeat(200),
  phone:     "(555) 999-8888",
  city:      "Clarkesville",
  address:   "C".repeat(150),
  website:   "",
  industry:  "Restaurant",
  menu:      Array.from({ length: 20 }, (_, i) => `Item ${String(i + 1).padStart(2, "0")} — ${"M".repeat(52)}`),
  offer:     "O".repeat(200),
  offerFine: "F".repeat(150),
  photoUrl:  "https://images.unsplash.com/dummy",
  logoData:  "data:image/png;base64,abc",
  generationIndex: 0,
};

// ── Template × orientation matrix ─────────────────────────────────────────────
const TEMPLATES = [
  "parchment-classic",
  "made-fresh",
  "neighborhood-pro",
  "at-your-service",
  "health-wellness",
  "home-elegance",
  "sage-organic",
  "surprise-me",
] as const;

const ORIENTATIONS: Array<{ label: string; sizeKey: string; isLandscape: boolean }> = [
  { label: "portrait",  sizeKey: "xl",     isLandscape: false },
  { label: "landscape", sizeKey: "medium", isLandscape: true  },
];

// ── Run ────────────────────────────────────────────────────────────────────────
const failures: Array<{ combo: string; bytes: number }> = [];

for (const template of TEMPLATES) {
  for (const { label, sizeKey, isLandscape } of ORIENTATIONS) {
    const combo = `${template}/${label}`;
    const d: AdPromptInput = { ...WORST_CASE, template, sizeKey };
    const prompt = buildAdPrompt(d, isLandscape);
    const bytes = Buffer.byteLength(prompt, "utf8");

    if (bytes > MAX_BYTES) {
      console.error(`  FAIL  ${combo} — ${bytes} bytes (over by ${bytes - MAX_BYTES})`);
      failures.push({ combo, bytes });
    } else {
      console.log(`  pass  ${combo} — ${bytes} bytes`);
    }
  }
}

// ── Summary ────────────────────────────────────────────────────────────────────
console.log("");
if (failures.length === 0) {
  console.log(`✓ All 16 template×orientation prompts are under ${MAX_BYTES} bytes`);
  process.exit(0);
} else {
  console.error(
    `✗ ${failures.length} of 16 template×orientation prompts exceed ${MAX_BYTES} bytes.\n` +
    "  Shorten the template copy in artifacts/api-server/src/lib/buildAdPrompt.ts\n" +
    "  until this check passes, then re-run to confirm.",
  );
  process.exit(1);
}
