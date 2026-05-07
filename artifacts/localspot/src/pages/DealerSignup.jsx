import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { buildTerritories, loadZips } from "../lib/territoryEngine";

const RED = "#7B1418";
const GOLD = "#d4a017";
const ZONE_COLORS = ["#7B1418", "#d4a017", "#15803d", "#1d4ed8", "#7c3aed", "#be185d"];

function ProgressBar({ step }) {
  const steps = ["Your Info", "Pick Your Territory", "Payment"];
  return (
    <div style={{ maxWidth: 720, margin: "0 auto 32px", padding: "0 16px",
      display: "flex", gap: 12, alignItems: "center" }}>
      {steps.map((label, i) => {
        const idx = i + 1;
        const active = idx === step;
        const done = idx < step;
        return (
          <div key={label} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%",
                background: done ? RED : active ? RED : "#e5e7eb",
                color: done || active ? "#fff" : "#6b7280",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 800, fontFamily: "sans-serif",
                flexShrink: 0,
              }}>
                {done ? "✓" : idx}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700,
                color: active ? "#111" : "#6b7280",
                fontFamily: "sans-serif", whiteSpace: "nowrap",
                overflow: "hidden", textOverflow: "ellipsis" }}>
                {label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2,
                background: idx < step ? RED : "#e5e7eb", minWidth: 12 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PageShell({ step, children }) {
  return (
    <div style={{ background: "#f9fafb", minHeight: "100vh",
      paddingBottom: 64, fontFamily: "sans-serif" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb",
        padding: "16px 24px", marginBottom: 32 }}>
        <Link href="/dealers" style={{ display: "flex", alignItems: "center", gap: 10,
          textDecoration: "none", color: "inherit", maxWidth: 1100, margin: "0 auto" }}>
          <span style={{ fontSize: 28 }}>📮</span>
          <div style={{ fontWeight: 900, fontSize: 22, color: "#111",
            fontFamily: "Georgia,serif" }}>My Town Postcard</div>
          <span style={{ marginLeft: 12, fontSize: 12, fontWeight: 800,
            color: "#8a6d11", background: `${GOLD}22`, padding: "3px 10px",
            borderRadius: 999, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Dealer Application
          </span>
        </Link>
      </header>
      <ProgressBar step={step} />
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "11px 14px", borderRadius: 8,
  border: "1.5px solid #d1d5db", fontSize: 14.5,
  outline: "none", boxSizing: "border-box", color: "#111",
  fontFamily: "sans-serif",
};

function Step1Info({ form, setForm, onNext }) {
  const [error, setError] = useState(null);
  const [validating, setValidating] = useState(false);

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleNext = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.email.trim() || !form.homeZip.trim()) {
      setError("Please fill in your name, email, and home ZIP.");
      return;
    }
    if (!/^\d{5}$/.test(form.homeZip.trim())) {
      setError("Please enter a valid 5-digit ZIP code.");
      return;
    }
    if (!/.+@.+\..+/.test(form.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    // Quickly verify the ZIP exists in our dataset before advancing — saves
    // the dealer from clicking through to step 2 only to see "ZIP not found".
    setValidating(true);
    try {
      const data = await loadZips();
      if (!data.byZip.has(form.homeZip.trim())) {
        setError(`We couldn't find ZIP ${form.homeZip} in our US dataset. Double-check the ZIP and try again.`);
        setValidating(false);
        return;
      }
    } catch (err) {
      setError(`Couldn't load our ZIP database — ${err.message}. Try again.`);
      setValidating(false);
      return;
    }
    setValidating(false);
    onNext();
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px" }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 32,
        boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, color: "#111",
          fontFamily: "Georgia,serif", marginBottom: 6 }}>Tell us about yourself</h2>
        <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
          We'll use your home ZIP to compute your 4 postcard territories on the next step.
        </p>
        <form onSubmit={handleNext} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151",
              display: "block", marginBottom: 4 }}>Full name *</label>
            <input style={inputStyle} required value={form.name} onChange={set("name")}
              placeholder="Jane Smith" />
          </div>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151",
              display: "block", marginBottom: 4 }}>Email *</label>
            <input style={inputStyle} required type="email" value={form.email}
              onChange={set("email")} placeholder="jane@example.com" />
          </div>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151",
              display: "block", marginBottom: 4 }}>Phone (optional)</label>
            <input style={inputStyle} type="tel" value={form.phone}
              onChange={set("phone")} placeholder="(555) 123-4567" />
          </div>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151",
              display: "block", marginBottom: 4 }}>Your home ZIP code *</label>
            <input style={inputStyle} required value={form.homeZip}
              onChange={set("homeZip")} placeholder="30523"
              inputMode="numeric" maxLength={5} pattern="\d{5}" />
            <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
              We'll cluster ~30 miles of nearby ZIPs into your 4 postcard zones.
            </div>
          </div>
          {error && (
            <div style={{ background: "#fef2f2", color: "#991b1b",
              borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={validating}
            style={{ marginTop: 8, background: validating ? "#999" : RED,
              color: "#fff", border: "none", borderRadius: 9,
              padding: "14px 0", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            {validating ? "Looking up your area…" : "See My Territories →"}
          </button>
        </form>
      </div>
    </div>
  );
}

function TerritoryCard({ territory, color }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12,
      border: `2px solid ${color}`, padding: 18,
      display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%",
          background: color, color: "#fff", display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 900 }}>
          {territory.territoryIndex + 1}
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#111",
          fontFamily: "Georgia,serif" }}>{territory.cityLabel}</div>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "#888", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: 0.4 }}>ZIPs</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#111" }}>
            {territory.zipCodes.length}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#888", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: 0.4 }}>Est. Households</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#111" }}>
            ~{territory.estimatedHouseholds.toLocaleString()}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5, marginTop: 2 }}>
        <strong>ZIPs:</strong>{" "}
        {territory.zipCodes.slice(0, 8).join(", ")}
        {territory.zipCodes.length > 8 && ` +${territory.zipCodes.length - 8} more`}
      </div>
    </div>
  );
}

function TerritoryMap({ territories }) {
  // Simple proportional scatter: project lat/lng to SVG using bbox of all
  // points + centroids. Color points by their cluster. Communicates the
  // shape of the assigned area without needing a real map tile provider.
  const points = useMemo(() => {
    const all = [];
    territories.forEach((t, i) => {
      // We don't keep individual lat/lngs of every ZIP here (only zipCodes
      // strings), so plot the centroid as the territory marker. Looks like
      // 4 dots — clean and readable.
      all.push({ lat: t.centerLat, lng: t.centerLng, color: ZONE_COLORS[i % ZONE_COLORS.length],
        index: i, label: t.cityLabel, size: t.estimatedHouseholds });
    });
    return all;
  }, [territories]);

  if (points.length === 0) return null;

  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const padLat = Math.max(0.05, (maxLat - minLat) * 0.4);
  const padLng = Math.max(0.05, (maxLng - minLng) * 0.4);
  const W = 360, H = 280;
  const project = (lat, lng) => {
    const x = ((lng - (minLng - padLng)) / ((maxLng + padLng) - (minLng - padLng))) * W;
    // Invert Y because lat increases northward (up) but SVG y increases down
    const y = H - ((lat - (minLat - padLat)) / ((maxLat + padLat) - (minLat - padLat))) * H;
    return { x, y };
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 460,
      background: "#fafafa", borderRadius: 12, border: "1px solid #e5e7eb" }}>
      {points.map((p, i) => {
        const { x, y } = project(p.lat, p.lng);
        const r = 22 + (p.size / 5000) * 18;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={r} fill={p.color} opacity="0.18" />
            <circle cx={x} cy={y} r={r * 0.6} fill={p.color} opacity="0.32" />
            <circle cx={x} cy={y} r={6} fill={p.color} stroke="#fff" strokeWidth="2" />
            <text x={x} y={y - r - 4} textAnchor="middle"
              style={{ fontFamily: "sans-serif", fontSize: 10.5, fontWeight: 800, fill: "#111" }}>
              {i + 1}. {p.label.length > 18 ? p.label.slice(0, 18) + "…" : p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Step2Territories({ form, territories, setTerritories, onBack, onNext, loading, error }) {
  const [reshuffling, setReshuffling] = useState(false);

  const reshuffle = async () => {
    setReshuffling(true);
    try {
      const seed = Math.floor(Math.random() * 1_000_000) + 1;
      const t = await buildTerritories(form.homeZip, { seed });
      setTerritories(t);
    } catch (err) {
      // Surface to the user via error prop in parent — but we already have
      // territories from initial render so just log and bail.
      console.error("Re-shuffle failed", err);
    }
    setReshuffling(false);
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px" }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 32,
        boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, color: "#111",
          fontFamily: "Georgia,serif", marginBottom: 6 }}>
          Your 4 proposed territories
        </h2>
        <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
          These are your 4 postcard zones, computed from ZIPs near{" "}
          <strong>{form.homeZip}</strong>. Each zone is one postcard run
          (~5,000 homes). Don't love the split? Re-shuffle to try a different layout.
        </p>

        {loading && (
          <div style={{ textAlign: "center", padding: 60, color: "#666" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🗺️</div>
            <div>Computing your territories…</div>
          </div>
        )}

        {error && (
          <div style={{ background: "#fef2f2", color: "#991b1b",
            borderRadius: 10, padding: 16, fontSize: 14, marginBottom: 18 }}>
            <strong>Couldn't build territories:</strong> {error}
          </div>
        )}

        {!loading && !error && territories.length > 0 && (
          <>
            <div style={{ display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 16, marginBottom: 24 }}>
              {territories.map((t, i) => (
                <TerritoryCard key={i} territory={t}
                  color={ZONE_COLORS[i % ZONE_COLORS.length]} />
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <TerritoryMap territories={territories} />
            </div>

            <div style={{ background: "#fafafa", borderRadius: 10, padding: 16,
              fontSize: 13.5, color: "#444", lineHeight: 1.6, marginBottom: 24 }}>
              <strong>Total reach:</strong>{" "}
              {territories.reduce((s, t) => s + t.estimatedHouseholds, 0).toLocaleString()}{" "}
              households across {territories.length} territories,{" "}
              covering{" "}
              {territories.reduce((s, t) => s + t.zipCodes.length, 0)} ZIP codes.
            </div>

            <div style={{ display: "flex", justifyContent: "space-between",
              gap: 12, flexWrap: "wrap" }}>
              <button type="button" onClick={onBack}
                style={{ background: "#fff", color: "#374151", border: "1.5px solid #d1d5db",
                  borderRadius: 9, padding: "12px 22px", fontSize: 14, fontWeight: 700,
                  cursor: "pointer" }}>
                ← Back
              </button>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" onClick={reshuffle} disabled={reshuffling}
                  style={{ background: "#fff", color: RED, border: `2px solid ${RED}`,
                    borderRadius: 9, padding: "12px 22px", fontSize: 14, fontWeight: 700,
                    cursor: "pointer" }}>
                  {reshuffling ? "Re-shuffling…" : "🔀 Re-shuffle"}
                </button>
                <button type="button" onClick={onNext}
                  style={{ background: RED, color: "#fff", border: "none",
                    borderRadius: 9, padding: "12px 28px", fontSize: 15, fontWeight: 800,
                    cursor: "pointer" }}>
                  Looks Good → Payment
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Step3Payment({ form, territories, onBack }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handlePay = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/api/dealers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || null,
          homeZip: form.homeZip.trim(),
          territories: territories.map(t => ({
            territoryIndex: t.territoryIndex,
            zipCodes: t.zipCodes,
            centerLat: t.centerLat,
            centerLng: t.centerLng,
            cityLabel: t.cityLabel,
            estimatedHouseholds: t.estimatedHouseholds,
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      const body = await res.json();
      if (!body.checkoutUrl) {
        throw new Error("No checkout URL returned by the server.");
      }
      // Hand off to Stripe Checkout. The success_url returns to /dealers/confirmation.
      window.location.href = body.checkoutUrl;
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const totalReach = territories.reduce((s, t) => s + t.estimatedHouseholds, 0);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px" }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 32,
        boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, color: "#111",
          fontFamily: "Georgia,serif", marginBottom: 6 }}>Confirm and pay</h2>
        <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
          You'll be redirected to Stripe to complete your secure payment.
        </p>

        <div style={{ background: "#fafafa", borderRadius: 10, padding: 18,
          marginBottom: 18 }}>
          <div style={{ fontWeight: 800, color: "#111", fontSize: 14, marginBottom: 10 }}>
            Order Summary
          </div>
          <div style={{ display: "flex", justifyContent: "space-between",
            fontSize: 14, color: "#374151", marginBottom: 8 }}>
            <span>Dealer setup fee (one-time)</span>
            <span style={{ fontWeight: 800 }}>$99.00</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between",
            fontSize: 14, color: "#374151", marginBottom: 12 }}>
            <span>Dealer subscription</span>
            <span style={{ fontWeight: 800 }}>$99.00 / month</span>
          </div>
          <div style={{ borderTop: "1px dashed #e5e7eb", paddingTop: 12,
            display: "flex", justifyContent: "space-between",
            fontSize: 16, color: "#111" }}>
            <span style={{ fontWeight: 800 }}>Charged today</span>
            <span style={{ fontWeight: 900, color: RED }}>$198.00</span>
          </div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
            Then $99 per month. Cancel anytime.
          </div>
        </div>

        <div style={{ background: `${GOLD}11`, border: `1px solid ${GOLD}55`,
          borderRadius: 10, padding: 14, marginBottom: 22, fontSize: 13.5,
          color: "#5a4708", lineHeight: 1.55 }}>
          <strong>You're locking in:</strong> {territories.length} exclusive
          territories covering ~{totalReach.toLocaleString()} households. Once
          you pay, no other dealer can be assigned to your ZIPs.
        </div>

        {error && (
          <div style={{ background: "#fef2f2", color: "#991b1b",
            borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 600,
            marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={onBack} disabled={submitting}
            style={{ background: "#fff", color: "#374151", border: "1.5px solid #d1d5db",
              borderRadius: 9, padding: "13px 22px", fontSize: 14, fontWeight: 700,
              cursor: "pointer" }}>
            ← Back
          </button>
          <button type="button" onClick={handlePay} disabled={submitting}
            style={{ flex: 1, minWidth: 220, background: submitting ? "#999" : RED,
              color: "#fff", border: "none", borderRadius: 9,
              padding: "13px 22px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            {submitting ? "Redirecting to Stripe…" : "Pay $198 & Continue →"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: "#888", marginTop: 16, textAlign: "center" }}>
          Secured by Stripe. Your card details never touch our servers.
        </div>
      </div>
    </div>
  );
}

export default function DealerSignup() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", email: "", phone: "", homeZip: "" });
  const [territories, setTerritories] = useState([]);
  const [tLoading, setTLoading] = useState(false);
  const [tError, setTError] = useState(null);

  // Detect ?cancelled=1 from a Stripe-cancelled checkout — show a soft note
  // that they can try again.
  const cancelled = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("cancelled") === "1";
  }, []);

  // Compute territories whenever we enter step 2 with a fresh ZIP.
  useEffect(() => {
    if (step !== 2) return;
    if (!form.homeZip) return;
    let cancel = false;
    setTLoading(true);
    setTError(null);
    buildTerritories(form.homeZip, { seed: 1 })
      .then(t => {
        if (!cancel) {
          setTerritories(t);
          setTLoading(false);
        }
      })
      .catch(err => {
        if (!cancel) {
          setTError(err.message);
          setTLoading(false);
        }
      });
    return () => { cancel = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, form.homeZip]);

  return (
    <PageShell step={step}>
      {cancelled && step === 1 && (
        <div style={{ maxWidth: 560, margin: "0 auto 18px", padding: "0 16px" }}>
          <div style={{ background: "#fffbeb", color: "#92400e",
            border: "1px solid #fde68a", borderRadius: 10, padding: 14,
            fontSize: 13.5, fontWeight: 600 }}>
            Your payment was cancelled. No charges were made — feel free to try again.
          </div>
        </div>
      )}
      {step === 1 && (
        <Step1Info form={form} setForm={setForm} onNext={() => setStep(2)} />
      )}
      {step === 2 && (
        <Step2Territories
          form={form} territories={territories}
          setTerritories={setTerritories}
          loading={tLoading} error={tError}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <Step3Payment
          form={form} territories={territories}
          onBack={() => setStep(2)}
        />
      )}
    </PageShell>
  );
}
