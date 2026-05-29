import { useState, useEffect, Fragment } from "react";
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
  const [expanded, setExpanded] = useState(null);
  const [pages, setPages] = useState({});

  const loadPage = (dealerId) => {
    const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    const token = localStorage.getItem("admin_token");
    setPages((p) => ({ ...p, [dealerId]: { status: "loading" } }));
    return fetch(`${baseUrl}/api/dealers/${dealerId}/landing-page`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Server returned ${res.status}`);
        setPages((p) => ({ ...p, [dealerId]: { status: "ok", data: body } }));
      })
      .catch((err) =>
        setPages((p) => ({ ...p, [dealerId]: { status: "error", error: err.message } })),
      );
  };

  const togglePage = (dealerId) => {
    setExpanded((cur) => (cur === dealerId ? null : dealerId));
    if (pages[dealerId]) return;
    loadPage(dealerId);
  };

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
                      <Th>Landing Page</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {dealers.map((d) => (
                      <Fragment key={d.id}>
                        <tr style={{ borderTop: "1px solid #f0f0f0" }}>
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
                          <Td>
                            <button onClick={() => togglePage(d.id)} style={{
                              background: expanded === d.id ? RED : "#fff",
                              color: expanded === d.id ? "#fff" : RED,
                              border: `1.5px solid ${RED}`, borderRadius: 8,
                              padding: "6px 12px", fontSize: 12.5, fontWeight: 800,
                              cursor: "pointer", whiteSpace: "nowrap",
                            }}>
                              {expanded === d.id ? "Hide ▲" : "View ▾"}
                            </button>
                          </Td>
                        </tr>
                        {expanded === d.id && (
                          <tr style={{ background: "#fafafa" }}>
                            <td colSpan={8} style={{ padding: "0 16px 18px" }}>
                              <LandingPagePanel state={pages[d.id]} onRefresh={() => loadPage(d.id)} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
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
function LandingPagePanel({ state, onRefresh }) {
  const [pendingSpotId, setPendingSpotId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const markSold = async (spotId) => {
    if (pendingSpotId) return;
    setActionError(null);
    setPendingSpotId(spotId);
    try {
      const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${baseUrl}/api/admin/spots/${spotId}/mark-sold`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Server returned ${res.status}`);
      if (onRefresh) await onRefresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setPendingSpotId(null);
    }
  };

  if (!state || state.status === "loading") {
    return <div style={{ padding: "16px 0", color: "#666", fontSize: 13 }}>Loading landing page…</div>;
  }
  if (state.status === "error") {
    return (
      <div style={{ padding: "16px 0", color: "#991b1b", fontSize: 13 }}>
        Could not load landing page: {state.error}
      </div>
    );
  }
  const { page, summary, spots } = state.data || {};
  if (!page) {
    return (
      <div style={{ padding: "16px 0", color: "#92400e", fontSize: 13 }}>
        No landing page yet. It's auto-created when the dealer's campaign is activated.
      </div>
    );
  }
  const money = (cents) => `$${((cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
  return (
    <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        {page.url ? (
          <a href={page.url} target="_blank" rel="noreferrer" style={{
            fontSize: 13.5, fontWeight: 800, color: RED, textDecoration: "none",
            background: "#fff", border: `1.5px solid ${RED}`, borderRadius: 8, padding: "8px 14px",
          }}>
            🔗 {page.url} ↗
          </a>
        ) : (
          <span style={{ fontSize: 13, color: "#92400e" }}>No public slug assigned yet.</span>
        )}
        <span style={{
          background: page.published ? "#f0fdf4" : "#fffbeb",
          color: page.published ? "#15803d" : "#92400e",
          borderRadius: 999, padding: "4px 12px", fontSize: 11, fontWeight: 800,
          textTransform: "uppercase", letterSpacing: 0.4,
        }}>
          {page.published ? "Published" : "Unpublished"}
        </span>
        {page.territory && (
          <span style={{ fontSize: 12.5, color: "#666" }}>{page.territory}</span>
        )}
      </div>

      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
          <MiniStat label="Sold" value={`${summary.soldSpots}/${summary.totalSpots}`} />
          <MiniStat label="Front Sold" value={summary.frontSold} />
          <MiniStat label="Back Sold" value={summary.backSold} />
          <MiniStat label="Available" value={summary.availableSpots} />
          <MiniStat label="Revenue" value={money(summary.revenueCents)} color="#15803d" />
        </div>
      )}

      {Array.isArray(spots) && spots.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280" }}>
                <th style={{ padding: "6px 10px", fontWeight: 700 }}>Slot</th>
                <th style={{ padding: "6px 10px", fontWeight: 700 }}>Side</th>
                <th style={{ padding: "6px 10px", fontWeight: 700 }}>Size</th>
                <th style={{ padding: "6px 10px", fontWeight: 700 }}>Status</th>
                <th style={{ padding: "6px 10px", fontWeight: 700 }}>Business</th>
                <th style={{ padding: "6px 10px", fontWeight: 700 }}>Price</th>
                <th style={{ padding: "6px 10px", fontWeight: 700 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {spots.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{s.gridArea}</td>
                  <td style={{ padding: "6px 10px" }}>{s.side}</td>
                  <td style={{ padding: "6px 10px" }}>{s.size}</td>
                  <td style={{ padding: "6px 10px" }}>
                    <span style={{
                      color: s.status === "paid" ? "#15803d" : s.status === "reserved" ? "#92400e" : "#6b7280",
                      fontWeight: 700,
                    }}>{s.status}</span>
                  </td>
                  <td style={{ padding: "6px 10px" }}>{s.businessName || "—"}</td>
                  <td style={{ padding: "6px 10px" }}>{money(s.price)}</td>
                  <td style={{ padding: "6px 10px" }}>
                    {s.status === "paid" ? (
                      <span style={{ color: "#9ca3af", fontSize: 11.5 }}>—</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => markSold(s.id)}
                        disabled={!!pendingSpotId}
                        style={{
                          background: "#fff", border: `1.5px solid ${RED}`, color: RED,
                          borderRadius: 7, padding: "4px 10px", fontSize: 11.5, fontWeight: 800,
                          cursor: pendingSpotId ? "default" : "pointer",
                          opacity: pendingSpotId && pendingSpotId !== s.id ? 0.5 : 1,
                        }}
                      >
                        {pendingSpotId === s.id ? "Marking…" : "Mark sold"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {actionError && (
            <div style={{ marginTop: 10, color: "#991b1b", fontSize: 12.5 }}>
              Could not mark sold: {actionError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color = "#111" }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "10px 14px",
      border: "1px solid #eee" }}>
      <div style={{ fontSize: 10.5, color: "#888", textTransform: "uppercase",
        fontWeight: 800, letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 900, color, fontFamily: "Georgia,serif" }}>{value}</div>
    </div>
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
