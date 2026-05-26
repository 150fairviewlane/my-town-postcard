import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { clearReservation } from "../lib/reservationStorage";

const PLAN_LABEL = {
  "6_issue": "Growth Plan",
  "12_issue": "Premium Visibility Plan",
  single: "One-Time Placement",
};

function getQueryParam(name) {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

export default function SubscriptionConfirmationPage() {
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
          `${base}/api/checkout/subscription-confirm?session_id=${encodeURIComponent(sessionId)}`,
          { headers: { Accept: "application/json" } },
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || `Server returned ${res.status}`);
        if (cancelled) return;
        if (body?.spotId) clearReservation(body.spotId);
        setState({ status: "ok", data: body, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({ status: "error", data: null, error: err?.message || "Could not confirm subscription." });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "48px 20px" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 32, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          {state.status === "loading" && (
            <div style={{ textAlign: "center", color: "#6b7280" }}>Confirming your subscription…</div>
          )}
          {state.status === "error" && (
            <div>
              <h1 style={{ fontFamily: "Georgia,serif", color: "#991b1b", margin: 0 }}>Something went wrong</h1>
              <p style={{ color: "#374151", marginTop: 12 }}>{state.error}</p>
              <p style={{ color: "#6b7280", fontSize: 13 }}>
                If you completed payment, don't worry — your subscription is recorded on our end. Email us and we'll send your confirmation.
              </p>
              <button
                onClick={() => navigate("/")}
                style={{ marginTop: 16, padding: "10px 18px", borderRadius: 8, border: "none", background: "#991b1b", color: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                Back to home
              </button>
            </div>
          )}
          {state.status === "ok" && state.data && (
            <div>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
              <h1 style={{ fontFamily: "Georgia,serif", color: "#111", margin: "0 0 8px" }}>
                You're locked in for {state.data.totalIssues} issues
              </h1>
              <p style={{ color: "#374151", marginTop: 0 }}>
                Thanks for committing to the <strong>{PLAN_LABEL[state.data.commitmentType] || "subscription"}</strong>. Your first issue is on the next campaign — we'll automatically place your ad in the following {state.data.totalIssues - 1} issues, no extra purchase needed.
              </p>
              <div style={{ background: "#f8fafc", borderRadius: 10, padding: 16, marginTop: 16 }}>
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>Billing</div>
                <div style={{ fontSize: 16, color: "#111", fontWeight: 700 }}>
                  ${(state.data.monthlyCents / 100).toFixed(2)}/mo for {state.data.totalIssues} months
                </div>
                <div style={{ fontSize: 13, color: "#374151", marginTop: 6 }}>
                  Total committed: <strong>${(state.data.totalCents / 100).toFixed(2)}</strong>
                </div>
              </div>
              <div style={{ background: "#f0fdf4", borderLeft: "4px solid #15803d", borderRadius: 6, padding: 12, marginTop: 16, fontSize: 13, color: "#14532d" }}>
                ✓ No auto-renewal. Your subscription stops automatically after {state.data.totalIssues} issues.
              </div>
              <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
                <button
                  onClick={() => navigate(`/upload/${state.data.spotId}`)}
                  style={{ flex: 1, padding: 12, borderRadius: 8, border: "none", background: "#991b1b", color: "#fff", fontWeight: 700, cursor: "pointer" }}
                >
                  Upload Your Ad →
                </button>
                <button
                  onClick={() => navigate("/")}
                  style={{ flex: 1, padding: 12, borderRadius: 8, border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 700, cursor: "pointer" }}
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
