import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, spotsTable, qrScansTable } from "@workspace/db";

const router: IRouter = Router();

/**
 * Public QR-code redirect: scanning a printed code hits /go/:code, we log the
 * scan and 302 to the business's website (or to "/" if none was provided).
 *
 * Mounted at the app root (NOT under /api) so the printed URL stays short:
 *   https://mytownpostcard.com/go/romas-pizza-spring2026
 *
 * On unknown codes we return 404 — printed cards don't get reissued, but
 * mistakes happen and silent redirects to the homepage would mask bugs.
 */
router.get("/go/:code", async (req, res): Promise<void> => {
  const rawCode = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const code = String(rawCode ?? "").trim();
  if (!code) {
    res.status(404).send("Not found");
    return;
  }

  const [spot] = await db
    .select()
    .from(spotsTable)
    .where(eq(spotsTable.trackingCode, code))
    .limit(1);

  if (!spot) {
    req.log.info({ code }, "QR redirect: unknown tracking code");
    res.status(404).send("Not found");
    return;
  }

  // Fire-and-forget the scan insert. We don't want a transient DB hiccup to
  // block the redirect and break the user's QR experience — log and move on.
  const userAgentHeader = req.headers["user-agent"];
  const userAgent =
    typeof userAgentHeader === "string" ? userAgentHeader.slice(0, 1024) : null;
  const ipAddress = (req.ip ?? "").slice(0, 64) || null;

  db.insert(qrScansTable)
    .values({
      spotId: spot.id,
      campaignId: spot.campaignId,
      userAgent,
      ipAddress,
      city: null,
    })
    .then(() => {
      req.log.info(
        { spotId: spot.id, code, ipAddress },
        "QR scan recorded",
      );
    })
    .catch((err) => {
      req.log.error(
        { err, spotId: spot.id, code },
        "Failed to record QR scan — redirecting anyway",
      );
    });

  const target = normalizeWebsite(spot.website) || "/";
  res.redirect(302, target);
});

function normalizeWebsite(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export default router;
