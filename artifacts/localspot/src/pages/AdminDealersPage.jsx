import { useState, useEffect, Fragment } from "react";
import { useLocation } from "wouter";
import AdminShell from "../components/AdminShell";
import CreateTerritoryForm from "../components/CreateTerritoryForm";

const RED = "#7B1418";
const GOLD = "#C9A84C";

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

function authHeaders() {
  const token = localStorage.getItem("admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Delete modal ─────────────────────────────────────────────────────────────
// Two-step confirmation: step "warn" shows the warning, step "confirm" fires the delete.

function DeleteModal({ dealer, preview, onClose, onSuccess }) {
  const [step, setStep] = useState("warn");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

  const totalSpots = preview
    ? preview.campaigns.reduce((s, c) => s + c.totalSpots, 0)
    : 0;
  const paidSpots = preview
    ? preview.campaigns.reduce((s, c) => s + c.paidSpots, 0)
    : 0;
  const hasPaid = paidSpots > 0;
  const territoryNames = (() => {
    if (!preview) return null;
    const names = preview.campaigns.map((c) => c.name).filter(Boolean);
    return names.length > 0 ? names.join(", ") : null;
  })();

  async function doDelete() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${baseUrl}/api/admin/dealers/${dealer.id}?mode=archive`, {
        method: "DELETE",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Server returned ${res.status}`);
      onSuccess("archive", body.dealerName);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  const overlay = {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.55)",
    zIndex: 9999,
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16,
  };
  const card = {
    background: "#fff",
    borderRadius: 14,
    maxWidth: 460,
    width: "100%",
    padding: "28px 28px 24px",
    boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
    fontFamily: "DM Sans, sans-serif",
  };

  if (step === "warn") {
    return (
      <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div style={card}>
          <div style={{ fontFamily: "Georgia,serif", fontWeight: 900, fontSize: 20, color: "#991b1b", marginBottom: 10 }}>
            Delete dealer?
          </div>
          <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.65, marginBottom: 16 }}>
            You're about to delete <strong>{dealer.name}</strong>
            {dealer.email && <span style={{ color: "#6b7280" }}> ({dealer.email})</span>}.
          </div>

          <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 10, padding: "14px 16px", marginBottom: 18, fontSize: 13.5, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 800, color: "#991b1b", marginBottom: 6 }}>⚠️ This will:</div>
            <ul style={{ margin: 0, paddingLeft: 20, color: "#7f1d1d" }}>
              <li>Archive this dealer to the Former Dealers record</li>
              <li>Release their territory{territoryNames ? ` (${territoryNames})` : ""} back to <em>available</em></li>
              <li>Delete all associated campaigns, spots, and data</li>
              {hasPaid && <li style={{ fontWeight: 700 }}>Remove {paidSpots} paid ad spot record{paidSpots !== 1 ? "s" : ""}</li>}
            </ul>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onClose}
              style={{ flex: 1, padding: "11px 0", borderRadius: 9, border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={() => setStep("confirm")}
              style={{ flex: 1, padding: "11px 0", borderRadius: 9, border: "none", background: "#991b1b", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
            >
              Yes, delete dealer →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // step === "confirm" — second click required
  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div style={card}>
        <div style={{ fontFamily: "Georgia,serif", fontWeight: 900, fontSize: 20, color: "#991b1b", marginBottom: 10 }}>
          Are you sure?
        </div>
        <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.65, marginBottom: 20 }}>
          Click <strong>Delete permanently</strong> to confirm. <strong>{dealer.name}</strong> will be
          archived to Former Dealers, their territory will be released, and all data deleted.
          This cannot be undone.
        </div>

        {err && (
          <div style={{ background: "#fef2f2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14, fontWeight: 600 }}>
            {err}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            disabled={busy}
            onClick={() => { setStep("warn"); setErr(null); }}
            style={{ flex: 1, padding: "11px 0", borderRadius: 9, border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 14, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
          >
            ← Go back
          </button>
          <button
            disabled={busy}
            onClick={doDelete}
            style={{ flex: 1, padding: "11px 0", borderRadius: 9, border: "none", background: busy ? "#9ca3af" : "#7f1d1d", color: "#fff", fontSize: 14, fontWeight: 800, cursor: busy ? "default" : "pointer" }}
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Assign Territory modal (for existing dealers) ─────────────────────────────

function AssignTerritoryModal({ dealer, onClose, onSuccess }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

  async function handleCreated(territory) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${baseUrl}/api/territories/${territory.territoryId}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ dealerId: dealer.id, status: "taken" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Server returned ${res.status}`);
      onSuccess(territory);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.55)", zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, overflowY: "auto",
      }}
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div style={{
        background: "#fff", borderRadius: 14,
        maxWidth: 640, width: "100%",
        padding: "24px 24px 20px",
        boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
        fontFamily: "DM Sans, sans-serif",
        maxHeight: "92vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16, color: "#111", fontFamily: "Georgia,serif" }}>
              Add Territory for {dealer.name}
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
              The new territory will be immediately linked to this dealer.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 20, color: "#9ca3af", cursor: "pointer", padding: "2px 6px" }}
          >
            ✕
          </button>
        </div>

        {err && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
            padding: "10px 14px", fontSize: 13, color: "#991b1b", fontWeight: 600, marginBottom: 14,
          }}>
            ❌ {err}
          </div>
        )}

        {busy ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "#6b7280", fontSize: 14 }}>
            Linking territory to dealer…
          </div>
        ) : (
          <CreateTerritoryForm onCreated={handleCreated} onCancel={onClose} compact />
        )}
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%",
      transform: "translateX(-50%)",
      background: "#111", color: "#fff",
      padding: "12px 22px", borderRadius: 30,
      fontSize: 14, fontWeight: 600,
      boxShadow: "0 8px 32px rgba(0,0,0,.3)",
      zIndex: 10000, whiteSpace: "nowrap",
    }}>
      {message}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminDealersPage() {
  const [, navigate] = useLocation();
  const [dealers, setDealers] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [pages, setPages] = useState({});
  const [impersonating, setImpersonating] = useState(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePreview, setDeletePreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Former dealers archive
  const [formerDealers, setFormerDealers] = useState(null);
  const [showArchive, setShowArchive] = useState(false);

  // Assign territory to existing dealer
  const [assigningTerritoryTo, setAssigningTerritoryTo] = useState(null);

  // Create admin dealer form state
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(1); // 1 = personal info, 2 = territory form expanded
  const [newTerritory, setNewTerritory] = useState(null); // territory created inline
  const [createForm, setCreateForm] = useState({ name: "", email: "", phone: "", password: "", territoryId: "", isComped: false });
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createResult, setCreateResult] = useState(null);
  const [territories, setTerritories] = useState([]);

  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

  const loadDealers = (token) => {
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

  const loadFormerDealers = (token) => {
    if (!token) return;
    fetch(`${baseUrl}/api/admin/former-dealers`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.ok) setFormerDealers(body.formerDealers || []);
      })
      .catch(() => {});
  };

  const loadPage = (dealerId) => {
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

  const impersonateDealer = async (dealerId) => {
    if (impersonating) return;
    setImpersonating(dealerId);
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${baseUrl}/api/admin/dealers/${dealerId}/impersonate`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Failed: ${res.status}`);
      if (body.token) sessionStorage.setItem("dealer_token", body.token);
      window.location.href = `${baseUrl}/dealer/dashboard`;
    } catch (err) {
      alert(`Could not impersonate: ${err.message}`);
    } finally {
      setImpersonating(null);
    }
  };

  const openDeleteModal = async (dealer) => {
    setDeleteTarget(dealer);
    setDeletePreview(null);
    setPreviewLoading(true);
    try {
      const res = await fetch(
        `${baseUrl}/api/admin/dealers/${dealer.id}/delete-preview`,
        { headers: authHeaders() },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Server returned ${res.status}`);
      setDeletePreview(body);
    } catch {
      setDeletePreview({ dealerName: dealer.name, campaigns: [] });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDeleteSuccess = (mode, dealerName) => {
    setDeleteTarget(null);
    setDeletePreview(null);
    const msg =
      mode === "deactivate" ? `${dealerName} deactivated` :
      mode === "dealer-only" ? `${dealerName} removed (campaign kept)` :
      mode === "archive"    ? `${dealerName} deleted and archived` :
      `${dealerName} fully deleted`;
    setToast(msg);
    const token = localStorage.getItem("admin_token");
    if (token) loadDealers(token);
    loadFormerDealers(token || localStorage.getItem("admin_token"));
  };

  const handleAssignedToDealer = (dealer, territory) => {
    setAssigningTerritoryTo(null);
    setToast(`Territory assigned — landing page ready`);
    const token = localStorage.getItem("admin_token");
    if (token) loadDealers(token);
  };

  useEffect(() => {
    const stored = localStorage.getItem("admin_token");
    if (stored) {
      loadDealers(stored);
      loadFormerDealers(stored);
    } else {
      fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "localspot-admin-2025" }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.token) {
            localStorage.setItem("admin_token", d.token);
            loadDealers(d.token);
            loadFormerDealers(d.token);
          }
        })
        .catch((err) => setError(err.message));
    }
  }, []);

  // Fetch available territories for the create-dealer dropdown
  useEffect(() => {
    fetch(`${baseUrl}/api/territories`)
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : (d.territories || []);
        setTerritories(list.filter(t => t.status === "available"));
      })
      .catch(() => {});
  }, []);

  const handleCreateDealer = async (e) => {
    e.preventDefault();
    setCreateBusy(true);
    setCreateError(null);
    setCreateResult(null);
    try {
      const token = localStorage.getItem("admin_token");
      const body = { ...createForm, isComped: createForm.isComped === true };
      // Prefer the inline-created territory over the dropdown selection
      const effectiveTerritoryId = newTerritory?.id || body.territoryId;
      if (effectiveTerritoryId) body.territoryId = effectiveTerritoryId;
      else delete body.territoryId;
      if (!body.phone) delete body.phone;
      const res = await fetch(`${baseUrl}/api/admin/dealers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      setCreateResult(data.dealer);
      setCreateForm({ name: "", email: "", phone: "", password: "", territoryId: "" });
      setNewTerritory(null);
      setCreateStep(1);
      loadDealers(token);
      const msg = data.landingPageCreated
        ? `${data.dealer.name} created — landing page ready`
        : `${data.dealer.name} created`;
      setToast(msg);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreateBusy(false);
    }
  };

  // Called when territory is created inline in the Add Dealer flow
  const handleTerritoryCreatedInline = (territory) => {
    setNewTerritory({ id: territory.territoryId, name: territory.territoryId });
    setCreateStep(1);
  };

  function resetCreateForm() {
    setShowCreate(false);
    setCreateResult(null);
    setCreateError(null);
    setCreateStep(1);
    setNewTerritory(null);
    setCreateForm({ name: "", email: "", phone: "", password: "", territoryId: "", isComped: false });
  }

  useEffect(() => {
    if (!dealers) return;
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id");
    if (!idParam) return;
    const dealerId = parseInt(idParam, 10);
    if (!Number.isFinite(dealerId)) return;
    const exists = dealers.some((d) => d.id === dealerId);
    if (!exists) return;
    setExpanded(dealerId);
    loadPage(dealerId);
  }, [dealers]);

  return (
    <AdminShell>
      {/* Delete modal */}
      {deleteTarget && (
        <DeleteModal
          dealer={deleteTarget}
          preview={previewLoading ? null : deletePreview}
          onClose={() => { setDeleteTarget(null); setDeletePreview(null); }}
          onSuccess={handleDeleteSuccess}
        />
      )}

      {/* Assign territory modal */}
      {assigningTerritoryTo && (
        <AssignTerritoryModal
          dealer={assigningTerritoryTo}
          onClose={() => setAssigningTerritoryTo(null)}
          onSuccess={(territory) => handleAssignedToDealer(assigningTerritoryTo, territory)}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={`✓ ${toast}`} onDone={() => setToast(null)} />}

      <div style={{ padding: 28, maxWidth: 1240, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontFamily: "Georgia,serif", fontSize: 22, color: "#111" }}>Dealers</h1>
          <button
            onClick={() => {
              if (showCreate) { resetCreateForm(); }
              else { setShowCreate(true); setCreateResult(null); setCreateError(null); }
            }}
            style={{
              fontSize: 13, fontWeight: 700, color: "#fff",
              background: RED, border: "none",
              borderRadius: 8, padding: "7px 14px", cursor: "pointer",
            }}
          >
            + Add Dealer
          </button>
        </div>
        {error && (
          <div style={{ background: "#fef2f2", color: "#991b1b",
            border: "1px solid #fecaca", borderRadius: 10, padding: 16,
            fontSize: 14, fontWeight: 600, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* ── Create Admin Dealer form ─────────────────────────────── */}
        {showCreate && (
          <div style={{
            background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
            padding: 24, marginBottom: 24,
          }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#111", marginBottom: 4 }}>
              Create Dealer Account
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 18 }}>
              Creates an active dealer immediately — no Stripe payment required.
            </div>

            {createResult && (
              <div style={{
                background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10,
                padding: 16, marginBottom: 16,
              }}>
                <div style={{ fontWeight: 700, color: "#166534", fontSize: 14, marginBottom: 8 }}>
                  ✓ Dealer created (ID #{createResult.id})
                </div>
                <div style={{ fontSize: 13, color: "#15803d", marginBottom: 4 }}>
                  <strong>Email:</strong> {createResult.email}
                </div>
                <div style={{ fontSize: 13, color: "#15803d", marginBottom: 4 }}>
                  <strong>Portal login:</strong>{" "}
                  <a
                    href={`${baseUrl}/dealer/login`}
                    target="_blank" rel="noreferrer"
                    style={{ color: "#15803d" }}
                  >
                    {baseUrl || ""}/dealer/login
                  </a>
                </div>
                <div style={{ fontSize: 13, color: "#15803d" }}>
                  <strong>Portal token (for direct access):</strong>{" "}
                  <code style={{ fontSize: 12, background: "#dcfce7", padding: "1px 6px", borderRadius: 4 }}>
                    {createResult.portalToken}
                  </code>
                </div>
                <button
                  onClick={resetCreateForm}
                  style={{ marginTop: 12, fontSize: 12, color: "#166534", background: "none",
                    border: "1px solid #86efac", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
                >
                  Done
                </button>
              </div>
            )}

            {createError && (
              <div style={{
                background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
                padding: 12, marginBottom: 14, fontSize: 13, color: "#991b1b", fontWeight: 600,
              }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateDealer}>
              {/* Step 1 — Personal info (always visible) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
                    Name *
                  </label>
                  <input
                    type="text" required
                    value={createForm.name}
                    onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Jane Smith"
                    style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8,
                      padding: "8px 10px", fontSize: 14, boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
                    Email *
                  </label>
                  <input
                    type="email" required
                    value={createForm.email}
                    onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="jane@example.com"
                    style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8,
                      padding: "8px 10px", fontSize: 14, boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={createForm.phone}
                    onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="(706) 555-1234"
                    style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8,
                      padding: "8px 10px", fontSize: 14, boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 }}>
                    Password * (min 8 chars)
                  </label>
                  <input
                    type="text"
                    required minLength={8}
                    value={createForm.password}
                    onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Set a strong password"
                    style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8,
                      padding: "8px 10px", fontSize: 14, fontFamily: "monospace", boxSizing: "border-box" }}
                  />
                </div>

                {/* Comped checkbox */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={createForm.isComped}
                      onChange={e => setCreateForm(f => ({ ...f, isComped: e.target.checked }))}
                      style={{ width: 16, height: 16, cursor: "pointer", accentColor: RED }}
                    />
                    <span>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: "#111" }}>Comped dealer</span>
                      <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 6 }}>
                        Monthly fee waived — campaigns activate immediately (no Stripe subscription needed)
                      </span>
                    </span>
                  </label>
                </div>

                {/* Territory row */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
                    Link Territory (optional)
                  </label>

                  {/* Green chip when a new territory was created inline */}
                  {newTerritory ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        background: "#f0fdf4", border: "1.5px solid #86efac",
                        borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, color: "#15803d",
                      }}>
                        ✓ {newTerritory.id} — territory created
                        <button
                          type="button"
                          onClick={() => setNewTerritory(null)}
                          style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}
                          title="Clear selection"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <select
                        value={createForm.territoryId}
                        onChange={e => setCreateForm(f => ({ ...f, territoryId: e.target.value }))}
                        disabled={createStep === 2}
                        style={{ flex: 1, border: "1px solid #d1d5db", borderRadius: 8,
                          padding: "8px 10px", fontSize: 14, boxSizing: "border-box", background: "#fff" }}
                      >
                        <option value="">— No territory —</option>
                        {territories.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.id} — {t.name || t.id}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => { setCreateStep(2); setCreateForm(f => ({ ...f, territoryId: "" })); }}
                        disabled={createStep === 2}
                        style={{
                          whiteSpace: "nowrap", background: createStep === 2 ? "#e5e7eb" : "#f0fdf4",
                          color: createStep === 2 ? "#9ca3af" : "#15803d",
                          border: `1.5px solid ${createStep === 2 ? "#d1d5db" : "#86efac"}`,
                          borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700,
                          cursor: createStep === 2 ? "default" : "pointer",
                        }}
                      >
                        ＋ Create New Territory
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2 — inline territory form */}
              {createStep === 2 && (
                <div style={{ marginTop: 8, marginBottom: 16 }}>
                  <CreateTerritoryForm
                    onCreated={handleTerritoryCreatedInline}
                    onCancel={() => setCreateStep(1)}
                    compact
                  />
                </div>
              )}

              {/* Form footer — hide when in step 2 */}
              {createStep === 1 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="submit"
                    disabled={createBusy}
                    style={{
                      background: createBusy ? "#9ca3af" : RED, color: "#fff",
                      border: "none", borderRadius: 8, padding: "9px 20px",
                      fontWeight: 700, fontSize: 14, cursor: createBusy ? "not-allowed" : "pointer",
                    }}
                  >
                    {createBusy ? "Creating…" : "Create Dealer"}
                  </button>
                  <button
                    type="button"
                    onClick={resetCreateForm}
                    style={{
                      background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db",
                      borderRadius: 8, padding: "9px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </form>
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
                  minWidth: 860 }}>
                  <thead>
                    <tr style={{ background: "#fafafa", textAlign: "left" }}>
                      <Th>Dealer</Th>
                      <Th>Status</Th>
                      <Th>Company Email</Th>
                      <Th>Zones</Th>
                      <Th>Households</Th>
                      <Th>Paid Ads</Th>
                      <Th>Signed Up</Th>
                      <Th>Activated</Th>
                      <Th>Landing Page</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {dealers.map((d) => (
                      <Fragment key={d.id}>
                        <tr
                          style={{ borderTop: "1px solid #f0f0f0", cursor: "pointer" }}
                          onClick={() => navigate(`/admin/dealers/${d.id}`)}
                        >
                          <Td>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 700, color: RED, fontSize: 13.5, textDecoration: "underline", textDecorationColor: "transparent", transition: "text-decoration-color .15s" }}
                                onMouseEnter={(e) => e.currentTarget.style.textDecorationColor = RED}
                                onMouseLeave={(e) => e.currentTarget.style.textDecorationColor = "transparent"}
                              >{d.name}</span>
                              {d.isComped && (
                                <span style={{
                                  background: "#eff6ff", color: "#1d4ed8",
                                  border: "1px solid #bfdbfe",
                                  borderRadius: 999, padding: "1px 8px",
                                  fontSize: 10, fontWeight: 800,
                                  textTransform: "uppercase", letterSpacing: 0.4,
                                }}>Comped</span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: "#888" }}>{d.email}</div>
                            {d.phone && (
                              <div style={{ fontSize: 11.5, color: "#888" }}>{d.phone}</div>
                            )}
                          </Td>
                          <Td><StatusPill status={d.status} /></Td>
                          <Td>
                            {d.companyEmail ? (
                              <span style={{ fontSize: 12.5, fontFamily: "monospace", color: "#15803d", fontWeight: 700 }}>{d.companyEmail}</span>
                            ) : (
                              <span style={{ fontSize: 12, color: "#d1d5db" }}>—</span>
                            )}
                          </Td>
                          <Td>
                            {d.zoneNames && d.zoneNames.length > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                {d.zoneNames.map((name) => (
                                  <span key={name} style={{ fontSize: 11, color: "#555", lineHeight: 1.5 }}>{name}</span>
                                ))}
                              </div>
                            ) : (d.territoryCount || "—")}
                          </Td>
                          <Td>~{(d.totalHouseholds || 0).toLocaleString()}</Td>
                          <Td style={{ fontWeight: 700, color: (d.paidAdsCount || 0) > 0 ? "#15803d" : "#9ca3af" }}>
                            {d.paidAdsCount || 0}
                          </Td>
                          <Td style={{ fontSize: 12.5, color: "#666" }}>{formatDate(d.createdAt)}</Td>
                          <Td style={{ fontSize: 12.5, color: "#666" }}>{formatDate(d.activatedAt)}</Td>
                          <Td>
                            <button onClick={(e) => { e.stopPropagation(); togglePage(d.id); }} style={{
                              background: expanded === d.id ? RED : "#fff",
                              color: expanded === d.id ? "#fff" : RED,
                              border: `1.5px solid ${RED}`, borderRadius: 8,
                              padding: "6px 12px", fontSize: 12.5, fontWeight: 800,
                              cursor: "pointer", whiteSpace: "nowrap",
                            }}>
                              {expanded === d.id ? "Hide ▲" : "View ▾"}
                            </button>
                          </Td>
                          <Td>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); impersonateDealer(d.id); }}
                                disabled={impersonating === d.id}
                                style={{
                                  background: "#fffbeb", color: "#92400e",
                                  border: "1.5px solid #fde68a", borderRadius: 8,
                                  padding: "6px 12px", fontSize: 12.5, fontWeight: 800,
                                  cursor: impersonating === d.id ? "default" : "pointer",
                                  whiteSpace: "nowrap",
                                  opacity: impersonating && impersonating !== d.id ? 0.5 : 1,
                                }}
                              >
                                {impersonating === d.id ? "Opening…" : "🔍 Log in as dealer"}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setAssigningTerritoryTo(d); }}
                                title="Add a territory to this dealer"
                                style={{
                                  background: "#f0fdf4", color: "#15803d",
                                  border: "1.5px solid #86efac", borderRadius: 8,
                                  padding: "6px 10px", fontSize: 12.5, fontWeight: 800,
                                  cursor: "pointer", whiteSpace: "nowrap",
                                }}
                              >
                                ＋ Territory
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); openDeleteModal(d); }}
                                title="Remove this dealer"
                                style={{
                                  background: "#fff", color: "#991b1b",
                                  border: "1.5px solid #fecaca", borderRadius: 8,
                                  padding: "6px 10px", fontSize: 14, fontWeight: 800,
                                  cursor: "pointer", lineHeight: 1,
                                }}
                              >
                                🗑
                              </button>
                            </div>
                          </Td>
                        </tr>
                        {expanded === d.id && (
                          <tr style={{ background: "#fafafa" }}>
                            <td colSpan={10} style={{ padding: "0 16px 18px" }}>
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

        {/* ── Former Dealers Archive ──────────────────────────────────── */}
        <div style={{ marginTop: 40 }}>
          <button
            onClick={() => {
              setShowArchive((v) => !v);
              if (!showArchive && formerDealers === null) {
                loadFormerDealers(localStorage.getItem("admin_token"));
              }
            }}
            style={{
              background: "none", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: "Georgia,serif", fontWeight: 900, fontSize: 16, color: "#374151",
              padding: 0, marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 18 }}>🗄</span>
            Former Dealers
            {formerDealers && formerDealers.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", background: "#f3f4f6", borderRadius: 999, padding: "2px 9px", letterSpacing: 0.3 }}>
                {formerDealers.length}
              </span>
            )}
            <span style={{ fontSize: 13, color: "#9ca3af", fontFamily: "sans-serif", fontWeight: 400 }}>
              {showArchive ? "▲ hide" : "▾ show"}
            </span>
          </button>

          {showArchive && (
            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", overflow: "hidden" }}>
              {!formerDealers || formerDealers.length === 0 ? (
                <div style={{ padding: "28px 24px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                  No former dealers yet. Deleted dealers will appear here.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                    <thead>
                      <tr style={{ background: "#fafafa", textAlign: "left" }}>
                        <Th>Name / Email</Th>
                        <Th>Territory at Deletion</Th>
                        <Th>Status</Th>
                        <Th>Activated</Th>
                        <Th>Deleted</Th>
                        <Th>Stripe</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {formerDealers.map((fd) => {
                        const territories = Array.isArray(fd.territoriesSnapshot) ? fd.territoriesSnapshot : [];
                        const totalHH = territories.reduce((s, t) => s + (t.households || 0), 0);
                        return (
                          <tr key={fd.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                            <Td>
                              <div style={{ fontWeight: 700, fontSize: 13.5, color: "#374151" }}>{fd.name}</div>
                              <div style={{ fontSize: 12, color: "#888" }}>{fd.email}</div>
                              {fd.phone && <div style={{ fontSize: 11.5, color: "#aaa" }}>{fd.phone}</div>}
                            </Td>
                            <Td>
                              {territories.length === 0 ? (
                                <span style={{ color: "#9ca3af", fontSize: 12.5 }}>—</span>
                              ) : (
                                <div>
                                  {territories.map((t, i) => (
                                    <div key={i} style={{ fontSize: 12.5, color: "#374151" }}>
                                      {t.name || t.id || "—"}
                                      {t.households ? <span style={{ color: "#9ca3af" }}> · ~{Number(t.households).toLocaleString()} HH</span> : null}
                                    </div>
                                  ))}
                                  {totalHH > 0 && (
                                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                                      ~{totalHH.toLocaleString()} total households
                                    </div>
                                  )}
                                </div>
                              )}
                            </Td>
                            <Td>
                              <span style={{
                                background: fd.statusAtDeletion === "active" ? "#f0fdf4" : "#fef2f2",
                                color: fd.statusAtDeletion === "active" ? "#15803d" : "#991b1b",
                                borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 800,
                                textTransform: "uppercase", letterSpacing: 0.4,
                              }}>
                                {fd.statusAtDeletion}
                              </span>
                              {fd.isComped && (
                                <span style={{ marginLeft: 6, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                                  Comped
                                </span>
                              )}
                            </Td>
                            <Td style={{ fontSize: 12.5, color: "#666" }}>{formatDate(fd.activatedAt)}</Td>
                            <Td style={{ fontSize: 12.5, color: "#666" }}>{formatDate(fd.deletedAt)}</Td>
                            <Td>
                              {fd.stripeCustomerId ? (
                                <span style={{ fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>{fd.stripeCustomerId}</span>
                              ) : (
                                <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>
                              )}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </AdminShell>
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
  const RED2 = "#7B1418";
  return (
    <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        {page.url ? (
          <a href={page.url} target="_blank" rel="noreferrer" style={{
            fontSize: 13.5, fontWeight: 800, color: RED2, textDecoration: "none",
            background: "#fff", border: `1.5px solid ${RED2}`, borderRadius: 8, padding: "8px 14px",
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
                          background: "#fff", border: `1.5px solid ${RED2}`, color: RED2,
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
