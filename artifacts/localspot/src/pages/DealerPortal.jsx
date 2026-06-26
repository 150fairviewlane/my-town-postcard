import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";

const RED = "#7B1418";
const GOLD = "#d4a017";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 10;

function MailingAreaCard({ c, money, baseUrl }) {
  const sold = c.soldSpots ?? 0;
  const total = c.totalSpots ?? 15;
  const pct = total > 0 ? Math.round((sold / total) * 100) : 0;
  const isFullySold = sold >= total && total > 0;
  const cityName = c.cityList || c.campaignName;

  return (
    <div style={{
      background: "#fff", borderRadius: 14, padding: "22px 24px",
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1.5px solid #e5e7eb",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af",
        textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 4 }}>
        Mailing Area
      </div>
      <div style={{ fontWeight: 900, fontSize: 20, color: "#111",
        fontFamily: "Georgia,serif", marginBottom: 16 }}>
        {cityName}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          fontSize: 12.5, fontWeight: 600, color: "#6b7280", marginBottom: 5 }}>
          <span>Slots Filled</span>
          <span style={{ fontWeight: 800, color: "#111" }}>{sold} of {total}</span>
        </div>
        <div style={{ background: "#e5e7eb", borderRadius: 999, height: 10, overflow: "hidden" }}>
          <div style={{
            width: `${pct}%`, height: "100%", borderRadius: 999,
            background: isFullySold ? GOLD : pct >= 50 ? "#16a34a" : RED,
            transition: "width 0.6s ease",
          }} />
        </div>
      </div>

      <div style={{ fontSize: 13.5, color: "#374151", marginBottom: 12 }}>
        <span style={{ fontWeight: 700 }}>Revenue</span>{" "}
        <span style={{ color: "#15803d", fontWeight: 800 }}>{money(c.revenueCents)}</span>
        <span style={{ color: "#9ca3af" }}> collected</span>
      </div>

      <div style={{ marginBottom: 18 }}>
        <span style={{
          fontSize: 12, fontWeight: 800, padding: "4px 12px", borderRadius: 999,
          background: isFullySold ? "#fffbeb" : "#f0fdf4",
          color: isFullySold ? "#92400e" : "#15803d",
          display: "inline-block",
        }}>
          {isFullySold ? "🟡 Ready to Print" : "🟢 Selling"}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto" }}>
        {c.pageUrl && (
          <a href={c.pageUrl} target="_blank" rel="noreferrer"
            style={{
              fontSize: 13, fontWeight: 700, color: RED,
              border: `1.5px solid ${RED}`, borderRadius: 8,
              padding: "8px 14px", textDecoration: "none", background: "#fff",
              whiteSpace: "nowrap",
            }}>
            View {cityName} Page ↗
          </a>
        )}
        <button
          onClick={() => window.open(
            `/api/grok-ad-generator?campaignId=${encodeURIComponent(c.campaignId ?? '')}&side=front`,
            "grok-ad-gen",
            "width=1120,height=800,left=80,top=60",
          )}
          style={{
            fontSize: 13, fontWeight: 700, color: "#374151",
            border: "1.5px solid #d1d5db", borderRadius: 8,
            padding: "8px 14px", background: "#fff",
            whiteSpace: "nowrap", cursor: "pointer",
          }}>
          Ad Generator
        </button>
      </div>
    </div>
  );
}

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

export default function DealerPortal() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const [pollCount, setPollCount] = useState(0);

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const sessionId = params.get("session_id");

  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

  const fetchPortal = useCallback(async () => {
    if (!token) {
      setState({ status: "error", data: null,
        error: "No portal token found in the URL. Please use the link from your welcome email." });
      return;
    }
    try {
      const res = await fetch(`${baseUrl}/api/dealer-portal?token=${encodeURIComponent(token)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Server returned ${res.status}`);
      setState({ status: "ok", data: body, error: null });
    } catch (err) {
      setState({ status: "error", data: null, error: err.message });
    }
  }, [token, baseUrl]);

  useEffect(() => {
    async function initPortal() {
      if (sessionId && sessionId.startsWith("cs_")) {
        try {
          await fetch(
            `${baseUrl}/api/dealers/confirm?session_id=${encodeURIComponent(sessionId)}`,
          );
        } catch {
          // ignore — fetchPortal will still load current status
        }
      }
      await fetchPortal();
    }
    initPortal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.status !== "ok") return;
    if (state.data?.status !== "pending_payment") return;
    if (pollCount >= MAX_POLLS) return;
    const timer = setTimeout(() => {
      setPollCount((c) => c + 1);
      fetchPortal();
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [state, pollCount, fetchPortal]);

  return (
    <div style={{ background: "#f9fafb", minHeight: "100vh",
      fontFamily: "sans-serif", paddingBottom: 64 }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb",
        padding: "16px 24px", marginBottom: 32 }}>
        <div style={{ maxWidth: 960, margin: "0 auto",
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

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 16px" }}>
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
          const { name, email, status, territory, campaign, campaigns } = state.data;
          const firstName = name?.split(" ")[0] || "there";
          const money = (cents) =>
            `$${((cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

          // Use the `campaigns` array if present; fall back to wrapping the legacy
          // singular `campaign` so the card grid always has something to render.
          const campaignList = Array.isArray(campaigns) && campaigns.length > 0
            ? campaigns
            : (campaign ? [campaign] : []);

          if (status === "pending_payment") {
            return (
              <div style={{ background: "#fff", borderRadius: 14, padding: 40,
                boxShadow: "0 2px 12px rgba(0,0,0,0.05)", textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>
                  {pollCount >= MAX_POLLS ? "🎉" : "⏳"}
                </div>
                <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111",
                  fontFamily: "Georgia,serif", marginBottom: 8 }}>
                  Payment received — activating your account…
                </h1>
                <p style={{ fontSize: 14, color: "#666", lineHeight: 1.6, marginBottom: 20 }}>
                  This usually takes just a few seconds. Hang tight, {firstName}!
                </p>
                {pollCount < MAX_POLLS ? (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8,
                    fontSize: 13, color: "#9ca3af", fontWeight: 600 }}>
                    <div style={{
                      width: 16, height: 16, border: "2px solid #e5e7eb",
                      borderTopColor: RED, borderRadius: "50%",
                      animation: "lsspin 0.8s linear infinite",
                    }} />
                    Checking activation status…
                    <style>{`@keyframes lsspin { to { transform: rotate(360deg); } }`}</style>
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "#666" }}>
                    If this persists, contact{" "}
                    <a href="mailto:info@mytownpostcard.com" style={{ color: RED }}>
                      info@mytownpostcard.com
                    </a>{" "}
                    and we'll activate your account manually.
                  </p>
                )}
              </div>
            );
          }

          // Summary totals across all mailing areas
          const totalSlots = campaignList.reduce((s, c) => s + (c.totalSpots ?? 15), 0);
          const totalSold = campaignList.reduce((s, c) => s + (c.soldSpots ?? 0), 0);
          const totalRevenue = campaignList.reduce((s, c) => s + (c.revenueCents ?? 0), 0);

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
                    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                    Your Exclusive Territory
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline",
                    justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontWeight: 900, fontSize: 18, color: "#111",
                      fontFamily: "Georgia,serif" }}>
                      {territory.name}
                    </div>
                    <div style={{ fontSize: 13, color: "#8a6d11", fontWeight: 700 }}>
                      ~{Number(territory.households).toLocaleString()} households
                    </div>
                  </div>
                  {territory.counties?.length > 0 && (
                    <div style={{ fontSize: 13, color: "#5a4708", marginTop: 6 }}>
                      <strong>Counties:</strong> {territory.counties.join(", ")}
                    </div>
                  )}
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

              {/* ── Mailing Areas ─────────────────────────────────────────── */}
              {campaignList.length > 0 ? (
                <>
                  {/* Summary bar */}
                  <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.05)", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af",
                      textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
                      Your Territory — {territory?.name || "All Areas"}
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <StatCard
                        label="Total Slots"
                        value={totalSlots}
                        sub={`across ${campaignList.length} area${campaignList.length !== 1 ? "s" : ""}`}
                      />
                      <StatCard
                        label="Slots Filled"
                        value={totalSold}
                        sub={`${totalSlots > 0 ? Math.round((totalSold / totalSlots) * 100) : 0}% sell-through`}
                        color={totalSold > 0 ? "#15803d" : "#111"}
                      />
                      <StatCard
                        label="Total Revenue"
                        value={money(totalRevenue)}
                        sub="from ad sales"
                        color="#15803d"
                      />
                    </div>
                  </div>

                  {/* Mailing area cards — 2-column grid on desktop */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                    gap: 16,
                    marginBottom: 24,
                  }}>
                    {campaignList.map((c) => (
                      <MailingAreaCard
                        key={c.campaignId}
                        c={c}
                        money={money}
                        baseUrl={baseUrl}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ background: "#fff", borderRadius: 14, padding: "24px 28px",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.05)", marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af",
                    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
                    Your Mailing Areas
                  </div>
                  <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
                    Your campaign pages will appear here once your territory is confirmed.
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
                    to <strong>{email}</strong> shortly.
                  </li>
                  <li>
                    Once your campaign pages are live, share them with local businesses
                    in each mailing area to sell ad spots.
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
