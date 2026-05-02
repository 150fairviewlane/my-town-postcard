// LocalStorage-backed bookkeeping for the customer's active spot reservation.
//
// We don't have user accounts — anyone with a session can reserve a spot —
// so the picker uses sessionStorage for ad designs (key: `localspot:ad:<id>`)
// and we use localStorage here for the longer-lived reservation hold so the
// countdown can survive a full page reload while the customer is on
// /checkout/:id. localStorage values are intentionally tiny: just the id,
// expiresAt ISO string, and a short businessName label for the picker
// "resume checkout" banner.
//
// Server is the source of truth — the countdown reads `expiresAt` straight
// off the spot response, and the cleanup sweeper / webhook will release a
// stale reservation regardless of what's in this storage.

const KEY_PREFIX = "localspot:reservation:";

function key(spotId) {
  return `${KEY_PREFIX}${spotId}`;
}

export function saveReservation(spotId, expiresAt, businessName) {
  if (!spotId || !expiresAt) return;
  try {
    localStorage.setItem(
      key(spotId),
      JSON.stringify({
        spotId,
        expiresAt,
        businessName: businessName ?? null,
      }),
    );
  } catch {
    // localStorage may be unavailable / full — non-fatal, customer just
    // won't see the resume-checkout banner if they reload the picker.
  }
}

export function loadReservation(spotId) {
  if (!spotId) return null;
  try {
    const raw = localStorage.getItem(key(spotId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearReservation(spotId) {
  if (!spotId) return;
  try {
    localStorage.removeItem(key(spotId));
  } catch {
    // non-fatal
  }
}

// Walk every reservation entry in localStorage and return the first one
// that hasn't expired. Used by the picker to surface a "resume checkout"
// banner when a customer comes back to / before paying.
export function findActiveReservation() {
  try {
    const now = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(KEY_PREFIX)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!parsed?.spotId || !parsed?.expiresAt) continue;
      const ms = new Date(parsed.expiresAt).getTime();
      if (Number.isNaN(ms) || ms <= now) {
        // Expired — opportunistically clean it up so the picker doesn't
        // surface a stale resume banner forever.
        try {
          localStorage.removeItem(k);
        } catch {}
        continue;
      }
      return parsed;
    }
  } catch {
    // localStorage unavailable
  }
  return null;
}
