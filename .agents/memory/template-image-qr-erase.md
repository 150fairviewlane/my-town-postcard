---
name: Template reference image QR erase
description: How to erase QR codes / placeholder boxes from Grok ad-template reference images in attached_assets/ without over-erasing or wrong fill colour.
---

## Rule
The 20 ad-template reference images in `attached_assets/` must have the bottom-right corner plain and blank (matching surrounding background colour) so Grok doesn't reproduce the QR it sees there.

## Erase-region geometry
Mirrors `compositeQr.ts` production constants exactly:
- `CARD_MARGIN = 1.0375` — use this for **all** templates regardless of `circularCard` or `marginMultiplier`; the 1.45× multiplier for brush-stroke is a circular-card geometric constraint, NOT a reason to erase more of the template reference image (erasing with 1.45× wipes out ~50% of the image height and destroys intended icon rows).
- `discRadius = round(round(qrSize × CARD_MARGIN) × DISC_RADIUS_MULTIPLIER)`
- Scale to actual reference image: `eraseW = discRadius × actualW / prodW × buffer`
- Buffer: 1.15 standard, 1.20 for health-wellness (placeholder box taller), 1.30 for wok-fire (gold arrow to the left of QR).

Production specs (from `QR_PLACEMENT`):
- XL portrait (≥0.77 ratio): 1200×1500
- L portrait (<0.77 ratio): 900×1200
- M landscape (≥1.2 ratio): 900×600

## Fill-colour sampling
**Critical:** sample at `x = W × 0.40, y = H × 0.97` (97% from top), 20×6 px, averaged. This guarantees the sample lands in the footer strip, not body content above it.

**Why mid-erase-zone sampling fails:** the erase zone spans 30–40% of image height. Mid-zone hits coupon paper, photo backgrounds, or body elements rather than the footer bar, producing wildly wrong colours (tan on dark-teal, lime-green on near-black, white on purple).

## Sharp location
`/home/runner/workspace/node_modules/.pnpm/sharp@0.34.5/node_modules/sharp` — not at workspace root `node_modules/sharp`.

## What's clean (no fix needed)
`made_fresh_template.png` and `made_fresh_landscape_1779162178190.png` — no QR placeholder in either.

## Two-pass pitfall
If a pass uses wrong erase geometry (too large), restore from git before re-running:
`git show HEAD:attached_assets/<file> > attached_assets/<file>`
Both brush-stroke files (`IMG_0839_1780955044987.png`, `IMG_0838_1780955044987.png`) are git-tracked.
