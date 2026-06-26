---
name: QR card sizing — physical-inch square
description: Formula and per-size values for the composited QR backing card; includes the M/S print-spec correction.
---

## Rule
`cardSize (px) = Math.round(qrSize_px × 1.15)`

DPI cancels out of the formula (qrPx/DPI × 1.15 × DPI = qrPx × 1.15), so no DPI constant is needed. Card is always a **square**; QR centered with `qrOffset = Math.floor((cardSize − qrSize) / 2)`. Card anchored `CARD_INSET=6 px` from the image bottom-right corner.

## Per-size values (confirmed)

| Size | imgW×imgH | Physical | qrSize | cardSize | cardInches | qrOffset |
|---|---|---|---|---|---|---|
| XL | 1200×1500 | 4"×5" | 180 | 207 | 0.69" | 13 |
| L  | 900×1200  | 3"×4" | 130 | 150 | 0.50" | 10 |
| M  | 900×600   | **3"×2"** | 90 | 103 | 0.34" | 6 |
| S  | 600×600   | 2"×2" | 90 | 103 | 0.34" | 6 |

**Why:** `Math.round(90 × 1.15) = Math.round(103.499…) = 103` due to float precision — 103, not 104. This is consistent in both compositeQr.ts and genQrSamples.ts.

## M spot print spec correction
The README says "Medium and Small spots are both 2"×2" (200×200 natural px)" — this is **wrong**. M is 3"×2" (900×600 px at 300 DPI). S is 2"×2" (600×600 px). Always derive from pixel dims ÷ 300 DPI.

**Why:** The README's "200×200 natural px" refers to the low-res postcard grid, not the ad generation resolution (which is 3× for XL/L, and matched to the actual print size for M/S).

## Telemetry
`compositeQr.ts` samples a 20-px strip just above the card top edge after compositing. If avg pixel brightness > 220, it emits `logger.warn` with `avgBrightnessAboveCard`. This catches Grok placeholder bleed without correcting it — purely diagnostic.

## Prompt sync
Both `buildFooterZone` functions (adGenGrok.ts local + buildAdPrompt.ts exported) accept optional `sizeKey?: string` and compute `qrCardInches` from it:
- xl → 0.69", l → 0.50", m/s/unknown → 0.35"

All call sites pass `d.sizeKey`. If qrSize or CARD_MARGIN ever changes, update the `qrCardInches` lookup in both functions to match.
