import { useState, useEffect, useRef } from "react";

// Back-side postcard layout, house ads, and the USPS EDDM placeholder box.
//
// Grid is the same 12-col × 9-row geometry as the front (1 cell = 1 inch on
// the printed 12"×9" postcard) so both sides share the same SIZES table,
// PaidAd dispatcher, AdGenerator, and payment flow.
//
// Layout (each letter is one 1-inch cell):
//
//   1  2  3  4  5  6  7  8  9  10 11 12
//   bxl bxl bxl bxl bxl2 bxl2 bxl2 bxl2 bxl3 bxl3 bxl3 bxl3  rows 1-5
//   bm1 bm1 bm1 bm2 bm2  bm2  bm3  bm3  bm3  bm4  bm4  bm4   rows 6-7
//   bs1 bs1 bhs bhs bhs  bhs  bhs  bhs  bed  bed  bed  bed    rows 8-9
//
// Sellable spots: bxl+bxl2+bxl3 (3×XL), bm1+bm2+bm3+bm4 (4×Medium),
// bs1 (1×Small). Total: 8 spots.
//
// Non-sellable areas:
//   • bed — USPS EDDM block (4"×2"). Required for Every Door Direct Mail.
//           The bottom-right corner of any USPS mailer is reserved for the
//           indicia, address line, and barcode. Not a paid ad slot.
//   • bhs  — house ad strip (6"×2", rows 8-9 cols 3-8). Brand promo.

// Back-side grid: 12 cols × 9 rows. 1 column = 1 inch.
// Sizes: XL=4"×5", Medium=3"×2", Small=2"×2", EDDM=4"×2".
// Layout tiles all 108 cells with no gaps or overlaps.
//
//   cols: 1   2   3   4   5   6   7   8   9   10  11  12
//  row 1: bxl bxl bxl bxl bxl2 bxl2 bxl2 bxl2 bxl3 bxl3 bxl3 bxl3
//  row 2: bxl bxl bxl bxl bxl2 bxl2 bxl2 bxl2 bxl3 bxl3 bxl3 bxl3
//  row 3: bxl bxl bxl bxl bxl2 bxl2 bxl2 bxl2 bxl3 bxl3 bxl3 bxl3
//  row 4: bxl bxl bxl bxl bxl2 bxl2 bxl2 bxl2 bxl3 bxl3 bxl3 bxl3
//  row 5: bxl bxl bxl bxl bxl2 bxl2 bxl2 bxl2 bxl3 bxl3 bxl3 bxl3
//  row 6: bm1 bm1 bm1 bm2 bm2 bm2 bm3 bm3 bm3 bm4 bm4 bm4
//  row 7: bm1 bm1 bm1 bm2 bm2 bm2 bm3 bm3 bm3 bm4 bm4 bm4
//  row 8: bs1 bs1 bhs bhs bhs bhs bhs bhs bed bed bed bed
//  row 9: bs1 bs1 bhs bhs bhs bhs bhs bhs bed bed bed bed
export const BACK_GRID_AREAS = [
  "bxl bxl bxl bxl bxl2 bxl2 bxl2 bxl2 bxl3 bxl3 bxl3 bxl3",
  "bxl bxl bxl bxl bxl2 bxl2 bxl2 bxl2 bxl3 bxl3 bxl3 bxl3",
  "bxl bxl bxl bxl bxl2 bxl2 bxl2 bxl2 bxl3 bxl3 bxl3 bxl3",
  "bxl bxl bxl bxl bxl2 bxl2 bxl2 bxl2 bxl3 bxl3 bxl3 bxl3",
  "bxl bxl bxl bxl bxl2 bxl2 bxl2 bxl2 bxl3 bxl3 bxl3 bxl3",
  "bm1 bm1 bm1 bm2 bm2 bm2 bm3 bm3 bm3 bm4 bm4 bm4",
  "bm1 bm1 bm1 bm2 bm2 bm2 bm3 bm3 bm3 bm4 bm4 bm4",
  "bs1 bs1 bhs bhs bhs bhs bhs bhs bed bed bed bed",
  "bs1 bs1 bhs bhs bhs bhs bhs bhs bed bed bed bed",
].map((r) => `"${r}"`).join(" ");

// Render order for sellable back-side spots (used by sort helpers in callers).
export const BACK_GRID_ORDER = ["bxl", "bxl2", "bxl3", "bm1", "bm2", "bm3", "bm4", "bs1"];

// ─── House ads (back side) ───────────────────────────────────────────────────
// Three different cell shapes need three different house-ad layouts. They all
// share the brand colors of the front HouseAd so the postcard reads as a
// single product across both faces.

// bhs — wide banner (6 cols × 2 rows ≈ 3:1 landscape).
// Proportionally-scaled so it renders identically to AdHouse in the picker
// at any container size (screen preview or print).
function HouseAdScaled({ w = 600, h = 200 }) {
  const s = h / 200;
  const topH = Math.round(h * 0.44);
  const botH = h - topH;
  const qrSz = Math.round(68 * s);
  const circSz = Math.round(36 * s);
  const iconSz = Math.round(20 * s);
  const px = Math.round(10 * s);
  const divH = Math.round(botH * 0.72);
  const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=" + encodeURIComponent("https://mytownpostcard.com");
  const HouseIco = () => (
    <svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="white">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  );
  const EnvIco = () => (
    <svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <polyline points="2,8 12,14 22,8" />
    </svg>
  );
  const PinIco = () => (
    <svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="white">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
    </svg>
  );
  const Ico = ({ icon, label }) => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: Math.round(3 * s), minWidth: 0 }}>
      <div style={{ width: circSz, height: circSz, borderRadius: "50%", background: "#c41c1c", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div style={{ color: "#fff", fontSize: Math.round(10 * s), textAlign: "center", lineHeight: 1.25, fontFamily: "sans-serif", fontWeight: 500 }}>{label}</div>
    </div>
  );
  const Divider = () => <div style={{ width: 1, height: divH, background: "rgba(255,255,255,0.35)", flexShrink: 0 }} />;
  return (
    <div style={{ width: w, height: h, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "sans-serif" }}>
      {/* Top: white/beige section */}
      <div style={{ height: topH, background: "#f4f3ef", display: "flex", alignItems: "center", padding: `0 ${px}px`, gap: Math.round(10 * s), flexShrink: 0 }}>
        <img src="/mailbox-logo.png" alt="My Town Postcard" style={{ height: topH - Math.round(8 * s), width: "auto", flexShrink: 0 }} />
        <div style={{ width: 2, height: Math.round(58 * s), background: "#991b1b", flexShrink: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: Math.round(3 * s) }}>
          <div style={{ fontSize: Math.round(23 * s), fontFamily: "Georgia,serif", fontWeight: 700, lineHeight: 1.05, whiteSpace: "nowrap" }}>
            <span style={{ color: "#0d1d36" }}>My Town </span>
            <span style={{ color: "#991b1b" }}>Postcard</span>
          </div>
          <div style={{ fontSize: Math.round(10.5 * s), color: "#0d1d36", letterSpacing: Math.round(2 * s), fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}>
            Local Reach.&nbsp; Real Results.
          </div>
        </div>
      </div>
      {/* Bottom: navy section */}
      <div style={{ height: botH, background: "#0d1d36", display: "flex", alignItems: "center", padding: `0 ${px}px`, gap: Math.round(8 * s), boxSizing: "border-box", overflow: "hidden" }}>
        <div style={{ color: "#fff", fontFamily: "Impact,'Arial Black',sans-serif", fontSize: Math.round(34 * s), fontWeight: 900, flexShrink: 0, lineHeight: 1, textTransform: "uppercase", letterSpacing: 0.5 }}>
          ADVERTISE<br />HERE!
        </div>
        <Divider />
        <Ico icon={<HouseIco />} label={<>Reach 5,000<br />Homes In<br />Your Town</>} />
        <Divider />
        <Ico icon={<EnvIco />} label={<>USPS Every<br />Door Direct<br />Mail</>} />
        <Divider />
        <Ico icon={<PinIco />} label={<>Targeted.<br />Local.<br />Effective.</>} />
        <Divider />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(3 * s), flexShrink: 0 }}>
          <div style={{ background: "#fff", borderRadius: 3, padding: Math.round(4 * s) }}>
            <img src={qrUrl} style={{ width: qrSz, height: qrSz, display: "block" }} alt="QR" />
          </div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: Math.round(9.5 * s), textAlign: "center" }}>Scan to advertise</div>
        </div>
      </div>
    </div>
  );
}

// Self-measuring wrapper — fills its grid cell and passes measured pixel
// dimensions into HouseAdBanner so the proportional scaling is always correct,
// whether rendered on-screen (postcard picker or print preview) or in print.
export function HouseAdVertical() {
  const ref = useRef(null);
  const [dims, setDims] = useState({ w: 600, h: 200 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: "100%", height: "100%" }}>
      <HouseAdScaled w={dims.w} h={dims.h} />
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
