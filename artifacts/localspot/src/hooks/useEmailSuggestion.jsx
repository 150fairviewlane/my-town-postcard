import { run } from "@zootools/email-spell-checker";
import { useState, useCallback } from "react";

export function useEmailSuggestion() {
  const [suggestion, setSuggestion] = useState(null);

  const check = useCallback((email) => {
    if (!email || !email.includes("@")) {
      setSuggestion(null);
      return;
    }
    const result = run({ email });
    setSuggestion(result ? result.full : null);
  }, []);

  const dismiss = useCallback(() => setSuggestion(null), []);
  const clear = useCallback(() => setSuggestion(null), []);

  return { suggestion, check, dismiss, clear };
}

export function EmailSuggestionHint({ suggestion, onAccept, onDismiss }) {
  if (!suggestion) return null;
  return (
    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, lineHeight: 1.5 }}>
      Did you mean{" "}
      <button
        type="button"
        onClick={() => onAccept(suggestion)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          color: "#2563eb",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          textDecoration: "underline",
        }}
      >
        {suggestion}
      </button>
      ?{" "}
      <button
        type="button"
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          color: "#9ca3af",
          cursor: "pointer",
          fontSize: 11,
          marginLeft: 2,
        }}
      >
        ✕
      </button>
    </div>
  );
}
