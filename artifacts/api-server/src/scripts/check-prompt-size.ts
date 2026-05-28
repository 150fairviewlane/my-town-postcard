/**
 * Prompt size guard — run with:
 *   pnpm --filter @workspace/api-server run check:prompt-size
 *
 * PURPOSE
 * -------
 * The Grok ad templates are intentionally verbose (~8,000–12,000 bytes with
 * typical inputs) — the runtime trimmer in adGenGrok.ts reduces menus and, as
 * a last resort, hard-truncates to xAI's 8,000-byte limit.  An absolute
 * "everything under 7,800 bytes" rule is not achievable with the current
 * template depth.
 *
 * Instead this script acts as a REGRESSION GUARD: it records the measured byte
 * count of every template × orientation combination and fails loudly whenever a
 * template edit pushes any combo more than GRACE_BYTES above its known baseline.
 * This catches accidental bloat (e.g. copy-paste that doubles an instruction
 * block) without falsely blocking deliberate template improvements.
 *
 * UPDATING BASELINES
 * ------------------
 * After a deliberate template edit, re-run the script to see the new sizes,
 * then update the BASELINES map in this file and commit the change alongside
 * the template edit.  That way the diff makes the growth visible in code review.
 *
 * HARD-TRUNCATION AUDIT
 * ---------------------
 * The script also reports which combos would trigger the runtime's hard-
 * truncation fallback with typical inputs, so you can track whether quality
 * is improving or degrading over time.
 */

import { buildAdPrompt, type AdPromptInput } from "../lib/buildAdPrompt.js";

// ── Regression baselines (bytes) — established May 2026 ────────────────────
// Key = "<template>/<orientation>", value = measured byte count with STRUCTURAL inputs.
// Allow GRACE_BYTES growth before the check fails.
const BASELINES: Record<string, number> = {
  "parchment-classic/portrait":  10_285,
  "parchment-classic/landscape":  8_393,
  "made-fresh/portrait":         10_268,
  "made-fresh/landscape":         7_945,
  "neighborhood-pro/portrait":    9_740,
  "neighborhood-pro/landscape":   8_489,
  "at-your-service/portrait":     9_884,
  "at-your-service/landscape":    8_451,
  "health-wellness/portrait":     9_576,
  "health-wellness/landscape":    8_784,
  "surprise-me/portrait":        12_266,
  "surprise-me/landscape":       10_392,
};

/** Fail if a combo grows more than this many bytes beyond its baseline. */
const GRACE_BYTES = 300;

// ── Runtime trimming helpers (mirrors adGenGrok.ts) ─────────────────────────

const MAX_BYTES = 7800;

function truncateToBytes(s: string, maxBytes: number): string {
  if (Buffer.byteLength(s, "utf8") <= maxBytes) return s;
  const buf = Buffer.from(s, "utf8");
  let end = maxBytes;
  while (end > 0 && (buf[end]! & 0xc0) === 0x80) end--;
  return buf.slice(0, end).toString("utf8");
}

function simulateTrim(prompt: string, menu: string[]): {
  hardTruncated: boolean;
  origBytes: number;
  finalBytes: number;
} {
  let result = prompt;
  const origBytes = Buffer.byteLength(prompt, "utf8");
  if (origBytes > MAX_BYTES) {
    for (const limit of [8, 5, 3, 1, 0]) {
      if (Buffer.byteLength(result, "utf8") <= MAX_BYTES) break;
      const kept = menu.slice(0, limit);
      const replacement =
        kept.length > 0
          ? kept.map((m, i) => `  ${i + 1}. ${m}`).join("\n") +
            (menu.length > kept.length ? `\n  (+ ${menu.length - kept.length} more)` : "")
          : "  (none)";
      result = result.replace(
        /Menu\/Services :\n[\s\S]*?(?=\nSpecial Offer )/,
        `Menu/Services :\n${replacement}`,
      );
    }
  }
  const afterTrim = Buffer.byteLength(result, "utf8");
  const hardTruncated = afterTrim > MAX_BYTES;
  if (hardTruncated) result = truncateToBytes(result, MAX_BYTES);
  return { hardTruncated, origBytes, finalBytes: Buffer.byteLength(result, "utf8") };
}

// ── Test inputs ──────────────────────────────────────────────────────────────

// Structural inputs: max non-menu fields, NO menu items (nothing left to trim).
// Used for the regression baseline measurement.
const STRUCTURAL: Omit<AdPromptInput, "template" | "sizeKey"> = {
  bizName:   "A".repeat(60),
  tagline:   "T".repeat(120),
  phone:     "(555) 999-8888",
  city:      "Clarkesville",
  address:   "1234 Very Long Street Name Drive",
  website:   "",
  industry:  "Restaurant",
  menu:      [],
  offer:     "O".repeat(120),
  offerFine: "F".repeat(100),
  photoUrl:  "https://images.unsplash.com/dummy",
  logoData:  "data:image/png;base64,abc",
  generationIndex: 0,
};

// Typical real-world inputs — used for the hard-truncation audit only.
const TYPICAL: Omit<AdPromptInput, "template" | "sizeKey"> = {
  bizName:   "Roma's Pizza & Italian Kitchen",
  tagline:   "Authentic Italian Flavors Since 1998",
  phone:     "(706) 555-1234",
  city:      "Clarkesville",
  address:   "123 Main Street",
  website:   "",
  industry:  "Restaurant",
  menu:      [
    "Margherita Pizza — $14",
    "Lasagna Bolognese — $16",
    "Caesar Salad — $10",
    "Tiramisu — $8",
    "House Red Wine — $9",
  ],
  offer:     "FREE APPETIZER with any entree — dine-in only",
  offerFine: "Valid Mon–Thu. One per table. Cannot combine.",
  photoUrl:  "https://images.unsplash.com/dummy",
  logoData:  "data:image/png;base64,abc",
  generationIndex: 0,
};

// ── Templates and orientations ────────────────────────────────────────────────

const TEMPLATES = [
  "parchment-classic",
  "made-fresh",
  "neighborhood-pro",
  "at-your-service",
  "health-wellness",
  "surprise-me",
] as const;

const ORIENTATIONS: Array<{ label: string; sizeKey: string; isLandscape: boolean }> = [
  { label: "portrait",  sizeKey: "xl",     isLandscape: false },
  { label: "landscape", sizeKey: "medium", isLandscape: true  },
];

// ── Run ────────────────────────────────────────────────────────────────────────
let failures = 0;
let passes   = 0;
const hardTruncatedCombos: string[] = [];

for (const template of TEMPLATES) {
  for (const { label, sizeKey, isLandscape } of ORIENTATIONS) {
    const key = `${template}/${label}`;
    const baseline = BASELINES[key];

    // ── 1. Regression guard (structural inputs, variant 0) ───────────────────
    const dStruct: AdPromptInput = { ...STRUCTURAL, template, sizeKey };
    const bytes = Buffer.byteLength(buildAdPrompt(dStruct, isLandscape, 0), "utf8");
    const limit = (baseline ?? bytes) + GRACE_BYTES;

    if (bytes > limit) {
      console.error(
        `  FAIL  ${key} — ${bytes} bytes (baseline ${baseline ?? "new"} + ${GRACE_BYTES} grace = ${limit}) ` +
        `over by ${bytes - limit}`,
      );
      failures++;
    } else {
      const delta = baseline !== undefined ? ` (${bytes > baseline ? "+" : ""}${bytes - baseline} from baseline)` : " (new)";
      console.log(`  pass  ${key} — ${bytes} bytes${delta}`);
      passes++;
    }

    // ── 2. Hard-truncation audit (typical inputs, informational only) ─────────
    const dTyp: AdPromptInput = { ...TYPICAL, template, sizeKey };
    const raw = buildAdPrompt(dTyp, isLandscape, 0);
    const { hardTruncated, origBytes, finalBytes } = simulateTrim(raw, dTyp.menu);
    if (hardTruncated) {
      hardTruncatedCombos.push(
        `  ⚠  ${key}: ${origBytes}→${finalBytes} bytes (hard-truncated ${origBytes - finalBytes} bytes of instructions)`,
      );
    }
  }
}

// ── Summary ────────────────────────────────────────────────────────────────────
console.log("");
if (hardTruncatedCombos.length > 0) {
  console.log("Hard-truncation audit (informational — not a failure):");
  for (const line of hardTruncatedCombos) console.log(line);
  console.log("");
}

if (failures === 0) {
  console.log(`✓ All ${passes} regression checks passed (grace margin ±${GRACE_BYTES} bytes)`);
  process.exit(0);
} else {
  console.error(
    `✗ ${failures} check(s) failed — template copy has grown beyond its baseline + ${GRACE_BYTES}-byte margin.\n` +
    "  Either shorten the template copy or update BASELINES in this file to record the new intentional size.",
  );
  process.exit(1);
}
