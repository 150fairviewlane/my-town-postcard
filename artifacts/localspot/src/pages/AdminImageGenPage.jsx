import { useState, useRef } from "react";
import { Link } from "wouter";

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

function getToken() {
  return localStorage.getItem("admin_token") ?? "";
}

export default function AdminImageGenPage() {
  const [prompt, setPrompt] = useState("");
  const [imageSrc, setImageSrc] = useState(null);   // preview of uploaded reference image
  const [imageFile, setImageFile] = useState(null);  // File object
  const [result, setResult] = useState(null);        // generated image URL
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

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

  async function generate() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
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
      setResult(data.imageUrl);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const inp = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    border: "1.5px solid #d1d5db", fontSize: 14,
    fontFamily: "sans-serif", boxSizing: "border-box", outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif" }}>
      {/* Nav */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "0 24px", height: 56, display: "flex", alignItems: "center", gap: 16 }}>
        <Link href={`${BASE}/admin`}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", cursor: "pointer", textDecoration: "none" }}>
            ← Admin
          </span>
        </Link>
        <span style={{ color: "#e5e7eb" }}>|</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>🖼 Grok Image Generator</span>
      </header>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px 80px" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 32, boxShadow: "0 2px 12px rgba(0,0,0,0.07)", marginBottom: 24 }}>

          {/* Prompt */}
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

          {/* Reference image (optional) */}
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

          {/* Error */}
          {error && (
            <div style={{ marginTop: 16, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b", fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Generate button */}
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

        {/* Result */}
        {loading && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{
              width: 40, height: 40, border: "3px solid #e5e7eb",
              borderTopColor: "#7B1418", borderRadius: "50%",
              animation: "spin 0.8s linear infinite", margin: "0 auto 12px",
            }} />
            <div style={{ fontSize: 13, color: "#6b7280" }}>Grok is generating your image…</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {result && !loading && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
              Generated Image
            </div>
            <img src={result} alt="generated" style={{ width: "100%", borderRadius: 10, display: "block" }} />
            <a
              href={result}
              download="grok-generated.png"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block", marginTop: 14, padding: "9px 20px",
                background: "#111", color: "#fff", borderRadius: 8,
                fontSize: 13, fontWeight: 700, textDecoration: "none",
              }}
            >
              ↓ Download
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
