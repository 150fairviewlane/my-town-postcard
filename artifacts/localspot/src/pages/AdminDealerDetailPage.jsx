import { useState, useEffect } from "react";
import { Link } from "wouter";

const RED = "#7B1418";
const GOLD = "#C9A84C";
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

function PublishedPill({ isPublished }) {
  return (
    <span style={{
      background: isPublished ? "#f0fdf4" : "#f3f4f6",
      color: isPublished ? "#15803d" : "#6b7280",
      borderRadius: 999,
      padding: "2px 10px", fontSize: 11, fontWeight: 800,
      textTransform: "uppercase", letterSpacing: 0.4,
    }}>
      {isPublished ? "Live" : "Draft"}
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

function formatRevenue(cents) {
  if (!cents) return "$0";
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function authHeaders() {
  const token = localStorage.getItem("admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, padding: "18px 20px",
      boxShadow: "0 1px 6px rgba(0,0,0,0.06)", flex: "1 1 140px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color: color || "#111", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

function FillBar({ sold, total }) {
  const pct = total > 0 ? Math.round((sold / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
          {sold} / {total} sold
        </span>
        <span style={{ fontSize: 12, color: pct >= 80 ? "#15803d" : pct >= 50 ? "#92400e" : "#6b7280", fontWeight: 700 }}>
          {pct}%
        </span>
      </div>
      <div style={{ background: "#f3f4f6", borderRadius: 999, height: 7, overflow: "hidden" }}>
        <div style={{
          background: pct >= 80 ? "#15803d" : pct >= 50 ? GOLD : RED,
          width: `${pct}%`, height: "100%", borderRadius: 999,
          transition: "width 0.5s ease",
        }} />
      </div>
    </div>
  );
}

function TerritoryCard({ campaign }) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    if (!campaign.pageUrl) return;
    navigator.clipboard.writeText(campaign.pageUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{
      background: "#fff", borderRadius: 14, padding: "20px 22px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
      border: "1px solid #f0ece6",
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 20, color: "#111", letterSpacing: 0.5, lineHeight: 1.2,
            marginBottom: 4,
          }}>
            {campaign.label}
          </div>
          {campaign.slug && (
            <div style={{ fontSize: 11.5, color: "#9ca3af", fontFamily: "monospace" }}>
              /{campaign.slug}
            </div>
          )}
        </div>
        <PublishedPill isPublished={campaign.isPublished} />
      </div>

      <FillBar sold={campaign.soldSpots} total={campaign.totalSpots} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Revenue</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: RED, fontFamily: "'Bebas Neue', sans-serif" }}>
            {formatRevenue(campaign.revenueCents)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Households</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#111", fontFamily: "'Bebas Neue', sans-serif" }}>
            ~{(campaign.estimatedHouseholds || 0).toLocaleString()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Available</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#374151" }}>
            {campaign.availableSpots}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Total Spots</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#374151" }}>
            {campaign.totalSpots}
          </div>
        </div>
        {campaign.zipCount != null && (
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>ZIP Codes Served</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#6b7280" }}>
              {campaign.zipCount.toLocaleString()} ZIPs
            </div>
          </div>
        )}
      </div>

      {campaign.pageUrl && (
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href={campaign.pageUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              flex: 1, textAlign: "center",
              background: RED, color: "#fff",
              border: "none", borderRadius: 8,
              padding: "9px 12px", fontSize: 12.5, fontWeight: 800,
              textDecoration: "none", cursor: "pointer",
            }}
          >
            View Landing Page ↗
          </a>
          <button
            onClick={copyLink}
            style={{
              background: copied ? "#f0fdf4" : "#f9fafb",
              color: copied ? "#15803d" : "#374151",
              border: copied ? "1.5px solid #86efac" : "1.5px solid #e5e7eb",
              borderRadius: 8, padding: "9px 14px", fontSize: 12.5, fontWeight: 800,
              cursor: "pointer", whiteSpace: "nowrap", transition: "all .15s",
            }}
          >
            {copied ? "✓ Copied!" : "Copy Link"}
          </button>
        </div>
      )}
    </div>
  );
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
  const totals = data?.totals ?? { totalSpotsAcrossAll: 0, totalSoldAcrossAll: 0, totalRevenueCentsAcrossAll: 0 };
  const fillRate = totals.totalSpotsAcrossAll > 0
    ? Math.round((totals.totalSoldAcrossAll / totals.totalSpotsAcrossAll) * 100)
    : 0;

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

            {/* ── Overall stats ─────────────────────────────────────────── */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
              <StatCard
                label="Total Spots"
                value={totals.totalSpotsAcrossAll}
                sub="across all territories"
              />
              <StatCard
                label="Spots Sold"
                value={totals.totalSoldAcrossAll}
                color={RED}
                sub={`${totals.totalSpotsAcrossAll - totals.totalSoldAcrossAll} remaining`}
              />
              <StatCard
                label="Total Revenue"
                value={formatRevenue(totals.totalRevenueCentsAcrossAll)}
                color={RED}
              />
              <StatCard
                label="Fill Rate"
                value={`${fillRate}%`}
                color={fillRate >= 80 ? "#15803d" : fillRate >= 50 ? "#92400e" : "#374151"}
                sub={totals.totalSpotsAcrossAll > 0 ? `${totals.totalSoldAcrossAll} of ${totals.totalSpotsAcrossAll}` : "No spots yet"}
              />
            </div>

            {/* ── Territory cards ───────────────────────────────────────── */}
            {campaigns.length === 0 ? (
              <div style={{
                background: "#fff", borderRadius: 14, padding: 40, textAlign: "center",
                boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
              }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#374151", marginBottom: 6 }}>
                  No territory campaigns yet
                </div>
                <div style={{ fontSize: 13.5, color: "#9ca3af" }}>
                  Landing page campaigns will appear here once the dealer's territory is provisioned.
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 22, color: "#111", letterSpacing: 0.5,
                  }}>
                    Territories ({campaigns.length})
                  </div>
                </div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                  gap: 16,
                }}>
                  {campaigns.map((c) => (
                    <TerritoryCard key={c.campaignId} campaign={c} />
                  ))}
                </div>
              </>
            )}
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
