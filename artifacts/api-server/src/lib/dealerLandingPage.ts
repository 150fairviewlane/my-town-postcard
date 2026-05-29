import {
  db,
  dealersTable,
  campaignsTable,
  spotsTable,
  territoriesTable,
  dealerTerritoriesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateUniqueCampaignSlug } from "./slugify";
import { STANDARD_SPOT_LAYOUT } from "./standardLayout";
import { logger } from "./logger";

type LandingPageInfo = {
  territoryName: string;
  cityList: string | null;
  homesCount: number;
  zipCode: string;
};

// Pull the best available human metadata for a dealer's territory. County-based
// signups live in `territories` (name + zoneNote cities + households); legacy
// ZIP-cluster signups live in `dealer_territories` (cityLabel + households).
async function resolveTerritoryInfo(
  dealerId: number,
  dealerName: string,
  dealerHomeZip: string,
): Promise<LandingPageInfo> {
  const [county] = await db
    .select()
    .from(territoriesTable)
    .where(eq(territoriesTable.dealerId, dealerId))
    .limit(1);
  if (county) {
    return {
      territoryName: county.name,
      cityList: county.zoneNote ?? null,
      homesCount: county.households > 0 ? county.households : 5000,
      zipCode: dealerHomeZip,
    };
  }

  const legacy = await db
    .select()
    .from(dealerTerritoriesTable)
    .where(eq(dealerTerritoriesTable.dealerId, dealerId));
  if (legacy.length > 0) {
    const totalHomes = legacy.reduce((sum, t) => sum + (t.estimatedHouseholds || 0), 0);
    const cities = legacy.map((t) => t.cityLabel).filter(Boolean).join(", ");
    return {
      territoryName: legacy[0].cityLabel || `${dealerName}'s Territory`,
      cityList: cities || null,
      homesCount: totalHomes > 0 ? totalHomes : 5000,
      zipCode: legacy[0].zipCodes?.[0] ?? dealerHomeZip,
    };
  }

  return {
    territoryName: `${dealerName}'s Territory`,
    cityList: null,
    homesCount: 5000,
    zipCode: dealerHomeZip,
  };
}

// Idempotently create (once) a published landing-page campaign for a dealer and
// generate the standard sellable spot layout. Safe to call from both the Stripe
// webhook and the synchronous /dealers/confirm path — a second call is a no-op.
//
// The auto-created campaign is `isPublished:true` (so its slug page is live +
// purchasable) but `status:"draft"` so it never collides with the single-active
// rule that the house homepage (`/api/campaigns/active`) depends on.
export async function ensureDealerLandingPage(dealerId: number): Promise<number | null> {
  const [dealer] = await db.select().from(dealersTable).where(eq(dealersTable.id, dealerId));
  if (!dealer) return null;

  // Already linked + the campaign still exists → nothing to do.
  if (dealer.landingPageCampaignId) {
    const [existing] = await db
      .select({ id: campaignsTable.id })
      .from(campaignsTable)
      .where(eq(campaignsTable.id, dealer.landingPageCampaignId))
      .limit(1);
    if (existing) return existing.id;
  }

  // Defense in depth: a campaign may already be linked by dealerId even if the
  // back-reference on the dealer row wasn't written (e.g. a partial earlier run).
  const [byDealer] = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(eq(campaignsTable.dealerId, dealerId))
    .limit(1);
  if (byDealer) {
    await db
      .update(dealersTable)
      .set({ landingPageCampaignId: byDealer.id })
      .where(eq(dealersTable.id, dealerId));
    return byDealer.id;
  }

  const info = await resolveTerritoryInfo(dealerId, dealer.name, dealer.homeZip);
  const slug = await generateUniqueCampaignSlug(info.territoryName);

  const campaignId = await db.transaction(async (tx) => {
    const [campaign] = await tx
      .insert(campaignsTable)
      .values({
        name: `${info.territoryName} — Postcard`,
        territory: info.territoryName,
        zipCode: info.zipCode,
        homesCount: info.homesCount,
        status: "draft",
        slug,
        dealerId,
        isPublished: true,
        cityList: info.cityList,
      })
      .returning({ id: campaignsTable.id });

    await tx.insert(spotsTable).values(
      STANDARD_SPOT_LAYOUT.map((s) => ({
        campaignId: campaign.id,
        side: s.side,
        size: s.size,
        gridArea: s.gridArea,
        price: s.price,
      })),
    );

    await tx
      .update(dealersTable)
      .set({ landingPageCampaignId: campaign.id })
      .where(eq(dealersTable.id, dealerId));

    return campaign.id;
  });

  logger.info({ dealerId, campaignId, slug }, "Auto-created dealer landing page");
  return campaignId;
}
