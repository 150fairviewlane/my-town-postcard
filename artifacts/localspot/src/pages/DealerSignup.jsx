import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import { useEmailSuggestion, EmailSuggestionHint } from "../hooks/useEmailSuggestion.jsx";

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

function getStrength(pw) {
  if (!pw) return { level: 0, label: "", color: "#e5e7eb" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/\d/.test(pw)) score++;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pw)) score++;
  if (pw.length >= 16) score++;
  if (score <= 1) return { level: 1, label: "Weak", color: "#ef4444" };
  if (score <= 3) return { level: 2, label: "Fair", color: "#f59e0b" };
  return { level: 3, label: "Strong", color: "#22c55e" };
}

function PasswordStrengthIndicator({ password }) {
  const strength = useMemo(() => getStrength(password), [password]);
  if (!password) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {[1, 2, 3].map((lvl) => (
          <div key={lvl} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: lvl <= strength.level ? strength.color : "#e5e7eb",
            transition: "background 0.2s",
          }} />
        ))}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: strength.color }}>{strength.label}</div>
    </div>
  );
}

export default function DealerSignup() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", city: "", state: "", password: "", confirmPassword: "" });
  const { suggestion: emailSuggestion, check: checkEmailTypo, dismiss: dismissEmailSuggestion, clear: clearEmailSuggestion } = useEmailSuggestion();
  const [error, setError] = useState(null);
  const [mismatch, setMismatch] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const cancelled = useMemo(
    () => new URLSearchParams(window.location.search).get("cancelled") === "1",
    [],
  );

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const checkMismatch = () => {
    if (form.confirmPassword) setMismatch(form.password !== form.confirmPassword);
  };

  const handleNext = (e) => {
    e.preventDefault();
    setError(null);
    setMismatch(false);

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
    if (!form.password) {
      setError("Please create a password.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!/\d/.test(form.password)) {
      setError("Password must contain at least one number.");
      return;
    }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(form.password)) {
      setError("Password must contain at least one special character.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setMismatch(true);
      setError("Passwords do not match.");
      return;
    }

    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    // Store the password in sessionStorage so it is NEVER exposed in the URL.
    // territory-finder.html reads and clears this key before sending to the API.
    sessionStorage.setItem("_dealer_pw_pending", form.password);
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
                onChange={e => { set("email")(e); clearEmailSuggestion(); }}
                onBlur={e => checkEmailTypo(e.target.value)}
                placeholder="jane@example.com" />
              <EmailSuggestionHint
                suggestion={emailSuggestion}
                onAccept={v => { setForm(p => ({ ...p, email: v })); dismissEmailSuggestion(); }}
                onDismiss={dismissEmailSuggestion}
              />
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

            {/* Password fields */}
            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14, marginTop: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>
                Create a password for your dealer portal
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151",
                    display: "block", marginBottom: 4 }}>Password *</label>
                  <div style={{ position: "relative" }}>
                    <input
                      style={{ ...inputStyle, paddingRight: 40 }}
                      type={showPassword ? "text" : "password"}
                      required
                      value={form.password}
                      onChange={set("password")}
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", padding: 0, cursor: "pointer", color: "#9ca3af", display: "flex", alignItems: "center" }}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <PasswordStrengthIndicator password={form.password} />
                  <div style={{ fontSize: 11.5, color: "#9ca3af", marginTop: 4 }}>
                    8+ chars, one number, one special character
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151",
                    display: "block", marginBottom: 4 }}>Confirm password *</label>
                  <div style={{ position: "relative" }}>
                    <input
                      style={{ ...inputStyle, paddingRight: 40, borderColor: mismatch ? "#ef4444" : "#d1d5db" }}
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      value={form.confirmPassword}
                      onChange={set("confirmPassword")}
                      onBlur={checkMismatch}
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", padding: 0, cursor: "pointer", color: "#9ca3af", display: "flex", alignItems: "center" }}
                      aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {mismatch && (
                    <div style={{ fontSize: 12.5, color: "#ef4444", marginTop: 4, fontWeight: 600 }}>
                      Passwords do not match.
                    </div>
                  )}
                </div>
              </div>
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
