import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";

const RED = "#7B1418";
const GOLD = "#d4a017";

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

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleNext = (e) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.email.trim()) {
      setError("Please fill in your name and email.");
      return;
    }
    if (!/.+@.+\..+/.test(form.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    onNext();
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px" }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 32,
        boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, color: "#111",
          fontFamily: "Georgia,serif", marginBottom: 6 }}>Tell us about yourself</h2>
        <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
          Next you'll pick your exclusive territory from the available counties in our network.
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
          {error && (
            <div style={{ background: "#fef2f2", color: "#991b1b",
              borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}
          <button type="submit"
            style={{ marginTop: 8, background: RED,
              color: "#fff", border: "none", borderRadius: 9,
              padding: "14px 0", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            See Available Territories →
          </button>
        </form>
      </div>
    </div>
  );
}

const STATUS_BADGE = {
  available: { label: "Available", bg: "#dcfce7", color: "#166534" },
  pending:   { label: "Pending",   bg: "#fef9c3", color: "#854d0e" },
  taken:     { label: "Taken",     bg: "#fee2e2", color: "#991b1b" },
};

function TerritoryRow({ territory, selected, onSelect }) {
  const badge = STATUS_BADGE[territory.status] ?? STATUS_BADGE.available;
  const isSelectable = territory.status === "available";
  const isSelected = selected?.id === territory.id;

  return (
    <label style={{
      display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 18px",
      borderRadius: 10, cursor: isSelectable ? "pointer" : "default",
      border: isSelected
        ? `2px solid ${RED}`
        : "2px solid #e5e7eb",
      background: isSelected ? `${RED}08` : isSelectable ? "#fff" : "#f9fafb",
      opacity: isSelectable ? 1 : 0.6,
      transition: "border-color 0.15s, background 0.15s",
    }}>
      <input
        type="radio"
        name="territory"
        value={territory.id}
        checked={isSelected}
        disabled={!isSelectable}
        onChange={() => isSelectable && onSelect(territory)}
        style={{ marginTop: 3, accentColor: RED, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          marginBottom: 4 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: "#111",
            fontFamily: "Georgia,serif" }}>
            {territory.name}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
            background: badge.bg, color: badge.color, textTransform: "uppercase",
            letterSpacing: 0.4,
          }}>
            {badge.label}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: "#666", marginBottom: 2 }}>
          <strong>Counties:</strong> {territory.counties.join(", ")}
        </div>
        <div style={{ fontSize: 12.5, color: "#666" }}>
          <strong>Households:</strong> ~{Number(territory.households).toLocaleString()}
        </div>
      </div>
    </label>
  );
}

const US_STATES = [
  { code: "GA", name: "Georgia" },
  { code: "AL", name: "Alabama" },
  { code: "FL", name: "Florida" },
  { code: "NC", name: "North Carolina" },
  { code: "SC", name: "South Carolina" },
  { code: "TN", name: "Tennessee" },
];

function Step2CountyPicker({ form, selectedTerritory, setSelectedTerritory, onBack, onNext }) {
  const [stateCode, setStateCode] = useState("GA");
  const [territories, setTerritories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [claimError, setClaimError] = useState(null);
  const [claiming, setClaiming] = useState(false);

  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

  const fetchTerritories = async (state) => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${baseUrl}/api/territories?state=${state}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setTerritories(data);
    } catch (err) {
      setFetchError(err.message || "Couldn't load territories. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTerritories(stateCode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateCode]);

  const handleStateChange = (e) => {
    setStateCode(e.target.value);
    setSelectedTerritory(null);
    setClaimError(null);
  };

  const handleClaim = async () => {
    if (!selectedTerritory) return;
    setClaiming(true);
    setClaimError(null);
    try {
      const res = await fetch(`${baseUrl}/api/territory-claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          territory_id: selectedTerritory.id,
          dealer_name:  form.name.trim(),
          dealer_email: form.email.trim().toLowerCase(),
          dealer_phone: form.phone.trim() || null,
        }),
      });
      if (res.status === 409) {
        setClaimError("Someone else just claimed that territory. Please pick another.");
        setSelectedTerritory(null);
        await fetchTerritories(stateCode);
        setClaiming(false);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      onNext();
    } catch (err) {
      setClaimError(err.message || "Something went wrong. Please try again.");
      setClaiming(false);
    }
  };

  const availableCount = territories.filter(t => t.status === "available").length;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px" }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 32,
        boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, color: "#111",
          fontFamily: "Georgia,serif", marginBottom: 6 }}>
          Pick your exclusive territory
        </h2>
        <p style={{ color: "#666", fontSize: 14, marginBottom: 20 }}>
          Each territory is a group of counties you'll serve exclusively. Select the area
          that's the best fit for your business.
        </p>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151",
            display: "block", marginBottom: 6 }}>State</label>
          <select
            value={stateCode}
            onChange={handleStateChange}
            style={{ ...inputStyle, width: "auto", minWidth: 200 }}
          >
            {US_STATES.map(s => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 48, color: "#666" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🗺️</div>
            <div>Loading territories…</div>
          </div>
        )}

        {fetchError && (
          <div style={{ background: "#fef2f2", color: "#991b1b",
            borderRadius: 10, padding: 16, fontSize: 14, marginBottom: 18 }}>
            <strong>Couldn't load territories:</strong> {fetchError}
            <button
              type="button"
              onClick={() => fetchTerritories(stateCode)}
              style={{ marginLeft: 12, fontSize: 13, fontWeight: 700,
                color: "#991b1b", background: "none", border: "none",
                cursor: "pointer", textDecoration: "underline" }}>
              Try again
            </button>
          </div>
        )}

        {!loading && !fetchError && territories.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#888",
            background: "#f9fafb", borderRadius: 10 }}>
            No territories found for {stateCode}. Check back soon.
          </div>
        )}

        {!loading && !fetchError && territories.length > 0 && (
          <>
            {availableCount === 0 && (
              <div style={{ background: "#fffbeb", color: "#92400e",
                border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px",
                fontSize: 13, marginBottom: 14 }}>
                All territories in {stateCode} are currently pending or taken.
                Check another state or contact us to be added to the waitlist.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {territories.map(t => (
                <TerritoryRow
                  key={t.id}
                  territory={t}
                  selected={selectedTerritory}
                  onSelect={setSelectedTerritory}
                />
              ))}
            </div>
          </>
        )}

        {claimError && (
          <div style={{ background: "#fef2f2", color: "#991b1b",
            borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 600,
            marginBottom: 14 }}>
            {claimError}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between",
          gap: 12, flexWrap: "wrap" }}>
          <button type="button" onClick={onBack}
            style={{ background: "#fff", color: "#374151", border: "1.5px solid #d1d5db",
              borderRadius: 9, padding: "12px 22px", fontSize: 14, fontWeight: 700,
              cursor: "pointer" }}>
            ← Back
          </button>
          <button
            type="button"
            onClick={handleClaim}
            disabled={!selectedTerritory || claiming}
            style={{
              background: !selectedTerritory || claiming ? "#d1d5db" : RED,
              color: !selectedTerritory || claiming ? "#9ca3af" : "#fff",
              border: "none", borderRadius: 9, padding: "12px 28px",
              fontSize: 15, fontWeight: 800,
              cursor: !selectedTerritory || claiming ? "default" : "pointer",
              transition: "background 0.15s",
            }}>
            {claiming ? "Claiming…" : "Looks Good → Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Step3Payment({ form, selectedTerritory, onBack }) {
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
          territoryId: selectedTerritory?.id,
          territoryName: selectedTerritory?.name,
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
      window.location.href = body.checkoutUrl;
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

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

        {selectedTerritory && (
          <div style={{ background: `${GOLD}11`, border: `1px solid ${GOLD}55`,
            borderRadius: 10, padding: 14, marginBottom: 22, fontSize: 13.5,
            color: "#5a4708", lineHeight: 1.55 }}>
            <strong>Your territory:</strong>{" "}
            {selectedTerritory.name}
            {selectedTerritory.counties?.length > 0 && (
              <span style={{ color: "#7a5f1a" }}>
                {" "}({selectedTerritory.counties.join(", ")})
              </span>
            )}
            {" "}— ~{Number(selectedTerritory.households).toLocaleString()} households.
            Once you pay, this territory is exclusively yours.
          </div>
        )}

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
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [selectedTerritory, setSelectedTerritory] = useState(null);

  const cancelled = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("cancelled") === "1";
  }, []);

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
        <Step2CountyPicker
          form={form}
          selectedTerritory={selectedTerritory}
          setSelectedTerritory={setSelectedTerritory}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <Step3Payment
          form={form}
          selectedTerritory={selectedTerritory}
          onBack={() => setStep(2)}
        />
      )}
    </PageShell>
  );
}
