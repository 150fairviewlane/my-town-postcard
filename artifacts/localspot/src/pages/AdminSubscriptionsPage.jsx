import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import AdminShell from "../components/AdminShell";

const PLAN_LABEL = {
  "6_issue": "Growth (6)",
  "12_issue": "Premium (12)",
  single: "One-Time",
};

const STATUS_PILL = {
  pending_payment: { bg: "#fef9c3", color: "#854d0e", label: "Pending" },
  active: { bg: "#f0fdf4", color: "#15803d", label: "Active" },
  past_due: { bg: "#fef2f2", color: "#991b1b", label: "Past Due" },
  canceled: { bg: "#f3f4f6", color: "#6b7280", label: "Canceled" },
  ended: { bg: "#f3f4f6", color: "#6b7280", label: "Ended" },
};

function Pill({ status }) {
  const s = STATUS_PILL[status] || { bg: "#f3f4f6", color: "#374151", label: status };
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</span>
  );
}

async function authedFetch(path, token, opts = {}) {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error("Unauthorized");
  return res;
}

export default function AdminSubscriptionsPage() {
  const [, navigate] = useLocation();
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;
  const [subs, setSubs] = useState(null);
  const [mrr, setMrr] = useState(null);
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!token) { navigate("/admin"); return; }
    let cancelled = false;
    (async () => {
      try {
        const [s, m, e] = await Promise.all([
          authedFetch("/api/admin/subscriptions", token).then((r) => r.json()),
          authedFetch("/api/admin/subscriptions/mrr", token).then((r) => r.json()),
          authedFetch("/api/admin/webhook-events?limit=50", token).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setSubs(s?.subscriptions ?? []);
        setMrr(m);
        setEvents(e?.events ?? []);
      } catch (err) {
        if (cancelled) return;
        if (err.message === "Unauthorized") { navigate("/admin"); return; }
        setError(err?.message || "Failed to load subscriptions");
      }
    })();
    return () => { cancelled = true; };
  }, [token, navigate, reloadKey]);

  const totalCommitted = useMemo(
    () => (subs || []).reduce((sum, s) => sum + (s.totalCommitmentValueCents || 0), 0),
    [subs],
  );

  const handleSync = async () => {
    setSyncBusy(true);
    try {
      const res = await authedFetch("/api/admin/subscriptions/sync", token, { method: "POST" });
      const body = await res.json();
      alert(`Reconciled ${body.checked} subscriptions. ${body.updated} updated, ${body.errors} errors.`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      alert(err?.message || "Sync failed");
    } finally {
      setSyncBusy(false);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm("Cancel this subscription? Customer will be notified by Stripe and billing will stop.")) return;
    try {
      const res = await authedFetch(`/api/admin/subscriptions/${id}/cancel`, token, { method: "POST" });
      if (!res.ok) throw new Error("Cancel failed");
      setReloadKey((k) => k + 1);
    } catch (err) {
      alert(err?.message || "Cancel failed");
    }
  };

  if (!token) return null;
  if (error) return <div style={{ padding: 24, color: "#991b1b" }}>{error}</div>;
  if (subs === null) return <div style={{ padding: 24, color: "#6b7280" }}>Loading subscriptions…</div>;

  return (
    <AdminShell>
      <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: "Georgia,serif", color: "#111" }}>Subscriptions</h1>
          </div>
          <button
            onClick={handleSync}
            disabled={syncBusy}
            style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#111", color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            {syncBusy ? "Syncing…" : "Reconcile with Stripe"}
          </button>
        </div>

        {/* MRR cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
          <Card label="Active Subscriptions" value={`${mrr?.activeSubscriptionCount ?? 0}`} />
          <Card label="Monthly Recurring Revenue" value={`$${((mrr?.monthlyRecurringCents ?? 0) / 100).toFixed(0)}`} />
          <Card label="Expected Next 30 Days" value={`$${((mrr?.expectedNext30DaysCents ?? 0) / 100).toFixed(0)}`} />
          <Card label="Total Committed (All Time)" value={`$${(totalCommitted / 100).toFixed(0)}`} />
        </div>

        <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111", margin: "0 0 12px" }}>All Subscriptions ({subs.length})</h2>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ background: "#f9fafb" }}>
              <tr>
                {["Business", "Plan", "Status", "Issues", "Monthly", "Total", "Ends", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#6b7280", fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: 0.5, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subs.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 24, color: "#9ca3af", textAlign: "center" }}>No subscriptions yet.</td></tr>
              )}
              {subs.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 700, color: "#111" }}>{s.businessName}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{s.contactEmail}</div>
                  </td>
                  <td style={{ padding: "10px 12px" }}>{PLAN_LABEL[s.commitmentType] || s.commitmentType}</td>
                  <td style={{ padding: "10px 12px" }}><Pill status={s.subscriptionStatus} /></td>
                  <td style={{ padding: "10px 12px" }}>{s.issuesFulfilled} / {s.commitmentTotalIssues}</td>
                  <td style={{ padding: "10px 12px" }}>${(s.monthlyPriceCents / 100).toFixed(0)}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 700 }}>${(s.totalCommitmentValueCents / 100).toFixed(0)}</td>
                  <td style={{ padding: "10px 12px", color: "#6b7280" }}>
                    {s.commitmentEndDate ? new Date(s.commitmentEndDate).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    {(s.subscriptionStatus === "active" || s.subscriptionStatus === "past_due") && (
                      <button
                        onClick={() => handleCancel(s.id)}
                        style={{ padding: "5px 10px", borderRadius: 6, border: "1.5px solid #fecaca", background: "#fff", color: "#991b1b", fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111", margin: "28px 0 12px" }}>Recent Webhook Events</h2>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ background: "#f9fafb" }}>
              <tr>
                {["Received", "Event Type", "Status", "Error"].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#6b7280", fontWeight: 700, textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(events || []).map((e) => (
                <tr key={e.eventId} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "8px 12px", color: "#6b7280", whiteSpace: "nowrap" }}>{e.receivedAt ? new Date(e.receivedAt).toLocaleString() : "—"}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#111" }}>{e.eventType}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <Pill status={e.status === "processed" ? "active" : e.status === "failed" ? "past_due" : "pending_payment"} />
                  </td>
                  <td style={{ padding: "8px 12px", color: "#991b1b", fontSize: 11 }}>{e.errorMessage || ""}</td>
                </tr>
              ))}
              {(!events || events.length === 0) && (
                <tr><td colSpan={4} style={{ padding: 16, color: "#9ca3af", textAlign: "center" }}>No webhook events yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </AdminShell>
  );
}

function Card({ label, value }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: "#111", marginTop: 6 }}>{value}</div>
    </div>
  );
}
