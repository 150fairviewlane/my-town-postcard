import { useState } from "react";
import { useSearch } from "wouter";

const inputStyle = {
  width: "100%", padding: "10px 14px", borderRadius: 8,
  border: "1.5px solid #e5e7eb", fontSize: 14, outline: "none",
  fontFamily: "system-ui, sans-serif", boxSizing: "border-box", background: "#fff",
};

const OPTIONS_LIST = [
  { id: "adjacent-town", label: "An adjacent town or territory" },
  { id: "later-date", label: "A later mailing date" },
];

export default function RequestOptionsPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialCategory = params.get("category") || "";
  const initialBizName = params.get("bizName") || "";

  const [form, setForm] = useState({
    ownerName: "",
    businessName: initialBizName,
    category: initialCategory,
    email: "",
    phone: "",
    options: [],
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const toggleOption = (id) => {
    setForm(f => ({
      ...f,
      options: f.options.includes(id) ? f.options.filter(o => o !== id) : [...f.options, id],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.businessName.trim()) errs.businessName = true;
    if (!form.email.trim()) errs.email = true;
    if (!form.category.trim()) errs.category = true;
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.ownerName.trim() || undefined,
          businessName: form.businessName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          industry: form.category.trim(),
          options: form.options,
        }),
      });
      if (!res.ok) throw new Error("failed");
      setSuccess(true);
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb", padding: 20, fontFamily: "system-ui, sans-serif" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: "52px 40px", maxWidth: 460, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h1 style={{ fontWeight: 900, fontSize: 26, color: "#111", margin: "0 0 12px", fontFamily: "Georgia, serif" }}>
            You're on the list!
          </h1>
          <p style={{ color: "#6b7280", fontSize: 15, lineHeight: 1.65, margin: "0 0 32px" }}>
            We'll reach out when a spot becomes available for{" "}
            <strong style={{ color: "#111" }}>{form.category || "your industry"}</strong>.
          </p>
          <a href="/" style={{ display: "inline-block", padding: "13px 32px", background: "#991b1b", color: "#fff", borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: "none", letterSpacing: 0.2 }}>
            Back to Postcard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", padding: "40px 20px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#6b7280", fontSize: 13, fontWeight: 600, textDecoration: "none", marginBottom: 28 }}>
          ← Back to Postcard
        </a>

        <div style={{ background: "#fff", borderRadius: 16, padding: "36px 32px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontWeight: 900, fontSize: 26, color: "#111", margin: "0 0 12px", fontFamily: "Georgia, serif" }}>
              Request More Options
            </h1>
            {initialCategory && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 99, padding: "4px 14px", fontSize: 13, color: "#991b1b", fontWeight: 600, marginBottom: 12 }}>
                {initialCategory} is currently taken
              </div>
            )}
            <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.65, margin: 0 }}>
              Leave your info and we'll reach out as soon as something works for your business.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                Your Name <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
              </label>
              <input
                value={form.ownerName}
                onChange={e => setForm(f => ({ ...f, ownerName: e.target.value }))}
                placeholder="Jane Smith"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: errors.businessName ? "#dc2626" : "#374151", display: "block", marginBottom: 4 }}>
                Business Name *
                {errors.businessName && <span style={{ fontWeight: 400, marginLeft: 6, color: "#dc2626" }}>Required</span>}
              </label>
              <input
                value={form.businessName}
                onChange={e => { setForm(f => ({ ...f, businessName: e.target.value })); if (e.target.value.trim()) setErrors(err => ({ ...err, businessName: false })); }}
                placeholder="Your Business Name"
                style={{ ...inputStyle, borderColor: errors.businessName ? "#dc2626" : "#e5e7eb", background: errors.businessName ? "#fef2f2" : "#fff" }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: errors.category ? "#dc2626" : "#374151", display: "block", marginBottom: 4 }}>
                Requested Category *
                {errors.category && <span style={{ fontWeight: 400, marginLeft: 6, color: "#dc2626" }}>Required</span>}
              </label>
              <input
                value={form.category}
                onChange={e => { setForm(f => ({ ...f, category: e.target.value })); if (e.target.value.trim()) setErrors(err => ({ ...err, category: false })); }}
                placeholder="e.g. Auto Repair"
                style={{ ...inputStyle, borderColor: errors.category ? "#dc2626" : "#e5e7eb", background: errors.category ? "#fef2f2" : "#fff" }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: errors.email ? "#dc2626" : "#374151", display: "block", marginBottom: 4 }}>
                Email Address *
                {errors.email && <span style={{ fontWeight: 400, marginLeft: 6, color: "#dc2626" }}>Required</span>}
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => { setForm(f => ({ ...f, email: e.target.value })); if (e.target.value.trim()) setErrors(err => ({ ...err, email: false })); }}
                placeholder="you@yourbusiness.com"
                style={{ ...inputStyle, borderColor: errors.email ? "#dc2626" : "#e5e7eb", background: errors.email ? "#fef2f2" : "#fff" }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                Phone <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
              </label>
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="(555) 123-4567"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 10 }}>
                I'm interested in… <span style={{ fontWeight: 400, color: "#9ca3af" }}>(select all that apply)</span>
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {OPTIONS_LIST.map(opt => (
                  <label
                    key={opt.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                      padding: "10px 14px", borderRadius: 8,
                      border: `1.5px solid ${form.options.includes(opt.id) ? "#991b1b" : "#e5e7eb"}`,
                      background: form.options.includes(opt.id) ? "#fef2f2" : "#fff",
                      transition: "all 0.15s",
                    }}>
                    <input
                      type="checkbox"
                      checked={form.options.includes(opt.id)}
                      onChange={() => toggleOption(opt.id)}
                      style={{ width: 16, height: 16, accentColor: "#991b1b", flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 14, color: "#111", fontWeight: form.options.includes(opt.id) ? 600 : 400 }}>
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {submitError && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", color: "#991b1b", fontSize: 13 }}>
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "14px 0", background: submitting ? "#6b7280" : "#991b1b",
                color: "#fff", border: "none", borderRadius: 10,
                fontSize: 15, fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer",
                letterSpacing: 0.3, opacity: submitting ? 0.75 : 1,
              }}>
              {submitting ? "Submitting…" : "Notify Me When Available"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
