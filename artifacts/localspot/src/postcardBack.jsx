// Back-side postcard layout, house ads, and the USPS EDDM placeholder box.
//
// Grid is the same 12-col × 9-row geometry as the front (1 cell = 1 inch on
// the printed 12"×9" postcard) so both sides share the same SIZES table,
// PaidAd dispatcher, AdGenerator, and payment flow.
//
// Layout (each letter is one 1-inch cell):
//
//   1  2  3  4  5  6  7  8  9  10 11 12
//   bxl bxl bxl bxl bl1 bl1 bl1 bl2 bl2 bl2 bhs bhs   row 1
//   bxl bxl bxl bxl bl1 bl1 bl1 bl2 bl2 bl2 bhs bhs   row 2
//   bxl bxl bxl bxl bl1 bl1 bl1 bl2 bl2 bl2 bhs bhs   row 3
//   bxl bxl bxl bxl bl1 bl1 bl1 bl2 bl2 bl2 bhs bhs   row 4
//   bxl bxl bxl bxl bm1 bm1 bm1 bm2 bm2 bm2 bhs bhs   row 5
//   bs1 bs1 bs2 bs2 bm1 bm1 bm1 bm2 bm2 bm2 bhs bhs   row 6
//   bs1 bs1 bs2 bs2 bhr bhr bhr bhr bhr bhr bhs bhs   row 7
//   bhn bhn bhn bhn bhn bhn bhn bhn ed  ed  ed  ed    row 8
//   bhn bhn bhn bhn bhn bhn bhn bhn ed  ed  ed  ed    row 9
//
// Sellable spots: bxl (1×XL), bl1+bl2 (2×Large), bm1+bm2 (2×Medium),
// bs1+bs2 (2×Small). Total: 7 spots.
//
// Non-sellable areas:
//   • ed  — USPS EDDM block (4"×2"). Required for Every Door Direct Mail.
//           The bottom-right corner of any USPS mailer is reserved for the
//           indicia, address line, and barcode. Not a paid ad slot.
//   • bhs, bhr, bhn — house ads / brand promo. Filled by us, not for sale.

export const BACK_GRID_AREAS = [
  "bxl bxl bxl bxl bl1 bl1 bl1 bl2 bl2 bl2 bhs bhs",
  "bxl bxl bxl bxl bl1 bl1 bl1 bl2 bl2 bl2 bhs bhs",
  "bxl bxl bxl bxl bl1 bl1 bl1 bl2 bl2 bl2 bhs bhs",
  "bxl bxl bxl bxl bl1 bl1 bl1 bl2 bl2 bl2 bhs bhs",
  "bxl bxl bxl bxl bm1 bm1 bm1 bm2 bm2 bm2 bhs bhs",
  "bs1 bs1 bs2 bs2 bm1 bm1 bm1 bm2 bm2 bm2 bhs bhs",
  "bs1 bs1 bs2 bs2 bhr bhr bhr bhr bhr bhr bhs bhs",
  "bhn bhn bhn bhn bhn bhn bhn bhn ed  ed  ed  ed ",
  "bhn bhn bhn bhn bhn bhn bhn bhn ed  ed  ed  ed ",
].map((r) => `"${r}"`).join(" ");

// Render order for sellable back-side spots (used by sort helpers in callers).
export const BACK_GRID_ORDER = ["bxl", "bl1", "bl2", "bm1", "bm2", "bs1", "bs2"];

// ─── House ads (back side) ───────────────────────────────────────────────────
// Three different cell shapes need three different house-ad layouts. They all
// share the brand colors of the front HouseAd so the postcard reads as a
// single product across both faces.

// bhs — vertical strip on the right edge (2 cols × 7 rows ≈ tall portrait).
export function HouseAdVertical() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "linear-gradient(160deg,#0f1923 0%,#1a2a3a 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "10px 6px",
        boxSizing: "border-box",
        fontFamily: "sans-serif",
        textAlign: "center",
        overflow: "hidden",
      }}
    >
      <div style={{ width: "70%", height: 2, background: "#991b1b", borderRadius: 1 }} />
      <div
        style={{
          color: "#fff",
          fontWeight: 900,
          fontSize: 13,
          fontFamily: "Georgia,serif",
          lineHeight: 1.1,
        }}
      >
        Want
        <br />
        Your Ad
        <br />
        Here?
      </div>
      <div style={{ width: "60%", height: 1, background: "rgba(255,255,255,0.25)" }} />
      <div
        style={{
          color: "rgba(255,255,255,0.7)",
          fontSize: 8,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        Reach 5,000
        <br />
        Local Homes
      </div>
      <div
        style={{
          color: "#991b1b",
          background: "#fff",
          fontWeight: 800,
          fontSize: 8,
          padding: "3px 6px",
          borderRadius: 3,
          letterSpacing: 0.5,
        }}
      >
        From $199
      </div>
      <div style={{ color: "#fff", fontSize: 7, fontWeight: 700 }}>mytownpostcard.com</div>
      <div style={{ width: "70%", height: 2, background: "#991b1b", borderRadius: 1 }} />
    </div>
  );
}

// bhr — thin horizontal divider in the middle (6 cols × 1 row ≈ 6:1 ratio).
export function HouseAdRow() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "linear-gradient(90deg,#7f1d1d,#991b1b)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "0 12px",
        boxSizing: "border-box",
        fontFamily: "sans-serif",
        color: "#fff",
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        overflow: "hidden",
      }}
    >
      <span>Shop</span>
      <span style={{ color: "#fca5a5" }}>·</span>
      <span>Dine</span>
      <span style={{ color: "#fca5a5" }}>·</span>
      <span>Buy Local</span>
    </div>
  );
}

// bhn — wide banner across the bottom-left (8 cols × 2 rows ≈ 4:1 ratio).
// Doubles as the "send your business postcard" call to action.
export function HouseAdBanner({ campaign }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "linear-gradient(135deg,#0f1923 0%,#1a2a3a 60%,#7f1d1d 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "10px 18px",
        boxSizing: "border-box",
        fontFamily: "sans-serif",
        color: "#fff",
        overflow: "hidden",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "Georgia,serif",
            fontWeight: 900,
            fontSize: 18,
            lineHeight: 1.1,
          }}
        >
          📮 My Town Postcard
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.75)",
            fontSize: 10.5,
            marginTop: 4,
            letterSpacing: 0.5,
          }}
        >
          {campaign?.territory ?? "Habersham County, GA"} · Reaches{" "}
          {campaign?.homesCount?.toLocaleString() ?? "5,000"} homes
        </div>
      </div>
      <div
        style={{
          background: "#fff",
          color: "#991b1b",
          padding: "8px 14px",
          borderRadius: 6,
          fontWeight: 900,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1,
          flexShrink: 0,
        }}
      >
        mytownpostcard.com
      </div>
    </div>
  );
}

// ed — USPS EDDM placeholder block. NOT sellable. The Every Door Direct Mail
// program reserves this corner for the postal indicia, "Local Postal Customer"
// address line, route info, and the carrier-route barcode. The printer will
// imprint the live indicia at press time; the placeholder shows the admin and
// the printer where the reserved area sits.
export function EDDMBox() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#fff",
        border: "2px solid #111",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        fontFamily: "sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Top: indicia placeholder box. */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: 6,
        }}
      >
        <div
          style={{
            border: "1.5px solid #111",
            padding: "4px 10px",
            textAlign: "center",
            fontSize: 7,
            fontWeight: 700,
            lineHeight: 1.25,
            color: "#111",
            minWidth: 90,
          }}
        >
          PRESORTED STD
          <br />
          U.S. POSTAGE PAID
          <br />
          PERMIT NO. ____
          <br />
          CITY, STATE ZIP
        </div>
      </div>
      {/* Middle: ECRWSS line + Local Postal Customer label. */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "4px 12px",
          gap: 4,
        }}
      >
        <div
          style={{
            fontSize: 8,
            fontWeight: 700,
            color: "#111",
            letterSpacing: 1,
          }}
        >
          ★★★★★ ECRWSS
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 900,
            color: "#111",
            fontFamily: "Georgia,serif",
            lineHeight: 1.1,
          }}
        >
          Local
          <br />
          Postal Customer
        </div>
        <div
          style={{
            fontSize: 7.5,
            color: "#374151",
            letterSpacing: 0.4,
          }}
        >
          EDDM Retail · Carrier Route
        </div>
      </div>
      {/* Bottom: barcode placeholder. */}
      <div
        style={{
          padding: "4px 12px 6px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 1.5,
            height: 14,
            alignItems: "stretch",
          }}
        >
          {[2, 1, 3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 1, 3, 1, 2, 1, 2, 1, 3, 1, 1, 2, 1, 1].map((w, i) => (
            <div
              key={i}
              style={{
                width: `${w * 1.5}px`,
                background: "#111",
              }}
            />
          ))}
        </div>
        <div
          style={{
            fontSize: 6.5,
            fontWeight: 700,
            color: "#111",
            marginTop: 3,
            letterSpacing: 1,
          }}
        >
          USPS · EDDM INDICIA AREA · 4&quot; × 2&quot; (placeholder)
        </div>
      </div>
    </div>
  );
}
