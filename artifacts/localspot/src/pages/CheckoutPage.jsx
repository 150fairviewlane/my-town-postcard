import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import {
  useCreatePaymentIntent,
  useConfirmPayment,
  useGetSpot,
} from "@workspace/api-client-react";
import ReservationCountdown from "../components/ReservationCountdown";
import {
  loadReservation,
  clearReservation,
} from "../lib/reservationStorage";
import { PLANS, monthlyCents, totalCents, formatUsd, formatUsdCents } from "../lib/subscriptionPlans";

// The publishable key is served by the API (so a single Replit Stripe
// integration drives both server-side payments and Stripe.js on the
// frontend, with no env vars to wire up). We fetch it once per page load
// and memoize the resulting Stripe.js promise so <Elements> doesn't
// reinitialize on every render.
let cachedStripePromise = null;
function getStripePromise() {
  if (cachedStripePromise) return cachedStripePromise;
  cachedStripePromise = (async () => {
    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    const url = `${base}/api/config/stripe-publishable-key`;
    let res;
    try {
      res = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (err) {
      throw new Error(
        "Could not reach the payments service. Check your connection and try again.",
      );
    }
    if (!res.ok) {
      let msg = `Payments service returned ${res.status}.`;
      try {
        const body = await res.json();
        if (body?.error) msg = body.error;
      } catch {
        /* fall through */
      }
      throw new Error(msg);
    }
    const body = await res.json();
    const pk = body?.publishableKey;
    if (!pk || !/^pk_(test|live)_/.test(pk)) {
      throw new Error(
        "Payments service returned an invalid publishable key. Contact the site owner.",
      );
    }
    const stripe = await loadStripe(pk);
    if (!stripe) {
      throw new Error("Stripe.js failed to load. Check that your browser allows js.stripe.com.");
    }
    return stripe;
  })().catch((err) => {
    // Reset cache so a future visit to /checkout will retry, but keep this
    // promise rejecting so the in-flight render shows the error UI.
    cachedStripePromise = null;
    throw err;
  });
  // Re-cache the (now-thrown) promise lookup-side so all consumers in the
  // current page session see the same rejection without refetching.
  const p = cachedStripePromise;
  return p;
}

// Display labels for each spot size. Actual price is read from the
// PaymentIntent (server-authoritative) so this is just for the size name.
const SIZE_LABELS = {
  xl: "Extra Large",
  large: "Large",
  medium: "Medium",
  small: "Small",
};

function CheckoutForm({ spotId, clientSecret, amount, size, businessName, expiresAt }) {
  const stripe = useStripe();
  const elements = useElements();
  const [, navigate] = useLocation();
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [holdExpired, setHoldExpired] = useState(false);
  const confirmMutation = useConfirmPayment();

  // When the 30-min hold lapses the server has already (or will shortly)
  // free the row. Mark the form disabled and show the expired banner so the
  // customer sees what happened — but do NOT auto-redirect. They can click
  // "Choose a different spot" themselves when ready; force-navigating after a
  // timeout loses any work they had in progress on this page.
  const handleHoldExpired = () => {
    setHoldExpired(true);
    clearReservation(spotId);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    let result;
    try {
      result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: elements.getElement(CardElement) },
      });
    } catch (err) {
      setError(err?.message || "Could not reach Stripe. Please try again.");
      setProcessing(false);
      return;
    }

    if (result.error) {
      setError(result.error.message);
      setProcessing(false);
      return;
    }

    try {
      await confirmMutation.mutateAsync({
        data: {
          paymentIntentId: result.paymentIntent.id,
          spotId: parseInt(spotId),
        },
      });
      // Spot is paid; the hold no longer applies, so drop the localStorage
      // entry to keep the picker's "resume checkout" banner from sticking
      // around for a now-paid spot.
      clearReservation(spotId);
      // Send the customer to the confirmation page that shows their
      // business name, spot size, and price paid.
      navigate(`/confirmation/${spotId}`);
    } catch (err) {
      const apiMsg =
        (err?.data && typeof err.data === "object" && err.data.error) ||
        err?.message ||
        "Payment confirmation failed. Please contact support — we will reconcile your payment manually.";
      setError(apiMsg);
      setProcessing(false);
    }
  };

  const sizeLabel = SIZE_LABELS[size] || "Ad";

  return (
    <form onSubmit={handleSubmit} style={{ fontFamily: "sans-serif" }}>
      <div style={{ marginBottom: 20 }}>
        <ReservationCountdown
          expiresAt={expiresAt}
          onExpired={handleHoldExpired}
        />
        <div style={{ background: "#f8fafc", borderRadius: 10, padding: "16px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Order Summary</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#111" }}>{sizeLabel} Ad Spot</div>
          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>{businessName}</div>
          <div style={{ fontWeight: 900, fontSize: 28, color: "#991b1b", marginTop: 8 }}>${(amount / 100).toFixed(2)}</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>Reaches 5,000 local homes via USPS EDDM</div>
        </div>

        <div style={{ border: "1.5px solid #d1d5db", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
          <CardElement options={{
            style: {
              base: { fontSize: "15px", color: "#111", "::placeholder": { color: "#9ca3af" } },
              invalid: { color: "#991b1b" },
            },
          }} />
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 14, color: "#991b1b", fontSize: 13 }}>
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              style={{ marginLeft: 8, color: "#991b1b", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontSize: 13 }}>
              Try again
            </button>
          </div>
        )}
      </div>

      {holdExpired ? (
        <div style={{ textAlign: "center" }}>
          <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 10, padding: "14px 18px", marginBottom: 14, color: "#92400e", fontSize: 13, lineHeight: 1.5 }}>
            <strong>Your 30-minute hold has expired.</strong> This spot has been released back to the pool.
          </div>
          <button
            type="button"
            onClick={() => navigate("/")}
            style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: "#111", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            ← Choose a different spot
          </button>
        </div>
      ) : (
        <>
          <button
            type="submit"
            disabled={processing || !stripe}
            style={{
              width: "100%", padding: 15, borderRadius: 12, border: "none",
              background: processing ? "#d1d5db" : "#991b1b",
              color: "#fff", fontSize: 16, fontWeight: 800,
              cursor: processing ? "not-allowed" : "pointer",
            }}>
            {processing ? "Processing..." : `Pay $${(amount / 100).toFixed(2)}`}
          </button>
          <p style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", marginTop: 10 }}>
            Secured by Stripe · Your card is charged now
          </p>
        </>
      )}
    </form>
  );
}

function CheckoutShell({ children }) {
  const [, navigate] = useLocation();
  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 14 }}>← Back</button>
        <div style={{ fontWeight: 900, fontSize: 18, color: "#111", fontFamily: "Georgia,serif" }}>📮 My Town Postcard</div>
      </div>

      <div style={{
        maxWidth: 480, margin: "0 auto",
        padding: "clamp(20px, 5vw, 48px) clamp(14px, 4vw, 20px) 48px",
      }}>
        <div style={{
          background: "#fff", borderRadius: 16,
          padding: "clamp(20px, 5vw, 32px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}>
          <h1 style={{ fontSize: "clamp(20px, 5vw, 24px)", fontWeight: 900, color: "#111", margin: "0 0 8px", fontFamily: "Georgia,serif" }}>Complete Your Payment</h1>
          <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 24 }}>You're one step away from securing your spot.</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function ErrorPanel({ title, message, actionLabel = null, onAction = null }) {
  return (
    <div
      style={{
        background: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: 10,
        padding: 18,
        color: "#991b1b",
        textAlign: "left",
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 15 }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: "#7f1d1d" }}>{message}</div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            marginTop: 14, padding: "8px 16px", borderRadius: 8, border: "none",
            background: "#991b1b", color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: "pointer",
          }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function PlanSelector({ size, value, onChange }) {
  return (
    <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#374151", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Choose your commitment
      </div>
      {PLANS.map((p) => {
        const monthly = monthlyCents(size, p.key);
        const total = totalCents(size, p.key);
        const cph = monthly / 5000; // cost per household per issue
        const selected = value === p.key;
        return (
          <button
            type="button"
            key={p.key}
            onClick={() => onChange(p.key)}
            style={{
              textAlign: "left",
              border: selected ? "2px solid #991b1b" : "1.5px solid #e5e7eb",
              background: selected ? "#fef2f2" : p.highlight ? "#fffbeb" : "#fff",
              padding: "14px 16px",
              borderRadius: 12,
              cursor: "pointer",
              position: "relative",
              transition: "all 0.15s",
            }}
          >
            {p.highlight && (
              <span style={{
                position: "absolute", top: -10, right: 12,
                background: "#d97706", color: "#fff", fontSize: 10,
                fontWeight: 800, padding: "2px 8px", borderRadius: 999,
                textTransform: "uppercase", letterSpacing: 0.5,
              }}>
                Best Value
              </span>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#111" }}>{p.label}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{p.subtitle}</div>
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: "#111" }}>
                  {formatUsd(monthly)}
                  <span style={{ color: "#6b7280", fontWeight: 600, fontSize: 12 }}>
                    {p.totalIssues > 1 ? "/issue" : ""}
                  </span>
                </div>
                {p.totalIssues > 1 && (
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    {formatUsd(total)} total · ≈ {formatUsdCents(cph)} / home
                  </div>
                )}
                {p.totalIssues === 1 && (
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    ≈ {formatUsdCents(cph)} / home
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
      <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.4 }}>
        Multi-issue plans are billed per issue when each mailing goes to print — no monthly charges between mailings. Your card is saved for automatic billing on subsequent issues. No auto-renewal after your commitment ends.
      </div>
    </div>
  );
}

function SubscriptionRedirect({ spotId, size, planKey, onError }) {
  const [busy, setBusy] = useState(false);
  const monthly = monthlyCents(size, planKey);
  const total = totalCents(size, planKey);
  const plan = PLANS.find((p) => p.key === planKey);
  const handleClick = async () => {
    setBusy(true);
    try {
      const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/checkout/create-subscription-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spotId: parseInt(spotId, 10), commitmentType: planKey }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `Server returned ${res.status}`);
      if (!body?.checkoutUrl) throw new Error("Stripe did not return a Checkout URL.");
      window.location.href = body.checkoutUrl;
    } catch (err) {
      setBusy(false);
      onError(err?.message || "Could not start subscription checkout.");
    }
  };
  return (
    <div>
      <div style={{
        background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 10,
        padding: 16, marginBottom: 16,
      }}>
        <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, marginBottom: 6 }}>
          Order Summary
        </div>
        <div style={{ fontSize: 14, color: "#111", marginBottom: 4 }}>
          <strong>{plan?.label}</strong> · {plan?.totalIssues} issues · {SIZE_LABELS[size] ?? size.toUpperCase()}
        </div>
        <div style={{ fontSize: 14, color: "#111" }}>
          {formatUsd(monthly)}/mo
        </div>
      </div>
      <button
        onClick={handleClick}
        disabled={busy}
        style={{
          width: "100%", padding: 14, borderRadius: 10, border: "none",
          background: busy ? "#9ca3af" : "#991b1b", color: "#fff",
          fontSize: 15, fontWeight: 800, cursor: busy ? "wait" : "pointer",
        }}
      >
        {busy ? "Redirecting to Stripe…" : `Continue to Stripe Checkout →`}
      </button>
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 10, textAlign: "center" }}>
        Secured by Stripe · Your card is charged monthly for {plan?.totalIssues} months, then stops automatically.
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  const { spotId } = useParams();
  const [, navigate] = useLocation();
  const [intentData, setIntentData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [stripeLoadError, setStripeLoadError] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState("single");
  const [subError, setSubError] = useState(null);
  const createIntentMutation = useCreatePaymentIntent();

  // Pull the spot record so we have the authoritative expires_at to drive
  // the countdown — falling back to localStorage if the API is slow or
  // can't be reached.
  const numericSpotId = spotId ? parseInt(spotId, 10) : NaN;
  const { data: spotData } = useGetSpot(
    Number.isFinite(numericSpotId) ? numericSpotId : 0,
    { query: { enabled: Number.isFinite(numericSpotId) } },
  );
  const stored = Number.isFinite(numericSpotId)
    ? loadReservation(numericSpotId)
    : null;
  const expiresAt = spotData?.expiresAt ?? stored?.expiresAt ?? null;

  // Resolve the Stripe.js promise eagerly so a missing/broken key surfaces
  // a friendly error here instead of crashing somewhere inside <Elements>.
  const stripePromise = useMemo(() => getStripePromise(), []);
  useEffect(() => {
    let cancelled = false;
    stripePromise.catch((err) => {
      if (cancelled) return;
      setStripeLoadError(err?.message || "Could not load the payment form.");
    });
    return () => { cancelled = true; };
  }, [stripePromise]);

  // Run exactly once per spotId. The mutation hook is stable and we don't
  // want to retrigger when its identity changes between renders.
  useEffect(() => {
    if (!spotId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await createIntentMutation.mutateAsync({
          data: { spotId: parseInt(spotId) },
        });
        if (!cancelled) setIntentData(result);
      } catch (err) {
        if (!cancelled) {
          const status = err?.status;
          let msg = err?.data?.error || err?.message;
          if (status === 409) {
            msg = "This spot has already been booked by another customer. Please go back and choose a different spot.";
          } else if (status === 503) {
            msg =
              msg ||
              "Payments aren't turned on yet on this site. Please contact the site owner.";
          }
          if (!msg) {
            msg = "Could not start payment. Please go back and try again.";
          }
          setLoadError({ message: msg, isPaid: status === 409 });
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotId]);

  // Stripe.js failed to load — usually because VITE_STRIPE_PUBLISHABLE_KEY
  // is missing or invalid. Render a clear message rather than a blank
  // screen.
  if (stripeLoadError) {
    return (
      <CheckoutShell>
        <ErrorPanel title="Payments are not configured" message={stripeLoadError} />
      </CheckoutShell>
    );
  }

  if (!Number.isFinite(numericSpotId)) {
    return (
      <CheckoutShell>
        <ErrorPanel
          title="Invalid checkout link"
          message="This checkout URL doesn't reference a valid spot. Go back to the picker and reserve a spot to start over."
        />
      </CheckoutShell>
    );
  }

  return (
    <CheckoutShell>
      {!intentData && !loadError && (
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
          Setting up payment…
        </div>
      )}

      {loadError && (
        <ErrorPanel
          title={loadError.isPaid ? "Spot already booked" : "Could not load payment"}
          message={loadError.message}
          actionLabel={loadError.isPaid ? "Browse available spots" : null}
          onAction={loadError.isPaid ? () => navigate("/") : null}
        />
      )}

      {intentData && (
        <>
          <PlanSelector
            size={intentData.size}
            value={selectedPlan}
            onChange={(p) => { setSelectedPlan(p); setSubError(null); }}
          />
          {subError && (
            <div style={{ marginBottom: 14 }}>
              <ErrorPanel title="Could not start subscription" message={subError} />
            </div>
          )}
          {selectedPlan === "single" ? (
            <Elements stripe={stripePromise} options={{ clientSecret: intentData.clientSecret }}>
              <CheckoutForm
                spotId={spotId}
                clientSecret={intentData.clientSecret}
                amount={intentData.amount}
                size={intentData.size}
                businessName={intentData.businessName || "Your Business"}
                expiresAt={expiresAt}
              />
            </Elements>
          ) : (
            <SubscriptionRedirect
              spotId={spotId}
              size={intentData.size}
              planKey={selectedPlan}
              onError={(m) => setSubError(m)}
            />
          )}
        </>
      )}
    </CheckoutShell>
  );
}
