---
name: Starburst corner compositing pattern
description: Why QR mentions cause empty boxes; how the disc prompt + blur-erase pipeline solves the corner decoration problem.
---

## The Rule

Never mention "QR code," "QR," "barcode," or any QR-related term in a Grok image-generation prompt. Grok interprets these as a request to draw a QR placeholder and renders an empty white/colored box it cannot fill with a real scannable pattern.

**Why:** Grok understands it's supposed to place a QR code but can't generate a valid scannable one, so it draws a placeholder box instead.

**How to apply:** Any time you touch `buildAdPrompt.ts`, grep for "QR" in all prompt output strings (not just comments or variable names). Use `check:prompt-size` to verify all 24 template×orientation combos pass, which also surfaces any new strings.

## Current Corner Decoration: Small Gold Disc (not starburst)

The prompt instructs Grok to place a **small solid warm-gold filled circle** in the bottom-right corner:
> "small solid warm-gold filled circle, diameter no more than 15% of image width, no rays/spikes/starburst/lens flare, just a plain filled circle"

The old "starburst bursting from corner" language was removed because starbursts are unbounded — Grok made them with spikes extending 530+ px from corner on a 1200×1500 image. The bounded disc instruction results in discs ≤330 px from corner (measured across 8 fresh renders).

All template descriptions use "small gold disc corner" (not "starburst corner"); hard-constraint blocks say "DISC CORNER" and "No rays, no spikes, no starburst."

## Blur-Erase Pipeline (compositeQr.ts step 3.5)

The AI-generated disc is erased by a blur-extend fill before the glow disc + QR card are composited:

1. Extract a square zone from the bottom-right corner (size = `ERASE_ZONE_PX`).
2. Sample an expanded region (zone + 50% in each axis) so blur mixes in clean pixels.
3. Apply Gaussian blur σ=60.
4. Crop back to zone size; composite over corner → `erasedBase`.
5. Draw glow disc + QR card on top of `erasedBase`.

**ERASE_ZONE_PX** = `discRadius` = `round(cardSize × DISC_RADIUS_MULTIPLIER=2.0)` for each size. Matches the glow disc footprint exactly — a principled bound, not a guess:
- XL (1200×1500): **374 px** (worst observed disc extent: ~330 px)
- L  (900×1200): **270 px**
- M  (900×600):  **186 px**
- S  (600×600):  **186 px**

**Why this size:** The glow disc (drawn in step 4) already covers the entire erasure zone. We erase exactly what the glow disc will be drawn on, so any AI decoration there is replaced before we draw our own. No over-erasure, no under-erasure.

## Compositing Order

`erasedBase` (blurred corner) → glow disc (gradient halo from corner, radius=discRadius) → card+QR (layer on top of disc center).

Single sharp `.composite()` call for the last two layers.

## Bleed Detection

The brightness bleed-check (formerly step 6) was removed because gold corner pixels above the card edge would false-positive on BLEED_THRESHOLD=220 every time.
