import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { clearReservation } from "../lib/reservationStorage";

const RED = "#7B1418";

const SIZE_LABEL = {
  xl: "Extra-Large",
  large: "Large",
  medium: "Medium",
  small: "Small",
};

function getQueryParam(name) {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

// Landing page for the hosted Stripe Checkout success_url used by territory /
// dealer landing pages. Verifies the session server-side (which idempotently
// marks the spot paid) and then routes the customer to upload their ad.
export default function SpotConfirmationPage() {
  const [, navigate] = useLocation();
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  useEffect(() => {
    const sessionId = getQueryParam("session_id");
    if (!sessionId) {
      setState({ status: "error", data: null, error: "Missing session id." });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
        const res = await fetch(
          `${base}/api/checkout/spot-session-confirm?session_id=${encodeURIComponent(sessionId)}`,
          { headers: { Accept: "application/json" } },
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || `Server returned ${res.status}`);
        if (cancelled) return;
        if (body?.spotId) clearReservation(body.spotId);
        setState({ status: "ok", data: body, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({ status: "error", data: null, error: err?.message || "Could not confirm your purchase." });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "48px 20px" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 32, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          {state.status === "loading" && (
            <div style={{ textAlign: "center", color: "#6b7280" }}>Confirming your purchase…</div>
          )}
          {state.status === "error" && (
            <div>
              <h1 style={{ fontFamily: "Georgia,serif", color: "#991b1b", margin: 0 }}>Something went wrong</h1>
              <p style={{ color: "#374151", marginTop: 12 }}>{state.error}</p>
              <p style={{ color: "#6b7280", fontSize: 13 }}>
                If you completed payment, don't worry — your spot is recorded on our end. Email us and we'll send your confirmation.
              </p>
              <button
                onClick={() => navigate("/")}
                style={{ marginTop: 16, padding: "10px 18px", borderRadius: 8, border: "none", background: RED, color: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                Back to home
              </button>
            </div>
          )}
          {state.status === "ok" && state.data && !state.data.success && (
            <div>
              <h1 style={{ fontFamily: "Georgia,serif", color: "#92400e", margin: 0 }}>Payment not completed</h1>
              <p style={{ color: "#374151", marginTop: 12 }}>
                It looks like the payment wasn't finished. Your spot hold may still be active — head back and try again.
              </p>
              <button
                onClick={() => navigate("/")}
                style={{ marginTop: 16, padding: "10px 18px", borderRadius: 8, border: "none", background: RED, color: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                Back to home
              </button>
            </div>
          )}
          {state.status === "ok" && state.data && state.data.success && (
            <div>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
              <h1 style={{ fontFamily: "Georgia,serif", color: "#111", margin: "0 0 8px" }}>
                Your spot is secured!
              </h1>
              <p style={{ color: "#374151", marginTop: 0 }}>
                {state.data.businessName ? <>Thanks, <strong>{state.data.businessName}</strong>. </> : "Thank you. "}
                Your{state.data.size ? ` ${SIZE_LABEL[state.data.size] || state.data.size}` : ""} ad spot on the postcard is now reserved and paid.
              </p>
              {typeof state.data.amountCents === "number" && (
                <div style={{ background: "#f8fafc", borderRadius: 10, padding: 16, marginTop: 16 }}>
                  <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>Paid</div>
                  <div style={{ fontSize: 18, color: "#111", fontWeight: 800 }}>
                    ${(state.data.amountCents / 100).toFixed(2)}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                <button
                  onClick={() => {
                    const side = state.data.side || "front";
                    const area = state.data.gridArea || "";
                    navigate(`/?side=${side}${area ? `&highlight=${area}` : ""}`);
                  }}
                  style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", background: RED, color: "#fff", fontWeight: 700, cursor: "pointer" }}
                >
                  View Your Ad on the Postcard →
                </button>
                <button
                  onClick={() => navigate("/")}
                  style={{ width: "100%", padding: 12, borderRadius: 8, border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 700, cursor: "pointer" }}
                >
                  Back to home
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
