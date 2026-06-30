import { useState } from "react";
import AdminShell from "../components/AdminShell";

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

const TEMPLATES = [
  { key: "parchment-classic", label: "Parchment Classic",  portrait: "mr_biscuits_template_no_logo_1778806527327.png",          landscape: "parchment_classic_landscape_1779162178190.png" },
  { key: "made-fresh",        label: "Made Fresh",          portrait: "made_fresh_template.png",                                 landscape: "made_fresh_landscape_1779162178190.png" },
  { key: "neighborhood-pro",  label: "Neighborhood Pro",    portrait: "6300F2D5-6BF1-403E-A40B-7203E4E26402_1778948283280.jpeg", landscape: "IMG_0747_1779162178190.png" },
  { key: "at-your-service",   label: "At Your Service",     portrait: "IMG_0728_1779065210873.jpeg",                             landscape: "IMG_0746_1779162178190.png" },
  { key: "health-wellness",   label: "Health & Wellness",   portrait: "healthcare_generic_template_1779141099043.png",           landscape: "healthcare_wellness_landscape_1779162178190.png" },
  { key: "home-elegance",     label: "Home Elegance",       portrait: "home_services_no_text_1780946323885.png",                 landscape: "image_1780946327957.png" },
  { key: "sage-organic",      label: "Sage Organic",        portrait: "IMG_0832_1780946925550.png",                              landscape: "image_1780946917886.png" },
  { key: "purple-sage",       label: "Purple Sage",         portrait: "IMG_0836_1780951148325.png",                              landscape: "IMG_0837_1780951148325.png" },
  { key: "brush-stroke",      label: "Brush Stroke",        portrait: "IMG_0839_1780955044987.png",                              landscape: "IMG_0838_1780955044987.png" },
  { key: "heritage-home",     label: "Heritage Home",       portrait: "heritage_home_portrait.png",                              landscape: "heritage_home_landscape.png" },
  { key: "wok-fire",          label: "Wok Fire",            portrait: "image_1781029065584.png",                                 landscape: "image_1781029077663.png" },
];

function imgUrl(filename) {
  return `${BASE}/api/admin/template-image/${encodeURIComponent(filename)}`;
}

function Lightbox({ src, label, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 14, padding: 24,
      }}
    >
      <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{label}</div>
      <img
        src={src}
        alt={label}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: "90vw", maxHeight: "80vh",
          borderRadius: 8, boxShadow: "0 8px 48px rgba(0,0,0,0.6)",
          objectFit: "contain",
        }}
      />
      <button
        onClick={onClose}
        style={{
          padding: "8px 24px", borderRadius: 8, border: "none",
          background: "#fff", color: "#111", fontWeight: 700,
          fontSize: 14, cursor: "pointer",
        }}
      >
        Close
      </button>
    </div>
  );
}

function TemplateCard({ filename, label, orientation }) {
  const [lightbox, setLightbox] = useState(false);
  const [err, setErr] = useState(false);
  const src = imgUrl(filename);
  const fullLabel = `${label} — ${orientation}`;

  return (
    <>
      <div
        onClick={() => !err && setLightbox(true)}
        style={{
          background: "#fff",
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
          cursor: err ? "default" : "pointer",
          display: "flex", flexDirection: "column",
          transition: "box-shadow 0.15s",
        }}
        onMouseEnter={e => { if (!err) e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.16)"; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 6px rgba(0,0,0,0.08)"; }}
      >
        <div style={{
          aspectRatio: orientation === "portrait" ? "3/4" : "4/3",
          background: "#f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
        }}>
          {err ? (
            <div style={{ color: "#9ca3af", fontSize: 12, textAlign: "center", padding: 12 }}>
              Image not found
            </div>
          ) : (
            <img
              src={src}
              alt={fullLabel}
              onError={() => setErr(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          )}
        </div>
        <div style={{ padding: "8px 10px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>{orientation === "portrait" ? "◻ Portrait" : "▬ Landscape"}</div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2, wordBreak: "break-all", lineHeight: 1.3 }}>{filename}</div>
        </div>
      </div>
      {lightbox && <Lightbox src={src} label={fullLabel} onClose={() => setLightbox(false)} />}
    </>
  );
}

export default function AdminTemplateViewerPage() {
  const [filter, setFilter] = useState("all");

  return (
    <AdminShell>
      <div style={{ padding: "28px 32px", maxWidth: 1200 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 900, fontSize: 22, color: "#111", fontFamily: "Georgia,serif" }}>
            🖼 Reference Template Images
          </div>
          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
            All 22 active Grok reference images — 11 templates × portrait + landscape.
            Each image should have <strong>only</strong> a solid magenta square in the bottom-right corner (no QR codes).
            Click any image to view full size.
          </div>
        </div>

        {/* Filter */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {["all", "portrait", "landscape"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 16px", borderRadius: 8, border: "none",
                background: filter === f ? "#1e293b" : "#f1f5f9",
                color: filter === f ? "#fff" : "#374151",
                fontWeight: filter === f ? 700 : 500,
                fontSize: 13, cursor: "pointer", textTransform: "capitalize",
              }}
            >
              {f === "all" ? "All (22)" : f === "portrait" ? "◻ Portrait (11)" : "▬ Landscape (11)"}
            </button>
          ))}
        </div>

        {/* Grid — one row per template style */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {TEMPLATES.map(tmpl => (
            <div key={tmpl.key}>
              {/* Template section header */}
              <div style={{
                fontWeight: 800, fontSize: 14, color: "#111",
                marginBottom: 12, paddingBottom: 6,
                borderBottom: "1.5px solid #e5e7eb",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                {tmpl.label}
                <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 500, fontFamily: "monospace" }}>
                  {tmpl.key}
                </span>
              </div>

              {/* Two-column card layout per template */}
              <div style={{
                display: "grid",
                gridTemplateColumns: filter === "portrait" ? "repeat(auto-fill, minmax(220px, 1fr))"
                                   : filter === "landscape" ? "repeat(auto-fill, minmax(320px, 1fr))"
                                   : "repeat(2, 1fr)",
                gap: 16,
              }}>
                {(filter === "all" || filter === "portrait") && (
                  <TemplateCard
                    filename={tmpl.portrait}
                    label={tmpl.label}
                    orientation="portrait"
                  />
                )}
                {(filter === "all" || filter === "landscape") && (
                  <TemplateCard
                    filename={tmpl.landscape}
                    label={tmpl.label}
                    orientation="landscape"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
