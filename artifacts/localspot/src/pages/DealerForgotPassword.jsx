import { useState, useEffect } from "react";
import { Link } from "wouter";

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

export default function DealerForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [csrfToken, setCsrfToken] = useState(null);

  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

  useEffect(() => {
    fetch(`${baseUrl}/api/dealers/csrf-token`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setCsrfToken(d.csrfToken || getCsrfCookie()))
      .catch(() => setCsrfToken(getCsrfCookie()));
  }, [baseUrl]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!csrfToken) {
      setError("Page not ready. Please refresh and try again.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/dealers/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Something went wrong. Please try again.");
        return;
      }
      setSent(true);
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
        <div style={{ background: "#fff", borderRadius: 14, padding: 36, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          {sent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: "#111", fontFamily: "Georgia,serif", marginBottom: 10 }}>
                Check your email
              </h2>
              <p style={{ fontSize: 14, color: "#555", lineHeight: 1.6, marginBottom: 24 }}>
                If that email is registered you'll receive a link shortly. Check your spam folder if you don't see it within a few minutes.
              </p>
              <Link href="/dealer/login" style={{ color: RED, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 26, fontWeight: 900, color: "#111", fontFamily: "Georgia,serif", marginBottom: 6 }}>
                Reset your password
              </h2>
              <p style={{ color: "#666", fontSize: 14, marginBottom: 28 }}>
                Enter your email and we'll send you a reset link.
              </p>

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Email address</label>
                  <input
                    style={inputStyle}
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>

                {error && (
                  <div style={{ background: "#fef2f2", color: "#991b1b", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 600 }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !csrfToken}
                  style={{ background: (loading || !csrfToken) ? "#9ca3af" : RED, color: "#fff", border: "none", borderRadius: 9, padding: "14px 0", fontSize: 15, fontWeight: 800, cursor: (loading || !csrfToken) ? "default" : "pointer" }}
                >
                  {loading ? "Sending…" : "Send reset link"}
                </button>
              </form>

              <div style={{ marginTop: 20, textAlign: "center" }}>
                <Link href="/dealer/login" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none", fontWeight: 600 }}>
                  ← Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
