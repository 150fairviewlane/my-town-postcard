import { useState, useEffect } from "react";

// ─── Georgia state SVG outline ────────────────────────────────────────────────
// Simplified polygon of Georgia's border. ViewBox 0 0 340 410.
// Points computed from actual state boundary lat/lng coordinates:
//   minLat=30.35 maxLat=35.05 minLng=-85.65 maxLng=-80.80
// Clockwise from NW corner.
const GA_PATH =
  "M 13,15 L 98,14 L 178,14 L 192,56 L 213,114 " +
  "L 310,214 L 285,307 L 281,362 L 248,390 " +
  "L 162,390 L 62,390 L 53,337 L 41,210 L 41,90 Z";

const SVG_W = 340;
const SVG_H = 410;
const PAD = 10;
const GA_MIN_LAT = 30.35;
const GA_MAX_LAT = 35.05;
const GA_MIN_LNG = -85.65;
const GA_MAX_LNG = -80.80;

function project(lat, lng) {
  const x = PAD + ((lng - GA_MIN_LNG) / (GA_MAX_LNG - GA_MIN_LNG)) * (SVG_W - PAD * 2);
  const y = PAD + ((GA_MAX_LAT - lat) / (GA_MAX_LAT - GA_MIN_LAT)) * (SVG_H - PAD * 2);
  return { x, y };
}

const RED = "#7B1418";
const GOLD = "#C9A84C";

// ─── Main component ───────────────────────────────────────────────────────────
export default function GeorgiaTerritoryMap() {
  const [territories, setTerritories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/territories/public`)
      .then(r => r.json())
      .then(data => { setTerritories(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pinned = territories.filter(t => t.latitude != null && t.longitude != null);
  const all = territories;

  const handleClick = (slug) => {
    window.location.href = `/${slug}`;
  };

  return (
    <section style={{ background: "#fafaf8", padding: "72px 24px 60px", textAlign: "center" }}>
      <div style={{ maxWidth: 1060, margin: "0 auto" }}>
        {/* Section heading */}
        <h2 style={{
          fontFamily: "Georgia,serif", fontWeight: 900, fontSize: "clamp(26px, 3.5vw, 38px)",
          color: "#111", margin: "0 0 10px",
        }}>
          Find Your Town on the Map
        </h2>
        <p style={{
          fontFamily: "sans-serif", fontSize: 16, color: "#555",
          margin: "0 auto 40px", maxWidth: 520, lineHeight: 1.6,
        }}>
          Click your town to see available ad spots and pricing.
        </p>

        {/* Map + sidebar layout */}
        <div style={{
          display: "flex", gap: 32, alignItems: "flex-start", justifyContent: "center",
          flexWrap: "wrap",
        }}>
          {/* SVG map */}
          <div style={{
            position: "relative", display: "inline-block",
            filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.10))",
            flexShrink: 0,
          }}>
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              style={{
                width: "min(90vw, 340px)", height: "auto",
                display: "block",
              }}
              aria-label="Map of Georgia showing active postcard territories"
            >
              {/* State outline */}
              <path
                d={GA_PATH}
                fill="#f0ebe3"
                stroke="#c8b89a"
                strokeWidth="2"
                strokeLinejoin="round"
              />

              {/* Territory pins */}
              {pinned.map(t => {
                const { x, y } = project(t.latitude, t.longitude);
                const isHovered = hovered === t.slug;
                return (
                  <g key={t.slug} style={{ cursor: "pointer" }} onClick={() => handleClick(t.slug)}>
                    {/* Transparent hit target (≥44×44px) */}
                    <rect
                      x={x - 22} y={y - 22} width={44} height={44}
                      fill="transparent"
                      onMouseEnter={() => setHovered(t.slug)}
                      onMouseLeave={() => setHovered(null)}
                      onTouchStart={() => setHovered(isHovered ? null : t.slug)}
                    />
                    {/* Outer ring (shown on hover) */}
                    {isHovered && (
                      <circle cx={x} cy={y} r={14}
                        fill="none" stroke={GOLD} strokeWidth={2.5}
                        style={{ pointerEvents: "none" }}
                      />
                    )}
                    {/* Pin dot */}
                    <circle cx={x} cy={y} r={isHovered ? 9 : 7}
                      fill={RED}
                      stroke="#fff" strokeWidth={2}
                      style={{
                        transition: "r 0.15s",
                        filter: isHovered ? `drop-shadow(0 2px 6px ${RED}88)` : "none",
                        pointerEvents: "none",
                      }}
                    />
                  </g>
                );
              })}

              {/* Hover tooltip — rendered last so it's on top */}
              {hovered && (() => {
                const t = pinned.find(p => p.slug === hovered);
                if (!t) return null;
                const { x, y } = project(t.latitude, t.longitude);
                // Flip tooltip below pin if near top edge
                const above = y > 60;
                const ty = above ? y - 16 : y + 24;
                const label = `${t.name} — ${t.paidSpots} of ${t.totalSpots} spots claimed`;
                // Estimate tooltip width
                const tw = Math.min(label.length * 6.5 + 24, 220);
                const tx = Math.max(PAD + 2, Math.min(SVG_W - tw - PAD - 2, x - tw / 2));
                return (
                  <g style={{ pointerEvents: "none" }}>
                    <rect x={tx} y={above ? ty - 26 : ty}
                      width={tw} height={28}
                      rx={6} fill="#111" opacity={0.92}
                    />
                    <text
                      x={tx + tw / 2} y={above ? ty - 7 : ty + 17}
                      textAnchor="middle"
                      fill="#fff" fontSize={11} fontFamily="system-ui,sans-serif" fontWeight={600}
                    >
                      {label}
                    </text>
                  </g>
                );
              })()}
            </svg>
          </div>

          {/* Territory list / legend */}
          {all.length > 0 && (
            <div style={{
              display: "flex", flexDirection: "column", gap: 10,
              alignItems: "flex-start", minWidth: 180,
            }}>
              <div style={{
                fontFamily: "sans-serif", fontSize: 12, fontWeight: 700,
                color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1,
                marginBottom: 4,
              }}>
                Active territories
              </div>
              {all.map(t => (
                <a
                  key={t.slug}
                  href={`/${t.slug}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    fontFamily: "sans-serif", fontSize: 14, fontWeight: 700,
                    color: RED, textDecoration: "none",
                    padding: "10px 16px",
                    background: "#fff", borderRadius: 10,
                    border: `1.5px solid #e5e7eb`,
                    transition: "border-color 0.15s, box-shadow 0.15s",
                    minWidth: 180,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = RED;
                    e.currentTarget.style.boxShadow = `0 2px 10px ${RED}22`;
                    if (t.latitude != null) setHovered(t.slug);
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                    e.currentTarget.style.boxShadow = "none";
                    setHovered(null);
                  }}
                >
                  <span style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: RED, flexShrink: 0, display: "inline-block",
                  }} />
                  <span>
                    {t.name}
                    <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#9ca3af", marginTop: 1 }}>
                      {t.paidSpots} of {t.totalSpots} spots claimed
                    </span>
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{ fontFamily: "sans-serif", fontSize: 14, color: "#9ca3af", marginTop: 32 }}>
            Loading territories…
          </div>
        )}

        {/* Empty state */}
        {!loading && all.length === 0 && (
          <div style={{ fontFamily: "sans-serif", fontSize: 14, color: "#9ca3af", marginTop: 32 }}>
            No active territories yet — check back soon.
          </div>
        )}
      </div>
    </section>
  );
}
