import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, scrapedBusinessesTable, businessClaimEventsTable } from "@workspace/db";

const router: IRouter = Router();

const APP_URL = (process.env.APP_URL || "https://mytownpostcard.com").replace(/\/$/, "");

/**
 * Cold-email engagement tracker: clicking "See Available Spots" in an outreach
 * email hits /claim/:businessId before being redirected to the spot picker.
 *
 * Each row in business_claim_events is tied to a specific scraped business so
 * you can query "which businesses engaged" (not just a raw hit counter).
 *
 * Mounted at the app root (no /api prefix) so the URL in the email stays clean.
 */
router.get("/claim/:businessId", async (req, res): Promise<void> => {
  const raw = req.params.businessId;
  const businessId = parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(businessId) || businessId <= 0) {
    res.status(404).send("Not found");
    return;
  }

  const [biz] = await db
    .select({ id: scrapedBusinessesTable.id })
    .from(scrapedBusinessesTable)
    .where(eq(scrapedBusinessesTable.id, businessId))
    .limit(1);

  if (!biz) {
    req.log.info({ businessId }, "claim: unknown business ID");
    res.status(404).send("Not found");
    return;
  }

  const userAgentHeader = req.headers["user-agent"];
  const referrerHeader  = req.headers["referer"] ?? req.headers["referrer"];
  const ipAddress = (req.ip ?? "").slice(0, 64) || null;
  const userAgent = typeof userAgentHeader === "string" ? userAgentHeader.slice(0, 1024) : null;
  const referrer  = typeof referrerHeader  === "string" ? referrerHeader.slice(0, 1024)  : null;

  db.insert(businessClaimEventsTable)
    .values({ businessId, ipAddress, userAgent, referrer })
    .then(() => {
      req.log.info({ businessId, ipAddress }, "claim: engagement recorded");
    })
    .catch((err) => {
      req.log.error({ err, businessId }, "claim: failed to record engagement — redirecting anyway");
    });

  const target = `${APP_URL}/?utm_source=claim&utm_medium=email&utm_campaign=outreach&biz=${businessId}`;
  res.redirect(302, target);
});

export default router;
