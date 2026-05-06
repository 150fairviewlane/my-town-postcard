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

const FRONT_GRID_ORDER = ["mb","dn","re","hv","ins","pz","lw","a1","a2","a3"];

// Explicit grid positions for every named area on both sides.
// gridColumn / gridRow use CSS end-exclusive line numbers (e.g. "1/5" = cols 1-4).
// This approach is more reliable than gridTemplateAreas and makes ad placement
// immediately readable: each spot's print dimensions map directly to its col/row span.
const GRID_POSITIONS = {
  // ── Front side ──────────────────────────────────────────────────────────────
  mb:  { gridColumn: "1/5",   gridRow: "1/6"  },  // XL  4"×5"
  dn:  { gridColumn: "5/9",   gridRow: "1/6"  },  // XL  4"×5"
  re:  { gridColumn: "9/13",  gridRow: "1/6"  },  // XL  4"×5"
  hv:  { gridColumn: "1/5",   gridRow: "6/9"  },  // Lg  4"×3"
  ins: { gridColumn: "5/9",   gridRow: "6/9"  },  // Lg  4"×3"
  pz:  { gridColumn: "9/12",  gridRow: "6/8"  },  // Md  3"×2"
  lw:  { gridColumn: "9/12",  gridRow: "8/10" },  // Md  3"×2"
  a1:  { gridColumn: "12/13", gridRow: "6/8"  },  // Sm  1"×2" (1 col remains)
  a2:  { gridColumn: "12/13", gridRow: "8/10" },  // Sm  1"×2"
  hs:  { gridColumn: "1/9",   gridRow: "9/10" },  // House ad — bottom strip
  // ── Back side ───────────────────────────────────────────────────────────────
  bxl: { gridColumn: "1/5",   gridRow: "1/6"  },  // XL  4"×5"
  bl1: { gridColumn: "5/9",   gridRow: "1/4"  },  // Lg  4"×3"
  bl2: { gridColumn: "9/13",  gridRow: "1/4"  },  // Lg  4"×3"
  bm1: { gridColumn: "5/8",   gridRow: "4/6"  },  // Md  3"×2"
  bm2: { gridColumn: "8/11",  gridRow: "4/6"  },  // Md  3"×2"
  bs1: { gridColumn: "5/7",   gridRow: "6/9"  },  // Sm  2"×3"
  bs2: { gridColumn: "7/9",   gridRow: "6/9"  },  // Sm  2"×3"
  ed:  { gridColumn: "9/13",  gridRow: "6/10" },  // EDDM indicia  4"×4"
  bhr: { gridColumn: "1/5",   gridRow: "6/10" },  // House ad — left strip
  bhs: { gridColumn: "11/13", gridRow: "4/6"  },  // House ad — top-right corner
  bhn: { gridColumn: "5/9",   gridRow: "9/10" },  // House ad — bottom banner
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

  // Quick stats for the toggle pill so customers can see at a glance how many
  // spots are still up for grabs on each side.
  const sideStats = (target) => {
    const spotsForSide = allSpots.filter((s) => (s.side ?? "front") === target);
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
    if (side === "front") {
      if (area === "hs") return <HouseAd />;
      return null;
    }
    // Back side
    if (area === "bhs") return <HouseAdVertical />;
    if (area === "bhr") return <HouseAdRow />;
    if (area === "bhn") return <HouseAdBanner campaign={campaign} />;
    if (area === "ed") return <EDDMBox />;
    return null;
  };

  const fixedAreas = side === "front" ? ["hs"] : ["bhs", "bhr", "bhn", "ed"];

  const sideButtonStyle = (active) => ({
    flex: 1,
    border: "none",
    cursor: "pointer",
    padding: "12px 18px",
    borderRadius: 10,
    background: active ? "#991b1b" : "transparent",
    color: active ? "#fff" : "#374151",
    fontWeight: 800,
    fontSize: 14,
    fontFamily: "sans-serif",
    transition: "all 0.15s",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    boxShadow: active ? "0 4px 14px rgba(153,27,27,0.35)" : "none",
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
            display: "flex",
            background: "#f3f4f6",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 5,
            gap: 4,
            width: "100%",
            maxWidth: 480,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          <button
            role="tab"
            aria-selected={side === "front"}
            onClick={() => {
              setSide("front");
              setSelected(null);
            }}
            style={sideButtonStyle(side === "front")}
          >
            <span>📮 Front Side</span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: side === "front" ? "rgba(255,255,255,0.85)" : "#6b7280",
                letterSpacing: 0.3,
              }}
            >
              {frontStats.sold} of {frontStats.total} sold
            </span>
          </button>
          <button
            role="tab"
            aria-selected={side === "back"}
            onClick={() => {
              setSide("back");
              setSelected(null);
            }}
            style={sideButtonStyle(side === "back")}
          >
            <span>📬 Back Side</span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: side === "back" ? "rgba(255,255,255,0.85)" : "#6b7280",
                letterSpacing: 0.3,
              }}
            >
              {backStats.sold} of {backStats.total} sold
            </span>
          </button>
        </div>
      </div>

      {/* Postcard card — white "matte" so the postcard sits on the page like
          a real glossy mailer rather than a tablet bezel. The grid still
          carries the colored chrome inside. */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb",
        borderRadius: 14, padding: "12px 12px 8px",
        boxShadow: "0 24px 60px rgba(15,23,42,0.16), 0 2px 6px rgba(15,23,42,0.06)",
        position: "relative" }}>

        {/* Label chip */}
        <div style={{ position: "absolute", top: -13, left: 22, background: "#111827", color: "#fff",
          fontSize: 9, fontWeight: 700, letterSpacing: 1.5, padding: "4px 14px",
          borderRadius: 20, textTransform: "uppercase",
          boxShadow: "0 4px 10px rgba(0,0,0,0.18)" }}>
          {side === "front" ? "Front Side" : "Back Side"} — 12" × 9" · Reaching {campaign.homesCount?.toLocaleString() ?? "5,000"} Homes
        </div>

        {/* Red header bar */}
        <div style={{ background: "linear-gradient(90deg,#7f1d1d,#991b1b)", borderRadius: "8px 8px 0 0",
          padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 0, borderBottom: "2px solid #fff" }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: "Georgia,serif",
            letterSpacing: 0.2 }}>
            📮 My Town Postcard · {side === "back" ? "Back Side" : "Front Side"}
          </div>
          <div style={{ color: "#fecaca", fontSize: 9, fontFamily: "sans-serif",
            letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 600 }}>
            Reaching {campaign.homesCount?.toLocaleString()} Local Homes · Summer 2026
          </div>
        </div>

        {/* Postcard grid — fluid 12:9 landscape, fills its parent fully.
            Every cell renders content at a fixed natural pixel size
            (1 grid unit = 100 px) and is transform-scaled by PostcardScaleContext
            so all fonts/borders/padding stay proportional at any viewport. */}
        <div style={{ width: "100%" }}>
          <PostcardScaleContext.Provider value={postcardScale}>
            <div ref={gridRef} style={{
              width: "100%",
              aspectRatio: "12 / 9",
              display: "grid",
              gridTemplateColumns: "repeat(12, 1fr)",
              gridTemplateRows: "repeat(9, 1fr)",
              gap: 1,
              background: "rgba(15,23,42,0.08)",
              borderLeft: "1px solid #d1d5db",
              borderRight: "1px solid #d1d5db",
              boxSizing: "border-box",
              overflow: "hidden",
            }}>
              {sortedSpots.map(spot => {
                const isSelected = selected?.id === spot.id;
                // The seeded "mb" Mr. Biscuit's spot is always shown as a
                // finished paid ad — it's our perpetual sponsor demo.
                const isPaid = spot.status === "paid" || spot.gridArea === "mb";
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

        {/* EDDM footer strip — USPS-authentic navy bar with the indicia
            text. Visual reminder on the picker; the real indicia lives in
            the EDDM box on the back side itself. */}
        <div style={{ padding: "5px 14px", background: "#1a1a2e",
          borderRadius: "0 0 8px 8px", display: "flex", justifyContent: "space-between",
          alignItems: "center", borderTop: "2px solid #fff" }}>
          <div style={{ fontSize: 8, color: "#cbd5e1", letterSpacing: 0.8,
            fontFamily: "sans-serif", fontWeight: 600 }}>
            LOCAL POSTAL CUSTOMER · EDDM RETAIL
          </div>
          <div style={{ fontSize: 8, color: "#cbd5e1", letterSpacing: 0.8,
            fontFamily: "sans-serif", fontWeight: 600 }}>
            PRESORTED STD · U.S. POSTAGE PAID · CLARKESVILLE GA {campaign.zipCode}
          </div>
        </div>
      </div>

      {/* Legend — three states the customer might see while scanning the card */}
      <div style={{ display: "flex", gap: 22, marginTop: 14, justifyContent: "center",
        flexWrap: "wrap", padding: "0 8px" }}>
        {[
          { bg: "rgba(240,253,244,0.92)", border: "2px dashed #22c55e", label: "Available — click to claim" },
          { bg: "rgba(254,243,199,0.96)", border: "2px solid #f59e0b",  label: "Your selection" },
          { bg: "#fefce8",                border: "2px dashed #fbbf24", label: "Reserved by another business" },
        ].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 16, background: l.bg, border: l.border,
              borderRadius: 3, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "#4b5563", fontWeight: 500 }}>{l.label}</span>
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
