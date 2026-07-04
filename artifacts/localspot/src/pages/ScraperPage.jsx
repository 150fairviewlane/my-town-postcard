import { useState, useEffect, useCallback, useRef } from "react";
import AdminShell from "../components/AdminShell";

const BASE = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
const api = (path) => `${BASE()}/api${path}`;

function authHeaders() {
  const token = localStorage.getItem("admin_token") ?? "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function apiFetch(path, opts = {}) {
  const resp = await fetch(api(path), { headers: authHeaders(), ...opts });
  const data = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
  if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`);
  return data;
}

const TABS = ["🔍 Scrape", "🏢 Businesses", "📋 History", "📊 Jobs", "🌐 No Website"];

const STATUS_COLORS = {
  pending:          { bg: "#f3f4f6", color: "#6b7280" },
  usable:           { bg: "#dcfce7", color: "#15803d" },
  unusable:         { bg: "#fee2e2", color: "#991b1b" },
  "no-logo-found":  { bg: "#fef9c3", color: "#92400e" },
  generated:        { bg: "#dcfce7", color: "#15803d" },
  failed:           { bg: "#fee2e2", color: "#991b1b" },
  drafted:          { bg: "#dbeafe", color: "#1d4ed8" },
  queued:           { bg: "#ede9fe", color: "#6d28d9" },
  sent:             { bg: "#dcfce7", color: "#15803d" },
  "opted-out":      { bg: "#f3f4f6", color: "#6b7280" },
};

function StatusBadge({ value }) {
  const s = STATUS_COLORS[value] ?? { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 99,
      fontSize: 11, fontWeight: 700, background: s.bg, color: s.color,
    }}>
      {value}
    </span>
  );
}

function Spinner() {
  return <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⏳</span>;
}

// ── Scrape Tab ─────────────────────────────────────────────────────────────────

function ScrapeTab({ onJobDone }) {
  const [form, setForm] = useState({ category: "", city: "Clarkesville", state: "GA", limit: 50 });
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const fetchPreview = useCallback(async () => {
    if (!form.city.trim() || !form.state.trim()) return;
    setPreviewLoading(true);
    try {
      const data = await apiFetch(
        `/admin/outreach/preview?city=${encodeURIComponent(form.city)}&state=${encodeURIComponent(form.state)}&limit=${form.limit}`,
      );
      setPreview(data);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [form.city, form.state, form.limit]);

  useEffect(() => {
    const t = setTimeout(fetchPreview, 600);
    return () => clearTimeout(t);
  }, [fetchPreview]);

  const pollJob = useCallback(async (id) => {
    try {
      const data = await apiFetch(`/admin/outreach/job/${id}`);
      setJob(data);
      if (data.status === "done" || data.status === "failed") {
        clearInterval(pollRef.current);
        setBusy(false);
        if (data.status === "done" && data.newCount > 0) {
          onJobDone?.();
        }
      }
    } catch { }
  }, [onJobDone]);

  const handleScrape = async (e) => {
    e.preventDefault();
    setError(null); setJob(null); setJobId(null); setBusy(true);
    try {
      const data = await apiFetch("/admin/outreach/scrape", {
        method: "POST",
        body: JSON.stringify({ ...form, limit: Number(form.limit) }),
      });
      setJobId(data.jobId);
      clearInterval(pollRef.current);
      pollRef.current = setInterval(() => pollJob(data.jobId), 1500);
    } catch (err) {
      setError(err.message); setBusy(false);
    }
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 7,
    border: "1.5px solid #e5e7eb", fontSize: 14, outline: "none",
    fontFamily: "system-ui,sans-serif", boxSizing: "border-box",
  };

  return (
    <div style={{ maxWidth: 580 }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 800 }}>Outscraper Business Search</h3>
      <p style={{ margin: "0 0 20px", color: "#6b7280", fontSize: 14 }}>
        Scrapes Google Maps data. Results flow automatically through logo extraction →
        ad generation → email drafting. Requires <code>OUTSCRAPER_API_KEY</code> secret.
      </p>

      <form onSubmit={handleScrape} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
            Business Category
          </label>
          <input
            style={inputStyle}
            placeholder="e.g. HVAC contractor, pizza restaurant, dentist"
            value={form.category}
            onChange={setField("category")}
            required
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 2 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>City</label>
            <input style={inputStyle} value={form.city} onChange={setField("city")} required />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>State</label>
            <input
              style={{ ...inputStyle, textTransform: "uppercase" }}
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))}
              maxLength={2} required
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Limit</label>
            <input style={inputStyle} type="number" min={1} max={100} value={form.limit} onChange={setField("limit")} />
          </div>
        </div>

        {/* Pre-scrape cost preview */}
        <div style={{
          background: preview?.cached > 0 ? "#f0fdf4" : "#fef9c3",
          border: `1px solid ${preview?.cached > 0 ? "#86efac" : "#fde047"}`,
          borderRadius: 8, padding: "10px 14px", fontSize: 13,
          color: preview?.cached > 0 ? "#166534" : "#78350f",
        }}>
          {previewLoading ? (
            "Checking cached records…"
          ) : preview ? (
            <>
              📦 {preview.cached} cached (within {preview.cacheWindowDays} days) ·{" "}
              ~{preview.estimatedNew} new from API ·{" "}
              est. <strong>${preview.estimatedCostUsd}</strong> via Outscraper
            </>
          ) : (
            `💡 Enter city/state to see cache preview · $${((Number(form.limit) / 1000) * 2.85).toFixed(3)} est. max`
          )}
        </div>

        {error && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", color: "#991b1b", fontSize: 13 }}>
            ❌ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !form.category.trim() || !form.city.trim()}
          style={{
            padding: "11px 20px", borderRadius: 8, border: "none",
            background: busy ? "#9ca3af" : "#991b1b", color: "#fff",
            fontWeight: 800, fontSize: 14, cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Scraping…" : "Start Scrape"}
        </button>
      </form>

      {job && (
        <div style={{ marginTop: 20, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            {job.status === "running" ? <Spinner /> : job.status === "done" ? "✅" : "❌"}
            Job {job.status}
          </div>
          <div style={{ fontSize: 13, color: "#374151", display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
            <span>Found: <strong>{job.total}</strong></span>
            <span>New: <strong>{job.newCount}</strong></span>
            <span>Cached: <strong>{job.skippedDuplicates}</strong></span>
            <span>With email: <strong>{job.withEmail}</strong></span>
          </div>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b7280" }}>
            ℹ️ Logo → Ad → Email pipeline runs automatically in the background after new records are inserted.
          </p>
          {job.log && job.log.length > 0 && (
            <div style={{
              background: "#111", color: "#86efac", fontFamily: "monospace",
              fontSize: 12, padding: "8px 12px", borderRadius: 7,
              maxHeight: 140, overflowY: "auto",
            }}>
              {job.log.slice(-15).map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
          {job.error && <div style={{ marginTop: 8, color: "#991b1b", fontSize: 13 }}>Error: {job.error}</div>}
        </div>
      )}

      <div style={{ marginTop: 28, borderTop: "1px solid #e5e7eb", paddingTop: 20 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 800, color: "#374151" }}>
          Manual Bulk Operations
          <span style={{ fontSize: 11, fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>
            (pipeline runs automatically after scrape — use these to manually retry)
          </span>
        </h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <BulkButton label="🔍 Extract Logos" endpoint="/admin/outreach/batch/logos"
            payload={{ city: form.city, state: form.state, limit: 50 }} title="Re-extract logos for pending businesses" />
          <BulkButton label="🎨 Generate Ads" endpoint="/admin/outreach/batch/ads"
            payload={{ city: form.city, state: form.state, limit: 10 }} title="Generate ads for businesses with usable logos" />
          <BulkButton label="✉ Draft Emails" endpoint="/admin/outreach/batch/email-drafts"
            payload={{ city: form.city, state: form.state, limit: 100 }} title="Draft emails for pending businesses" />
        </div>
      </div>
    </div>
  );
}

function BulkButton({ label, endpoint, payload, title }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const run = async () => {
    setBusy(true); setResult(null);
    try {
      const data = await apiFetch(endpoint, { method: "POST", body: JSON.stringify(payload) });
      setResult({ ok: true, msg: data.message ?? `Started — ${data.count ?? "?"} items` });
    } catch (err) {
      setResult({ ok: false, msg: err.message });
    } finally { setBusy(false); }
  };

  return (
    <div>
      <button onClick={run} disabled={busy} title={title} style={{
        padding: "7px 14px", borderRadius: 7, border: "1.5px solid #e5e7eb",
        background: busy ? "#f3f4f6" : "#fff", cursor: busy ? "not-allowed" : "pointer",
        fontSize: 13, fontWeight: 600, color: "#374151",
      }}>
        {busy ? "…" : label}
      </button>
      {result && (
        <div style={{ fontSize: 11, marginTop: 3, color: result.ok ? "#15803d" : "#991b1b" }}>
          {result.msg}
        </div>
      )}
    </div>
  );
}

// ── Businesses Tab ─────────────────────────────────────────────────────────────

function BusinessesTab() {
  const [businesses, setBusinesses] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState({ city: "", state: "", email_status: "", logo_status: "", ad_status: "", q: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const LIMIT = 25;

  const load = useCallback(async (newOffset = 0) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(newOffset) });
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const data = await apiFetch(`/admin/outreach/businesses?${params}`);
      setBusinesses(data.businesses ?? []);
      setTotal(data.total ?? 0);
      setOffset(newOffset);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(0); }, [load]);

  const filterInputStyle = {
    padding: "6px 10px", borderRadius: 6, border: "1.5px solid #e5e7eb",
    fontSize: 13, outline: "none", fontFamily: "system-ui,sans-serif",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <input style={{ ...filterInputStyle, width: 120 }} placeholder="City" value={filters.city}
          onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))} />
        <input style={{ ...filterInputStyle, width: 50 }} placeholder="ST" value={filters.state}
          onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value.toUpperCase() }))} maxLength={2} />
        <select style={filterInputStyle} value={filters.logo_status}
          onChange={(e) => setFilters((f) => ({ ...f, logo_status: e.target.value }))}>
          <option value="">Logo: all</option>
          <option value="pending">pending</option>
          <option value="usable">usable</option>
          <option value="unusable">unusable</option>
          <option value="no-logo-found">no-logo-found</option>
        </select>
        <select style={filterInputStyle} value={filters.ad_status}
          onChange={(e) => setFilters((f) => ({ ...f, ad_status: e.target.value }))}>
          <option value="">Ad: all</option>
          <option value="pending">pending</option>
          <option value="generated">generated</option>
          <option value="failed">failed</option>
        </select>
        <select style={filterInputStyle} value={filters.email_status}
          onChange={(e) => setFilters((f) => ({ ...f, email_status: e.target.value }))}>
          <option value="">Email: all</option>
          <option value="pending">pending</option>
          <option value="drafted">drafted</option>
          <option value="sent">sent</option>
          <option value="opted-out">opted-out</option>
        </select>
        <input style={{ ...filterInputStyle, width: 150 }} placeholder="Search…" value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
        <button onClick={() => load(0)} style={{
          padding: "6px 14px", borderRadius: 6, border: "none",
          background: "#991b1b", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>Filter</button>
        <span style={{ fontSize: 13, color: "#9ca3af", marginLeft: "auto" }}>{total} total</span>
      </div>

      {error && <div style={{ background: "#fee2e2", borderRadius: 8, padding: "10px 14px", color: "#991b1b", fontSize: 13, marginBottom: 12 }}>❌ {error}</div>}
      {loading && <div style={{ color: "#6b7280", padding: 20, textAlign: "center" }}>Loading…</div>}
      {!loading && businesses.length === 0 && (
        <div style={{ color: "#9ca3af", padding: 40, textAlign: "center", background: "#f9fafb", borderRadius: 12 }}>
          No businesses found. Run a scrape to get started.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {businesses.map((biz) => (
          <BusinessRow key={biz.id} biz={biz}
            expanded={expanded === biz.id}
            onToggle={() => setExpanded(expanded === biz.id ? null : biz.id)}
            onRefresh={() => load(offset)} />
        ))}
      </div>

      {total > LIMIT && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <button onClick={() => load(Math.max(0, offset - LIMIT))} disabled={offset === 0}
            style={{ padding: "6px 14px", borderRadius: 6, border: "1.5px solid #e5e7eb", background: "#fff", cursor: offset === 0 ? "not-allowed" : "pointer", fontSize: 13, color: offset === 0 ? "#d1d5db" : "#374151" }}>
            ← Previous
          </button>
          <span style={{ padding: "6px 14px", fontSize: 13, color: "#6b7280" }}>
            {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
          </span>
          <button onClick={() => load(offset + LIMIT)} disabled={offset + LIMIT >= total}
            style={{ padding: "6px 14px", borderRadius: 6, border: "1.5px solid #e5e7eb", background: "#fff", cursor: offset + LIMIT >= total ? "not-allowed" : "pointer", fontSize: 13, color: offset + LIMIT >= total ? "#d1d5db" : "#374151" }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function ActionBtn({ label, onClick, busy, primary }) {
  return (
    <button onClick={onClick} disabled={busy} style={{
      padding: "4px 10px", borderRadius: 6, border: `1.5px solid ${primary ? "transparent" : "#e5e7eb"}`,
      background: busy ? "#f3f4f6" : primary ? "#991b1b" : "#fff",
      color: busy ? "#9ca3af" : primary ? "#fff" : "#374151",
      fontSize: 12, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", whiteSpace: "nowrap",
    }}>
      {busy ? "…" : label}
    </button>
  );
}

function BusinessRow({ biz, expanded, onToggle, onRefresh }) {
  const [localBiz, setLocalBiz] = useState(biz);
  const [busy, setBusy] = useState({});
  const [msg, setMsg] = useState(null);
  const [editEmail, setEditEmail] = useState(false);
  const [emailVal, setEmailVal] = useState(biz.email ?? "");
  const [editDraft, setEditDraft] = useState(false);
  const [draftSubject, setDraftSubject] = useState(biz.emailSubject ?? "");
  const [draftBody, setDraftBody] = useState(biz.emailBodyHtml ?? "");

  useEffect(() => {
    setLocalBiz(biz);
    setDraftSubject(biz.emailSubject ?? "");
    setDraftBody(biz.emailBodyHtml ?? "");
  }, [biz]);

  const setOneBusy = (k, v) => setBusy((b) => ({ ...b, [k]: v }));

  const action = async (key, path, method = "POST", body = undefined) => {
    setOneBusy(key, true); setMsg(null);
    try {
      const data = await apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined });
      setMsg({ ok: true, text: data.message ?? "Done" });
      const fresh = await apiFetch(`/admin/outreach/businesses/${localBiz.id}`);
      setLocalBiz(fresh);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally { setOneBusy(key, false); }
  };

  const saveEmail = async () => {
    await action("email", `/admin/outreach/businesses/${localBiz.id}`, "PATCH", { email: emailVal });
    setEditEmail(false);
  };

  const confirmSend = () => {
    if (!localBiz.email) { setMsg({ ok: false, text: "No email address" }); return; }
    if (localBiz.emailStatus !== "drafted") { setMsg({ ok: false, text: "Generate a draft first" }); return; }
    if (!window.confirm(`Send outreach email to ${localBiz.email}?\n\nThis will send a real email via Resend.`)) return;
    action("send", `/admin/outreach/businesses/${localBiz.id}/send`);
  };

  const confirmDelete = async () => {
    if (!window.confirm(`Delete ${localBiz.businessName}?`)) return;
    try {
      await apiFetch(`/admin/outreach/businesses/${localBiz.id}`, { method: "DELETE" });
      onRefresh();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
      <div onClick={onToggle} style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        cursor: "pointer", background: expanded ? "#fef2f2" : "#fff",
      }}>
        <div style={{ flex: "0 0 190px", fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {localBiz.businessName}
        </div>
        <div style={{ flex: "0 0 90px", fontSize: 12, color: "#6b7280" }}>{localBiz.city}, {localBiz.state}</div>
        <div style={{ flex: "0 0 120px", fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {localBiz.category ?? "—"}
        </div>
        <div style={{ flex: "0 0 80px" }}><StatusBadge value={localBiz.logoStatus} /></div>
        <div style={{ flex: "0 0 80px" }}><StatusBadge value={localBiz.adStatus} /></div>
        <div style={{ flex: "0 0 80px" }}><StatusBadge value={localBiz.emailStatus} /></div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#9ca3af" }}>
          {localBiz.email ? "📧" : ""} {expanded ? "▲" : "▼"}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "14px 16px", borderTop: "1px solid #f3f4f6", background: "#fafafa" }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 14 }}>
            {localBiz.phone && <Detail label="Phone" value={localBiz.phone} />}
            {localBiz.website && <Detail label="Website" value={localBiz.website} link />}
            {localBiz.address && <Detail label="Address" value={localBiz.address} />}
            {localBiz.logoMethod && <Detail label="Logo source" value={localBiz.logoMethod} />}
          </div>

          {/* Email address editor */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 }}>Email address</div>
            {editEmail ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input value={emailVal} onChange={(e) => setEmailVal(e.target.value)}
                  style={{ padding: "5px 9px", borderRadius: 6, border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none", width: 240 }} />
                <ActionBtn label="Save" onClick={saveEmail} busy={busy.email} primary />
                <ActionBtn label="Cancel" onClick={() => setEditEmail(false)} busy={false} />
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: localBiz.email ? "#374151" : "#9ca3af" }}>{localBiz.email ?? "—"}</span>
                <ActionBtn label="✎ Edit" onClick={() => { setEditEmail(true); setEmailVal(localBiz.email ?? ""); }} busy={false} />
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            <ActionBtn label="🔍 Logo" onClick={() => action("logo", `/admin/outreach/businesses/${localBiz.id}/logo`)} busy={busy.logo} />
            <ActionBtn label="🎨 Ad" onClick={() => action("ad", `/admin/outreach/businesses/${localBiz.id}/ad`)} busy={busy.ad} />
            <ActionBtn label="✉ Draft" onClick={() => action("draft", `/admin/outreach/businesses/${localBiz.id}/email-draft`)} busy={busy.draft} />
            <ActionBtn label="📤 Approve & Send" onClick={confirmSend} busy={busy.send}
              primary={localBiz.emailStatus === "drafted"} />
            <ActionBtn label="🚫 Opt-out"
              onClick={() => action("optout", `/admin/outreach/businesses/${localBiz.id}`, "PATCH", { emailStatus: "opted-out" })}
              busy={busy.optout} />
            <ActionBtn label="🗑" onClick={confirmDelete} busy={busy.delete} />
          </div>

          {msg && (
            <div style={{ fontSize: 12, color: msg.ok ? "#15803d" : "#991b1b", marginBottom: 10 }}>
              {msg.ok ? "✅" : "❌"} {msg.text}
            </div>
          )}

          {/* Inline draft editor */}
          {localBiz.emailStatus === "drafted" || localBiz.emailStatus === "pending" ? (
            editDraft ? (
              <div style={{ marginBottom: 14, background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#0369a1", marginBottom: 10 }}>✎ Edit Email Draft</div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>Subject</label>
                  <input
                    value={draftSubject}
                    onChange={(e) => setDraftSubject(e.target.value)}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1.5px solid #bae6fd", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>
                    Email Body HTML
                    <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>(full HTML — will be sent as-is)</span>
                  </label>
                  <textarea
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    rows={10}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1.5px solid #bae6fd", fontSize: 12, fontFamily: "monospace", outline: "none", resize: "vertical", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <ActionBtn label="💾 Save Draft" busy={busy.saveDraft} primary onClick={async () => {
                    setOneBusy("saveDraft", true); setMsg(null);
                    try {
                      const updated = await apiFetch(`/admin/outreach/businesses/${localBiz.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ emailSubject: draftSubject, emailBodyHtml: draftBody }),
                      });
                      setLocalBiz(updated);
                      setEditDraft(false);
                      setMsg({ ok: true, text: "Draft saved" });
                    } catch (err) {
                      setMsg({ ok: false, text: err.message });
                    } finally { setOneBusy("saveDraft", false); }
                  }} />
                  <ActionBtn label="Cancel" busy={false} onClick={() => setEditDraft(false)} />
                </div>
              </div>
            ) : localBiz.emailSubject ? (
              <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#374151", fontStyle: "italic" }}>
                  Subject: <strong>{localBiz.emailSubject}</strong>
                </span>
                <ActionBtn label="✎ Edit Draft" busy={false} onClick={() => setEditDraft(true)} />
              </div>
            ) : null
          ) : null}

          {localBiz.logoVisionNotes && (
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8, fontStyle: "italic" }}>
              Logo: {localBiz.logoVisionNotes}
            </div>
          )}

          {/* Visual previews */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start", marginTop: 8 }}>
            {localBiz.logoUrl && localBiz.logoStatus === "usable" && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>LOGO</div>
                <img src={localBiz.logoUrl} alt="Logo"
                  style={{ maxWidth: 100, maxHeight: 80, objectFit: "contain", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", padding: 4 }} />
              </div>
            )}
            {localBiz.adImageUrl && localBiz.adStatus === "generated" && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>AD PREVIEW</div>
                <img src={localBiz.adImageUrl} alt="Ad"
                  style={{ maxWidth: 160, maxHeight: 210, objectFit: "contain", border: "1px solid #e5e7eb", borderRadius: 6 }} />
              </div>
            )}
            {localBiz.emailBodyHtml && (
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>
                  EMAIL DRAFT
                  {localBiz.emailSubject && <span style={{ fontWeight: 400, marginLeft: 6 }}>— {localBiz.emailSubject}</span>}
                </div>
                {/* sandboxed iframe prevents scripts in admin-edited HTML from reaching parent */}
                <iframe
                  sandbox="allow-same-origin"
                  srcDoc={localBiz.emailBodyHtml}
                  title="Email draft preview"
                  style={{
                    border: "1px solid #e5e7eb", borderRadius: 6,
                    width: "100%", height: 320, display: "block",
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, link }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af" }}>{label}</div>
      {link ? (
        <a href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}>
          {value.replace(/^https?:\/\//, "").slice(0, 40)}
        </a>
      ) : (
        <div style={{ fontSize: 13, color: "#374151" }}>{value}</div>
      )}
    </div>
  );
}

// ── History Tab ────────────────────────────────────────────────────────────────

function HistoryTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/admin/outreach/history");
      setRows(Array.isArray(data) ? data : []);
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const thStyle = { padding: "8px 12px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#9ca3af", borderBottom: "1px solid #e5e7eb" };
  const tdStyle = { padding: "10px 12px", fontSize: 13, color: "#374151", borderBottom: "1px solid #f3f4f6" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Scrape History by City</h3>
        <button onClick={load} style={{
          padding: "5px 12px", borderRadius: 6, border: "1.5px solid #e5e7eb",
          background: "#fff", fontSize: 12, cursor: "pointer", color: "#374151",
        }}>↻ Refresh</button>
      </div>

      {loading && <div style={{ color: "#9ca3af", textAlign: "center", padding: 40 }}>Loading…</div>}
      {!loading && rows.length === 0 && (
        <div style={{ color: "#9ca3af", textAlign: "center", padding: 40, background: "#f9fafb", borderRadius: 12 }}>
          No scrape history yet. Run a scrape to see results here.
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={thStyle}>City</th>
                <th style={thStyle}>State</th>
                <th style={thStyle}>Total</th>
                <th style={thStyle}>Logos</th>
                <th style={thStyle}>Ads</th>
                <th style={thStyle}>Drafted</th>
                <th style={thStyle}>Sent</th>
                <th style={thStyle}>Latest Scrape</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{r.city}</td>
                  <td style={tdStyle}>{r.state}</td>
                  <td style={tdStyle}>{r.total}</td>
                  <td style={tdStyle}>
                    <span style={{ color: "#15803d", fontWeight: 600 }}>{r.usableLogos}</span>
                    <span style={{ color: "#9ca3af", fontSize: 11 }}>/{r.total}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: "#1d4ed8", fontWeight: 600 }}>{r.adsGenerated}</span>
                    <span style={{ color: "#9ca3af", fontSize: 11 }}>/{r.total}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: "#6d28d9", fontWeight: 600 }}>{r.emailsDrafted}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: "#15803d", fontWeight: 600 }}>{r.emailsSent}</span>
                  </td>
                  <td style={{ ...tdStyle, color: "#6b7280" }}>
                    {r.latestScrape ? new Date(r.latestScrape).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Jobs Tab ───────────────────────────────────────────────────────────────────

function JobsTab() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/admin/outreach/jobs");
      setJobs(Array.isArray(data) ? data : []);
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Background Jobs</h3>
        <button onClick={load} style={{ padding: "5px 12px", borderRadius: 6, border: "1.5px solid #e5e7eb", background: "#fff", fontSize: 12, cursor: "pointer", color: "#374151" }}>↻ Refresh</button>
      </div>

      {loading && jobs.length === 0 && <div style={{ color: "#9ca3af", textAlign: "center", padding: 40 }}>Loading…</div>}
      {jobs.length === 0 && !loading && (
        <div style={{ color: "#9ca3af", textAlign: "center", padding: 40, background: "#f9fafb", borderRadius: 12 }}>
          No jobs yet. Start a scrape to see activity here.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {jobs.map((job) => (
          <div key={job.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {job.status === "running" ? "⏳" : job.status === "done" ? "✅" : "❌"}{" "}
                  [{job.type}] {job.label}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                  {new Date(job.startedAt).toLocaleTimeString()}
                  {job.completedAt && ` → ${new Date(job.completedAt).toLocaleTimeString()}`}
                </div>
              </div>
              <StatusBadge value={job.status} />
            </div>
            <div style={{ fontSize: 13, color: "#374151", display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span>Total: <strong>{job.total}</strong></span>
              <span>Processed: <strong>{job.processed}</strong></span>
              <span>New/OK: <strong>{job.newCount}</strong></span>
              <span>Skipped: <strong>{job.skippedDuplicates}</strong></span>
              <span>With email: <strong>{job.withEmail}</strong></span>
            </div>
            {job.error && <div style={{ marginTop: 6, color: "#991b1b", fontSize: 12 }}>Error: {job.error}</div>}
            {job.log && job.log.length > 0 && (
              <div style={{ marginTop: 8, background: "#111", color: "#86efac", fontFamily: "monospace", fontSize: 11, padding: "6px 10px", borderRadius: 6, maxHeight: 80, overflowY: "auto" }}>
                {job.log.slice(-6).map((line, i) => <div key={i}>{line}</div>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── No Website Tab ─────────────────────────────────────────────────────────────

function NoWebsiteTab() {
  const [businesses, setBusinesses] = useState([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ city: "", state: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.city) params.set("city", filters.city);
      if (filters.state) params.set("state", filters.state);
      const data = await apiFetch(`/admin/outreach/no-website?${params}`);
      setBusinesses(data.businesses ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const downloadCsv = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams({ format: "csv" });
      if (filters.city) params.set("city", filters.city);
      if (filters.state) params.set("state", filters.state);
      const resp = await fetch(api(`/admin/outreach/no-website?${params}`), { headers: authHeaders() });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "no-website-businesses.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) { alert("CSV download failed: " + err.message); }
    finally { setDownloading(false); }
  };

  const filterInputStyle = {
    padding: "6px 10px", borderRadius: 6, border: "1.5px solid #e5e7eb",
    fontSize: 13, outline: "none", fontFamily: "system-ui,sans-serif",
  };
  const thStyle = { padding: "8px 12px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#9ca3af", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" };
  const tdStyle = { padding: "10px 12px", fontSize: 13, color: "#374151", borderBottom: "1px solid #f3f4f6", verticalAlign: "top" };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 800 }}>Businesses Without a Website</h3>
        <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 14 }}>
          Businesses found via Outscraper with no website on record — potential leads for a future website-building product.
          Signal is captured automatically whenever you scrape; no schema change needed.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            style={{ ...filterInputStyle, width: 130 }}
            placeholder="City"
            value={filters.city}
            onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
          />
          <input
            style={{ ...filterInputStyle, width: 55 }}
            placeholder="ST"
            value={filters.state}
            onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value.toUpperCase() }))}
            maxLength={2}
          />
          <button
            onClick={load}
            style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#991b1b", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            Filter
          </button>
          <span style={{ fontSize: 13, color: "#9ca3af" }}>
            {loading ? "Loading…" : `${total} business${total === 1 ? "" : "es"}`}
          </span>
          <button
            onClick={downloadCsv}
            disabled={downloading || total === 0}
            style={{
              marginLeft: "auto", padding: "6px 14px", borderRadius: 6,
              border: "1.5px solid #e5e7eb", background: downloading || total === 0 ? "#f3f4f6" : "#fff",
              color: downloading || total === 0 ? "#9ca3af" : "#374151",
              fontSize: 13, fontWeight: 600, cursor: downloading || total === 0 ? "not-allowed" : "pointer",
            }}
          >
            {downloading ? "Downloading…" : "⬇ Download CSV"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: "#fee2e2", borderRadius: 8, padding: "10px 14px", color: "#991b1b", fontSize: 13, marginBottom: 12 }}>
          ❌ {error}
        </div>
      )}

      {!loading && businesses.length === 0 && (
        <div style={{ color: "#9ca3af", padding: 40, textAlign: "center", background: "#f9fafb", borderRadius: 12 }}>
          {total === 0
            ? "No businesses without a website found. Try scraping a city first."
            : "No results match your filters."}
        </div>
      )}

      {businesses.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={thStyle}>Business Name</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Address</th>
                <th style={thStyle}>City</th>
                <th style={thStyle}>Scraped</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((biz, i) => (
                <tr key={biz.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ ...tdStyle, fontWeight: 700, maxWidth: 200 }}>{biz.businessName}</td>
                  <td style={{ ...tdStyle, color: "#6b7280", maxWidth: 160 }}>
                    {biz.category ?? "—"}
                    {Array.isArray(biz.subtypes) && biz.subtypes.length > 0 && (
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                        {biz.subtypes.slice(0, 3).join(", ")}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    {biz.phone
                      ? <a href={`tel:${biz.phone}`} style={{ color: "#2563eb", textDecoration: "none" }}>{biz.phone}</a>
                      : <span style={{ color: "#d1d5db" }}>—</span>}
                  </td>
                  <td style={{ ...tdStyle, color: "#6b7280", fontSize: 12 }}>{biz.address ?? "—"}</td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{biz.city}, {biz.state}</td>
                  <td style={{ ...tdStyle, color: "#9ca3af", whiteSpace: "nowrap", fontSize: 12 }}>
                    {biz.scrapedAt
                      ? new Date(biz.scrapedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {businesses.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#9ca3af" }}>
          ℹ️ This list grows automatically as you scrape more cities. Download CSV anytime to export for future use.
        </div>
      )}
    </div>
  );
}

// ── Stats Bar ──────────────────────────────────────────────────────────────────

function StatsBar() {
  const [stats, setStats] = useState(null);
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;

  useEffect(() => {
    if (!token) return;
    const load = () => apiFetch("/admin/outreach/stats").then(setStats).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [token]);

  if (!stats) return null;
  const s = stats.stats ?? [];
  const sent = s.filter((r) => r.emailStatus === "sent").reduce((a, r) => a + r.count, 0);
  const drafted = s.filter((r) => r.emailStatus === "drafted").reduce((a, r) => a + r.count, 0);
  const genAds = s.filter((r) => r.adStatus === "generated").reduce((a, r) => a + r.count, 0);
  const usableLogo = s.filter((r) => r.logoStatus === "usable").reduce((a, r) => a + r.count, 0);

  const items = [
    { label: "Total scraped", value: stats.total, color: "#374151" },
    { label: "Usable logos", value: usableLogo, color: "#15803d" },
    { label: "Ads generated", value: genAds, color: "#1d4ed8" },
    { label: "Emails drafted", value: drafted, color: "#6d28d9" },
    { label: "Emails sent", value: sent, color: "#991b1b" },
  ];

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
      {items.map(({ label, value, color }) => (
        <div key={label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 16px", minWidth: 90, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 900, color }}>{value}</div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ScraperPage() {
  const [tab, setTab] = useState(0);

  return (
    <AdminShell>
      <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 900, color: "#111", fontFamily: "Georgia,serif" }}>
            🤖 Business Scraper
          </h2>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            Outscraper pipeline · Scrape → Logo extract → Ad generate → Email draft · Admin only — nothing auto-sends
          </p>
        </div>

        <StatsBar />

        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {TABS.map((label, i) => (
            <button key={i} onClick={() => setTab(i)} style={{
              padding: "8px 18px", borderRadius: 8, border: "none",
              background: tab === i ? "#991b1b" : "#f3f4f6",
              color: tab === i ? "#fff" : "#374151",
              fontWeight: tab === i ? 800 : 500, fontSize: 13, cursor: "pointer",
            }}>{label}</button>
          ))}
        </div>

        {tab === 0 && <ScrapeTab onJobDone={() => setTab(1)} />}
        {tab === 1 && <BusinessesTab />}
        {tab === 2 && <HistoryTab />}
        {tab === 3 && <JobsTab />}
        {tab === 4 && <NoWebsiteTab />}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </AdminShell>
  );
}
