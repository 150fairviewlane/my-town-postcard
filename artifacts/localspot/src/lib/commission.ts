/**
 * DEALER_COMMISSION_RATE — frontend mirror of the server-side constant.
 *
 * Keep this in sync with `artifacts/api-server/src/lib/commission.ts`.
 * Both values must be identical. The server-side file is the source of
 * truth for payments; this file is used purely for display in the UI.
 */
export const DEALER_COMMISSION_RATE = 0.30;

/**
 * SOLD_OUT_REVENUE_CENTS — total ad revenue for a fully sold-out postcard.
 *
 * Derived from STANDARD_SPOT_LAYOUT in artifacts/api-server/src/lib/standardLayout.ts:
 *   3 × XL    @ $499 (front) = $1,497
 *   4 × Large @ $399 (front) = $1,596
 *   3 × XL    @ $499 (back)  = $1,497
 *   4 × Medium@ $299 (back)  = $1,196
 *   1 × Small @ $199 (back)  =   $199
 *   ─────────────────────────────────
 *   Total: $5,985 = 598,500 cents
 *
 * Update this constant if spot prices in standardLayout.ts change.
 */
export const SOLD_OUT_REVENUE_CENTS = 598500;
