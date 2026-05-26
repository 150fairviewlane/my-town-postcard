import {
  findRenewalCandidates,
  markRenewalEmailSent,
} from "./subscriptions";
import {
  sendRenewalT30Email,
  sendRenewalT7Email,
  sendRenewalPostEmail,
} from "./emails";
import { logger } from "./logger";

/**
 * Periodic sweeper that scans spot_subscriptions for accounts hitting the
 * 30-day, 7-day, and post-end milestones and fires the matching renewal
 * email. Atomic per-row: we only mark the *_at column after the send
 * promise resolves, so a transient Resend outage doesn't burn the slot.
 *
 * Runs every hour in production. Cheap query (three index-friendly
 * SELECTs), so this is safe to keep on a fixed cadence.
 */
async function tick(): Promise<void> {
  try {
    const { t30, t7, post } = await findRenewalCandidates();
    if (t30.length === 0 && t7.length === 0 && post.length === 0) return;

    logger.info(
      { t30: t30.length, t7: t7.length, post: post.length },
      "Renewal sweeper found candidates",
    );

    for (const c of t30) {
      try {
        await sendRenewalT30Email({
          businessName: c.businessName,
          contactEmail: c.contactEmail,
          commitmentEndDate: c.commitmentEndDate,
        });
        await markRenewalEmailSent(c.id, "renewalEmailT30At");
      } catch (err) {
        logger.error({ err, subscriptionId: c.id }, "T-30 renewal send failed");
      }
    }
    for (const c of t7) {
      try {
        await sendRenewalT7Email({
          businessName: c.businessName,
          contactEmail: c.contactEmail,
          commitmentEndDate: c.commitmentEndDate,
        });
        await markRenewalEmailSent(c.id, "renewalEmailT7At");
      } catch (err) {
        logger.error({ err, subscriptionId: c.id }, "T-7 renewal send failed");
      }
    }
    for (const c of post) {
      try {
        await sendRenewalPostEmail({
          businessName: c.businessName,
          contactEmail: c.contactEmail,
          commitmentEndDate: c.commitmentEndDate,
        });
        await markRenewalEmailSent(c.id, "renewalEmailPostAt");
      } catch (err) {
        logger.error({ err, subscriptionId: c.id }, "Post-end renewal send failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "Renewal scheduler tick failed");
  }
}

export function startRenewalScheduler(intervalMs: number): () => void {
  void tick();
  const handle = setInterval(tick, intervalMs);
  handle.unref();
  logger.info({ intervalMs }, "Renewal scheduler started");
  return () => clearInterval(handle);
}
