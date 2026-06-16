import { useState, useEffect, useCallback } from "react";
import { useLocation, Link } from "wouter";

const RED = "#7B1418";
const GOLD = "#d4a017";

export default function DealerDashboard() {
  const [me, setMe] = useState(null);
  const [portal, setPortal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const [, navigate] = useLocation();

  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

  const getCsrfToken = useCallback(async () => {
    try {
      const r = await fetch(`${baseUrl}/api/dealers/csrf-token`, { credentials: "include" });
      const d = await r.json().catch(() => ({}));
      return d.csrfToken || null;
    } catch { return null; }
  }, [baseUrl]);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      const csrfToken = await getCsrfToken();
      await fetch(`${baseUrl}/api/dealers/logout`, {
        method: "POST",
        credentials: "include",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
      });
    } catch { /* ignore */ }
    navigate("/dealer/login");
  }, [baseUrl, navigate, getCsrfToken]);

  const endImpersonation = useCallback(async () => {
    try {
      const csrfToken = await getCsrfToken();
      await fetch(`${baseUrl}/api/dealers/logout`, {
        method: "POST",
        credentials: "include",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
      });
    } catch { /* ignore */ }
    window.location.href = `${baseUrl}/admin/dealers`;
  }, [baseUrl, getCsrfToken]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const meRes = await fetch(`${baseUrl}/api/dealers/me`, { credentials: "include" });
        if (!meRes.ok) {
          navigate("/dealer/login?reason=session_expired");
          return;
        }
        const meData = await meRes.json();
        if (!cancelled) setMe(meData);

        const portalRes = await fetch(`${baseUrl}/api/dealers/portal-data`, { credentials: "include" });
        if (portalRes.ok) {
          const portalData = await portalRes.json();
          if (!cancelled) setPortal(portalData);
        }
      } catch {
        if (!cancelled) setError("Failed to load dashboard. Please refresh.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [baseUrl, navigate]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb", fontFamily: "sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 36, height: 36, border: "3px solid #e5e7eb", borderTopColor: RED, borderRadius: "50%", animation: "lsspin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 14, color: "#666" }}>Loading your dashboard…</div>
          <style>{`@keyframes lsspin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb", fontFamily: "sans-serif" }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 40, textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <p style={{ color: "#666" }}>{error}</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, background: RED, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 700 }}>Retry</button>
        </div>
      </div>
    );
  }

  const firstName = me?.name?.split(" ")[0] || "there";
  const isImpersonated = !!me?.impersonatedBy;
  const money = (cents) => `$${((cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

  const campaigns = portal?.campaigns || [];
  const totalSlots = campaigns.reduce((s, c) => s + (c.totalSpots ?? 0), 0);
  const totalSold = campaigns.reduce((s, c) => s + (c.soldSpots ?? 0), 0);
  const totalRevenue = campaigns.reduce((s, c) => s + (c.revenueCents ?? 0), 0);

  return (
    <div style={{ background: "#f9fafb", minHeight: "100vh", fontFamily: "sans-serif", paddingBottom: 64 }}>
      {/* Impersonation banner */}
      {isImpersonated && (
        <div style={{ background: "#fef3c7", borderBottom: "2px solid #fbbf24", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#92400e" }}>
            🔍 Impersonation active — viewing as <strong>{me?.name}</strong> ({me?.email}) on behalf of admin
          </span>
          <button
            onClick={endImpersonation}
            style={{ background: "#92400e", color: "#fff", border: "none", borderRadius: 7, padding: "6px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
          >
            End impersonation →
          </button>
        </div>
      )}

      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "14px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 26 }}>📮</span>
          <div style={{ fontWeight: 900, fontSize: 20, color: "#111", fontFamily: "Georgia,serif" }}>My Town Postcard</div>
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: "#8a6d11", background: `${GOLD}22`, padding: "3px 10px", borderRadius: 999, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Dealer Dashboard
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>{me?.name}</span>
            <button
              onClick={signOut}
              disabled={signingOut}
              style={{ background: "#fff", color: "#374151", border: "1.5px solid #d1d5db", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              {signingOut ? "Signing out…" : "Sign Out"}
            </button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 16px" }}>
        {/* Welcome */}
        <div style={{ background: "#fff", borderRadius: 14, padding: "24px 28px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", fontFamily: "Georgia,serif", marginBottom: 4 }}>
                Welcome, {firstName}!
              </h1>
              <div style={{ fontSize: 13.5, color: "#666" }}>{me?.email}</div>
            </div>
            <span style={{
              background: me?.status === "active" ? "#f0fdf4" : "#fef9c3",
              color: me?.status === "active" ? "#15803d" : "#92400e",
              borderRadius: 999, padding: "5px 14px",
              fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4,
            }}>
              {me?.status === "active" ? "✓ Active" : me?.status ?? "Unknown"}
            </span>
          </div>
        </div>

        {/* Territory */}
        {me?.territory && (
          <div style={{ background: `${GOLD}10`, border: `1.5px solid ${GOLD}55`, borderRadius: 14, padding: "20px 24px", marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#8a6d11", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Your Exclusive Territory</div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontWeight: 900, fontSize: 18, color: "#111", fontFamily: "Georgia,serif" }}>{me.territory.name}</div>
              <div style={{ fontSize: 13, color: "#8a6d11", fontWeight: 700 }}>~{Number(me.territory.households).toLocaleString()} households</div>
            </div>
          </div>
        )}

        {/* Summary stats */}
        {campaigns.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)", marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>Mailing Area Summary</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <StatCard label="Total Slots" value={totalSlots} sub={`across ${campaigns.length} area${campaigns.length !== 1 ? "s" : ""}`} />
              <StatCard label="Slots Filled" value={totalSold} sub={`${totalSlots > 0 ? Math.round((totalSold / totalSlots) * 100) : 0}% sell-through`} color={totalSold > 0 ? "#15803d" : "#111"} />
              <StatCard label="Total Revenue" value={money(totalRevenue)} sub="from ad sales" color="#15803d" />
            </div>
          </div>
        )}

        {/* Campaign cards */}
        {campaigns.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, marginBottom: 24 }}>
            {campaigns.map((c) => {
              const sold = c.soldSpots ?? 0;
              const total = c.totalSpots ?? 0;
              const pct = total > 0 ? Math.round((sold / total) * 100) : 0;
              const isFullySold = sold >= total && total > 0;
              return (
                <div key={c.campaignId} style={{ background: "#fff", borderRadius: 14, padding: "22px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1.5px solid #e5e7eb" }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 4 }}>Mailing Area</div>
                  <div style={{ fontWeight: 900, fontSize: 18, color: "#111", fontFamily: "Georgia,serif", marginBottom: 14 }}>{c.cityList || c.campaignName}</div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600, color: "#6b7280", marginBottom: 5 }}>
                      <span>Slots Filled</span>
                      <span style={{ fontWeight: 800, color: "#111" }}>{sold} of {total}</span>
                    </div>
                    <div style={{ background: "#e5e7eb", borderRadius: 999, height: 10, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: isFullySold ? GOLD : pct >= 50 ? "#16a34a" : RED, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 13.5, color: "#374151", marginBottom: 12 }}>
                    <span style={{ fontWeight: 700 }}>Revenue</span>{" "}
                    <span style={{ color: "#15803d", fontWeight: 800 }}>{money(c.revenueCents)}</span>
                  </div>
                  {c.pageUrl && (
                    <a href={c.pageUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, color: RED, border: `1.5px solid ${RED}`, borderRadius: 8, padding: "8px 14px", textDecoration: "none", display: "inline-block" }}>
                      View Advertiser Page ↗
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 14, padding: "24px 28px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)", color: "#6b7280", fontSize: 14 }}>
            Your campaign pages will appear here once they're set up — usually within 1 business day of your signup.
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Link href="/" style={{ fontSize: 13.5, color: "#6b7280", textDecoration: "none", fontWeight: 600 }}>← Back to My Town Postcard</Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color = "#111" }) {
  return (
    <div style={{ background: "#f9fafb", borderRadius: 12, padding: "16px 20px", flex: 1, minWidth: 110 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color, fontFamily: "Georgia,serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
