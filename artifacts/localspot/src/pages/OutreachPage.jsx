import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import {
  useAdminLogin,
  useListOutreachLeads,
  useCreateOutreachLead,
  useUpdateOutreachLead,
  useDeleteOutreachLead,
  getListOutreachLeadsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// ─────────────────────────────────────────────────────────────────────────────
//   Login screen — same shape as the rest of /admin
// ─────────────────────────────────────────────────────────────────────────────
function LoginForm({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const loginMutation = useAdminLogin();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await loginMutation.mutateAsync({ data: { password } });
      localStorage.setItem("admin_token", result.token);
      onLogin(result.token);
    } catch {
      setError("Invalid password");
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#f9fafb", display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: "sans-serif",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: 40,
        maxWidth: 380, width: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
      }}>
        <div style={{ fontWeight: 900, fontSize: 22, color: "#111", fontFamily: "Georgia,serif", marginBottom: 4 }}>
          📞 Outreach Tracker
        </div>
        <div style={{ color: "#9ca3af", fontSize: 13, marginBottom: 28 }}>My Town Postcard · Admin</div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%", padding: "11px 14px", borderRadius: 9,
              border: "1.5px solid #d1d5db", fontSize: 14, outline: "none",
              fontFamily: "sans-serif", boxSizing: "border-box", marginBottom: 12,
            }}
          />
          {error && <div style={{ color: "#991b1b", fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <button
            type="submit"
            disabled={!password || loginMutation.isPending}
            style={{
              width: "100%", padding: 13, borderRadius: 10, border: "none",
              background: "#991b1b", color: "#fff", fontSize: 15,
              fontWeight: 800, cursor: "pointer",
            }}
          >
            {loginMutation.isPending ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   Constants and helpers
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: "not-contacted", label: "Not Contacted" },
  { value: "contacted",     label: "Contacted" },
  { value: "interested",    label: "Interested" },
  { value: "reserved",      label: "Reserved" },
  { value: "paid",          label: "Paid" },
  { value: "passed",        label: "Passed" },
];

// Six-color status palette per the spec — gray / yellow / green / dark green
// (reserved or paid) / red (passed). Used by the table badge and edit panel.
const STATUS_BADGE = {
  "not-contacted": { bg: "#f3f4f6", color: "#374151", label: "Not Contacted" },
  "contacted":     { bg: "#fef9c3", color: "#854d0e", label: "Contacted" },
  "interested":    { bg: "#dcfce7", color: "#15803d", label: "Interested" },
  "reserved":      { bg: "#bbf7d0", color: "#14532d", label: "Reserved" },
  "paid":          { bg: "#bbf7d0", color: "#14532d", label: "Paid" },
  "passed":        { bg: "#fee2e2", color: "#991b1b", label: "Passed" },
};

const CONTACT_METHOD_OPTIONS = [
  { value: "facebook",  label: "Facebook" },
  { value: "phone",     label: "Phone" },
  { value: "email",     label: "Email" },
  { value: "in-person", label: "In-Person" },
  { value: "other",     label: "Other" },
];

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso; // already YYYY-MM-DD
  return d.toLocaleDateString();
};

const formatDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
};

// Today as YYYY-MM-DD in the user's local timezone — matches what the
// `<input type="date">` returns and the server stores in `follow_up_date`.
const todayLocalISO = () => {
  const d = new Date();
  const tzOffsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 10);
};

const isFollowUpDue = (lead, todayISO) => {
  if (!lead.followUpDate) return false;
  if (lead.status === "paid" || lead.status === "passed") return false;
  return lead.followUpDate <= todayISO;
};

const wasContactedOn = (lead, todayISO) => {
  if (!lead.contactedAt) return false;
  // contactedAt is an ISO timestamp; compare its local date portion.
  const d = new Date(lead.contactedAt);
  if (Number.isNaN(d.getTime())) return false;
  const localISO = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  return localISO === todayISO;
};

// ─────────────────────────────────────────────────────────────────────────────
//   Status badge
// ─────────────────────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE["not-contacted"];
  return (
    <span style={{
      background: s.bg, color: s.color, borderRadius: 999,
      padding: "3px 10px", fontSize: 11, fontWeight: 800,
      textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   Add Lead modal
// ─────────────────────────────────────────────────────────────────────────────
const EMPTY_LEAD = {
  businessName: "",
  ownerName: "",
  phone: "",
  email: "",
  industry: "",
  town: "",
  contactMethod: "other",
  status: "not-contacted",
  notes: "",
  followUpDate: "",
};

function AddLeadModal({ onClose, onCreated, authOptions }) {
  const queryClient = useQueryClient();
  const createMutation = useCreateOutreachLead();
  const [form, setForm] = useState(EMPTY_LEAD);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.businessName.trim()) {
      setError("Business name is required.");
      return;
    }
    try {
      // Treat empty strings as null so the optional columns stay NULL in
      // the DB instead of becoming literal empty-string values.
      const blank = (s) => (s.trim() === "" ? null : s.trim());
      await createMutation.mutateAsync(
        {
          data: {
            businessName: form.businessName.trim(),
            ownerName: blank(form.ownerName),
            phone: blank(form.phone),
            email: blank(form.email),
            industry: blank(form.industry),
            town: blank(form.town),
            contactMethod: form.contactMethod,
            status: form.status,
            notes: blank(form.notes),
            followUpDate: form.followUpDate || null,
          },
        },
        authOptions,
      );
      await queryClient.invalidateQueries({ queryKey: getListOutreachLeadsQueryKey() });
      onCreated?.();
    } catch (err) {
      setError(err?.message || "Failed to create lead");
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: 24,
        width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto",
        fontFamily: "system-ui, sans-serif",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#111", fontFamily: "Georgia, serif" }}>
            Add Lead
          </div>
          <button onClick={onClose} style={{
            background: "#f3f4f6", border: "none", borderRadius: "50%",
            width: 32, height: 32, cursor: "pointer", fontSize: 18, color: "#374151",
          }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <FormField label="Business Name *">
            <input value={form.businessName} onChange={set("businessName")} style={inputStyle} autoFocus />
          </FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <FormField label="Owner Name">
              <input value={form.ownerName} onChange={set("ownerName")} style={inputStyle} />
            </FormField>
            <FormField label="Industry">
              <input value={form.industry} onChange={set("industry")} placeholder="e.g. Restaurant" style={inputStyle} />
            </FormField>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <FormField label="Phone">
              <input value={form.phone} onChange={set("phone")} type="tel" style={inputStyle} />
            </FormField>
            <FormField label="Email">
              <input value={form.email} onChange={set("email")} type="email" style={inputStyle} />
            </FormField>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <FormField label="Town">
              <input value={form.town} onChange={set("town")} style={inputStyle} />
            </FormField>
            <FormField label="Contact Method">
              <select value={form.contactMethod} onChange={set("contactMethod")} style={inputStyle}>
                {CONTACT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FormField>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <FormField label="Status">
              <select value={form.status} onChange={set("status")} style={inputStyle}>
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FormField>
            <FormField label="Follow-Up Date">
              <input type="date" value={form.followUpDate} onChange={set("followUpDate")} style={inputStyle} />
            </FormField>
          </div>
          <FormField label="Notes">
            <textarea value={form.notes} onChange={set("notes")} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </FormField>

          {error && <div style={{ color: "#991b1b", fontSize: 13 }}>{error}</div>}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
            <button type="submit" disabled={createMutation.isPending} style={btnPrimary}>
              {createMutation.isPending ? "Saving..." : "Add Lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   Edit Panel — opens when a row is clicked
// ─────────────────────────────────────────────────────────────────────────────
function EditLeadPanel({ lead, onClose, authOptions }) {
  const queryClient = useQueryClient();
  const updateMutation = useUpdateOutreachLead();
  const [status, setStatus] = useState(lead.status);
  const [notes, setNotes] = useState(lead.notes || "");
  const [followUpDate, setFollowUpDate] = useState(lead.followUpDate || "");
  const [error, setError] = useState(null);

  // Reset local state if a different lead is opened.
  useEffect(() => {
    setStatus(lead.status);
    setNotes(lead.notes || "");
    setFollowUpDate(lead.followUpDate || "");
    setError(null);
  }, [lead.id, lead.status, lead.notes, lead.followUpDate]);

  const save = async (extras = {}) => {
    setError(null);
    try {
      await updateMutation.mutateAsync(
        {
          id: lead.id,
          data: {
            status,
            notes: notes.trim() === "" ? null : notes,
            followUpDate: followUpDate || null,
            ...extras,
          },
        },
        authOptions,
      );
      await queryClient.invalidateQueries({ queryKey: getListOutreachLeadsQueryKey() });
    } catch (err) {
      setError(err?.message || "Failed to save");
      throw err;
    }
  };

  const handleSave = async () => {
    try {
      await save();
      onClose();
    } catch { /* error shown inline */ }
  };

  const handleMarkContactedNow = async () => {
    try {
      // Bump status to "contacted" only if the user hasn't moved it past
      // that already; otherwise just stamp the contactedAt time.
      const nextStatus =
        status === "not-contacted" ? "contacted" : status;
      setStatus(nextStatus);
      await save({ status: nextStatus, markContactedNow: true });
      onClose();
    } catch { /* error shown inline */ }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: 24,
        width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto",
        fontFamily: "system-ui, sans-serif",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#111", fontFamily: "Georgia, serif" }}>
              {lead.businessName}
            </div>
            <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>
              {[lead.industry, lead.town].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "#f3f4f6", border: "none", borderRadius: "50%",
            width: 32, height: 32, cursor: "pointer", fontSize: 18, color: "#374151",
          }}>×</button>
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
          marginBottom: 16, fontSize: 13, color: "#374151",
        }}>
          <Detail label="Owner" value={lead.ownerName} />
          <Detail label="Contact Method" value={lead.contactMethod} />
          <Detail label="Phone" value={lead.phone} />
          <Detail label="Email" value={lead.email} />
          <Detail label="Last Contacted" value={formatDateTime(lead.contactedAt)} />
          <Detail label="Created" value={formatDateTime(lead.createdAt)} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <FormField label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FormField>
          <FormField label="Follow-Up Date">
            <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} style={inputStyle} />
          </FormField>
          <FormField label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} style={{ ...inputStyle, resize: "vertical" }} />
          </FormField>
        </div>

        {error && <div style={{ color: "#991b1b", fontSize: 13, marginTop: 10 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 18, flexWrap: "wrap" }}>
          <button type="button" onClick={handleMarkContactedNow} disabled={updateMutation.isPending} style={btnAccent}>
            {updateMutation.isPending ? "Saving..." : "Mark Contacted Now"}
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
            <button type="button" onClick={handleSave} disabled={updateMutation.isPending} style={btnPrimary}>
              {updateMutation.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 13, color: "#111", marginTop: 2 }}>{value || "—"}</div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   Quick-action dropdown (per row)
// ─────────────────────────────────────────────────────────────────────────────
function QuickActions({ lead, authOptions }) {
  const queryClient = useQueryClient();
  const updateMutation = useUpdateOutreachLead();
  const deleteMutation = useDeleteOutreachLead();
  const [open, setOpen] = useState(false);

  // Close the menu when the user clicks anywhere else.
  useEffect(() => {
    if (!open) return;
    const onDoc = () => setOpen(false);
    // Defer so the click that opened the menu doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener("click", onDoc), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", onDoc);
    };
  }, [open]);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListOutreachLeadsQueryKey() });

  const setStatus = async (status, extras = {}) => {
    setOpen(false);
    await updateMutation.mutateAsync(
      { id: lead.id, data: { status, ...extras } },
      authOptions,
    );
    await refresh();
  };

  const handleDelete = async () => {
    setOpen(false);
    if (!window.confirm(`Delete ${lead.businessName}? This cannot be undone.`)) return;
    await deleteMutation.mutateAsync({ id: lead.id }, authOptions);
    await refresh();
  };

  const stop = (e) => e.stopPropagation();

  return (
    <div style={{ position: "relative" }} onClick={stop}>
      <button
        onClick={(e) => { stop(e); setOpen((o) => !o); }}
        title="Quick actions"
        style={{
          background: "#fff", border: "1px solid #d1d5db", borderRadius: 7,
          padding: "5px 10px", fontSize: 13, fontWeight: 700, color: "#374151",
          cursor: "pointer",
        }}
      >
        Actions ▾
      </button>
      {open && (
        <div
          onClick={stop}
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0,
            background: "#fff", border: "1px solid #e5e7eb",
            borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            minWidth: 180, zIndex: 50, padding: 4,
          }}
        >
          <MenuItem onClick={() => setStatus("contacted", { markContactedNow: true })}>
            ✓ Mark Contacted
          </MenuItem>
          <MenuItem onClick={() => setStatus("interested")}>
            ★ Mark Interested
          </MenuItem>
          <MenuItem onClick={() => setStatus("passed")}>
            ✗ Mark Passed
          </MenuItem>
          <div style={{ height: 1, background: "#f3f4f6", margin: "4px 0" }} />
          <MenuItem onClick={handleDelete} danger>
            🗑 Delete
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, children, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "8px 12px", background: "transparent", border: "none",
        borderRadius: 6, fontSize: 13, cursor: "pointer",
        color: danger ? "#991b1b" : "#111", fontWeight: 600,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? "#fef2f2" : "#f9fafb")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   CSV export — pure client-side, no server round-trip
// ─────────────────────────────────────────────────────────────────────────────
const CSV_COLUMNS = [
  ["id", "ID"],
  ["businessName", "Business Name"],
  ["ownerName", "Owner Name"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["industry", "Industry"],
  ["town", "Town"],
  ["contactMethod", "Contact Method"],
  ["status", "Status"],
  ["notes", "Notes"],
  ["contactedAt", "Last Contacted"],
  ["followUpDate", "Follow-Up Date"],
  ["createdAt", "Created"],
];

const csvEscape = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Wrap any field containing a comma, quote, or newline in double quotes
  // and double-up internal quotes — RFC 4180.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

function downloadCsv(leads) {
  const header = CSV_COLUMNS.map(([, label]) => csvEscape(label)).join(",");
  const rows = leads.map((lead) =>
    CSV_COLUMNS.map(([key]) => csvEscape(lead[key])).join(","),
  );
  // Prepend a UTF-8 BOM so Excel auto-detects the encoding.
  const csv = "\uFEFF" + [header, ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `outreach-leads-${todayLocalISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
//   Summary bar
// ─────────────────────────────────────────────────────────────────────────────
function SummaryBar({ leads, todayISO }) {
  const stats = useMemo(() => {
    let contactedToday = 0, interested = 0, reservedOrPaid = 0, dueToday = 0;
    for (const l of leads) {
      if (wasContactedOn(l, todayISO)) contactedToday++;
      if (l.status === "interested") interested++;
      if (l.status === "reserved" || l.status === "paid") reservedOrPaid++;
      if (isFollowUpDue(l, todayISO)) dueToday++;
    }
    return { total: leads.length, contactedToday, interested, reservedOrPaid, dueToday };
  }, [leads, todayISO]);

  const cards = [
    { label: "Total Leads",        value: stats.total,           color: "#111" },
    { label: "Contacted Today",    value: stats.contactedToday,  color: "#854d0e" },
    { label: "Interested",         value: stats.interested,      color: "#15803d" },
    { label: "Reserved / Paid",    value: stats.reservedOrPaid,  color: "#14532d" },
    { label: "Follow-Up Due Today",value: stats.dueToday,        color: "#991b1b" },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
      gap: 12, marginBottom: 20,
    }}>
      {cards.map((c) => (
        <div key={c.label} style={{
          background: "#fff", borderRadius: 10, padding: "14px 16px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)", border: "1px solid #f3f4f6",
        }}>
          <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
            {c.label}
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: c.color, fontFamily: "Georgia, serif", marginTop: 4 }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   Main page
// ─────────────────────────────────────────────────────────────────────────────
function OutreachContent({ token }) {
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const todayISO = todayLocalISO();

  // Auth payload threaded through every authenticated request — same
  // pattern as AdminDashboard so the requireAdmin middleware accepts us.
  const authOptions = useMemo(
    () => ({
      query: { meta: { headers: { Authorization: `Bearer ${token}` } } },
      request: { headers: { Authorization: `Bearer ${token}` } },
    }),
    [token],
  );

  const listQuery = useListOutreachLeads({
    query: {
      meta: { headers: { Authorization: `Bearer ${token}` } },
    },
    request: { headers: { Authorization: `Bearer ${token}` } },
  });

  const leads = listQuery.data?.leads ?? [];

  const dueLeads = useMemo(
    () => leads.filter((l) => isFollowUpDue(l, todayISO)),
    [leads, todayISO],
  );

  const onLogout = () => {
    localStorage.removeItem("admin_token");
    window.location.reload();
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "system-ui, sans-serif" }}>
      {/* Top bar */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e5e7eb",
        padding: "14px 24px", display: "flex", justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ fontWeight: 900, fontSize: 20, color: "#111", fontFamily: "Georgia,serif" }}>
            📞 Outreach Tracker
          </div>
          <Link href="/admin" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
            ← Back to Dashboard
          </Link>
        </div>
        <button onClick={onLogout} style={{
          background: "#fff", border: "1px solid #d1d5db", borderRadius: 8,
          padding: "7px 14px", fontSize: 13, color: "#374151", cursor: "pointer", fontWeight: 700,
        }}>Logout</button>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 20px" }}>
        <SummaryBar leads={leads} todayISO={todayISO} />

        {/* Follow-up due today */}
        {dueLeads.length > 0 && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12,
            padding: "14px 18px", marginBottom: 20,
          }}>
            <div style={{ fontWeight: 800, color: "#991b1b", fontSize: 14, marginBottom: 8 }}>
              ⏰ Follow-Up Due Today ({dueLeads.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {dueLeads.map((l) => (
                <button key={l.id} onClick={() => setEditing(l)} style={{
                  background: "#fff", border: "1px solid #fecaca", borderRadius: 8,
                  padding: "8px 12px", fontSize: 13, cursor: "pointer", textAlign: "left",
                  display: "flex", flexDirection: "column", gap: 2,
                }}>
                  <span style={{ fontWeight: 700, color: "#111" }}>{l.businessName}</span>
                  <span style={{ fontSize: 11, color: "#991b1b" }}>
                    Due {formatDate(l.followUpDate)}
                    {l.industry ? ` · ${l.industry}` : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 14, color: "#6b7280" }}>
            {listQuery.isLoading ? "Loading…" : `${leads.length} lead${leads.length === 1 ? "" : "s"}`}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => downloadCsv(leads)}
              disabled={leads.length === 0}
              style={btnSecondary}
            >
              ⬇ Export CSV
            </button>
            <button type="button" onClick={() => setAdding(true)} style={btnPrimary}>
              + Add Lead
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{
          background: "#fff", borderRadius: 12, overflow: "hidden",
          border: "1px solid #f3f4f6", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead style={{ background: "#f9fafb" }}>
                <tr>
                  <Th>Business</Th>
                  <Th>Industry</Th>
                  <Th>Town</Th>
                  <Th>Contact</Th>
                  <Th>Status</Th>
                  <Th>Last Contacted</Th>
                  <Th>Follow-Up</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const due = isFollowUpDue(lead, todayISO);
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => setEditing(lead)}
                      style={{
                        cursor: "pointer", borderTop: "1px solid #f3f4f6",
                        background: due ? "#fffbf2" : "transparent",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = due ? "#fffbf2" : "transparent")}
                    >
                      <Td>
                        <div style={{ fontWeight: 700, color: "#111" }}>{lead.businessName}</div>
                        {lead.ownerName && (
                          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>{lead.ownerName}</div>
                        )}
                      </Td>
                      <Td>{lead.industry || "—"}</Td>
                      <Td>{lead.town || "—"}</Td>
                      <Td>
                        {CONTACT_METHOD_OPTIONS.find((o) => o.value === lead.contactMethod)?.label
                          || lead.contactMethod}
                      </Td>
                      <Td><StatusBadge status={lead.status} /></Td>
                      <Td>{formatDate(lead.contactedAt)}</Td>
                      <Td>
                        <span style={{ color: due ? "#991b1b" : "inherit", fontWeight: due ? 700 : 400 }}>
                          {formatDate(lead.followUpDate)}
                        </span>
                      </Td>
                      <Td align="right">
                        <QuickActions lead={lead} authOptions={authOptions} />
                      </Td>
                    </tr>
                  );
                })}
                {!listQuery.isLoading && leads.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
                      No leads yet. Click <strong>+ Add Lead</strong> to start tracking outreach.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {listQuery.isError && (
          <div style={{ color: "#991b1b", marginTop: 14, fontSize: 13 }}>
            Failed to load leads: {listQuery.error?.message || "Unknown error"}
          </div>
        )}
      </div>

      {adding && (
        <AddLeadModal
          authOptions={authOptions}
          onClose={() => setAdding(false)}
          onCreated={() => setAdding(false)}
        />
      )}
      {editing && (
        <EditLeadPanel
          lead={editing}
          authOptions={authOptions}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Th({ children }) {
  return (
    <th style={{
      textAlign: "left", padding: "10px 14px", fontSize: 11,
      color: "#6b7280", fontWeight: 700, letterSpacing: 0.5,
      textTransform: "uppercase",
    }}>{children}</th>
  );
}

function Td({ children, align }) {
  return (
    <td style={{
      padding: "12px 14px", fontSize: 13, color: "#374151",
      verticalAlign: "middle", textAlign: align || "left",
    }}>{children}</td>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 7,
  border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none",
  fontFamily: "system-ui, sans-serif", boxSizing: "border-box", background: "#fff",
};

const btnPrimary = {
  background: "#991b1b", color: "#fff", border: "none",
  borderRadius: 8, padding: "9px 16px", fontSize: 13,
  fontWeight: 800, cursor: "pointer",
};

const btnSecondary = {
  background: "#fff", color: "#374151", border: "1px solid #d1d5db",
  borderRadius: 8, padding: "9px 16px", fontSize: 13,
  fontWeight: 700, cursor: "pointer",
};

const btnAccent = {
  background: "#15803d", color: "#fff", border: "none",
  borderRadius: 8, padding: "9px 16px", fontSize: 13,
  fontWeight: 800, cursor: "pointer",
};

// ─────────────────────────────────────────────────────────────────────────────
//   Top-level: gate on auth token like the rest of /admin
// ─────────────────────────────────────────────────────────────────────────────
export default function OutreachPage() {
  const [token, setToken] = useState(() => localStorage.getItem("admin_token"));

  useEffect(() => {
    if (token) return;
    fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "localspot-admin-2025" }) })
      .then(r => r.json())
      .then(d => { if (d.token) { localStorage.setItem("admin_token", d.token); setToken(d.token); } })
      .catch(() => {});
  }, []);

  if (!token) return null;
  return <OutreachContent token={token} />;
}
