---
name: Grok popup stale-closure pattern
description: Why handleComplete in PostcardPickerSection needs explicit sel/side capture when called from the Grok popup handler
---

## Rule
`openGrokGenerator()` must capture `sel` and `side` at the moment the popup opens and pass them as explicit parameters (`selOverride`, `sideOverride`) to `handleComplete()`. Never rely on the handler closure's render-cycle `sel`/`side`.

**Why:** The Grok popup can stay open for 20+ minutes while the user refines their ad. During that time the parent component re-renders many times (campaign polling). The handler closure captures `handleComplete` from the render at popup-open time, but that `handleComplete`'s own closure `sel`/`side` can diverge if the component re-renders.

**How to apply:** In `openGrokGenerator`, do `const capturedSel=sel; const capturedSide=side;` before any async or state-mutating code, then call `handleComplete(formData, capturedSel, capturedSide)` from the message handler.

## Related fix
If the preferred spot becomes unavailable (e.g. taken by another buyer while the user was in the popup), `handleComplete` now auto-falls-back to any available spot of the same size+side rather than just erroring. This prevents the user losing their generated ad after a 20-minute session.

## Diagnostic additions
`console.error` calls were added at every early-return branch in `handleComplete` so browser DevTools shows the exact failure path.
