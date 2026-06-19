import { useState, useEffect, useRef } from "react";

const RED = "#7B1418";
const GOLD = "#C9A84C";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
  "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
  "TX","UT","VT","VA","WA","WV","WI","WY",
];

const CIRCLE_METERS = 5 * 1609.344;

function authToken() {
  return localStorage.getItem("admin_token") || "";
}
function authHeaders() {
  const tok = authToken();
  return tok
    ? { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

// ── Leaflet map ───────────────────────────────────────────────────────────────
function TerritoryMap({ cities, centroid }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || cities.length === 0) return;

    async function initMap() {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const center = centroid ? [centroid.lat, centroid.lng] : [cities[0].lat, cities[0].lng];
      const map = L.map(containerRef.current).setView(center, 10);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      const bounds = [];
      for (const city of cities) {
        L.marker([city.lat, city.lng]).addTo(map).bindPopup(`<strong>${city.name}</strong>`);
        L.circle([city.lat, city.lng], {
          radius: CIRCLE_METERS, color: RED, fillColor: RED,
          fillOpacity: 0.06, weight: 1.5, dashArray: "4 4",
        }).addTo(map);
        bounds.push([city.lat, city.lng], [city.lat + 0.1, city.lng + 0.12], [city.lat - 0.1, city.lng - 0.12]);
      }
      if (centroid) {
        L.circleMarker([centroid.lat, centroid.lng], {
          radius: 5, color: GOLD, fillColor: GOLD, fillOpacity: 0.9, weight: 2,
        }).addTo(map).bindPopup("Combined centroid");
      }
      if (bounds.length > 0) map.fitBounds(bounds, { padding: [24, 24] });
    }

    initMap();
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [cities, centroid]);

  return (
    <div ref={containerRef} style={{
      width: "100%", height: 340, borderRadius: 10,
      border: "1px solid #d1d5db", background: "#f3f4f6", overflow: "hidden",
    }} />
  );
}

// ── CreateTerritoryForm ───────────────────────────────────────────────────────
// Props:
//   onCreated(territory)  — called with the newly-created territory row
//   onCancel()            — optional; called when user clicks Cancel
//   compact               — boolean; reduces padding/heading size for modal use
export default function CreateTerritoryForm({ onCreated, onCancel, compact = false }) {
  const [form, setForm] = useState({ name: "", state: "GA", city1: "", city2: "", city3: "", city4: "" });
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [preview, setPreview]   = useState(null);
  const [creating, setCreating] = useState(false);

  const cities = [form.city1, form.city2, form.city3, form.city4].map(c => c.trim()).filter(Boolean);
  const canPreview = form.name.trim().length > 0 && form.state.length === 2 && cities.length >= 2;
  const canCreate  = preview && !preview.hasConflicts;

  function set(k) {
    return (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setPreview(null); setError(null); };
  }

  async function handlePreview(e) {
    e.preventDefault();
    if (!canPreview) return;
    setLoading(true); setError(null); setPreview(null);
    try {
      const res = await fetch(`${baseUrl}/api/admin/territories/custom`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ name: form.name.trim(), state: form.state, cities, preview: true }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error || `Server returned ${res.status}`); return; }
      setPreview(body);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!canCreate) return;
    setCreating(true); setError(null);
    try {
      const res = await fetch(`${baseUrl}/api/admin/territories/custom`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ name: form.name.trim(), state: form.state, cities, preview: false }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error || `Server returned ${res.status}`); return; }
      onCreated(body);
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  }

  const inp = {
    width: "100%", padding: "8px 11px", borderRadius: 8,
    border: "1.5px solid #d1d5db", fontSize: 14, outline: "none",
    fontFamily: "DM Sans, sans-serif", boxSizing: "border-box", background: "#fff",
  };
  const lbl = { fontSize: 12, color: "#6b7280", fontWeight: 600, display: "flex", flexDirection: "column", gap: 4 };

  return (
    <div style={{ fontFamily: "DM Sans, sans-serif" }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${RED}, #5a0d10)`,
        padding: compact ? "12px 18px" : "16px 22px",
        borderRadius: "10px 10px 0 0",
        marginBottom: 0,
      }}>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: compact ? 15 : 17, fontFamily: "Georgia, serif" }}>
          🗺 Define Territory by Cities
        </div>
        <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 12, marginTop: 2 }}>
          Select 2–4 cities. The territory derives counties, centroid, and ZIP footprint automatically.
        </div>
      </div>

      {/* Form */}
      <div style={{ border: "1.5px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 10px 10px", padding: compact ? 16 : 22 }}>
        <form onSubmit={handlePreview}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12, marginBottom: 14 }}>
            <label style={lbl}>
              Territory Name *
              <input style={inp} value={form.name} onChange={set("name")} placeholder="e.g. Cherokee North" required />
            </label>
            <label style={lbl}>
              State *
              <select style={inp} value={form.state} onChange={set("state")}>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Cities (2 required, up to 4)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {[
              { key: "city1", label: "City 1 *", required: true },
              { key: "city2", label: "City 2 *", required: true },
              { key: "city3", label: "City 3 (optional)", required: false },
              { key: "city4", label: "City 4 (optional)", required: false },
            ].map(({ key, label, required }) => (
              <label key={key} style={lbl}>
                {label}
                <input style={inp} value={form[key]} onChange={set(key)} placeholder={required ? "e.g. Canton" : "optional"} />
              </label>
            ))}
          </div>

          {error && (
            <div style={{
              background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8,
              padding: "10px 14px", fontSize: 13, color: "#991b1b", marginBottom: 12,
            }}>
              ❌ {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="submit"
              disabled={!canPreview || loading}
              style={{
                background: canPreview && !loading ? RED : "#9ca3af",
                color: "#fff", border: "none", borderRadius: 8,
                padding: "9px 22px", fontSize: 13.5, fontWeight: 800,
                cursor: canPreview && !loading ? "pointer" : "not-allowed",
              }}
            >
              {loading ? "Previewing…" : "🔍 Preview Territory"}
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                style={{
                  background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db",
                  borderRadius: 8, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {/* Preview results */}
        {preview && (
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              {[
                { label: "Cities", value: preview.resolvedCities.length, color: "#111" },
                { label: "Counties", value: preview.counties.join(", ") || "—", color: "#374151" },
                { label: "ZIP Codes", value: preview.totalZips.toLocaleString(), color: "#1d4ed8" },
                { label: "Est. Households", value: preview.totalHouseholds.toLocaleString(), color: "#15803d" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 14px", border: "1px solid #e5e7eb" }}>
                  <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Conflict status */}
            {preview.hasConflicts ? (
              <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#991b1b", marginBottom: 8 }}>
                  ⚠️ Conflicts Detected — resolve before creating
                </div>
                {preview.conflicts.map((c, i) => (
                  <div key={i} style={{ fontSize: 13, color: "#991b1b", marginBottom: 4 }}>
                    <strong>{c.source}</strong> conflicts with <strong>{c.territoryName}</strong> ({c.territoryId} · {c.territoryStatus})
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "#15803d" }}>
                ✅ No conflicts — territory is clear to create
              </div>
            )}

            {/* Map */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
                Territory Map — 5-mile mailing radius per city
              </div>
              <TerritoryMap
                cities={preview.resolvedCities}
                centroid={{ lat: preview.centroidLat, lng: preview.centroidLng }}
              />
            </div>

            {/* Create button */}
            {canCreate && (
              <button
                onClick={handleCreate}
                disabled={creating}
                style={{
                  background: creating ? "#9ca3af" : "#15803d",
                  color: "#fff", border: "none", borderRadius: 9,
                  padding: "12px 32px", fontSize: 15, fontWeight: 800,
                  cursor: creating ? "not-allowed" : "pointer",
                  alignSelf: "flex-start",
                }}
              >
                {creating ? "Creating…" : "✓ Create Territory"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
