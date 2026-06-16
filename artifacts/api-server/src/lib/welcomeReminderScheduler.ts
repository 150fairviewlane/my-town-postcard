import { and, eq, isNull, lt } from "drizzle-orm";
import {
  db,
  dealersTable,
  dealerPasswordResetsTable,
  dealerTerritoriesTable,
} from "@workspace/db";
import { logger } from "./logger";
import { generateResetToken, hashResetToken } from "./dealerAuth";
import { sendDealerWelcomeEmail } from "./emails";

function getAppUrl(): string {
  const pub = process.env["PUBLIC_APP_URL"];
  if (pub) return pub;
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) {
    const first = domains.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }
  return "http://localhost:3000";
}

async function tick(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const candidates = await db
      .select({
        id: dealersTable.id,
        name: dealersTable.name,
        email: dealersTable.email,
      })
      .from(dealersTable)
      .where(
        and(
          eq(dealersTable.status, "active"),
          isNull(dealersTable.passwordHash),
          lt(dealersTable.activatedAt, cutoff),
          isNull(dealersTable.welcomeReminderSentAt),
        ),
      );

    if (candidates.length === 0) return;

    logger.info(
      { count: candidates.length },
      "Welcome reminder: dealers without password after 48h",
    );

    const appUrl = getAppUrl();

    for (const dealer of candidates) {
      try {
        const rawToken = generateResetToken();
        const tokenHash = hashResetToken(rawToken);

        await db.insert(dealerPasswordResetsTable).values({
          dealerId: dealer.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        });

        const [territory] = await db
          .select({ cityLabel: dealerTerritoriesTable.cityLabel })
          .from(dealerTerritoriesTable)
          .where(eq(dealerTerritoriesTable.dealerId, dealer.id));

        await sendDealerWelcomeEmail({
          dealerName: dealer.name,
          dealerEmail: dealer.email,
          territoryName: territory?.cityLabel ?? null,
          setPasswordLink: `${appUrl}/dealer/reset-password?token=${rawToken}`,
          loginLink: `${appUrl}/dealer/login`,
        });

        await db
          .update(dealersTable)
          .set({ welcomeReminderSentAt: new Date() })
          .where(eq(dealersTable.id, dealer.id));

        logger.info({ dealerId: dealer.id }, "Welcome reminder sent successfully");
      } catch (err: unknown) {
        logger.error(
          { err: err instanceof Error ? err.message : err, dealerId: dealer.id },
          "Welcome reminder send failed — will retry next tick",
        );
      }
    }
  } catch (err) {
    logger.error({ err }, "Welcome reminder scheduler tick failed");
  }
}

/**
 * Starts a background scheduler that runs every `intervalMs`. On each tick it
 * finds active dealers who:
 *   - have never set a password (passwordHash IS NULL)
 *   - were activated more than 48 hours ago
 *   - have not yet received a reminder (welcomeReminderSentAt IS NULL)
 *
 * For each such dealer a new 72-hour set-password token is generated,
 * inserted into dealer_password_resets, and the welcome email is resent.
 * After a successful send, welcomeReminderSentAt is stamped on the dealer
 * row so the reminder fires exactly once.
 */
export function startWelcomeReminderScheduler(intervalMs: number): () => void {
  void tick();
  const handle = setInterval(tick, intervalMs);
  handle.unref();
  logger.info({ intervalMs }, "Welcome reminder scheduler started");
  return () => clearInterval(handle);
}
