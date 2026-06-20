import { useState, useEffect } from "react";
import { Link } from "wouter";
import DealerTerritoryOverview from "../components/DealerTerritoryOverview";

const RED = "#7B1418";
const CREAM = "#fdf8f2";

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
      padding: "3px 12px", fontSize: 11, fontWeight: 800,
      textTransform: "uppercase", letterSpacing: 0.5,
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

function authHeaders() {
  const token = localStorage.getItem("admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AdminDealerDetailPage({ params }) {
  const dealerId = params?.id;
  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!dealerId) return;
    setLoading(true);
    setError(null);
    fetch(`${baseUrl}/api/admin/dealers/${dealerId}`, { headers: authHeaders() })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Server returned ${res.status}`);
        setData(body);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [dealerId, baseUrl]);

  const dealer = data?.dealer;
  const campaigns = data?.campaigns ?? [];
  const totals = data?.totals ?? {};

  return (
    <div style={{ minHeight: "100vh", background: CREAM, fontFamily: "DM Sans, sans-serif" }}>
      {/* Top nav */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e5e7eb",
        padding: "12px 28px", display: "flex", alignItems: "center", gap: 16,
        flexWrap: "wrap",
      }}>
        <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <span style={{ fontSize: 22 }}>📮</span>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#111", fontFamily: "Georgia,serif" }}>
              Dealer Details
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>Admin · Dealer program</div>
          </div>
        </Link>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Link
            href="/admin/dealers"
            style={{
              fontSize: 13, fontWeight: 700, color: "#374151",
              background: "#fff", border: "1px solid #d1d5db",
              borderRadius: 8, padding: "7px 14px", textDecoration: "none",
            }}
          >
            ← All Dealers
          </Link>
          <a
            href={`${baseUrl}/admin`}
            style={{
              fontSize: 13, fontWeight: 700, color: "#374151",
              background: "#fff", border: "1px solid #d1d5db",
              borderRadius: 8, padding: "7px 12px", textDecoration: "none",
            }}
          >
            Admin Home
          </a>
        </div>
      </div>

      <div style={{ padding: "28px 28px 48px", maxWidth: 1100, margin: "0 auto" }}>

        {/* Loading */}
        {loading && (
          <div style={{ background: "#fff", borderRadius: 14, padding: 48, textAlign: "center", color: "#9ca3af" }}>
            Loading dealer…
          </div>
        )}

        {/* Error / not found */}
        {!loading && error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 14, padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#991b1b", marginBottom: 8 }}>
              {error.includes("not found") || error.includes("404") ? "Dealer not found" : "Failed to load dealer"}
            </div>
            <div style={{ fontSize: 13.5, color: "#6b7280", marginBottom: 20 }}>{error}</div>
            <Link
              href="/admin/dealers"
              style={{
                display: "inline-block", background: RED, color: "#fff",
                borderRadius: 8, padding: "10px 22px", textDecoration: "none",
                fontWeight: 800, fontSize: 14,
              }}
            >
              ← Back to Dealers
            </Link>
          </div>
        )}

        {/* Main content */}
        {!loading && dealer && (
          <>
            {/* ── Dealer header ─────────────────────────────────────────── */}
            <div style={{
              background: "#fff", borderRadius: 14, padding: "24px 28px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.05)", marginBottom: 20,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                <div>
                  <div style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 36, color: "#111", letterSpacing: 1, lineHeight: 1.1,
                    marginBottom: 6,
                  }}>
                    {dealer.name}
                  </div>
                  <StatusPill status={dealer.status} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px 24px" }}>
                <Field label="Email" value={dealer.email} mono />
                <Field label="Phone" value={dealer.phone || "—"} />
                <Field label="Home ZIP" value={dealer.homeZip || "—"} mono />
                <Field label="Dealer ID" value={`#${dealer.id}`} mono />
                <Field label="Signed Up" value={formatDate(dealer.createdAt)} />
                <Field label="Activated" value={formatDate(dealer.activatedAt)} />
              </div>
            </div>

            {/* ── Territory overview (admin — shows full revenue) ─────── */}
            <DealerTerritoryOverview
              campaigns={campaigns}
              totals={totals}
              showRevenue={true}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, color: "#111", fontFamily: mono ? "monospace" : "inherit", fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}
