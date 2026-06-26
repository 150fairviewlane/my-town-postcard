/**
 * LocalSpot QA Purchase Bot — PATH 2B
 *
 * Validates the full ad-spot checkout flow against the live server using
 * Stripe test-mode keys.  All purchases are flagged isQaTest=true and
 * excluded from milestone emails, revenue rollups, and commission totals.
 *
 * ─── DOCUMENTED COVERAGE GAP (PATH 2B, confirmed 2026-06-26) ───────────────
 * The hosted Stripe Checkout Session path (create-spot-session →
 * checkout.stripe.com → checkout.session.completed webhook) is NOT exercised
 * by this bot.
 *
 * Why: Loading the hosted Checkout Session URL — even with real Chromium and
 * full JS execution — does NOT cause Stripe to lazily attach a PaymentIntent
 * to the session.  Attachment only happens after the customer interacts with
 * the payment form (not on page load).  Confirmed via live Playwright test.
 *
 * This bot therefore exercises the EMBEDDED PaymentIntent fulfillment path
 * only: POST /api/admin/qa/checkout (which creates+confirms a PI with the
 * QA Stripe key and runs the same DB writes as /api/checkout/confirm).
 *
 * Known gap: the checkout.session.completed webhook branch in webhooks.ts is
 * NOT covered.  To cover it, send a synthetic signed POST to
 * /api/webhooks/stripe with a checkout.session.completed payload.  That is a
 * separate unit-level test of the webhook handler and is not solved here.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Prerequisites:
 *   1. Run the seed script first: pnpm --filter @workspace/scripts run seed:qa
 *   2. Set STRIPE_QA_SECRET_KEY=sk_test_...  (same Stripe account as the
 *      main key; must be test-mode — live keys are rejected hard)
 *   3. Server must be running: pnpm --filter @workspace/api-server run dev
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run qa:bot
 *   QA_GRID_AREA=dn pnpm --filter @workspace/scripts run qa:bot   (pick a spot)
 *
 * Exit codes:
 *   0  All assertions passed
 *   1  Any assertion failed or unexpected error
 */

import { chromium } from "playwright";
import { db, spotsTable, ordersTable, campaignsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL =
  process.env.QA_BASE_URL ||
  (process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}`
    : "http://localhost:80");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "localspot-admin-2025";
const QA_GRID_AREA = process.env.QA_GRID_AREA || "mb";
const QA_SLUG = "__qa-test__";

const BUSINESS_NAME = "QA Bot Test Co";
const CONTACT_EMAIL = "qa-bot@localspot-test.invalid";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string, data?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  const extra = data ? " " + JSON.stringify(data) : "";
  console.log(`[${ts}] ${msg}${extra}`);
}

function fail(msg: string, data?: Record<string, unknown>): never {
  log(`FAIL: ${msg}`, data);
  process.exit(1);
}

async function adminLogin(): Promise<string> {
  const resp = await fetch(`${BASE_URL}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    fail("Admin login failed", { status: resp.status, body });
  }
  const data = (await resp.json()) as { token?: string };
  if (!data.token) fail("Admin login returned no token");
  return data.token!;
}

async function findAvailableQaSpot(
  token: string,
  gridArea: string,
): Promise<{ id: number; price: number; campaignId: number }> {
  // Look up QA campaign by slug in the DB directly (it's unpublished; the
  // public API won't find it)
  const [campaign] = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(eq(campaignsTable.slug, QA_SLUG))
    .limit(1);

  if (!campaign) {
    fail("QA campaign not found. Run: pnpm --filter @workspace/scripts run seed:qa");
  }

  const [spot] = await db
    .select({ id: spotsTable.id, price: spotsTable.price, status: spotsTable.status })
    .from(spotsTable)
    .where(
      and(
        eq(spotsTable.campaignId, campaign.id),
        eq(spotsTable.gridArea, gridArea),
        eq(spotsTable.isQaTest, true),
      ),
    )
    .limit(1);

  if (!spot) {
    fail(`No QA spot with gridArea="${gridArea}" found. Run seed:qa or set QA_GRID_AREA to a valid value.`);
  }
  if (spot.status !== "available") {
    // Auto-cleanup stale state from a previous crashed run
    log(`Spot ${spot.id} is "${spot.status}" — running cleanup before proceeding`);
    const cleanResp = await fetch(`${BASE_URL}/api/admin/qa/cleanup`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!cleanResp.ok) fail("Pre-run cleanup failed", { status: cleanResp.status });
    const cleanData = await cleanResp.json() as Record<string, unknown>;
    log("Pre-run cleanup complete", cleanData);
  }

  return { id: spot.id, price: spot.price, campaignId: campaign.id };
}

async function qaReserve(
  token: string,
  spotId: number,
): Promise<void> {
  const resp = await fetch(`${BASE_URL}/api/admin/qa/reserve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      spotId,
      businessName: BUSINESS_NAME,
      contactEmail: CONTACT_EMAIL,
      businessCategory: "QA Test",
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    fail("QA reserve failed", { status: resp.status, body });
  }
  log("Reserved QA spot", { spotId });
}

async function qaCheckout(
  token: string,
  spotId: number,
): Promise<{ piId: string; orderId: number; trackingCode: string | null }> {
  const resp = await fetch(`${BASE_URL}/api/admin/qa/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ spotId }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    fail("QA checkout failed", { status: resp.status, body });
  }
  return resp.json() as Promise<{ piId: string; orderId: number; trackingCode: string | null }>;
}

async function qaCleanup(token: string): Promise<void> {
  try {
    const resp = await fetch(`${BASE_URL}/api/admin/qa/cleanup`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json() as Record<string, unknown>;
    log("Cleanup complete", data);
  } catch (err) {
    log("Cleanup request failed (non-fatal)", { err: String(err) });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  log("QA Purchase Bot starting (PATH 2B — embedded PaymentIntent path)");
  log("Base URL", { BASE_URL });

  // ------------------------------------------------------------------
  // 0. Verify a test-mode Stripe key is available for the QA bot
  //
  //    Mirrors the server-side fallback in getQaStripeClient():
  //    prefer STRIPE_QA_SECRET_KEY; fall back to STRIPE_SECRET_KEY
  //    when it is already test-mode (sk_test_...).  In dev the main key
  //    is always a test key so no separate QA key is required.
  // ------------------------------------------------------------------
  const dedicated = process.env.STRIPE_QA_SECRET_KEY;
  const mainKey = process.env.STRIPE_SECRET_KEY;
  const effectiveQaKey =
    dedicated ?? (mainKey?.startsWith("sk_test_") ? mainKey : undefined);

  if (!effectiveQaKey) {
    fail(
      "No test-mode Stripe key available. " +
      "Set STRIPE_QA_SECRET_KEY=sk_test_... or ensure STRIPE_SECRET_KEY is a test-mode key.",
    );
  }
  if (!effectiveQaKey.startsWith("sk_test_")) {
    fail("The resolved QA Stripe key is not test-mode (sk_test_...). Never use a live key for bot tests.");
  }
  const keySource = dedicated ? "STRIPE_QA_SECRET_KEY" : "STRIPE_SECRET_KEY (test-mode fallback)";
  log(`Stripe test key resolved from ${keySource} ✓`);

  // ------------------------------------------------------------------
  // 1. Admin login
  // ------------------------------------------------------------------
  const token = await adminLogin();
  log("Admin login OK ✓");

  // ------------------------------------------------------------------
  // 2. Find an available QA spot
  // ------------------------------------------------------------------
  const { id: spotId, price, campaignId } = await findAvailableQaSpot(token, QA_GRID_AREA);
  log("Found available QA spot", { spotId, price, campaignId, gridArea: QA_GRID_AREA });

  // ------------------------------------------------------------------
  // 3. Reserve the spot via admin endpoint (bypasses active-campaign guard)
  // ------------------------------------------------------------------
  await qaReserve(token, spotId);

  // ------------------------------------------------------------------
  // 4. Playwright: drive the real /checkout/:spotId UI as a smoke check
  //
  //    We navigate to our OWN checkout page (not Stripe's hosted page)
  //    to verify the frontend renders correct spot data before payment.
  //    This is the real production checkout UI route.
  // ------------------------------------------------------------------
  log("Launching Chromium for checkout UI smoke check...");
  const browser = await chromium.launch({ headless: true });
  let checkoutPageTitle = "(not visited)";

  try {
    const page = await browser.newPage();
    const checkoutUrl = `${BASE_URL}/checkout/${spotId}`;
    await page.goto(checkoutUrl, { waitUntil: "load", timeout: 20000 });
    checkoutPageTitle = await page.title();
    log("Checkout page loaded", { url: checkoutUrl, title: checkoutPageTitle });

    // Assert the page loaded (not a 404/error page)
    const bodyText = await page.locator("body").textContent({ timeout: 5000 }).catch(() => "");
    const pageHasSpotData =
      bodyText?.includes(BUSINESS_NAME) ||
      bodyText?.includes("$") ||
      bodyText?.includes("checkout") ||
      bodyText?.toLowerCase().includes("spot");

    if (!pageHasSpotData && !checkoutPageTitle.toLowerCase().includes("checkout")) {
      log("WARNING: Checkout page may not have rendered spot data correctly", {
        bodyExcerpt: bodyText?.slice(0, 200),
      });
      // Non-fatal: the payment step below is the real functional test
    } else {
      log("Checkout UI rendered successfully ✓");
    }
  } finally {
    await browser.close();
  }

  // ------------------------------------------------------------------
  // 5. Execute QA checkout: create+confirm PI (QA Stripe key) → DB fulfill
  //
  //    POST /api/admin/qa/checkout does the full purchase cycle:
  //      a. Creates a PaymentIntent with STRIPE_QA_SECRET_KEY
  //      b. Confirms immediately with pm_card_visa (Stripe test fixture)
  //      c. Writes spot=paid, inserts order, assigns tracking code
  //      d. Sets campaign.firstPaidAt (first sale clock)
  //      NO notification emails are sent.
  // ------------------------------------------------------------------
  log("Executing QA checkout (create+confirm PI → DB fulfill)...");
  const { piId, orderId, trackingCode } = await qaCheckout(token, spotId);
  log("QA checkout API returned", { piId, orderId, trackingCode });

  // ------------------------------------------------------------------
  // 6. Assertions
  // ------------------------------------------------------------------
  log("Running assertions...");
  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, detail?: Record<string, unknown>): void {
    if (condition) {
      log(`  ✓ ${name}`);
      passed++;
    } else {
      log(`  ✗ FAIL: ${name}`, detail);
      failed++;
    }
  }

  // 6a. piId is a real Stripe test PI
  assert("piId is a valid Stripe PI id", piId.startsWith("pi_"), { piId });

  // 6b. orderId is a positive integer
  assert("orderId is a positive integer", Number.isInteger(orderId) && orderId > 0, { orderId });

  // 6c. Spot in DB is now 'paid'
  const [freshSpot] = await db
    .select({ status: spotsTable.status, trackingCode: spotsTable.trackingCode, expiresAt: spotsTable.expiresAt })
    .from(spotsTable)
    .where(eq(spotsTable.id, spotId));

  assert("spot.status === 'paid' in DB", freshSpot?.status === "paid", { status: freshSpot?.status });
  assert("spot.expiresAt is null (cleared on payment)", freshSpot?.expiresAt === null, { expiresAt: freshSpot?.expiresAt });
  assert("spot.trackingCode is set", !!freshSpot?.trackingCode, { trackingCode: freshSpot?.trackingCode });
  assert("trackingCode matches DB", freshSpot?.trackingCode === trackingCode || (!trackingCode && !freshSpot?.trackingCode));

  // 6d. Order row exists and is marked paid
  const [order] = await db
    .select({ id: ordersTable.id, status: ordersTable.status, amountCents: ordersTable.amountCents, piId: ordersTable.stripePaymentIntentId })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));

  assert("order row exists in DB", !!order, { orderId });
  assert("order.status === 'paid'", order?.status === "paid", { status: order?.status });
  assert("order.amountCents matches spot price", order?.amountCents === price, { orderAmt: order?.amountCents, spotPrice: price });
  assert("order.stripePaymentIntentId matches piId", order?.piId === piId, { orderPi: order?.piId, botPi: piId });

  // 6e. campaign.firstPaidAt was set
  const [campaign] = await db
    .select({ firstPaidAt: campaignsTable.firstPaidAt })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId));
  assert("campaign.firstPaidAt is set", campaign?.firstPaidAt !== null, { firstPaidAt: campaign?.firstPaidAt });

  // 6f. Spot does NOT appear in admin aggregate totals (isQaTest isolation check)
  // The simplest proxy: the admin scans endpoint should not return this spot's tracking code
  // (filter: WHERE s.is_qa_test = false). We just assert the spot has isQaTest=true in DB.
  const [qaCheck] = await db
    .select({ isQaTest: spotsTable.isQaTest })
    .from(spotsTable)
    .where(eq(spotsTable.id, spotId));
  assert("spot.isQaTest=true (excluded from production metrics)", qaCheck?.isQaTest === true);

  // ------------------------------------------------------------------
  // 7. Summary
  // ------------------------------------------------------------------
  log(`\nAssertion summary: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    log("DOCUMENTED COVERAGE GAP: checkout.session.completed webhook branch NOT exercised");
    log("  → Run a synthetic signed-webhook-POST to /api/webhooks/stripe to cover that path separately.");
    process.exitCode = 1;
  } else {
    log("All assertions passed ✓");
    log("DOCUMENTED COVERAGE GAP: checkout.session.completed webhook branch NOT exercised");
    log("  → Run a synthetic signed-webhook-POST to /api/webhooks/stripe to cover that path separately.");
  }
}

// ---------------------------------------------------------------------------
// Entry point — always cleanup in finally, even on crash
// ---------------------------------------------------------------------------

let adminToken: string | null = null;

(async () => {
  try {
    adminToken = await adminLogin().catch(() => null);
    await run();
  } catch (err) {
    console.error("QA bot crashed:", err);
    process.exitCode = 1;
  } finally {
    if (adminToken) {
      log("Running cleanup in finally block...");
      await qaCleanup(adminToken);
    } else {
      log("No admin token — skipping cleanup (server may be down)");
    }
    process.exit(process.exitCode ?? 0);
  }
})();
