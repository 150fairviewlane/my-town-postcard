import { useState, useEffect } from "react";
import { Link } from "wouter";

// ─────────────────────────────────────────────────────────────────────────────
//   Standalone Discover New Leads page
//   Route: /admin/discover
// ─────────────────────────────────────────────────────────────────────────────

const inputStyle = {
  width: "100%", padding: "10px 14px", borderRadius: 8,
  border: "1.5px solid #e5e7eb", fontSize: 14, outline: "none",
  fontFamily: "system-ui, sans-serif", boxSizing: "border-box", background: "#fff",
};

export default function DiscoverLeadsPage() {
  const [token, setToken] = useState(() => localStorage.getItem("admin_token"));
  const [form, setForm] = useState({ category: "", city: "", state: "GA" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  // Auto-login with stored token, same pattern as OutreachPage
  useEffect(() => {
    if (token) return;
    fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "localspot-admin-2025" }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.token) {
          localStorage.setItem("admin_token", d.token);
          setToken(d.token);
        }
      })
      .catch(() => {});
  }, []);

  const setField = (k) => (e) =>
    setForm((f) => ({
      ...f,
      [k]: k === "state" ? e.target.value.toUpperCase().slice(0, 2) : e.target.value,
    }));

  const handleDiscover = async (e) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const resp = await fetch(`${basePath}/api/admin/outreach/discover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `Server error ${resp.status}`);
      const entry = { ...form, ...data, at: new Date().toLocaleTimeString() };
      setResult(entry);
      setHistory((h) => [entry, ...h].slice(0, 10));
    } catch (err) {
      setError(err.message || "Discovery failed");
    } finally {
      setBusy(false);
    }
  };

  if (!token) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "system-ui, sans-serif" }}>
      {/* Top bar */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e5e7eb",
        padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ fontWeight: 900, fontSize: 20, color: "#111", fontFamily: "Georgia,serif" }}>
            🔍 Discover New Leads
          </div>
          <Link href="/admin" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
            ← Back to Dashboard
          </Link>
          <Link href="/admin/outreach" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
            📞 Outreach Tracker
          </Link>
        </div>
        <button
          onClick={() => { localStorage.removeItem("admin_token"); window.location.reload(); }}
          style={{
            background: "#fff", border: "1px solid #d1d5db", borderRadius: 8,
            padding: "7px 14px", fontSize: 13, color: "#374151", cursor: "pointer", fontWeight: 700,
          }}
        >
          Logout
        </button>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px" }}>

        {/* Search card */}
        <div style={{
          background: "#fff", border: "1.5px solid #fca5a5", borderRadius: 16,
          padding: "28px 28px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 24,
        }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 900, fontSize: 22, color: "#991b1b", fontFamily: "Georgia,serif" }}>
              Find businesses by category &amp; city
            </div>
            <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>
              Searches Google Places, scrapes each website for an email address, and adds new rows to your Outreach Tracker automatically.
            </div>
          </div>

          <form onSubmit={handleDiscover}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "2 1 220px" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Category
                </span>
                <input
                  required
                  value={form.category}
                  onChange={setField("category")}
                  placeholder="e.g. contractors, restaurants, dentists"
                  style={inputStyle}
                  disabled={busy}
                  autoFocus
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  City
                </span>
                <input
                  required
                  value={form.city}
                  onChange={setField("city")}
                  placeholder="e.g. Cleveland"
                  style={inputStyle}
                  disabled={busy}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "0 1 90px" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  State
                </span>
                <input
                  value={form.state}
                  onChange={setField("state")}
                  maxLength={2}
                  style={inputStyle}
                  disabled={busy}
                />
              </label>
              <button
                type="submit"
                disabled={busy || !form.category.trim() || !form.city.trim()}
                style={{
                  background: busy ? "#9ca3af" : "#991b1b",
                  color: "#fff", border: "none", borderRadius: 8,
                  padding: "10px 24px", fontSize: 14, fontWeight: 800,
                  cursor: busy ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap", height: 42, alignSelf: "flex-end",
                  transition: "background 0.15s",
                }}
              >
                {busy ? "Searching…" : "🔍 Discover"}
              </button>
            </div>
          </form>

          {/* Loading state */}
          {busy && (
            <div style={{
              marginTop: 18, background: "#fef9f0", border: "1px solid #fde68a",
              borderRadius: 10, padding: "14px 18px",
              display: "flex", alignItems: "flex-start", gap: 12,
            }}>
              <div style={{
                width: 20, height: 20, border: "2.5px solid #fde68a",
                borderTopColor: "#d97706", borderRadius: "50%",
                animation: "spin 0.9s linear infinite", flexShrink: 0, marginTop: 1,
              }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#92400e" }}>
                  Searching Google Places and checking websites for emails…
                </div>
                <div style={{ fontSize: 13, color: "#b45309", marginTop: 3 }}>
                  This can take 1–2 minutes for a full batch. Don't close the tab.
                </div>
              </div>
            </div>
          )}

          {/* Success result */}
          {result && !busy && (
            <div style={{
              marginTop: 18, background: "#f0fdf4", border: "1.5px solid #86efac",
              borderRadius: 10, padding: "16px 20px",
            }}>
              <div style={{ fontWeight: 900, color: "#15803d", fontSize: 16, marginBottom: 8 }}>
                ✅ Discovery complete
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: 12, marginBottom: 14,
              }}>
                {[
                  { label: "Businesses found", value: result.found },
                  { label: "New leads added",  value: result.newLeads },
                  { label: "With email",        value: result.withEmail },
                  { label: "Already in list",   value: result.skippedDuplicates },
                ].map((s) => (
                  <div key={s.label} style={{
                    background: "#fff", borderRadius: 8, padding: "10px 14px",
                    border: "1px solid #bbf7d0",
                  }}>
                    <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: "#15803d", fontFamily: "Georgia,serif" }}>
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>
              <Link
                href="/admin/outreach"
                style={{
                  display: "inline-block", background: "#15803d", color: "#fff",
                  borderRadius: 8, padding: "9px 18px", fontSize: 13,
                  fontWeight: 800, textDecoration: "none",
                }}
              >
                View leads in Outreach Tracker →
              </Link>
            </div>
          )}

          {/* Error */}
          {error && !busy && (
            <div style={{
              marginTop: 18, background: "#fef2f2", border: "1.5px solid #fecaca",
              borderRadius: 10, padding: "14px 18px", fontSize: 14, color: "#991b1b", fontWeight: 600,
            }}>
              ❌ {error}
            </div>
          )}
        </div>

        {/* Run history */}
        {history.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              This session's runs
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {history.map((h, i) => (
                <div key={i} style={{
                  background: "#fff", border: "1px solid #f3f4f6", borderRadius: 10,
                  padding: "12px 16px", display: "flex", alignItems: "center",
                  justifyContent: "space-between", flexWrap: "wrap", gap: 8,
                  fontSize: 13,
                }}>
                  <div>
                    <span style={{ fontWeight: 700, color: "#111" }}>{h.category}</span>
                    <span style={{ color: "#6b7280" }}> in {h.city}, {h.state}</span>
                    <span style={{ color: "#9ca3af", marginLeft: 8, fontSize: 11 }}>{h.at}</span>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#374151" }}>
                    <span>🔎 {h.found} found</span>
                    <span style={{ color: "#15803d", fontWeight: 700 }}>+{h.newLeads} new</span>
                    <span>📧 {h.withEmail} with email</span>
                    {h.skippedDuplicates > 0 && (
                      <span style={{ color: "#9ca3af" }}>{h.skippedDuplicates} skipped</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
