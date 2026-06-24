import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
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
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// GET /api/admin/paid-customers
// Returns every paid spot across all campaigns, joined with campaign + dealer.
// Spots on campaigns with no dealer carry dealerName="House / No Dealer".
// Sorted newest-first by order.created_at (purchase date).
router.get("/admin/paid-customers", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.execute<{
    spot_id: number;
    business_name: string | null;
    business_category: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    size: string;
    price: number;
    tracking_code: string | null;
    campaign_id: number;
    campaign_name: string;
    dealer_id: number | null;
    dealer_name: string;
    dealer_email: string | null;
    purchased_at: Date | string | null;
  }>(sql`
    SELECT
      s.id                                            AS spot_id,
      s.business_name,
      s.business_category,
      s.contact_email,
      s.contact_phone,
      s.size,
      s.price,
      s.tracking_code,
      c.id                                            AS campaign_id,
      c.name                                          AS campaign_name,
      c.dealer_id,
      COALESCE(d.name, 'House / No Dealer')           AS dealer_name,
      d.email                                         AS dealer_email,
      o.created_at                                    AS purchased_at
    FROM spots s
    JOIN campaigns c ON c.id = s.campaign_id
    LEFT JOIN dealers d ON d.id = c.dealer_id
    LEFT JOIN orders o ON o.spot_id = s.id AND o.status = 'paid'
    WHERE s.status = 'paid'
    ORDER BY o.created_at DESC NULLS LAST, s.id DESC
  `);

  const customers = rows.rows.map((r) => ({
    spotId: Number(r.spot_id),
    businessName: r.business_name ?? "",
    businessCategory: r.business_category ?? "",
    contactEmail: r.contact_email ?? "",
    contactPhone: r.contact_phone ?? "",
    size: r.size ?? "",
    price: Number(r.price ?? 0),
    campaignId: Number(r.campaign_id),
    campaignName: r.campaign_name ?? "",
    dealerId: r.dealer_id != null ? Number(r.dealer_id) : null,
    dealerName: r.dealer_name ?? "House / No Dealer",
    dealerEmail: r.dealer_email ?? null,
    purchasedAt:
      r.purchased_at instanceof Date
        ? r.purchased_at.toISOString()
        : (r.purchased_at ?? null),
    trackingCode: r.tracking_code ?? null,
  }));

  res.json({ customers });
});

export default router;
