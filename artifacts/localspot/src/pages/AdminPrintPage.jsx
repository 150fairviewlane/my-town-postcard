import { useState, useEffect } from "react";
import { useParams } from "wouter";
import {
  useGetActiveCampaign,
  useGetAdminCampaignById,
  getGetAdminCampaignByIdQueryKey,
} from "@workspace/api-client-react";
import { GRID_AREAS, PaidAd } from "../postcardCore";
import {
  BACK_GRID_AREAS,
  BACK_GRID_ORDER,
  HouseAdVertical,
  EDDMBox,
} from "../postcardBack";
import { getSampleAd, SPOT_SAMPLE_MAP } from "../PostcardSampleAds";

const SIZE_MAP = { xl: "XL", large: "L", medium: "M", small: "S" };

// Same render order as the picker so each side lays out identically.
const FRONT_GRID_ORDER = ["mb", "dn", "re", "l1", "l2", "l3", "l4"];

// Filler shown in print for unsold spots that don't have a sample ad mapped.
// Neutral, prints cleanly, signals to the press operator that the slot was
// unsold (so they don't think the file is corrupted).
function UnsoldSlot() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#f9fafb",
        border: "1px dashed #d1d5db",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#9ca3af",
        fontFamily: "sans-serif",
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 1.5,
        boxSizing: "border-box",
      }}
    >
      Unsold
    </div>
  );
}

// Render a single side of the postcard at exactly 12in × 9in on print.
// Both invocations share the same primitives (PaidAd, sample ads, unsold
// filler) so the print fidelity is identical between front and back.
function PostcardFace({ side, spots, gridAreas, gridOrder, fixedAreas, renderFixed, label }) {
  const sortedSpots = [...spots].sort((a, b) => {
    const ai = gridOrder.indexOf(a.gridArea);
    const bi = gridOrder.indexOf(b.gridArea);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return (
    <div className="ls-print-page-wrapper">
      {/* On-screen label so the admin knows which face they're previewing.
          Hidden in print so each printed page is just the postcard. */}
      <div
        className="ls-no-print"
        style={{
          maxWidth: 1200,
          margin: "0 auto 8px",
          fontFamily: "sans-serif",
          fontSize: 12,
          fontWeight: 800,
          color: "#374151",
          letterSpacing: 1.5,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>

      <div
        className="ls-print-page"
        data-side={side}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gridTemplateRows: "repeat(9, 1fr)",
          gridTemplateAreas: gridAreas,
          gap: "7px",
          padding: "7px",
          background: "#c8c8c8",
          overflow: "hidden",
        }}
      >
        {sortedSpots.map((spot) => {
          const isPaid = spot.status === "paid" || spot.status === "reserved";
          const sampleKey = SPOT_SAMPLE_MAP[spot.gridArea];

          let content;
          if (isPaid) {
            content = <PaidAd spot={spot} />;
          } else if (sampleKey) {
            content = getSampleAd(sampleKey, SIZE_MAP[spot.size] || "S");
          } else if (side === "front") {
            content = <HouseAdVertical />;
          } else {
            content = <UnsoldSlot />;
          }

          return (
            <div
              key={spot.id}
              style={{
                gridArea: spot.gridArea,
                overflow: "hidden",
                borderRadius: 3,
                minWidth: 0,
                minHeight: 0,
              }}
            >
              {content}
            </div>
          );
        })}

        {/* Fixed (non-sellable) cells — house ad strip and EDDM block on back. */}
        {fixedAreas.map((area) => (
          <div
            key={area}
            style={{
              gridArea: area,
              overflow: "hidden",
              borderRadius: 3,
              minWidth: 0,
              minHeight: 0,
            }}
          >
            {renderFixed(area)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminPrintPage() {
  const params = useParams();
  const campaignIdFromUrl = params.id;
  const numericId = campaignIdFromUrl ? Number(campaignIdFromUrl) : NaN;
  const hasValidId = Number.isFinite(numericId) && numericId > 0;

  // Token state — mirrors AdminDashboard so the print page can auto-login
  // when opened in a new tab where localStorage may not yet have a token
  // (e.g. direct link, expired token, or first visit).
  const [adminToken, setAdminToken] = useState(() => {
    if (typeof window === "undefined") return null;
    const urlTok = new URLSearchParams(window.location.search).get("tok");
    if (urlTok) {
      localStorage.setItem("admin_token", urlTok);
      return urlTok;
    }
    return localStorage.getItem("admin_token");
  });

  useEffect(() => {
    if (adminToken) return;
    fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "localspot-admin-2025" }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.token) {
          localStorage.setItem("admin_token", d.token);
          setAdminToken(d.token);
        }
      })
      .catch(() => {});
  }, [adminToken]);

  // When the URL carries a campaign id (e.g. /admin/campaign/2/print) load
  // that specific campaign through the admin endpoint so any campaign — not
  // just the live "active" one — can be print-previewed. Falls back to the
  // public active-campaign endpoint when no id is present so the legacy
  // /admin/print URL keeps working.
  const adminAuth = adminToken
    ? {
        meta: { headers: { Authorization: `Bearer ${adminToken}` } },
        request: { headers: { Authorization: `Bearer ${adminToken}` } },
      }
    : {};

  const adminQuery = useGetAdminCampaignById(hasValidId ? numericId : 0, {
    query: {
      enabled: hasValidId && !!adminToken,
      queryKey: hasValidId ? getGetAdminCampaignByIdQueryKey(numericId) : [],
      ...adminAuth,
    },
    ...adminAuth,
  });
  const activeQuery = useGetActiveCampaign({
    query: { enabled: !hasValidId },
  });

  const [pdfLoading, setPdfLoading] = useState(null); // "front" | "back" | "both" | null

  // While waiting for auto-login to complete, treat the page as loading.
  const tokenPending = hasValidId && !adminToken;
  const isLoading = tokenPending || (hasValidId ? adminQuery.isLoading : activeQuery.isLoading);
  const error = hasValidId ? adminQuery.error : activeQuery.error;
  // Both endpoints return slightly different shapes:
  //   - public /campaigns/active → CampaignWithSpots (campaign + spots merged)
  //   - admin  /admin/campaigns/:id → { campaign, spots, … }
  // Normalize to a single shape for the renderer below.
  const campaign = hasValidId
    ? adminQuery.data
      ? { ...adminQuery.data.campaign, spots: adminQuery.data.spots }
      : null
    : activeQuery.data;

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#6b7280", fontFamily: "sans-serif" }}>
        Loading print view…
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#991b1b", fontFamily: "sans-serif" }}>
        Could not load campaign.
      </div>
    );
  }

  const allSpots = campaign.spots || [];
  // Older spots without the side column come back as undefined — treat those
  // as front-side so existing campaigns keep printing correctly.
  const frontSpots = allSpots.filter((s) => (s.side ?? "front") === "front");
  const backSpots = allSpots.filter((s) => s.side === "back");

  const renderBackFixed = (area) => {
    if (area === "bhs") return <HouseAdVertical />;
    if (area === "bed") return <EDDMBox />;
    return null;
  };

  const downloadPdf = async (side) => {
    if (!hasValidId) return;
    setPdfLoading(side);
    try {
      const tok = adminToken ? `&tok=${encodeURIComponent(adminToken)}` : "";
      const response = await fetch(
        `/api/admin/campaigns/${numericId}/download-pdf?side=${side}${tok}`,
      );
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Server error ${response.status}: ${text}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `postcard-campaign-${numericId}-${side}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      alert("PDF download failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPdfLoading(null);
    }
  };

  return (
    <>

      {/*
        Print stylesheet. The layout is dual-mode:
          - on screen: each postcard scales to viewport at 12:9 aspect ratio
          - on print:  each postcard is forced to exactly 12in × 9in landscape
                       so it fills one page edge-to-edge with no margins.
                       Front and back are separated by a forced page break so
                       the printer / Save-as-PDF produces a 2-page file.

        -webkit-print-color-adjust / print-color-adjust: exact ensures
        backgrounds, gradients, and photos print at full color/opacity instead
        of being stripped by the browser's "economy mode" defaults.
      */}
      <style>{`
        @media screen {
          .ls-print-page {
            width: 100%;
            max-width: 1200px;
            aspect-ratio: 12 / 9;
            margin: 0 auto;
          }
          .ls-print-page-wrapper + .ls-print-page-wrapper {
            margin-top: 32px;
          }
        }

        @media print {
          @page {
            size: 12in 9in;
            margin: 0;
          }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          .ls-no-print {
            display: none !important;
          }

          .ls-print-shell {
            padding: 0 !important;
            background: #ffffff !important;
            min-height: 0 !important;
          }

          .ls-print-page-wrapper {
            page-break-after: always;
            break-after: page;
          }
          /* Don't append a blank trailing page after the last side. */
          .ls-print-page-wrapper:last-child {
            page-break-after: auto;
            break-after: auto;
          }

          .ls-print-page {
            width: 12in !important;
            height: 9in !important;
            max-width: none !important;
            aspect-ratio: auto !important;
            margin: 0 !important;
            page-break-inside: avoid;
            break-inside: avoid;
          }

          /* Force every element to print backgrounds and colors exactly. */
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          /* Photos at the highest quality the browser can render. */
          img {
            image-rendering: -webkit-optimize-contrast;
          }
        }
      `}</style>

      <div
        className="ls-print-shell"
        style={{ minHeight: "100vh", background: "#f3f4f6", padding: "24px" }}
      >
        {/* Toolbar — hidden in print so the printed page is just the postcard. */}
        <div
          className="ls-no-print"
          style={{
            maxWidth: 1200,
            margin: "0 auto 14px",
            background: "#fff",
            borderRadius: 10,
            padding: "14px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: "sans-serif",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 16, color: "#111", fontFamily: "Georgia,serif" }}>
              📮 Print-Ready Postcard
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
              {campaign.name} · {campaign.territory}
              {campaignIdFromUrl ? ` · Campaign #${campaignIdFromUrl}` : ""}
              {" · 2 pages (Front + Back)"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a
              href={`${import.meta.env.BASE_URL}admin`}
              style={{
                background: "#f3f4f6",
                color: "#374151",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: "9px 16px",
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              ← Back to Admin
            </a>
            {hasValidId && (
              <>
                <button
                  onClick={() => downloadPdf("front")}
                  disabled={!!pdfLoading}
                  style={{
                    background: "#1d4ed8",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "9px 16px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: pdfLoading ? "default" : "pointer",
                    opacity: pdfLoading && pdfLoading !== "front" ? 0.5 : 1,
                  }}
                >
                  {pdfLoading === "front" ? "⏳ Generating…" : "📥 Front PDF"}
                </button>
                <button
                  onClick={() => downloadPdf("back")}
                  disabled={!!pdfLoading}
                  style={{
                    background: "#1d4ed8",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "9px 16px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: pdfLoading ? "default" : "pointer",
                    opacity: pdfLoading && pdfLoading !== "back" ? 0.5 : 1,
                  }}
                >
                  {pdfLoading === "back" ? "⏳ Generating…" : "📥 Back PDF"}
                </button>
                <button
                  onClick={() => downloadPdf("both")}
                  disabled={!!pdfLoading}
                  style={{
                    background: "#1e40af",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "9px 16px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: pdfLoading ? "default" : "pointer",
                    opacity: pdfLoading && pdfLoading !== "both" ? 0.5 : 1,
                  }}
                >
                  {pdfLoading === "both" ? "⏳ Generating…" : "📥 Both Sides (2-page)"}
                </button>
              </>
            )}
            <button
              onClick={() => window.print()}
              style={{
                background: "#991b1b",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              🖨 Print
            </button>
          </div>
        </div>

        {/* Bleed note — visible on screen for the admin to read before sending
            to the printer. Hidden in print so it doesn't end up on the press. */}
        <div
          className="ls-no-print"
          style={{
            maxWidth: 1200,
            margin: "0 auto 14px",
            background: "#fef3c7",
            border: "1px solid #fde68a",
            borderRadius: 8,
            padding: "12px 18px",
            fontFamily: "sans-serif",
            fontSize: 13.5,
            color: "#92400e",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <strong>Bleed: 0.125 inches on all sides for the printer.</strong>
            <div style={{ fontSize: 12, marginTop: 2, color: "#a16207" }}>
              Final trim size is 12&quot; × 9&quot; per side. Use the PDF download buttons
              above to get a print-ready file — choose Front, Back, or Both Sides (2-page).
              The USPS EDDM block in the bottom-right of the back page is a
              placeholder; the printer will imprint the live indicia.
            </div>
          </div>
        </div>

        {/* Two faces, two print pages. */}
        <PostcardFace
          side="front"
          spots={frontSpots}
          gridAreas={GRID_AREAS}
          gridOrder={FRONT_GRID_ORDER}
          fixedAreas={[]}
          renderFixed={() => null}
          label="Front"
        />
        <PostcardFace
          side="back"
          spots={backSpots}
          gridAreas={BACK_GRID_AREAS}
          gridOrder={BACK_GRID_ORDER}
          fixedAreas={["bhs", "bed"]}
          renderFixed={renderBackFixed}
          label="Back"
        />
      </div>
    </>
  );
}
