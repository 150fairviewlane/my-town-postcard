// Pricing for the multi-issue subscription plans. Single source of truth:
//   - The plan metadata drives the customer-facing card copy
//   - The cents-per-size table drives Stripe pricing + admin totals
//   - The helper functions compute discounts, totals, and cost-per-household
//
// The frontend imports the JS mirror at
//   artifacts/localspot/src/lib/subscriptionPlans.js
// — keep the two in sync if you tweak discounts or labels.

export type CommitmentType = "single" | "6_issue" | "12_issue";

export type SpotSize = "xl" | "large" | "medium" | "small";

export interface PlanMetadata {
  /** Internal key used in DB enum + Stripe metadata. */
  key: CommitmentType;
  /** Customer-facing name shown on the checkout card. */
  customerLabel: string;
  /** Subtitle under the name. */
  subtitle: string;
  /** Number of issues bundled (1 for one-time). */
  totalIssues: number;
  /** Per-issue discount applied to the size's base price. 0 for one-time. */
  discount: number;
  /** True for the recommended/best-value badge. */
  highlight: boolean;
}

export const PLAN_METADATA: Record<CommitmentType, PlanMetadata> = {
  single: {
    key: "single",
    customerLabel: "One-Time Placement",
    subtitle: "Runs in the next issue",
    totalIssues: 1,
    discount: 0,
    highlight: false,
  },
  "6_issue": {
    key: "6_issue",
    customerLabel: "Growth Plan",
    subtitle: "Runs for 6 consecutive issues — save 10%",
    totalIssues: 6,
    discount: 0.1,
    highlight: false,
  },
  "12_issue": {
    key: "12_issue",
    customerLabel: "Premium Visibility Plan",
    subtitle: "Runs for 12 consecutive issues — save 20%",
    totalIssues: 12,
    discount: 0.2,
    highlight: true,
  },
};

/** Standard per-issue base prices in cents, by spot size. */
export const BASE_PRICE_CENTS: Record<SpotSize, number> = {
  xl: 49900,
  large: 39900,
  medium: 29900,
  small: 19900,
};

/** Number of households reached per issue — drives the cost-per-home copy. */
export const HOMES_PER_ISSUE = 5000;

/**
 * Per-month price for a subscription tier. Rounded to the nearest cent so
 * Stripe gets a whole-cent amount. For commitmentType="single" this just
 * returns the base price.
 */
export function monthlyPriceCents(size: SpotSize, commitmentType: CommitmentType): number {
  const base = BASE_PRICE_CENTS[size];
  const meta = PLAN_METADATA[commitmentType];
  return Math.round(base * (1 - meta.discount));
}

/** Total commitment value across all included issues, in cents. */
export function totalCommitmentValueCents(size: SpotSize, commitmentType: CommitmentType): number {
  const monthly = monthlyPriceCents(size, commitmentType);
  const meta = PLAN_METADATA[commitmentType];
  return monthly * meta.totalIssues;
}

/**
 * Returns the cost-per-household (in cents, can be fractional) used for
 * the "≈ X¢ per home" line on the plan card. Per-issue, since each issue
 * reaches HOMES_PER_ISSUE homes.
 */
export function costPerHouseholdCents(size: SpotSize, commitmentType: CommitmentType): number {
  return monthlyPriceCents(size, commitmentType) / HOMES_PER_ISSUE;
}

/**
 * Validate / narrow an arbitrary string into a CommitmentType. Used by
 * the API layer to validate request bodies without dragging Zod into
 * every helper.
 */
export function parseCommitmentType(raw: unknown): CommitmentType | null {
  if (raw === "single" || raw === "6_issue" || raw === "12_issue") return raw;
  return null;
}

/**
 * Adds N calendar months to `from` and returns the resulting Date. Used
 * to compute the Stripe `cancel_at` timestamp so the subscription
 * auto-cancels at the end of its committed term without auto-renewing.
 */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}
