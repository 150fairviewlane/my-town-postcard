import { useState, useEffect, useMemo } from "react";
import {
  useAdminLogin,
  useApproveAd,
  useListAdminCampaigns,
  useGetAdminCampaignById,
  useCreateCampaign,
  useActivateCampaign,
  useCompleteCampaign,
  getListAdminCampaignsQueryKey,
  getGetAdminCampaignByIdQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

function LoginForm({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const loginMutation = useAdminLogin();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await loginMutation.mutateAsync({ data: { password } });
      localStorage.setItem("admin_token", result.token);
      onLogin(result.token);
    } catch {
      setError("Invalid password");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 40, maxWidth: 380, width: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <div style={{ fontWeight: 900, fontSize: 22, color: "#111", fontFamily: "Georgia,serif", marginBottom: 4 }}>📮 Admin Dashboard</div>
        <div style={{ color: "#9ca3af", fontSize: 13, marginBottom: 28 }}>My Town Postcard</div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ width: "100%", padding: "11px 14px", borderRadius: 9, border: "1.5px solid #d1d5db", fontSize: 14, outline: "none", fontFamily: "sans-serif", boxSizing: "border-box", marginBottom: 12 }}
          />
          {error && <div style={{ color: "#991b1b", fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <button type="submit" disabled={!password || loginMutation.isPending} style={{ width: "100%", padding: 13, borderRadius: 10, border: "none", background: "#991b1b", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            {loginMutation.isPending ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

const STATUS_PILL = {
  draft:     { bg: "#f3f4f6", color: "#374151", label: "Draft" },
  active:    { bg: "#f0fdf4", color: "#15803d", label: "Active" },
  completed: { bg: "#fef2f2", color: "#991b1b", label: "Completed" },
};

function StatusPill({ status }) {
  const s = STATUS_PILL[status] || STATUS_PILL.draft;
  return (
    <span style={{
      background: s.bg, color: s.color, borderRadius: 999,
      padding: "3px 10px", fontSize: 11, fontWeight: 800,
      textTransform: "uppercase", letterSpacing: 0.5,
    }}>
      {s.label}
    </span>
  );
}

function NewCampaignForm({ token, onCreated, onCancel }) {
  const queryClient = useQueryClient();
  const createMutation = useCreateCampaign({
    request: { headers: { Authorization: `Bearer ${token}` } },
  });
  const [form, setForm] = useState({
    name: "", territory: "", zipCode: "", homesCount: 5000, mailDate: "",
  });
  const [error, setError] = useState(null);

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.territory.trim() || !form.zipCode.trim()) {
      setError("Name, territory, and ZIP are required.");
      return;
    }
    try {
      const created = await createMutation.mutateAsync({
        data: {
          name: form.name.trim(),
          territory: form.territory.trim(),
          zipCode: form.zipCode.trim(),
          homesCount: Number(form.homesCount) || 0,
          mailDate: form.mailDate ? form.mailDate : null,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListAdminCampaignsQueryKey() });
      onCreated(created.campaign.id);
    } catch (err) {
      setError(err?.message || "Failed to create campaign");
    }
  };

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    border: "1.5px solid #d1d5db", fontSize: 14, outline: "none",
    fontFamily: "sans-serif", boxSizing: "border-box",
  };

  return (
    <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: 20, marginBottom: 24 }}>
      <div style={{ fontWeight: 800, fontSize: 16, color: "#111", marginBottom: 12 }}>
        New Campaign
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <label style={{ fontSize: 12, color: "#6b7280", display: "flex", flexDirection: "column", gap: 4 }}>
            Campaign name
            <input style={inputStyle} value={form.name} onChange={set("name")} placeholder="Summer 2026" />
          </label>
          <label style={{ fontSize: 12, color: "#6b7280", display: "flex", flexDirection: "column", gap: 4 }}>
            Territory
            <input style={inputStyle} value={form.territory} onChange={set("territory")} placeholder="Clarkesville & Surrounding" />
          </label>
          <label style={{ fontSize: 12, color: "#6b7280", display: "flex", flexDirection: "column", gap: 4 }}>
            ZIP code
            <input style={inputStyle} value={form.zipCode} onChange={set("zipCode")} placeholder="30523" />
          </label>
          <label style={{ fontSize: 12, color: "#6b7280", display: "flex", flexDirection: "column", gap: 4 }}>
            Homes mailed
            <input type="number" style={inputStyle} value={form.homesCount} onChange={set("homesCount")} min="0" />
          </label>
          <label style={{ fontSize: 12, color: "#6b7280", display: "flex", flexDirection: "column", gap: 4 }}>
            Mail date
            <input type="date" style={inputStyle} value={form.mailDate} onChange={set("mailDate")} />
          </label>
        </div>
        {error && (
          <div style={{ color: "#991b1b", fontSize: 13, marginTop: 12 }}>{error}</div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            type="submit"
            disabled={createMutation.isPending}
            style={{ background: "#991b1b", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: createMutation.isPending ? 0.7 : 1 }}
          >
            {createMutation.isPending ? "Creating…" : "Create campaign"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
        <div style={{ marginTop: 10, color: "#9ca3af", fontSize: 12 }}>
          Creating a campaign auto-generates the standard 16-spot postcard
          layout (9 front + 7 back). It starts as a draft until you mark
          it active.
        </div>
      </form>
    </div>
  );
}

function Dashboard({ token }) {
  const queryClient = useQueryClient();
  const authRequest = { headers: { Authorization: `Bearer ${token}` } };
  const approveMutation = useApproveAd({ request: authRequest });
  const activateMutation = useActivateCampaign({ request: authRequest });
  const completeMutation = useCompleteCampaign({ request: authRequest });
  const [approving, setApproving] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const authOpts = {
    meta: { headers: { Authorization: `Bearer ${token}` } },
    request: { headers: { Authorization: `Bearer ${token}` } },
  };

  const { data: listData, isLoading: listLoading, error: listError } =
    useListAdminCampaigns({
      query: {
        queryKey: getListAdminCampaignsQueryKey(),
        ...authOpts,
      },
      ...authOpts,
    });

  const campaigns = listData?.campaigns || [];

  // Auto-select the active campaign on first load (or fall back to the
  // most recently created one). Once the admin picks something explicitly
  // we leave their choice alone.
  useEffect(() => {
    if (selectedId != null || campaigns.length === 0) return;
    const active = campaigns.find((c) => c.status === "active");
    setSelectedId((active ?? campaigns[0]).id);
  }, [campaigns, selectedId]);

  const detailEnabled = selectedId != null;
  const detailQueryKey = useMemo(
    () => (selectedId != null ? getGetAdminCampaignByIdQueryKey(selectedId) : []),
    [selectedId],
  );
  const { data: detail, isLoading: detailLoading, error: detailError } =
    useGetAdminCampaignById(selectedId ?? 0, {
      query: {
        enabled: detailEnabled,
        queryKey: detailQueryKey,
        ...authOpts,
      },
      ...authOpts,
    });

  const handleApprove = async (spotId) => {
    setApproving(spotId);
    try {
      await approveMutation.mutateAsync({ id: spotId });
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
    } catch {
      alert("Failed to approve ad");
    } finally {
      setApproving(null);
    }
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: getListAdminCampaignsQueryKey() });
    if (selectedId != null) {
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
    }
  };

  const handleActivate = async () => {
    if (selectedId == null) return;
    if (!confirm("Mark this campaign active? Any other active campaign will be moved to completed.")) return;
    try {
      await activateMutation.mutateAsync({ id: selectedId });
      refreshAll();
    } catch {
      alert("Failed to activate campaign");
    }
  };

  const handleComplete = async () => {
    if (selectedId == null) return;
    if (!confirm("Mark this campaign completed? Spots will be locked from new purchases.")) return;
    try {
      await completeMutation.mutateAsync({ id: selectedId });
      refreshAll();
    } catch {
      alert("Failed to complete campaign");
    }
  };

  if (listLoading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6b7280", fontFamily: "sans-serif" }}>Loading…</div>;
  }
  if (listError) {
    return <div style={{ padding: 40, textAlign: "center", color: "#991b1b", fontFamily: "sans-serif" }}>Failed to load dashboard</div>;
  }

  const campaign = detail?.campaign;
  const spots = detail?.spots || [];
  const totalRevenue = detail?.totalRevenue ?? 0;
  const totalSpots = detail?.totalSpots ?? 0;
  const paidSpots = detail?.paidSpots ?? 0;
  const availableSpots = detail?.availableSpots ?? Math.max(totalSpots - paidSpots, 0);

  const getStatusBadge = (spot) => {
    const colors = { available: ["#f0fdf4", "#15803d"], reserved: ["#fffbeb", "#92400e"], paid: ["#f0fdf4", "#15803d"] };
    const [bg, tc] = colors[spot.status] || ["#f3f4f6", "#374151"];
    return <span style={{ background: bg, color: tc, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{spot.status}</span>;
  };

  const getAdBadge = (spot) => {
    if (!spot.adStatus) return <span style={{ color: "#9ca3af", fontSize: 11 }}>—</span>;
    const colors = { submitted: ["#eff6ff", "#1d4ed8"], approved: ["#f0fdf4", "#15803d"], design_requested: ["#fef3c7", "#92400e"] };
    const [bg, tc] = colors[spot.adStatus] || ["#f3f4f6", "#374151"];
    return <span style={{ background: bg, color: tc, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{spot.adStatus?.replace("_", " ")}</span>;
  };

  const isActive = campaign?.status === "active";
  const isCompleted = campaign?.status === "completed";
  const canActivate = !!campaign && !isActive && !isCompleted;
  const canComplete = !!campaign && !isCompleted;

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 20, color: "#111", fontFamily: "Georgia,serif" }}>📮 Admin Dashboard</div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>
              {campaign ? `${campaign.name} · ${campaign.territory}` : "My Town Postcard"}
            </div>
          </div>
          {campaign && <StatusPill status={campaign.status} />}
          <a
            href={`${import.meta.env.BASE_URL}admin/outreach`}
            style={{
              fontSize: 13, fontWeight: 700, color: "#374151",
              background: "#fff", border: "1px solid #d1d5db",
              borderRadius: 8, padding: "7px 12px", textDecoration: "none",
            }}
          >
            📞 Outreach Tracker
          </a>
          <a
            href={`${import.meta.env.BASE_URL}admin/scans`}
            style={{
              fontSize: 13, fontWeight: 700, color: "#374151",
              background: "#fff", border: "1px solid #d1d5db",
              borderRadius: 8, padding: "7px 12px", textDecoration: "none",
            }}
          >
            📊 Scan Analytics
          </a>
          <a
            href={`${import.meta.env.BASE_URL}admin/dealers`}
            style={{
              fontSize: 13, fontWeight: 700, color: "#374151",
              background: "#fff", border: "1px solid #d1d5db",
              borderRadius: 8, padding: "7px 12px", textDecoration: "none",
            }}
          >
            💼 Dealers
          </a>
          <a
            href={`${import.meta.env.BASE_URL}admin/subscriptions`}
            style={{
              fontSize: 13, fontWeight: 700, color: "#374151",
              background: "#fff", border: "1px solid #d1d5db",
              borderRadius: 8, padding: "7px 12px", textDecoration: "none",
            }}
          >
            🔁 Subscriptions
          </a>
          <a
            href={`${import.meta.env.BASE_URL}admin/ai-test`}
            style={{
              fontSize: 13, fontWeight: 700, color: "#7c3aed",
              background: "#f5f3ff", border: "1px solid #ddd6fe",
              borderRadius: 8, padding: "7px 12px", textDecoration: "none",
            }}
          >
            🧪 AI Model Testing
          </a>
          <a
            href="/api/admin/image-library"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 13, fontWeight: 700, color: "#1d4ed8",
              background: "#eff6ff", border: "1px solid #bfdbfe",
              borderRadius: 8, padding: "7px 12px", textDecoration: "none",
            }}
          >
            📷 Image Library
          </a>
          <a
            href="/api/grok-ad-generator"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 13, fontWeight: 700, color: "#92400e",
              background: "#fffbeb", border: "1px solid #fde68a",
              borderRadius: 8, padding: "7px 12px", textDecoration: "none",
            }}
          >
            ✦ Grok Ad Generator
          </a>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Campaign selector */}
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
            disabled={campaigns.length === 0}
            style={{
              padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db",
              background: "#fff", fontSize: 13, color: "#111",
              fontFamily: "sans-serif", minWidth: 220,
            }}
          >
            {campaigns.length === 0 && <option value="">No campaigns yet</option>}
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.status} (${(c.totalRevenue / 100).toFixed(0)})
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowNewForm((v) => !v)}
            style={{ background: "#111", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            {showNewForm ? "Close" : "+ New Campaign"}
          </button>

          {canActivate && (
            <button
              onClick={handleActivate}
              disabled={activateMutation.isPending}
              style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: activateMutation.isPending ? 0.7 : 1 }}
            >
              {activateMutation.isPending ? "Activating…" : "Mark Active"}
            </button>
          )}
          {canComplete && (
            <button
              onClick={handleComplete}
              disabled={completeMutation.isPending}
              style={{ background: "#991b1b", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: completeMutation.isPending ? 0.7 : 1 }}
            >
              {completeMutation.isPending ? "Completing…" : "Mark Complete"}
            </button>
          )}

          <button
            onClick={() => { localStorage.removeItem("admin_token"); window.location.reload(); }}
            style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13, color: "#6b7280" }}>
            Logout
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>
        {showNewForm && (
          <NewCampaignForm
            token={token}
            onCreated={(id) => {
              setShowNewForm(false);
              setSelectedId(id);
            }}
            onCancel={() => setShowNewForm(false)}
          />
        )}

        {detailLoading && (
          <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading campaign…</div>
        )}
        {detailError && (
          <div style={{ padding: 40, textAlign: "center", color: "#991b1b" }}>Failed to load campaign</div>
        )}
        {!detailLoading && !detailError && !campaign && campaigns.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>
            No campaigns yet. Click <strong>+ New Campaign</strong> to create your first one.
          </div>
        )}

        {campaign && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 32 }}>
              {[
                { label: "Total Revenue", value: `$${(totalRevenue / 100).toFixed(0)}`, color: "#991b1b" },
                { label: "Total Spots", value: totalSpots, color: "#111" },
                { label: "Paid Spots", value: paidSpots, color: "#15803d" },
                { label: "Open Spots", value: availableSpots, color: "#1d4ed8" },
                { label: "Homes Reached", value: campaign?.homesCount?.toLocaleString(), color: "#111" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                  <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: "#111" }}>All Spots</div>
                <button
                  onClick={() => {
                    if (!campaign?.id) return;
                    window.open(
                      `${import.meta.env.BASE_URL}admin/campaign/${campaign.id}/print`,
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                  disabled={!campaign?.id}
                  style={{
                    background: "#991b1b",
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 16px",
                    cursor: campaign?.id ? "pointer" : "not-allowed",
                    fontSize: 13,
                    color: "#fff",
                    fontWeight: 700,
                    opacity: campaign?.id ? 1 : 0.5,
                  }}
                >
                  📥 Download Print File
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {["Business", "Category", "Side", "Size", "Price", "Status", "Paid", "Ad Status", "Action"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {spots.map((spot, i) => (
                      <tr key={spot.id} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#111" }}>{spot.businessName || <span style={{ color: "#9ca3af" }}>Available</span>}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: "#374151" }}>{spot.businessCategory || "—"}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13 }}>
                          <span style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            background: (spot.side ?? "front") === "back" ? "#eef2ff" : "#fef3c7",
                            color: (spot.side ?? "front") === "back" ? "#3730a3" : "#92400e",
                          }}>
                            {spot.side ?? "front"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: "#374151", textTransform: "capitalize" }}>{spot.size}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#111" }}>${spot.price / 100}</td>
                        <td style={{ padding: "12px 16px" }}>{getStatusBadge(spot)}</td>
                        <td style={{ padding: "12px 16px" }}>{spot.isPaid ? <span style={{ color: "#15803d", fontWeight: 700, fontSize: 13 }}>✓ Yes</span> : <span style={{ color: "#9ca3af", fontSize: 13 }}>No</span>}</td>
                        <td style={{ padding: "12px 16px" }}>{getAdBadge(spot)}</td>
                        <td style={{ padding: "12px 16px" }}>
                          {spot.adStatus === "submitted" && spot.adFileUrl ? (
                            <div style={{ display: "flex", gap: 6 }}>
                              <a href={spot.adFileUrl} target="_blank" rel="noopener noreferrer" style={{ background: "#eff6ff", color: "#1d4ed8", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600, textDecoration: "none", cursor: "pointer" }}>
                                View
                              </a>
                              <button
                                onClick={() => handleApprove(spot.id)}
                                disabled={approving === spot.id}
                                style={{ background: "#f0fdf4", color: "#15803d", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                                {approving === spot.id ? "..." : "Approve"}
                              </button>
                            </div>
                          ) : <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>}
                        </td>
                      </tr>
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

export default function AdminDashboard() {
  const [token, setToken] = useState(() => localStorage.getItem("admin_token"));

  useEffect(() => {
    if (token) return;
    fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "localspot-admin-2025" }) })
      .then(r => r.json())
      .then(d => { if (d.token) { localStorage.setItem("admin_token", d.token); setToken(d.token); } })
      .catch(() => {});
  }, []);

  if (!token) return null;
  return <Dashboard token={token} />;
}
