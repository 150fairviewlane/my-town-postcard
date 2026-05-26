/**
 * One-shot, idempotent setup script that pre-creates Stripe Products + Prices
 * for the multi-issue subscription plans.
 *
 * The runtime checkout flow (artifacts/api-server/src/routes/subscriptions.ts)
 * uses inline `price_data` so it works without any pre-provisioning — running
 * this script is OPTIONAL. The reason you'd run it:
 *
 *   - Stripe Dashboard reports look prettier when invoices reference a real
 *     Product+Price pair (your team can group recurring revenue by "Growth
 *     Plan — XL" instead of seeing 100 one-off price IDs)
 *   - Future feature work (coupons, customer portal, prorated upgrades) is
 *     much easier with stable Price IDs to reference
 *
 * Idempotent: looks up existing Products by metadata.kind+spotSize+
 * commitmentType and only creates them if missing. Safe to re-run.
 *
 * Run: `pnpm --filter @workspace/scripts run provision-stripe-prices`
 */
import Stripe from "stripe";

// Pricing duplicated from artifacts/api-server/src/lib/subscriptionPricing.ts
// because scripts/ is a leaf workspace package and can't import from artifact
// packages. Keep these numbers in sync if you change discounts.
type CommitmentType = "6_issue" | "12_issue";
type SpotSize = "xl" | "large" | "medium" | "small";

const BASE_PRICE_CENTS: Record<SpotSize, number> = {
  xl: 49900,
  large: 39900,
  medium: 29900,
  small: 19900,
};

const PLAN_METADATA: Record<CommitmentType, { customerLabel: string; totalIssues: number; discount: number }> = {
  "6_issue": { customerLabel: "Growth Plan", totalIssues: 6, discount: 0.1 },
  "12_issue": { customerLabel: "Premium Visibility Plan", totalIssues: 12, discount: 0.2 },
};

function monthlyPriceCents(size: SpotSize, commitmentType: CommitmentType): number {
  return Math.round(BASE_PRICE_CENTS[size] * (1 - PLAN_METADATA[commitmentType].discount));
}

const SECRET = process.env.STRIPE_SECRET_KEY;
if (!SECRET) {
  console.error("STRIPE_SECRET_KEY is required. Set it in the environment and re-run.");
  process.exit(1);
}

const stripe = new Stripe(SECRET);

const SIZES: SpotSize[] = ["xl", "large", "medium", "small"];
const COMMITMENTS: CommitmentType[] = ["6_issue", "12_issue"];

async function findExistingProduct(metaKey: string): Promise<Stripe.Product | null> {
  // Stripe doesn't allow filtering products by metadata at the API level, so
  // we scan the most recent 100. Plenty for our 8 expected products.
  const list = await stripe.products.list({ limit: 100, active: true });
  return list.data.find((p: Stripe.Product) => p.metadata.metaKey === metaKey) ?? null;
}

async function provisionPair(size: SpotSize, commitmentType: CommitmentType) {
  const meta = PLAN_METADATA[commitmentType];
  const monthly = monthlyPriceCents(size, commitmentType);
  const metaKey = `localspot:spot_subscription:${size}:${commitmentType}`;
  const name = `LocalSpot Mailer — ${meta.customerLabel} (${size.toUpperCase()})`;

  let product = await findExistingProduct(metaKey);
  if (!product) {
    product = await stripe.products.create({
      name,
      metadata: {
        metaKey,
        kind: "spot_subscription",
        size,
        commitmentType,
        totalIssues: String(meta.totalIssues),
      },
    });
    console.log(`✓ Created product ${product.id} — ${name}`);
  } else {
    console.log(`= Reusing product ${product.id} — ${name}`);
  }

  const existingPrices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 10,
  });
  const matched = existingPrices.data.find(
    (p: Stripe.Price) => p.unit_amount === monthly && p.recurring?.interval === "month",
  );
  if (matched) {
    console.log(`= Reusing price ${matched.id} — $${(monthly / 100).toFixed(0)}/mo`);
    return { productId: product.id, priceId: matched.id };
  }

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: monthly,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { metaKey, size, commitmentType },
  });
  console.log(`✓ Created price ${price.id} — $${(monthly / 100).toFixed(0)}/mo`);
  return { productId: product.id, priceId: price.id };
}

async function main() {
  console.log("== LocalSpot subscription Stripe price provisioning ==");
  console.log("Base prices:", BASE_PRICE_CENTS);
  const results: Record<string, { productId: string; priceId: string }> = {};
  for (const size of SIZES) {
    for (const commitmentType of COMMITMENTS) {
      const key = `${size}:${commitmentType}`;
      results[key] = await provisionPair(size, commitmentType);
    }
  }
  console.log("\nProvisioned (or reused) the following price IDs:");
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k.padEnd(20)}  ${v.priceId}`);
  }
  console.log(
    "\nThese IDs are not required by the runtime — checkout uses inline price_data. " +
      "They're for nicer Dashboard reporting and future customer-portal work.",
  );
}

main().catch((err) => {
  console.error("Provisioning failed:", err?.message ?? err);
  process.exit(1);
});
