import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import "leaflet/dist/leaflet.css";

const RED = "#7B1418";

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
    tooltipAnchor: [size / 2 + 1, 0],
  });
}

/**
 * Detects clusters of pins that land within clusterThresholdDeg of each other
 * and spreads each cluster into a radial pattern (deterministic: sorted by cleanName).
 * General-purpose — works for any future territory cluster, not just Cherokee.
 *
 * Each returned pin gains a `_labelDirection` field ("right" | "left") so the
 * tooltip is always rendered away from the cluster centre, keeping labels readable.
 */
function spreadClusteredPins(pins, clusterThresholdDeg = 0.5, spreadRadiusDeg = 0.25) {
  if (pins.length <= 1) return pins;

  const sorted = [...pins].sort((a, b) =>
    cleanName(a.name).localeCompare(cleanName(b.name))
  );

  const visited = new Set();
  const result = sorted.map(p => ({ ...p, _labelDirection: "right" }));

  for (let i = 0; i < sorted.length; i++) {
    if (visited.has(i)) continue;

    const cluster = [i];
    visited.add(i);

    for (let j = i + 1; j < sorted.length; j++) {
      if (visited.has(j)) continue;
      const dlat = Math.abs(sorted[i].latitude - sorted[j].latitude);
      const dlng = Math.abs(sorted[i].longitude - sorted[j].longitude);
      if (dlat < clusterThresholdDeg && dlng < clusterThresholdDeg) {
        cluster.push(j);
        visited.add(j);
      }
    }

    if (cluster.length <= 1) continue;

    const centLat = cluster.reduce((s, k) => s + sorted[k].latitude, 0) / cluster.length;
    const centLng = cluster.reduce((s, k) => s + sorted[k].longitude, 0) / cluster.length;

    cluster.forEach((pinIdx, nth) => {
      const angle = (2 * Math.PI * nth) / cluster.length - Math.PI / 2;
      const newLng = centLng + spreadRadiusDeg * Math.cos(angle);
      result[pinIdx] = {
        ...sorted[pinIdx],
        latitude:        centLat + spreadRadiusDeg * Math.sin(angle),
        longitude:       newLng,
        _labelDirection: newLng < centLng ? "left" : "right",
      };
    });
  }

  return result;
}

export default function GeorgiaTerritoryMap() {
  const [territories, setTerritories] = useState([]);
  const [loading, setLoading] = useState(true);
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

      map = L.map(mapRef.current, {
        minZoom:             6,
        maxZoom:             18,
        maxBounds:           L.latLngBounds(L.latLng(24.0, -95.0), L.latLng(38.0, -73.0)),
        maxBoundsViscosity:  1.0,
        scrollWheelZoom:     true,
        zoomControl:         true,
        attributionControl:  true,
      });

      // CartoDB Positron — clean grayscale, no API key required
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
          subdomains: "abcd",
          maxZoom:    20,
        }
      ).addTo(map);

      // Spread overlapping pins into a readable radial cluster
      const spreadPins = spreadClusteredPins(pinned);

      if (spreadPins.length > 0) {
        // Fit bounds dynamically to actual pin positions — auto-adjusts as territories change
        const latlngs = spreadPins.map(t => [t.latitude, t.longitude]);
        map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 11 });
      } else {
        // Zero-pin fallback: show a wide Georgia-centered view
        map.setView([32.9, -83.4], 7);
      }

      spreadPins.forEach(t => {
        const icon = makeIcon(L, false);
        const marker = L.marker([t.latitude, t.longitude], { icon })
          .addTo(map)
          .on("click", () => navigate(`/${t.slug}#book`));

        const dir = t._labelDirection ?? "right";
        const label = L.tooltip({
          permanent:   true,
          interactive: false,
          direction:   dir,
          offset:      dir === "left" ? [-2, 0] : [2, 0],
          className:   "mtp-territory-label",
        })
          .setContent(cleanName(t.name));

        marker.bindTooltip(label).openTooltip();

        marker.on("mouseover", () => marker.setIcon(makeIcon(L, true)));
        marker.on("mouseout",  () => marker.setIcon(makeIcon(L, false)));
      });
    });

    return () => {
      if (map) map.remove();
    };
  }, [loading, pinned.length]);

  // Sorted list for the dropdown (alphabetical by display name)
  const sortedTerritories = [...territories].sort((a, b) =>
    cleanName(a.name).localeCompare(cleanName(b.name))
  );

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
        .mtp-territory-label::before,
        .leaflet-tooltip-left.mtp-territory-label::before,
        .leaflet-tooltip-right.mtp-territory-label::before,
        .leaflet-tooltip-top.mtp-territory-label::before,
        .leaflet-tooltip-bottom.mtp-territory-label::before {
          display: none !important;
        }
        /* Warm the grayscale tiles toward the site's cream palette */
        .leaflet-tile-pane {
          filter: sepia(12%) saturate(82%) brightness(103%);
        }
        /* Attribution: present and legible, but visually quiet */
        .leaflet-control-attribution {
          font-size: 9px !important;
          color: #aaa !important;
          opacity: 0.6 !important;
          background: transparent !important;
          box-shadow: none !important;
        }
        .leaflet-control-attribution a {
          color: #aaa !important;
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
              height: "clamp(440px, 61vw, 550px)",
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

        {!loading && sortedTerritories.length > 0 && (
          <div style={{
            marginTop: 28,
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 10, flexWrap: "wrap",
          }}>
            <span style={{
              fontFamily: "sans-serif", fontSize: 13, color: "#9ca3af",
            }}>
              Don't see your town on the map?
            </span>
            <select
              defaultValue=""
              onChange={e => {
                if (e.target.value) navigate(`/${e.target.value}`);
              }}
              style={{
                fontFamily: "sans-serif", fontSize: 13, color: "#555",
                border: "1px solid #d1d5db", borderRadius: 6,
                padding: "4px 28px 4px 10px",
                background: "#fff",
                cursor: "pointer",
                appearance: "auto",
                outline: "none",
              }}
            >
              <option value="" disabled>Search all towns ▾</option>
              {sortedTerritories.map(t => (
                <option key={t.slug} value={t.slug}>
                  {cleanName(t.name)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </section>
  );
}
