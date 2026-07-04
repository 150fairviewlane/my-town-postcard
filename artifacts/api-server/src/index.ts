import app from "./app";
import { logger } from "./lib/logger";
import { startExpirationSweeper } from "./lib/expirationCleanup";
import { startRenewalScheduler } from "./lib/renewalScheduler";
import { startWelcomeReminderScheduler } from "./lib/welcomeReminderScheduler";
import { startFillRateAlertScheduler } from "./lib/fillRateAlertScheduler";
import { startMilestoneEmailScheduler } from "./lib/milestoneEmailScheduler";
import { repairOverclaimedCounties } from "./lib/territoryDataRepair";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Audit log of every AI model name in use — bump these any time a model is changed,
  // so every restart makes the current names visible and stale names are caught early.
  logger.info({
    xaiImageEdits:       "grok-imagine-image-quality",   // adGenGrok.ts — customer ad generator
    xaiImageOutreach:    "grok-imagine-image (quality=false default) | grok-imagine-image-quality (quality=true)", // generateAdForOutreach.ts
    xaiVisionFilter:     "grok-4.3",                      // logoFilter.ts — logo quality/usability check
  }, "AI models in use");

  // One-time idempotent data repair: remove spurious county claims caused by
  // the border-bleed bug fixed in Task #211 (getCountyTerritoryHubs). Safe on
  // every boot — the WHERE clause is a no-op once the row is already fixed.
  void repairOverclaimedCounties();

  // Sweep lapsed reservations every 5 minutes. The interval is unref()'d
  // and the immediate first tick runs in the background — no app.listen
  // ordering concern, just a fire-and-forget background worker.
  startExpirationSweeper(5 * 60 * 1000);

  // Renewal email scheduler — scans spot_subscriptions every hour for
  // accounts hitting the T-30, T-7, and post-end milestones and fires the
  // appropriate Resend email. Idempotent: each milestone has its own
  // _at column and we only mark it after a successful send.
  startRenewalScheduler(60 * 60 * 1000);

  // Welcome reminder scheduler — runs every hour. Finds active dealers who
  // have not set a password within 48 hours of activation and resends the
  // set-password email exactly once (idempotent via welcomeReminderSentAt).
  startWelcomeReminderScheduler(60 * 60 * 1000);

  // Fill-rate alert scheduler — runs every 24 hours. Checks campaigns that
  // have had at least one paid spot (firstPaidAt IS NOT NULL) and are still
  // below 12 spots sold. Sends escalating admin emails at 30/40/45 days, and
  // a single coaching reminder email to the dealer at the 30-day mark.
  startFillRateAlertScheduler(24 * 60 * 60 * 1000);

  // Milestone email scheduler — runs every hour. Fires a recurring daily admin
  // alert when a campaign crosses 12 spots (print-ready) or 15 spots (sold out).
  // Each milestone re-fires once per UTC calendar day until the campaign is
  // marked completed (which excludes it from the query automatically).
  startMilestoneEmailScheduler(60 * 60 * 1000);
});
