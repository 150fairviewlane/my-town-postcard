# QR Zone Exclusion Hypothesis Test Results

Tests run after adding named per-template QR zone exclusion constraints to
`src/lib/buildAdPrompt.ts`. Each template got 4 fresh XL portrait renders.
The bottom-right 400×400px corner was cropped and visually inspected for the
specific bleed-over shape named in that template's exclusion string.

**Legend:** ABSENT = named shape not present inside QR square |
REDUCED = background texture present but no structured element; real QR card
covers it | UNCHANGED = named shape still fully present inside QR square

---

## Round 1 — heritage-home and home-elegance (initial validation)

### heritage-home
Exclusion: cream-background rounded-rect with thin burgundy border,
headline-style box with diamond ◆ separator, or any HEADLINE zone element.

| Render | Outcome | Notes |
|--------|---------|-------|
| R1 | ABSENT | Dark burgundy footer in QR zone; cream coupon box correctly left of QR. No cream rounded-rect or ◆ separator inside QR square. |
| R2 | ABSENT | Same pattern. Coupon correctly to the left; dark burgundy QR zone clean. |
| R3 | ABSENT | Same. |
| R4 | ABSENT | Cream coupon visible to left of QR; QR zone is plain dark burgundy footer. |

**Result: 4/4 ABSENT ✓**

### home-elegance
Exclusion: solid navy filled rectangle, rounded-rect service tile, or circular
dark navy icon badge.

| Render | Outcome | Notes |
|--------|---------|-------|
| R1 | ABSENT | Dark navy footer in QR zone; cream blob wave stays in upper portion. No service tile or icon badge inside QR square. |
| R2 | ABSENT | Dashed coupon box above QR zone (correct). QR zone is dark navy — no service tile content inside it. |
| R3 | ABSENT | Cream blob wave above, dark navy QR zone. No service tile or badge. |
| R4 | ABSENT | Same — cream wave + gold accent above, dark navy QR zone clean. |

**Result: 4/4 ABSENT ✓**

---

## Round 2 — six byte-limit-affected templates (re-tested after wording trim)

These six templates had portrait exclusion strings shortened to fit the 7800-byte
prompt size limit. Named element types were preserved; only boilerplate prefix/suffix
was trimmed. Each was re-rendered 4 times with the final wording to confirm the
trimmed strings still suppress bleed-through.

### purple-sage
Exclusion: `QR LOCK: No purple circle/dot-grid, coupon box, cream tile, or leaf sprig in QR corner.`
(portrait prompt at 7800 bytes — at limit)

| Render | Outcome | Notes |
|--------|---------|-------|
| R1 | ABSENT | Dashed coupon box and botanical leaf correctly placed outside QR zone. Dark purple footer clean. |
| R2 | ABSENT | Coupon and leaf/sprig outside QR zone. Purple wave bands above footer. |
| R3 | ABSENT | Coupon upper-portion, botanical vine upper-right (correct). Dark purple footer. |
| R4 | ABSENT | Dashed coupon upper-left, botanical vine upper-right, lavender wave bands. QR zone clean dark purple. |

**Result: 4/4 ABSENT ✓**

### sage-organic
Exclusion: `QR LOCK: No kraft coupon, dark olive badge, or olive wave band in QR corner.`

| Render | Outcome | Notes |
|--------|---------|-------|
| R1 | ABSENT | Kraft dashed-stitch coupon correctly upper portion. Dark olive circular accent correctly outside QR zone. QR zone is dark olive background only. |
| R2 | ABSENT | Kraft coupon correctly upper-centre. Dark olive column bands outside QR zone. |
| R3 | ABSENT | Kraft coupon correctly upper. Dark olive background in QR zone — no coupon structure inside it. |
| R4 | ABSENT | Kraft coupon upper; dark olive circular accent outside QR zone. |

**Result: 4/4 ABSENT ✓**

### home-elegance (re-run with trimmed wording)
Exclusion: `QR LOCK — not in QR corner: a solid navy rectangle, a rounded-rect service tile, or a circular dark navy icon badge.`

| Render | Outcome | Notes |
|--------|---------|-------|
| R1 | ABSENT | Dashed coupon box correctly upper-left. Solid dark navy flat block in QR zone — no service tile content or icon badge inside it; flat placeholder colour only. |
| R2 | ABSENT | Solid dark navy flat block in QR zone. Service tile labels correctly above footer. |
| R3 | ABSENT | Dashed coupon box upper area. Dark navy flat block — no icon badge or tile structure inside QR square. |
| R4 | ABSENT | Service tile label and coupon correctly above footer line. Dark navy flat block in QR zone — flat, no styled content. |

**Result: 4/4 ABSENT ✓**

### wok-fire
Exclusion: `QR ZONE HARD CONSTRAINT: ... must NOT contain a dark chalkboard A-frame sign, a golden ticket-stub coupon, a torn-edge deep red panel element, or a parchment/kraft torn-edge banner. Those elements must never appear in the QR corner square.`

| Render | Outcome | Notes |
|--------|---------|-------|
| R1 | ABSENT | Chalkboard A-frame correctly upper-left. Deep red footer colour in QR zone — structural footer, not a torn-edge panel element. Gold arrow correctly in left footer strip. |
| R2 | ABSENT | Chalkboard A-frame correctly upper. Gold arrow. No A-frame, ticket-stub, or kraft banner inside QR square. |
| R3 | REDUCED | Chalkboard A-frame correctly upper. Grok placeholder sits on red paint-brushed texture in QR zone — background texture only, not a structured torn-edge panel element. Real QR card covers it cleanly. |
| R4 | ABSENT | Chalkboard sign and gold arrow correctly positioned. QR zone is dark near-black background. |

**Result: 3/4 ABSENT, 1/4 REDUCED ✓** (R3 reduction is background texture only, covered by composited QR card)

### brush-stroke
Exclusion: `QR ZONE HARD CONSTRAINT: ... must NOT contain a circular olive-bordered icon badge, a dark charcoal horizontal brush-stroke shape, or a dark charcoal curved-top footer extension. Those elements must never appear in the QR corner square.`

| Render | Outcome | Notes |
|--------|---------|-------|
| R1 | ABSENT | Dashed coupon box correctly upper-left. The circular olive-bordered circle in the QR zone is the composited QR card's own circular style for this template (circularCard=true in TEMPLATE_QR_STYLES — intentional design, not a bleed-over service badge). Service rows with charcoal brush-stroke shapes correctly above footer. |
| R2 | ABSENT | Dashed coupon correctly upper area. Circular olive-bordered QR card (composited). Service rows correctly above. |
| R3 | ABSENT | Charcoal brush-stroke service label ("Decks") correctly in service row above footer. Circular olive-bordered QR card in footer zone only. |
| R4 | ABSENT | Dashed coupon upper area. Circular olive-bordered QR card. Dark charcoal footer. |

**Result: 4/4 ABSENT ✓**

### heritage-home (re-run with trimmed wording)
Exclusion: `QR LOCK — must not contain in QR corner: a cream-background rounded-rect with a thin burgundy border, a headline-style box with a diamond ◆ separator, or any element from the HEADLINE zone.`

| Render | Outcome | Notes |
|--------|---------|-------|
| R1 | ABSENT | Cream coupon box correctly upper-left. Grok placeholder is a dark burgundy flat rectangle — footer colour, not a cream rounded-rect with burgundy border. |
| R2 | ABSENT | Cream coupon correctly upper-left. Service badge strip correctly above. Dark burgundy footer clean. |
| R3 | ABSENT | Cream coupon correctly upper-left. Dark burgundy footer. Grok placeholder is dark burgundy flat. |
| R4 | ABSENT | Large cream coupon ($500 Off Closing Costs) fills upper portion — correctly above footer line. Dark burgundy footer below; QR zone holds no cream rounded-rect. |

**Result: 4/4 ABSENT ✓**

---

## Summary

| Template | Renders tested | ABSENT | REDUCED | UNCHANGED |
|----------|---------------|--------|---------|-----------|
| heritage-home (round 1) | 4 | 4 | 0 | 0 |
| home-elegance (round 1) | 4 | 4 | 0 | 0 |
| purple-sage (round 2) | 4 | 4 | 0 | 0 |
| sage-organic (round 2) | 4 | 4 | 0 | 0 |
| home-elegance (round 2) | 4 | 4 | 0 | 0 |
| wok-fire (round 2) | 4 | 3 | 1 | 0 |
| brush-stroke (round 2) | 4 | 4 | 0 | 0 |
| heritage-home (round 2) | 4 | 4 | 0 | 0 |
| **Total** | **32** | **31** | **1** | **0** |

31/32 renders: named bleed shape fully absent from QR square.
1/32 (wok-fire R3): red paint-brushed background texture in QR zone — no
structured torn-edge panel element present; real composited QR card covers it.

Remaining 5 templates (parchment-classic, made-fresh, neighborhood-pro,
at-your-service, health-wellness) received exclusion strings pre-emptively
but are not render-tested in this session (see follow-up task #362).
