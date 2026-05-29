import { useState } from "react";
import { useLocation } from "wouter";
import { useGetActiveCampaign, useReserveSpot } from "@workspace/api-client-react";
import { saveReservation } from "./lib/reservationStorage";
import { GRID_AREAS } from "./postcardCore";

const SIZES = {
  large:  { label: "Large",  price: 399, dim: '4" × 5"',  desc: "Prime placement, maximum impact" },
  medium: { label: "Medium", price: 299, dim: '3" × 4"',  desc: "Great visibility, popular choice" },
  small:  { label: "Small",  price: 199, dim: '2" × 2"',  desc: "Affordable local reach" },
};

function formatPrice(price) {
  return `$${price}`;
}

// Grid: 12 cols × 9 rows — each unit = 1 inch, matches the 12"×9" printed postcard
// Top 5 rows: mb / dn / re — XL (4 cols × 5 rows each)
// Bottom 4 rows: l1 / l2 / l3 / l4 — Large (3 cols × 4 rows each, no house ad)
// GRID_AREAS imported from postcardCore (shared with print page)

// Cell sizes at ~1200px container width:
// xl    (4/12 cols × 5/9 rows):   ~387px × ~483px
// large (3/12 cols × 4/9 rows):   ~290px × ~387px  (l1–l4)

const FONT = {
  large:  { name: 21, cat: 13, tagline: 19, sub: 14, detail: 12, coupon: 19, couponSub: 12.5, addr: 12, phone: 12.5 },
  medium: { name: 14, cat: 10, tagline: 13, sub: 11, detail: 10, coupon: 13, couponSub: 10,   addr: 9.5,phone: 10   },
  medSm:  { name: 12, cat: 9,  tagline: 11, sub: 9.5,detail: 9,  coupon: 11, couponSub: 8.5,  addr: 8.5,phone: 9    },
  small:  { name: 11, cat: 8.5,tagline: 10, sub: 8.5,detail: 8,  coupon: 10, couponSub: 8,    addr: 8,  phone: 8.5  },
};

const ICON_SIZE = { large: 54, medium: 36, medSm: 28, small: 22 };
const PAD = { large: "14px 18px", medium: "10px 13px", medSm: "7px 9px", small: "6px 8px" };

const ADS = {
  "Mr. Biscuit's Café": {
    name: "Mr. Biscuit's Café", cat: "Café & Breakfast",
    tagline: "From-Scratch Biscuits & Boba!", sub: "Drive-thru or dine-in daily.",
    addr: "596 W Louise Dr, Ste D · Clarkesville", phone: "(706) 555-0596",
    hours: "Mon–Sat  6am – 2pm",
    coupon: "BUY A BISCUIT", couponSub: "Get a FREE Drink! · show this ad",
    bg: "linear-gradient(150deg,#1a0800,#3d1500,#5a2200)", accent: "#c8541a", light: true, icon: "☕",
  },
  "Clarkesville Family Dental": {
    name: "Clarkesville Family Dental", cat: "General Dentistry",
    tagline: "Accepting New Patients!", sub: "Gentle care for the whole family.",
    addr: "142 Commerce St, Clarkesville, GA", phone: "(706) 555-0142",
    hours: "Mon–Fri  8am – 5pm",
    coupon: "FREE Whitening Kit", couponSub: "w/ new patient exam · show this ad",
    bg: "#0a2a5e", accent: "#d4a017", light: true, icon: "🦷",
  },
  "Blue Ridge Air & Heat": {
    name: "Blue Ridge Air & Heat", cat: "HVAC Service & Repair",
    tagline: "24/7 Emergency Service!", sub: "Heating & cooling experts since 2001.",
    addr: "88 Industrial Blvd, Gainesville, GA", phone: "(706) 555-0188",
    hours: "Open 24/7 · Emergency Available",
    coupon: "$89 A/C Tune-Up", couponSub: "Expires June 30 · mention this ad",
    bg: "#003f6b", accent: "#00bcd4", light: true, icon: "❄️",
  },
  "Habersham Realty Group": {
    name: "Habersham Realty Group", cat: "Real Estate",
    tagline: "Local Experts Since 2003", sub: "Buying or selling in NE Georgia?",
    addr: "301 Main St, Clarkesville, GA", phone: "(706) 555-0301",
    hours: "By Appointment · 7 Days a Week",
    coupon: "Free Home Valuation", couponSub: "No obligation · call or text today",
    bg: "#f5f0e8", accent: "#2d6a4f", light: false, icon: "🏡",
  },
  "Tanner Insurance Agency": {
    name: "Tanner Insurance Agency", cat: "Auto · Home · Life",
    tagline: "Local Agent. Real Savings.", sub: "We shop dozens of carriers for you.",
    addr: "55 S Main St, Cornelia, GA", phone: "(706) 555-0055",
    hours: "Mon–Fri  9am – 5pm",
    coupon: "Save up to $500/yr", couponSub: "Free quote · no obligation",
    bg: "#1a1a2e", accent: "#e2b714", light: true, icon: "🛡️",
  },
  "Roma's Pizza & Subs": {
    name: "Roma's Pizza & Subs", cat: "Italian Restaurant",
    tagline: "Hand-Tossed. Oven Fresh.", sub: "Dine-in, carry-out & delivery.",
    addr: "712 Washington St, Clarkesville", phone: "(706) 555-0712",
    hours: "Daily  11am – 9pm",
    coupon: "BOGO Medium Pizza", couponSub: "Tues & Wed · dine-in only",
    bg: "#fff8f0", accent: "#c0392b", light: false, icon: "🍕",
  },
  "Green Acres Lawn Care": {
    name: "Green Acres Lawn Care", cat: "Lawn & Landscaping",
    tagline: "Your Yard. Our Pride.", sub: "Mowing, mulching & clean-ups.",
    addr: "Serving All of Habersham County", phone: "(706) 555-0399",
    hours: "Mon–Sat  7am – 6pm",
    coupon: "$25 Off First Service", couponSub: "New customers · show this ad",
    bg: "#f0fdf4", accent: "#16a34a", light: false, icon: "🌿",
  },
};

function sizeKey(spotSize, gridArea) {
  // a1 is a 2-col × 4-row cell — slightly narrower than hv/ins, treat as medSm
  if (spotSize === "medium" && gridArea === "a1") return "medSm";
  return spotSize;
}

function PaidAd({ spot }) {
  const sk = sizeKey(spot.size, spot.gridArea);
  const f = FONT[sk] || FONT.medium;
  const iconSz = ICON_SIZE[sk] || 28;
  const pad = PAD[sk] || PAD.medium;
  const d = ADS[spot.businessName];
  const isSmall = sk === "small";
  const isLarge = sk === "large";

  if (spot.adFileUrl) {
    return (
      <div style={{ width: "100%", height: "100%", background: "#000", overflow: "hidden" }}>
        <img src={spot.adFileUrl} alt={spot.businessName}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      </div>
    );
  }

  if (!d) {
    return (
      <div style={{ width: "100%", height: "100%", background: "#f9fafb", border: "1px solid #e5e7eb",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
        <span style={{ fontSize: iconSz * 0.7 }}>📌</span>
        <div style={{ fontSize: f.name, fontWeight: 700, color: "#374151", fontFamily: "sans-serif",
          textAlign: "center", padding: "0 6px", lineHeight: 1.2 }}>{spot.businessName}</div>
        <div style={{ fontSize: f.cat, color: "#9ca3af", fontFamily: "sans-serif" }}>Reserved</div>
      </div>
    );
  }

  const tc  = d.light ? "#fff" : "#111";
  const tc2 = d.light ? "rgba(255,255,255,0.78)" : "#555";
  // Coupon box: always clearly visible
  const couponBg   = d.light ? "rgba(255,255,255,0.12)" : `${d.accent}18`;
  const couponBdr  = d.light ? "rgba(255,255,255,0.5)"  : d.accent;
  const couponText = d.light ? "#fff" : d.accent;

  return (
    <div style={{ width: "100%", height: "100%", background: d.bg,
      display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "sans-serif", boxSizing: "border-box" }}>

      {/* Header bar */}
      <div style={{ background: d.accent, padding: pad, display: "flex", alignItems: "center",
        gap: isSmall ? 5 : 9, flexShrink: 0 }}>
        <span style={{ fontSize: iconSz, lineHeight: 1, flexShrink: 0 }}>{d.icon}</span>
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: f.name, lineHeight: 1.2,
            overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" }}>{d.name}</div>
        </div>
      </div>

      {/* Body — flex column, content at top, coupon pushed to bottom */}
      <div style={{ flex: 1, padding: pad, display: "flex", flexDirection: "column",
        gap: isLarge ? 8 : isSmall ? 3 : 5, overflow: "hidden", minHeight: 0 }}>
        <div style={{ fontWeight: 700, fontSize: f.tagline, color: tc, lineHeight: 1.25 }}>
          {d.tagline}
        </div>
        {!isSmall && (
          <div style={{ fontSize: f.sub, color: tc2, lineHeight: 1.45 }}>{d.sub}</div>
        )}
        {isLarge && (
          <div style={{ fontSize: f.detail, color: tc2 }}>⏰ {d.hours}</div>
        )}

        {/* Spacer pushes coupon to bottom */}
        <div style={{ flex: 1, minHeight: isSmall ? 0 : 8 }} />

        {/* Coupon box */}
        <div style={{
          background: couponBg, border: `2px dashed ${couponBdr}`, borderRadius: 6,
          padding: isSmall ? "5px 7px" : isLarge ? "10px 14px" : "7px 10px",
          textAlign: "center", flexShrink: 0,
        }}>
          <div style={{ color: couponText, fontWeight: 800, fontSize: f.coupon, lineHeight: 1.25 }}>
            {d.coupon}
          </div>
          {!isSmall && (
            <div style={{ color: tc2, fontSize: f.couponSub, marginTop: 3, lineHeight: 1.3 }}>
              {d.couponSub}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: "rgba(0,0,0,0.10)", padding: `4px ${isSmall ? "7" : "12"}px`,
        display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, gap: 4 }}>
        <div style={{ color: tc2, fontSize: f.addr, overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap", flex: 1 }}>
          📍 {isSmall ? d.addr.split(",")[0] : d.addr}
        </div>
        <div style={{ color: d.light ? "#fff" : d.accent, fontSize: f.phone, fontWeight: 700,
          flexShrink: 0, whiteSpace: "nowrap" }}>
          {isSmall ? d.phone.replace("(706) ", "") : d.phone}
        </div>
      </div>
    </div>
  );
}

// ─── Permanent house / self-promotion ad ─────────────────────────────────────
function HouseAd() {
  return (
    <div style={{
      width: "100%", height: "100%",
      background: "linear-gradient(160deg,#0f1923 0%,#1a2a3a 100%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "sans-serif", padding: "5px 5px",
      boxSizing: "border-box", gap: 2, overflow: "hidden", cursor: "default",
    }}>
      {/* Top red rule */}
      <div style={{ width: "70%", height: 2, background: "#991b1b", borderRadius: 1, marginBottom: 1 }} />

      {/* Main headline */}
      <div style={{ color: "#fff", fontWeight: 900, fontSize: 8.5,
        textAlign: "center", lineHeight: 1.15, letterSpacing: 0.3 }}>
        Shop, Dine<br />&amp; Buy Local
      </div>

      {/* Subhead */}
      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 6,
        textAlign: "center", letterSpacing: 0.5, textTransform: "uppercase" }}>
        Your Ad Here
      </div>

      {/* Brand name */}
      <div style={{ color: "#fff", fontWeight: 800, fontSize: 7.5,
        textAlign: "center", fontFamily: "Georgia,serif", lineHeight: 1.1 }}>
        My Town Postcard
      </div>

      {/* URL */}
      <div style={{ color: "#991b1b", fontSize: 6.5, fontWeight: 700 }}>
        mytownpostcard.com
      </div>

      {/* QR code placeholder */}
      <div style={{
        border: "1.5px dashed rgba(255,255,255,0.3)", borderRadius: 3,
        padding: "3px 6px", marginTop: 1,
        display: "flex", alignItems: "center", gap: 3,
      }}>
        <div style={{
          width: 11, height: 11,
          border: "1.5px solid rgba(255,255,255,0.45)",
          borderRadius: 2, flexShrink: 0,
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr", gap: 1.5, padding: 1.5,
          boxSizing: "border-box",
        }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.4)", borderRadius: 0.5 }} />
          ))}
        </div>
        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 5.5 }}>QR Code</div>
      </div>

      {/* Bottom red rule */}
      <div style={{ width: "70%", height: 2, background: "#991b1b", borderRadius: 1, marginTop: 1 }} />
    </div>
  );
}

function AvailableSpot({ spot, isSelected, onClick }) {
  const sz = SIZES[spot.size];
  const sk = sizeKey(spot.size, spot.gridArea);
  const isSmall = sk === "small" || sk === "medSm";

  return (
    <div onClick={onClick} style={{
      width: "100%", height: "100%", borderRadius: 3, cursor: "pointer",
      background: isSelected ? "#fef9c3" : "#f0fdf4",
      border: isSelected ? "2.5px solid #ca8a04" : "2px dashed #22c55e",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: isSmall ? 3 : 6, padding: isSmall ? "6px 4px" : "10px 8px",
      textAlign: "center", transition: "all 0.15s", boxSizing: "border-box",
    }}>
      <div style={{ fontSize: isSmall ? 20 : 28 }}>{isSelected ? "✅" : "➕"}</div>
      <div style={{ fontWeight: 800, fontSize: isSmall ? 9 : 12,
        color: isSelected ? "#92400e" : "#15803d", fontFamily: "sans-serif", lineHeight: 1.2 }}>
        {isSelected ? "SELECTED" : sz.label + " Spot"}
      </div>
        <div style={{ fontSize: isSmall ? 10 : 14, color: isSelected ? "#b45309" : "#166534",
        fontWeight: 900, fontFamily: "sans-serif" }}>{formatPrice(sz.price)}</div>
      {!isSmall && (
        <div style={{ fontSize: 9, color: "#6b7280", fontFamily: "sans-serif" }}>{sz.dim}</div>
      )}
    </div>
  );
}

function Modal({ spot, onClose, onSubmit, isLoading, error }) {
  const sz = SIZES[spot.size];
  const [f, setF] = useState({ biz: "", cat: "", email: "", phone: "" });
  const ok = f.biz.trim() && f.cat.trim() && f.email.includes("@");
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: 28,
        maxWidth: 430, width: "100%", boxShadow: "0 30px 80px rgba(0,0,0,0.35)", fontFamily: "sans-serif" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10, color: "#9ca3af", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
              {sz.label} Ad · {sz.dim}
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#111", fontFamily: "Georgia,serif", lineHeight: 1 }}>
              {formatPrice(sz.price)}
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              Reaches 5,000 Clarkesville-area homes
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#f3f4f6", border: "none", borderRadius: "50%",
            width: 34, height: 34, cursor: "pointer", fontSize: 18, color: "#374151" }}>×</button>
        </div>

        <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 16px", marginBottom: 18,
          lineHeight: 2.0, fontSize: 12.5, color: "#374151" }}>
          ✅ &nbsp;One business per category — zero competition<br />
          ✅ &nbsp;Professional ad design included<br />
          ✅ &nbsp;Printed &amp; mailed via USPS EDDM<br />
          ✅ &nbsp;Under 10¢ per home reached
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
            padding: "10px 14px", marginBottom: 14, color: "#991b1b", fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          {[["biz", "Business Name *"], ["cat", "Business Category (e.g. Pizza Restaurant) *"],
            ["email", "Email Address *"], ["phone", "Phone Number"]].map(([k, ph]) => (
            <input key={k} placeholder={ph} value={f[k]} onChange={set(k)}
              style={{ padding: "10px 13px", borderRadius: 9, border: "1.5px solid #d1d5db",
                fontSize: 13.5, outline: "none", fontFamily: "sans-serif" }} />
          ))}
        </div>

        <button disabled={!ok || isLoading} onClick={() => onSubmit(f)} style={{
          width: "100%", padding: 14, borderRadius: 11, border: "none",
          background: ok && !isLoading ? "#991b1b" : "#d1d5db",
          color: "#fff", fontSize: 15, fontWeight: 800,
          cursor: ok && !isLoading ? "pointer" : "not-allowed", fontFamily: "sans-serif",
        }}>
          {isLoading ? "Reserving..." : `Reserve This Spot — ${formatPrice(sz.price)}`}
        </button>
        <p style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", margin: "10px 0 0" }}>
          No charge now. You'll pay on the next screen.
        </p>
      </div>
    </div>
  );
}

export default function PostcardSpotPicker() {
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [reserveError, setReserveError] = useState(null);

  const { data: campaign, isLoading } = useGetActiveCampaign();
  const reserveMutation = useReserveSpot();

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#dde3ea" }}>
        <div style={{ fontFamily: "sans-serif", color: "#6b7280" }}>Loading postcard...</div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#dde3ea" }}>
        <div style={{ fontFamily: "sans-serif", color: "#6b7280" }}>No active campaign found.</div>
      </div>
    );
  }

  const spots = campaign.spots || [];
  const openSpots = spots.filter(s => s.status === "available");
  const takenSpots = spots.filter(s => s.status !== "available");

  const GRID_ORDER = ["mb","dn","re","hv","ins","pz","lw","a1","a2","a3"];
  const sortedSpots = [...spots].sort((a, b) =>
    (GRID_ORDER.indexOf(a.gridArea) ?? 99) - (GRID_ORDER.indexOf(b.gridArea) ?? 99)
  );

  const handleSubmit = async (form) => {
    setReserveError(null);
    try {
      const result = await reserveMutation.mutateAsync({
        id: modal.id,
        data: {
          businessName: form.biz,
          businessCategory: form.cat,
          contactEmail: form.email,
          contactPhone: form.phone || undefined,
        },
      });
      saveReservation(result.id, result.expiresAt, result.businessName);
      setModal(null);
      setSelected(null);
      navigate(`/checkout/${result.id}`);
    } catch (err) {
      setReserveError(err?.data?.error || err?.message || "Something went wrong. Please try again.");
    }
  };

  const openModal = (spot) => { setSelected(spot); setModal(spot); setReserveError(null); };

  return (
    <div style={{ minHeight: "100vh", background: "#dde3ea", fontFamily: "sans-serif" }}>

      {/* Nav */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "10px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18, color: "#111", fontFamily: "Georgia,serif" }}>
            📮 LocalSpot Mailer
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>
            9×12 Co-op Postcard · Clarkesville, GA
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            onClick={() => { const a = openSpots[0]; if (a) openModal(a); }}
            style={{ background: "#991b1b", color: "#fff", border: "none", borderRadius: 8,
              padding: "9px 20px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
            Save Your Spot →
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "22px 20px 48px" }}>

        {/* Hero text */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "#991b1b", fontWeight: 800, letterSpacing: 3,
            textTransform: "uppercase", marginBottom: 6 }}>
            {campaign.mailDate ? `Mailing ${campaign.mailDate}` : "Spring 2025"} · {campaign.territory}
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", margin: "0 0 6px",
            fontFamily: "Georgia,serif", lineHeight: 1.25 }}>
            Reserve Your Spot on the{" "}
            <span style={{ color: "#991b1b" }}>Local 9×12 Postcard</span>
          </h1>
          <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 14px" }}>
            Mailed to <strong>{campaign.homesCount?.toLocaleString()} homes</strong> in the{" "}
            {campaign.territory} area. Click any{" "}
            <span style={{ color: "#16a34a", fontWeight: 700 }}>green spot</span> to claim yours.
          </p>

          {/* Stats bar */}
          <div style={{ display: "inline-flex", background: "#fff", borderRadius: 12,
            boxShadow: "0 2px 8px rgba(0,0,0,0.07)", overflow: "hidden" }}>
            {[
              [openSpots.length, "Open Spots", "#22c55e"],
              [takenSpots.length, "Spots Taken", "#374151"],
              [campaign.homesCount?.toLocaleString(), "Homes Reached", "#374151"],
              ["1", "Per Category", "#374151"],
            ].map(([v, l, c], i) => (
              <div key={l} style={{ textAlign: "center", padding: "11px 22px",
                borderRight: i < 3 ? "1px solid #f3f4f6" : "none" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: c }}>{v}</div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── POSTCARD ─────────────────────────────────────────────────────────── */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "10px 10px 6px",
          boxShadow: "0 16px 56px rgba(0,0,0,0.18)", position: "relative" }}>

          {/* Label chip */}
          <div style={{ position: "absolute", top: -13, left: 20, background: "#111", color: "#fff",
            fontSize: 9, fontWeight: 700, letterSpacing: 1.5, padding: "3px 14px",
            borderRadius: 20, textTransform: "uppercase" }}>
            Live Postcard Preview · 9" × 12" Horizontal · 1 unit = 1 inch
          </div>

          {/* Red header bar */}
          <div style={{ background: "linear-gradient(90deg,#7f1d1d,#991b1b)", borderRadius: "6px 6px 0 0",
            padding: "6px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 3 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: "Georgia,serif" }}>
              📮 Clarkesville Community Mailer
            </div>
            <div style={{ color: "#fca5a5", fontSize: 9 }}>
              Reaching {campaign.homesCount?.toLocaleString()} Local Homes · Spring 2025
            </div>
          </div>

          {/* The postcard grid — 12:9 landscape ratio */}
          <div style={{
            width: "100%",
            aspectRatio: "12 / 9",
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            gridTemplateRows: "repeat(9, 1fr)",
            gridTemplateAreas: GRID_AREAS,
            gap: "3px",
          }}>
            {sortedSpots.map(spot => (
              <div key={spot.id} style={{ gridArea: spot.gridArea, overflow: "hidden", borderRadius: 3,
                minWidth: 0, minHeight: 0 }}>
                {(spot.status === "paid" || spot.status === "reserved") ? (
                  <PaidAd spot={spot} />
                ) : (
                  <AvailableSpot
                    spot={spot}
                    isSelected={selected?.id === spot.id}
                    onClick={() => openModal(spot)}
                  />
                )}
              </div>
            ))}
          </div>

          {/* EDDM footer strip */}
          <div style={{ marginTop: 3, padding: "3px 12px", background: "#f8fafc",
            borderRadius: "0 0 6px 6px", display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontSize: 7.5, color: "#9ca3af" }}>LOCAL POSTAL CUSTOMER · EDDM</div>
            <div style={{ fontSize: 7.5, color: "#9ca3af" }}>
              PRESORTED STD · U.S. POSTAGE PAID · {((campaign?.cityList||"").split(",")[0].trim().toUpperCase()||"CLARKESVILLE")} GA {campaign?.zipCode||"30523"}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 20, marginTop: 10, justifyContent: "center", flexWrap: "wrap" }}>
          {[
            { bg: "#f0fdf4", border: "2px dashed #22c55e", label: "Available — click to reserve" },
            { bg: "#fef9c3", border: "2px solid #ca8a04",  label: "Your selection" },
            { bg: "#f3f4f6", border: "1px solid #e5e7eb",  label: "Spot taken" },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 22, height: 14, background: l.bg, border: l.border,
                borderRadius: 3, flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: "#6b7280" }}>{l.label}</span>
            </div>
          ))}
        </div>

        {/* ─── BELOW-CARD INFO ROW ──────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 24 }}>

          {/* Pricing */}
          <div style={{ background: "#fff", borderRadius: 12, padding: 22,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#111", marginBottom: 14,
              fontFamily: "Georgia,serif" }}>Ad Spot Pricing</div>
            {Object.entries(SIZES).map(([k, sz]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "9px 0", borderBottom: "1px solid #f3f4f6" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "#111" }}>{sz.label}</div>
                  <div style={{ fontSize: 11.5, color: "#9ca3af" }}>{sz.dim} · {sz.desc}</div>
                </div>
                <div style={{ fontWeight: 900, fontSize: 20, color: "#991b1b" }}>{formatPrice(sz.price)}</div>
              </div>
            ))}
            <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
              All spots include professional ad design &amp; direct mailing
              to {campaign.homesCount?.toLocaleString()} homes.
            </div>
          </div>

          {/* Why it works */}
          <div style={{ background: "#fff", borderRadius: 12, padding: 22,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#111", marginBottom: 14,
              fontFamily: "Georgia,serif" }}>Why It Works</div>
            {[
              ["🚫", "One business per category"],
              ["📬", "Physical mail — not a digital ad"],
              ["🎨", "Pro ad design included"],
              ["📍", "Targeted local neighborhoods"],
              ["💰", "Under 10¢ per home reached"],
              ["⭐", `${campaign.homesCount?.toLocaleString()} Clarkesville-area homes`],
            ].map(([ic, tx]) => (
              <div key={tx} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>{ic}</span>
                <span style={{ fontSize: 12.5, color: "#374151", lineHeight: 1.45 }}>{tx}</span>
              </div>
            ))}
          </div>

          {/* CTA card */}
          <div style={{ background: "linear-gradient(145deg,#7f1d1d,#991b1b)", borderRadius: 12,
            padding: 22, textAlign: "center", color: "#fff",
            display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
            <div style={{ fontSize: 36 }}>⏳</div>
            <div style={{ fontWeight: 900, fontSize: 18, fontFamily: "Georgia,serif" }}>
              Only {openSpots.length} spot{openSpots.length !== 1 ? "s" : ""} left!
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.6 }}>
              One business per category. Don't let your competitor claim your spot.
            </div>
            <button
              onClick={() => { const a = openSpots[0]; if (a) openModal(a); }}
              style={{ background: "#fff", color: "#991b1b", border: "none", borderRadius: 10,
                padding: "13px 0", fontWeight: 900, fontSize: 14, cursor: "pointer", width: "100%" }}>
              Claim Your Spot →
            </button>
            <div style={{ fontSize: 11, opacity: 0.65 }}>
              Mail date: {campaign.mailDate || "Spring 2025"}
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <Modal
          spot={modal}
          onClose={() => { setModal(null); setSelected(null); setReserveError(null); }}
          onSubmit={handleSubmit}
          isLoading={reserveMutation.isPending}
          error={reserveError}
          territory={campaign?.territory}
        />
      )}
    </div>
  );
}
