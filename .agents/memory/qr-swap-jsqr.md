---
name: QR swap pipeline — jsQR detect-replace
description: After restoring reference images with real QR codes, jsQR detects where Grok reproduced the QR, then swapQrCode replaces it with a real scannable one. compositeQrOnto is the fallback only.
---

# QR Swap Pipeline — jsQR Detect-and-Replace

## The Rule
All 20 ad template reference images in `attached_assets/` now contain a real QR code in the bottom-right corner. When Grok sees these reference images it reproduces the QR naturally. `swapQrCode` (in `locateQrCode.ts`) uses jsQR to find that QR, composites the real scannable version centered on the detected bbox, and verifies the result. `compositeQrOnto` (fixed corner) is the fallback only — it runs when jsQR finds nothing.

**Why:** Eliminates the corner-cleanup Grok call (one fewer API round-trip per generation) and removes the GPT-4o vision dependency (`detectAndReplaceQr.ts` is now dead code). jsQR is local, free, and fast.

**How to apply:**
- All QR compositing in adGenGrok.ts goes through `swapQrCode(buf, url, sizeKey, qrStyle)`.
- `compositeQrOnto` is no longer directly imported in adGenGrok.ts.
- Do NOT re-add a `callCornerCleanup` pass — it was removed intentionally.
- `detectAndReplaceQr.ts` is dead code (not imported anywhere) — see task #394 to delete it.
- Reference images were restored from commit `43cfb1b` (parent of corner-erase audit `07743c0`).
- `made_fresh_template.png` and `made_fresh_landscape_*.png` never had QR codes and were intentionally NOT restored.

## Pipeline

```
Grok image URL
  → cropToSpotDims()        (Sharp resize+crop to print px)
  → swapQrCode(buf, ...)    (locateQrCode.ts)
      ├─ Sharp raw RGBA → jsQR → found?
      │    YES: compositeQrOnto centered on bbox → verify with jsQR
      │    NO:  compositeQrOnto at fixed bottom-right corner (fallback)
      └─ returns final Buffer
```
