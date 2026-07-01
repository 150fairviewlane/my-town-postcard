import { useLocation, useParams, useSearch } from "wouter";
import { useGetSpot } from "@workspace/api-client-react";

const SIZE_LABELS = {
  xl: "Extra Large",
  large: "Large",
  medium: "Medium",
  small: "Small",
};

export default function ConfirmationPage() {
  const [, navigate] = useLocation();
  const { spotId } = useParams();
  const search = useSearch();
  const fromSlug = new URLSearchParams(search).get("from") || "";
  const cityName = fromSlug
    ? fromSlug.split("-").slice(0, -1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    : null;
  const numericId = spotId ? parseInt(spotId, 10) : NaN;
  const enabled = Number.isFinite(numericId);

  const { data: spot, isLoading, isError } = useGetSpot(numericId, {
    query: { enabled, retry: 1 },
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 24px" }}>
        <div style={{ fontWeight: 900, fontSize: 18, color: "#111", fontFamily: "Georgia,serif" }}>📮 My Town Postcard</div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "clamp(24px, 6vw, 48px) clamp(14px, 4vw, 20px)" }}>
        <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
          <div style={{ margin: "0 auto 24px", display: "flex", justifyContent: "center" }}>
            <img src="/mailbox-logo.png" alt="My Town Postcard" style={{ width: 120, height: 120, objectFit: "contain" }} />
          </div>
          <h1 style={{ fontSize: "clamp(22px, 6vw, 32px)", fontWeight: 900, color: "#111", fontFamily: "Georgia,serif", margin: "0 0 12px", lineHeight: 1.2 }}>
            You're on the Postcard!
          </h1>
          <p style={{ color: "#374151", fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
            {cityName ? (
              <>Your ad will appear on the next <strong>{cityName}</strong> postcard, reaching <strong>5,000 homes</strong>.</>
            ) : (
              <>Your ad will appear on the next <strong>Habersham Community Mailer</strong>, reaching <strong>5,000 homes</strong> across Clarksville, Cornelia, Demorest and Alto.</>
            )}
          </p>

          {/* Order summary card — pulls live from the server so even on a
              hard refresh the customer sees what they paid for. */}
          {isLoading && (
            <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 28, color: "#6b7280" }}>
              Loading order details…
            </div>
          )}

          {isError && enabled && (
            <div style={{ background: "#fef2f2", borderRadius: 12, padding: 16, color: "#991b1b", marginBottom: 28, fontSize: 13 }}>
              Could not load your order details, but your reservation is recorded. Check your email for the receipt.
            </div>
          )}

          {spot && spot.templateData?.finishedAdUrl && (
            <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 28, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>
                Here's Your Ad!
              </div>
              <img
                src={spot.templateData.finishedAdUrl}
                alt="Your finished ad"
                style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
              />
            </div>
          )}

          {spot && (
            <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 28, textAlign: "left" }}>
              <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
                Order Confirmation
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 10, columnGap: 16 }}>
                <div style={{ color: "#6b7280", fontSize: 14 }}>Business</div>
                <div style={{ color: "#111", fontWeight: 700, fontSize: 14 }}>{spot.businessName || spot.templateData?.businessName || "—"}</div>

                <div style={{ color: "#6b7280", fontSize: 14 }}>Spot Size</div>
                <div style={{ color: "#111", fontWeight: 700, fontSize: 14 }}>{SIZE_LABELS[spot.size] || spot.size}</div>

                <div style={{ color: "#6b7280", fontSize: 14 }}>Price Paid</div>
                <div style={{ color: "#991b1b", fontWeight: 900, fontSize: 18 }}>${(spot.price / 100).toFixed(2)}</div>

                <div style={{ color: "#6b7280", fontSize: 14 }}>Status</div>
                <div style={{ color: spot.status === "paid" ? "#15803d" : "#92400e", fontWeight: 700, fontSize: 14, textTransform: "capitalize" }}>
                  {spot.status === "paid" ? "Paid ✓" : spot.status}
                </div>
              </div>
            </div>
          )}

          <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 28, textAlign: "left" }}>
            {[
              ["📬", "5,000 homes", "will receive your ad via USPS EDDM"],
              ["🎨", "Ad design included", "if you need it — we'll reach out within 48 hours"],
              ["📍", "Exclusive placement", "one business per category — no competitors"],
            ].map(([ic, title, desc]) => (
              <div key={title} style={{ display: "flex", gap: 14, marginBottom: 14 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{ic}</span>
                <div>
                  <div style={{ fontWeight: 700, color: "#111", fontSize: 14 }}>{title}</div>
                  <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>

          <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>
            A receipt has been emailed to {spot?.contactEmail || "you"}. Watch for next-step
            instructions about uploading or designing your ad.
          </p>

          <button
            onClick={() => {
              const side = spot?.side || "front";
              const area = spot?.gridArea || "";
              const base = fromSlug ? `/${fromSlug}` : "";
              navigate(`${base}?side=${side}${area ? `&highlight=${area}` : ""}`);
            }}
            style={{ background: "#991b1b", color: "#fff", border: "none", borderRadius: 10, padding: "13px 32px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            View My Ad on Postcard
          </button>
        </div>
      </div>
    </div>
  );
}
