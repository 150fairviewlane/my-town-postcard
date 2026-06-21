import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAdminLogin } from "@workspace/api-client-react";
import AdminShell from "../components/AdminShell";

const BURGUNDY = "#991b1b";

function LoginForm({ onLogin }) {
  const [password, setPassword] = useState("localspot-admin-2025");
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
        <div style={{ fontWeight: 900, fontSize: 22, color: "#111", fontFamily: "Georgia,serif", marginBottom: 4 }}>📮 Admin Dashboard</div>
        <div style={{ color: "#9ca3af", fontSize: 13, marginBottom: 28 }}>LocalSpot Mailer</div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ width: "100%", padding: "11px 14px", borderRadius: 9, border: "1.5px solid #d1d5db", fontSize: 14, outline: "none", fontFamily: "sans-serif", boxSizing: "border-box", marginBottom: 12 }}
          />
          {error && <div style={{ color: BURGUNDY, fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <button type="submit" disabled={!password || loginMutation.isPending} style={{ width: "100%", padding: 13, borderRadius: 10, border: "none", background: BURGUNDY, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            {loginMutation.isPending ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 14, padding: "20px 22px",
      border: "1px solid #f3f4f6", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
        <span style={{ fontSize: 22 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 900, color: color || "#111", fontFamily: "Georgia, serif", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function Overview({ token }) {
  const [campaigns, setCampaigns] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [territories, setTerritories] = useState([]);
  const [loading, setLoading] = useState(true);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const auth = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    const run = async () => {
      try {
        const [cRes, dRes, tRes] = await Promise.all([
          fetch(`${base}/api/admin/campaigns`, { headers: auth }),
          fetch(`${base}/api/admin/dealers`, { headers: auth }),
          fetch(`${base}/api/territories`),
        ]);
        const [cData, dData, tData] = await Promise.all([cRes.json(), dRes.json(), tRes.json()]);
        setCampaigns(cData.campaigns ?? []);
        setDealers(dData.dealers ?? []);
        setTerritories(Array.isArray(tData) ? tData : []);
      } catch {
        // silently degrade
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const totalRevenue = campaigns.reduce((s, c) => s + (c.totalRevenue ?? 0), 0);
  const totalPaid = campaigns.reduce((s, c) => s + (c.paidSpots ?? 0), 0);
  const totalSpots = campaigns.reduce((s, c) => s + (c.totalSpots ?? 0), 0);
  const overallFillRate = totalSpots > 0 ? Math.round((totalPaid / totalSpots) * 100) : null;
  const activeTerritories = territories.filter(t =>
    campaigns.some(c => {
      const ct = (c.territory ?? "").toLowerCase().trim();
      const tn = (t.name ?? "").toLowerCase().trim();
      return ct === tn || ct.includes(tn) || tn.includes(ct);
    })
  ).length;

  return (
    <div style={{ padding: "32px 32px 48px" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 900, fontSize: 26, color: "#111", fontFamily: "Georgia, serif" }}>Overview</div>
        <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>LocalSpot Mailer · Admin</div>
      </div>

      {loading ? (
        <div style={{ color: "#9ca3af", fontSize: 14, padding: "40px 0" }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16, marginBottom: 36 }}>
            <StatCard
              label="Total Revenue"
              value={`$${(totalRevenue / 100).toLocaleString()}`}
              sub={`Across ${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`}
              color={BURGUNDY}
              icon="💰"
            />
            <StatCard
              label="Overall Fill Rate"
              value={overallFillRate !== null ? `${overallFillRate}%` : "—"}
              sub={`${totalPaid} of ${totalSpots} spots sold`}
              color="#15803d"
              icon="📮"
            />
            <StatCard
              label="Total Dealers"
              value={dealers.length}
              sub="All enrolled dealers"
              color="#1d4ed8"
              icon="💼"
            />
            <StatCard
              label="Active Territories"
              value={activeTerritories}
              sub={`${territories.length} total registered`}
              color="#7c3aed"
              icon="🗺"
            />
          </div>

          {/* Quick actions */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Quick Actions</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/admin/territories/detail" style={quickLinkStyle}>
                <span style={{ fontSize: 22 }}>📅</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#111" }}>Habersham Campaign</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Manage spots & campaign status</div>
                </div>
              </Link>
              <Link href="/admin/outreach" style={quickLinkStyle}>
                <span style={{ fontSize: 22 }}>📞</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#111" }}>Outreach Tracker</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Manage & contact leads</div>
                </div>
              </Link>
              <Link href="/admin/territories" style={quickLinkStyle}>
                <span style={{ fontSize: 22 }}>🗺</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#111" }}>All Territories</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>View & create territories</div>
                </div>
              </Link>
              <Link href="/admin/dealers" style={quickLinkStyle}>
                <span style={{ fontSize: 22 }}>💼</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#111" }}>Dealers</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Manage dealer accounts</div>
                </div>
              </Link>
              <Link href="/admin/subscriptions" style={quickLinkStyle}>
                <span style={{ fontSize: 22 }}>🔁</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#111" }}>Subscriptions</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>MRR & active plans</div>
                </div>
              </Link>
            </div>
          </div>

          {/* Campaigns table */}
          {campaigns.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>All Campaigns</div>
              <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #f3f4f6", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ background: "#f9fafb" }}>
                    <tr>
                      {["Name", "Territory", "Status", "Mail Date", "Revenue", "Fill Rate"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: 0.5, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(c => {
                      const fill = c.totalSpots ? Math.round(((c.paidSpots ?? 0) / c.totalSpots) * 100) : 0;
                      const pill = { active: ["#f0fdf4", "#15803d"], draft: ["#f3f4f6", "#374151"], completed: ["#fef2f2", BURGUNDY] };
                      const [bg, tc] = pill[c.status] ?? ["#f3f4f6", "#374151"];
                      return (
                        <tr key={c.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "#111" }}>{c.name}</td>
                          <td style={{ padding: "12px 14px", fontSize: 13, color: "#374151" }}>{c.territory}</td>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ background: bg, color: tc, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>{c.status}</span>
                          </td>
                          <td style={{ padding: "12px 14px", fontSize: 13, color: "#374151" }}>{c.mailDate ? new Date(c.mailDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
                          <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "#111" }}>${(c.totalRevenue / 100).toLocaleString()}</td>
                          <td style={{ padding: "12px 14px", fontSize: 13, color: "#374151" }}>{c.totalSpots ? `${fill}%` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const quickLinkStyle = {
  display: "flex", alignItems: "center", gap: 12,
  background: "#fff", border: "1.5px solid #e5e7eb",
  borderRadius: 12, padding: "14px 18px",
  textDecoration: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  minWidth: 200,
};

export default function AdminOverviewPage() {
  const [token, setToken] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("admin_token") : null
  );
  const [, navigate] = useLocation();

  const handleLogin = (t) => setToken(t);

  if (!token) return <LoginForm onLogin={handleLogin} />;

  return (
    <AdminShell>
      <Overview token={token} />
    </AdminShell>
  );
}
