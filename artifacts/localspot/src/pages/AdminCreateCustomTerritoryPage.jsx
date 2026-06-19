import { useState } from "react";
import { Link } from "wouter";
import CreateTerritoryForm from "../components/CreateTerritoryForm";

const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export default function AdminCreateCustomTerritoryPage() {
  const [created, setCreated] = useState(null);

  return (
    <div style={{ minHeight: "100vh", background: "#f8f5f0", fontFamily: "DM Sans, sans-serif" }}>
      {/* Header */}
      <div style={{
        background: "#fff", borderBottom: "2px solid #e5e7eb",
        padding: "14px 28px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}>
        <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <span style={{ fontSize: 22 }}>📮</span>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#111", fontFamily: "Georgia, serif" }}>Custom Territory</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>Admin · Create city-based territory</div>
          </div>
        </Link>
        <a href={`${baseUrl}/admin`} style={{
          marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#374151",
          background: "#fff", border: "1px solid #d1d5db",
          borderRadius: 8, padding: "7px 12px", textDecoration: "none",
        }}>
          ← Back to Admin
        </a>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        {/* Success banner */}
        {created && (
          <div style={{
            background: "#f0fdf4", border: "1.5px solid #86efac",
            borderRadius: 12, padding: "20px 24px", marginBottom: 28,
          }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: "#15803d", marginBottom: 6 }}>
              ✅ Territory Created — ID: <span style={{ fontFamily: "monospace" }}>{created.territoryId}</span>
            </div>
            <div style={{ fontSize: 13, color: "#166534" }}>
              Territory is now live with status <strong>available</strong>.{" "}
              ZIP footprint ({created.totalZips} ZIPs) has been stored.
            </div>
            <button
              onClick={() => setCreated(null)}
              style={{
                marginTop: 12, fontSize: 12, color: "#166534", background: "none",
                border: "1px solid #86efac", borderRadius: 6, padding: "4px 10px", cursor: "pointer",
              }}
            >
              Create another
            </button>
          </div>
        )}

        {!created && (
          <CreateTerritoryForm onCreated={(t) => setCreated(t)} />
        )}
      </div>
    </div>
  );
}
