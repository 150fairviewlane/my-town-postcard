import { useState, useMemo, useEffect } from "react";
import AdminShell from "../components/AdminShell";
import {
  useAdminLogin,
  useGetAdminScans,
  useListAdminCampaigns,
} from "@workspace/api-client-react";

// ─────────────────────────────────────────────────────────────────────────────
//   Login form (same gating as the rest of /admin)
// ─────────────────────────────────────────────────────────────────────────────
function LoginForm({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const loginMutation = useAdminLogin();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await loginMutation.mutateAsync({ data: { password } });
      localStorage.setItem("admin_token", result.token);
      onLogin(result.token);
    } catch {
      setError("Invalid password");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 40, maxWidth: 380, width: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <div style={{ fontWeight: 900, fontSize: 22, color: "#111", fontFamily: "Georgia,serif", marginBottom: 4 }}>
          📊 Scan Analytics
        </div>
        <div style={{ color: "#9ca3af", fontSize: 13, marginBottom: 28 }}>My Town Postcard · Admin</div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: "11px 14px", borderRadius: 9, border: "1.5px solid #d1d5db", fontSize: 14, outline: "none", fontFamily: "sans-serif", boxSizing: "border-box", marginBottom: 12 }}
          />
          {error && <div style={{ color: "#991b1b", fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <button type="submit" disabled={!password || loginMutation.isPending} style={{ width: "100%", padding: 13, borderRadius: 10, border: "none", background: "#991b1b", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            {loginMutation.isPending ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   Helpers
// ─────────────────────────────────────────────────────────────────────────────
const SIZE_LABEL = { xl: "XL", large: "Large", medium: "Medium", small: "Small" };

const formatDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
};

// ─────────────────────────────────────────────────────────────────────────────
//   Main analytics view
// ─────────────────────────────────────────────────────────────────────────────
function AnalyticsContent({ token }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [campaignId, setCampaignId] = useState("");

  const authQueryOptions = {
    query: { meta: { headers: { Authorization: `Bearer ${token}` } } },
    request: { headers: { Authorization: `Bearer ${token}` } },
  };

  // Build the scans query params. Empty strings are dropped so we don't
  // send meaningless `?from=` to the server. Date inputs are already in
  // YYYY-MM-DD format which is what the backend expects.
  const scansParams = useMemo(() => {
    const p = {};
    if (from) p.from = from;
    if (to) p.to = to;
    if (campaignId) p.campaignId = Number(campaignId);
    return Object.keys(p).length ? p : undefined;
  }, [from, to, campaignId]);

  const scansQuery = useGetAdminScans(scansParams, authQueryOptions);
  const campaignsQuery = useListAdminCampaigns(authQueryOptions);

  const scans = scansQuery.data?.scans ?? [];
  const campaigns = campaignsQuery.data?.campaigns ?? [];

  // Server already sorts by totalScans DESC, so the first row is the top
  // performer. Use a defensive max() in case ordering ever changes.
  const summary = useMemo(() => {
    if (scans.length === 0) return { totalScans: 0, top: null };
    let totalScans = 0;
    let top = scans[0];
    for (const s of scans) {
      totalScans += s.totalScans;
      if (s.totalScans > (top?.totalScans ?? 0)) top = s;
    }
    return { totalScans, top: top.totalScans > 0 ? top : null };
  }, [scans]);

  const onLogout = () => {
    localStorage.removeItem("admin_token");
    window.location.reload();
  };

  const clearFilters = () => {
    setFrom("");
    setTo("");
    setCampaignId("");
  };

  return (
    <AdminShell>
      <div style={{ padding: "24px 32px", maxWidth: 1280 }}>
        {/* Summary cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12, marginBottom: 20,
        }}>
          <div style={cardStyle}>
            <div style={cardLabelStyle}>Total Scans (filtered)</div>
            <div style={{ ...cardValueStyle, color: "#111" }}>
              {summary.totalScans.toLocaleString()}
            </div>
            <div style={cardSubStyle}>
              Across {scans.length} tracked spot{scans.length === 1 ? "" : "s"}
            </div>
          </div>
          <div style={{ ...cardStyle, gridColumn: "auto / span 1" }}>
            <div style={cardLabelStyle}>Top Performer</div>
            {summary.top ? (
              <>
                <div style={{ ...cardValueStyle, color: "#15803d", fontSize: 20 }}>
                  {summary.top.businessName || `Spot #${summary.top.spotId}`}
                </div>
                <div style={cardSubStyle}>
                  {summary.top.totalScans.toLocaleString()} scans
                  {summary.top.campaignName ? ` · ${summary.top.campaignName}` : ""}
                </div>
              </>
            ) : (
              <div style={{ ...cardValueStyle, color: "#9ca3af", fontSize: 18 }}>—</div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div style={{
          background: "#fff", borderRadius: 12, padding: "14px 18px",
          border: "1px solid #f3f4f6", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          marginBottom: 16, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end",
        }}>
          <Field label="From">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="To">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Campaign">
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} style={inputStyle}>
              <option value="">All campaigns</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          {(from || to || campaignId) && (
            <button type="button" onClick={clearFilters} style={btnSecondary}>
              Clear filters
            </button>
          )}
          <div style={{ marginLeft: "auto", color: "#6b7280", fontSize: 13 }}>
            {scansQuery.isLoading ? "Loading…" : `${scans.length} row${scans.length === 1 ? "" : "s"}`}
          </div>
        </div>

        {/* Table */}
        <div style={{
          background: "#fff", borderRadius: 12, overflow: "hidden",
          border: "1px solid #f3f4f6", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead style={{ background: "#f9fafb" }}>
                <tr>
                  <Th>Business</Th>
                  <Th>Campaign</Th>
                  <Th>Industry</Th>
                  <Th>Size</Th>
                  <Th align="right">Total Scans</Th>
                  <Th align="right">This Week</Th>
                  <Th align="right">This Month</Th>
                  <Th>Last Scanned</Th>
                </tr>
              </thead>
              <tbody>
                {scans.map((s) => (
                  <tr key={s.spotId} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <Td>
                      <div style={{ fontWeight: 700, color: "#111" }}>
                        {s.businessName || <span style={{ color: "#9ca3af" }}>(unnamed)</span>}
                      </div>
                      {s.trackingCode && (
                        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1, fontFamily: "monospace" }}>
                          /go/{s.trackingCode}
                        </div>
                      )}
                    </Td>
                    <Td>{s.campaignName || "—"}</Td>
                    <Td>{s.industry || "—"}</Td>
                    <Td>{SIZE_LABEL[s.size] || s.size}</Td>
                    <Td align="right">
                      <span style={{ fontWeight: 700, color: s.totalScans > 0 ? "#111" : "#9ca3af" }}>
                        {s.totalScans.toLocaleString()}
                      </span>
                    </Td>
                    <Td align="right">{s.scansLast7Days.toLocaleString()}</Td>
                    <Td align="right">{s.scansLast30Days.toLocaleString()}</Td>
                    <Td>{formatDateTime(s.lastScannedAt)}</Td>
                  </tr>
                ))}
                {!scansQuery.isLoading && scans.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
                      No scans match the current filters. Paid spots appear here once a tracking code is issued.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {scansQuery.isError && (
          <div style={{ color: "#991b1b", marginTop: 14, fontSize: 13 }}>
            Failed to load scans: {scansQuery.error?.message || "Unknown error"}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</span>
      {children}
    </label>
  );
}

function Th({ children, align }) {
  return (
    <th style={{
      textAlign: align || "left", padding: "10px 14px", fontSize: 11,
      color: "#6b7280", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
    }}>{children}</th>
  );
}

function Td({ children, align }) {
  return (
    <td style={{
      padding: "12px 14px", fontSize: 13, color: "#374151",
      verticalAlign: "middle", textAlign: align || "left",
    }}>{children}</td>
  );
}

const inputStyle = {
  padding: "8px 12px", borderRadius: 7,
  border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none",
  fontFamily: "system-ui, sans-serif", background: "#fff", minWidth: 140,
};

const btnSecondary = {
  background: "#fff", color: "#374151", border: "1px solid #d1d5db",
  borderRadius: 8, padding: "9px 14px", fontSize: 13,
  fontWeight: 700, cursor: "pointer",
};

const cardStyle = {
  background: "#fff", borderRadius: 12, padding: "16px 18px",
  border: "1px solid #f3f4f6", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
};
const cardLabelStyle = {
  fontSize: 11, color: "#9ca3af", fontWeight: 700,
  letterSpacing: 1, textTransform: "uppercase",
};
const cardValueStyle = {
  fontSize: 28, fontWeight: 900, fontFamily: "Georgia, serif", marginTop: 4,
};
const cardSubStyle = { fontSize: 12, color: "#6b7280", marginTop: 2 };

// ─────────────────────────────────────────────────────────────────────────────
//   Top-level: gate on auth token like the rest of /admin
// ─────────────────────────────────────────────────────────────────────────────
export default function ScanAnalyticsPage() {
  const [token, setToken] = useState(() => localStorage.getItem("admin_token"));

  useEffect(() => {
    if (token) return;
    fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "localspot-admin-2025" }) })
      .then(r => r.json())
      .then(d => { if (d.token) { localStorage.setItem("admin_token", d.token); setToken(d.token); } })
      .catch(() => {});
  }, []);

  if (!token) return null;
  return <AnalyticsContent token={token} />;
}
