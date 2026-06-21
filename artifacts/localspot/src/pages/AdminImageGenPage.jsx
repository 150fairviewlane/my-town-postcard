import { useState, useRef } from "react";
import AdminShell from "../components/AdminShell";

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

function getToken() {
  return localStorage.getItem("admin_token") ?? "";
}

const inp = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1.5px solid #d1d5db", fontSize: 14,
  fontFamily: "sans-serif", boxSizing: "border-box", outline: "none",
};

async function callImageGen(prompt, imageFile) {
  const form = new FormData();
  form.append("prompt", prompt.trim());
  if (imageFile) form.append("image", imageFile);
  const res = await fetch(`${BASE}/api/admin/image-gen`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data.imageUrl;
}


function Spinner({ label }) {
  return (
    <div style={{ textAlign: "center", padding: "36px 0" }}>
      <div style={{
        width: 40, height: 40, border: "3px solid #e5e7eb",
        borderTopColor: "#7B1418", borderRadius: "50%",
        animation: "spin 0.8s linear infinite", margin: "0 auto 12px",
      }} />
      <div style={{ fontSize: 13, color: "#6b7280" }}>{label}</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ marginTop: 14, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b", fontSize: 13 }}>
      {msg}
    </div>
  );
}

export default function AdminImageGenPage() {
  // ── initial generation state ──────────────────────────────────────────────
  const [prompt, setPrompt] = useState("");
  const [imageSrc, setImageSrc] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  // ── result + alter state ──────────────────────────────────────────────────
  const [result, setResult] = useState(null);          // current displayed image URL
  const [history, setHistory] = useState([]);           // [{url, label}] — all prior versions
  const [alterPrompt, setAlterPrompt] = useState("");
  const [alterLoading, setAlterLoading] = useState(false);
  const [alterError, setAlterError] = useState("");

  // ── file helpers ──────────────────────────────────────────────────────────
  function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImageSrc(e.target.result);
    reader.readAsDataURL(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  // ── initial generate ──────────────────────────────────────────────────────
  async function generate() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setHistory([]);
    setAlterPrompt("");
    setAlterError("");
    try {
      const url = await callImageGen(prompt, imageFile);
      setResult(url);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // ── alter (iterative edit) ────────────────────────────────────────────────
  async function alter() {
    if (!alterPrompt.trim() || !result) return;
    setAlterLoading(true);
    setAlterError("");
    try {
      // Pass the current image URL as a field — the server fetches it to avoid browser CORS
      const form = new FormData();
      form.append("prompt", alterPrompt.trim());
      form.append("imageUrl", result);
      const res = await fetch(`${BASE}/api/admin/image-gen`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      const url = data.imageUrl;
      // push old result into history
      setHistory(h => [...h, { url: result, label: alterPrompt.trim() }]);
      setResult(url);
      setAlterPrompt("");
    } catch (err) {
      setAlterError(err.message || "Something went wrong");
    } finally {
      setAlterLoading(false);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <AdminShell>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* ── Generation form ─────────────────────────────────────────────── */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 32, boxShadow: "0 2px 12px rgba(0,0,0,0.07)", marginBottom: 24 }}>

          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe the image you want Grok to generate…"
            rows={4}
            style={{ ...inp, resize: "vertical", lineHeight: 1.6 }}
          />

          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 20, marginBottom: 6 }}>
            Reference Image <span style={{ color: "#9ca3af", fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
          </label>

          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragging ? "#7B1418" : "#d1d5db"}`,
              borderRadius: 10, padding: 20, cursor: "pointer", textAlign: "center",
              background: dragging ? "#fef2f2" : "#fafafa",
              transition: "all 0.15s",
            }}
          >
            {imageSrc ? (
              <div style={{ position: "relative", display: "inline-block" }}>
                <img src={imageSrc} alt="reference" style={{ maxHeight: 180, maxWidth: "100%", borderRadius: 8, display: "block" }} />
                <button
                  onClick={e => { e.stopPropagation(); setImageSrc(null); setImageFile(null); }}
                  style={{ position: "absolute", top: -10, right: -10, background: "#374151", color: "#fff", border: "none", borderRadius: "50%", width: 24, height: 24, cursor: "pointer", fontSize: 13, fontWeight: 700, lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 6 }}>📎</div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>Drag & drop or click to upload a reference image</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>PNG, JPG, WebP — max 20 MB</div>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files?.[0])} />

          <ErrorBox msg={error} />

          <button
            onClick={generate}
            disabled={loading || !prompt.trim()}
            style={{
              marginTop: 20, width: "100%", padding: "13px 0", borderRadius: 10,
              border: "none", background: loading || !prompt.trim() ? "#9ca3af" : "#7B1418",
              color: "#fff", fontSize: 15, fontWeight: 800, cursor: loading || !prompt.trim() ? "not-allowed" : "pointer",
              letterSpacing: 0.3, transition: "background 0.15s",
            }}
          >
            {loading ? "Generating…" : imageFile ? "Generate with Reference Image" : "Generate Image"}
          </button>
        </div>

        {/* ── Spinner (initial gen) ────────────────────────────────────────── */}
        {loading && <Spinner label="Grok is generating your image…" />}

        {/* ── Result + alter panel ─────────────────────────────────────────── */}
        {result && !loading && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }}>

            {/* Current image */}
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
              Generated Image
            </div>
            <img src={result} alt="generated" style={{ width: "100%", borderRadius: 10, display: "block" }} />

            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <a
                href={result}
                download="grok-generated.png"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block", padding: "9px 20px",
                  background: "#111", color: "#fff", borderRadius: 8,
                  fontSize: 13, fontWeight: 700, textDecoration: "none",
                }}
              >
                ↓ Download
              </a>
            </div>

            {/* ── Alter section ─────────────────────────────────────────── */}
            <div style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid #f3f4f6" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                ✏️ Alter this image
              </label>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
                Describe a change and Grok will edit the image above. You can keep iterating as many times as you like.
              </p>
              <textarea
                value={alterPrompt}
                onChange={e => setAlterPrompt(e.target.value)}
                placeholder="e.g. Make the background dark blue, add a sunrise glow…"
                rows={3}
                disabled={alterLoading}
                style={{ ...inp, resize: "vertical", lineHeight: 1.6, opacity: alterLoading ? 0.6 : 1 }}
              />
              <ErrorBox msg={alterError} />
              {alterLoading
                ? <Spinner label="Applying your changes…" />
                : (
                  <button
                    onClick={alter}
                    disabled={!alterPrompt.trim()}
                    style={{
                      marginTop: 12, width: "100%", padding: "12px 0", borderRadius: 10,
                      border: "none",
                      background: !alterPrompt.trim() ? "#9ca3af" : "#1d4ed8",
                      color: "#fff", fontSize: 14, fontWeight: 800,
                      cursor: !alterPrompt.trim() ? "not-allowed" : "pointer",
                      letterSpacing: 0.3, transition: "background 0.15s",
                    }}
                  >
                    Apply Changes
                  </button>
                )
              }
            </div>

            {/* ── History ───────────────────────────────────────────────── */}
            {history.length > 0 && (
              <div style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid #f3f4f6" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
                  Previous versions
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {[...history].reverse().map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <img
                        src={item.url}
                        alt={`v${history.length - i}`}
                        style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 8, flexShrink: 0, cursor: "pointer", border: "2px solid transparent" }}
                        title="Click to restore this version"
                        onClick={() => {
                          setHistory(h => h.slice(0, history.length - 1 - i));
                          setResult(item.url);
                          setAlterPrompt("");
                          setAlterError("");
                        }}
                      />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                          Version {history.length - i}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
                          "{item.label}"
                        </div>
                        <a
                          href={item.url}
                          download={`grok-v${history.length - i}.png`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 11, color: "#7B1418", fontWeight: 600, textDecoration: "none", marginTop: 4, display: "inline-block" }}
                        >
                          ↓ Download
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
