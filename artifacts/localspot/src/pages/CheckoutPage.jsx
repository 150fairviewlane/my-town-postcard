import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useCreatePaymentIntent, useConfirmPayment } from "@workspace/api-client-react";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "pk_test_placeholder");

const SIZES = {
  large: { label: "Large", price: 399 },
  medium: { label: "Medium", price: 299 },
  small: { label: "Small", price: 199 },
};

function CheckoutForm({ spotId, clientSecret, amount, size, businessName }) {
  const stripe = useStripe();
  const elements = useElements();
  const [, navigate] = useLocation();
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const confirmMutation = useConfirmPayment();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: elements.getElement(CardElement) },
    });

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
      navigate(`/upload/${spotId}`);
    } catch (err) {
      setError("Payment succeeded but confirmation failed. Please contact support.");
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ fontFamily: "sans-serif" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ background: "#f8fafc", borderRadius: 10, padding: "16px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Order Summary</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#111" }}>{SIZES[size]?.label} Ad Spot</div>
          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>{businessName}</div>
          <div style={{ fontWeight: 900, fontSize: 28, color: "#991b1b", marginTop: 8 }}>${amount / 100}</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>Reaches 5,000 Clarkesville-area homes</div>
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

      <button
        type="submit"
        disabled={processing || !stripe}
        style={{
          width: "100%", padding: 15, borderRadius: 12, border: "none",
          background: processing ? "#d1d5db" : "#991b1b",
          color: "#fff", fontSize: 16, fontWeight: 800,
          cursor: processing ? "not-allowed" : "pointer",
        }}>
        {processing ? "Processing..." : `Pay $${amount / 100}`}
      </button>
      <p style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", marginTop: 10 }}>
        Secured by Stripe · Your card is charged now
      </p>
    </form>
  );
}

export default function CheckoutPage() {
  const { spotId } = useParams();
  const [, navigate] = useLocation();
  const [intentData, setIntentData] = useState(null);
  const createIntentMutation = useCreatePaymentIntent();
  const [spot, setSpot] = useState(null);

  useEffect(() => {
    if (!spotId) return;

    const fetchIntent = async () => {
      try {
        const result = await createIntentMutation.mutateAsync({
          data: { spotId: parseInt(spotId) },
        });
        setIntentData(result);
      } catch (err) {
        console.error("Failed to create payment intent", err);
      }
    };

    fetchIntent();
  }, [spotId]);

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 14 }}>← Back</button>
        <div style={{ fontWeight: 900, fontSize: 18, color: "#111", fontFamily: "Georgia,serif" }}>📮 My Town Postcard</div>
      </div>

      <div style={{ maxWidth: 480, margin: "48px auto", padding: "0 20px" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 32, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: "0 0 8px", fontFamily: "Georgia,serif" }}>Complete Your Payment</h1>
          <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 24 }}>You're one step away from securing your spot.</p>

          {createIntentMutation.isPending && (
            <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>Setting up payment...</div>
          )}

          {createIntentMutation.isError && (
            <div style={{ background: "#fef2f2", borderRadius: 8, padding: 16, color: "#991b1b", textAlign: "center" }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Could not load payment</div>
              <div style={{ fontSize: 13 }}>Stripe may not be configured. Please contact us to complete your reservation.</div>
            </div>
          )}

          {intentData && (
            <Elements stripe={stripePromise} options={{ clientSecret: intentData.clientSecret }}>
              <CheckoutForm
                spotId={spotId}
                clientSecret={intentData.clientSecret}
                amount={intentData.amount}
                size={spot?.size || "medium"}
                businessName={spot?.businessName || "Your Business"}
              />
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
}
