import { useState, useEffect } from "react";
import { Link } from "wouter";
import AdminShell from "../components/AdminShell";
import DealerTerritoryOverview from "../components/DealerTerritoryOverview";

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

  // Change-email modal state
  const [emailModal, setEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState(null);

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

  function openEmailModal() {
    setNewEmail(dealer?.email ?? "");
    setEmailError(null);
    setEmailModal(true);
  }

  async function saveEmail() {
    if (!newEmail.trim()) return;
    setEmailSaving(true);
    setEmailError(null);
    try {
      const res = await fetch(`${baseUrl}/api/admin/dealers/${dealerId}/email`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Server returned ${res.status}`);
      setData((prev) => prev ? { ...prev, dealer: { ...prev.dealer, email: body.email } } : prev);
      setEmailModal(false);
    } catch (err) {
      setEmailError(err.message);
    } finally {
      setEmailSaving(false);
    }
  }

  return (
    <AdminShell>
      <div style={{ padding: "28px 28px 48px", maxWidth: 1100, margin: "0 auto" }}>

        {loading && (
          <div style={{ background: "#fff", borderRadius: 14, padding: 48, textAlign: "center", color: "#9ca3af" }}>
            Loading dealer…
          </div>
        )}

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
                {/* Email field with change button */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>
                    Email
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13.5, color: "#111", fontFamily: "monospace", fontWeight: 600 }}>
                      {dealer.email}
                    </span>
                    <button
                      onClick={openEmailModal}
                      title="Change email address"
                      style={{
                        background: "none", border: "1px solid #d1d5db", borderRadius: 6,
                        padding: "2px 8px", fontSize: 11, fontWeight: 700, color: "#6b7280",
                        cursor: "pointer", lineHeight: 1.6,
                      }}
                    >
                      ✏️ Change
                    </button>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>
                    Company Email
                  </div>
                  {dealer.companyEmail ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13.5, color: "#15803d", fontFamily: "monospace", fontWeight: 700 }}>
                        {dealer.companyEmail}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "#6b7280", background: "#f3f4f6", borderRadius: 999, padding: "1px 7px", letterSpacing: 0.3, textTransform: "uppercase" }}>
                        Forwarding
                      </span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 13.5, color: "#9ca3af", fontStyle: "italic" }}>Not provisioned</span>
                  )}
                </div>
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

      {/* ── Change Email Modal ─────────────────────────────────────────── */}
      {emailModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setEmailModal(false); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div style={{
            background: "#fff", borderRadius: 14, padding: "28px 32px",
            width: 420, maxWidth: "90vw",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: "#111", marginBottom: 6 }}>
              Change Email Address
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
              This is the address the dealer uses to log in and receive notifications.
            </div>

            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
              New email address
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveEmail(); if (e.key === "Escape") setEmailModal(false); }}
              autoFocus
              style={{
                width: "100%", boxSizing: "border-box",
                border: "1.5px solid #d1d5db", borderRadius: 8,
                padding: "10px 12px", fontSize: 14, fontFamily: "monospace",
                outline: "none", marginBottom: emailError ? 8 : 20,
              }}
            />

            {emailError && (
              <div style={{
                background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
                padding: "8px 12px", fontSize: 13, color: "#991b1b", marginBottom: 16,
              }}>
                {emailError}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setEmailModal(false)}
                disabled={emailSaving}
                style={{
                  background: "#fff", color: "#374151", border: "1.5px solid #d1d5db",
                  borderRadius: 8, padding: "9px 20px", fontSize: 13.5, fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveEmail}
                disabled={emailSaving || !newEmail.trim() || newEmail.trim() === dealer?.email}
                style={{
                  background: RED, color: "#fff", border: "none",
                  borderRadius: 8, padding: "9px 20px", fontSize: 13.5, fontWeight: 700,
                  cursor: emailSaving ? "default" : "pointer",
                  opacity: (emailSaving || !newEmail.trim() || newEmail.trim() === dealer?.email) ? 0.6 : 1,
                }}
              >
                {emailSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
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
