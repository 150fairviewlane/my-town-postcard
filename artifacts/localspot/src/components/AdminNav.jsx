import { useState } from "react";
import { Link, useLocation } from "wouter";

const BURGUNDY = "#991b1b";
const SIDEBAR_W = 220;

function NavSection({ label }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, color: "#9ca3af",
      textTransform: "uppercase", letterSpacing: 1.2,
      padding: "16px 16px 4px",
    }}>
      {label}
    </div>
  );
}

function NavLink({ href, icon, label, external }) {
  const [location] = useLocation();
  const isActive = !external && (
    href === "/admin" ? location === "/admin" : location.startsWith(href)
  );

  const style = {
    display: "flex", alignItems: "center", gap: 9,
    padding: "7px 16px", borderRadius: 7,
    margin: "1px 8px",
    fontSize: 13, fontWeight: isActive ? 800 : 500,
    color: isActive ? BURGUNDY : "#374151",
    background: isActive ? "#fef2f2" : "transparent",
    textDecoration: "none", cursor: "pointer",
    transition: "background 0.1s, color 0.1s",
  };

  const inner = (
    <>
      <span style={{ fontSize: 15, flexShrink: 0, width: 18, textAlign: "center" }}>{icon}</span>
      <span style={{ lineHeight: 1.3 }}>{label}</span>
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={style}>
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} style={style}>
      {inner}
    </Link>
  );
}

function TestEmailWidget({ token }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("idle");
  const [errMsg, setErrMsg] = useState("");

  const send = async () => {
    if (!to.trim()) return;
    setStatus("sending");
    setErrMsg("");
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/admin/test-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: to.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setStatus("success");
        setTimeout(() => { setStatus("idle"); setOpen(false); setTo(""); }, 3000);
      } else {
        setStatus("error");
        setErrMsg(json.error ?? "Unknown error");
      }
    } catch (e) {
      setStatus("error");
      setErrMsg(String(e));
    }
  };

  return (
    <div style={{ margin: "1px 8px" }}>
      <button
        onClick={() => { setOpen(v => !v); setStatus("idle"); setErrMsg(""); }}
        style={{
          display: "flex", alignItems: "center", gap: 9,
          width: "100%", padding: "7px 8px", borderRadius: 7,
          fontSize: 13, fontWeight: 500, color: "#374151",
          background: open ? "#f3f4f6" : "transparent",
          border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ fontSize: 15, width: 18, textAlign: "center" }}>📧</span>
        <span>Test Email</span>
      </button>
      {open && (
        <div style={{
          margin: "4px 0 4px 26px",
          background: "#f9fafb", border: "1px solid #e5e7eb",
          borderRadius: 8, padding: "10px 12px",
        }}>
          <input
            type="email"
            placeholder="recipient@example.com"
            value={to}
            onChange={e => { setTo(e.target.value); setStatus("idle"); }}
            onKeyDown={e => e.key === "Enter" && send()}
            style={{
              width: "100%", padding: "6px 8px", borderRadius: 6,
              border: "1px solid #d1d5db", fontSize: 12, outline: "none",
              boxSizing: "border-box", marginBottom: 6,
            }}
          />
          {status === "success" && (
            <div style={{ color: "#15803d", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>✅ Sent!</div>
          )}
          {status === "error" && (
            <div style={{ color: "#991b1b", fontSize: 11, marginBottom: 6 }}>❌ {errMsg}</div>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={send}
              disabled={!to.trim() || status === "sending"}
              style={{
                flex: 1, padding: "5px 0", borderRadius: 6, border: "none",
                background: "#065f46", color: "#fff", fontSize: 12,
                fontWeight: 700, cursor: "pointer",
                opacity: (!to.trim() || status === "sending") ? 0.5 : 1,
              }}
            >
              {status === "sending" ? "Sending…" : "Send"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                padding: "5px 10px", borderRadius: 6,
                border: "1px solid #d1d5db", background: "#fff",
                fontSize: 12, cursor: "pointer", color: "#374151",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminNav() {
  const [toolsOpen, setToolsOpen] = useState(false);
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") ?? "" : "";

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    window.location.href = "/admin";
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, bottom: 0,
      width: SIDEBAR_W, background: "#fff",
      borderRight: "1px solid #e5e7eb",
      display: "flex", flexDirection: "column",
      overflowY: "auto", zIndex: 100,
    }}>
      {/* Brand */}
      <Link href="/admin" style={{ textDecoration: "none" }}>
        <div style={{
          padding: "18px 16px 14px",
          borderBottom: "1px solid #f3f4f6",
        }}>
          <div style={{
            fontWeight: 900, fontSize: 15, color: BURGUNDY,
            fontFamily: "Georgia, serif", lineHeight: 1.2,
          }}>
            📮 My Town Postcard
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Admin Dashboard</div>
        </div>
      </Link>

      {/* Nav items */}
      <div style={{ flex: 1, paddingBottom: 16 }}>
        <div style={{ paddingTop: 8 }}>
          <NavLink href="/admin" icon="🏠" label="Overview" />
        </div>

        <NavSection label="Dealers" />
        <NavLink href="/admin/dealers" icon="💼" label="All Dealers" />

        <NavSection label="Territories" />
        <NavLink href="/admin/territories" icon="🗺" label="All Territories" />
        <NavLink href="/admin/territories/detail" icon="📅" label="Spot Tables" />

        <NavSection label="Sales" />
        <NavLink href="/admin/outreach" icon="📞" label="Outreach Tracker" />
        <NavLink href="/admin/discover" icon="🔍" label="Discover Leads" />

        <NavSection label="Analytics" />
        <NavLink href="/admin/scans" icon="📊" label="Scan Analytics" />
        <NavLink href="/admin/subscriptions" icon="🔁" label="Subscriptions" />

        {/* Tools collapsible */}
        <div style={{ borderTop: "1px solid #f3f4f6", marginTop: 12, paddingTop: 4 }}>
          <button
            onClick={() => setToolsOpen(v => !v)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", padding: "7px 16px", margin: "1px 0",
              fontSize: 10, fontWeight: 800, color: "#9ca3af",
              textTransform: "uppercase", letterSpacing: 1.2,
              background: "none", border: "none", cursor: "pointer",
            }}
          >
            <span>Tools</span>
            <span style={{ fontSize: 10, transition: "transform 0.2s", transform: toolsOpen ? "rotate(180deg)" : "none" }}>▾</span>
          </button>

          {toolsOpen && (
            <div style={{ paddingBottom: 4 }}>
              <NavLink href="/admin/ai-test" icon="🧪" label="AI Model Testing" />
              <NavLink href="/admin/image-gen" icon="🖼" label="Image Generator" />
              <NavLink href="/api/grok-ad-generator" icon="✦" label="Grok Ad Gen" external />
              <NavLink href="/api/admin/image-library" icon="📷" label="Image Library" external />
              <NavLink href={`/admin/territories/zip-manager?token=${encodeURIComponent(token)}`} icon="📍" label="ZIP Manager" />
              <TestEmailWidget token={token} />
            </div>
          )}
        </div>
      </div>

      {/* Logout */}
      <div style={{ borderTop: "1px solid #f3f4f6", padding: "10px 8px" }}>
        <button
          onClick={handleLogout}
          style={{
            display: "flex", alignItems: "center", gap: 9,
            width: "100%", padding: "7px 8px", borderRadius: 7,
            fontSize: 13, fontWeight: 600, color: "#6b7280",
            background: "none", border: "none", cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 15, width: 18, textAlign: "center" }}>↩</span>
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
