import { useState } from "react";
import AdminShell from "../components/AdminShell";
import CreateTerritoryForm from "../components/CreateTerritoryForm";

const RED = "#7B1418";
const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

function authHeaders() {
  const token = localStorage.getItem("admin_token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

function CreateDealerForm({ territoryId, onDealerCreated }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirmPassword: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function set(k) {
    return (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = { name: form.name.trim(), email: form.email.trim(), password: form.password, territoryId };
      if (form.phone.trim()) body.phone = form.phone.trim();
      const res = await fetch(`${baseUrl}/api/admin/dealers`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      onDealerCreated(data.dealer);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const inp = {
    width: "100%", padding: "8px 11px", borderRadius: 8,
    border: "1.5px solid #d1d5db", fontSize: 14, outline: "none",
    fontFamily: "DM Sans, sans-serif", boxSizing: "border-box", background: "#fff",
  };
  const lbl = { fontSize: 12, fontWeight: 700, color: "#374151", display: "flex", flexDirection: "column", gap: 4 };

  return (
    <div style={{ border: "1.5px solid #e5e7eb", borderRadius: 10, padding: 22, background: "#fff" }}>
      <div style={{ fontWeight: 900, fontSize: 15, color: "#111", fontFamily: "Georgia, serif", marginBottom: 4 }}>
        Assign a Dealer to this Territory
      </div>
      <div style={{ fontSize: 12.5, color: "#6b7280", marginBottom: 16 }}>
        Optional — you can also assign a dealer later from the Dealers page.
        The dealer can use <strong>Forgot Password</strong> to set their own password at any time.
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <label style={lbl}>
            Name *
            <input style={inp} required value={form.name} onChange={set("name")} placeholder="Jane Smith" />
          </label>
          <label style={lbl}>
            Email *
            <input style={inp} type="email" required value={form.email} onChange={set("email")} placeholder="jane@example.com" />
          </label>
          <label style={lbl}>
            Phone (optional)
            <input style={inp} type="tel" value={form.phone} onChange={set("phone")} placeholder="(706) 555-1234" />
          </label>
          <div />
          <label style={lbl}>
            Password *
            <input
              style={inp} type="password" required minLength={8}
              value={form.password} onChange={set("password")}
              placeholder="Min 8 chars, 1 number, 1 special"
            />
          </label>
          <label style={lbl}>
            Confirm Password *
            <input
              style={inp} type="password" required minLength={8}
              value={form.confirmPassword} onChange={set("confirmPassword")}
              placeholder="Repeat password"
            />
          </label>
        </div>

        {error && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8,
            padding: "10px 14px", fontSize: 13, color: "#991b1b", marginBottom: 12,
          }}>
            ❌ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            background: busy ? "#9ca3af" : RED,
            color: "#fff", border: "none", borderRadius: 8,
            padding: "10px 24px", fontSize: 13.5, fontWeight: 800,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Creating Dealer…" : "✓ Create Dealer"}
        </button>
      </form>
    </div>
  );
}

export default function AdminCreateCustomTerritoryPage() {
  const [created, setCreated] = useState(null);
  const [dealer, setDealer] = useState(null);

  return (
    <AdminShell>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Territory success banner */}
        {created && (
          <div style={{
            background: "#f0fdf4", border: "1.5px solid #86efac",
            borderRadius: 12, padding: "20px 24px",
          }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: "#15803d", marginBottom: 6 }}>
              ✅ Territory Created — ID: <span style={{ fontFamily: "monospace" }}>{created.territoryId}</span>
            </div>
            <div style={{ fontSize: 13, color: "#166534" }}>
              Territory is now live with status <strong>available</strong>.{" "}
              ZIP footprint ({created.totalZips} ZIPs) has been stored.
            </div>
            <button
              onClick={() => { setCreated(null); setDealer(null); }}
              style={{
                marginTop: 12, fontSize: 12, color: "#166534", background: "none",
                border: "1px solid #86efac", borderRadius: 6, padding: "4px 10px", cursor: "pointer",
              }}
            >
              Create another territory
            </button>
          </div>
        )}

        {/* Dealer success banner */}
        {dealer && (
          <div style={{
            background: "#eff6ff", border: "1.5px solid #93c5fd",
            borderRadius: 12, padding: "20px 24px",
          }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1d4ed8", marginBottom: 6 }}>
              👤 Dealer Created — {dealer.name}
            </div>
            <div style={{ fontSize: 13, color: "#1e40af" }}>
              {dealer.email} · Territory assigned and landing page provisioned.{" "}
              The dealer can log in at <strong>/dealer/login</strong>.
            </div>
            <a
              href={`${baseUrl}/admin/dealers/${dealer.id}`}
              style={{
                display: "inline-block", marginTop: 10,
                fontSize: 12.5, fontWeight: 700, color: "#1d4ed8",
                border: "1px solid #93c5fd", borderRadius: 6, padding: "4px 12px",
                textDecoration: "none",
              }}
            >
              View Dealer →
            </a>
          </div>
        )}

        {/* Territory form (shown until created) */}
        {!created && (
          <CreateTerritoryForm onCreated={(t) => setCreated(t)} />
        )}

        {/* Dealer form (shown after territory created, before dealer assigned) */}
        {created && !dealer && (
          <CreateDealerForm
            territoryId={created.territoryId}
            onDealerCreated={(d) => setDealer(d)}
          />
        )}
      </div>
    </AdminShell>
  );
}
