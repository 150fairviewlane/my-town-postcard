import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import "leaflet/dist/leaflet.css";

const RED = "#7B1418";
const GOLD = "#C9A84C";

function cleanName(name) {
  return name
    .replace(/\s*&\s*Surrounding\s+Areas?\b/gi, "")
    .replace(/\s+Counties\b/gi, "")
    .replace(/\s+County\b/gi, "")
    .trim();
}

function makeIcon(L, highlighted = false) {
  const size = highlighted ? 22 : 16;
  const border = highlighted ? 3 : 2;
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${RED};border:${border}px solid #fff;
      box-shadow:0 2px 10px rgba(123,20,24,0.55);
      cursor:pointer;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [size / 2 + 4, 0],
  });
}

export default function GeorgiaTerritoryMap() {
  const [territories, setTerritories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(null);
  const [, navigate] = useLocation();
  const mapRef = useRef(null);

  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/territories/public`)
      .then(r => r.json())
      .then(data => { setTerritories(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pinned = territories.filter(t => t.latitude != null && t.longitude != null);

  useEffect(() => {
    if (loading) return;

    let L;
    let map;

    import("leaflet").then(mod => {
      L = mod.default;

      if (mapRef.current._leaflet_id) return;

      const seBounds = L.latLngBounds(
        L.latLng(24.0, -95.0),
        L.latLng(38.0, -73.0)
      );

      map = L.map(mapRef.current, {
        center: [32.9, -83.4],
        zoom: 7,
        minZoom: 6,
        maxZoom: 18,
        maxBounds: seBounds,
        maxBoundsViscosity: 1.0,
        scrollWheelZoom: true,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
        {
          attribution:
            "Tiles &copy; <a href='https://www.esri.com/'>Esri</a> &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community",
          maxZoom: 18,
        }
      ).addTo(map);

      pinned.forEach(t => {
        const icon = makeIcon(L, false);
        const marker = L.marker([t.latitude, t.longitude], { icon })
          .addTo(map)
          .on("click", () => navigate(`/${t.slug}#book`));

        const label = L.tooltip({
          permanent: true,
          direction: "right",
          offset: [12, 0],
          className: "mtp-territory-label",
        })
          .setContent(cleanName(t.name));

        marker.bindTooltip(label).openTooltip();

        marker.on("mouseover", () => {
          setHovered(t.slug);
          marker.setIcon(makeIcon(L, true));
        });
        marker.on("mouseout", () => {
          setHovered(null);
          marker.setIcon(makeIcon(L, false));
        });
      });
    });

    return () => {
      if (map) map.remove();
    };
  }, [loading, pinned.length]);

  return (
    <section style={{ background: "#f8f5f0", padding: "80px 24px 72px", textAlign: "center" }}>
      <style>{`
        .mtp-territory-label {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          color: #111 !important;
          font-family: Georgia, serif !important;
          font-size: 13px !important;
          font-weight: 700 !important;
          white-space: nowrap !important;
          text-shadow:
            -1px -1px 0 #fff,  1px -1px 0 #fff,
            -1px  1px 0 #fff,  1px  1px 0 #fff,
            0 2px 4px rgba(0,0,0,0.15) !important;
          pointer-events: none !important;
        }
        .leaflet-tooltip-pane {
          pointer-events: none !important;
        }
        .leaflet-tooltip-pane .leaflet-tooltip {
          pointer-events: none !important;
        }
        .leaflet-tooltip-pane .leaflet-tooltip * {
          pointer-events: none !important;
        }
        .mtp-territory-label::before {
          display: none !important;
        }
        .leaflet-tooltip-left.mtp-territory-label::before,
        .leaflet-tooltip-right.mtp-territory-label::before,
        .leaflet-tooltip-top.mtp-territory-label::before,
        .leaflet-tooltip-bottom.mtp-territory-label::before {
          display: none !important;
        }
      `}</style>

      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{
          fontFamily: "Georgia,serif", fontWeight: 900,
          fontSize: "clamp(26px, 3.5vw, 38px)",
          color: "#111", margin: "0 0 10px",
        }}>
          Find Your Town on the Map
        </h2>
        <p style={{
          fontFamily: "sans-serif", fontSize: 16, color: "#555",
          margin: "0 auto 36px", maxWidth: 520, lineHeight: 1.6,
        }}>
          Click your town to see available ad spots and pricing.
        </p>

        {loading && (
          <div style={{ fontFamily: "sans-serif", fontSize: 14, color: "#9ca3af", marginBottom: 32 }}>
            Loading map…
          </div>
        )}

        {!loading && (
          <div
            ref={mapRef}
            style={{
              width: "100%",
              height: "clamp(380px, 55vw, 560px)",
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 6px 32px rgba(0,0,0,0.14)",
              margin: "0 auto",
            }}
          />
        )}

        {!loading && territories.length === 0 && (
          <div style={{ fontFamily: "sans-serif", fontSize: 14, color: "#9ca3af", marginTop: 32 }}>
            No active territories yet — check back soon.
          </div>
        )}

        {!loading && territories.length > 0 && (
          <>
            <p style={{
              fontFamily: "sans-serif", fontSize: 12, fontWeight: 700,
              color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1,
              margin: "36px 0 14px",
            }}>
              Active Territories
            </p>
            <div style={{
              display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center",
            }}>
              {territories.map(t => {
                const isHov = hovered === t.slug;
                return (
                  <a
                    key={t.slug}
                    href={`/${t.slug}#book`}
                    onMouseEnter={() => setHovered(t.slug)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      display: "inline-flex", flexDirection: "column",
                      alignItems: "center", gap: 2,
                      fontFamily: "sans-serif", textDecoration: "none",
                      padding: "12px 22px",
                      background: isHov ? RED : "#fff",
                      borderRadius: 10,
                      border: `1.5px solid ${isHov ? RED : "#e5e7eb"}`,
                      boxShadow: isHov ? `0 4px 14px ${RED}33` : "0 1px 4px rgba(0,0,0,0.06)",
                      transition: "background 0.15s, border-color 0.15s, box-shadow 0.15s",
                      minWidth: 140,
                    }}
                  >
                    <span style={{
                      fontSize: 15, fontWeight: 800,
                      color: isHov ? "#fff" : RED,
                      transition: "color 0.15s",
                    }}>
                      {cleanName(t.name)}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 500,
                      color: isHov ? "rgba(255,255,255,0.75)" : "#9ca3af",
                      transition: "color 0.15s",
                    }}>
                      {t.paidSpots} of {t.totalSpots} spots claimed
                    </span>
                  </a>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
