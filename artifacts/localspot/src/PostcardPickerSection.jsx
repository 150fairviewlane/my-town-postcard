import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useGetActiveCampaign, useReserveSpot } from "@workspace/api-client-react";
import {
  saveReservation,
  findActiveReservation,
  clearReservation,
} from "./lib/reservationStorage";
import { GRID_AREAS, PaidAd, AvailableSpot } from "./postcardCore";
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

  // Postcard natural dimensions: 12" × 9" at 56 px/inch.
  const POSTCARD_W = 672;
  const POSTCARD_H = 504;
  // Scale the postcard to fit the available container width on narrow screens.
  const gridContainerRef = useRef(null);
  const [postcardScale, setPostcardScale] = useState(1);
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setPostcardScale(Math.min(1, w / POSTCARD_W));
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

      {/* Postcard card */}
      <div style={{ background: "#000", borderRadius: 12, padding: "10px 10px 6px",
        boxShadow: "0 16px 56px rgba(0,0,0,0.18)", position: "relative" }}>

        {/* Label chip */}
        <div style={{ position: "absolute", top: -13, left: 20, background: "#111", color: "#fff",
          fontSize: 9, fontWeight: 700, letterSpacing: 1.5, padding: "3px 14px",
          borderRadius: 20, textTransform: "uppercase" }}>
          {side === "front" ? "Front Side" : "Back Side"} — 12" × 9" · Reaching {campaign.homesCount?.toLocaleString() ?? "5,000"} Homes
        </div>

        {/* Red header bar */}
        <div style={{ background: "linear-gradient(90deg,#7f1d1d,#991b1b)", borderRadius: "6px 6px 0 0",
          padding: "6px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 3 }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: "Georgia,serif" }}>
            📮 My Town Postcard · {side === "back" ? "Back Side" : "Front Side"}
          </div>
          <div style={{ color: "#fca5a5", fontSize: 9 }}>
            Reaching {campaign.homesCount?.toLocaleString()} Local Homes · Summer 2026
          </div>
        </div>

        {/* Postcard grid — 12:9 landscape, proportionally accurate.
            Natural size: 672 × 504 px (56 px/inch × 12" × 9").
            On narrow viewports a ResizeObserver scales the postcard down
            via transform: scale() so it always fits without horizontal scroll
            while preserving the exact 12:9 aspect ratio. */}
        <div ref={gridContainerRef} style={{ width: "100%", overflow: "hidden" }}>
          <div style={{
            width: POSTCARD_W,
            height: POSTCARD_H,
            transformOrigin: "top left",
            transform: `scale(${postcardScale})`,
            marginBottom: postcardScale < 1 ? -(POSTCARD_H * (1 - postcardScale)) : 0,
          }}>
            <div style={{
              width: POSTCARD_W,
              height: POSTCARD_H,
              display: "grid",
              gridTemplateColumns: "repeat(12, 1fr)",
              gridTemplateRows: "repeat(9, 1fr)",
              gridTemplateAreas: side === "back" ? BACK_GRID_AREAS : GRID_AREAS,
              gap: 1,
              background: "rgba(0,0,0,0.15)",
              border: "1px solid #ccc",
              boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
              boxSizing: "border-box",
            }}>
              {sortedSpots.map(spot => {
                const isSelected = selected?.id === spot.id;
                const isPaid = (spot.status === "paid" || spot.status === "reserved") && spot.gridArea !== "mb";
                const sampleKey = SPOT_SAMPLE_MAP[spot.gridArea];
                const sampleContent = !isPaid && sampleKey
                  ? getSampleAd(sampleKey, SIZE_MAP[spot.size] || "S")
                  : null;

                return (
                  <div key={spot.id} style={{ gridArea: spot.gridArea, overflow: "hidden",
                    minWidth: 0, minHeight: 0 }}>
                    {isPaid ? (
                      <PaidAd spot={spot} />
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
                  </div>
                );
              })}
              {/* Fixed (non-sellable) cells: house ads on both sides, plus the
                  USPS EDDM placeholder on the back. No click, not counted. */}
              {fixedAreas.map((area) => (
                <div
                  key={area}
                  style={{
                    gridArea: area,
                    overflow: "hidden",
                    minWidth: 0,
                    minHeight: 0,
                    cursor: "default",
                    pointerEvents: "none",
                  }}
                >
                  {renderFixedCell(area)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* EDDM footer strip — visual reminder on the picker, the real
            indicia lives in the EDDM box on the back side itself. */}
        <div style={{ marginTop: 3, padding: "3px 12px", background: "#000",
          borderRadius: "0 0 6px 6px", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontSize: 7.5, color: "#666" }}>LOCAL POSTAL CUSTOMER · EDDM</div>
          <div style={{ fontSize: 7.5, color: "#666" }}>
            PRESORTED STD · U.S. POSTAGE PAID · CLARKESVILLE GA {campaign.zipCode}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, marginTop: 10, justifyContent: "center", flexWrap: "wrap" }}>
        {[
          { bg: "#f0fdf4", border: "2px dashed #22c55e", label: "Available — click to reserve" },
          { bg: "#fef9c3", border: "2px solid #ca8a04",  label: "Your selection" },
          { bg: "#f3f4f6", border: "1px solid #e5e7eb",  label: "Spot taken" },
        ].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 22, height: 14, background: l.bg, border: l.border,
              borderRadius: 3, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: "#6b7280" }}>{l.label}</span>
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
