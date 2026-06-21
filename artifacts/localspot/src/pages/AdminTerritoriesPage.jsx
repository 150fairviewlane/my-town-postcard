import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import AdminShell from "../components/AdminShell";

const BURGUNDY = "#991b1b";

const STATUS_COLORS = {
  available:  { bg: "#f0fdf4", color: "#15803d" },
  reserved:   { bg: "#fffbeb", color: "#92400e" },
  sold:       { bg: "#fef2f2", color: BURGUNDY },
  pending:    { bg: "#eff6ff", color: "#1d4ed8" },
};

function StatusPill({ status }) {
  const s = STATUS_COLORS[status] ?? { bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{
      background: s.bg, color: s.color, borderRadius: 999,
      padding: "3px 10px", fontSize: 11, fontWeight: 800,
      textTransform: "uppercase", letterSpacing: 0.5,
    }}>
      {status ?? "unknown"}
    </span>
  );
}

function TerritoriesContent({ token }) {
  const [territories, setTerritories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  useEffect(() => {
    fetch(`${base}/api/territories`)
      .then(r => r.json())
      .then(data => setTerritories(Array.isArray(data) ? data : []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = territories.filter(t => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (t.name ?? "").toLowerCase().includes(q) ||
      (t.state ?? "").toLowerCase().includes(q) ||
      (t.id ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ padding: "32px 32px 48px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 26, color: "#111", fontFamily: "Georgia, serif" }}>Territories</div>
          <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>
            {territories.length} registered
          </div>
        </div>
        <Link
          href="/admin/territories/custom"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: BURGUNDY, color: "#fff", borderRadius: 9,
            padding: "9px 18px", fontSize: 13, fontWeight: 800,
            textDecoration: "none",
          }}
        >
          ➕ New Territory
        </Link>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 18 }}>
        <input
          type="text"
          placeholder="Search by name, state, or ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: "9px 14px", borderRadius: 9, border: "1.5px solid #e5e7eb",
            fontSize: 13, outline: "none", fontFamily: "system-ui, sans-serif",
            width: "100%", maxWidth: 380, boxSizing: "border-box", background: "#fff",
          }}
        />
      </div>

      {loading && (
        <div style={{ color: "#9ca3af", fontSize: 14, padding: "40px 0" }}>Loading territories…</div>
      )}
      {error && (
        <div style={{ color: BURGUNDY, fontSize: 13, padding: "20px 0" }}>Failed to load: {error}</div>
      )}

      {!loading && !error && (
        <>
          {filtered.length === 0 && (
            <div style={{ background: "#fff", borderRadius: 12, padding: "48px 24px", textAlign: "center", color: "#9ca3af", border: "1px solid #f3f4f6" }}>
              {territories.length === 0 ? (
                <>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🗺</div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>No territories yet</div>
                  <Link href="/admin/territories/custom" style={{ color: BURGUNDY, fontWeight: 700, fontSize: 13 }}>Create your first territory →</Link>
                </>
              ) : (
                <div style={{ fontSize: 14 }}>No territories match "{search}"</div>
              )}
            </div>
          )}

          {filtered.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #f3f4f6", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ background: "#f9fafb" }}>
                  <tr>
                    {["Name", "State", "Status", "Type", "ID", "Actions"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: 0.5, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <tr key={t.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "#111" }}>{t.name}</td>
                      <td style={{ padding: "12px 14px", fontSize: 13, color: "#374151" }}>{t.state ?? "—"}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <StatusPill status={t.status} />
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 12, color: "#6b7280", textTransform: "capitalize" }}>
                        {t.type ?? "—"}
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{t.id}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {t.slug && (
                            <a
                              href={`/${t.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: 11, fontWeight: 700, color: "#1d4ed8",
                                background: "#eff6ff", border: "1px solid #bfdbfe",
                                borderRadius: 6, padding: "3px 9px", textDecoration: "none",
                              }}
                            >
                              View Page ↗
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminTerritoriesPage() {
  const [token] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("admin_token") : null
  );
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!token) navigate("/admin");
  }, [token, navigate]);

  if (!token) return null;

  return (
    <AdminShell>
      <TerritoriesContent token={token} />
    </AdminShell>
  );
}
