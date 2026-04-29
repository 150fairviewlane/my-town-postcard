import { useState } from "react";

export const SIZES = {
  large:  { label: "Large",  price: 399, dim: '4" × 5"',  desc: "Prime placement, maximum impact" },
  medium: { label: "Medium", price: 299, dim: '3" × 4"',  desc: "Great visibility, popular choice" },
  small:  { label: "Small",  price: 199, dim: '2" × 2"',  desc: "Affordable local reach" },
};

// Grid: 12 cols × 9 rows — each unit = 1 inch, matches the 12"×9" printed postcard
// Top half (rows 1-5): three large ads side by side
// Bottom half (rows 6-9): two medium paid + 1 available column (small/medium slots)
export const GRID_AREAS = [
  "mb mb mb mb dn dn dn dn re re re re",
  "mb mb mb mb dn dn dn dn re re re re",
  "mb mb mb mb dn dn dn dn re re re re",
  "mb mb mb mb dn dn dn dn re re re re",
  "mb mb mb mb dn dn dn dn re re re re",
  "hv hv hv ins ins ins pz pz a1 a1 a2 a2",
  "hv hv hv ins ins ins pz pz a1 a1 a2 a2",
  "hv hv hv ins ins ins lw lw a1 a1 a3 a3",
  "hv hv hv ins ins ins lw lw a1 a1 a3 a3",
].map(r => `"${r}"`).join(" ");

// Cell sizes at ~1200px container width:
// large  (4/12 cols × 5/9 rows):   ~387px × ~483px
// medium (3/12 cols × 4/9 rows):   ~290px × ~387px  (hv, ins)
// medSm  (2/12 cols × 4/9 rows):   ~193px × ~387px  (a1 — narrower)
// small  (2/12 cols × 2/9 rows):   ~193px × ~193px

export const FONT = {
  large:  { name: 21, cat: 13, tagline: 19, sub: 14, detail: 12, coupon: 19, couponSub: 12.5, addr: 12, phone: 12.5 },
  medium: { name: 14, cat: 10, tagline: 13, sub: 11, detail: 10, coupon: 13, couponSub: 10,   addr: 9.5,phone: 10   },
  medSm:  { name: 12, cat: 9,  tagline: 11, sub: 9.5,detail: 9,  coupon: 11, couponSub: 8.5,  addr: 8.5,phone: 9    },
  small:  { name: 11, cat: 8.5,tagline: 10, sub: 8.5,detail: 8,  coupon: 10, couponSub: 8,    addr: 8,  phone: 8.5  },
};

export const ICON_SIZE = { large: 54, medium: 36, medSm: 28, small: 22 };
export const PAD = { large: "14px 18px", medium: "10px 13px", medSm: "7px 9px", small: "6px 8px" };

export const ADS = {
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

export function sizeKey(spotSize, gridArea) {
  // a1 is a 2-col × 4-row cell — slightly narrower than hv/ins, treat as medSm
  if (spotSize === "medium" && gridArea === "a1") return "medSm";
  return spotSize;
}

export function PaidAd({ spot }) {
  const sk = sizeKey(spot.size, spot.gridArea);
  const f = FONT[sk] || FONT.medium;
  const iconSz = ICON_SIZE[sk] || 28;
  const pad = PAD[sk] || PAD.medium;
  const d = ADS[spot.businessName];
  const isSmall = sk === "small";
  const isLarge = sk === "large";

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
          {!isSmall && (
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: f.cat, marginTop: 1,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.cat}</div>
          )}
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

export function AvailableSpot({ spot, isSelected, onClick }) {
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
        fontWeight: 900, fontFamily: "sans-serif" }}>${sz.price}</div>
      {!isSmall && (
        <div style={{ fontSize: 9, color: "#6b7280", fontFamily: "sans-serif" }}>{sz.dim}</div>
      )}
    </div>
  );
}

export function Modal({ spot, onClose, onSubmit, isLoading, error }) {
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
              ${sz.price}
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
          {isLoading ? "Reserving..." : `Reserve This Spot — $${sz.price}`}
        </button>
        <p style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", margin: "10px 0 0" }}>
          No charge now. You'll pay on the next screen.
        </p>
      </div>
    </div>
  );
}
