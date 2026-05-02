import { useParams } from "wouter";
import { useGetActiveCampaign } from "@workspace/api-client-react";
import { GRID_AREAS, PaidAd } from "../postcardCore";
import { getSampleAd, SPOT_SAMPLE_MAP } from "../PostcardSampleAds";

const SIZE_MAP = { xl: "XL", large: "L", medium: "M", small: "S" };

// Same render order as the picker so the grid lays out identically.
const GRID_ORDER = ["mb", "dn", "re", "hv", "ins", "pz", "lw", "a1", "a2", "a3"];

// Permanent house ad — same content as PostcardPickerSection so the printed
// postcard matches what customers see in the live preview. Kept as a local
// copy to avoid widening the export surface of PostcardPickerSection.
function HouseAd() {
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
        fontFamily: "sans-serif",
        padding: "6px 5px",
        boxSizing: "border-box",
        gap: 2.5,
        overflow: "hidden",
      }}
    >
      <div style={{ width: "72%", height: 2, background: "#991b1b", borderRadius: 1 }} />
      <div
        style={{
          color: "#fff",
          fontWeight: 900,
          fontSize: 9,
          textAlign: "center",
          lineHeight: 1.15,
          letterSpacing: 0.3,
        }}
      >
        Shop, Dine<br />&amp; Buy Local
      </div>
      <div
        style={{
          color: "rgba(255,255,255,0.52)",
          fontSize: 6.5,
          textAlign: "center",
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
      >
        Your Ad Here
      </div>
      <div
        style={{
          color: "#fff",
          fontWeight: 800,
          fontSize: 8,
          textAlign: "center",
          fontFamily: "Georgia,serif",
          lineHeight: 1.1,
        }}
      >
        My Town Postcard
      </div>
      <div style={{ color: "#991b1b", fontSize: 7, fontWeight: 700 }}>mytownpostcard.com</div>
      <div style={{ width: "72%", height: 2, background: "#991b1b", borderRadius: 1 }} />
    </div>
  );
}

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

export default function AdminPrintPage() {
  const params = useParams();
  const campaignIdFromUrl = params.id;

  const { data: campaign, isLoading, error } = useGetActiveCampaign();

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

  const spots = campaign.spots || [];
  const sortedSpots = [...spots].sort(
    (a, b) => GRID_ORDER.indexOf(a.gridArea) - GRID_ORDER.indexOf(b.gridArea),
  );

  const handlePrint = () => window.print();

  return (
    <>
      {/*
        Print stylesheet. The layout is dual-mode:
          - on screen: postcard scales to viewport at 12:9 aspect ratio
          - on print:  postcard is forced to exactly 12in × 9in landscape
                       so it fills one page edge-to-edge with no margins.

        -webkit-print-color-adjust / print-color-adjust: exact ensures backgrounds,
        gradients, and photos print at full color/opacity instead of being
        stripped by the browser's "economy mode" defaults.
      */}
      <style>{`
        @media screen {
          .ls-print-page {
            width: 100%;
            max-width: 1200px;
            aspect-ratio: 12 / 9;
            margin: 0 auto;
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

          .ls-print-page {
            width: 12in !important;
            height: 9in !important;
            max-width: none !important;
            aspect-ratio: auto !important;
            margin: 0 !important;
            page-break-after: avoid;
            page-break-inside: avoid;
            break-after: avoid;
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
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
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
            <button
              onClick={handlePrint}
              style={{
                background: "#991b1b",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "9px 18px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              🖨 Print / Save as PDF
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
              Final trim size is 12&quot; × 9&quot;. Use Save as PDF in the print dialog
              and send the PDF to your print vendor.
            </div>
          </div>
        </div>

        {/* The postcard — same grid as PostcardPickerSection. Forced to exactly
            12in × 9in on print via the @media print rules above. */}
        <div
          className="ls-print-page"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            gridTemplateRows: "repeat(9, 1fr)",
            gridTemplateAreas: GRID_AREAS,
            gap: "10px",
            background: "#000",
          }}
        >
          {sortedSpots.map((spot) => {
            // Match the picker's logic exactly: "mb" is the perpetual sponsor
            // demo cell (Mr. Biscuit's) and always renders the sample ad,
            // never the PaidAd dispatcher path, so the printed postcard mirrors
            // what customers see on the live preview.
            const isPaid =
              (spot.status === "paid" || spot.status === "reserved") &&
              spot.gridArea !== "mb";
            const sampleKey = SPOT_SAMPLE_MAP[spot.gridArea];

            let content;
            if (isPaid) {
              content = <PaidAd spot={spot} />;
            } else if (sampleKey) {
              content = getSampleAd(sampleKey, SIZE_MAP[spot.size] || "S");
            } else {
              content = <UnsoldSlot />;
            }

            return (
              <div
                key={spot.id}
                style={{
                  gridArea: spot.gridArea,
                  overflow: "hidden",
                  minWidth: 0,
                  minHeight: 0,
                }}
              >
                {content}
              </div>
            );
          })}

          {/* Permanent house ad — same as the picker. */}
          <div
            style={{
              gridArea: "hs",
              overflow: "hidden",
              minWidth: 0,
              minHeight: 0,
            }}
          >
            <HouseAd />
          </div>
        </div>
      </div>
    </>
  );
}
