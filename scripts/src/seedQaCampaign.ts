/**
 * Seed script: create (or verify) the permanent QA campaign and its spots.
 *
 * Safe to run multiple times — checks for existence before inserting.
 * The QA campaign is:
 *   - status='draft'  (never activates; can't win the single-active invariant)
 *   - isPublished=false  (invisible to every public API endpoint)
 *   - isQaTest=true  (excluded from all milestone emails and aggregate totals)
 *   - slug='__qa-test__'  (reserved slug; not routable from the public picker)
 *
 * Spots use the same grid areas as a real front-side postcard so the QA bot
 * exercises real price / area values.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run seed:qa
 */

import { db, campaignsTable, spotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const QA_SLUG = "__qa-test__";

const QA_SPOTS: Array<{
  side: "front" | "back";
  size: "xl" | "large" | "medium" | "small";
  gridArea: string;
  price: number;
}> = [
  { side: "front", size: "xl",    gridArea: "mb", price: 49900 },
  { side: "front", size: "xl",    gridArea: "dn", price: 49900 },
  { side: "front", size: "xl",    gridArea: "re", price: 49900 },
  { side: "front", size: "large", gridArea: "l1", price: 39900 },
  { side: "front", size: "large", gridArea: "l2", price: 39900 },
  { side: "back",  size: "xl",    gridArea: "bxl",  price: 49900 },
  { side: "back",  size: "xl",    gridArea: "bxl2", price: 49900 },
];

async function main(): Promise<void> {
  // Check if QA campaign already exists
  const [existing] = await db
    .select({ id: campaignsTable.id, name: campaignsTable.name })
    .from(campaignsTable)
    .where(eq(campaignsTable.slug, QA_SLUG))
    .limit(1);

  let campaignId: number;

  if (existing) {
    console.log(`QA campaign already exists (id=${existing.id}, name="${existing.name}") — skipping campaign insert.`);
    campaignId = existing.id;
  } else {
    const [created] = await db
      .insert(campaignsTable)
      .values({
        name: "QA Bot Campaign",
        territory: "QA Test Territory",
        zipCode: "00000",
        status: "draft",
        isPublished: false,
        isQaTest: true,
        slug: QA_SLUG,
        homesCount: 0,
        mailDate: null,
        mailingSeason: "QA",
        mailingMonth: null,
        cityList: null,
      })
      .returning({ id: campaignsTable.id });
    campaignId = created.id;
    console.log(`Created QA campaign (id=${campaignId}).`);
  }

  // Insert any spots that don't already exist (idempotent by campaignId+gridArea unique index)
  let created = 0;
  let skipped = 0;

  for (const spot of QA_SPOTS) {
    // Use a raw check against gridArea since the unique index is composite
    const allSpots = await db
      .select({ gridArea: spotsTable.gridArea })
      .from(spotsTable)
      .where(eq(spotsTable.campaignId, campaignId));

    if (allSpots.some((s: { gridArea: string }) => s.gridArea === spot.gridArea)) {
      skipped++;
      continue;
    }

    await db.insert(spotsTable).values({
      campaignId,
      side: spot.side,
      size: spot.size,
      gridArea: spot.gridArea,
      price: spot.price,
      status: "available",
      isQaTest: true,
    });
    created++;
  }

  console.log(`Spots: ${created} created, ${skipped} already existed.`);

  const allSpots = await db
    .select({ id: spotsTable.id, gridArea: spotsTable.gridArea, status: spotsTable.status })
    .from(spotsTable)
    .where(eq(spotsTable.campaignId, campaignId));

  console.log(`\nQA campaign ${campaignId} has ${allSpots.length} spots:`);
  for (const s of allSpots) {
    console.log(`  id=${s.id}  gridArea=${s.gridArea}  status=${s.status}`);
  }
  console.log("\nDone. Set STRIPE_QA_SECRET_KEY=sk_test_... before running the QA bot.");

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
