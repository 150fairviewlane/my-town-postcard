---
name: QR corner compositing — opaque panel
description: How the QR corner decoration is rendered in compositeQr.ts; what the prompt says about the corner strip.
---

**Rule:** The bottom-right QR area is covered by an opaque footer-coloured panel + crisp-shadow card; NO glow disc, NO blur-erase step.

**Why:** Blur-erase produced smudgy artefacts at JPEG compression boundaries. The panel approach is deterministic and produces a clean hard edge matching Grok's own footer colour exactly.

**How to apply:**
- `sampleFooterColor` extracts a 60×20 px patch at imgW×60 %, bottom-20 % of image height, computes median RGB — this is the panel fill. Falls back to `style.fill` if image is too small.
- `PANEL_SIZE_PX` (xl:374 l:270 m:186 s:186) controls panel footprint; must be ≥ old ERASE_ZONE_PX values.
- `SHADOW_EXTRA=8` pixels are added to the card SVG canvas so `feDropShadow` doesn't clip at card boundary.
- In `buildAdPrompt.ts`, `qrSlot` describes the area as "BOTTOM-RIGHT STRIP (full footer height, right edge, width = X.XX"): solid footer background color only — no text, no address, no marks. Do NOT draw a QR code." — NO gold disc language anywhere in the prompts.
- Address clauses direct text away from the strip: landscape "must not enter the right-edge strip"; portrait "left column only — must not enter the right-edge strip".
- The old `starburst-corner-compositing.md` file is obsolete and superseded by this entry.
