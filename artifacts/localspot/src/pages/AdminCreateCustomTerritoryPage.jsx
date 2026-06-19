import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";

const RED = "#7B1418";
const GOLD = "#C9A84C";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
  "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
  "TX","UT","VT","VA","WA","WV","WI","WY",
];

const MILES_15_METERS = 5 * 1609.344;

function authToken() {
  return localStorage.getItem("admin_token") || "";
}

function authHeaders() {
  const tok = authToken();
  return tok ? { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

// ── Leaflet map (dynamically loaded to avoid SSR issues) ──────────────────────
function TerritoryMap({ cities, centroid }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (cities.length === 0) return;

    let L;
    let map;

    async function initMap() {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const center = centroid
        ? [centroid.lat, centroid.lng]
        : [cities[0].lat, cities[0].lng];

      map = L.map(containerRef.current).setView(center, 10);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      const bounds = [];

      for (const city of cities) {
        const marker = L.marker([city.lat, city.lng]).addTo(map);
        marker.bindPopup(`<strong>${city.name}</strong>`);

        const circle = L.circle([city.lat, city.lng], {
          radius: MILES_15_METERS,
          color: RED,
          fillColor: RED,
          fillOpacity: 0.06,
          weight: 1.5,
          dashArray: "4 4",
        }).addTo(map);

        bounds.push([city.lat, city.lng]);
        const ne = [city.lat + 0.22, city.lng + 0.28];
        const sw = [city.lat - 0.22, city.lng - 0.28];
        bounds.push(ne, sw);
      }

      if (centroid) {
        L.circleMarker([centroid.lat, centroid.lng], {
          radius: 5, color: GOLD, fillColor: GOLD, fillOpacity: 0.9, weight: 2,
        }).addTo(map).bindPopup("Combined centroid");
      }

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [24, 24] });
      }
    }

    initMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [cities, centroid]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 420,
        borderRadius: 10,
        border: "1px solid #d1d5db",
        background: "#f3f4f6",
        overflow: "hidden",
      }}
    />
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminCreateCustomTerritoryPage() {
  const [form, setForm] = useState({
    name: "",
    state: "GA",
    city1: "",
    city2: "",
    city3: "",
    city4: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);

  const cities = [form.city1, form.city2, form.city3, form.city4]
    .map(c => c.trim())
    .filter(Boolean);

  const canPreview = form.name.trim().length > 0 && form.state.length === 2 && cities.length >= 2;
  const canCreate  = preview && !preview.hasConflicts && !created;

  function set(k) {
    return (e) => {
      setForm(f => ({ ...f, [k]: e.target.value }));
      setPreview(null);
      setCreated(null);
      setError(null);
    };
  }

  async function handlePreview(e) {
    e.preventDefault();
    if (!canPreview) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setCreated(null);
    try {
      const res = await fetch(`${baseUrl}/api/admin/territories/custom`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: form.name.trim(),
          state: form.state,
          cities,
          preview: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || `Server returned ${res.status}`);
        return;
      }
      setPreview(body);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!canCreate) return;
    if (!confirm(`Create territory "${form.name.trim()}" with ${cities.length} cities? This will be immediately visible to dealers.`)) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/api/admin/territories/custom`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: form.name.trim(),
          state: form.state,
          cities,
          preview: false,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || `Server returned ${res.status}`);
        return;
      }
      setCreated(body);
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  }

  const inp = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 8,
    border: "1.5px solid #d1d5db",
    fontSize: 14,
    outline: "none",
    fontFamily: "DM Sans, sans-serif",
    boxSizing: "border-box",
    background: "#fff",
  };

  const labelStyle = {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: 600,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8f5f0", fontFamily: "DM Sans, sans-serif" }}>
      {/* Header */}
      <div style={{
        background: "#fff",
        borderBottom: "2px solid #e5e7eb",
        padding: "14px 28px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}>
        <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <span style={{ fontSize: 22 }}>📮</span>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#111", fontFamily: "Georgia, serif" }}>Custom Territory</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>Admin · Create city-based territory</div>
          </div>
        </Link>
        <a
          href={`${baseUrl}/admin`}
          style={{
            marginLeft: "auto",
            fontSize: 13, fontWeight: 700, color: "#374151",
            background: "#fff", border: "1px solid #d1d5db",
            borderRadius: 8, padding: "7px 12px", textDecoration: "none",
          }}
        >
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
              <strong>{form.name.trim()}</strong> is now live with status <strong>available</strong>.
              {" "}ZIP footprint ({created.totalZips} ZIPs) has been stored.
            </div>
          </div>
        )}

        {/* Form card */}
        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: 28 }}>
          <div style={{
            background: `linear-gradient(135deg, ${RED}, #5a0d10)`,
            padding: "18px 24px",
          }}>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: 18, fontFamily: "Georgia, serif" }}>
              🗺 Define Territory by Cities
            </div>
            <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, marginTop: 2 }}>
              Select 2–4 cities (any counties). The territory derives counties, centroid, and ZIP footprint automatically.
            </div>
          </div>

          <form onSubmit={handlePreview} style={{ padding: "24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 14, marginBottom: 18 }}>
              <label style={labelStyle}>
                Territory Name *
                <input
                  style={inp}
                  value={form.name}
                  onChange={set("name")}
                  placeholder="e.g. Cherokee / Fulton North"
                  required
                />
              </label>
              <label style={labelStyle}>
                State *
                <select style={inp} value={form.state} onChange={set("state")}>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>

            <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Cities (2 required, up to 4)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              {[
                { key: "city1", label: "City 1 *", required: true },
                { key: "city2", label: "City 2 *", required: true },
                { key: "city3", label: "City 3 (optional)", required: false },
                { key: "city4", label: "City 4 (optional)", required: false },
              ].map(({ key, label, required }) => (
                <label key={key} style={labelStyle}>
                  {label}
                  <input
                    style={inp}
                    value={form[key]}
                    onChange={set(key)}
                    placeholder={required ? "e.g. Canton" : "optional"}
                  />
                </label>
              ))}
            </div>

            {error && (
              <div style={{
                background: "#fef2f2", border: "1px solid #fca5a5",
                borderRadius: 9, padding: "12px 16px",
                fontSize: 13, color: "#991b1b", marginBottom: 16,
              }}>
                ❌ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canPreview || loading}
              style={{
                background: canPreview && !loading ? RED : "#9ca3af",
                color: "#fff", border: "none", borderRadius: 9,
                padding: "11px 28px", fontSize: 14, fontWeight: 800,
                cursor: canPreview && !loading ? "pointer" : "not-allowed",
                transition: "background 0.15s",
              }}
            >
              {loading ? "Previewing…" : "🔍 Preview Territory"}
            </button>
          </form>
        </div>

        {/* Preview results */}
        {preview && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
              {[
                { label: "Resolved Cities",   value: preview.resolvedCities.length, color: "#111" },
                { label: "Counties",          value: preview.counties.join(", ") || "—", color: "#374151" },
                { label: "ZIP Codes",         value: preview.totalZips.toLocaleString(), color: "#1d4ed8" },
                { label: "Est. Households",   value: preview.totalHouseholds.toLocaleString(), color: "#15803d" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "#fff", borderRadius: 10, padding: "16px 18px", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
                  <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color, lineHeight: 1.2 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Centroid */}
            <div style={{ background: "#fff", borderRadius: 10, padding: "12px 18px", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", fontSize: 13, color: "#374151" }}>
              <span style={{ fontWeight: 700 }}>Centroid:</span>{" "}
              {preview.centroidLat.toFixed(5)}, {preview.centroidLng.toFixed(5)}
            </div>

            {/* Conflict panel */}
            {preview.hasConflicts ? (
              <div style={{
                background: "#fef2f2", border: "1.5px solid #fca5a5",
                borderRadius: 12, padding: "18px 20px",
              }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#991b1b", marginBottom: 10 }}>
                  ⚠️ Conflicts Detected — cannot create until resolved
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {preview.conflicts.map((c, i) => (
                    <div key={i} style={{
                      background: "#fff", borderRadius: 8,
                      padding: "10px 14px", border: "1px solid #fecaca",
                      fontSize: 13,
                    }}>
                      <span style={{ fontWeight: 700, color: "#991b1b" }}>{c.source}</span>
                      {" "}conflicts with{" "}
                      <span style={{ fontWeight: 800 }}>{c.territoryName}</span>
                      {" "}(<span style={{ fontFamily: "monospace", fontSize: 12 }}>{c.territoryId}</span>
                      {" "}· {c.territoryStatus})
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{
                background: "#f0fdf4", border: "1.5px solid #86efac",
                borderRadius: 10, padding: "12px 18px",
                fontSize: 13, fontWeight: 700, color: "#15803d",
              }}>
                ✅ No conflicts detected — territory is clear to create
              </div>
            )}

            {/* Leaflet map */}
            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111", marginBottom: 12 }}>
                Territory Map — dashed circles show 5-mile mailing radius per city
              </div>
              <TerritoryMap
                cities={preview.resolvedCities}
                centroid={{ lat: preview.centroidLat, lng: preview.centroidLng }}
              />
            </div>

            {/* City details */}
            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6", fontWeight: 700, fontSize: 14, color: "#111" }}>
                Resolved Cities
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {["City", "Lat", "Lng"].map(h => (
                      <th key={h} style={{ padding: "8px 16px", textAlign: "left", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.resolvedCities.map((c, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "10px 16px", fontWeight: 700, fontSize: 13 }}>{c.name}</td>
                      <td style={{ padding: "10px 16px", fontSize: 12, fontFamily: "monospace", color: "#6b7280" }}>{c.lat.toFixed(5)}</td>
                      <td style={{ padding: "10px 16px", fontSize: 12, fontFamily: "monospace", color: "#6b7280" }}>{c.lng.toFixed(5)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Create button */}
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button
                onClick={handleCreate}
                disabled={!canCreate || creating}
                style={{
                  background: canCreate && !creating ? "#15803d" : "#9ca3af",
                  color: "#fff", border: "none", borderRadius: 9,
                  padding: "13px 36px", fontSize: 15, fontWeight: 800,
                  cursor: canCreate && !creating ? "pointer" : "not-allowed",
                  transition: "background 0.15s",
                }}
              >
                {creating ? "Creating…" : "✓ Create Territory"}
              </button>
              {preview.hasConflicts && (
                <span style={{ fontSize: 13, color: "#991b1b", fontWeight: 600 }}>
                  Resolve conflicts before creating
                </span>
              )}
              {created && (
                <span style={{ fontSize: 13, color: "#15803d", fontWeight: 700 }}>
                  ✅ Territory {created.territoryId} created!
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
