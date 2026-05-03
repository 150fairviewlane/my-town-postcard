import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof console !== "undefined") {
      console.error("[ErrorBoundary]", error, info?.componentStack);
    }
  }

  handleReload = () => {
    try {
      window.location.reload();
    } catch {
      /* ignore */
    }
  };

  handleHome = () => {
    try {
      const base = (import.meta.env?.BASE_URL || "/").replace(/\/$/, "") || "/";
      window.location.href = base === "/" ? "/" : `${base}/`;
    } catch {
      window.location.href = "/";
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    const message =
      this.state.error?.message ||
      (typeof this.state.error === "string" ? this.state.error : "Something went wrong.");

    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f9fafb",
          fontFamily: "sans-serif",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            background: "#fff",
            borderRadius: 14,
            padding: 28,
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 10 }}>😬</div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: "#111",
              margin: "0 0 8px",
              fontFamily: "Georgia,serif",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              color: "#6b7280",
              fontSize: 14,
              lineHeight: 1.55,
              margin: "0 0 18px",
            }}
          >
            We hit an unexpected error rendering this page. A refresh usually fixes
            it. If this keeps happening, please send us the message below.
          </p>
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              fontSize: 12,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 18,
              textAlign: "left",
              wordBreak: "break-word",
              maxHeight: 160,
              overflow: "auto",
            }}
          >
            {message}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                background: "#991b1b",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "11px 22px",
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Refresh page
            </button>
            <button
              type="button"
              onClick={this.handleHome}
              style={{
                background: "transparent",
                color: "#991b1b",
                border: "1.5px solid #991b1b",
                borderRadius: 10,
                padding: "11px 22px",
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
