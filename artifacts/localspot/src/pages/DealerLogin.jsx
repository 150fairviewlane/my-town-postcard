import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Eye, EyeOff } from "lucide-react";

const RED = "#7B1418";
const GOLD = "#d4a017";

const inputStyle = {
  width: "100%", padding: "11px 14px", borderRadius: 8,
  border: "1.5px solid #d1d5db", fontSize: 14.5,
  outline: "none", boxSizing: "border-box", color: "#111",
  fontFamily: "sans-serif",
};

function getCsrfCookie() {
  const match = document.cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith("dealer_csrf="));
  return match ? match.slice("dealer_csrf=".length) : null;
}

export default function DealerLogin() {
  const [form, setForm] = useState({ email: "", password: "", rememberMe: false });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [, navigate] = useLocation();

  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason");

  useEffect(() => {
    fetch(`${baseUrl}/api/dealers/csrf-token`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setCsrfToken(d.csrfToken || getCsrfCookie()))
      .catch(() => setCsrfToken(getCsrfCookie()));
  }, [baseUrl]);

  const set = (k) => (e) =>
    setForm((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!csrfToken) {
      setError("Page not ready. Please refresh and try again.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/dealers/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        credentials: "include",
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          rememberMe: form.rememberMe,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Sign in failed. Please try again.");
        return;
      }
      if (body.token) sessionStorage.setItem("dealer_token", body.token);
      navigate("/dealer/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
        {reason === "session_expired" && (
          <div style={{ background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 14px", fontSize: 13.5, fontWeight: 600, marginBottom: 20 }}>
            Your session has expired. Please sign in again.
          </div>
        )}

        <div style={{ background: "#fff", borderRadius: 14, padding: 36, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 26, fontWeight: 900, color: "#111", fontFamily: "Georgia,serif", marginBottom: 6 }}>
            Dealer Sign In
          </h2>
          <p style={{ color: "#666", fontSize: 14, marginBottom: 28 }}>
            Access your dealer dashboard and territory stats.
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Email</label>
              <input
                style={inputStyle}
                type="email"
                required
                value={form.email}
                onChange={set("email")}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Password</label>
              <div style={{ position: "relative" }}>
                <input
                  style={{ ...inputStyle, paddingRight: 40 }}
                  type={showPassword ? "text" : "password"}
                  required
                  value={form.password}
                  onChange={set("password")}
                  placeholder="••••••••"
                  autoComplete="current-password"
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
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "#374151", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.rememberMe}
                  onChange={set("rememberMe")}
                  style={{ width: 15, height: 15, cursor: "pointer" }}
                />
                Remember me
              </label>
              <Link href="/dealer/forgot-password" style={{ fontSize: 13, color: RED, fontWeight: 600, textDecoration: "none" }}>
                Forgot your password?
              </Link>
            </div>

            {error && (
              <div style={{ background: "#fef2f2", color: "#991b1b", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 600 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !csrfToken}
              style={{ marginTop: 4, background: (loading || !csrfToken) ? "#9ca3af" : RED, color: "#fff", border: "none", borderRadius: 9, padding: "14px 0", fontSize: 15, fontWeight: 800, cursor: (loading || !csrfToken) ? "default" : "pointer" }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: "center", fontSize: 13, color: "#6b7280" }}>
            Not a dealer yet?{" "}
            <Link href="/dealers" style={{ color: RED, fontWeight: 700, textDecoration: "none" }}>
              Apply to join
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
