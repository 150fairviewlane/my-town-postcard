import { useState, useMemo } from "react";
import { Link } from "wouter";

const RED = "#7B1418";
const GOLD = "#d4a017";

const inputStyle = {
  width: "100%", padding: "11px 14px", borderRadius: 8,
  border: "1.5px solid #d1d5db", fontSize: 14.5,
  outline: "none", boxSizing: "border-box", color: "#111",
  fontFamily: "sans-serif",
};

const US_STATES = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
  ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],
  ["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],
  ["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],
  ["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],
  ["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],
  ["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],
  ["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],
  ["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],
  ["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],
];

export default function DealerSignup() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", city: "", state: "" });
  const [error, setError] = useState(null);

  const cancelled = useMemo(
    () => new URLSearchParams(window.location.search).get("cancelled") === "1",
    [],
  );

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleNext = (e) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.email.trim()) {
      setError("Please fill in your name and email.");
      return;
    }
    if (!/.+@.+\..+/.test(form.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!form.city.trim()) {
      setError("Please enter your city.");
      return;
    }
    if (!form.state) {
      setError("Please select your state.");
      return;
    }

    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    const params = new URLSearchParams({
      city:  form.city.trim(),
      state: form.state,
      name:  form.name.trim(),
      email: form.email.trim().toLowerCase(),
      ref:   "signup",
    });
    if (form.phone.trim()) params.set("phone", form.phone.trim());
    window.location.href = `${base}/find-territory?${params.toString()}`;
  };

  return (
    <div style={{ background: "#f9fafb", minHeight: "100vh",
      paddingBottom: 64, fontFamily: "sans-serif" }}>

      <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb",
        padding: "16px 24px", marginBottom: 32 }}>
        <Link href="/dealers" style={{ display: "flex", alignItems: "center", gap: 10,
          textDecoration: "none", color: "inherit", maxWidth: 1100, margin: "0 auto" }}>
          <span style={{ fontSize: 28 }}>📮</span>
          <div style={{ fontWeight: 900, fontSize: 22, color: "#111",
            fontFamily: "Georgia,serif" }}>My Town Postcard</div>
          <span style={{ marginLeft: 12, fontSize: 12, fontWeight: 800,
            color: "#8a6d11", background: `${GOLD}22`, padding: "3px 10px",
            borderRadius: 999, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Dealer Application
          </span>
        </Link>
      </header>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px" }}>
        {cancelled && (
          <div style={{ background: "#fffbeb", color: "#92400e",
            border: "1px solid #fde68a", borderRadius: 10, padding: 14,
            fontSize: 13.5, fontWeight: 600, marginBottom: 18 }}>
            Your payment was cancelled. No charges were made — feel free to try again.
          </div>
        )}

        <div style={{ background: "#fff", borderRadius: 14, padding: 32,
          boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          <h2 style={{ fontSize: 26, fontWeight: 900, color: "#111",
            fontFamily: "Georgia,serif", marginBottom: 6 }}>
            Tell us about yourself
          </h2>
          <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
            Enter your city and state and we'll show you the available territories on the map.
          </p>

          <form onSubmit={handleNext}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151",
                display: "block", marginBottom: 4 }}>Full name *</label>
              <input style={inputStyle} required value={form.name} onChange={set("name")}
                placeholder="Jane Smith" />
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151",
                display: "block", marginBottom: 4 }}>Email *</label>
              <input style={inputStyle} required type="email" value={form.email}
                onChange={set("email")} placeholder="jane@example.com" />
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151",
                display: "block", marginBottom: 4 }}>City *</label>
              <input style={inputStyle} required value={form.city} onChange={set("city")}
                placeholder="e.g. Clarkesville" />
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151",
                display: "block", marginBottom: 4 }}>State *</label>
              <select style={{ ...inputStyle, appearance: "auto", cursor: "pointer" }}
                required value={form.state} onChange={set("state")}>
                <option value="">— Select your state —</option>
                {US_STATES.map(([abbr, name]) => (
                  <option key={abbr} value={abbr}>{abbr} — {name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151",
                display: "block", marginBottom: 4 }}>Phone (optional)</label>
              <input style={inputStyle} type="tel" value={form.phone}
                onChange={set("phone")} placeholder="(555) 123-4567" />
            </div>

            {error && (
              <div style={{ background: "#fef2f2", color: "#991b1b",
                borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 600 }}>
                {error}
              </div>
            )}

            <button type="submit"
              style={{ marginTop: 8, background: RED, color: "#fff",
                border: "none", borderRadius: 9, padding: "14px 0",
                fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
              See My Territory on the Map →
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
