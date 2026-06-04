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
  const [dealerExists] = await db
    .select({ id: dealersTable.id })
    .from(dealersTable)
    .where(eq(dealersTable.id, dealerId))
    .limit(1);
  if (!dealerExists) return null;

  // Resolve territory metadata + a candidate slug OUTSIDE the lock — these are
  // read-only and slug generation is best-effort unique. The authoritative
  // existence check + insert happen inside the transaction below.
  const [meta] = await db
    .select({ name: dealersTable.name, homeZip: dealersTable.homeZip })
    .from(dealersTable)
    .where(eq(dealersTable.id, dealerId))
    .limit(1);
  const info = await resolveTerritoryInfo(dealerId, meta.name, meta.homeZip ?? "");
  const candidateSlug = await generateUniqueCampaignSlug(info.territoryName);

  // Serialize concurrent callers (Stripe webhook + synchronous /dealers/confirm)
  // on the dealer row. `SELECT ... FOR UPDATE` blocks the second caller until
  // the first commits, so the re-checks below see any campaign the first run
  // created — guaranteeing we never create two landing pages for one dealer.
  const campaignId = await db.transaction(async (tx) => {
    const [dealer] = await tx
      .select()
      .from(dealersTable)
      .where(eq(dealersTable.id, dealerId))
      .for("update");
    if (!dealer) return null;

    // Already linked + the campaign still exists → nothing to do.
    if (dealer.landingPageCampaignId) {
      const [existing] = await tx
        .select({ id: campaignsTable.id })
        .from(campaignsTable)
        .where(eq(campaignsTable.id, dealer.landingPageCampaignId))
        .limit(1);
      if (existing) return existing.id;
    }

    // A campaign may already be linked by dealerId even if the back-reference on
    // the dealer row wasn't written (e.g. a partial earlier run).
    const [byDealer] = await tx
      .select({ id: campaignsTable.id })
      .from(campaignsTable)
      .where(eq(campaignsTable.dealerId, dealerId))
      .limit(1);
    if (byDealer) {
      await tx
        .update(dealersTable)
        .set({ landingPageCampaignId: byDealer.id })
        .where(eq(dealersTable.id, dealerId));
      return byDealer.id;
    }

    const [campaign] = await tx
      .insert(campaignsTable)
      .values({
        name: `${info.territoryName} — Postcard`,
        territory: info.territoryName,
        zipCode: info.zipCode,
        homesCount: info.homesCount,
        status: "draft",
        slug: candidateSlug,
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

    logger.info({ dealerId, campaignId: campaign.id, slug: candidateSlug }, "Auto-created dealer landing page");
    return campaign.id;
  });

  return campaignId;
}
