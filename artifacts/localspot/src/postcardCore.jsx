import { useState } from "react";

export const SIZES = {
  large:  { label: "Large",  price: 399, dim: '4" × 5"',  desc: "Prime placement, maximum impact" },
  medium: { label: "Medium", price: 299, dim: '3" × 4"',  desc: "Great visibility, popular choice" },
  small:  { label: "Small",  price: 199, dim: '3" × 2"',  desc: "Affordable local reach" },
};

// Grid: 12 cols × 9 rows — each unit = 1 inch, matches the 12"×9" printed postcard
// Top half (rows 1-5): three large ads (4 cols × 5 rows each)
// Bottom half (rows 6-9): two medium (3 cols × 4 rows) + four small (3 cols × 2 rows)
export const GRID_AREAS = [
  "mb mb mb mb dn dn dn dn re re re re",
  "mb mb mb mb dn dn dn dn re re re re",
  "mb mb mb mb dn dn dn dn re re re re",
  "mb mb mb mb dn dn dn dn re re re re",
  "mb mb mb mb dn dn dn dn re re re re",
  "hv hv hv ins ins ins pz pz pz a1 a1 a1",
  "hv hv hv ins ins ins pz pz pz a1 a1 a1",
  "hv hv hv ins ins ins lw lw lw a2 a2 a2",
  "hv hv hv ins ins ins lw lw lw a2 a2 a2",
].map(r => `"${r}"`).join(" ");

// Font scale per size — proportional to rendered cell dimensions
export const FONT = {
  large:  { name: 16, cat: 10.5, tagline: 13, sub: 11, detail: 10, coupon: 15, couponSub: 10, addr: 9.5, phone: 10.5 },
  medium: { name: 12, cat: 9,    tagline: 10, sub: 9,  detail: 8.5,coupon: 11, couponSub: 8.5,addr: 8,   phone: 9.5  },
  small:  { name: 11, cat: 8,    tagline: 9,  sub: 8,  detail: 7.5,coupon: 10, couponSub: 7.5,addr: 7.5, phone: 8.5  },
};

// Unsplash photo URLs — stable IDs for each business category
const PHOTOS = {
  cafe:      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&h=300&q=80&auto=format&fit=crop",
  dental:    "https://images.unsplash.com/photo-1588776814546-1ffeddfec4a4?w=600&h=300&q=80&auto=format&fit=crop",
  hvac:      "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600&h=300&q=80&auto=format&fit=crop",
  insurance: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=300&q=80&auto=format&fit=crop",
  pizza:     "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&h=300&q=80&auto=format&fit=crop",
  lawn:      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=300&q=80&auto=format&fit=crop",
};

export const ADS = {
  "Mr. Biscuit's Café": {
    name: "Mr. Biscuit's Café", cat: "Café & Breakfast",
    tagline: "From-Scratch Biscuits & Boba!", sub: "Drive-thru or dine-in daily.",
    addr: "596 W Louise Dr, Ste D · Clarkesville", phone: "(706) 555-0596",
    hours: "Mon–Sat  6am – 2pm",
    coupons: [
      { label: "BUY ONE", sub: "BISCUIT SANDWICH", value: "GET ONE FREE", note: "Must show ad · dine-in or drive-thru" },
      { label: "$2 OFF", sub: "Any Boba Drink", value: "", note: "Must show ad · limit one" },
    ],
    bg: "#2c1000", accent: "#c8541a", light: true,
    photo: PHOTOS.cafe,
    socials: ["📘","📸"],
  },
  "Clarkesville Family Dental": {
    name: "Clarkesville Family Dental", cat: "General Dentistry",
    tagline: "Accepting New Patients!", sub: "Gentle care for the whole family.",
    addr: "142 Commerce St · Clarkesville, GA", phone: "(706) 555-0142",
    hours: "Mon–Fri  8am – 5pm",
    coupons: [
      { label: "FREE", sub: "Whitening Kit", value: "", note: "w/ new patient exam · show this ad" },
      { label: "$99", sub: "New Patient Exam", value: "", note: "X-rays + cleaning included · expires 6/30" },
    ],
    bg: "#0a2a5e", accent: "#d4a017", light: true,
    photo: PHOTOS.dental,
    socials: ["📘","📸"],
  },
  "Blue Ridge Air & Heat": {
    name: "Blue Ridge Air & Heat", cat: "HVAC Service & Repair",
    tagline: "24/7 Emergency Service!", sub: "Heating & cooling experts since 2001.",
    addr: "88 Industrial Blvd · Gainesville, GA", phone: "(706) 555-0188",
    hours: "Open 24/7 · Emergency Available",
    coupons: [
      { label: "$89", sub: "A/C Tune-Up", value: "", note: "Expires June 30 · mention this ad" },
      { label: "FREE", sub: "Service Call", value: "", note: "w/ any repair · $89 value · show ad" },
    ],
    bg: "#003f6b", accent: "#00bcd4", light: true,
    photo: PHOTOS.hvac,
    socials: ["📘"],
  },
  "Tanner Insurance Agency": {
    name: "Tanner Insurance Agency", cat: "Auto · Home · Life",
    tagline: "Local Agent. Real Savings.", sub: "We shop dozens of carriers for you.",
    addr: "55 S Main St · Cornelia, GA", phone: "(706) 555-0055",
    hours: "Mon–Fri  9am – 5pm",
    coupons: [
      { label: "Save up to", sub: "$500/yr", value: "", note: "Free quote · no obligation · call today" },
    ],
    bg: "#1a1a2e", accent: "#e2b714", light: true,
    photo: PHOTOS.insurance,
    socials: ["📘","🔗"],
  },
  "Roma's Pizza & Subs": {
    name: "Roma's Pizza & Subs", cat: "Italian Restaurant",
    tagline: "Hand-Tossed. Oven Fresh.", sub: "Dine-in, carry-out & delivery.",
    addr: "712 Washington St · Clarkesville", phone: "(706) 555-0712",
    hours: "Daily  11am – 9pm",
    coupons: [
      { label: "BOGO", sub: "Medium Pizza", value: "", note: "Tues & Wed · dine-in only · show this ad" },
    ],
    bg: "#fff8f0", accent: "#c0392b", light: false,
    photo: PHOTOS.pizza,
    socials: [],
  },
  "Green Acres Lawn Care": {
    name: "Green Acres Lawn Care", cat: "Lawn & Landscaping",
    tagline: "Your Yard. Our Pride.", sub: "Mowing, mulching & clean-ups.",
    addr: "Serving All of Habersham County", phone: "(706) 555-0399",
    hours: "Mon–Sat  7am – 6pm",
    coupons: [
      { label: "$25 OFF", sub: "First Service", value: "", note: "New customers only · show this ad" },
    ],
    bg: "#052e07", accent: "#22c55e", light: true,
    photo: PHOTOS.lawn,
    socials: [],
  },
};

export function sizeKey(spotSize) {
  return spotSize; // only three sizes: large, medium, small
}

// ─── Large Ad (4"×5") ────────────────────────────────────────────────────────
function LargeAd({ d }) {
  const f = FONT.large;
  const tc = d.light ? "#fff" : "#111";
  const tc2 = d.light ? "rgba(255,255,255,0.82)" : "#555";

  return (
    <div style={{ width: "100%", height: "100%", background: d.bg, overflow: "hidden",
      fontFamily: "sans-serif", display: "flex", flexDirection: "column" }}>

      {/* Photo + overlay header */}
      <div style={{ position: "relative", flexShrink: 0, height: "44%", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${d.photo})`,
          backgroundSize: "cover", backgroundPosition: "center" }} />
        {/* Gradient overlay */}
        <div style={{ position: "absolute", inset: 0,
          background: `linear-gradient(to bottom, transparent 20%, ${d.bg} 100%)` }} />
        {/* Social badges */}
        {d.socials?.length > 0 && (
          <div style={{ position: "absolute", top: 6, right: 8, display: "flex", gap: 3 }}>
            {d.socials.map((s, i) => (
              <span key={i} style={{ fontSize: 10, background: "rgba(0,0,0,0.45)",
                borderRadius: 4, padding: "2px 4px" }}>{s}</span>
            ))}
          </div>
        )}
      </div>

      {/* Business name strip */}
      <div style={{ background: d.accent, padding: "5px 10px", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: f.name, lineHeight: 1.1 }}>
          {d.name}
        </div>
        <div style={{ color: "rgba(255,255,255,0.9)", fontSize: f.cat, fontWeight: 600,
          textAlign: "right", lineHeight: 1.2 }}>{d.cat}</div>
      </div>

      {/* Tagline + contact */}
      <div style={{ padding: "6px 10px 4px", flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: f.tagline, color: tc, lineHeight: 1.2 }}>
          {d.tagline}
        </div>
        <div style={{ fontSize: f.detail, color: tc2, marginTop: 2 }}>⏰ {d.hours}</div>
      </div>

      {/* Coupons row */}
      <div style={{ flex: 1, padding: "4px 8px 6px", display: "flex", gap: 5, minHeight: 0 }}>
        {d.coupons.map((c, i) => (
          <div key={i} style={{
            flex: 1, border: `2px dashed ${d.light ? "rgba(255,255,255,0.55)" : d.accent}`,
            borderRadius: 6, padding: "5px 6px", textAlign: "center",
            display: "flex", flexDirection: "column", justifyContent: "center", gap: 2,
            background: d.light ? "rgba(255,255,255,0.08)" : `${d.accent}15`,
          }}>
            <div style={{ fontSize: f.coupon + 2, fontWeight: 900, color: d.light ? "#fff" : d.accent,
              lineHeight: 1 }}>{c.label}</div>
            <div style={{ fontSize: f.couponSub + 2, fontWeight: 700,
              color: d.light ? "rgba(255,255,255,0.9)" : "#222", lineHeight: 1.2 }}>{c.sub}</div>
            {c.note && (
              <div style={{ fontSize: 7.5, color: d.light ? "rgba(255,255,255,0.62)" : "#888",
                lineHeight: 1.25, marginTop: 1 }}>{c.note}</div>
            )}
          </div>
        ))}
      </div>

      {/* Footer address */}
      <div style={{ background: "rgba(0,0,0,0.18)", padding: "3px 10px",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ color: tc2, fontSize: f.addr, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>📍 {d.addr}</div>
        <div style={{ color: d.light ? "#fff" : d.accent, fontSize: f.phone,
          fontWeight: 800, flexShrink: 0, whiteSpace: "nowrap", marginLeft: 6 }}>{d.phone}</div>
      </div>
    </div>
  );
}

// ─── Medium Ad (3"×4") ───────────────────────────────────────────────────────
function MediumAd({ d }) {
  const f = FONT.medium;
  const tc = d.light ? "#fff" : "#111";
  const tc2 = d.light ? "rgba(255,255,255,0.78)" : "#555";

  return (
    <div style={{ width: "100%", height: "100%", background: d.bg, overflow: "hidden",
      fontFamily: "sans-serif", display: "flex", flexDirection: "column" }}>

      {/* Photo header */}
      <div style={{ position: "relative", flexShrink: 0, height: "38%", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${d.photo})`,
          backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0,
          background: `linear-gradient(to bottom, transparent 10%, ${d.bg} 100%)` }} />
        {d.socials?.length > 0 && (
          <div style={{ position: "absolute", top: 5, right: 6, display: "flex", gap: 3 }}>
            {d.socials.map((s, i) => (
              <span key={i} style={{ fontSize: 9, background: "rgba(0,0,0,0.45)",
                borderRadius: 3, padding: "2px 3px" }}>{s}</span>
            ))}
          </div>
        )}
      </div>

      {/* Accent name bar */}
      <div style={{ background: d.accent, padding: "4px 8px", flexShrink: 0 }}>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: f.name, lineHeight: 1.15 }}>
          {d.name}
        </div>
        <div style={{ color: "rgba(255,255,255,0.88)", fontSize: f.cat, lineHeight: 1.15 }}>
          {d.cat}
        </div>
      </div>

      {/* Tagline */}
      <div style={{ padding: "5px 8px 3px", flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: f.tagline, color: tc, lineHeight: 1.2 }}>
          {d.tagline}
        </div>
        <div style={{ fontSize: f.detail, color: tc2, marginTop: 2 }}>⏰ {d.hours}</div>
      </div>

      {/* Coupon */}
      <div style={{ flex: 1, padding: "3px 7px 5px", minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        {d.coupons.slice(0, 1).map((c, i) => (
          <div key={i} style={{
            border: `2px dashed ${d.light ? "rgba(255,255,255,0.5)" : d.accent}`,
            borderRadius: 5, padding: "5px 6px", textAlign: "center",
            background: d.light ? "rgba(255,255,255,0.08)" : `${d.accent}15`,
          }}>
            <div style={{ fontSize: f.coupon + 1, fontWeight: 900,
              color: d.light ? "#fff" : d.accent, lineHeight: 1 }}>{c.label}</div>
            <div style={{ fontSize: f.couponSub + 1, fontWeight: 700,
              color: d.light ? "rgba(255,255,255,0.88)" : "#333", lineHeight: 1.2 }}>{c.sub}</div>
            {c.note && (
              <div style={{ fontSize: 7, color: d.light ? "rgba(255,255,255,0.6)" : "#888",
                marginTop: 2, lineHeight: 1.2 }}>{c.note}</div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ background: "rgba(0,0,0,0.18)", padding: "3px 8px",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ color: tc2, fontSize: f.addr, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>📍 {d.addr.split("·")[0]}</div>
        <div style={{ color: d.light ? "#fff" : d.accent, fontSize: f.phone,
          fontWeight: 800, flexShrink: 0, whiteSpace: "nowrap", marginLeft: 4 }}>
          {d.phone.replace("(706) ", "")}
        </div>
      </div>
    </div>
  );
}

// ─── Small Ad (3"×2") ────────────────────────────────────────────────────────
function SmallAd({ d }) {
  const f = FONT.small;
  const tc = d.light ? "#fff" : "#111";
  const tc2 = d.light ? "rgba(255,255,255,0.78)" : "#555";

  return (
    <div style={{ width: "100%", height: "100%", background: d.bg, overflow: "hidden",
      fontFamily: "sans-serif", display: "flex", flexDirection: "column" }}>

      {/* Compact header */}
      <div style={{ background: d.accent, padding: "4px 8px", flexShrink: 0 }}>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: f.name, lineHeight: 1.15 }}>
          {d.name}
        </div>
        <div style={{ color: "rgba(255,255,255,0.88)", fontSize: f.cat - 0.5, lineHeight: 1.1 }}>
          {d.cat}
        </div>
      </div>

      {/* Coupon — center focus */}
      <div style={{ flex: 1, padding: "4px 7px", display: "flex", gap: 5, alignItems: "center", minHeight: 0 }}>
        <div style={{ flex: 1, border: `1.5px dashed ${d.light ? "rgba(255,255,255,0.5)" : d.accent}`,
          borderRadius: 4, padding: "4px 5px", textAlign: "center",
          background: d.light ? "rgba(255,255,255,0.08)" : `${d.accent}15` }}>
          <div style={{ fontSize: f.coupon + 1, fontWeight: 900,
            color: d.light ? "#fff" : d.accent, lineHeight: 1 }}>
            {d.coupons[0]?.label}
          </div>
          <div style={{ fontSize: f.couponSub, fontWeight: 700,
            color: d.light ? "rgba(255,255,255,0.85)" : "#333", lineHeight: 1.2 }}>
            {d.coupons[0]?.sub}
          </div>
          {d.coupons[0]?.note && (
            <div style={{ fontSize: 6.5, color: d.light ? "rgba(255,255,255,0.55)" : "#888",
              marginTop: 1, lineHeight: 1.2 }}>{d.coupons[0].note}</div>
          )}
        </div>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div style={{ fontSize: f.phone - 0.5, fontWeight: 800,
            color: d.light ? "#fff" : d.accent, lineHeight: 1.3 }}>
            {d.phone.replace("(706) ", "")}
          </div>
          <div style={{ fontSize: 6.5, color: tc2, lineHeight: 1.3 }}>
            {d.hours.split(" ")[0]}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Public Components ────────────────────────────────────────────────────────
export function PaidAd({ spot }) {
  const d = ADS[spot.businessName];

  if (!d) {
    return (
      <div style={{ width: "100%", height: "100%", background: "#f9fafb",
        border: "1px solid #e5e7eb", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 4, fontFamily: "sans-serif" }}>
        <span style={{ fontSize: 22 }}>📌</span>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textAlign: "center", padding: "0 6px" }}>
          {spot.businessName}
        </div>
        <div style={{ fontSize: 9, color: "#9ca3af" }}>Reserved</div>
      </div>
    );
  }

  if (spot.size === "large") return <LargeAd d={d} />;
  if (spot.size === "medium") return <MediumAd d={d} />;
  return <SmallAd d={d} />;
}

export function AvailableSpot({ spot, isSelected, onClick }) {
  const sz = SIZES[spot.size];
  const isSmall = spot.size === "small";

  return (
    <div onClick={onClick} style={{
      width: "100%", height: "100%", borderRadius: 3, cursor: "pointer",
      background: isSelected ? "#fef9c3" : "#f0fdf4",
      border: isSelected ? "2.5px solid #ca8a04" : "2px dashed #22c55e",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: isSmall ? 3 : 6, padding: isSmall ? "6px 4px" : "10px 8px",
      textAlign: "center", transition: "all 0.15s", boxSizing: "border-box",
    }}>
      <div style={{ fontSize: isSmall ? 18 : 26 }}>{isSelected ? "✅" : "➕"}</div>
      <div style={{ fontWeight: 800, fontSize: isSmall ? 9 : 11,
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
