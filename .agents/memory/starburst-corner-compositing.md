---
name: Starburst corner compositing pattern
description: Why QR mentions in Grok prompts cause empty boxes, and how the server-side starburst + prompt cleanup solves it.
---

## The Rule

Never mention "QR code," "QR," "barcode," or any QR-related term in a Grok image-generation prompt. Grok interprets these as a request to draw a QR placeholder and renders an empty white/colored box it cannot fill with a real scannable pattern.

**Why:** Grok understands it's supposed to place a QR code but can't generate a valid scannable one, so it draws a placeholder box instead.

**How to apply:** Any time you touch `buildAdPrompt.ts`, grep for "QR" in all prompt output strings (not just comments or variable names). Use `check:prompt-size` to verify all 24 template×orientation combos pass, which also surfaces any new strings.

## Replacement Strategy

Replace all QR-related corner instructions with starburst language:
- `qrSlot` in `buildFooterZone` → "warm-gold starburst graphic bursting from the image corner — RIGHT and BOTTOM edges at image border, zero margin. Do not place text, phone numbers, address, or service items here."
- "QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain" → "STARBURST CORNER: The bottom-right starburst area must NOT contain"
- "No QR inside coupon." → remove entirely
- "small white rounded QR box" → "starburst corner graphic"
- Per-template "QR [code] [far] right" in template descriptions → "starburst corner"

## Server-Side Starburst (compositeQr.ts)

A 16-point warm-gold (#F4A800) SVG polygon is composited server-side BEFORE the backing card+QR:

- **Geometry:** outerRadius = round((cardSize + CARD_INSET) × √2 × STARBURST_SCALE=1.1)
- **Center:** at the image's bottom-right corner pixel (imgW, imgH) = SVG's bottom-right corner (outerRadius, outerRadius)
- **Visibility:** only the upper-left quadrant of spikes is within the SVG viewport and therefore visible in the image
- **First spike:** at 225° (upper-left diagonal into the image) — the most prominent visual spike
- **Compositing order:** starburst (layer 1, bottom) → card+QR (layer 2, top) — single sharp `.composite()` call

## Bleed Detection

The brightness bleed-check (formerly step 6) was removed because the gold starburst pixels above the card edge would false-positive on the BLEED_THRESHOLD=220 check every time.
