import { useLocation } from "wouter";

export default function IndustryConflictDialog({ industry, onChooseDifferent, onDismiss }) {
  const [, navigate] = useLocation();

  const handleRequestOptions = () => {
    onDismiss?.();
    navigate(`/request-options?industry=${encodeURIComponent(industry)}`);
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 2100, padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420,
        padding: "36px 32px", boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 44, marginBottom: 12, lineHeight: 1 }}>⚠️</div>
        <h2 style={{ fontWeight: 900, fontSize: 21, color: "#111", margin: "0 0 10px", fontFamily: "Georgia, serif" }}>
          That category is taken
        </h2>
        <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.65, margin: "0 0 28px" }}>
          <strong style={{ color: "#111" }}>{industry}</strong> is already reserved on this
          postcard. Each category is exclusive — only one business per industry per mailing.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={onChooseDifferent}
            style={{
              padding: "13px 0", background: "#111", color: "#fff",
              border: "none", borderRadius: 10, fontSize: 14,
              fontWeight: 700, cursor: "pointer", letterSpacing: 0.2,
            }}>
            Choose a Different Category
          </button>
          <button
            onClick={handleRequestOptions}
            style={{
              padding: "13px 0", background: "#fff", color: "#991b1b",
              border: "2px solid #991b1b", borderRadius: 10, fontSize: 14,
              fontWeight: 700, cursor: "pointer", letterSpacing: 0.2,
            }}>
            Request More Options →
          </button>
        </div>
      </div>
    </div>
  );
}
