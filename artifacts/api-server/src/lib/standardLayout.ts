// Standard postcard layout — the single source of truth for the *sellable*
// cells generated for every new campaign (admin-created or auto-created for a
// dealer territory). Mirrors the picker / print page exactly. House-ad cells
// (`hs`, `bhs`, `bhr`, `bhn`) and the `ed` EDDM block are rendered statically
// by the frontend and intentionally have no DB row. Prices in cents.

/**
 * Validate that a spot layout contains no duplicate grid areas and that every
 * entry has the required fields. Throws an Error with a descriptive message if
 * any invariant is violated. Call this inside the campaign-creation transaction
 * before inserting spots so layout bugs are caught at insertion time rather
 * than silently producing corrupt data.
 */
export function validateLayout(
  layout: ReadonlyArray<{ gridArea: string; side: string; size: string; price: number }>,
  layoutName = "STANDARD_SPOT_LAYOUT",
): void {
  if (layout.length === 0) {
    throw new Error(`${layoutName} is empty — cannot create a campaign with no spots`);
  }

  const seen = new Map<string, number>();
  for (const [i, spot] of layout.entries()) {
    if (!spot.gridArea) {
      throw new Error(`${layoutName}[${i}] has a missing or empty gridArea`);
    }
    if (seen.has(spot.gridArea)) {
      throw new Error(
        `${layoutName} has duplicate gridArea "${spot.gridArea}" at index ${seen.get(spot.gridArea)} and ${i}`,
      );
    }
    seen.set(spot.gridArea, i);
  }
}

export const STANDARD_SPOT_LAYOUT: ReadonlyArray<{
  side: "front" | "back";
  size: "xl" | "large" | "medium" | "small";
  gridArea: string;
  price: number;
}> = [
  // Front side — 7 sellable cells: 3 XL (top row) + 4 Large portrait (bottom row).
  { side: "front", size: "xl",    gridArea: "mb", price: 49900 },
  { side: "front", size: "xl",    gridArea: "dn", price: 49900 },
  { side: "front", size: "xl",    gridArea: "re", price: 49900 },
  { side: "front", size: "large", gridArea: "l1", price: 39900 },
  { side: "front", size: "large", gridArea: "l2", price: 39900 },
  { side: "front", size: "large", gridArea: "l3", price: 39900 },
  { side: "front", size: "large", gridArea: "l4", price: 39900 },
  // Back side — 8 sellable cells: 3 XL (top row) + 4 Medium (middle row) + 1 Small.
  { side: "back",  size: "xl",     gridArea: "bxl",  price: 49900 },
  { side: "back",  size: "xl",     gridArea: "bxl2", price: 49900 },
  { side: "back",  size: "xl",     gridArea: "bxl3", price: 49900 },
  { side: "back",  size: "medium", gridArea: "bm1",  price: 29900 },
  { side: "back",  size: "medium", gridArea: "bm2",  price: 29900 },
  { side: "back",  size: "medium", gridArea: "bm3",  price: 29900 },
  { side: "back",  size: "medium", gridArea: "bm4",  price: 29900 },
  { side: "back",  size: "small",  gridArea: "bs1",  price: 19900 },
];
