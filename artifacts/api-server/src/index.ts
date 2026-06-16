import app from "./app";
import { logger } from "./lib/logger";
import { startExpirationSweeper } from "./lib/expirationCleanup";
import { startRenewalScheduler } from "./lib/renewalScheduler";
import { startWelcomeReminderScheduler } from "./lib/welcomeReminderScheduler";
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
});
