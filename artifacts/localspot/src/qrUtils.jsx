// ─────────────────────────────────────────────────────────────────────────────
// QR Code utilities for ad previews
// Uses api.qrserver.com for image-based QR codes — no extra package needed
// ─────────────────────────────────────────────────────────────────────────────

export function hasQR(data) {
  return !!(data && data.website && data.website.trim().length > 3);
}

export function normalizeWebsite(url) {
  if (!url) return "";
  if (/^https?:\/\//.test(url)) return url;
  return `https://${url}`;
}

export function generateSpotCode(businessName, type) {
  const slug = (businessName || "biz")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 20);
  return `mtp-${slug}-${type || "spot"}`;
}

function qrImageUrl(website, size = 80) {
  const encoded = encodeURIComponent(normalizeWebsite(website));
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encoded}&size=${size}x${size}&margin=2&color=000000`;
}

// Full QR block with "Scan" label — for use in larger templates
export function AdQRCode({ website, spotCode, size = 44, dark = false, scale = 1 }) {
  const px = Math.round(size * (scale || 1));
  const textColor = dark ? "rgba(255,255,255,0.8)" : "#555";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
      <img
        src={qrImageUrl(website, Math.max(px * 2, 60))}
        alt="QR code"
        width={px}
        height={px}
        style={{ borderRadius: 3, background: "#fff", padding: 2, display: "block" }}
      />
      <div style={{ fontSize: Math.max(px * 0.18, 6), color: textColor, fontFamily: "sans-serif", lineHeight: 1 }}>
        Scan
      </div>
    </div>
  );
}

// Compact inline QR — for Stamp template bottom row
export function InlineQRCode({ website, spotCode, size = 28, dark = true, scale = 1 }) {
  const px = Math.round(size * (scale || 1));
  return (
    <img
      src={qrImageUrl(website, Math.max(px * 2, 50))}
      alt="QR"
      width={px}
      height={px}
      style={{ borderRadius: 2, background: "#fff", padding: 1, display: "block", flexShrink: 0 }}
    />
  );
}
