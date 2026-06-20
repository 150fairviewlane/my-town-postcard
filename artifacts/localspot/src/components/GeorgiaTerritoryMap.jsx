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
  });
}

/**
 * Measure text pixel width using the Canvas 2D API (no DOM insertion needed).
 */
function measureText(text, font = "bold 13px Georgia, serif") {
  if (!measureText._canvas) {
    measureText._canvas = document.createElement("canvas");
  }
  const ctx = measureText._canvas.getContext("2d");
  ctx.font = font;
  return ctx.measureText(text).width;
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function circleHitsRect(cx, cy, r, rect) {
  const nearX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const nearY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy < r * r;
}

/**
 * Given a list of pins (each with .latitude, .longitude, .name, .slug),
 * returns a pixel-space label placement for every pin.
 *
 * Pins are NEVER moved — only label positions are computed.
 *
 * Algorithm:
 *  1. Project every pin to container pixels via map.latLngToContainerPoint.
 *  2. Sort north→south (deterministic, stable across re-renders).
 *  3. For each pin try 8 candidate label offsets in preference order.
 *  4. Pick the first candidate whose bounding box doesn't overlap any
 *     already-placed label rect or any pin dot.
 *  5. If all 8 are blocked, fall back to the preferred offset pushed 24px
 *     further out, and mark useLeader=true so a thin leader line is drawn.
 *
 * Returns an array of { pin, px, py, labelX, labelY, tw, th, useLeader }.
 */
function computeLabelPlacements(pins, map) {
  const DOT_R   = 10;  // collision radius — slightly larger than visual dot
  const GAP     = 4;   // gap between dot edge and label start
  const LABEL_H = 18;
  const FONT    = "bold 13px Georgia, serif";

  const projected = pins.map(pin => {
    const pt = map.latLngToContainerPoint([pin.latitude, pin.longitude]);
    const label = cleanName(pin.name);
    const tw = Math.ceil(measureText(label, FONT)) + 4;
    return { pin, label, px: pt.x, py: pt.y, tw, th: LABEL_H };
  });

  // Deterministic order: north-to-south (descending latitude)
  const sorted = [...projected].sort((a, b) => b.pin.latitude - a.pin.latitude);

  // Candidate offsets [dx, dy] relative to pin centre.
  // dx/dy position the TOP-LEFT corner of the label rect.
  function candidates(tw, th) {
    const r = DOT_R + GAP;
    return [
      { dx: r,          dy: -th / 2 },               // right-center ★
      { dx: -r - tw,    dy: -th / 2 },                // left-center
      { dx: -tw / 2,    dy: -(DOT_R + GAP + th) },    // top-center
      { dx: -tw / 2,    dy: DOT_R + GAP },             // bottom-center
      { dx: r,          dy: -(DOT_R + GAP + th) },     // upper-right
      { dx: r,          dy: DOT_R + GAP },             // lower-right
      { dx: -r - tw,    dy: -(DOT_R + GAP + th) },    // upper-left
      { dx: -r - tw,    dy: DOT_R + GAP },             // lower-left
    ];
  }

  const placed = [];   // committed label rects { x, y, w, h }
  const result = [];

  for (const item of sorted) {
    const { px, py, tw, th } = item;
    const cands = candidates(tw, th);
    let chosen = null;

    for (const { dx, dy } of cands) {
      const lx = px + dx;
      const ly = py + dy;
      const rect = { x: lx, y: ly, w: tw, h: th };

      const blocked =
        placed.some(p => rectsOverlap(rect, p)) ||
        projected.some(other =>
          (other !== item) && circleHitsRect(other.px, other.py, DOT_R, rect)
        );

      if (!blocked) {
        chosen = { lx, ly, useLeader: false };
        break;
      }
    }

    if (!chosen) {
      // Fallback: push preferred direction out 24px extra, draw a leader line
      const { dx, dy } = cands[0];
      const PUSH = 24;
      const sign = dx >= 0 ? 1 : -1;
      chosen = { lx: px + dx + sign * PUSH, ly: py + dy, useLeader: true };
    }

    placed.push({ x: chosen.lx, y: chosen.ly, w: tw, h: th });
    result.push({ ...item, labelX: chosen.lx, labelY: chosen.ly, useLeader: chosen.useLeader });
  }

  return result;
}

export default function GeorgiaTerritoryMap() {
  const [territories, setTerritories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, navigate] = useLocation();
  const mapRef    = useRef(null);
  const mapObjRef = useRef(null);   // holds the live Leaflet map instance
  const svgRef    = useRef(null);   // holds the SVG label overlay element

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

      mapObjRef.current = map;

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

      if (pinned.length > 0) {
        const latlngs = pinned.map(t => [t.latitude, t.longitude]);
        map.fitBounds(L.latLngBounds(latlngs), { padding: [10, 10] });
        map.setZoom(map.getZoom() + 1);
      } else {
        map.setView([32.9, -83.4], 7);
      }

      // ── SVG label overlay (sits above the tile pane, pointer-events: none) ──
      const mapContainer = mapRef.current;
      const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svgEl.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:650;";
      mapContainer.appendChild(svgEl);
      svgRef.current = svgEl;

      // ── Place dots (no tooltips — labels handled by SVG overlay) ──
      pinned.forEach(t => {
        const icon = makeIcon(L, false);
        const marker = L.marker([t.latitude, t.longitude], { icon })
          .addTo(map)
          .on("click", () => navigate(`/${t.slug}#book`));

        marker.on("mouseover", () => marker.setIcon(makeIcon(L, true)));
        marker.on("mouseout",  () => marker.setIcon(makeIcon(L, false)));
      });

      // ── Label placement function (runs on every move/zoom) ──
      function updateLabels() {
        const svg = svgRef.current;
        if (!svg || !map) return;

        // Clear previous labels
        while (svg.firstChild) svg.removeChild(svg.firstChild);

        const placements = computeLabelPlacements(pinned, map);

        for (const { px, py, labelX, labelY, tw, th, label, useLeader } of placements) {
          // Leader line (fallback only)
          if (useLeader) {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            // Connect from dot edge to near label
            const lCenterY = labelY + th / 2;
            line.setAttribute("x1", String(px));
            line.setAttribute("y1", String(lCenterY));
            line.setAttribute("x2", String(labelX < px ? labelX + tw : labelX));
            line.setAttribute("y2", String(lCenterY));
            line.setAttribute("stroke", "#aaa");
            line.setAttribute("stroke-width", "1");
            svg.appendChild(line);
          }

          // White halo text (paint-order trick — single element, no double render)
          const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
          text.setAttribute("x", String(labelX));
          text.setAttribute("y", String(labelY + th * 0.78));  // baseline
          text.setAttribute("font-family", "Georgia, serif");
          text.setAttribute("font-size", "13");
          text.setAttribute("font-weight", "bold");
          text.setAttribute("fill", "#111");
          text.setAttribute("stroke", "#fff");
          text.setAttribute("stroke-width", "3");
          text.setAttribute("stroke-linejoin", "round");
          text.setAttribute("paint-order", "stroke");
          text.textContent = label;
          svg.appendChild(text);
        }
      }

      map.on("moveend zoomend", updateLabels);

      // Run once after tiles settle so latLngToContainerPoint is reliable
      map.whenReady(() => {
        // Small delay so the map has finished its initial layout
        setTimeout(updateLabels, 120);
      });
    });

    return () => {
      if (map) {
        map.off("moveend zoomend");
        map.remove();
      }
      mapObjRef.current = null;
      svgRef.current = null;
    };
  }, [loading, pinned.length]);

  // Sorted list for the dropdown (alphabetical by display name)
  const sortedTerritories = [...territories].sort((a, b) =>
    cleanName(a.name).localeCompare(cleanName(b.name))
  );

  return (
    <section style={{ background: "#f8f5f0", padding: "80px 24px 72px", textAlign: "center" }}>
      <style>{`
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
              position:     "relative",
              width:        "100%",
              height:       "clamp(440px, 61vw, 550px)",
              borderRadius: 14,
              overflow:     "hidden",
              boxShadow:    "0 6px 32px rgba(0,0,0,0.14)",
              margin:       "0 auto",
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
