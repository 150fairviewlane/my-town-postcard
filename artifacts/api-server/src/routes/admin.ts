import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, campaignsTable, spotsTable, ordersTable } from "@workspace/db";
import {
  AdminLoginBody,
  AdminLoginResponse,
  GetAdminCampaignResponse,
  ApproveAdParams,
  ApproveAdResponse,
} from "@workspace/api-zod";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "localspot-admin-2025";
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
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

router.post("/admin/login", async (req, res): Promise<void> => {
  const body = AdminLoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  if (body.data.password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: "24h" });
  req.log.info("Admin logged in");
  res.json(AdminLoginResponse.parse({ token }));
});

router.get("/admin/campaign", requireAdmin, async (req, res): Promise<void> => {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.status, "active"))
    .limit(1);

  if (!campaign) {
    res.status(404).json({ error: "No active campaign" });
    return;
  }

  const spots = await db
    .select()
    .from(spotsTable)
    .where(eq(spotsTable.campaignId, campaign.id));

  const orders = await db.select().from(ordersTable);
  const paidOrdersBySpot = new Map(orders.map(o => [o.spotId, o]));

  const serializeDate = (d: Date | string | null | undefined) =>
    d instanceof Date ? d.toISOString() : (d ?? null);

  const enrichedSpots = spots.map(spot => {
    const order = paidOrdersBySpot.get(spot.id);
    return {
      ...spot,
      createdAt: serializeDate(spot.createdAt),
      isPaid: spot.status === "paid",
      stripePaymentIntentId: order?.stripePaymentIntentId ?? null,
    };
  });

  const paidSpots = enrichedSpots.filter(s => s.isPaid);
  const totalRevenue = paidSpots.reduce((sum, s) => sum + s.price, 0);

  res.json(GetAdminCampaignResponse.parse({
    campaign: { ...campaign, createdAt: serializeDate(campaign.createdAt) },
    spots: enrichedSpots,
    totalRevenue,
    totalSpots: spots.length,
    paidSpots: paidSpots.length,
  }));
});

router.post("/admin/spots/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ApproveAdParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [spot] = await db
    .select()
    .from(spotsTable)
    .where(eq(spotsTable.id, params.data.id));

  if (!spot) {
    res.status(404).json({ error: "Spot not found" });
    return;
  }

  const [updated] = await db
    .update(spotsTable)
    .set({ adStatus: "approved" })
    .where(eq(spotsTable.id, params.data.id))
    .returning();

  const ser = (u: typeof updated) => ({ ...u, createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt });

  req.log.info({ spotId: params.data.id }, "Ad approved");
  res.json(ApproveAdResponse.parse(ser(updated)));
});

export default router;
