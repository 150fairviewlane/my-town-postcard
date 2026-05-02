import { useState } from "react";
import { useGetAdminCampaign, useAdminLogin, useApproveAd, getGetAdminCampaignQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const SIZE_PRICES = { large: 399, medium: 299, small: 199 };

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

function Dashboard({ token }) {
  const queryClient = useQueryClient();
  const approveMutation = useApproveAd();
  const [approving, setApproving] = useState(null);

  const { data, isLoading, error } = useGetAdminCampaign({
    query: {
      queryKey: getGetAdminCampaignQueryKey(),
      meta: { headers: { Authorization: `Bearer ${token}` } },
    },
    request: { headers: { Authorization: `Bearer ${token}` } },
  });

  const handleApprove = async (spotId) => {
    setApproving(spotId);
    try {
      await approveMutation.mutateAsync(
        { id: spotId },
        { meta: { headers: { Authorization: `Bearer ${token}` } }, request: { headers: { Authorization: `Bearer ${token}` } } }
      );
      queryClient.invalidateQueries({ queryKey: getGetAdminCampaignQueryKey() });
    } catch (err) {
      alert("Failed to approve ad");
    } finally {
      setApproving(null);
    }
  };

  if (isLoading) return <div style={{ padding: 40, textAlign: "center", color: "#6b7280", fontFamily: "sans-serif" }}>Loading...</div>;
  if (error) return <div style={{ padding: 40, textAlign: "center", color: "#991b1b", fontFamily: "sans-serif" }}>Failed to load dashboard</div>;
  if (!data) return null;

  const { campaign, spots, totalRevenue, totalSpots, paidSpots } = data;

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

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 20, color: "#111", fontFamily: "Georgia,serif" }}>📮 Admin Dashboard</div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>{campaign?.name} · {campaign?.territory}</div>
        </div>
        <button
          onClick={() => { localStorage.removeItem("admin_token"); window.location.reload(); }}
          style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13, color: "#6b7280" }}>
          Logout
        </button>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 32 }}>
          {[
            { label: "Total Revenue", value: `$${(totalRevenue / 100).toFixed(0)}`, color: "#991b1b" },
            { label: "Total Spots", value: totalSpots, color: "#111" },
            { label: "Paid Spots", value: paidSpots, color: "#15803d" },
            { label: "Open Spots", value: totalSpots - paidSpots, color: "#1d4ed8" },
            { label: "Homes Reached", value: campaign?.homesCount?.toLocaleString(), color: "#111" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [token, setToken] = useState(() => localStorage.getItem("admin_token"));

  if (!token) return <LoginForm onLogin={setToken} />;
  return <Dashboard token={token} />;
}
