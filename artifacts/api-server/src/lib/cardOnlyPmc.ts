import type Stripe from "stripe";
import { logger } from "./logger";

// Module-level cache so we only create one PMC per process lifetime.
// On restart a new PMC is created; old ones accumulate on the Stripe
// account but are harmless (they are inactive child configs).
let cachedPmcId: string | null = null;

/**
 * Returns the Stripe Payment Method Configuration ID for a card-only
 * checkout experience — Apple Pay, Google Pay, Link, and all other
 * non-card payment methods are disabled.
 *
 * The PMC is created lazily on first call and cached in memory.
 * Passing `payment_method_configuration` to a Checkout Session
 * overrides the account's default Payment Method Configuration, giving
 * deterministic per-session control without touching Dashboard settings.
 *
 * Note: `payment_method_configuration` and `payment_method_types` are
 * mutually exclusive on Session create — callers must omit
 * `payment_method_types` when using this ID.
 */
export async function getCardOnlyPmcId(stripe: Stripe): Promise<string> {
  if (cachedPmcId) return cachedPmcId;

  const pmc = await stripe.paymentMethodConfigurations.create({
    card: {
      display_preference: { preference: "on" },
    },
    apple_pay: {
      display_preference: { preference: "off" },
    },
    google_pay: {
      display_preference: { preference: "off" },
    },
    link: {
      display_preference: { preference: "off" },
    },
  });

  cachedPmcId = pmc.id;
  logger.info({ pmcId: pmc.id }, "Created card-only Payment Method Configuration");
  return cachedPmcId;
}
