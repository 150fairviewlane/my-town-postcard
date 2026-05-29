import { useEffect, useState } from "react";

const RED = "#7B1418";

export default function DealerConfirmation() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });

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

  // As soon as the confirm API responds, redirect the dealer straight to their
  // self-service portal. The portalUrl is always included in a successful
  // confirm response.
  useEffect(() => {
    if (state.status === "ok" && state.data?.portalUrl) {
      window.location.replace(state.data.portalUrl);
    }
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

          {/* "ok" branch: show a brief redirect notice while the effect fires */}
          {state.status === "ok" && (
            <>
              <div style={{ fontSize: 60, marginBottom: 12 }}>🎉</div>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: "#111",
                fontFamily: "Georgia,serif", marginBottom: 8 }}>
                You're in, {state.data.name?.split(" ")[0] || "partner"}!
              </h1>
              <p style={{ fontSize: 14, color: "#666", lineHeight: 1.6, marginBottom: 20 }}>
                Taking you to your dealer portal…
              </p>
              {/* Fallback link if the redirect is blocked (e.g. popup blocker) */}
              {state.data.portalUrl && (
                <a href={state.data.portalUrl}
                  style={{ display: "inline-block",
                    background: RED, color: "#fff", padding: "12px 28px",
                    borderRadius: 9, textDecoration: "none",
                    fontWeight: 800, fontSize: 15 }}>
                  Go to my portal →
                </a>
              )}
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
