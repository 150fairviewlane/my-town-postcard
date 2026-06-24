import { useEffect, useState, useMemo, useCallback } from "react";
import { useLocation, Link } from "wouter";
import AdminShell from "../components/AdminShell";

const RED = "#7B1418";
const GOLD = "#C9A84C";

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch { return iso; }
}

function formatPrice(cents) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function exportCsv(rows) {
  const headers = [
    "Dealer", "Business Name", "Category", "Contact Email", "Contact Phone",
    "Size", "Price", "Campaign", "Purchase Date", "Tracking Code",
  ];
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) =>
      [
        r.dealerName,
        r.businessName,
        r.businessCategory,
        r.contactEmail,
        r.contactPhone,
        r.size.toUpperCase(),
        (r.price / 100).toFixed(2),
        r.campaignName,
        r.purchasedAt ? new Date(r.purchasedAt).toLocaleDateString("en-US") : "",
        r.trackingCode ?? "",
      ]
        .map(escape)
        .join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paid-customers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Collapsible dealer section ───────────────────────────────────────────────

function DealerSection({ dealerName, dealerEmail, rows, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const revenue = rows.reduce((s, r) => s + r.price, 0);

  const thStyle = {
    padding: "8px 12px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#6b7280",
    borderBottom: "1px solid #e5e7eb",
    background: "#f9fafb",
    whiteSpace: "nowrap",
  };
  const tdStyle = { padding: "9px 12px", fontSize: 13, borderBottom: "1px solid #f3f4f6", verticalAlign: "top" };

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      overflow: "hidden",
      marginBottom: 16,
    }}>
      {/* Section header */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "14px 18px",
          background: open ? "#fdf8f0" : "#fff",
          border: "none",
          cursor: "pointer",
          borderBottom: open ? `2px solid ${GOLD}` : "none",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{
            fontFamily: "Georgia, serif",
            fontWeight: 900,
            fontSize: 16,
            color: RED,
          }}>
            {dealerName}
          </span>
          {dealerEmail && (
            <span style={{ fontSize: 12, color: "#9ca3af" }}>{dealerEmail}</span>
          )}
          <span style={{
            background: "#fef2f2",
            color: RED,
            borderRadius: 999,
            padding: "2px 10px",
            fontSize: 11,
            fontWeight: 800,
          }}>
            {rows.length} customer{rows.length !== 1 ? "s" : ""}
          </span>
          <span style={{
            background: "#f9f5f0",
            color: "#92400e",
            borderRadius: 999,
            padding: "2px 10px",
            fontSize: 11,
            fontWeight: 800,
          }}>
            {formatPrice(revenue)}
          </span>
        </div>
        <span style={{
          fontSize: 13,
          color: "#9ca3af",
          transform: open ? "rotate(180deg)" : "none",
          transition: "transform 0.2s",
        }}>
          ▾
        </span>
      </button>

      {open && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {[
                  "Business Name", "Category", "Contact Email", "Contact Phone",
                  "Size", "Price", "Campaign", "Purchase Date", "Tracking Code",
                ].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.spotId} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ ...tdStyle, fontWeight: 700, color: "#111" }}>{r.businessName || "—"}</td>
                  <td style={{ ...tdStyle, color: "#6b7280" }}>{r.businessCategory || "—"}</td>
                  <td style={tdStyle}>{r.contactEmail || "—"}</td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{r.contactPhone || "—"}</td>
                  <td style={{ ...tdStyle, textTransform: "uppercase", fontWeight: 700 }}>{r.size}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: "#111" }}>{formatPrice(r.price)}</td>
                  <td style={tdStyle}>
                    <Link
                      href={`/admin/territories/detail?id=${r.campaignId}`}
                      style={{ color: RED, textDecoration: "underline", fontWeight: 600 }}
                    >
                      {r.campaignName}
                    </Link>
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#6b7280" }}>{formatDate(r.purchasedAt)}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12, color: "#374151" }}>
                    {r.trackingCode || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminPaidCustomersPage() {
  const [, navigate] = useLocation();
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;

  const [allRows, setAllRows] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest"); // "newest" | "dealer"

  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

  useEffect(() => {
    if (!token) { navigate("/admin"); return; }
    let cancelled = false;
    fetch(`${base}/api/admin/paid-customers`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Server returned ${res.status}`);
        if (!cancelled) setAllRows(body.customers ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          if (err.message === "Unauthorized") { navigate("/admin"); return; }
          setError(err.message);
        }
      });
    return () => { cancelled = true; };
  }, [token, navigate, base]);

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!allRows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((r) =>
      r.businessName.toLowerCase().includes(q) ||
      r.contactEmail.toLowerCase().includes(q) ||
      r.dealerName.toLowerCase().includes(q)
    );
  }, [allRows, search]);

  // Group by dealer, preserving intra-group order from the server (newest first)
  const groups = useMemo(() => {
    const map = new Map(); // dealerKey → { dealerName, dealerEmail, dealerId, rows }
    for (const r of filtered) {
      const key = r.dealerId == null ? "house" : String(r.dealerId);
      if (!map.has(key)) {
        map.set(key, {
          key,
          dealerName: r.dealerName,
          dealerEmail: r.dealerEmail,
          dealerId: r.dealerId,
          rows: [],
        });
      }
      map.get(key).rows.push(r);
    }
    const arr = Array.from(map.values());

    if (sort === "dealer") {
      arr.sort((a, b) => {
        // "House / No Dealer" always last
        if (a.dealerId == null) return 1;
        if (b.dealerId == null) return -1;
        return a.dealerName.localeCompare(b.dealerName);
      });
    } else {
      // newest first: sort groups by the most-recent purchasedAt in the group
      arr.sort((a, b) => {
        const latestA = a.rows[0]?.purchasedAt ?? "";
        const latestB = b.rows[0]?.purchasedAt ?? "";
        if (a.dealerId == null) return 1;
        if (b.dealerId == null) return -1;
        return latestB > latestA ? 1 : -1;
      });
    }
    return arr;
  }, [filtered, sort]);

  const totalCustomers = filtered.length;
  const totalRevenue = filtered.reduce((s, r) => s + r.price, 0);

  if (!token) return null;
  if (error) return (
    <AdminShell>
      <div style={{ padding: 32, color: "#991b1b", fontFamily: "DM Sans, sans-serif" }}>
        Error: {error}
      </div>
    </AdminShell>
  );

  return (
    <AdminShell>
      <div style={{ padding: 24, fontFamily: "DM Sans, sans-serif" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{
                margin: 0,
                fontFamily: "Georgia, serif",
                fontSize: 28,
                fontWeight: 900,
                color: RED,
              }}>
                Paid Customers
              </h1>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                Every paid ad spot across all campaigns, grouped by dealer territory
              </div>
            </div>
            <button
              onClick={() => exportCsv(filtered)}
              disabled={!allRows || filtered.length === 0}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                border: `1.5px solid ${GOLD}`,
                background: "#fff",
                color: "#92400e",
                fontSize: 13,
                fontWeight: 700,
                cursor: allRows && filtered.length > 0 ? "pointer" : "default",
                opacity: allRows && filtered.length > 0 ? 1 : 0.4,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              ⬇ Export CSV
            </button>
          </div>

          {/* Summary cards */}
          {allRows && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
              <SummaryCard label="Total Paid Customers" value={String(totalCustomers)} />
              <SummaryCard label="Total Revenue" value={formatPrice(totalRevenue)} />
              <SummaryCard label="Dealer Territories" value={String(groups.filter((g) => g.dealerId != null).length)} />
            </div>
          )}

          {/* Controls */}
          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Search by business, email, or dealer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                minWidth: 220,
                padding: "9px 14px",
                borderRadius: 8,
                border: "1.5px solid #d1d5db",
                fontSize: 13,
                outline: "none",
                fontFamily: "DM Sans, sans-serif",
              }}
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              style={{
                padding: "9px 12px",
                borderRadius: 8,
                border: "1.5px solid #d1d5db",
                fontSize: 13,
                background: "#fff",
                cursor: "pointer",
                fontFamily: "DM Sans, sans-serif",
                color: "#374151",
              }}
            >
              <option value="newest">Sort: Newest first</option>
              <option value="dealer">Sort: Dealer name (A–Z)</option>
            </select>
          </div>

          {/* Loading state */}
          {allRows === null && (
            <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
              Loading paid customers…
            </div>
          )}

          {/* Empty state */}
          {allRows !== null && allRows.length === 0 && (
            <div style={{
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
              padding: "40px 24px", textAlign: "center", color: "#9ca3af", fontSize: 14,
            }}>
              No paid customers yet.
            </div>
          )}

          {/* No results after filtering */}
          {allRows !== null && allRows.length > 0 && filtered.length === 0 && (
            <div style={{
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
              padding: "32px 24px", textAlign: "center", color: "#9ca3af", fontSize: 14,
            }}>
              No customers match "{search}".
            </div>
          )}

          {/* Dealer groups */}
          {groups.map((g) => (
            <DealerSection
              key={g.key}
              dealerName={g.dealerName}
              dealerEmail={g.dealerEmail}
              rows={g.rows}
              defaultOpen={groups.length <= 5}
            />
          ))}

        </div>
      </div>
    </AdminShell>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: "14px 18px",
    }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color: "#111", marginTop: 6, fontFamily: "Georgia, serif" }}>
        {value}
      </div>
    </div>
  );
}
