import { useLocation } from "wouter";

export default function ConfirmationPage() {
  const [, navigate] = useLocation();

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 24px" }}>
        <div style={{ fontWeight: 900, fontSize: 18, color: "#111", fontFamily: "Georgia,serif" }}>📮 My Town Postcard</div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 20px" }}>
        <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#f0fdf4", border: "3px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 36 }}>
            🎉
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: "#111", fontFamily: "Georgia,serif", margin: "0 0 12px" }}>
            You're on the Postcard!
          </h1>
          <p style={{ color: "#6b7280", fontSize: 16, lineHeight: 1.7, marginBottom: 32 }}>
            Your spot is confirmed. Check your email for next steps, including how to upload your ad or request our design service.
          </p>

          <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 28, textAlign: "left" }}>
            {[["📬", "5,000 homes", "will receive your ad via USPS EDDM"],
              ["🎨", "Ad design included", "if you need it — we'll reach out within 48 hours"],
              ["📍", "Exclusive placement", "one business per category — no competitors"],
            ].map(([ic, title, desc]) => (
              <div key={title} style={{ display: "flex", gap: 14, marginBottom: 16 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{ic}</span>
                <div>
                  <div style={{ fontWeight: 700, color: "#111", fontSize: 14 }}>{title}</div>
                  <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate("/")}
            style={{ background: "#991b1b", color: "#fff", border: "none", borderRadius: 10, padding: "13px 32px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            Back to Postcard
          </button>
        </div>
      </div>
    </div>
  );
}
