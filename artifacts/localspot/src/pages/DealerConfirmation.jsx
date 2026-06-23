import { useEffect, useState } from "react";

const RED = "#7B1418";
const REDIRECT_DELAY = 5; // seconds before auto-redirect

export default function DealerConfirmation() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const [countdown, setCountdown] = useState(REDIRECT_DELAY);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId) {
      setState({ status: "error", data: null, error: "Missing session id in the return URL." });
      return;
    }
    const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    const url = `${baseUrl}/api/dealers/confirm?session_id=${encodeURIComponent(sessionId)}`;
    fetch(url)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Server returned ${res.status}`);
        setState({ status: "ok", data: body, error: null });
      })
      .catch((err) => setState({ status: "error", data: null, error: err.message }));
  }, []);

  // Give the dealer time to read the congrats screen before redirecting.
  useEffect(() => {
    if (state.status !== "ok" || !state.data?.portalUrl) return;
    setCountdown(REDIRECT_DELAY);
    const interval = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(interval);
          window.location.replace(state.data.portalUrl);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state]);

  return (
    <div style={{ background: "#f9fafb", minHeight: "100vh",
      fontFamily: "sans-serif", padding: "48px 16px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ background: "#fff", borderRadius: 16,
          boxShadow: "0 2px 16px rgba(0,0,0,0.06)", padding: 40,
          textAlign: "center" }}>

          {state.status === "loading" && (
            <>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: "#111",
                fontFamily: "Georgia,serif", marginBottom: 8 }}>
                Confirming your payment…
              </h1>
              <p style={{ fontSize: 14, color: "#666" }}>
                Just a moment while we activate your dealer account.
              </p>
            </>
          )}

          {state.status === "ok" && (
            <>
              <div style={{ fontSize: 60, marginBottom: 12 }}>🎉</div>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: "#111",
                fontFamily: "Georgia,serif", marginBottom: 8 }}>
                You're in, {state.data.name?.split(" ")[0] || "partner"}!
              </h1>
              <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.6, marginBottom: 6 }}>
                Your territory is live and your dealer account is ready.
              </p>
              <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 28 }}>
                Check your email — we sent your login link and next steps.
              </p>
              {state.data.portalUrl && (
                <a href={state.data.portalUrl}
                  style={{ display: "inline-block",
                    background: RED, color: "#fff", padding: "13px 32px",
                    borderRadius: 9, textDecoration: "none",
                    fontWeight: 800, fontSize: 15, marginBottom: 16 }}>
                  Go to my dealer portal →
                </a>
              )}
              <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                Redirecting automatically in {countdown}s…
              </p>
            </>
          )}

          {state.status === "error" && (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: "#991b1b",
                fontFamily: "Georgia,serif", marginBottom: 8 }}>
                Couldn't confirm your payment
              </h1>
              <p style={{ fontSize: 14, color: "#666", lineHeight: 1.6, marginBottom: 18 }}>
                {state.error}
              </p>
              <p style={{ fontSize: 13, color: "#888", marginBottom: 18 }}>
                If you completed payment but see this, contact us at{" "}
                <a href="mailto:info@mytownpostcard.com" style={{ color: RED }}>
                  info@mytownpostcard.com
                </a>{" "}
                and we'll sort it out within a business day.
              </p>
              <Link href="/dealers" style={{ display: "inline-block",
                background: RED, color: "#fff", padding: "10px 22px", borderRadius: 8,
                textDecoration: "none", fontWeight: 800, fontSize: 14 }}>
                Back to Dealer Page
              </Link>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
