import {
  db,
  dealersTable,
  campaignsTable,
  spotsTable,
  territoriesTable,
  dealerTerritoriesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { generateSlug, generateUniqueCampaignSlug } from "./slugify";
import { STANDARD_SPOT_LAYOUT } from "./standardLayout";
import { logger } from "./logger";

type LandingPageInfo = {
  territoryName: string;
  cityList: string | null;
  homesCount: number;
  zipCode: string;
  // True only when cityList was sourced from a county territory's zoneNote field.
  // Legacy dealers whose cityList is synthesized from dealer_territories city labels
  // must NOT enter the per-hub-city multi-campaign path.
  fromZoneNote: boolean;
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
      // Only set true when the territory row actually has a zoneNote — that is
      // the authoritative source of per-hub-city names. A county row with no
      // zoneNote falls through to the single-campaign fallback.
      fromZoneNote: !!county.zoneNote,
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
      // cityList is synthesized from city labels — NOT from a zoneNote. Never
      // use this for per-hub-city multi-campaign creation.
      cityList: cities || null,
      homesCount: totalHomes > 0 ? totalHomes : 5000,
      zipCode: legacy[0].zipCodes?.[0] ?? dealerHomeZip,
      fromZoneNote: false,
    };
  }

  return {
    territoryName: `${dealerName}'s Territory`,
    cityList: null,
    homesCount: 5000,
    zipCode: dealerHomeZip,
    fromZoneNote: false,
  };
}

// Idempotently create published landing-page campaigns for a dealer — one per
// hub city in the territory's zoneNote. Safe to call from both the Stripe webhook
// and the synchronous /dealers/confirm path; repeated calls are no-ops.
//
// When the territory has N hub cities (comma-separated in zoneNote), N campaigns
// are created, each with `city_list = hubCityName` and a slug of the form
// `{territorySlug}-{citySlug}` (e.g. "cherokee-woodstock").
//
// Fallback: if no hub cities are present (legacy dealers / no zoneNote), the
// original single-campaign behavior is preserved for backwards compatibility.
//
// All auto-created campaigns are `isPublished:true` / `status:"draft"` so slug
// pages are live immediately but never collide with the single-active-campaign
// rule that the house homepage depends on.
export async function ensureDealerLandingPage(dealerId: number): Promise<number[]> {
  const [dealerExists] = await db
    .select({ id: dealersTable.id })
    .from(dealersTable)
    .where(eq(dealersTable.id, dealerId))
    .limit(1);
  if (!dealerExists) return [];

  const [meta] = await db
    .select({ name: dealersTable.name, homeZip: dealersTable.homeZip })
    .from(dealersTable)
    .where(eq(dealersTable.id, dealerId))
    .limit(1);
  const info = await resolveTerritoryInfo(dealerId, meta.name, meta.homeZip ?? "");

  // Parse hub cities — ONLY when the city list came from a county zoneNote.
  // Legacy dealers whose cityList is synthesized from dealer_territories must
  // always use the single-campaign fallback, never the per-hub-city path.
  const hubCities =
    info.fromZoneNote && info.cityList
      ? info.cityList.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  // ── Legacy / no-hub-city fallback: create a single territory campaign ───────
  if (hubCities.length === 0) {
    const candidateSlug = await generateUniqueCampaignSlug(info.territoryName);

    const campaignId = await db.transaction(async (tx) => {
      const [dealer] = await tx
        .select()
        .from(dealersTable)
        .where(eq(dealersTable.id, dealerId))
        .for("update");
      if (!dealer) return null;

      if (dealer.landingPageCampaignId) {
        const [existing] = await tx
          .select({ id: campaignsTable.id })
          .from(campaignsTable)
          .where(eq(campaignsTable.id, dealer.landingPageCampaignId))
          .limit(1);
        if (existing) return existing.id;
      }

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

      logger.info({ dealerId, campaignId: campaign.id, slug: candidateSlug }, "Auto-created dealer landing page (legacy)");
      return campaign.id;
    });

    return campaignId ? [campaignId] : [];
  }

  // ── Multi-city path: one campaign per hub city ──────────────────────────────
  // Pre-generate unique slugs outside the transaction (best-effort; the UNIQUE
  // constraint on campaigns.slug is the authoritative guard). Each slug combines
  // the territory slug with the city slug, e.g. "cherokee-woodstock".
  const territorySlugBase = generateSlug(info.territoryName);
  const candidateSlugs: string[] = [];
  for (const city of hubCities) {
    // Pass the raw territory name + city name together so generateSlug can strip
    // "County"/"Counties" and "/" separators from both parts in one pass.
    const slug = await generateUniqueCampaignSlug(`${info.territoryName} ${city}`);
    candidateSlugs.push(slug);
  }

  // Serialize concurrent callers on the dealer row so the idempotency checks
  // below see any campaigns a concurrent first-run already created.
  const campaignIds = await db.transaction(async (tx) => {
    const [dealer] = await tx
      .select()
      .from(dealersTable)
      .where(eq(dealersTable.id, dealerId))
      .for("update");
    if (!dealer) return [];

    const ids: number[] = [];

    for (let i = 0; i < hubCities.length; i++) {
      const hubCity = hubCities[i];

      // Idempotency: a campaign for this dealer + city already exists → reuse it.
      const [existing] = await tx
        .select({ id: campaignsTable.id })
        .from(campaignsTable)
        .where(and(eq(campaignsTable.dealerId, dealerId), eq(campaignsTable.cityList, hubCity)))
        .limit(1);

      if (existing) {
        ids.push(existing.id);
        continue;
      }

      const [campaign] = await tx
        .insert(campaignsTable)
        .values({
          name: `${hubCity} — Postcard Advertising`,
          territory: info.territoryName,
          zipCode: info.zipCode,
          homesCount: 5000,
          status: "draft",
          slug: candidateSlugs[i],
          dealerId,
          isPublished: true,
          cityList: hubCity,
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

      ids.push(campaign.id);
      logger.info(
        { dealerId, campaignId: campaign.id, hubCity, slug: candidateSlugs[i] },
        "Auto-created dealer landing page for hub city",
      );
    }

    // Backwards compat: set landingPageCampaignId to the first campaign so that
    // any code still reading that field continues to work.
    if (ids.length > 0 && !dealer.landingPageCampaignId) {
      await tx
        .update(dealersTable)
        .set({ landingPageCampaignId: ids[0] })
        .where(eq(dealersTable.id, dealerId));
    }

    return ids;
  });

  logger.info({ dealerId, count: campaignIds.length, territorySlugBase }, "ensureDealerLandingPage complete");
  return campaignIds;
}
