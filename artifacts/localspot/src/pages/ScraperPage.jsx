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

const TABS = ["🔍 Scrape", "🏢 Businesses", "📊 Jobs"];

const STATUS_COLORS = {
  pending:        { bg: "#f3f4f6", color: "#6b7280" },
  usable:         { bg: "#dcfce7", color: "#15803d" },
  unusable:       { bg: "#fee2e2", color: "#991b1b" },
  "no-logo-found":{ bg: "#fef9c3", color: "#92400e" },
  generated:      { bg: "#dcfce7", color: "#15803d" },
  failed:         { bg: "#fee2e2", color: "#991b1b" },
  drafted:        { bg: "#dbeafe", color: "#1d4ed8" },
  queued:         { bg: "#ede9fe", color: "#6d28d9" },
  sent:           { bg: "#dcfce7", color: "#15803d" },
  "opted-out":    { bg: "#f3f4f6", color: "#6b7280" },
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

// ── Scrape Tab ──────────────────────────────────────────────────────────────

function ScrapeTab() {
  const [form, setForm] = useState({ category: "", city: "Clarkesville", state: "GA", limit: 50 });
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pollJob = useCallback(async (id) => {
    try {
      const data = await apiFetch(`/admin/scraper/job/${id}`);
      setJob(data);
      if (data.status === "done" || data.status === "failed") {
        clearInterval(pollRef.current);
        setBusy(false);
      }
    } catch {
    }
  }, []);

  const handleScrape = async (e) => {
    e.preventDefault();
    setError(null);
    setJob(null);
    setJobId(null);
    setBusy(true);
    try {
      const data = await apiFetch("/admin/scraper/scrape", {
        method: "POST",
        body: JSON.stringify({ ...form, limit: Number(form.limit) }),
      });
      setJobId(data.jobId);
      clearInterval(pollRef.current);
      pollRef.current = setInterval(() => pollJob(data.jobId), 1500);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 7,
    border: "1.5px solid #e5e7eb", fontSize: 14, outline: "none",
    fontFamily: "system-ui,sans-serif", boxSizing: "border-box",
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 800 }}>Outscraper Business Search</h3>
      <p style={{ margin: "0 0 20px", color: "#6b7280", fontSize: 14 }}>
        Scrapes Google Maps data via Outscraper API. Results are saved to the Businesses tab for logo/ad/email processing.
        Requires <code>OUTSCRAPER_API_KEY</code> secret.
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
              maxLength={2}
              required
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Limit</label>
            <input style={inputStyle} type="number" min={1} max={100} value={form.limit} onChange={setField("limit")} />
          </div>
        </div>

        <div style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#78350f" }}>
          💡 Estimated cost: ~${((Number(form.limit) / 1000) * 2.85).toFixed(3)} · {form.limit} records @ $2.85/1k via Outscraper
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
            <span>Total: <strong>{job.total}</strong></span>
            <span>Processed: <strong>{job.processed}</strong></span>
            <span>New: <strong>{job.newCount}</strong></span>
            <span>Skipped: <strong>{job.skippedDuplicates}</strong></span>
            <span>With email: <strong>{job.withEmail}</strong></span>
          </div>
          {job.log && job.log.length > 0 && (
            <div style={{
              background: "#111", color: "#86efac", fontFamily: "monospace",
              fontSize: 12, padding: "8px 12px", borderRadius: 7,
              maxHeight: 140, overflowY: "auto",
            }}>
              {job.log.slice(-15).map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
          {job.error && (
            <div style={{ marginTop: 8, color: "#991b1b", fontSize: 13 }}>Error: {job.error}</div>
          )}
        </div>
      )}

      <div style={{ marginTop: 28, borderTop: "1px solid #e5e7eb", paddingTop: 20 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 800, color: "#374151" }}>Bulk Operations</h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <BulkButton
            label="🔍 Extract All Logos"
            endpoint="/admin/scraper/batch/logos"
            payload={{ city: form.city, state: form.state, limit: 50 }}
            title="Extract logos for pending businesses"
          />
          <BulkButton
            label="🎨 Generate All Ads"
            endpoint="/admin/scraper/batch/ads"
            payload={{ city: form.city, state: form.state, limit: 10 }}
            title="Generate sample ads (max 10 at a time)"
          />
          <BulkButton
            label="✉ Draft All Emails"
            endpoint="/admin/scraper/batch/email-drafts"
            payload={{ city: form.city, state: form.state, limit: 100 }}
            title="Create email drafts for all pending businesses"
          />
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9ca3af" }}>
          Bulk operations apply to the city/state shown above. Logo and ad batches run async (check Jobs tab).
        </p>
      </div>
    </div>
  );
}

function BulkButton({ label, endpoint, payload, title }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const data = await apiFetch(endpoint, { method: "POST", body: JSON.stringify(payload) });
      setResult({ ok: true, msg: data.message ?? `Started — ${data.count ?? "?"} items` });
    } catch (err) {
      setResult({ ok: false, msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        onClick={run}
        disabled={busy}
        title={title}
        style={{
          padding: "7px 14px", borderRadius: 7, border: "1.5px solid #e5e7eb",
          background: busy ? "#f3f4f6" : "#fff", cursor: busy ? "not-allowed" : "pointer",
          fontSize: 13, fontWeight: 600, color: "#374151",
        }}
      >
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

// ── Businesses Tab ───────────────────────────────────────────────────────────

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
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(newOffset) });
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const data = await apiFetch(`/admin/scraper/businesses?${params}`);
      setBusinesses(data.businesses ?? []);
      setTotal(data.total ?? 0);
      setOffset(newOffset);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(0); }, [load]);

  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  const filterInputStyle = {
    padding: "6px 10px", borderRadius: 6, border: "1.5px solid #e5e7eb",
    fontSize: 13, outline: "none", fontFamily: "system-ui,sans-serif",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <input style={{ ...filterInputStyle, width: 120 }} placeholder="City" value={filters.city} onChange={setFilter("city")} />
        <input style={{ ...filterInputStyle, width: 50 }} placeholder="ST" value={filters.state} onChange={setFilter("state")} maxLength={2} />
        <select style={filterInputStyle} value={filters.logo_status} onChange={setFilter("logo_status")}>
          <option value="">Logo: all</option>
          <option value="pending">pending</option>
          <option value="usable">usable</option>
          <option value="unusable">unusable</option>
          <option value="no-logo-found">no-logo-found</option>
        </select>
        <select style={filterInputStyle} value={filters.ad_status} onChange={setFilter("ad_status")}>
          <option value="">Ad: all</option>
          <option value="pending">pending</option>
          <option value="generated">generated</option>
          <option value="failed">failed</option>
        </select>
        <select style={filterInputStyle} value={filters.email_status} onChange={setFilter("email_status")}>
          <option value="">Email: all</option>
          <option value="pending">pending</option>
          <option value="drafted">drafted</option>
          <option value="sent">sent</option>
          <option value="opted-out">opted-out</option>
        </select>
        <input style={{ ...filterInputStyle, width: 150 }} placeholder="Search…" value={filters.q} onChange={setFilter("q")} />
        <button
          onClick={() => load(0)}
          style={{
            padding: "6px 14px", borderRadius: 6, border: "none",
            background: "#991b1b", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}
        >
          Filter
        </button>
        <span style={{ fontSize: 13, color: "#9ca3af", marginLeft: "auto" }}>
          {total} total
        </span>
      </div>

      {error && (
        <div style={{ background: "#fee2e2", borderRadius: 8, padding: "10px 14px", color: "#991b1b", fontSize: 13, marginBottom: 12 }}>
          ❌ {error}
        </div>
      )}

      {loading && <div style={{ color: "#6b7280", padding: 20, textAlign: "center" }}>Loading…</div>}

      {!loading && businesses.length === 0 && (
        <div style={{ color: "#9ca3af", padding: 40, textAlign: "center", background: "#f9fafb", borderRadius: 12 }}>
          No businesses found. Run a scrape to get started.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {businesses.map((biz) => (
          <BusinessRow
            key={biz.id}
            biz={biz}
            expanded={expanded === biz.id}
            onToggle={() => setExpanded(expanded === biz.id ? null : biz.id)}
            onRefresh={() => load(offset)}
          />
        ))}
      </div>

      {total > LIMIT && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <button
            onClick={() => load(Math.max(0, offset - LIMIT))}
            disabled={offset === 0}
            style={{
              padding: "6px 14px", borderRadius: 6, border: "1.5px solid #e5e7eb",
              background: "#fff", cursor: offset === 0 ? "not-allowed" : "pointer",
              fontSize: 13, color: offset === 0 ? "#d1d5db" : "#374151",
            }}
          >
            ← Previous
          </button>
          <span style={{ padding: "6px 14px", fontSize: 13, color: "#6b7280" }}>
            {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
          </span>
          <button
            onClick={() => load(offset + LIMIT)}
            disabled={offset + LIMIT >= total}
            style={{
              padding: "6px 14px", borderRadius: 6, border: "1.5px solid #e5e7eb",
              background: "#fff", cursor: offset + LIMIT >= total ? "not-allowed" : "pointer",
              fontSize: 13, color: offset + LIMIT >= total ? "#d1d5db" : "#374151",
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, onClick, busy, color = "#374151", bg = "#fff" }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        padding: "4px 10px", borderRadius: 6, border: "1.5px solid #e5e7eb",
        background: busy ? "#f3f4f6" : bg, color: busy ? "#9ca3af" : color,
        fontSize: 12, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
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

  useEffect(() => { setLocalBiz(biz); }, [biz]);

  const setOneBusy = (k, v) => setBusy((b) => ({ ...b, [k]: v }));

  const action = async (key, path, method = "POST", body = undefined) => {
    setOneBusy(key, true);
    setMsg(null);
    try {
      const data = await apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined });
      setMsg({ ok: true, text: data.message ?? "Done" });
      // Refresh the single row
      const fresh = await apiFetch(`/admin/scraper/businesses/${localBiz.id}`);
      setLocalBiz(fresh);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setOneBusy(key, false);
    }
  };

  const saveEmail = async () => {
    await action("email", `/admin/scraper/businesses/${localBiz.id}`, "PATCH", { email: emailVal });
    setEditEmail(false);
  };

  const confirmSend = () => {
    if (!localBiz.email) { setMsg({ ok: false, text: "No email address" }); return; }
    if (!window.confirm(`Send outreach email to ${localBiz.email}?`)) return;
    action("send", `/admin/scraper/businesses/${localBiz.id}/send-email`);
  };

  const confirmDelete = async () => {
    if (!window.confirm(`Delete ${localBiz.businessName}?`)) return;
    try {
      await apiFetch(`/admin/scraper/businesses/${localBiz.id}`, { method: "DELETE" });
      onRefresh();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };

  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
      overflow: "hidden",
    }}>
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", cursor: "pointer",
          background: expanded ? "#fef2f2" : "#fff",
        }}
      >
        <div style={{ flex: "0 0 200px", fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {localBiz.businessName}
        </div>
        <div style={{ flex: "0 0 100px", fontSize: 12, color: "#6b7280" }}>
          {localBiz.city}, {localBiz.state}
        </div>
        <div style={{ flex: "0 0 130px", fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {localBiz.category ?? "—"}
        </div>
        <div style={{ flex: "0 0 80px" }}><StatusBadge value={localBiz.logoStatus} /></div>
        <div style={{ flex: "0 0 80px" }}><StatusBadge value={localBiz.adStatus} /></div>
        <div style={{ flex: "0 0 80px" }}><StatusBadge value={localBiz.emailStatus} /></div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#9ca3af" }}>
          {localBiz.email ? "📧" : ""}
          {" "}{expanded ? "▲" : "▼"}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "14px 16px", borderTop: "1px solid #f3f4f6", background: "#fafafa" }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 14 }}>
            <Detail label="Phone" value={localBiz.phone} />
            <Detail label="Website" value={localBiz.website} link />
            <Detail label="Address" value={localBiz.address} />
            <Detail label="Logo method" value={localBiz.logoMethod} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 }}>Email address</div>
            {editEmail ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  value={emailVal}
                  onChange={(e) => setEmailVal(e.target.value)}
                  style={{
                    padding: "5px 9px", borderRadius: 6, border: "1.5px solid #e5e7eb",
                    fontSize: 13, outline: "none", width: 220,
                  }}
                />
                <ActionButton label="Save" onClick={saveEmail} busy={busy.email} color="#fff" bg="#991b1b" />
                <ActionButton label="Cancel" onClick={() => setEditEmail(false)} busy={false} />
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: localBiz.email ? "#374151" : "#9ca3af" }}>
                  {localBiz.email ?? "—"}
                </span>
                <ActionButton label="✎ Edit" onClick={() => { setEditEmail(true); setEmailVal(localBiz.email ?? ""); }} busy={false} />
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            <ActionButton
              label="🔍 Extract Logo"
              onClick={() => action("logo", `/admin/scraper/businesses/${localBiz.id}/logo`)}
              busy={busy.logo}
            />
            <ActionButton
              label="🎨 Generate Ad"
              onClick={() => action("ad", `/admin/scraper/businesses/${localBiz.id}/ad`)}
              busy={busy.ad}
            />
            <ActionButton
              label="✉ Draft Email"
              onClick={() => action("draft", `/admin/scraper/businesses/${localBiz.id}/email-draft`)}
              busy={busy.draft}
            />
            <ActionButton
              label="📤 Send Email"
              onClick={confirmSend}
              busy={busy.send}
              color={localBiz.emailStatus === "drafted" ? "#fff" : "#374151"}
              bg={localBiz.emailStatus === "drafted" ? "#991b1b" : "#fff"}
            />
            <ActionButton
              label="🚫 Opt-out"
              onClick={() => action("optout", `/admin/scraper/businesses/${localBiz.id}`, "PATCH", { emailStatus: "opted-out" })}
              busy={busy.optout}
            />
            <ActionButton label="🗑 Delete" onClick={confirmDelete} busy={busy.delete} color="#991b1b" />
          </div>

          {msg && (
            <div style={{ fontSize: 12, color: msg.ok ? "#15803d" : "#991b1b", marginBottom: 10 }}>
              {msg.ok ? "✅" : "❌"} {msg.text}
            </div>
          )}

          {localBiz.logoVisionNotes && (
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
              Logo notes: {localBiz.logoVisionNotes}
            </div>
          )}

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            {localBiz.logoUrl && localBiz.logoStatus === "usable" && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>LOGO</div>
                <img
                  src={localBiz.logoUrl}
                  alt="Logo"
                  style={{ maxWidth: 100, maxHeight: 80, objectFit: "contain", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", padding: 4 }}
                />
              </div>
            )}
            {localBiz.adImageUrl && localBiz.adStatus === "generated" && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>AD PREVIEW</div>
                <img
                  src={localBiz.adImageUrl}
                  alt="Ad"
                  style={{ maxWidth: 150, maxHeight: 200, objectFit: "contain", border: "1px solid #e5e7eb", borderRadius: 6 }}
                />
              </div>
            )}
            {localBiz.emailBodyHtml && (
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>
                  EMAIL DRAFT
                  {localBiz.emailSubject && <span style={{ fontWeight: 400, marginLeft: 6 }}>— {localBiz.emailSubject}</span>}
                </div>
                <div
                  style={{
                    border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden",
                    maxHeight: 300, overflowY: "auto",
                  }}
                  dangerouslySetInnerHTML={{ __html: localBiz.emailBodyHtml }}
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

// ── Jobs Tab ─────────────────────────────────────────────────────────────────

function JobsTab() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/admin/scraper/jobs");
      setJobs(Array.isArray(data) ? data : []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Recent Jobs</h3>
        <button
          onClick={load}
          style={{
            padding: "5px 12px", borderRadius: 6, border: "1.5px solid #e5e7eb",
            background: "#fff", fontSize: 12, cursor: "pointer", color: "#374151",
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {loading && jobs.length === 0 && <div style={{ color: "#9ca3af", textAlign: "center", padding: 40 }}>Loading…</div>}
      {jobs.length === 0 && !loading && (
        <div style={{ color: "#9ca3af", textAlign: "center", padding: 40, background: "#f9fafb", borderRadius: 12 }}>
          No jobs yet. Start a scrape to see activity here.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {jobs.map((job) => (
          <div key={job.id} style={{
            background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 16px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {job.status === "running" ? "⏳" : job.status === "done" ? "✅" : "❌"}{" "}
                  [{job.type}] {job.label}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                  Started {new Date(job.startedAt).toLocaleTimeString()}
                  {job.completedAt && ` · Completed ${new Date(job.completedAt).toLocaleTimeString()}`}
                </div>
              </div>
              <StatusBadge value={job.status} />
            </div>
            <div style={{ fontSize: 13, color: "#374151", display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span>Total: <strong>{job.total}</strong></span>
              <span>Processed: <strong>{job.processed}</strong></span>
              <span>New/OK: <strong>{job.newCount}</strong></span>
              <span>Skipped: <strong>{job.skippedDuplicates}</strong></span>
              <span>With email: <strong>{job.withEmail}</strong></span>
            </div>
            {job.error && <div style={{ marginTop: 6, color: "#991b1b", fontSize: 12 }}>Error: {job.error}</div>}
            {job.log && job.log.length > 0 && (
              <div style={{
                marginTop: 8, background: "#111", color: "#86efac",
                fontFamily: "monospace", fontSize: 11, padding: "6px 10px",
                borderRadius: 6, maxHeight: 80, overflowY: "auto",
              }}>
                {job.log.slice(-6).map((line, i) => <div key={i}>{line}</div>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────

function StatsBar() {
  const [stats, setStats] = useState(null);
  const token = localStorage.getItem("admin_token");

  useEffect(() => {
    if (!token) return;
    apiFetch("/admin/scraper/stats").then(setStats).catch(() => {});
    const t = setInterval(() => apiFetch("/admin/scraper/stats").then(setStats).catch(() => {}), 10000);
    return () => clearInterval(t);
  }, [token]);

  if (!stats) return null;
  const { total } = stats;

  const sent = stats.stats?.filter((s) => s.emailStatus === "sent").reduce((a, s) => a + s.count, 0) ?? 0;
  const drafted = stats.stats?.filter((s) => s.emailStatus === "drafted").reduce((a, s) => a + s.count, 0) ?? 0;
  const withEmail = stats.stats?.filter((s) => s.emailStatus !== "pending").reduce((a, s) => a + s.count, 0) ?? 0;
  const genAds = stats.stats?.filter((s) => s.adStatus === "generated").reduce((a, s) => a + s.count, 0) ?? 0;
  const usableLogo = stats.stats?.filter((s) => s.logoStatus === "usable").reduce((a, s) => a + s.count, 0) ?? 0;

  const items = [
    { label: "Total scraped", value: total, color: "#374151" },
    { label: "Usable logos", value: usableLogo, color: "#15803d" },
    { label: "Ads generated", value: genAds, color: "#1d4ed8" },
    { label: "Emails drafted", value: drafted, color: "#6d28d9" },
    { label: "Emails sent", value: sent, color: "#991b1b" },
  ];

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
      {items.map(({ label, value, color }) => (
        <div key={label} style={{
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
          padding: "12px 18px", minWidth: 100, textAlign: "center",
        }}>
          <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ScraperPage() {
  const [tab, setTab] = useState(0);

  return (
    <AdminShell>
      <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 900, color: "#111", fontFamily: "Georgia,serif" }}>
            🤖 Business Scraper
          </h2>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            Outscraper pipeline · Scrape → Logo → Ad → Email draft · Admin only — nothing auto-sends
          </p>
        </div>

        <StatsBar />

        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {TABS.map((label, i) => (
            <button
              key={i}
              onClick={() => setTab(i)}
              style={{
                padding: "8px 18px", borderRadius: 8, border: "none",
                background: tab === i ? "#991b1b" : "#f3f4f6",
                color: tab === i ? "#fff" : "#374151",
                fontWeight: tab === i ? 800 : 500, fontSize: 14, cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 0 && <ScrapeTab />}
        {tab === 1 && <BusinessesTab />}
        {tab === 2 && <JobsTab />}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </AdminShell>
  );
}
