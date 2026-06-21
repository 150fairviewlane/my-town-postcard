import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";

const DEFAULT_PROMPT =
  "Transform this advertisement into a polished, professional print-ready design. Create a compelling direct-mail postcard ad with strong visual hierarchy, excellent composition, professional photography aesthetic, vivid colors, and a layout that immediately grabs attention and communicates the offer clearly. The image, style, design, layout, fonts,, etc. can be changed, but all data must remain on the new ad. Fonts for the company name and tagline should be oversized. Phone number and address should be easily visible.";

const ACTIVE_MODELS = [
  {
    id: "gpt4o-enhanced",
    label: "GPT-4o → gpt-image-1",
    desc: "GPT-4o reads your ad, writes an enhanced prompt, then gpt-image-1 generates the result",
    badge: "#1d4ed8", badgeBg: "#eff6ff",
  },
  {
    id: "claude-enhanced",
    label: "Claude → gpt-image-1",
    desc: "Claude reads your ad, writes an enhanced prompt, then gpt-image-1 generates the result",
    badge: "#7c3aed", badgeBg: "#f5f3ff",
  },
  {
    id: "gpt-image-edit",
    label: "gpt-image-1 (direct edit)",
    desc: "Your image is sent directly to gpt-image-1's edit endpoint — no vision bridge or prompt enhancement",
    badge: "#065f46", badgeBg: "#ecfdf5",
  },
  {
    id: "grok-image-edit",
    label: "Grok (direct edit)",
    desc: "Your image is sent directly to Grok's image-edit API — no prompt enhancement step",
    badge: "#92400e", badgeBg: "#fffbeb",
  },
];

const COMING_SOON = [
  { label: "Stability AI",  reason: "API key not configured" },
  { label: "Ideogram",      reason: "API key not configured" },
  { label: "Midjourney",    reason: "No public API available" },
];

const CARD = { background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: 20 };
const HDR_BTN = { fontSize: 13, fontWeight: 700, color: "#374151", background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, padding: "7px 12px", textDecoration: "none", cursor: "pointer" };

function fmtTime(ms) {
  return ms >= 60000 ? `${(ms / 60000).toFixed(1)}m` : `${(ms / 1000).toFixed(1)}s`;
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Full-screen lightbox
function Lightbox({ ad, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700, width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#fff" }}>{ad.label}</div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>{fmtDate(ad.createdAt)}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={ad.imageData}
              download={`ai-ad-${ad.model}-${ad.id}.png`}
              style={{ padding: "8px 14px", borderRadius: 8, background: "#fff", color: "#111", fontSize: 13, fontWeight: 700, textDecoration: "none" }}
            >
              ↓ Download
            </a>
            <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 8, background: "transparent", color: "#fff", fontSize: 18, border: "1px solid #4b5563", cursor: "pointer" }}>
              ✕
            </button>
          </div>
        </div>

        {/* Image */}
        <img
          src={ad.imageData}
          alt={ad.label}
          style={{ width: "100%", borderRadius: 10, display: "block", maxHeight: "72vh", objectFit: "contain" }}
        />

        {/* Prompt */}
        <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#d1d5db", lineHeight: 1.6 }}>
          <span style={{ fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", fontSize: 10, letterSpacing: .5 }}>Prompt · </span>
          {ad.prompt}
        </div>
      </div>
    </div>
  );
}

// Single result card (used in both fresh-results and repository sections)
function AdCard({ r, onDelete, showDeleteBtn }) {
  return (
    <div style={{ ...CARD, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: "#111", marginBottom: 2 }}>{r.label}</div>
        <div style={{ fontSize: 11, color: "#9ca3af", display: "flex", gap: 8 }}>
          {r.timeTaken != null && <span>{fmtTime(r.timeTaken)}</span>}
          {r.createdAt && <span>{fmtDate(r.createdAt)}</span>}
          {r.error  && <span style={{ color: "#991b1b" }}>· failed</span>}
          {!r.error && <span style={{ color: "#15803d" }}>· ✓ saved</span>}
        </div>
      </div>

      {r.error ? (
        <div style={{ padding: 16, background: "#fef2f2", flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 12, color: "#991b1b", lineHeight: 1.5 }}>{r.error}</div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <img
            src={r.imageData ?? r.imageUrl}
            alt={r.label}
            style={{ width: "100%", display: "block", cursor: "zoom-in" }}
          />
          <div style={{ padding: "8px 10px", display: "flex", gap: 6 }}>
            <a
              href={r.imageData ?? r.imageUrl}
              download={`ai-ad-${r.model}-${r.id ?? "new"}.png`}
              style={{ flex: 1, textAlign: "center", padding: "6px", borderRadius: 7, background: "#f3f4f6", color: "#374151", fontSize: 12, fontWeight: 700, textDecoration: "none", border: "1px solid #e5e7eb" }}
            >
              ↓ Download
            </a>
            {showDeleteBtn && onDelete && (
              <button
                onClick={() => onDelete(r.id)}
                style={{ padding: "6px 10px", borderRadius: 7, background: "#fef2f2", color: "#991b1b", fontSize: 12, fontWeight: 700, border: "1px solid #fca5a5", cursor: "pointer" }}
                title="Delete from repository"
              >
                🗑
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminAITestPage() {
  const [, navigate] = useLocation();
  const [token, setToken]             = useState(null);
  const [imageData, setImageData]     = useState(null);
  const [imageName, setImageName]     = useState("");
  const [prompt, setPrompt]           = useState(DEFAULT_PROMPT);
  const [selected, setSelected]       = useState(["gpt4o-enhanced", "claude-enhanced", "gpt-image-edit", "grok-image-edit"]);
  const [running, setRunning]         = useState(false);
  const [results, setResults]         = useState([]);
  const [globalError, setGlobalError] = useState(null);
  const [dragOver, setDragOver]       = useState(false);
  const [repo, setRepo]               = useState([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [lightbox, setLightbox]       = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    const t = localStorage.getItem("admin_token");
    if (!t) { navigate("/admin"); return; }
    setToken(t);
  }, []);

  const fetchRepo = useCallback(async (t) => {
    if (!t) return;
    setRepoLoading(true);
    try {
      const res = await fetch("/api/admin/generated-ads", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        // Attach a stable image URL (served as raw bytes) so <img> can load lazily
        const ads = (data.ads ?? []).map((ad) => ({
          ...ad,
          imageUrl: `/api/admin/generated-ads/${ad.id}/image`,
        }));
        setRepo(ads);
      }
    } catch {
      // silently ignore — repository section just stays empty
    } finally {
      setRepoLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) fetchRepo(token);
  }, [token, fetchRepo]);

  const loadFile = (file) => {
    if (!file || !file.type.startsWith("image/")) { alert("Please select an image file."); return; }
    const reader = new FileReader();
    reader.onload = (e) => { setImageData(e.target.result); setImageName(file.name); setResults([]); };
    reader.readAsDataURL(file);
  };

  const toggleModel = (id) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);

  const handleRun = async () => {
    if (!imageData) { alert("Please upload an ad image first."); return; }
    if (selected.length === 0) { alert("Please select at least one model."); return; }

    setRunning(true);
    setResults([]);
    setGlobalError(null);

    try {
      const res = await fetch("/api/admin/ai-model-test", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageData, prompt, models: selected }),
      });
      const data = await res.json();
      if (!res.ok) { setGlobalError(data.error || "Request failed"); return; }
      // Normalize result shape to match repo shape (imageData vs imageUrl)
      const normalized = (data.results ?? []).map((r) => ({
        ...r,
        imageData: r.imageUrl,
        createdAt: new Date().toISOString(),
      }));
      setResults(normalized);
      // Refresh repository to include newly saved items
      fetchRepo(token);
    } catch (e) {
      setGlobalError(e.message || "Network error");
    } finally {
      setRunning(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Remove this ad from the repository?")) return;
    try {
      await fetch(`/api/admin/generated-ads/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setRepo((prev) => prev.filter((a) => a.id !== id));
    } catch {
      alert("Failed to delete");
    }
  };

  if (!token) return null;

  const successResults = results.filter((r) => !r.error);
  const repoToShow = repo.filter((a) => !successResults.find((r) => r.id === a.id));

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif" }}>

      {/* Lightbox */}
      {lightbox && <Lightbox ad={lightbox} onClose={() => setLightbox(null)} />}

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 28px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <button onClick={() => navigate("/admin")} style={HDR_BTN}>← Admin</button>
        <div>
          <div style={{ fontWeight: 900, fontSize: 20, color: "#111", fontFamily: "Georgia,serif" }}>🧪 AI Model Testing</div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>Upload an ad · enter a prompt · compare model outputs side-by-side</div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, alignItems: "start" }}>

          {/* ── LEFT PANEL — controls ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Image upload */}
            <div style={CARD}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#111", marginBottom: 12 }}>1. Upload Ad Image</div>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); loadFile(e.dataTransfer.files[0]); }}
                style={{
                  border: `2px dashed ${dragOver ? "#991b1b" : "#d1d5db"}`,
                  borderRadius: 10, padding: imageData ? 8 : 28,
                  textAlign: "center", cursor: "pointer", background: dragOver ? "#fef2f2" : "#f9fafb",
                  transition: "all .2s",
                }}
              >
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => loadFile(e.target.files[0])} />
                {imageData ? (
                  <div>
                    <img src={imageData} alt="uploaded" style={{ width: "100%", borderRadius: 7, display: "block", maxHeight: 200, objectFit: "contain" }} />
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>{imageName} · click to change</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>Drop ad image here</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>or click to browse</div>
                  </div>
                )}
              </div>
            </div>

            {/* Prompt */}
            <div style={CARD}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#111", marginBottom: 8 }}>2. Prompt</div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 13, fontFamily: "sans-serif", resize: "vertical", outline: "none", boxSizing: "border-box", color: "#111", lineHeight: 1.5 }}
              />
              <button
                onClick={() => setPrompt(DEFAULT_PROMPT)}
                style={{ fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: "4px 0", textDecoration: "underline" }}
              >
                Reset to default
              </button>
            </div>

            {/* Model selection */}
            <div style={CARD}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#111", marginBottom: 12 }}>3. Select Models</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {ACTIVE_MODELS.map((m) => (
                  <label key={m.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                    <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggleModel(m.id)}
                      style={{ marginTop: 2, accentColor: "#991b1b", flexShrink: 0, width: 15, height: 15 }} />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: "#111" }}>{m.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: m.badge, background: m.badgeBg, borderRadius: 999, padding: "1px 7px", letterSpacing: .3 }}>READY</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>{m.desc}</div>
                    </div>
                  </label>
                ))}

                <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 10, marginTop: 2 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: .5, textTransform: "uppercase", marginBottom: 8 }}>Coming Soon</div>
                  {COMING_SOON.map((m) => (
                    <label key={m.label} style={{ display: "flex", gap: 10, alignItems: "flex-start", opacity: .45, marginBottom: 8 }}>
                      <input type="checkbox" disabled style={{ marginTop: 2, flexShrink: 0, width: 15, height: 15 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>{m.label}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>{m.reason}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Run button */}
            <button
              onClick={handleRun}
              disabled={running || !imageData || selected.length === 0}
              style={{
                width: "100%", padding: "14px", borderRadius: 10, border: "none",
                background: running ? "#9ca3af" : "#991b1b", color: "#fff",
                fontSize: 15, fontWeight: 800, cursor: running ? "not-allowed" : "pointer",
                letterSpacing: .3, transition: "background .2s",
              }}
            >
              {running
                ? `Running ${selected.length} model${selected.length > 1 ? "s" : ""} in parallel…`
                : `▶ Run ${selected.length} Model${selected.length !== 1 ? "s" : ""}`}
            </button>
            {running && (
              <div style={{ fontSize: 12, color: "#6b7280", textAlign: "center", lineHeight: 1.6 }}>
                All models run in parallel · ~60 seconds<br />
                Results are automatically saved to the repository.
              </div>
            )}
            {globalError && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#991b1b" }}>
                {globalError}
              </div>
            )}
          </div>

          {/* ── RIGHT PANEL — latest results ── */}
          <div>
            {results.length === 0 && !running && (
              <div style={{ ...CARD, textAlign: "center", padding: 48, color: "#9ca3af" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Results appear here</div>
                <div style={{ fontSize: 13 }}>Upload an ad, choose your models, and hit Run.</div>
              </div>
            )}

            {running && (
              <div style={{ ...CARD, textAlign: "center", padding: 56 }}>
                <div style={{ width: 40, height: 40, border: "4px solid #e5e7eb", borderTopColor: "#991b1b", borderRadius: "50%", animation: "lsspin .8s linear infinite", margin: "0 auto 16px" }} />
                <div style={{ fontWeight: 700, fontSize: 15, color: "#374151", marginBottom: 4 }}>Generating…</div>
                <div style={{ fontSize: 13, color: "#9ca3af" }}>Running {selected.length} model{selected.length > 1 ? "s" : ""} in parallel</div>
                <style>{`@keyframes lsspin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {results.length > 0 && (
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: "#111", marginBottom: 14 }}>
                  Latest Run — {results.length} model{results.length !== 1 ? "s" : ""}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(results.length, 3)}, 1fr)`, gap: 14 }}>
                  {results.map((r, i) => (
                    <div key={i} onClick={() => !r.error && setLightbox(r)} style={{ cursor: r.error ? "default" : "zoom-in" }}>
                      <AdCard r={r} onDelete={handleDelete} showDeleteBtn={!!r.id} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── REPOSITORY SECTION ── */}
        <div style={{ marginTop: 40 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18, color: "#111" }}>🗂 Ad Repository</div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 2 }}>
                Every generated image is saved here and survives restarts. Click any thumbnail to view full-size.
              </div>
            </div>
            {repo.length > 0 && (
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                {repo.length} image{repo.length !== 1 ? "s" : ""} saved
              </div>
            )}
          </div>

          {repoLoading && (
            <div style={{ textAlign: "center", padding: 32, color: "#9ca3af", fontSize: 14 }}>
              Loading repository…
            </div>
          )}

          {!repoLoading && repo.length === 0 && (
            <div style={{ ...CARD, textAlign: "center", padding: 36, color: "#9ca3af" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🗄️</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>No saved ads yet</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Run your first test above — results are saved here automatically.</div>
            </div>
          )}

          {!repoLoading && repo.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
              {repo.map((ad) => (
                <div key={ad.id} onClick={() => setLightbox(ad)} style={{ cursor: "zoom-in" }}>
                  <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
                    <img
                      src={ad.imageUrl}
                      alt={ad.label}
                      style={{ width: "100%", display: "block", aspectRatio: "2/3", objectFit: "cover" }}
                    />
                    <div style={{ padding: "8px 10px" }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: "#111", marginBottom: 2 }}>{ad.label}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>{fmtDate(ad.createdAt)}</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <a
                          href={ad.imageUrl}
                          download={`ai-ad-${ad.model}-${ad.id}.png`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ flex: 1, textAlign: "center", padding: "5px", borderRadius: 6, background: "#f3f4f6", color: "#374151", fontSize: 11, fontWeight: 700, textDecoration: "none", border: "1px solid #e5e7eb" }}
                        >
                          ↓ Download
                        </a>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(ad.id); }}
                          style={{ padding: "5px 8px", borderRadius: 6, background: "#fef2f2", color: "#991b1b", fontSize: 11, fontWeight: 700, border: "1px solid #fca5a5", cursor: "pointer" }}
                          title="Delete"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
