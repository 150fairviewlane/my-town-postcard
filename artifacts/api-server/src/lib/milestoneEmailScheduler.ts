import { sql, eq } from "drizzle-orm";
import { db, campaignsTable } from "@workspace/db";
import { logger } from "./logger";
import { sendCampaignPrintReadyEmail, sendCampaignSoldOutEmail } from "./emails";

const APP_URL =
  process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
  (process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}`
    : process.env.APP_URL || "https://mytownpostcard.com");

interface MilestoneCampaignRow extends Record<string, unknown> {
  id: number;
  name: string;
  territory: string;
  dealer_id: number | null;
  dealer_name: string | null;
  paid_spot_count: number;
  last_milestone_12_email_sent_at: Date | string | null;
  last_milestone_15_email_sent_at: Date | string | null;
}

/** Returns true if the timestamp falls on today's UTC calendar date. */
function sentTodayUtc(ts: Date | string | null): boolean {
  if (!ts) return false;
  const d = ts instanceof Date ? ts : new Date(ts);
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

async function checkMilestones(): Promise<void> {
  // Only campaigns with 12+ paid spots still need milestone processing.
  // Completed campaigns are excluded — completing them is the admin's signal
  // that they've been handled, and the daily nag should stop naturally.
  const { rows } = await db.execute<MilestoneCampaignRow>(sql`
    SELECT
      c.id,
      c.name,
      c.territory,
      c.dealer_id,
      c.last_milestone_12_email_sent_at,
      c.last_milestone_15_email_sent_at,
      d.name AS dealer_name,
      COALESCE(paid.cnt, 0)::int AS paid_spot_count
    FROM campaigns c
    LEFT JOIN dealers d ON d.id = c.dealer_id
    LEFT JOIN (
      SELECT s.campaign_id, COUNT(*) AS cnt
      FROM spots s
      WHERE s.status = 'paid'
      GROUP BY s.campaign_id
    ) paid ON paid.campaign_id = c.id
    WHERE c.status IN ('active', 'draft')
      AND COALESCE(paid.cnt, 0) >= 12
  `);

  if (rows.length === 0) return;

  for (const row of rows) {
    const paidCount = row.paid_spot_count;
    const campaignLink = `${APP_URL}/admin`;

    const info = {
      campaignId: row.id,
      campaignName: row.name,
      territoryName: row.territory,
      dealerName: row.dealer_name ?? null,
      paidSpots: paidCount,
      campaignLink,
    };

    if (paidCount >= 15) {
      // ── 15-spot milestone: sold out ─────────────────────────────────────────
      // The 15-spot email supersedes the 12-spot email. Once fully sold out,
      // we only send the sold-out nag and skip the print-ready one entirely.
      if (!sentTodayUtc(row.last_milestone_15_email_sent_at)) {
        try {
          await sendCampaignSoldOutEmail(info);
          await db
            .update(campaignsTable)
            .set({ lastMilestone15EmailSentAt: new Date() })
            .where(eq(campaignsTable.id, row.id));
          logger.info({ campaignId: row.id, paidCount }, "Sold-out milestone email sent");
        } catch (err) {
          logger.error({ err, campaignId: row.id }, "Failed to send sold-out milestone email");
        }
      }
    } else {
      // ── 12-spot milestone: print-ready ──────────────────────────────────────
      // Only fires when paidCount is 12–14 (the 15-spot branch handles full).
      if (!sentTodayUtc(row.last_milestone_12_email_sent_at)) {
        try {
          await sendCampaignPrintReadyEmail(info);
          await db
            .update(campaignsTable)
            .set({ lastMilestone12EmailSentAt: new Date() })
            .where(eq(campaignsTable.id, row.id));
          logger.info({ campaignId: row.id, paidCount }, "Print-ready milestone email sent");
        } catch (err) {
          logger.error({ err, campaignId: row.id }, "Failed to send print-ready milestone email");
        }
      }
    }
  }

  logger.info({ count: rows.length }, "Milestone email check complete");
}

/**
 * Starts the milestone email scheduler. Runs an immediate check on boot then
 * repeats every intervalMs (recommended: 1 hour). Timer is unref()'d so it
 * never blocks process exit.
 */
export function startMilestoneEmailScheduler(intervalMs: number): () => void {
  const tick = async () => {
    try {
      await checkMilestones();
    } catch (err) {
      logger.error({ err }, "Milestone email scheduler tick failed");
    }
  };

  void tick();
  const handle = setInterval(tick, intervalMs);
  handle.unref();

  logger.info({ intervalMs }, "Milestone email scheduler started");
  return () => clearInterval(handle);
}
