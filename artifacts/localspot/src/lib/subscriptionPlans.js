// Customer-facing copy + math for the plan selector on /checkout/:spotId.
// Mirror of artifacts/api-server/src/lib/subscriptionPricing.ts — keep the
// numbers in sync if you change discounts. Server is authoritative for the
// actual Stripe charge; this file just powers the UI.

export const BASE_PRICE_CENTS = {
  xl: 49900,
  large: 39900,
  medium: 29900,
  small: 19900,
};

export const PLANS = [
  {
    key: "single",
    label: "One-Time Placement",
    subtitle: "Runs in the next issue only",
    totalIssues: 1,
    discount: 0,
    highlight: false,
  },
  {
    key: "4_issue",
    label: "Quarterly Plan",
    subtitle: "4 consecutive issues · save 10%",
    totalIssues: 4,
    discount: 0.1,
    highlight: false,
  },
  {
    key: "12_issue",
    label: "Premium Visibility Plan",
    subtitle: "12 consecutive issues · save 20%",
    totalIssues: 12,
    discount: 0.2,
    highlight: true,
  },
];

export const HOMES_PER_ISSUE = 5000;

export function monthlyCents(size, planKey) {
  const plan = PLANS.find((p) => p.key === planKey) || PLANS[0];
  const base = BASE_PRICE_CENTS[size] ?? 0;
  return Math.round(base * (1 - plan.discount));
}

export function totalCents(size, planKey) {
  const plan = PLANS.find((p) => p.key === planKey) || PLANS[0];
  return monthlyCents(size, planKey) * plan.totalIssues;
}

export function formatUsd(cents) {
  if (!Number.isFinite(cents)) return "$—";
  return `$${(cents / 100).toFixed(0)}`;
}

export function formatUsdCents(cents) {
  if (!Number.isFinite(cents)) return "—";
  return `${(cents / 100).toFixed(1)}¢`;
}
