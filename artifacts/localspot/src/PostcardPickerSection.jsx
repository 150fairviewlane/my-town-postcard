import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useGetActiveCampaign, useReserveSpot } from "@workspace/api-client-react";
import {
  saveReservation,
  findActiveReservation,
  clearReservation,
} from "./lib/reservationStorage";
import { GRID_AREAS, PaidAd, AvailableSpot, ReservedSpot } from "./postcardCore";
import {
  BACK_GRID_AREAS,
  BACK_GRID_ORDER,
  HouseAdVertical,
  HouseAdRow,
  HouseAdBanner,
  EDDMBox,
} from "./postcardBack";
// AdGenerator is heavy (~1k lines + AdAssistant + the industry asset
// table) BUT it is the very first thing the user clicks while testing.
// We tried lazy-loading it earlier — that turned out to hurt: in Vite dev
// each lazy chunk fan-outs a fresh waterfall of module requests over the
// (often slow) Replit preview proxy, so the modal would take a long time
// to appear after the click. Loading it eagerly with the picker means
// the modal opens instantly when a spot is tapped.
import AdGenerator from "./AdGenerator";
import { getSampleAd, SPOT_SAMPLE_MAP } from "./PostcardSampleAds";

const SIZE_MAP = { xl: "XL", large: "L", medium: "M", small: "S" };

const FRONT_GRID_ORDER = ["mb","dn","re","l1","l2","l3","l4"];

// Explicit grid positions for every named area on both sides.
// gridColumn / gridRow use CSS end-exclusive line numbers (e.g. "1/5" = cols 1-4).
// This approach is more reliable than gridTemplateAreas and makes ad placement
// immediately readable: each spot's print dimensions map directly to its col/row span.
const GRID_POSITIONS = {
  // ── Front side ──────────────────────────────────────────────────────────────
  // Top row: 3 XL spots (4"×5" each = 4 cols × 5 rows)
  mb:  { gridColumn: "1/5",   gridRow: "1/6"  },  // XL  4"×5"
  dn:  { gridColumn: "5/9",   gridRow: "1/6"  },  // XL  4"×5"
  re:  { gridColumn: "9/13",  gridRow: "1/6"  },  // XL  4"×5"
  // Bottom row: 4 Large portrait spots (3"×4" each = 3 cols × 4 rows). No house ad.
  l1:  { gridColumn: "1/4",   gridRow: "6/10" },  // Lg portrait  3"×4"
  l2:  { gridColumn: "4/7",   gridRow: "6/10" },  // Lg portrait  3"×4"
  l3:  { gridColumn: "7/10",  gridRow: "6/10" },  // Lg portrait  3"×4"
  l4:  { gridColumn: "10/13", gridRow: "6/10" },  // Lg portrait  3"×4"
  // ── Back side ───────────────────────────────────────────────────────────────
  bxl: { gridColumn: "1/5",   gridRow: "1/6"  },  // XL  4"×5"
  bl1: { gridColumn: "5/9",   gridRow: "1/4"  },  // Lg  4"×3"
  bl2: { gridColumn: "9/13",  gridRow: "1/4"  },  // Lg  4"×3"
  bm1: { gridColumn: "5/7",   gridRow: "4/6"  },  // Md  2"×2"
  bs1: { gridColumn: "7/9",   gridRow: "4/6"  },  // Sm  2"×2"
  bm2: { gridColumn: "9/11",  gridRow: "4/6"  },  // Md  2"×2"
  bs2: { gridColumn: "11/13", gridRow: "4/6"  },  // Sm  2"×2"
  ed:  { gridColumn: "9/13",  gridRow: "6/10" },  // EDDM indicia  4"×4"
  bhr: { gridColumn: "1/9",   gridRow: "6/10" },  // House ad — full left block 8"×4"
};

// ─── Cell scaling system ─────────────────────────────────────────────────────
// Each cell renders its content at a known "natural" pixel size (1 grid unit
// = 100 px = 1 inch), then a single CSS transform: scale() shrinks/grows the
// whole inner DOM to fit the actual rendered cell. This way ads, available
// spot indicators, paid ads, and house ads all scale uniformly with the
// postcard — fonts, padding, borders, everything stays in proportion.
const PX_PER_CELL = 100;
const NATURAL_GRID_W = 12 * PX_PER_CELL; // 1200px
const PostcardScaleContext = createContext(1);

function parseSpan(s) {
  const [a, b] = s.split("/").map(Number);
  return b - a;
}

// ScaledCell: place at gridColumn/gridRow, then render children inside an
// absolutely-positioned, naturally-sized wrapper that's transform-scaled.
function ScaledCell({ pos, children, pointerEvents }) {
  const scale = useContext(PostcardScaleContext);
  const cols = parseSpan(pos.gridColumn);
  const rows = parseSpan(pos.gridRow);
  const natW = cols * PX_PER_CELL;
  const natH = rows * PX_PER_CELL;
  return (
    <div style={{
      gridColumn: pos.gridColumn,
      gridRow: pos.gridRow,
      position: "relative",
      overflow: "hidden",
      minWidth: 0,
      minHeight: 0,
      pointerEvents: pointerEvents || "auto",
    }}>
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: natW,
        height: natH,
        transformOrigin: "top left",
        transform: `scale(${scale})`,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.10)",
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── Permanent house / self-promotion ad ─────────────────────────────────────
function HouseAd() {
  return (
    <div style={{
      width: "100%", height: "100%",
      background: "linear-gradient(160deg,#0f1923 0%,#1a2a3a 100%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "sans-serif", padding: "6px 5px",
      boxSizing: "border-box", gap: 2.5, overflow: "hidden",
    }}>
      <div style={{ width: "72%", height: 2, background: "#991b1b", borderRadius: 1 }} />
      <div style={{ color: "#fff", fontWeight: 900, fontSize: 9,
        textAlign: "center", lineHeight: 1.15, letterSpacing: 0.3 }}>
        Shop, Dine<br />&amp; Buy Local
      </div>
      <div style={{ color: "rgba(255,255,255,0.52)", fontSize: 6.5,
        textAlign: "center", letterSpacing: 0.8, textTransform: "uppercase" }}>
        Your Ad Here
      </div>
      <div style={{ color: "#fff", fontWeight: 800, fontSize: 8,
        textAlign: "center", fontFamily: "Georgia,serif", lineHeight: 1.1 }}>
        My Town Postcard
      </div>
      <div style={{ color: "#991b1b", fontSize: 7, fontWeight: 700 }}>
        mytownpostcard.com
      </div>
      <div style={{
        border: "1.5px dashed rgba(255,255,255,0.3)", borderRadius: 3,
        padding: "3px 7px", display: "flex", alignItems: "center", gap: 3,
      }}>
        <div style={{
          width: 12, height: 12,
          border: "1.5px solid rgba(255,255,255,0.45)",
          borderRadius: 2, flexShrink: 0,
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr", gap: 1.5, padding: 1.5,
          boxSizing: "border-box",
        }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ background: "rgba(255,255,255,0.4)", borderRadius: 0.5 }} />
          ))}
        </div>
        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 6 }}>QR Code</div>
      </div>
      <div style={{ width: "72%", height: 2, background: "#991b1b", borderRadius: 1 }} />
    </div>
  );
}

// Module-level in-memory cache for ad image data (base64).
// Survives SPA navigation between checkout steps without exhausting the
// sessionStorage quota. Lost on full page reload, which is acceptable —
// the upload page collects images again at that point.
export const AD_IMAGE_CACHE = new Map();

export default function PostcardPickerSection() {
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState(null);
  const [creatorSpot, setCreatorSpot] = useState(null);
  const [reserveError, setReserveError] = useState(null);
  // Which face of the postcard the customer is currently viewing/buying.
  // Both sides share the SAME reservation + payment flow — only the spot id
  // matters server-side, the front/back distinction is purely a layout
  // partition for the picker.
  const [side, setSide] = useState("front");

  // ResizeObserver on the grid container computes ONE scale value for the
  // entire postcard. Every cell uses this same scale via PostcardScaleContext
  // because the natural sizes are derived from grid units, so all cells
  // share the same scale factor regardless of how many cols/rows they span.
  const gridRef = useRef(null);
  const [postcardScale, setPostcardScale] = useState(1);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setPostcardScale(entry.contentRect.width / NATURAL_GRID_W);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Active hold (if any) for THIS browser, used to surface a "resume checkout"
  // banner so customers who closed the checkout tab can pick up where they
  // left off before the 30-min hold expires.
  const [activeHold, setActiveHold] = useState(() => findActiveReservation());

  const { data: campaign, isLoading } = useGetActiveCampaign();
  const reserveMutation = useReserveSpot();

  // Re-check the active hold every 30s and on every campaign refresh — that
  // way if the server already swept it (or we passed the expiry) the banner
  // disappears without needing a reload.
  useEffect(() => {
    const tick = () => {
      const found = findActiveReservation();
      if (!found) {
        setActiveHold(null);
        return;
      }
      // If the campaign already shows this spot as no longer reserved
      // (server sweeper won the race, or the customer paid in another tab),
      // drop the storage entry too.
      const matching = campaign?.spots?.find((s) => s.id === found.spotId);
      if (matching && matching.status !== "reserved") {
        clearReservation(found.spotId);
        setActiveHold(null);
        return;
      }
      setActiveHold(found);
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [campaign]);

  if (isLoading) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", fontFamily: "sans-serif", color: "#6b7280" }}>
        Loading postcard preview…
      </div>
    );
  }

  if (!campaign) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", fontFamily: "sans-serif", color: "#6b7280" }}>
        No active campaign found.
      </div>
    );
  }

  const allSpots = campaign.spots || [];
  // Older rows that pre-date the side column come back without it set; treat
  // those as front-side so existing campaigns keep rendering correctly.
  const sideSpots = allSpots.filter((s) => (s.side ?? "front") === side);
  const orderForSide = side === "back" ? BACK_GRID_ORDER : FRONT_GRID_ORDER;
  const sortedSpots = [...sideSpots].sort((a, b) => {
    const ai = orderForSide.indexOf(a.gridArea);
    const bi = orderForSide.indexOf(b.gridArea);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // Quick stats for the toggle pill — only count spots that are actually
  // rendered in the grid (have a GRID_POSITIONS entry). Orphaned DB rows
  // (spots whose gridArea was retired from the layout) are excluded so the
  // "X of Y spots sold" numbers match what the customer sees on screen.
  const sideStats = (target) => {
    const spotsForSide = allSpots.filter(
      (s) => (s.side ?? "front") === target && !!GRID_POSITIONS[s.gridArea],
    );
    const sold = spotsForSide.filter(
      (s) => s.status === "paid" || s.status === "reserved",
    ).length;
    return { total: spotsForSide.length, sold };
  };
  const frontStats = sideStats("front");
  const backStats = sideStats("back");

  const handleAdComplete = async (payload) => {
    setReserveError(null);
    try {
      const result = await reserveMutation.mutateAsync({
        id: creatorSpot.id,
        data: {
          businessName: payload.businessName,
          businessCategory: payload.industry,
          contactEmail: payload.email,
          contactPhone: payload.phone || undefined,
          website: payload.website || undefined,
        },
      });

      // Persist the ad design data so checkout/upload pages can use it later.
      // Only store small text (templateId + adData) in sessionStorage; base64
      // images can easily blow the 5–10MB sessionStorage quota, so we cache
      // them in module-level memory instead (survives SPA navigation, lost on
      // full reload — the upload page will re-collect them in that case).
      try {
        const { sizeKey, price, template, photo, logo, ...adFields } = payload;
        sessionStorage.setItem(
          `localspot:ad:${result.id}`,
          JSON.stringify({
            templateId: template,
            adData: adFields,
          })
        );
      } catch {
        // sessionStorage may be unavailable — non-fatal
      }
      AD_IMAGE_CACHE.set(result.id, payload.photo);

      // Stash the 30-min hold so the CheckoutPage countdown banner and the
      // picker's "resume checkout" banner can both find it after a reload.
      // Server is still source of truth — this is just so we know which
      // spot belongs to this browser tab.
      if (result.expiresAt) {
        saveReservation(result.id, result.expiresAt, result.businessName);
      }

      setCreatorSpot(null);
      setSelected(null);
      navigate(`/checkout/${result.id}`);
    } catch (err) {
      const apiMessage = typeof err?.data === "object" && err?.data !== null ? err.data.error : null;
      const status = err?.status;
      let friendly;
      if (apiMessage) {
        friendly = apiMessage;
      } else if (status === 404) {
        friendly = "Could not reach the reservation server. Please refresh and try again.";
      } else if (status >= 500) {
        friendly = "Server error. Please try again in a moment.";
      } else {
        friendly = err?.message || "Something went wrong. Please try again.";
      }
      setReserveError(friendly);
    }
  };

  const openCreator = (spot) => {
    setSelected(spot);
    setCreatorSpot(spot);
    setReserveError(null);
  };

  const closeCreator = () => {
    if (reserveMutation.isPending) return;
    setCreatorSpot(null);
    setSelected(null);
    setReserveError(null);
  };

  // Cells on the active grid that are *not* sellable spots — they always
  // render fixed UI (house ads, EDDM block) instead of going through the
  // PaidAd / AvailableSpot path.
  const renderFixedCell = (area) => {
    // Front side has no fixed cells — every inch is a paid spot.
    if (side === "front") return null;
    // Back side
    if (area === "bhs") return <HouseAdVertical />;
    if (area === "bhr") return <HouseAdRow />;
    if (area === "bhn") return <HouseAdBanner campaign={campaign} />;
    if (area === "ed") return <EDDMBox />;
    return null;
  };

  // Front side has no fixed (non-sellable) cells — 100% paid coverage.
  // Back side: bhr covers the full 8"×4" house-ad block; ed is the USPS EDDM placeholder.
  const fixedAreas = side === "front" ? [] : ["bhr", "ed"];

  const sideButtonStyle = (active) => ({
    border: "none",
    cursor: "pointer",
    padding: "11px 32px",
    borderRadius: 11,
    background: active ? "linear-gradient(135deg,#991b1b,#7f1d1d)" : "transparent",
    color: active ? "#fff" : "#64748b",
    fontWeight: 700,
    fontSize: 14,
    fontFamily: "sans-serif",
    transition: "all 0.2s",
    lineHeight: 1.4,
    boxShadow: active ? "0 3px 10px rgba(127,29,29,0.4)" : "none",
  });

  return (
    <div style={{ fontFamily: "sans-serif" }}>
      {/* Active hold banner — only shown if THIS browser reserved a spot
          and the 30-min hold hasn't lapsed yet. Lets the customer jump
          straight back to /checkout/<id> without picking again. */}
      {activeHold && (
        <div
          role="status"
          style={{
            background: "#f0fdf4",
            border: "1px solid #86efac",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            fontSize: 13.5,
            color: "#15803d",
          }}
        >
          <span>
            ⏱️ You have a spot held for{" "}
            <strong>{activeHold.businessName || "your business"}</strong>.
            Finish payment before it expires.
          </span>
          <button
            onClick={() => navigate(`/checkout/${activeHold.spotId}`)}
            style={{
              background: "#15803d",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Resume checkout →
          </button>
        </div>
      )}

      {/* Front / Back toggle — large pill so customers immediately see they
          can advertise on either face of the postcard. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "#6b7280",
            fontWeight: 700,
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          Choose a side to advertise on
        </div>
        <div
          role="tablist"
          aria-label="Postcard side"
          style={{
            background: "#fff",
            borderRadius: 14,
            padding: 5,
            display: "flex",
            gap: 4,
            boxShadow: "0 1px 8px rgba(0,0,0,0.10)",
          }}
        >
          {[
            { id: "front", e: "📮", l: "Front Side", stats: frontStats },
            { id: "back",  e: "📬", l: "Back Side",  stats: backStats  },
          ].map(s => (
            <button
              key={s.id}
              role="tab"
              aria-selected={side === s.id}
              onClick={() => { setSide(s.id); setSelected(null); }}
              style={sideButtonStyle(side === s.id)}
            >
              <span style={{ fontSize: 16, marginRight: 6 }}>{s.e}</span>{s.l}
              <br />
              <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>
                {s.stats.sold} of {s.stats.total} spots sold
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Label chip — sits above the card like the reference's "FRONT SIDE —
          12" × 9"…" badge. Plain dark pill, centered. */}
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <span style={{
          display: "inline-block",
          background: "#1e293b", color: "rgba(255,255,255,0.65)",
          fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
          textTransform: "uppercase", padding: "4px 14px", borderRadius: 20,
        }}>
          {side === "front" ? "Front" : "Back"} Side &mdash; 12&Prime; &times; 9&Prime; &middot; Reaching {campaign.homesCount?.toLocaleString() ?? "5,000"} Habersham County Homes
        </span>
      </div>

      {/* Postcard card — boxShadow layer 1: 7px gray mat border; layer 2:
          thin dark outline; layers 3–4: drop shadow. Background #c8c8c8
          shows through gap: 7 between cells as equal-width dividing lines. */}
      <div ref={gridRef} style={{
        position: "relative",
        width: "100%",
        maxWidth: 1000,
        height: `${9 * PX_PER_CELL * postcardScale}px`,
        background: "#c8c8c8",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 0 0 7px #c8c8c8, 0 0 0 8px #b0b0b0, 0 16px 56px rgba(0,0,0,0.32), 0 4px 12px rgba(0,0,0,0.16)",
      }}>

        {/* Postcard grid — fills the container; gap: 7 lets the #c8c8c8
            background show through as dividing lines matching the border. */}
        <PostcardScaleContext.Provider value={postcardScale}>
          <div style={{
            position: "absolute", inset: 0,
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            gridTemplateRows: "repeat(9, 1fr)",
            gap: 7,
            background: "#c8c8c8",
            boxSizing: "border-box",
            overflow: "hidden",
          }}>
              {sortedSpots.map(spot => {
                const isSelected = selected?.id === spot.id;
                // mb is seeded as "paid" but we render it as a sample AdXL so it
                // reads like a real advertiser's ad rather than the generic paid-ad renderer.
                const isPaid = spot.status === "paid" && spot.gridArea !== "mb";
                const isReserved = spot.status === "reserved" && spot.gridArea !== "mb";
                const sampleKey = SPOT_SAMPLE_MAP[spot.gridArea];
                const sampleContent = !isPaid && !isReserved && sampleKey
                  ? getSampleAd(sampleKey, SIZE_MAP[spot.size] || "S")
                  : null;
                const pos = GRID_POSITIONS[spot.gridArea];
                if (!pos) return null;

                return (
                  <ScaledCell key={spot.id} pos={pos}>
                    {isPaid ? (
                      <PaidAd spot={spot} />
                    ) : isReserved ? (
                      <ReservedSpot spot={spot} />
                    ) : sampleContent ? (
                      <div style={{ position: "relative", width: "100%", height: "100%", cursor: "default" }}>
                        {sampleContent}
                      </div>
                    ) : (
                      <AvailableSpot
                        spot={spot}
                        isSelected={isSelected}
                        onClick={() => openCreator(spot)}
                      />
                    )}
                  </ScaledCell>
                );
              })}
              {/* Fixed (non-sellable) cells: house ads on both sides, plus the
                  USPS EDDM placeholder on the back. No click, not counted. */}
              {fixedAreas.map((area) => {
                const pos = GRID_POSITIONS[area];
                if (!pos) return null;
                return (
                  <ScaledCell key={area} pos={pos} pointerEvents="none">
                    {renderFixedCell(area)}
                  </ScaledCell>
                );
              })}
          </div>
        </PostcardScaleContext.Provider>

      </div>

      {/* Legend — three states matching reference colors exactly */}
      <div style={{ display: "flex", gap: 28, marginTop: 14, justifyContent: "center",
        flexWrap: "wrap" }}>
        {[
          { bg: "linear-gradient(135deg,#f8fffe,#f0fdf4)", border: "2px solid #4ade80", label: "Available — click to reserve" },
          { bg: "#fefce8",                                  border: "2px dashed #fbbf24", label: "Reserved" },
          { bg: "#f1f5f9",                                  border: "2px solid #cbd5e1",  label: "Spot taken" },
        ].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 20, height: 20, background: l.bg, border: l.border,
              borderRadius: 4, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Ad Generator */}
      {creatorSpot && (
        <AdGenerator
          initialSize={SIZE_MAP[creatorSpot.size] || "S"}
          onComplete={handleAdComplete}
          onClose={closeCreator}
          isLoading={reserveMutation.isPending}
          error={reserveError}
        />
      )}
    </div>
  );
}
