---
name: Template image cleanup — magenta-erase margin
description: Behavior of cleanTemplateQr.ts erase region and when it damages landscape images
---

The script (`scripts/src/cleanTemplateQr.ts`) finds the magenta square by scanning for
high-R+B / low-G pixels in the bottom-right quadrant, then erases the surrounding region:
- **eraseLeft** = minX − 600  (up to 600px to the left of the magenta)
- **eraseTop**  = minY − 200  (200px above the magenta's top edge)
- to image right edge and bottom edge

**Why this matters:** For *portrait* images the magenta sits deep in a tall image (~1530/1536px),
so 200px above hits only the dark footer band — correct. For *landscape* images (1024px tall),
the magenta sits at ~y=835, so 200px above = y=635, which cuts into design content (service
icon boxes, coupon grids) at roughly 60% from the top.

**How to apply:**
- If re-running cleanup on landscape images, use `eraseTop = minY − 30` (or just `minY`)
  instead of `minY − 200`.
- If a landscape image was already over-erased (flat color rect visible in design area),
  restore from git before re-running:
  `git show <commit>:attached_assets/<file> > /tmp/restored.png`
  then use a targeted Sharp composite script with the correct region.
- The "restore reference images" commit `123665e` (2026-06-29 21:24) is a good baseline —
  images have real QR codes at that point, not giant magenta blocks from prior fix attempts.
