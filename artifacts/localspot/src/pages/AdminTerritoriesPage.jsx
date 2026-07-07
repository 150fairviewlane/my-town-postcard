import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import AdminShell from "../components/AdminShell";

const BURGUNDY = "#991b1b";

const STATUS_META = {
  available: { bg: "#f0fdf4", color: "#15803d", label: "Available" },
  pending:   { bg: "#eff6ff", color: "#1d4ed8", label: "Pending"   },
  taken:     { bg: "#fef2f2", color: BURGUNDY,  label: "Taken"     },
  proposed:  { bg: "#fffbeb", color: "#92400e", label: "Proposed"  },
};

function StatusPill({ status }) {
  const s = STATUS_META[status] ?? { bg: "#f3f4f6", color: "#374151", label: status ?? "Unknown" };
  return (
    <span style={{
      background: s.bg, color: s.color, borderRadius: 999,
      padding: "3px 10px", fontSize: 11, fontWeight: 800,
      textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

function ReleaseModal({ territory, onConfirm, onCancel, releasing }) {
  const hasReserved = (territory.reservedSpotCount ?? 0) > 0;
  const claimsCount = territory._claimsCount ?? "all";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: "28px 28px 24px",
        maxWidth: 460, width: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
      }}>
        <div style={{ fontWeight: 900, fontSize: 18, color: "#111", marginBottom: 6 }}>
          Release Territory?
        </div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
          This will permanently unlink <strong style={{ color: "#111" }}>{territory.name}</strong> from its current dealer and reset it to available.
        </div>

        <div style={{
          background: "#f9fafb", border: "1px solid #e5e7eb",
          borderRadius: 10, padding: "14px 16px", marginBottom: 20,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
            What will be cleared
          </div>
          {territory.dealerName && (
            <div style={{ fontSize: 13, color: "#374151", display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: "#9ca3af", flexShrink: 0 }}>Dealer</span>
              <span style={{ fontWeight: 600 }}>{territory.dealerName}</span>
              <span style={{ color: "#9ca3af", fontSize: 11 }}>({territory.dealerEmail})</span>
            </div>
          )}
          <div style={{ fontSize: 13, color: "#374151", display: "flex", gap: 8 }}>
            <span style={{ color: "#9ca3af", flexShrink: 0 }}>Claims</span>
            <span>All pending/active claims on this territory will be <strong>cancelled</strong></span>
          </div>
          <div style={{ fontSize: 13, color: "#374151", display: "flex", gap: 8 }}>
            <span style={{ color: "#9ca3af", flexShrink: 0 }}>Campaigns</span>
            <span>{territory.campaignCount > 0 ? `${territory.campaignCount} dealer campaign${territory.campaignCount !== 1 ? "s" : ""} will be <strong>unpublished</strong>` : "No campaigns linked"}</span>
          </div>
          {hasReserved && (
            <div style={{ fontSize: 13, color: "#92400e", display: "flex", gap: 8 }}>
              <span style={{ flexShrink: 0 }}>⚠️</span>
              <span><strong>{territory.reservedSpotCount}</strong> reserved spot{territory.reservedSpotCount !== 1 ? "s" : ""} will have customer info cleared and be reset to available</span>
            </div>
          )}
        </div>

        <div style={{
          background: "#fef2f2", border: "1px solid #fecaca",
          borderRadius: 8, padding: "10px 14px", marginBottom: 22,
          fontSize: 12, color: BURGUNDY, fontWeight: 600,
        }}>
          This action cannot be undone. The territory will immediately appear as claimable for new dealers.
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={releasing}
            style={{
              padding: "9px 18px", borderRadius: 8, border: "1.5px solid #e5e7eb",
              background: "#fff", fontSize: 13, fontWeight: 700,
              color: "#374151", cursor: releasing ? "default" : "pointer",
              opacity: releasing ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={releasing}
            style={{
              padding: "9px 20px", borderRadius: 8, border: "none",
              background: BURGUNDY, color: "#fff", fontSize: 13,
              fontWeight: 800, cursor: releasing ? "default" : "pointer",
              opacity: releasing ? 0.5 : 1,
              minWidth: 140,
            }}
          >
            {releasing ? "Releasing…" : "Confirm Release"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({ territory, onConfirm, onCancel, deleting }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: "28px 28px 24px",
        maxWidth: 440, width: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
      }}>
        <div style={{ fontWeight: 900, fontSize: 18, color: "#111", marginBottom: 6 }}>
          Delete Territory?
        </div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
          Permanently remove <strong style={{ color: "#111" }}>{territory.name}</strong> ({territory.id}) from the system. This also deletes its ZIP footprint.
        </div>
        <div style={{
          background: "#fef2f2", border: "1px solid #fecaca",
          borderRadius: 8, padding: "10px 14px", marginBottom: 22,
          fontSize: 12, color: BURGUNDY, fontWeight: 600,
        }}>
          This action cannot be undone.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={deleting}
            style={{
              padding: "9px 18px", borderRadius: 8, border: "1.5px solid #e5e7eb",
              background: "#fff", fontSize: 13, fontWeight: 700,
              color: "#374151", cursor: deleting ? "default" : "pointer",
              opacity: deleting ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{
              padding: "9px 20px", borderRadius: 8, border: "none",
              background: BURGUNDY, color: "#fff", fontSize: 13,
              fontWeight: 800, cursor: deleting ? "default" : "pointer",
              opacity: deleting ? 0.5 : 1, minWidth: 120,
            }}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TerritoriesContent({ token }) {
  const [territories, setTerritories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [releasing, setReleasing] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const auth = { Authorization: `Bearer ${token}` };

  const loadTerritories = useCallback(() => {
    setLoading(true);
    fetch(`${base}/api/admin/territories/list`, { headers: auth })
      .then(r => r.json())
      .then(data => {
        setTerritories(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [base, token]);

  useEffect(() => { loadTerritories(); }, [loadTerritories]);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 4000);
  };

  async function handleDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`${base}/api/territories/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
        headers: auth,
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error ?? "Delete failed", true);
      } else {
        showToast(`✓ ${deleteTarget.name} deleted.`);
        loadTerritories();
      }
    } catch (e) {
      showToast(String(e), true);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  async function handleRelease() {
    if (!confirmTarget || releasing) return;
    setReleasing(true);
    try {
      const res = await fetch(`${base}/api/admin/territories/${encodeURIComponent(confirmTarget.id)}/release`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error ?? "Release failed", true);
      } else {
        const s = json.summary;
        showToast(`✓ ${confirmTarget.name} released. ${s.campaignsUnpublished} campaign${s.campaignsUnpublished !== 1 ? "s" : ""} unpublished, ${s.claimsCancelled} claim${s.claimsCancelled !== 1 ? "s" : ""} cancelled${s.spotsReset > 0 ? `, ${s.spotsReset} spot${s.spotsReset !== 1 ? "s" : ""} reset` : ""}.`);
        loadTerritories();
      }
    } catch (e) {
      showToast(String(e), true);
    } finally {
      setReleasing(false);
      setConfirmTarget(null);
    }
  }

  const filtered = territories.filter(t => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (t.name ?? "").toLowerCase().includes(q) ||
      (t.state ?? "").toLowerCase().includes(q) ||
      (t.id ?? "").toLowerCase().includes(q) ||
      (t.dealerName ?? "").toLowerCase().includes(q) ||
      (t.dealerEmail ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ padding: "32px 32px 48px" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 2000,
          background: toast.isError ? BURGUNDY : "#065f46",
          color: "#fff", borderRadius: 10, padding: "12px 20px",
          fontSize: 13, fontWeight: 600, maxWidth: 420,
          boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Release confirm modal */}
      {confirmTarget && (
        <ReleaseModal
          territory={confirmTarget}
          onConfirm={handleRelease}
          onCancel={() => !releasing && setConfirmTarget(null)}
          releasing={releasing}
        />
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <DeleteModal
          territory={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => !deleting && setDeleteTarget(null)}
          deleting={deleting}
        />
      )}

      {/* Header */}
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
          ＋ Create Custom Territory
        </Link>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 18 }}>
        <input
          type="text"
          placeholder="Search by name, state, dealer, or ID…"
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
                    {["Territory", "State", "Status", "Dealer", "Counties", "Spots", "Actions"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => {
                    const isClaimed = t.status === "taken" || t.status === "pending";
                    const hasPaidSpots = (t.paidSpotCount ?? 0) > 0;
                    const hasReservedSpots = (t.reservedSpotCount ?? 0) > 0;

                    return (
                      <tr key={t.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                        {/* Name */}
                        <td style={{ padding: "12px 14px", fontSize: 13 }}>
                          <div style={{ fontWeight: 700, color: "#111" }}>{t.name}</div>
                          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{t.id}</div>
                        </td>

                        {/* State */}
                        <td style={{ padding: "12px 14px", fontSize: 13, color: "#374151" }}>{t.state ?? "—"}</td>

                        {/* Status */}
                        <td style={{ padding: "12px 14px" }}>
                          <StatusPill status={t.status} />
                        </td>

                        {/* Dealer */}
                        <td style={{ padding: "12px 14px", fontSize: 13, color: "#374151", maxWidth: 160 }}>
                          {t.dealerName ? (
                            <div>
                              <div style={{ fontWeight: 600 }}>{t.dealerName}</div>
                              <div style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.dealerEmail}</div>
                            </div>
                          ) : (
                            <span style={{ color: "#d1d5db" }}>—</span>
                          )}
                        </td>

                        {/* Counties */}
                        <td style={{ padding: "12px 14px", fontSize: 12, color: "#6b7280", maxWidth: 160 }}>
                          {Array.isArray(t.counties) && t.counties.length > 0 ? (
                            <div style={{ lineHeight: 1.5 }}>{t.counties.join(", ")}</div>
                          ) : (
                            <span style={{ color: "#d1d5db" }}>—</span>
                          )}
                        </td>

                        {/* Spot counts */}
                        <td style={{ padding: "12px 14px", fontSize: 12, whiteSpace: "nowrap" }}>
                          {isClaimed ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              {hasPaidSpots && (
                                <span style={{ color: BURGUNDY, fontWeight: 700 }}>
                                  {t.paidSpotCount} paid
                                </span>
                              )}
                              {hasReservedSpots && (
                                <span style={{ color: "#92400e" }}>
                                  {t.reservedSpotCount} reserved
                                </span>
                              )}
                              {!hasPaidSpots && !hasReservedSpots && (
                                <span style={{ color: "#d1d5db" }}>all clear</span>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: "#d1d5db" }}>—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            {/* View Spot Tables link */}
                            {t.campaignCount > 0 && (
                              <Link
                                href={`/admin/territories/detail?dealerId=${t.dealerId}`}
                                style={{
                                  fontSize: 11, fontWeight: 700, color: BURGUNDY,
                                  background: "#fef2f2", border: `1px solid #fecaca`,
                                  borderRadius: 6, padding: "4px 9px", textDecoration: "none",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Spot Tables →
                              </Link>
                            )}

                            {/* Delete button — only for available territories */}
                            {t.status === "available" && (
                              <button
                                onClick={() => setDeleteTarget(t)}
                                style={{
                                  fontSize: 11, fontWeight: 700,
                                  color: BURGUNDY, background: "#fef2f2",
                                  border: `1px solid #fecaca`,
                                  borderRadius: 6, padding: "4px 9px",
                                  cursor: "pointer", whiteSpace: "nowrap",
                                }}
                              >
                                Delete
                              </button>
                            )}

                            {/* Release button — only for claimed territories */}
                            {isClaimed && (
                              hasPaidSpots ? (
                                <span
                                  title={`Cannot release: ${t.paidSpotCount} paid spot${t.paidSpotCount !== 1 ? "s" : ""} must be resolved first`}
                                  style={{
                                    fontSize: 11, fontWeight: 700,
                                    color: "#92400e", background: "#fffbeb",
                                    border: "1px solid #fde68a",
                                    borderRadius: 6, padding: "4px 9px",
                                    whiteSpace: "nowrap", cursor: "not-allowed",
                                    display: "inline-flex", alignItems: "center", gap: 4,
                                  }}
                                >
                                  ⛔ Has paid spots
                                </span>
                              ) : (
                                <button
                                  onClick={() => setConfirmTarget(t)}
                                  style={{
                                    fontSize: 11, fontWeight: 700,
                                    color: "#374151", background: "#f3f4f6",
                                    border: "1px solid #d1d5db",
                                    borderRadius: 6, padding: "4px 9px",
                                    cursor: "pointer", whiteSpace: "nowrap",
                                  }}
                                >
                                  Release Territory
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
