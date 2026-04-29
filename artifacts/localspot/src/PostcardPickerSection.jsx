import { useState } from "react";
import { useLocation } from "wouter";
import { useGetActiveCampaign, useReserveSpot } from "@workspace/api-client-react";
import { GRID_AREAS, PaidAd, AvailableSpot } from "./postcardCore";
import AdCreator from "./AdCreator";

const GRID_ORDER = ["mb","dn","re","hv","ins","pz","lw","a1","a2","a3"];

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
          businessCategory: payload.category,
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
        sessionStorage.setItem(
          `localspot:ad:${result.id}`,
          JSON.stringify({
            templateId: payload.templateId,
            adData: payload.adData,
          })
        );
      } catch {
        // sessionStorage may be unavailable — non-fatal
      }
      AD_IMAGE_CACHE.set(result.id, payload.imageData);

      setCreatorSpot(null);
      setSelected(null);
      navigate(`/checkout/${result.id}`);
    } catch (err) {
      setReserveError(err?.data?.error || err?.message || "Something went wrong. Please try again.");
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
          {sortedSpots.map(spot => (
            <div key={spot.id} style={{ gridArea: spot.gridArea, overflow: "hidden", borderRadius: 0,
              minWidth: 0, minHeight: 0 }}>
              {(spot.status === "paid" || spot.status === "reserved") ? (
                <PaidAd spot={spot} />
              ) : (
                <AvailableSpot
                  spot={spot}
                  isSelected={selected?.id === spot.id}
                  onClick={() => openCreator(spot)}
                />
              )}
            </div>
          ))}
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

      {/* Ad Creator (replaces the old reservation modal) */}
      {creatorSpot && (
        <AdCreator
          spotId={creatorSpot.id}
          spotSize={creatorSpot.size}
          spotPrice={Math.round(creatorSpot.price / 100)}
          onComplete={handleAdComplete}
          onClose={closeCreator}
          isLoading={reserveMutation.isPending}
          error={reserveError}
        />
      )}
    </div>
  );
}
