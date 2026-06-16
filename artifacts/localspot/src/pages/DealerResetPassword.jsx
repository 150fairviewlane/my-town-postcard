import { useState, useMemo, useEffect } from "react";
import { useLocation, Link } from "wouter";

const RED = "#7B1418";
const GOLD = "#d4a017";

const inputStyle = {
  width: "100%", padding: "11px 14px", borderRadius: 8,
  border: "1.5px solid #d1d5db", fontSize: 14.5,
  outline: "none", boxSizing: "border-box", color: "#111",
  fontFamily: "sans-serif",
};

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

function getCsrfCookie() {
  const match = document.cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith("dealer_csrf="));
  return match ? match.slice("dealer_csrf=".length) : null;
}

export default function DealerResetPassword() {
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mismatch, setMismatch] = useState(false);
  const [csrfToken, setCsrfToken] = useState(null);
  const [, navigate] = useLocation();

  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token"), []);

  const strength = useMemo(() => getStrength(form.password), [form.password]);

  useEffect(() => {
    fetch(`${baseUrl}/api/dealers/csrf-token`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setCsrfToken(d.csrfToken || getCsrfCookie()))
      .catch(() => setCsrfToken(getCsrfCookie()));
  }, [baseUrl]);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const checkMismatch = () => {
    if (form.confirm) setMismatch(form.password !== form.confirm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setMismatch(true);
      return;
    }
    if (!token) {
      setError("Missing reset token. Please use the link from your email.");
      return;
    }
    if (!csrfToken) {
      setError("Page not ready. Please refresh and try again.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/dealers/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ token, newPassword: form.password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Could not reset password. Please try again.");
        return;
      }
      navigate("/dealer/login?reset=1");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div style={{ background: "#f9fafb", minHeight: "100vh", fontFamily: "sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 40, textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontFamily: "Georgia,serif", fontSize: 22, marginBottom: 10 }}>Invalid link</h2>
          <p style={{ color: "#666", marginBottom: 20 }}>This link has expired or already been used.</p>
          <Link href="/dealer/forgot-password" style={{ color: RED, fontWeight: 700, textDecoration: "none" }}>Request a new link →</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#f9fafb", minHeight: "100vh", fontFamily: "sans-serif", paddingBottom: 64 }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "16px 24px", marginBottom: 48 }}>
        <Link href="/dealers" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit", maxWidth: 1100, margin: "0 auto" }}>
          <span style={{ fontSize: 28 }}>📮</span>
          <div style={{ fontWeight: 900, fontSize: 22, color: "#111", fontFamily: "Georgia,serif" }}>My Town Postcard</div>
          <span style={{ marginLeft: 12, fontSize: 12, fontWeight: 800, color: "#8a6d11", background: `${GOLD}22`, padding: "3px 10px", borderRadius: 999, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Dealer Portal
          </span>
        </Link>
      </header>

      <div style={{ maxWidth: 440, margin: "0 auto", padding: "0 16px" }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 36, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 26, fontWeight: 900, color: "#111", fontFamily: "Georgia,serif", marginBottom: 6 }}>
            Set a new password
          </h2>
          <p style={{ color: "#666", fontSize: 14, marginBottom: 28 }}>
            Must be at least 8 characters with one number and one special character.
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>New password</label>
              <input
                style={inputStyle}
                type="password"
                required
                value={form.password}
                onChange={set("password")}
                placeholder="••••••••"
                autoComplete="new-password"
              />
              {form.password && (
                <div style={{ marginTop: 8 }}>
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
              )}
            </div>

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Confirm password</label>
              <input
                style={{ ...inputStyle, borderColor: mismatch ? "#ef4444" : "#d1d5db" }}
                type="password"
                required
                value={form.confirm}
                onChange={set("confirm")}
                onBlur={checkMismatch}
                placeholder="••••••••"
                autoComplete="new-password"
              />
              {mismatch && (
                <div style={{ fontSize: 12.5, color: "#ef4444", marginTop: 4, fontWeight: 600 }}>
                  Passwords do not match.
                </div>
              )}
            </div>

            {error && (
              <div style={{ background: "#fef2f2", color: "#991b1b", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 600 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !csrfToken}
              style={{ background: (loading || !csrfToken) ? "#9ca3af" : RED, color: "#fff", border: "none", borderRadius: 9, padding: "14px 0", fontSize: 15, fontWeight: 800, cursor: (loading || !csrfToken) ? "default" : "pointer", marginTop: 4 }}
            >
              {loading ? "Saving…" : "Set new password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
