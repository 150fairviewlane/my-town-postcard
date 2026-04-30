import { useState } from "react";
import { useLocation } from "wouter";
import { useGetActiveCampaign, useReserveSpot } from "@workspace/api-client-react";
import { GRID_AREAS, PaidAd, AvailableSpot } from "./postcardCore";
import AdGenerator from "./AdGenerator";
import { getSampleAd, SPOT_SAMPLE_MAP } from "./PostcardSampleAds";

const SIZE_MAP = { xl: "XL", large: "L", medium: "M", small: "S" };

const GRID_ORDER = ["mb","dn","re","hv","ins","pz","lw","a1","a2","a3"];

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
  const [hoveredSpot, setHoveredSpot] = useState(null);

  const { data: campaign, isLoading } = useGetActiveCampaign();
  const reserveMutation = useReserveSpot();

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

  const spots = campaign.spots || [];
  const sortedSpots = [...spots].sort((a, b) =>
    (GRID_ORDER.indexOf(a.gridArea) ?? 99) - (GRID_ORDER.indexOf(b.gridArea) ?? 99)
  );

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

  return (
    <div style={{ fontFamily: "sans-serif" }}>
      {/* Postcard card */}
      <div style={{ background: "#000", borderRadius: 12, padding: "10px 10px 6px",
        boxShadow: "0 16px 56px rgba(0,0,0,0.18)", position: "relative" }}>

        {/* Label chip */}
        <div style={{ position: "absolute", top: -13, left: 20, background: "#111", color: "#fff",
          fontSize: 9, fontWeight: 700, letterSpacing: 1.5, padding: "3px 14px",
          borderRadius: 20, textTransform: "uppercase" }}>
          Live Postcard Preview · 9" × 12" Horizontal · 1 unit = 1 inch
        </div>

        {/* Red header bar */}
        <div style={{ background: "linear-gradient(90deg,#7f1d1d,#991b1b)", borderRadius: "6px 6px 0 0",
          padding: "6px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 3 }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: "Georgia,serif" }}>
            📮 Clarkesville Community Mailer
          </div>
          <div style={{ color: "#fca5a5", fontSize: 9 }}>
            Reaching {campaign.homesCount?.toLocaleString()} Local Homes · Spring 2026
          </div>
        </div>

        {/* The postcard grid — 12:9 landscape ratio */}
        <div style={{
          width: "100%",
          aspectRatio: "12 / 9",
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gridTemplateRows: "repeat(9, 1fr)",
          gridTemplateAreas: GRID_AREAS,
          gap: "10px",
          background: "#000",
        }}>
          {sortedSpots.map(spot => {
            const isSelected = selected?.id === spot.id;
            const isHovered = hoveredSpot === spot.id;
            const isPaid = spot.status === "paid" || spot.status === "reserved";
            const sampleKey = SPOT_SAMPLE_MAP[spot.gridArea];
            const sampleContent = !isPaid && sampleKey
              ? getSampleAd(sampleKey, SIZE_MAP[spot.size] || "S")
              : null;

            return (
              <div key={spot.id} style={{ gridArea: spot.gridArea, overflow: "hidden", borderRadius: 0,
                minWidth: 0, minHeight: 0 }}>
                {isPaid ? (
                  <PaidAd spot={spot} />
                ) : sampleContent ? (
                  <div
                    style={{ position: "relative", width: "100%", height: "100%", cursor: "pointer",
                      outline: isSelected ? "2px solid #ca8a04" : "none", outlineOffset: "-2px" }}
                    onClick={() => openCreator(spot)}
                    onMouseEnter={() => setHoveredSpot(spot.id)}
                    onMouseLeave={() => setHoveredSpot(null)}
                  >
                    <div style={{ position: "absolute", inset: 0, opacity: 0.92 }}>
                      {sampleContent}
                    </div>
                    <div style={{
                      position: "absolute", inset: 0,
                      background: isSelected ? "rgba(0,160,0,0.22)" : "rgba(0,160,0,0.15)",
                      opacity: isHovered || isSelected ? 1 : 0,
                      transition: "opacity 0.2s",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      pointerEvents: "none",
                    }}>
                      <div style={{
                        background: "#16a34a", color: "#fff", fontWeight: 800,
                        fontSize: 11, padding: "6px 14px", borderRadius: 20,
                        boxShadow: "0 2px 12px rgba(0,0,0,0.35)", letterSpacing: 0.5,
                        fontFamily: "sans-serif",
                      }}>
                        Reserve This Spot
                      </div>
                    </div>
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
          {/* Permanent house ad — not a sellable spot, no click, not counted */}
          <div style={{ gridArea: "hs", overflow: "hidden", borderRadius: 0,
            minWidth: 0, minHeight: 0, cursor: "default", pointerEvents: "none" }}>
            <HouseAd />
          </div>
        </div>

        {/* EDDM footer strip */}
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
