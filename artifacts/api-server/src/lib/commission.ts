export const DEALER_COMMISSION_RATE = 0.35;

export function computeCommissionCents(revenueCents: number): number {
  return Math.round(revenueCents * DEALER_COMMISSION_RATE);
}
