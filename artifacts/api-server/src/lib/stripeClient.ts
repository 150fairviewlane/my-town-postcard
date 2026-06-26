// Stripe client helper backed by the Replit Stripe integration. The
// integration provides both keys (publishable + secret) per-environment
// (development vs deployment), so we never store them in env vars or hand
// them out to the frontend statically.
//
// Source snippet: Replit Stripe blueprint (do not simplify the token
// resolution / refresh logic — it's required for both repls and deployments).
import Stripe from "stripe";

type StripeCreds = {
  publishableKey: string;
  secretKey: string;
};

let cachedCreds: StripeCreds | null = null;
// We refresh on every call when running locally because the dev token can
// rotate; this in-process cache only kicks in when REPLIT_DEPLOYMENT=1 so
// production requests don't re-fetch credentials on the hot path.
const CACHE_FOR_PRODUCTION = process.env.REPLIT_DEPLOYMENT === "1";

async function fetchCredentials(): Promise<StripeCreds> {
  // Direct-env-var path. If the operator provides STRIPE_SECRET_KEY +
  // STRIPE_PUBLISHABLE_KEY (e.g. Stripe TEST keys for a published QA
  // build), use them and skip the Replit connector. This bypasses the
  // Replit Stripe integration's "live keys required to publish" gate.
  const envSecret = process.env.STRIPE_SECRET_KEY;
  const envPublishable = process.env.STRIPE_PUBLISHABLE_KEY;
  if (envSecret && envPublishable) {
    return { secretKey: envSecret, publishableKey: envPublishable };
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Stripe not configured — set STRIPE_SECRET_KEY + STRIPE_PUBLISHABLE_KEY env vars, or connect the Replit Stripe integration",
    );
  }

  // STRIPE_FORCE_TEST_MODE=1 lets a published deployment use the
  // development (Stripe TEST) credentials instead of the production
  // (Stripe LIVE) credentials when going through the Replit connector.
  const forceTestMode = process.env.STRIPE_FORCE_TEST_MODE === "1";
  const isProduction =
    !forceTestMode && process.env.REPLIT_DEPLOYMENT === "1";
  const targetEnvironment = isProduction ? "production" : "development";

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", "stripe");
  url.searchParams.set("environment", targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Replit-Token": xReplitToken,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Stripe credential lookup failed: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    items?: Array<{ settings?: { publishable?: string; secret?: string } }>;
  };
  const settings = data.items?.[0]?.settings;
  if (!settings || !settings.publishable || !settings.secret) {
    throw new Error(
      `Stripe ${targetEnvironment} connection not found. Connect the Stripe integration in Replit.`,
    );
  }

  return {
    publishableKey: settings.publishable,
    secretKey: settings.secret,
  };
}

async function getCredentials(): Promise<StripeCreds> {
  if (CACHE_FOR_PRODUCTION && cachedCreds) return cachedCreds;
  const creds = await fetchCredentials();
  if (CACHE_FOR_PRODUCTION) cachedCreds = creds;
  return creds;
}

/**
 * Returns true if the Stripe integration is configured and reachable.
 * Used by /checkout endpoints to return a clean 503 instead of throwing
 * when the operator hasn't connected Stripe yet.
 */
export async function isStripeConfigured(): Promise<boolean> {
  try {
    await getCredentials();
    return true;
  } catch {
    return false;
  }
}

/**
 * WARNING: Never cache the returned client. Tokens can rotate; always call
 * this fresh per request.
 */
export async function getStripeClient(): Promise<Stripe> {
  const { secretKey } = await getCredentials();
  // Cast required because the installed @types/stripe enum may not list the
  // very latest API version literal even when the runtime supports it.
  return new Stripe(secretKey, { apiVersion: "2025-08-27.basil" as never });
}

export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

/**
 * Returns a synchronous Stripe client configured with STRIPE_QA_SECRET_KEY.
 * Used ONLY by the admin QA bot endpoints (/api/admin/qa/*).
 *
 * Rules enforced at call time:
 *  - Key must be set (STRIPE_QA_SECRET_KEY).
 *  - Key must start with "sk_test_" — live keys are rejected hard so the bot
 *    can never accidentally charge real cards.
 *  - In production deployments (REPLIT_DEPLOYMENT=1 without STRIPE_FORCE_TEST_MODE=1)
 *    the calling route must already have blocked the request before reaching here.
 *
 * Returns a plain Stripe instance (not async) because the key is static —
 * unlike the main client there is no Replit connector token to refresh.
 */
export function getQaStripeClient(): Stripe {
  const key = process.env.STRIPE_QA_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_QA_SECRET_KEY is not set. " +
        "Add the Stripe test-mode secret key (sk_test_...) to run QA bot tests.",
    );
  }
  if (!key.startsWith("sk_test_")) {
    throw new Error(
      "STRIPE_QA_SECRET_KEY must be a Stripe test-mode key (sk_test_...). " +
        "Never configure a live key for QA bot tests.",
    );
  }
  return new Stripe(key, { apiVersion: "2025-08-27.basil" as never });
}
