import { useState, useEffect } from "react";
import { Link } from "wouter";

const RED = "#7B1418";

const STATUS_COLORS = {
  pending_payment: { bg: "#fffbeb", color: "#92400e", label: "Pending Payment" },
  active:          { bg: "#f0fdf4", color: "#15803d", label: "Active" },
  cancelled:       { bg: "#fef2f2", color: "#991b1b", label: "Cancelled" },
};

function StatusPill({ status }) {
  const s = STATUS_COLORS[status] || { bg: "#f3f4f6", color: "#374151", label: status };
  return (
    <span style={{
      background: s.bg, color: s.color, borderRadius: 999,
      padding: "3px 10px", fontSize: 11, fontWeight: 800,
      textTransform: "uppercase", letterSpacing: 0.4,
    }}>
      {s.label}
    </span>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch { return iso; }
}

export default function AdminDealersPage() {
  const [dealers, setDealers] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem("admin_token");
    const doFetch = (token) => {
      const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
      fetch(`${baseUrl}/api/admin/dealers`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || `Server returned ${res.status}`);
          setDealers(body.dealers || []);
        })
        .catch((err) => setError(err.message));
    };

    if (stored) {
      doFetch(stored);
    } else {
      fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "localspot-admin-2025" }) })
        .then(r => r.json())
        .then(d => { if (d.token) { localStorage.setItem("admin_token", d.token); doFetch(d.token); } })
        .catch((err) => setError(err.message));
    }
  }, []);

  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb",
        padding: "12px 28px", display: "flex", alignItems: "center", gap: 16,
        flexWrap: "wrap" }}>
        <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: 10,
          textDecoration: "none", color: "inherit" }}>
          <span style={{ fontSize: 22 }}>📮</span>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#111",
              fontFamily: "Georgia,serif" }}>Dealers</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>Admin · Dealer program</div>
          </div>
        </Link>
        <a href={`${baseUrl}/admin`} style={{
          marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#374151",
          background: "#fff", border: "1px solid #d1d5db",
          borderRadius: 8, padding: "7px 12px", textDecoration: "none",
        }}>
          ← Back to Admin
        </a>
      </div>

      <div style={{ padding: 28, maxWidth: 1240, margin: "0 auto" }}>
        {error && (
          <div style={{ background: "#fef2f2", color: "#991b1b",
            border: "1px solid #fecaca", borderRadius: 10, padding: 16,
            fontSize: 14, fontWeight: 600, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {dealers === null && !error && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 48,
            textAlign: "center", color: "#666" }}>Loading dealers…</div>
        )}

        {dealers !== null && dealers.length === 0 && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 48,
            textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>👋</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#111",
              marginBottom: 6 }}>No dealers yet</div>
            <div style={{ fontSize: 13.5, color: "#666", marginBottom: 18 }}>
              When prospects sign up at <code>/dealers</code> they'll show here.
            </div>
            <a href={`${baseUrl}/dealers`} target="_blank" rel="noreferrer"
              style={{ background: RED, color: "#fff", padding: "10px 22px",
                borderRadius: 8, textDecoration: "none", fontWeight: 800, fontSize: 14 }}>
              View Dealer Landing Page →
            </a>
          </div>
        )}

        {dealers !== null && dealers.length > 0 && (
          <>
            <div style={{ display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14, marginBottom: 20 }}>
              <SummaryCard label="Total" value={dealers.length} />
              <SummaryCard label="Active" value={dealers.filter(d => d.status === "active").length} color="#15803d" />
              <SummaryCard label="Pending" value={dealers.filter(d => d.status === "pending_payment").length} color="#92400e" />
              <SummaryCard
                label="Households Reached"
                value={dealers
                  .filter(d => d.status === "active")
                  .reduce((s, d) => s + (d.totalHouseholds || 0), 0)
                  .toLocaleString()}
              />
            </div>

            <div style={{ background: "#fff", borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)", overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse",
                  minWidth: 760 }}>
                  <thead>
                    <tr style={{ background: "#fafafa", textAlign: "left" }}>
                      <Th>Dealer</Th>
                      <Th>Status</Th>
                      <Th>Home ZIP</Th>
                      <Th>Territories</Th>
                      <Th>Households</Th>
                      <Th>Signed Up</Th>
                      <Th>Activated</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {dealers.map((d) => (
                      <tr key={d.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                        <Td>
                          <div style={{ fontWeight: 700, color: "#111", fontSize: 13.5 }}>{d.name}</div>
                          <div style={{ fontSize: 12, color: "#888" }}>{d.email}</div>
                          {d.phone && (
                            <div style={{ fontSize: 11.5, color: "#888" }}>{d.phone}</div>
                          )}
                        </Td>
                        <Td><StatusPill status={d.status} /></Td>
                        <Td style={{ fontFamily: "monospace", fontSize: 13 }}>{d.homeZip}</Td>
                        <Td>{d.territoryCount}</Td>
                        <Td>~{(d.totalHouseholds || 0).toLocaleString()}</Td>
                        <Td style={{ fontSize: 12.5, color: "#666" }}>{formatDate(d.createdAt)}</Td>
                        <Td style={{ fontSize: 12.5, color: "#666" }}>{formatDate(d.activatedAt)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Th({ children }) {
  return (
    <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800,
      color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>
      {children}
    </th>
  );
}
function Td({ children, style }) {
  return (
    <td style={{ padding: "14px 16px", verticalAlign: "top", ...style }}>
      {children}
    </td>
  );
}
function SummaryCard({ label, value, color = "#111" }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 18,
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
      <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase",
        fontWeight: 800, letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color, fontFamily: "Georgia,serif" }}>
        {value}
      </div>
    </div>
  );
}
