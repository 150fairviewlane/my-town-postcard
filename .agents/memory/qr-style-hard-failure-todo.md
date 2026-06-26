---
name: QR card style hard-failure enforcement
description: Once all 11 templates have real styles, the startup warning must become a crash — server should refuse to start if any template still has _placeholder:true.
---

# QR card style hard-failure enforcement

## The rule
When all 11 ad templates have finalized entries in `TEMPLATE_QR_STYLES` (no `_placeholder: true`), the module-level startup check in `compositeQr.ts` must be converted from `logger.warn` to `throw new Error(…)`.

**Why:** A template cannot exist without a matching QR card style. The warning is correct scaffolding during rollout but must not be the permanent state.

## How to apply
1. Confirm every template in `TEMPLATE_QR_STYLES` has a real style (no `_placeholder` key at all).
2. In `compositeQr.ts`, replace the `logger.warn(…)` block with:
   ```ts
   if (pendingTemplates.length > 0) {
     throw new Error(
       `compositeQr: missing finalized QR card styles for: ${pendingTemplates.join(", ")}. ` +
       `Add real values to TEMPLATE_QR_STYLES before starting the server.`
     );
   }
   ```
3. Delete `PLACEHOLDER_QR_STYLE` const and `_placeholder?: true` from the `CardStyle` interface.
4. Verify server starts cleanly with no warnings.

## Prerequisite
All 9 remaining placeholder templates must be filled in first (the per-template QR frame design work). The 2 finalized templates are: `heritage-home`, `health-wellness`.

## Relevant files
- `artifacts/api-server/src/lib/compositeQr.ts` — `TEMPLATE_QR_STYLES`, `CardStyle` interface, module-level startup block (currently `logger.warn`)
- `artifacts/api-server/src/index.ts` — no changes needed; the throw propagates naturally on import
