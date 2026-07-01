import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function SubscriptionConfirmationPage() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState("loading");
  const [details, setDetails] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [fromSlug, setFromSlug] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const slug = params.get("from") || "";
    if (slug) setFromSlug(slug);
    if (!sessionId) {
      setErrorMsg("No session ID found. Please contact support.");
      setStatus("error");
      return;
    }

    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    fetch(`${base}/api/checkout/subscription-confirm?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success) {
          setDetails({
            commitmentType: data.commitmentType,
            totalIssues: data.totalIssues,
            spotId: data.spotId,
          });
          setStatus("success");
        } else {
          setErrorMsg(data?.error ?? "Payment verification failed. Please contact support.");
          setStatus("error");
        }
      })
      .catch(() => {
        setErrorMsg("Network error confirming payment. Please contact support.");
        setStatus("error");
      });
  }, []);

  if (status === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid #e5e7eb", borderTopColor: "#7B1418", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: "#374151", fontWeight: 600 }}>Confirming your subscription…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", padding: 24 }}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ color: "#7B1418", marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: "#6b7280", marginBottom: 24 }}>{errorMsg}</p>
          <a href="/" style={{ color: "#7B1418", fontWeight: 600 }}>← Return to Home</a>
        </div>
      </div>
    );
  }

  const planLabel = details?.commitmentType === "12_issue" ? "12-Month Premium Plan" : "6-Month Growth Plan";

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 520, width: "100%", background: "#fff", borderRadius: 16, padding: 40, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", textAlign: "center" }}>

        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 28 }}>
          ✓
        </div>

        <h1 style={{ color: "#111827", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          You're confirmed!
        </h1>
        <p style={{ color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
          Your <strong>{planLabel}</strong> is active. Your ad spot is reserved and secured.
        </p>

        <div style={{ background: "#f8f4f0", border: "1px solid #e8ddd5", borderRadius: 12, padding: 20, textAlign: "left", marginBottom: 28 }}>
          <p style={{ fontWeight: 700, color: "#7B1418", marginBottom: 12, fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5 }}>What happens next</p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", color: "#374151", fontSize: 14, lineHeight: 1.8 }}>
            <li>📧 A confirmation email is on its way to you</li>
            <li>📬 Your postcard mails to 5,000 local households</li>
          </ul>
        </div>

        <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 28 }}>
          Questions? Reply to your confirmation email or contact us anytime.
        </p>


        <button
          onClick={() => navigate(fromSlug ? `/${fromSlug}` : "/")}
          style={{ display: "inline-block", background: "#7B1418", color: "#fff", fontWeight: 600, padding: "12px 28px", borderRadius: 8, border: "none", fontSize: 15, cursor: "pointer" }}
        >
          View My Ad on Postcard
        </button>
      </div>
    </div>
  );
}