import { useEffect, useState } from "react";
import { Link } from "wouter";

const RED = "#7B1418";
const GOLD = "#d4a017";

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

          {state.status === "ok" && (
            <>
              <div style={{ fontSize: 60, marginBottom: 12 }}>🎉</div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111",
                fontFamily: "Georgia,serif", marginBottom: 8 }}>
                Welcome aboard, {state.data.name?.split(" ")[0] || "partner"}!
              </h1>
              <p style={{ fontSize: 15, color: "#444", lineHeight: 1.6, marginBottom: 24 }}>
                Your dealer account is{" "}
                <strong style={{ color: state.data.status === "active" ? "#15803d" : "#92400e" }}>
                  {state.data.status === "active" ? "active" : state.data.status}
                </strong>{" "}
                and your territories are locked in.
              </p>

              {state.data.territories?.length > 0 && (
                <div style={{ background: "#fafafa", borderRadius: 12,
                  padding: 18, marginBottom: 24, textAlign: "left" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#888",
                    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
                    Your territories
                  </div>
                  {state.data.territories.map((t) => (
                    <div key={t.territoryIndex} style={{
                      display: "flex", justifyContent: "space-between",
                      padding: "8px 0", borderBottom: "1px dashed #e5e7eb",
                      fontSize: 14 }}>
                      <span style={{ color: "#111", fontWeight: 600 }}>
                        {t.territoryIndex + 1}. {t.cityLabel}
                      </span>
                      <span style={{ color: "#666" }}>
                        {t.zipCount} ZIPs · ~{t.estimatedHouseholds.toLocaleString()} homes
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}55`,
                borderRadius: 10, padding: 16, marginBottom: 24, textAlign: "left",
                fontSize: 13.5, color: "#5a4708", lineHeight: 1.6 }}>
                <strong>What happens next:</strong>
                <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                  <li>We'll email you within 1 business day with your dealer kit and onboarding call.</li>
                  <li>Your dealer dashboard (campaign tracking, commissions) is launching in our next release — we'll notify you.</li>
                  <li>Your $99/mo subscription has started; you can cancel anytime by replying to that welcome email.</li>
                </ul>
              </div>

              <Link href="/" style={{ display: "inline-block",
                background: RED, color: "#fff", padding: "12px 28px", borderRadius: 9,
                textDecoration: "none", fontWeight: 800, fontSize: 15 }}>
                Visit My Town Postcard →
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
