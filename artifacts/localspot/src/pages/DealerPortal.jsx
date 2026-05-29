import { useEffect, useState } from "react";
import { Link } from "wouter";

const RED = "#7B1418";
const GOLD = "#d4a017";

function StatCard({ label, value, sub, color = "#111" }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, padding: "16px 20px",
      boxShadow: "0 1px 6px rgba(0,0,0,0.06)", flex: 1, minWidth: 110,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af",
        textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color, fontFamily: "Georgia,serif" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SellThroughBar({ sold, total }) {
  const pct = total > 0 ? Math.round((sold / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between",
        fontSize: 12.5, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>
        <span>Sell-through</span>
        <span>{pct}%</span>
      </div>
      <div style={{ background: "#e5e7eb", borderRadius: 999, height: 8, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 999,
          background: pct >= 80 ? "#16a34a" : pct >= 40 ? GOLD : RED,
          transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
}

export default function DealerPortal() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setState({ status: "error", data: null,
        error: "No portal token found in the URL. Please use the link from your welcome email." });
      return;
    }
    const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    fetch(`${baseUrl}/api/dealer-portal?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Server returned ${res.status}`);
        setState({ status: "ok", data: body, error: null });
      })
      .catch((err) => setState({ status: "error", data: null, error: err.message }));
  }, []);

  return (
    <div style={{ background: "#f9fafb", minHeight: "100vh",
      fontFamily: "sans-serif", paddingBottom: 64 }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb",
        padding: "16px 24px", marginBottom: 32 }}>
        <div style={{ maxWidth: 860, margin: "0 auto",
          display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 26 }}>📮</span>
          <div style={{ fontWeight: 900, fontSize: 20, color: "#111",
            fontFamily: "Georgia,serif" }}>My Town Postcard</div>
          <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 800,
            color: "#8a6d11", background: `${GOLD}22`, padding: "3px 10px",
            borderRadius: 999, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Dealer Portal
          </span>
        </div>
      </header>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 16px" }}>
        {state.status === "loading" && (
          <div style={{ textAlign: "center", padding: 80, color: "#666" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Loading your portal…</div>
          </div>
        )}

        {state.status === "error" && (
          <div style={{ background: "#fff", borderRadius: 14, padding: 40,
            boxShadow: "0 2px 12px rgba(0,0,0,0.05)", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: "#991b1b",
              fontFamily: "Georgia,serif", marginBottom: 12 }}>
              Couldn't load your portal
            </h1>
            <p style={{ fontSize: 14, color: "#666", lineHeight: 1.6, maxWidth: 420,
              margin: "0 auto 20px" }}>
              {state.error}
            </p>
            <p style={{ fontSize: 13, color: "#888" }}>
              Need help?{" "}
              <a href="mailto:info@mytownpostcard.com" style={{ color: RED }}>
                info@mytownpostcard.com
              </a>
            </p>
          </div>
        )}

        {state.status === "ok" && (() => {
          const { name, email, status, territory, campaign } = state.data;
          const firstName = name?.split(" ")[0] || "there";
          const money = (cents) =>
            `$${((cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

          return (
            <>
              {/* Welcome banner */}
              <div style={{ background: "#fff", borderRadius: 14, padding: "24px 28px",
                boxShadow: "0 2px 12px rgba(0,0,0,0.05)", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center",
                  justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111",
                      fontFamily: "Georgia,serif", marginBottom: 4 }}>
                      Welcome, {firstName}!
                    </h1>
                    <div style={{ fontSize: 13.5, color: "#666" }}>{email}</div>
                  </div>
                  <span style={{
                    background: status === "active" ? "#f0fdf4" : "#fef9c3",
                    color: status === "active" ? "#15803d" : "#92400e",
                    borderRadius: 999, padding: "5px 14px",
                    fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4,
                  }}>
                    {status === "active" ? "✓ Active" : status}
                  </span>
                </div>
              </div>

              {/* Territory card */}
              {territory ? (
                <div style={{ background: `${GOLD}10`, border: `1.5px solid ${GOLD}55`,
                  borderRadius: 14, padding: "20px 24px", marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#8a6d11",
                    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    Your Exclusive Territory
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 18, color: "#111",
                    fontFamily: "Georgia,serif", marginBottom: 4 }}>
                    {territory.name}
                  </div>
                  {territory.counties?.length > 0 && (
                    <div style={{ fontSize: 13, color: "#5a4708", marginBottom: 4 }}>
                      <strong>Counties:</strong> {territory.counties.join(", ")}
                    </div>
                  )}
                  {territory.zoneNote && (
                    <div style={{ fontSize: 13, color: "#5a4708", marginBottom: 4 }}>
                      <strong>Communities:</strong> {territory.zoneNote}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: "#5a4708" }}>
                    ~{Number(territory.households).toLocaleString()} households in your territory
                  </div>
                </div>
              ) : (
                <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px",
                  boxShadow: "0 1px 6px rgba(0,0,0,0.05)", marginBottom: 20,
                  color: "#92400e", fontSize: 13.5 }}>
                  Territory details will appear here once your account is fully configured.
                  Contact{" "}
                  <a href="mailto:info@mytownpostcard.com" style={{ color: RED }}>
                    info@mytownpostcard.com
                  </a>{" "}
                  if you have questions.
                </div>
              )}

              {/* Campaign stats */}
              {campaign ? (
                <div style={{ background: "#fff", borderRadius: 14, padding: "24px 28px",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.05)", marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center",
                    justifyContent: "space-between", flexWrap: "wrap", gap: 12,
                    marginBottom: 20 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af",
                        textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                        Your Campaign
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: "#111" }}>
                        {campaign.campaignName}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center",
                      flexWrap: "wrap" }}>
                      <span style={{
                        background: campaign.isPublished ? "#f0fdf4" : "#fffbeb",
                        color: campaign.isPublished ? "#15803d" : "#92400e",
                        borderRadius: 999, padding: "4px 12px",
                        fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4,
                      }}>
                        {campaign.isPublished ? "Published" : "Unpublished"}
                      </span>
                      {campaign.pageUrl && (
                        <a href={campaign.pageUrl} target="_blank" rel="noreferrer"
                          style={{ fontSize: 13, fontWeight: 800, color: RED,
                            textDecoration: "none",
                            background: "#fff", border: `1.5px solid ${RED}`,
                            borderRadius: 8, padding: "6px 12px" }}>
                          View My Page ↗
                        </a>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                    <StatCard
                      label="Spots Sold"
                      value={`${campaign.soldSpots}/${campaign.totalSpots}`}
                      sub="ad slots"
                    />
                    <StatCard
                      label="Available"
                      value={campaign.availableSpots}
                      sub="still open"
                    />
                    <StatCard
                      label="Revenue"
                      value={money(campaign.revenueCents)}
                      color="#15803d"
                      sub="from ad sales"
                    />
                  </div>

                  <SellThroughBar sold={campaign.soldSpots} total={campaign.totalSpots} />
                </div>
              ) : (
                <div style={{ background: "#fff", borderRadius: 14, padding: "24px 28px",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.05)", marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af",
                    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
                    Your Campaign
                  </div>
                  <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
                    Your campaign page will appear here once it's set up by our team —
                    usually within 1 business day of your signup.
                  </div>
                </div>
              )}

              {/* What's next */}
              <div style={{ background: `${GOLD}10`, border: `1px solid ${GOLD}44`,
                borderRadius: 14, padding: "20px 24px" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#8a6d11",
                  textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>
                  What happens next
                </div>
                <ul style={{ margin: 0, paddingLeft: 20,
                  fontSize: 13.5, color: "#5a4708", lineHeight: 1.7 }}>
                  <li>
                    Our team will send your dealer kit and onboarding call details
                    to <strong>{email}</strong> within 1 business day.
                  </li>
                  <li>
                    Once your campaign page is live, share it with local businesses
                    in your territory to sell ad spots.
                  </li>
                  <li>
                    Bookmark this page to track your ad sales and revenue.
                    Your link is unique to you — keep it safe.
                  </li>
                  <li>
                    Questions? Reply to your welcome email or contact{" "}
                    <a href="mailto:info@mytownpostcard.com" style={{ color: RED }}>
                      info@mytownpostcard.com
                    </a>.
                  </li>
                </ul>
              </div>

              <div style={{ marginTop: 24, textAlign: "center" }}>
                <Link href="/" style={{ fontSize: 13.5, color: "#6b7280",
                  textDecoration: "none", fontWeight: 600 }}>
                  ← Back to My Town Postcard
                </Link>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
