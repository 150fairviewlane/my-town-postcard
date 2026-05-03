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
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Stripe integration not available — missing REPLIT_CONNECTORS_HOSTNAME or REPL_IDENTITY",
    );
  }

  const isProduction = process.env.REPLIT_DEPLOYMENT === "1";
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
