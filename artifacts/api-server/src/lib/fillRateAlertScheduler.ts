import { sql, eq } from "drizzle-orm";
import { db, campaignsTable } from "@workspace/db";
import { logger } from "./logger";
import {
  sendCampaignFillAlert30,
  sendCampaignFillAlert40,
  sendCampaignFillAlert45,
  sendDealerFillRateReminder,
} from "./emails";

const APP_URL =
  process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
  (process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}`
    : process.env.APP_URL || "https://mytownpostcard.com");

interface UnderfilledCampaign extends Record<string, unknown> {
  id: number;
  name: string;
  territory: string;
  dealer_id: number | null;
  dealer_name: string | null;
  dealer_email: string | null;
  first_paid_at: Date | string;
  paid_spot_count: number;
  admin_alert_30_sent_at: Date | string | null;
  admin_alert_40_sent_at: Date | string | null;
  admin_alert_45_sent_at: Date | string | null;
  dealer_reminder_30_sent_at: Date | string | null;
}

function daysElapsed(from: Date | string): number {
  const t = from instanceof Date ? from.getTime() : new Date(from).getTime();
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
}

async function checkFillRates(): Promise<void> {
  const { rows } = await db.execute<UnderfilledCampaign>(sql`
    SELECT
      c.id, c.name, c.territory, c.dealer_id,
      c.first_paid_at,
      c.admin_alert_30_sent_at,
      c.admin_alert_40_sent_at,
      c.admin_alert_45_sent_at,
      c.dealer_reminder_30_sent_at,
      d.name  AS dealer_name,
      d.email AS dealer_email,
      COALESCE(paid.cnt, 0)::int AS paid_spot_count
    FROM campaigns c
    LEFT JOIN dealers d ON d.id = c.dealer_id
    LEFT JOIN (
      SELECT s.campaign_id, COUNT(*) AS cnt
      FROM spots s
      JOIN orders o ON o.spot_id = s.id AND o.status = 'paid'
      GROUP BY s.campaign_id
    ) paid ON paid.campaign_id = c.id
    WHERE c.first_paid_at IS NOT NULL
      AND c.status != 'completed'
      AND c.is_qa_test = false
      AND COALESCE(paid.cnt, 0) < 12
  `);

  if (rows.length === 0) return;

  for (const row of rows) {
    const days = daysElapsed(row.first_paid_at);
    const paidCount = row.paid_spot_count;
    const campaignLink = `${APP_URL}/admin`;

    const campaignInfo = {
      campaignId: row.id,
      campaignName: row.name,
      territoryName: row.territory,
      dealerName: row.dealer_name ?? null,
      dealerEmail: row.dealer_email ?? null,
      paidSpots: paidCount,
      daysElapsed: days,
      campaignLink,
    };

    // ── Admin alerts (each tier fires exactly once, most urgent first) ──────
    if (days >= 45 && !row.admin_alert_45_sent_at) {
      try {
        await sendCampaignFillAlert45(campaignInfo);
        await db.update(campaignsTable)
          .set({ adminAlert45SentAt: new Date() })
          .where(eq(campaignsTable.id, row.id));
        logger.info({ campaignId: row.id, days, paidCount }, "Fill-rate 45-day admin alert sent");
      } catch (err) {
        logger.error({ err, campaignId: row.id }, "Failed to send 45-day admin alert");
      }
    } else if (days >= 40 && !row.admin_alert_40_sent_at) {
      try {
        await sendCampaignFillAlert40(campaignInfo);
        await db.update(campaignsTable)
          .set({ adminAlert40SentAt: new Date() })
          .where(eq(campaignsTable.id, row.id));
        logger.info({ campaignId: row.id, days, paidCount }, "Fill-rate 40-day admin alert sent");
      } catch (err) {
        logger.error({ err, campaignId: row.id }, "Failed to send 40-day admin alert");
      }
    } else if (days >= 30 && !row.admin_alert_30_sent_at) {
      try {
        await sendCampaignFillAlert30(campaignInfo);
        await db.update(campaignsTable)
          .set({ adminAlert30SentAt: new Date() })
          .where(eq(campaignsTable.id, row.id));
        logger.info({ campaignId: row.id, days, paidCount }, "Fill-rate 30-day admin alert sent");
      } catch (err) {
        logger.error({ err, campaignId: row.id }, "Failed to send 30-day admin alert");
      }
    }

    // ── Dealer 30-day coaching reminder (fires once at >= 30 days) ──────────
    if (days >= 30 && !row.dealer_reminder_30_sent_at && row.dealer_email) {
      try {
        await sendDealerFillRateReminder({
          dealerName: row.dealer_name ?? "Dealer",
          dealerEmail: row.dealer_email,
          campaignName: row.name,
          paidSpots: paidCount,
          portalLink: `${APP_URL}/dealer/dashboard`,
        });
        await db.update(campaignsTable)
          .set({ dealerReminder30SentAt: new Date() })
          .where(eq(campaignsTable.id, row.id));
        logger.info({ campaignId: row.id, days, paidCount }, "Fill-rate 30-day dealer reminder sent");
      } catch (err) {
        logger.error({ err, campaignId: row.id }, "Failed to send 30-day dealer reminder");
      }
    }
  }

  logger.info({ count: rows.length }, "Fill-rate check complete");
}

/**
 * Starts the fill-rate alert scheduler. Runs an immediate check on boot
 * then repeats every intervalMs. Timer is unref()'d so it never blocks exit.
 */
export function startFillRateAlertScheduler(intervalMs: number): () => void {
  const tick = async () => {
    try {
      await checkFillRates();
    } catch (err) {
      logger.error({ err }, "Fill-rate alert scheduler tick failed");
    }
  };

  void tick();
  const handle = setInterval(tick, intervalMs);
  handle.unref();

  logger.info({ intervalMs }, "Fill-rate alert scheduler started");
  return () => clearInterval(handle);
}
