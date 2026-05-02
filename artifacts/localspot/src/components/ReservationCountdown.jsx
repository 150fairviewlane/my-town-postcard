import { useEffect, useState } from "react";

/**
 * Live countdown banner shown above the Pay button on the checkout page.
 * Reads `expiresAt` (ISO string from the API) and re-renders once per
 * second. When the timer reaches zero it clears the corresponding
 * localStorage entry and calls onExpired so the parent can redirect
 * back to the picker.
 *
 * Server is the source of truth for the actual hold — this component is
 * purely informational. Even if the clock here drifts or the tab is
 * backgrounded, the cleanup sweeper / Stripe webhook will release the
 * spot at the right moment server-side.
 */
export default function ReservationCountdown({ expiresAt, onExpired }) {
  const [now, setNow] = useState(() => Date.now());
  const [hasFiredExpired, setHasFiredExpired] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Reset the "already fired onExpired" guard when the parent passes a
  // new expiresAt (e.g. user reserved a different spot).
  useEffect(() => {
    setHasFiredExpired(false);
  }, [expiresAt]);

  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : NaN;
  const remainingMs = Number.isFinite(expiresMs) ? Math.max(0, expiresMs - now) : 0;
  const expired = Number.isFinite(expiresMs) && remainingMs === 0;

  useEffect(() => {
    if (expired && !hasFiredExpired) {
      setHasFiredExpired(true);
      onExpired?.();
    }
  }, [expired, hasFiredExpired, onExpired]);

  if (!expiresAt || !Number.isFinite(expiresMs)) return null;

  if (expired) {
    return (
      <div
        role="alert"
        style={{
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 16,
          color: "#991b1b",
          fontSize: 13,
          fontFamily: "sans-serif",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>⏰</span>
        <span>
          <strong>Your hold expired.</strong> Sending you back to choose another spot…
        </span>
      </div>
    );
  }

  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  const formatted = `${minutes}:${String(seconds).padStart(2, "0")}`;
  // Last 5 minutes flips to amber to nudge the customer along.
  const lowTime = remainingMs < 5 * 60 * 1000;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: lowTime ? "#fff7ed" : "#f0fdf4",
        border: `1px solid ${lowTime ? "#fdba74" : "#86efac"}`,
        borderRadius: 8,
        padding: "10px 14px",
        marginBottom: 16,
        color: lowTime ? "#9a3412" : "#15803d",
        fontSize: 13,
        fontFamily: "sans-serif",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 16 }}>⏱️</span>
      <span>
        This spot is held for you for <strong>{formatted}</strong>
      </span>
    </div>
  );
}
