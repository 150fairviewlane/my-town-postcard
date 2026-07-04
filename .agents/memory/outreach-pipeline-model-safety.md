---
name: Outreach pipeline — model safety and ad gate removal
description: xAI model deprecation pattern, silent catch risk, ad-gate removal reasoning, and startup audit log.
---

## The silent .catch() deprecation trap

`generateAdForOutreach.ts` silently caught errors with `.catch((err) => logger.error(...))`.
When xAI deprecated `grok-2-image-1212` (Feb 24 2026), every ad gen call failed but
`adStatus` stayed `pending` — indistinguishable from "not yet run." Only discovered months later
when someone asked why 100% of ads were pending/failed.

**Fix applied:** `adStatus: "failed"` + `adError: "<message>"` stored on every failure.
`adError` is cleared to null on success or manual retry. UI shows a red error banner when
`adStatus = "failed" && adError != null`.

## Logo gate was an untested assumption

The cascade in `processLogoAndContinue` originally only called `generateAdAndContinue` for
`logoStatus = "usable"`. Unusable/no-logo branches went straight to `draftEmailForBusiness`.
No comment explained why. `generateAdForOutreach` already had a full text-only fallback
(calls `/images/generations` when `logoUrl` is null). The gate was simply never wired.

**Fix applied:** All logo branches now call `generateAdAndContinue(id, params, usableLogo)`.
`usableLogo` is non-null only when `logoStatus === "usable"`. Email draft always goes through
`generateAdAndContinue` → `draftEmailForBusiness` so the draft always gets the ad image when one was produced.

## Batch ads endpoint

Previously required `logoStatus = "usable"`. Removed. Now picks all `adStatus = "pending"`.

## Startup model audit log

Added to `index.ts` immediately after "Server listening" — logs all three xAI model names:
- `xaiImageEdits`: adGenGrok.ts (customer ad generator) — `grok-imagine-image-quality`
- `xaiImageOutreach`: generateAdForOutreach.ts (cold-email ads) — `grok-imagine-image`  
- `xaiVisionFilter`: logoFilter.ts (logo quality check) — `grok-4.3`

**Rule:** When any model name changes, update this log immediately. It's the canary.

## Known model risk

`adGenGrok.ts` (customer-facing) uses `grok-imagine-image-quality` at 6+ call sites. Has
robust error handling (explicit retries, overload fallbacks, visible log lines), so failures
would surface — but no automated alert if the model name is deprecated between restarts.
