import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  spotsTable,
  ordersTable,
  qrScansTable,
  spotSubscriptionsTable,
  subscriptionIssueAssignmentsTable,
} from "@workspace/db";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

const JWT_SECRET = process.env.SESSION_SECRET || "localspot-secret";

function requireAdmin(req: any, res: any, next: any): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

/**
 * GET /api/admin/cleanup/backup-paid-spots
 *
 * Returns a full JSON snapshot of every row that the reset endpoint would
 * touch: paid spots, their orders, QR scans, subscriptions, and issue
 * assignments. Save this response before calling the reset endpoint.
 */
router.get(
  "/admin/cleanup/backup-paid-spots",
  requireAdmin,
  async (_req, res): Promise<void> => {
    const paidSpots = await db
      .select()
      .from(spotsTable)
      .where(eq(spotsTable.status, "paid"));

    if (paidSpots.length === 0) {
      res.json({ message: "No paid spots found.", snapshot: {} });
      return;
    }

    const paidSpotIds = paidSpots.map((s) => s.id);

    const [orders, qrScans, subscriptions, issueAssignments] =
      await Promise.all([
        db
          .select()
          .from(ordersTable)
          .where(inArray(ordersTable.spotId, paidSpotIds)),
        db
          .select()
          .from(qrScansTable)
          .where(inArray(qrScansTable.spotId, paidSpotIds)),
        db
          .select()
          .from(spotSubscriptionsTable)
          .where(inArray(spotSubscriptionsTable.initialSpotId, paidSpotIds)),
        db
          .select()
          .from(subscriptionIssueAssignmentsTable)
          .where(
            inArray(
              subscriptionIssueAssignmentsTable.subscriptionId,
              db
                .select({ id: spotSubscriptionsTable.id })
                .from(spotSubscriptionsTable)
                .where(
                  inArray(spotSubscriptionsTable.initialSpotId, paidSpotIds),
                ),
            ),
          ),
      ]);

    res.json({
      snapshotAt: new Date().toISOString(),
      counts: {
        spots: paidSpots.length,
        orders: orders.length,
        qrScans: qrScans.length,
        spotSubscriptions: subscriptions.length,
        subscriptionIssueAssignments: issueAssignments.length,
      },
      snapshot: {
        spots: paidSpots,
        orders,
        qrScans,
        spotSubscriptions: subscriptions,
        subscriptionIssueAssignments: issueAssignments,
      },
    });
  },
);

const CONFIRM_CODE = "CLEAR_ALL_PAID_SPOTS";

/**
 * POST /api/admin/cleanup/reset-paid-spots
 *
 * Resets every paid spot to available and purges all associated orders,
 * QR scans, subscriptions, and issue assignments. Requires admin JWT and
 * the confirmation code in the request body.
 *
 * Body: { "confirm": "CLEAR_ALL_PAID_SPOTS" }
 */
router.post(
  "/admin/cleanup/reset-paid-spots",
  requireAdmin,
  async (req, res): Promise<void> => {
    if (req.body?.confirm !== CONFIRM_CODE) {
      res.status(400).json({
        error: `Missing or wrong confirmation code. Send { "confirm": "${CONFIRM_CODE}" }`,
      });
      return;
    }

    req.log?.info("admin cleanup: reset-paid-spots started");

    const paidSpots = await db
      .select({ id: spotsTable.id, gridArea: spotsTable.gridArea, campaignId: spotsTable.campaignId })
      .from(spotsTable)
      .where(eq(spotsTable.status, "paid"));

    if (paidSpots.length === 0) {
      res.json({ message: "No paid spots found — nothing to do.", deleted: {}, spotsReset: 0 });
      return;
    }

    const paidSpotIds = paidSpots.map((s) => s.id);

    const deletedSubscriptionAssignments = await db
      .delete(subscriptionIssueAssignmentsTable)
      .where(
        inArray(
          subscriptionIssueAssignmentsTable.subscriptionId,
          db
            .select({ id: spotSubscriptionsTable.id })
            .from(spotSubscriptionsTable)
            .where(inArray(spotSubscriptionsTable.initialSpotId, paidSpotIds)),
        ),
      )
      .returning({ id: subscriptionIssueAssignmentsTable.id });

    const deletedSubscriptions = await db
      .delete(spotSubscriptionsTable)
      .where(inArray(spotSubscriptionsTable.initialSpotId, paidSpotIds))
      .returning({ id: spotSubscriptionsTable.id });

    const deletedScans = await db
      .delete(qrScansTable)
      .where(inArray(qrScansTable.spotId, paidSpotIds))
      .returning({ id: qrScansTable.id });

    const deletedOrders = await db
      .delete(ordersTable)
      .where(inArray(ordersTable.spotId, paidSpotIds))
      .returning({ id: ordersTable.id });

    const updatedSpots = await db
      .update(spotsTable)
      .set({
        status: "available",
        businessName: null,
        businessCategory: null,
        contactEmail: null,
        contactPhone: null,
        website: null,
        adFileUrl: null,
        adStatus: null,
        trackingCode: null,
        templateData: null,
        expiresAt: null,
      })
      .where(inArray(spotsTable.id, paidSpotIds))
      .returning({ id: spotsTable.id, gridArea: spotsTable.gridArea, campaignId: spotsTable.campaignId });

    const report = {
      message: "Reset complete.",
      deleted: {
        subscriptionIssueAssignments: deletedSubscriptionAssignments.length,
        spotSubscriptions: deletedSubscriptions.length,
        qrScans: deletedScans.length,
        orders: deletedOrders.length,
      },
      spotsReset: updatedSpots.length,
      spotDetail: updatedSpots,
    };

    req.log?.info({ report }, "admin cleanup: reset-paid-spots complete");
    res.json(report);
  },
);

export default router;
