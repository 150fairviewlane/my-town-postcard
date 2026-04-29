import { useState, useRef, useMemo, useEffect } from "react";
import { resolvePhotos } from "./industryImages.js";

// ─── Constants ───────────────────────────────────────────────────────────────

export const INDUSTRIES = [
  "Restaurant", "Pizza Restaurant", "Mexican Restaurant", "Chinese Restaurant",
  "Breakfast and Cafe", "Bar and Grill", "Italian Restaurant", "Bakery",
  "Dentist", "Medical and Healthcare", "HVAC and Heating and Cooling",
  "Lawn and Landscaping", "Real Estate", "Insurance", "Auto Repair",
  "Salon and Beauty", "Gym and Fitness", "Retail Shop", "Home Services",
  "Pet Services", "Financial Services", "Other",
];

export const INDUSTRY_TEMPLATES = {
  "Restaurant":          ["RESTAURANT-A","RESTAURANT-B","RESTAURANT-C","RESTAURANT-D"],
  "Pizza Restaurant":    ["RESTAURANT-A","RESTAURANT-C","RESTAURANT-B","RESTAURANT-D"],
  "Mexican Restaurant":  ["RESTAURANT-D","RESTAURANT-C","RESTAURANT-A","RESTAURANT-B"],
  "Chinese Restaurant":  ["RESTAURANT-B","RESTAURANT-A","RESTAURANT-D","RESTAURANT-C"],
  "Breakfast and Cafe":  ["RESTAURANT-C","RESTAURANT-A","RESTAURANT-B","RESTAURANT-D"],
  "Bar and Grill":       ["RESTAURANT-A","RESTAURANT-D","RESTAURANT-B","RESTAURANT-C"],
  "Italian Restaurant":  ["RESTAURANT-A","RESTAURANT-B","RESTAURANT-C","RESTAURANT-D"],
  "Bakery":              ["RESTAURANT-C","RESTAURANT-B","RESTAURANT-A","RESTAURANT-D"],
  "Dentist":                       ["DENTAL-A","DENTAL-B"],
  "Medical and Healthcare":        ["DENTAL-A","DENTAL-B"],
  "HVAC and Heating and Cooling":  ["HVAC-A","HVAC-B"],
  "Lawn and Landscaping":          ["LAWN-A","LAWN-B"],
  "Real Estate":                   ["REALTY-A","REALTY-B"],
  "Insurance":                     ["INSURANCE-A","INSURANCE-B"],
  "Auto Repair":                   ["GENERAL-A","GENERAL-B"],
  "Salon and Beauty":              ["GENERAL-A","GENERAL-B"],
  "Gym and Fitness":               ["GENERAL-A","GENERAL-B"],
  "Retail Shop":                   ["GENERAL-A","GENERAL-B"],
  "Home Services":                 ["HVAC-B","GENERAL-B"],
  "Pet Services":                  ["GENERAL-A","GENERAL-B"],
  "Financial Services":            ["INSURANCE-B","GENERAL-A"],
  "Other":                         ["GENERAL-A","GENERAL-B"],
};

const RESTAURANT_INDUSTRIES = new Set([
  "Restaurant","Pizza Restaurant","Mexican Restaurant","Chinese Restaurant",
  "Breakfast and Cafe","Bar and Grill","Italian Restaurant","Bakery",
]);

export const INDUSTRY_ACCENT_COLORS = {
  "Restaurant":"#991b1b","Pizza Restaurant":"#991b1b","Mexican Restaurant":"#991b1b",
  "Chinese Restaurant":"#991b1b","Breakfast and Cafe":"#991b1b","Bar and Grill":"#991b1b",
  "Italian Restaurant":"#991b1b","Bakery":"#991b1b",
  "Dentist":"#1e3a5f","Medical and Healthcare":"#1e3a5f",
  "HVAC and Heating and Cooling":"#003f6b",
  "Lawn and Landscaping":"#2d6a4f","Real Estate":"#2d6a4f",
  "Insurance":"#1a1a2e","Financial Services":"#1a1a2e",
  "Auto Repair":"#374151","Salon and Beauty":"#374151","Gym and Fitness":"#374151",
  "Retail Shop":"#374151","Home Services":"#374151","Pet Services":"#374151",
  "Other":"#374151",
};

// Unbiased Fisher–Yates shuffle
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function selectTemplates(industry) {
  const ids = INDUSTRY_TEMPLATES[industry] || ["GENERAL-A","GENERAL-B"];
  if (RESTAURANT_INDUSTRIES.has(industry) && ids.length > 2) {
    // Always pin the polished RESTAURANT-A so customers see the showcase
    // template; rotate the second slot across the remaining variants.
    const others = ids.filter(id => id !== "RESTAURANT-A");
    return ["RESTAURANT-A", shuffle(others)[0]];
  }
  return ids.slice(0, 2);
}

const SIZE_ASPECT = { large: 4 / 5, medium: 3 / 4, small: 3 / 2 };

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function scaleFactor(size) {
  return size === "large" ? 1 : size === "medium" ? 0.72 : 0.55;
}

// Pick a contrasting text color for a hex bg
function contrastText(hex) {
  if (!hex || !hex.startsWith("#")) return "#fff";
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? "#111" : "#fff";
}

// Lighten/darken hex
function shade(hex, amt) {
  if (!hex || !hex.startsWith("#")) return hex;
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const n = parseInt(h, 16);
  let r = (n >> 16) + amt;
  let g = ((n >> 8) & 0xff) + amt;
  let b = (n & 0xff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

// ─── Template Components ─────────────────────────────────────────────────────
// All accept: { businessName, tagline, offer, offerFinePrint, address, phone,
//                website, hours, logo, photos[], size, accentColor }

const baseBox = { width: "100%", height: "100%", overflow: "hidden",
  position: "relative", fontFamily: "sans-serif", boxSizing: "border-box" };

// helper: small Logo Badge (image or initials)
function LogoBadge({ logo, businessName, size = 56, bg = "#fff", color = "#111", border }) {
  const initials = (businessName || "AD").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: "50%",
      background: bg, color, border: border || "2px solid rgba(255,255,255,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
      fontWeight: 900, fontFamily: "Georgia, serif", fontSize: size * 0.35 }}>
      {logo
        ? <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span>{initials}</span>}
    </div>
  );
}

// ─── RESTAURANT-A: Hero Photo + Logo Band + Coupon Row + Contact Strip ───────
// Industry-leading layout for restaurants: full-bleed hero food photo, dark
// scrim, big serif name with logo badge, 1-2 dashed coupons, and a tight
// contact strip footer. If no photo is uploaded, we deterministically pick a
// fallback from the industry library so the ad always looks professional.
export function RestaurantA({ businessName, tagline, offer, offerFinePrint,
  offer2, offer2FinePrint, address, phone, hours, website, logo,
  photos = [], size, accentColor, industry = "Restaurant" }) {
  const f = scaleFactor(size);
  const resolved = resolvePhotos(industry, businessName, photos, 1);
  const heroPhoto = resolved[0];
  const isLarge = size === "large";
  const isMedium = size === "medium";

  // Hero band height: keep food the visual hero, leave room for coupons
  const heroPct = (offer && offer2) ? "50%" : offer ? "55%" : "62%";

  // Coupon helper
  const Coupon = ({ headline, fineline, sub, accent = "#fde8a0" }) => (
    <div style={{
      flex: 1, position: "relative",
      border: `${1.5 * f}px dashed ${accent}`,
      borderRadius: 6 * f,
      padding: `${5 * f}px ${6 * f}px`,
      background: "rgba(0,0,0,0.32)",
      textAlign: "center",
      minWidth: 0,
    }}>
      <div style={{ position: "absolute", top: -7 * f, left: "50%",
        transform: "translateX(-50%)", color: accent,
        fontSize: 11 * f, lineHeight: 1, background: accentColor, padding: "0 3px" }}>✂</div>
      <div style={{ color: accent, fontWeight: 900,
        fontSize: 12 * f, lineHeight: 1.05,
        fontFamily: "Georgia, serif", letterSpacing: 0.2 }}>
        {headline}
      </div>
      {sub && <div style={{ color: "#fff", fontWeight: 700,
        fontSize: 8.5 * f, marginTop: 1.5 * f, lineHeight: 1.2 }}>{sub}</div>}
      {fineline && isLarge && <div style={{ color: "rgba(255,255,255,0.6)",
        fontSize: 6.5 * f, marginTop: 2.5 * f, lineHeight: 1.25 }}>{fineline}</div>}
    </div>
  );

  return (
    <div style={{ ...baseBox, background: shade(accentColor, -40), color: "#fff" }}>
      {/* Hero photo band — falls back to a tinted gradient if no photo is available */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: heroPct,
        ...(heroPhoto
          ? { backgroundImage: `url(${heroPhoto})`,
              backgroundSize: "cover", backgroundPosition: "center" }
          : { background: `linear-gradient(135deg, ${shade(accentColor, 10)} 0%, ${shade(accentColor, -25)} 100%)` })
      }} />
      {/* Bottom-fade scrim over the hero photo so the title is legible */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: heroPct,
        background: `linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.05) 45%, ${shade(accentColor, -50)} 100%)` }} />

      {/* Phone pill — top right of hero */}
      {phone && (
        <div style={{ position: "absolute", top: 7 * f, right: 7 * f, zIndex: 3,
          background: accentColor, color: contrastText(accentColor),
          padding: `${3 * f}px ${8 * f}px`,
          borderRadius: 999, fontWeight: 800, fontSize: 9.5 * f,
          letterSpacing: 0.3,
          border: "1.5px solid rgba(255,255,255,0.85)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.4)" }}>
          ☎ {phone}
        </div>
      )}

      {/* Logo + Business Name band — overlapping bottom of hero */}
      <div style={{ position: "absolute",
        top: `calc(${heroPct} - ${22 * f}px)`, left: 0, right: 0, zIndex: 3,
        display: "flex", alignItems: "center", gap: 8 * f,
        padding: `0 ${10 * f}px` }}>
        <LogoBadge logo={logo} businessName={businessName}
          size={(isLarge ? 50 : isMedium ? 40 : 32) * f}
          bg="#fff" color={accentColor}
          border={`2.5px solid ${accentColor}`} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 900,
            fontSize: (isLarge ? 17 : isMedium ? 14 : 11) * f,
            fontFamily: "Georgia, 'Times New Roman', serif",
            lineHeight: 1.05, letterSpacing: 0.2,
            textShadow: "0 2px 8px rgba(0,0,0,0.7)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {businessName || "Your Restaurant"}
          </div>
          {tagline && <div style={{ color: "rgba(255,236,196,0.95)",
            fontSize: (isLarge ? 9.5 : 8) * f, fontStyle: "italic",
            fontFamily: "Georgia, serif", marginTop: 1 * f,
            textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {tagline}
          </div>}
        </div>
      </div>

      {/* Coupon row */}
      {offer && (
        <div style={{ position: "absolute", left: 0, right: 0,
          top: `calc(${heroPct} + ${(isLarge ? 16 : 12) * f}px)`,
          padding: `0 ${8 * f}px`,
          display: "flex", gap: 6 * f, zIndex: 2 }}>
          <Coupon
            headline={offer}
            fineline={offerFinePrint}
            sub={offer2 ? null : "with this card"} />
          {offer2 && (
            <Coupon
              headline={offer2}
              fineline={offer2FinePrint}
              sub={null} />
          )}
        </div>
      )}

      {/* Contact strip — bottom */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
        background: shade(accentColor, -55),
        borderTop: `${1.5 * f}px solid rgba(255,255,255,0.18)`,
        padding: `${4 * f}px ${8 * f}px`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 6 * f, zIndex: 4 }}>
        <div style={{ color: "rgba(255,255,255,0.92)",
          fontSize: (isLarge ? 8.5 : 7.5) * f, fontWeight: 600,
          lineHeight: 1.25, minWidth: 0, flex: 1 }}>
          {address && <div style={{ whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis" }}>📍 {address}</div>}
          {hours && <div style={{ whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis", marginTop: 0.5 * f }}>⏰ {hours}</div>}
        </div>
        {website && isLarge && (
          <div style={{ color: "#fde8a0", fontSize: 7.5 * f, fontWeight: 700,
            whiteSpace: "nowrap" }}>🌐 {website}</div>
        )}
      </div>
    </div>
  );
}

// ─── RESTAURANT-B: The Board (chalkboard) ────────────────────────────────────
function RestaurantB({ businessName, tagline, offer, offerFinePrint, address, phone, hours,
  logo, size, accentColor }) {
  const f = scaleFactor(size);
  return (
    <div style={{ ...baseBox,
      background: "radial-gradient(ellipse at center, #2d3a2d 0%, #1a2118 100%)",
      border: `${4 * f}px solid #4a3520`, color: "#f5f1e6" }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.05,
        backgroundImage: "repeating-linear-gradient(45deg, #fff 0px, #fff 1px, transparent 1px, transparent 6px)",
        pointerEvents: "none" }} />
      <div style={{ position: "relative", padding: `${10 * f}px ${10 * f}px`,
        textAlign: "center", display: "flex", flexDirection: "column",
        alignItems: "center", height: "100%", boxSizing: "border-box" }}>
        <LogoBadge logo={logo} businessName={businessName} size={50 * f}
          bg="#f5f1e6" color="#1a2118" border="3px solid #f5f1e6" />
        <div style={{ width: "85%", height: 1, background: "rgba(245,241,230,0.4)",
          margin: `${6 * f}px 0` }} />
        <div style={{ color: "#f5f1e6", fontWeight: 900, fontSize: 18 * f,
          fontFamily: "'Caveat', 'Comic Sans MS', cursive, Georgia, serif", lineHeight: 1.1 }}>
          {businessName || "Your Restaurant"}
        </div>
        {tagline && <div style={{ color: "#d4c896", fontSize: 11 * f, fontStyle: "italic",
          marginTop: 3 * f, fontFamily: "Georgia, serif" }}>~ {tagline} ~</div>}
        <div style={{ width: "60%", height: 1, background: "rgba(245,241,230,0.25)",
          margin: `${6 * f}px 0` }} />
        {offer && (
          <div style={{ marginTop: "auto", border: `2px dashed ${accentColor === "#fff" ? "#d4c896" : "#d4c896"}`,
            borderRadius: 6, padding: `${5 * f}px ${10 * f}px`, background: "rgba(0,0,0,0.25)",
            color: "#f5f1e6", fontWeight: 900, fontSize: 13 * f, lineHeight: 1.2 }}>
            {offer}
            {offerFinePrint && <div style={{ fontSize: 8 * f, fontWeight: 400,
              opacity: 0.7, marginTop: 2 }}>{offerFinePrint}</div>}
          </div>
        )}
        <div style={{ marginTop: 6 * f, fontSize: 10 * f, color: "#d4c896", lineHeight: 1.4 }}>
          {phone && <div style={{ fontWeight: 700 }}>☎ {phone}</div>}
          {address && size === "large" && <div>{address}</div>}
          {hours && size === "large" && <div>{hours}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── RESTAURANT-C: The Fresh ─────────────────────────────────────────────────
function RestaurantC({ businessName, tagline, offer, offerFinePrint, address, phone, hours,
  logo, photos = [], size, accentColor }) {
  const f = scaleFactor(size);
  const heroPhoto = photos[0] || photos[1] || null;
  const horizontal = size === "small";
  return (
    <div style={{ ...baseBox, background: "#ffffff", color: "#111",
      display: "flex", flexDirection: horizontal ? "row" : "column" }}>
      <div style={{ flex: horizontal ? "0 0 38%" : "0 0 45%", position: "relative",
        background: heroPhoto ? `url(${heroPhoto}) center/cover` : shade(accentColor, 60) }}>
        {!heroPhoto && (
          <div style={{ position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.7)", fontSize: 36 * f }}>🍽️</div>
        )}
      </div>
      <div style={{ flex: 1, padding: `${8 * f}px ${10 * f}px`, display: "flex",
        flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 * f }}>
            <LogoBadge logo={logo} businessName={businessName} size={26 * f}
              bg={accentColor} color={contrastText(accentColor)} border="none" />
            <div style={{ color: accentColor, fontWeight: 900, fontSize: 13 * f,
              fontFamily: "Georgia, serif", lineHeight: 1.1, overflow: "hidden",
              textOverflow: "ellipsis" }}>{businessName || "Your Restaurant"}</div>
          </div>
          {tagline && <div style={{ color: "#555", fontSize: 10 * f, marginTop: 4 * f,
            lineHeight: 1.3 }}>{tagline}</div>}
        </div>
        {offer && (
          <div style={{ background: accentColor, color: contrastText(accentColor),
            borderRadius: 999, padding: `${4 * f}px ${10 * f}px`, fontWeight: 900,
            fontSize: 11 * f, textAlign: "center", alignSelf: "flex-start", margin: `${6 * f}px 0` }}>
            {offer}
          </div>
        )}
        <div style={{ fontSize: 9 * f, color: "#555", lineHeight: 1.4 }}>
          {phone && <div style={{ color: accentColor, fontWeight: 800 }}>☎ {phone}</div>}
          {size === "large" && address && <div>📍 {address}</div>}
          {size === "large" && hours && <div>⏰ {hours}</div>}
          {offerFinePrint && size !== "small" && (
            <div style={{ fontSize: 7 * f, color: "#999", marginTop: 2 }}>{offerFinePrint}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── RESTAURANT-D: The Corner Spot ───────────────────────────────────────────
function RestaurantD({ businessName, tagline, offer, offerFinePrint, address, phone,
  logo, photos = [], size, accentColor }) {
  const f = scaleFactor(size);
  const heroPhoto = photos[0] || photos[1] || null;
  return (
    <div style={{ ...baseBox, background: "#fafafa", color: "#111" }}>
      <div style={{ position: "absolute", inset: 0, background: accentColor,
        clipPath: "polygon(0 0, 70% 0, 0 70%)" }} />
      {heroPhoto && (
        <div style={{ position: "absolute", bottom: 30 * f, right: 8 * f,
          width: 50 * f, height: 50 * f, borderRadius: "50%",
          background: `url(${heroPhoto}) center/cover`,
          border: `3px solid #fff`, boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }} />
      )}
      <div style={{ position: "absolute", top: 6 * f, left: 6 * f, zIndex: 2 }}>
        <LogoBadge logo={logo} businessName={businessName} size={40 * f}
          bg="#fff" color={accentColor} border={`2px solid ${shade(accentColor, -20)}`} />
      </div>
      <div style={{ position: "absolute", top: "42%", left: 10 * f, right: 10 * f,
        textAlign: "center", zIndex: 2 }}>
        {offer && (
          <div style={{ color: accentColor, fontWeight: 900, fontSize: 22 * f,
            fontFamily: "Georgia, serif", lineHeight: 1, letterSpacing: -0.5 }}>
            {offer}
          </div>
        )}
        {tagline && <div style={{ color: "#444", fontSize: 11 * f, fontStyle: "italic",
          marginTop: 4 * f }}>{tagline}</div>}
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
        background: shade(accentColor, -30), color: "#fff",
        padding: `${5 * f}px ${10 * f}px`, fontSize: 9 * f, zIndex: 2,
        display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap" }}>{businessName || "Your Restaurant"}</div>
        {phone && <div style={{ fontWeight: 800 }}>{phone}</div>}
      </div>
      {address && size === "large" && (
        <div style={{ position: "absolute", bottom: 24, left: 10, right: 10,
          textAlign: "center", color: "#666", fontSize: 8 * f, zIndex: 2 }}>📍 {address}</div>
      )}
      {offerFinePrint && size === "large" && (
        <div style={{ position: "absolute", bottom: 38, left: 10, right: 10,
          textAlign: "center", color: "#666", fontSize: 7 * f, zIndex: 2 }}>{offerFinePrint}</div>
      )}
    </div>
  );
}

// ─── DENTAL-A: Clean Smile ───────────────────────────────────────────────────
function DentalA({ businessName, tagline, offer, offerFinePrint, address, phone, hours,
  logo, size, accentColor }) {
  const f = scaleFactor(size);
  const gold = "#d4a017";
  return (
    <div style={{ ...baseBox, background: "#fff", color: "#111",
      display: "flex", flexDirection: "column" }}>
      <div style={{ background: accentColor, padding: `${10 * f}px ${10 * f}px`,
        display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <LogoBadge logo={logo} businessName={businessName} size={42 * f}
          bg={gold} color="#fff" border="2px solid rgba(255,255,255,0.6)" />
        <div style={{ color: "#fff", fontWeight: 900, fontSize: 13 * f,
          fontFamily: "Georgia, serif", marginTop: 5 * f, textAlign: "center", lineHeight: 1.15 }}>
          {businessName || "Your Practice"}
        </div>
      </div>
      <div style={{ flex: 1, padding: `${8 * f}px ${10 * f}px`, minHeight: 0 }}>
        <div style={{ color: accentColor, fontWeight: 900, fontSize: 14 * f,
          fontFamily: "Georgia, serif", lineHeight: 1.2, marginBottom: 5 * f }}>
          {tagline || "Accepting New Patients!"}
        </div>
        {size === "large" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {["Preventive Care", "Cosmetic Dentistry", "Family-Friendly"].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 14, height: 14, borderRadius: "50%", background: gold,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  color: "#fff", fontSize: 7, fontWeight: 900 }}>✓</div>
                <span style={{ color: "#333", fontSize: 10 * f }}>{s}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 9 * f, color: "#555", marginTop: 6 * f, lineHeight: 1.4 }}>
          {phone && <div style={{ color: accentColor, fontWeight: 800 }}>☎ {phone}</div>}
          {address && size !== "small" && <div>📍 {address}</div>}
          {hours && size === "large" && <div>⏰ {hours}</div>}
        </div>
      </div>
      {offer && (
        <div style={{ background: accentColor, padding: `${6 * f}px ${10 * f}px`,
          borderTop: `3px solid ${gold}`, flexShrink: 0 }}>
          <div style={{ border: `2px dashed ${gold}`, borderRadius: 5,
            padding: `${4 * f}px ${8 * f}px`, textAlign: "center" }}>
            <div style={{ color: gold, fontWeight: 900, fontSize: 12 * f, lineHeight: 1.1 }}>{offer}</div>
            {offerFinePrint && <div style={{ color: "rgba(255,255,255,0.7)",
              fontSize: 7 * f, marginTop: 1 }}>{offerFinePrint}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DENTAL-B: Modern Care ───────────────────────────────────────────────────
function DentalB({ businessName, tagline, offer, offerFinePrint, address, phone, hours,
  logo, size, accentColor }) {
  const f = scaleFactor(size);
  const horiz = size !== "small";
  return (
    <div style={{ ...baseBox,
      background: "linear-gradient(135deg, #ffffff 0%, #e0f2fe 100%)", color: "#111",
      display: "flex", flexDirection: horiz ? "row" : "column",
      padding: `${8 * f}px ${10 * f}px`, gap: 10 * f }}>
      <div style={{ flexShrink: 0, display: "flex",
        flexDirection: horiz ? "column" : "row",
        alignItems: "center", justifyContent: horiz ? "flex-start" : "center", gap: 6 * f }}>
        <LogoBadge logo={logo} businessName={businessName} size={50 * f}
          bg={accentColor} color="#fff" border={`2px solid ${shade(accentColor, 80)}`} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
        justifyContent: "space-between" }}>
        <div>
          <div style={{ color: accentColor, fontWeight: 900, fontSize: 13 * f,
            fontFamily: "Georgia, serif", lineHeight: 1.15, marginBottom: 3 }}>
            {businessName || "Your Practice"}
          </div>
          <div style={{ color: "#333", fontWeight: 800, fontSize: 11 * f, lineHeight: 1.2 }}>
            {tagline || "Now Accepting New Patients"}
          </div>
          {size === "large" && (
            <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 3 }}>
              {["✓ Preventive Care", "✓ Whitening", "✓ Family Dentistry"].map((s, i) => (
                <div key={i} style={{ color: "#444", fontSize: 9 * f }}>{s}</div>
              ))}
            </div>
          )}
        </div>
        {offer && (
          <div style={{ background: "#fff", border: `2px solid ${accentColor}`,
            borderRadius: 10, padding: `${4 * f}px ${8 * f}px`, marginTop: 4 * f,
            textAlign: "center" }}>
            <div style={{ color: accentColor, fontWeight: 900, fontSize: 11 * f, lineHeight: 1.1 }}>{offer}</div>
            {offerFinePrint && <div style={{ color: "#888", fontSize: 7 * f }}>{offerFinePrint}</div>}
          </div>
        )}
        <div style={{ fontSize: 8.5 * f, color: "#555", marginTop: 4, lineHeight: 1.4 }}>
          {phone && <div style={{ fontWeight: 800, color: accentColor }}>☎ {phone}</div>}
          {address && size === "large" && <div>📍 {address}</div>}
          {hours && size === "large" && <div>⏰ {hours}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── HVAC-A: Emergency ───────────────────────────────────────────────────────
function HvacA({ businessName, tagline, offer, offerFinePrint, address, phone,
  logo, size, accentColor }) {
  const f = scaleFactor(size);
  return (
    <div style={{ ...baseBox,
      background: "linear-gradient(160deg, #001a2e 0%, #000 100%)", color: "#fff" }}>
      <div style={{ position: "absolute", top: 8 * f, left: 8 * f,
        background: "#dc2626", color: "#fff", padding: `${3 * f}px ${8 * f}px`,
        borderRadius: 4, fontSize: 9 * f, fontWeight: 900, letterSpacing: 1.5,
        boxShadow: "0 2px 8px rgba(220,38,38,0.6)" }}>24/7 EMERGENCY</div>
      <div style={{ position: "absolute", top: 6 * f, right: 6 * f,
        color: "rgba(255,255,255,0.18)", fontSize: 28 * f, lineHeight: 1 }}>❄</div>
      <div style={{ position: "absolute", bottom: "30%", right: 10 * f,
        color: "rgba(255,150,50,0.18)", fontSize: 24 * f, lineHeight: 1 }}>🔥</div>
      <div style={{ position: "absolute", inset: 0, padding: `${36 * f}px ${10 * f}px ${44 * f}px`,
        display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center" }}>
        <LogoBadge logo={logo} businessName={businessName} size={36 * f}
          bg={accentColor} color="#fff"
          border="2px solid rgba(255,255,255,0.4)" />
        <div style={{ alignSelf: "center" }}>
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 13 * f,
            fontFamily: "Georgia, serif", marginTop: 5 * f, lineHeight: 1.15 }}>
            {businessName || "Your HVAC Co."}
          </div>
          {tagline && <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 9 * f,
            marginTop: 2 }}>{tagline}</div>}
        </div>
        {phone && (
          <div style={{ color: "#fbbf24", fontWeight: 900, fontSize: 22 * f,
            marginTop: 8 * f, letterSpacing: 0.5 }}>☎ {phone}</div>
        )}
        {size === "large" && address && (
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 8 * f, marginTop: 4 }}>📍 {address}</div>
        )}
      </div>
      {offer && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
          background: "#dc2626", color: "#fff", padding: `${6 * f}px ${10 * f}px`,
          textAlign: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 13 * f, lineHeight: 1.1 }}>{offer}</div>
          {offerFinePrint && <div style={{ fontSize: 7 * f, opacity: 0.85, marginTop: 1 }}>{offerFinePrint}</div>}
        </div>
      )}
    </div>
  );
}

// ─── HVAC-B: Pro Service ─────────────────────────────────────────────────────
function HvacB({ businessName, tagline, offer, offerFinePrint, address, phone, hours,
  logo, size, accentColor }) {
  const f = scaleFactor(size);
  return (
    <div style={{ ...baseBox, background: "#fff", color: "#111" }}>
      <div style={{ position: "absolute", inset: 0, background: accentColor,
        clipPath: "polygon(0 0, 100% 0, 100% 50%, 0 65%)" }} />
      <div style={{ position: "absolute", top: 6 * f, left: 10 * f, right: 10 * f,
        zIndex: 2, color: "#fff" }}>
        <div style={{ fontWeight: 900, fontSize: 16 * f, fontFamily: "Georgia, serif",
          lineHeight: 1.1, textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
          {businessName || "Your HVAC Co."}
        </div>
        {tagline && <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 10 * f,
          marginTop: 2 }}>{tagline}</div>}
      </div>
      <div style={{ position: "absolute", top: "48%", left: "50%",
        transform: "translate(-50%, -50%)", zIndex: 3 }}>
        <LogoBadge logo={logo} businessName={businessName} size={42 * f}
          bg="#fff" color={accentColor} border={`3px solid ${accentColor}`} />
      </div>
      <div style={{ position: "absolute", left: 10 * f, right: 10 * f,
        bottom: offer ? 36 : 8, top: "65%", zIndex: 2, color: "#222" }}>
        {size === "large" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 9 * f }}>
            <div>✓ Heating &amp; Cooling Repair</div>
            <div>✓ A/C Tune-Ups</div>
            <div>✓ New System Install</div>
          </div>
        )}
        <div style={{ fontSize: 9 * f, color: "#555", marginTop: 4 }}>
          {phone && <div style={{ color: accentColor, fontWeight: 800 }}>☎ {phone}</div>}
          {address && size !== "small" && <div>{address}</div>}
          {hours && size === "large" && <div>{hours}</div>}
        </div>
      </div>
      {offer && (
        <div style={{ position: "absolute", bottom: 6 * f, left: 8 * f, right: 8 * f,
          border: `2px solid ${accentColor}`, borderRadius: 6, padding: `${3 * f}px ${6 * f}px`,
          textAlign: "center", background: "#fff", zIndex: 4 }}>
          <div style={{ color: accentColor, fontWeight: 900, fontSize: 11 * f, lineHeight: 1.1 }}>{offer}</div>
          {offerFinePrint && <div style={{ color: "#777", fontSize: 7 * f }}>{offerFinePrint}</div>}
        </div>
      )}
    </div>
  );
}

// ─── REALTY-A: The Listing ───────────────────────────────────────────────────
function RealtyA({ businessName, tagline, offer, offerFinePrint, address, phone, website,
  logo, photos = [], size, accentColor }) {
  const f = scaleFactor(size);
  const agentPhoto = photos[0] || null;
  const gold = "#c9a227";
  return (
    <div style={{ ...baseBox, background: "#faf6ed", color: "#1a1a1a",
      border: `${3 * f}px solid ${gold}`, padding: `${6 * f}px`, boxSizing: "border-box" }}>
      <div style={{ width: "100%", height: "100%", border: `1px solid ${accentColor}`,
        padding: `${8 * f}px ${10 * f}px`, boxSizing: "border-box",
        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        {agentPhoto ? (
          <div style={{ width: 56 * f, height: 56 * f, borderRadius: "50%",
            background: `url(${agentPhoto}) center/cover`,
            border: `3px solid ${gold}`, flexShrink: 0 }} />
        ) : (
          <div style={{ width: 56 * f, height: 56 * f, borderRadius: "50%",
            background: shade(accentColor, 100), display: "flex", alignItems: "center",
            justifyContent: "center", border: `3px solid ${gold}`, flexShrink: 0,
            fontSize: 28 * f }}>👤</div>
        )}
        <div style={{ color: accentColor, fontWeight: 900, fontSize: 14 * f,
          fontFamily: "Georgia, serif", marginTop: 5 * f, lineHeight: 1.15 }}>
          {businessName || "Your Realty"}
        </div>
        {tagline && <div style={{ color: "#666", fontSize: 10 * f, fontStyle: "italic",
          marginTop: 2, fontFamily: "Georgia, serif" }}>"{tagline}"</div>}
        {size === "large" && (
          <div style={{ marginTop: 5, display: "flex", gap: 8, color: "#555", fontSize: 9 * f }}>
            <span>Buy</span><span style={{ color: gold }}>·</span>
            <span>Sell</span><span style={{ color: gold }}>·</span>
            <span>Invest</span>
          </div>
        )}
        {offer && (
          <div style={{ marginTop: 6, background: gold, color: "#fff",
            padding: `${3 * f}px ${10 * f}px`, borderRadius: 4, fontSize: 10 * f, fontWeight: 800 }}>
            {offer}
          </div>
        )}
        <div style={{ marginTop: "auto", paddingTop: 5, fontSize: 9 * f, color: "#555",
          lineHeight: 1.4 }}>
          {phone && <div style={{ fontWeight: 800, color: accentColor }}>☎ {phone}</div>}
          {website && size !== "small" && <div>{website}</div>}
          {address && size === "large" && <div>{address}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── REALTY-B: Bold Sale ─────────────────────────────────────────────────────
function RealtyB({ businessName, tagline, offer, offerFinePrint, address, phone,
  logo, size, accentColor }) {
  const f = scaleFactor(size);
  const gold = "#fbbf24";
  return (
    <div style={{ ...baseBox, background: "#0f3a2e", color: "#fff" }}>
      <div style={{ position: "absolute", inset: 0,
        backgroundImage: "radial-gradient(circle at top right, rgba(251,191,36,0.15), transparent 60%)" }} />
      <div style={{ position: "relative", padding: `${10 * f}px ${10 * f}px`,
        height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 * f, paddingBottom: 6 * f,
          borderBottom: `1px solid ${gold}` }}>
          <LogoBadge logo={logo} businessName={businessName} size={36 * f}
            bg={gold} color="#0f3a2e" border="none" />
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 13 * f,
            fontFamily: "Georgia, serif", lineHeight: 1.1, overflow: "hidden",
            textOverflow: "ellipsis" }}>{businessName || "Your Realty"}</div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column",
          justifyContent: "center", textAlign: "center", padding: `${4 * f}px 0` }}>
          <div style={{ color: gold, fontSize: 9 * f, fontWeight: 700,
            letterSpacing: 2, textTransform: "uppercase" }}>Buying or Selling?</div>
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 18 * f,
            fontFamily: "Georgia, serif", lineHeight: 1.1, margin: `${4 * f}px 0` }}>
            {tagline || "Let's Make It Happen"}
          </div>
          {offer && (
            <div style={{ alignSelf: "center", background: gold, color: "#0f3a2e",
              padding: `${4 * f}px ${10 * f}px`, borderRadius: 4, fontWeight: 900,
              fontSize: 11 * f, marginTop: 4 }}>{offer}</div>
          )}
        </div>
        <div style={{ paddingTop: 5, borderTop: `1px solid rgba(251,191,36,0.4)`,
          display: "flex", justifyContent: "space-between", fontSize: 9 * f, color: gold }}>
          {phone && <span style={{ fontWeight: 800 }}>☎ {phone}</span>}
          {address && size !== "small" && <span style={{ color: "rgba(255,255,255,0.6)",
            overflow: "hidden", textOverflow: "ellipsis" }}>{address}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── INSURANCE-A: The Shield ─────────────────────────────────────────────────
function InsuranceA({ businessName, tagline, offer, offerFinePrint, address, phone,
  logo, size, accentColor }) {
  const f = scaleFactor(size);
  const gold = "#e2b714";
  return (
    <div style={{ ...baseBox, background: accentColor, color: "#fff" }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.05,
        backgroundImage: "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 1px, transparent 12px)" }} />
      <div style={{ position: "absolute", right: -20, bottom: -20, width: 120 * f,
        height: 140 * f, opacity: 0.15,
        background: gold,
        clipPath: "polygon(50% 0%, 100% 18%, 100% 55%, 50% 100%, 0% 55%, 0% 18%)" }} />
      <div style={{ position: "relative", padding: `${10 * f}px ${10 * f}px`,
        height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 * f }}>
          <div style={{ width: 36 * f, height: 42 * f, position: "relative",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ position: "absolute", inset: 0, background: gold,
              clipPath: "polygon(50% 0%, 100% 18%, 100% 55%, 50% 100%, 0% 55%, 0% 18%)" }} />
            <span style={{ position: "relative", fontSize: 16 * f, color: accentColor }}>🛡</span>
          </div>
          <div>
            <div style={{ color: gold, fontSize: 8 * f, fontWeight: 700, letterSpacing: 2,
              textTransform: "uppercase" }}>Your Local Agent</div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: 13 * f,
              fontFamily: "Georgia, serif", lineHeight: 1.1 }}>
              {businessName || "Your Insurance"}
            </div>
          </div>
        </div>
        <div style={{ color: gold, fontWeight: 700, fontSize: 11 * f, marginTop: 6 * f,
          letterSpacing: 1 }}>AUTO · HOME · LIFE</div>
        {tagline && <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 10 * f,
          marginTop: 3, lineHeight: 1.3 }}>{tagline}</div>}
        {offer && (
          <div style={{ marginTop: "auto", background: "rgba(226,183,20,0.15)",
            border: `1px solid ${gold}`, borderRadius: 6, padding: `${5 * f}px ${8 * f}px`,
            textAlign: "center" }}>
            <div style={{ color: gold, fontWeight: 900, fontSize: 13 * f, lineHeight: 1.1 }}>{offer}</div>
            {offerFinePrint && <div style={{ color: "rgba(255,255,255,0.6)",
              fontSize: 7 * f, marginTop: 1 }}>{offerFinePrint}</div>}
          </div>
        )}
        <div style={{ marginTop: 6, paddingTop: 5, borderTop: `1px solid rgba(226,183,20,0.3)`,
          fontSize: 9 * f, color: gold, fontWeight: 800 }}>
          {phone && <span>☎ {phone}</span>}
          {address && size === "large" && (
            <span style={{ color: "rgba(255,255,255,0.6)", marginLeft: 8, fontWeight: 400 }}>
              · {address}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── INSURANCE-B: The Trustworthy ────────────────────────────────────────────
function InsuranceB({ businessName, tagline, offer, offerFinePrint, address, phone, hours,
  logo, size, accentColor }) {
  const f = scaleFactor(size);
  const gold = "#d4a017";
  return (
    <div style={{ ...baseBox, background: "#f8fafc", color: "#111", display: "flex" }}>
      <div style={{ width: "22%", background: accentColor, display: "flex",
        alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: 12 * f,
          letterSpacing: 3, textTransform: "uppercase",
          writingMode: "vertical-rl", transform: "rotate(180deg)",
          fontFamily: "Georgia, serif",
          maxHeight: "90%", overflow: "hidden" }}>
          {businessName || "Your Insurance"}
        </div>
      </div>
      <div style={{ flex: 1, padding: `${8 * f}px ${10 * f}px`, display: "flex",
        flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 * f, marginBottom: 4 }}>
          <LogoBadge logo={logo} businessName={businessName} size={28 * f}
            bg={accentColor} color="#fff" border="none" />
          <div style={{ color: accentColor, fontWeight: 900, fontSize: 12 * f,
            fontFamily: "Georgia, serif", lineHeight: 1.1, overflow: "hidden",
            textOverflow: "ellipsis" }}>{businessName || "Your Insurance"}</div>
        </div>
        <div style={{ color: "#333", fontWeight: 700, fontSize: 10 * f, marginBottom: 4 }}>
          {tagline || "Coverage You Can Trust"}
        </div>
        {size === "large" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2,
            fontSize: 9 * f, color: "#444", marginBottom: 5 }}>
            <div>✓ Auto Insurance</div>
            <div>✓ Home Insurance</div>
            <div>✓ Life Insurance</div>
          </div>
        )}
        <div style={{ marginTop: "auto", fontSize: 9 * f, color: "#555", lineHeight: 1.4 }}>
          {phone && <div style={{ color: accentColor, fontWeight: 800 }}>☎ {phone}</div>}
          {address && size !== "small" && <div>📍 {address}</div>}
        </div>
        {offer && (
          <div style={{ marginTop: 5, background: gold, color: "#1a1a2e",
            padding: `${4 * f}px ${8 * f}px`, borderRadius: 4, fontWeight: 900,
            fontSize: 11 * f, textAlign: "center" }}>{offer}</div>
        )}
      </div>
    </div>
  );
}

// ─── LAWN-A: The Outdoor ─────────────────────────────────────────────────────
function LawnA({ businessName, tagline, offer, offerFinePrint, address, phone,
  logo, size, accentColor }) {
  const f = scaleFactor(size);
  return (
    <div style={{ ...baseBox,
      background: `linear-gradient(180deg, ${shade(accentColor, -20)} 0%, ${shade(accentColor, 60)} 100%)`,
      color: "#fff" }}>
      <div style={{ position: "absolute", top: 6 * f, right: 8 * f, width: 24 * f,
        height: 24 * f, borderRadius: "50%", background: "#fbbf24",
        boxShadow: "0 0 16px rgba(251,191,36,0.6)" }}>
        <div style={{ position: "absolute", inset: -6 * f, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(251,191,36,0.4) 0%, transparent 70%)" }} />
      </div>
      <div style={{ position: "relative", padding: `${10 * f}px ${10 * f}px`,
        height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 * f }}>
          <LogoBadge logo={logo} businessName={businessName} size={42 * f}
            bg="rgba(255,255,255,0.2)" color="#fff" border="2px solid rgba(255,255,255,0.6)" />
          <div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: 13 * f,
              fontFamily: "Georgia, serif", lineHeight: 1.1 }}>
              {businessName || "Your Lawn Care"}
            </div>
            {tagline && <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 9 * f,
              marginTop: 2 }}>{tagline}</div>}
          </div>
        </div>
        {size === "large" && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3,
            fontSize: 10 * f }}>
            {["Mowing", "Mulching", "Clean-ups"].map((s, i) => (
              <div key={i}>✓ {s}</div>
            ))}
          </div>
        )}
        {offer && (
          <div style={{ marginTop: "auto", background: "rgba(0,0,0,0.3)",
            border: "2px dashed rgba(255,255,255,0.6)", borderRadius: 6,
            padding: `${4 * f}px ${8 * f}px`, textAlign: "center" }}>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: 13 * f, lineHeight: 1.1 }}>{offer}</div>
            {offerFinePrint && <div style={{ color: "rgba(255,255,255,0.7)",
              fontSize: 7 * f, marginTop: 1 }}>{offerFinePrint}</div>}
          </div>
        )}
        <div style={{ marginTop: 6, fontSize: 9 * f, color: "#fff", lineHeight: 1.4 }}>
          {phone && <div style={{ fontWeight: 800 }}>☎ {phone}</div>}
          {address && size === "large" && <div style={{ opacity: 0.8 }}>📍 {address}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── LAWN-B: The Clean Cut ───────────────────────────────────────────────────
function LawnB({ businessName, tagline, offer, offerFinePrint, address, phone, hours,
  logo, size, accentColor }) {
  const f = scaleFactor(size);
  return (
    <div style={{ ...baseBox, background: "#fff", color: "#111",
      display: "flex", flexDirection: "column" }}>
      <div style={{ background: accentColor, padding: `${6 * f}px ${10 * f}px`,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6 * f, flexShrink: 0 }}>
        <LogoBadge logo={logo} businessName={businessName} size={28 * f}
          bg="#fff" color={accentColor} border="none" />
        <div style={{ color: "#fff", fontWeight: 900, fontSize: 12 * f,
          fontFamily: "Georgia, serif", overflow: "hidden", textOverflow: "ellipsis" }}>
          {businessName || "Your Lawn Care"}
        </div>
      </div>
      <div style={{ flex: 1, padding: `${8 * f}px ${10 * f}px`, minHeight: 0 }}>
        {tagline && <div style={{ color: accentColor, fontWeight: 800, fontSize: 11 * f,
          textAlign: "center", marginBottom: 4 }}>{tagline}</div>}
        {size === "large" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3,
            fontSize: 9 * f, color: "#444", marginBottom: 5 }}>
            <div>✓ Mowing</div>
            <div>✓ Mulching</div>
            <div>✓ Cleanups</div>
            <div>✓ Edging</div>
          </div>
        )}
        {offer && (
          <div style={{ background: shade(accentColor, 130), color: shade(accentColor, -40),
            border: `2px solid ${accentColor}`, borderRadius: 12,
            padding: `${4 * f}px ${10 * f}px`, fontWeight: 900, fontSize: 12 * f,
            textAlign: "center", margin: `${4 * f}px 0` }}>
            {offer}
            {offerFinePrint && size !== "small" && <div style={{ fontSize: 7 * f,
              fontWeight: 400, marginTop: 1 }}>{offerFinePrint}</div>}
          </div>
        )}
        <div style={{ fontSize: 9 * f, color: "#555", textAlign: "center",
          lineHeight: 1.4, marginTop: 4 }}>
          {phone && <div style={{ fontWeight: 800, color: accentColor }}>☎ {phone}</div>}
          {address && size !== "small" && <div>{address}</div>}
        </div>
      </div>
      <div style={{ background: accentColor, padding: `${3 * f}px`, flexShrink: 0 }} />
    </div>
  );
}

// ─── GENERAL-A: Bold Block ───────────────────────────────────────────────────
function GeneralA({ businessName, tagline, offer, offerFinePrint, address, phone,
  logo, size, accentColor }) {
  const f = scaleFactor(size);
  const txt = contrastText(accentColor);
  const accent2 = txt === "#fff" ? "#fbbf24" : accentColor;
  return (
    <div style={{ ...baseBox, background: accentColor, color: txt }}>
      <div style={{ position: "absolute", top: 6 * f, left: 8 * f }}>
        <LogoBadge logo={logo} businessName={businessName} size={32 * f}
          bg={txt === "#fff" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)"}
          color={txt} border={`2px solid ${txt === "#fff" ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.2)"}`} />
      </div>
      <div style={{ padding: `${44 * f}px ${10 * f}px ${42 * f}px`, textAlign: "center",
        height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column",
        justifyContent: "center" }}>
        <div style={{ fontWeight: 900, fontSize: 18 * f, fontFamily: "Georgia, serif",
          lineHeight: 1.1, color: txt }}>{businessName || "Your Business"}</div>
        {tagline && <div style={{ fontSize: 11 * f, marginTop: 4,
          opacity: 0.85 }}>{tagline}</div>}
      </div>
      {offer && (
        <div style={{ position: "absolute", bottom: 22 * f, left: 8 * f, right: 8 * f,
          background: accent2, color: txt === "#fff" ? "#111" : "#fff",
          padding: `${4 * f}px ${8 * f}px`, fontWeight: 900, fontSize: 12 * f,
          textAlign: "center", borderRadius: 4 }}>
          {offer}
          {offerFinePrint && <div style={{ fontSize: 7 * f, fontWeight: 400, opacity: 0.85,
            marginTop: 1 }}>{offerFinePrint}</div>}
        </div>
      )}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
        padding: `${4 * f}px ${10 * f}px`, fontSize: 9 * f,
        background: "rgba(0,0,0,0.2)", display: "flex", justifyContent: "space-between" }}>
        {phone && <span style={{ fontWeight: 800 }}>☎ {phone}</span>}
        {address && size !== "small" && <span style={{ opacity: 0.85, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap", marginLeft: 6 }}>{address}</span>}
      </div>
    </div>
  );
}

// ─── GENERAL-B: The Split ────────────────────────────────────────────────────
function GeneralB({ businessName, tagline, offer, offerFinePrint, address, phone, hours,
  logo, size, accentColor }) {
  const f = scaleFactor(size);
  return (
    <div style={{ ...baseBox, background: "#fff", color: "#111", display: "flex" }}>
      <div style={{ width: "32%", background: accentColor, color: "#fff",
        padding: `${8 * f}px ${6 * f}px`, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        textAlign: "center", boxSizing: "border-box" }}>
        <LogoBadge logo={logo} businessName={businessName} size={36 * f}
          bg="rgba(255,255,255,0.2)" color="#fff" border="2px solid rgba(255,255,255,0.4)" />
        {phone && (
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 9 * f,
            lineHeight: 1.2, marginTop: 6 * f }}>☎<br />{phone}</div>
        )}
      </div>
      <div style={{ flex: 1, padding: `${8 * f}px ${10 * f}px`, display: "flex",
        flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
        <div>
          <div style={{ color: accentColor, fontWeight: 900, fontSize: 13 * f,
            fontFamily: "Georgia, serif", lineHeight: 1.1 }}>
            {businessName || "Your Business"}
          </div>
          {tagline && <div style={{ color: "#555", fontSize: 10 * f, marginTop: 3,
            lineHeight: 1.3 }}>{tagline}</div>}
        </div>
        {offer && (
          <div style={{ border: `2px solid ${accentColor}`, borderRadius: 6,
            padding: `${4 * f}px ${8 * f}px`, textAlign: "center" }}>
            <div style={{ color: accentColor, fontWeight: 900, fontSize: 11 * f,
              lineHeight: 1.1 }}>{offer}</div>
            {offerFinePrint && size !== "small" && <div style={{ color: "#777",
              fontSize: 7 * f }}>{offerFinePrint}</div>}
          </div>
        )}
        <div style={{ fontSize: 8.5 * f, color: "#555", lineHeight: 1.4 }}>
          {address && size !== "small" && <div>📍 {address}</div>}
          {hours && size === "large" && <div>⏰ {hours}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Templates Registry ──────────────────────────────────────────────────────
export const TEMPLATES = {
  "RESTAURANT-A": { component: RestaurantA, name: "The Feast" },
  "RESTAURANT-B": { component: RestaurantB, name: "The Board" },
  "RESTAURANT-C": { component: RestaurantC, name: "The Fresh" },
  "RESTAURANT-D": { component: RestaurantD, name: "The Corner Spot" },
  "DENTAL-A":     { component: DentalA,     name: "Clean Smile" },
  "DENTAL-B":     { component: DentalB,     name: "Modern Care" },
  "HVAC-A":       { component: HvacA,       name: "Emergency" },
  "HVAC-B":       { component: HvacB,       name: "Pro Service" },
  "REALTY-A":     { component: RealtyA,     name: "The Listing" },
  "REALTY-B":     { component: RealtyB,     name: "Bold Sale" },
  "INSURANCE-A":  { component: InsuranceA,  name: "The Shield" },
  "INSURANCE-B":  { component: InsuranceB,  name: "Trustworthy" },
  "LAWN-A":       { component: LawnA,       name: "Outdoor" },
  "LAWN-B":       { component: LawnB,       name: "Clean Cut" },
  "GENERAL-A":    { component: GeneralA,    name: "Bold Block" },
  "GENERAL-B":    { component: GeneralB,    name: "The Split" },
};

// ─── Template Renderer (sizing wrapper) ──────────────────────────────────────
// `size` controls template layout density (large/medium/small).
// `aspectSize` (optional) controls the container's aspect ratio so the preview
// matches the customer's actual postcard spot shape independently of layout.
function TemplatePreview({ templateId, data, images, size, width, aspectSize }) {
  const Tpl = TEMPLATES[templateId]?.component;
  const aspect = SIZE_ASPECT[aspectSize || size] || SIZE_ASPECT.large;
  const height = width / aspect;
  if (!Tpl) return null;
  return (
    <div style={{ width, height, background: "#f3f4f6", borderRadius: 6,
      overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
      <Tpl
        size={size}
        industry={data.category}
        businessName={data.businessName}
        tagline={data.tagline}
        offer={data.offer}
        offerFinePrint={data.offerFinePrint}
        offer2={data.offer2}
        offer2FinePrint={data.offer2FinePrint}
        address={data.address}
        phone={data.phone}
        website={data.website}
        hours={data.hours}
        logo={images.logo}
        photos={images.photos}
        accentColor={data.accentColor}
      />
    </div>
  );
}

// ─── Hook: track viewport width for responsive layouts ──────────────────────
function useIsNarrow(breakpoint = 720) {
  const [narrow, setNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const handler = () => setNarrow(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return narrow;
}

// ─── Step 1: Company Info Form ───────────────────────────────────────────────
function Step1Form({ data, setData, images, setImages, email, setEmail, onNext }) {
  const fileRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  const narrow = useIsNarrow();

  const handleField = (k) => (e) => {
    const v = e.target.value;
    setData(prev => {
      const next = { ...prev, [k]: v };
      if (k === "category") {
        next.accentColor = INDUSTRY_ACCENT_COLORS[v] || "#374151";
      }
      return next;
    });
  };

  const handleImage = (slot) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image too large (max 5MB).");
      return;
    }
    try {
      const dataUrl = await fileToBase64(file);
      if (slot === "logo") {
        setImages(prev => ({ ...prev, logo: dataUrl }));
      } else {
        setImages(prev => {
          const photos = [...(prev.photos || ["", "", ""])];
          photos[slot] = dataUrl;
          return { ...prev, photos };
        });
      }
    } catch (err) {
      alert("Failed to read image.");
    }
  };

  const removeImage = (slot) => () => {
    if (slot === "logo") {
      setImages(prev => ({ ...prev, logo: "" }));
    } else {
      setImages(prev => {
        const photos = [...(prev.photos || ["", "", ""])];
        photos[slot] = "";
        return { ...prev, photos };
      });
    }
  };

  const ok = data.businessName.trim() && data.category && email.trim() && email.includes("@");

  const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8,
    border: "1.5px solid #d1d5db", fontSize: 13.5, outline: "none",
    fontFamily: "sans-serif", boxSizing: "border-box", color: "#111", background: "#fff" };
  const labelStyle = { fontSize: 12, fontWeight: 700, color: "#374151",
    marginBottom: 4, display: "block" };

  const ImageSlot = ({ slot, label, dataUrl }) => (
    <div>
      <div style={labelStyle}>{label}</div>
      <input ref={fileRefs[slot === "logo" ? 0 : slot + 1]} type="file" accept="image/*"
        onChange={handleImage(slot)} style={{ display: "none" }} />
      {dataUrl ? (
        <div style={{ position: "relative", width: "100%", aspectRatio: "1/1",
          borderRadius: 8, overflow: "hidden", border: "1.5px solid #d1d5db",
          background: `url(${dataUrl}) center/cover` }}>
          <button onClick={removeImage(slot)} style={{ position: "absolute", top: 4, right: 4,
            background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: "50%",
            width: 22, height: 22, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
        </div>
      ) : (
        <button type="button" onClick={() => fileRefs[slot === "logo" ? 0 : slot + 1].current?.click()}
          style={{ width: "100%", aspectRatio: "1/1", borderRadius: 8,
            border: "2px dashed #d1d5db", background: "#fafafa", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", color: "#9ca3af", fontSize: 11, gap: 4 }}>
          <span style={{ fontSize: 22 }}>＋</span>
          <span>Add</span>
        </button>
      )}
    </div>
  );

  return (
    <div style={{ display: "grid",
      gridTemplateColumns: narrow ? "1fr" : "1.4fr 1fr", gap: narrow ? 18 : 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={labelStyle}>Business Name *</label>
          <input style={inputStyle} value={data.businessName} onChange={handleField("businessName")}
            placeholder="e.g. Mr. Biscuit's Café" />
        </div>
        <div>
          <label style={labelStyle}>Industry / Category *</label>
          <select style={inputStyle} value={data.category} onChange={handleField("category")}>
            <option value="">— Select an industry —</option>
            {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Email *</label>
          <input style={inputStyle} type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
        </div>
        <div>
          <label style={labelStyle}>Tagline / Slogan</label>
          <input style={inputStyle} value={data.tagline} onChange={handleField("tagline")}
            placeholder="e.g. From-Scratch Biscuits & Boba" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Primary Offer / Coupon</label>
            <input style={inputStyle} value={data.offer} onChange={handleField("offer")}
              placeholder="e.g. BOGO Pizza" />
          </div>
          <div>
            <label style={labelStyle}>Offer Fine Print</label>
            <input style={inputStyle} value={data.offerFinePrint} onChange={handleField("offerFinePrint")}
              placeholder="e.g. expires 6/30, dine-in only" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Second Offer / Coupon <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span></label>
            <input style={inputStyle} value={data.offer2} onChange={handleField("offer2")}
              placeholder="e.g. FREE Coffee w/ breakfast" />
          </div>
          <div>
            <label style={labelStyle}>Second Offer Fine Print</label>
            <input style={inputStyle} value={data.offer2FinePrint} onChange={handleField("offer2FinePrint")}
              placeholder="e.g. one per visit" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Phone</label>
            <input style={inputStyle} value={data.phone} onChange={handleField("phone")}
              placeholder="(706) 555-0100" />
          </div>
          <div>
            <label style={labelStyle}>Website</label>
            <input style={inputStyle} value={data.website} onChange={handleField("website")}
              placeholder="example.com" />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Address</label>
          <input style={inputStyle} value={data.address} onChange={handleField("address")}
            placeholder="123 Main St, Clarkesville, GA" />
        </div>
        <div>
          <label style={labelStyle}>Hours</label>
          <input style={inputStyle} value={data.hours} onChange={handleField("hours")}
            placeholder="Mon-Fri 9am-5pm" />
        </div>
        <div>
          <label style={labelStyle}>Accent Color</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="color" value={data.accentColor || "#374151"}
              onChange={handleField("accentColor")}
              style={{ width: 50, height: 36, border: "1.5px solid #d1d5db",
                borderRadius: 6, padding: 2, cursor: "pointer", background: "#fff" }} />
            <input style={inputStyle} value={data.accentColor || ""}
              onChange={handleField("accentColor")} placeholder="#374151" />
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
            Auto-set from your industry — override to match your brand.
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#111", marginBottom: 10,
          fontFamily: "Georgia, serif" }}>Upload Images (optional)</div>
        <div style={{ display: "grid",
          gridTemplateColumns: narrow ? "repeat(4, 1fr)" : "1fr 1fr", gap: 10 }}>
          <ImageSlot slot="logo" label="Logo" dataUrl={images.logo} />
          <ImageSlot slot={0} label="Hero Photo" dataUrl={images.photos?.[0]} />
          <ImageSlot slot={1} label="Photo 2" dataUrl={images.photos?.[1]} />
          <ImageSlot slot={2} label="Photo 3" dataUrl={images.photos?.[2]} />
        </div>
        <div style={{ fontSize: 11, color: "#888", marginTop: 8, lineHeight: 1.5 }}>
          All photos are optional. For restaurant categories, empty slots
          auto-fill from our curated food-photo library so your ad always
          looks polished — you can swap in your own at any time. Logos
          appear as a circular badge. PNG/JPG, 5MB max.
        </div>
      </div>

      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end",
        gap: 10, marginTop: 8 }}>
        <button onClick={onNext} disabled={!ok}
          style={{ background: ok ? "#991b1b" : "#d1d5db", color: "#fff",
            border: "none", borderRadius: 9, padding: "12px 28px", fontSize: 14,
            fontWeight: 800, cursor: ok ? "pointer" : "not-allowed" }}>
          Next: Choose Design →
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Template Picker ─────────────────────────────────────────────────
function Step2Picker({ data, images, spotSize, templateIds, selectedId, setSelectedId,
  onBack, onNext, onReshuffle }) {
  // Per spec, render previews at "medium" template size for fair comparison.
  // Card width is sized according to the spot's actual aspect ratio so the
  // customer still sees the correct shape.
  const previewSize = "medium";
  const cardWidth = spotSize === "small" ? 320 : 240;
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 16, color: "#555", fontSize: 14 }}>
        Pick the design that best fits your business. You can switch before continuing.
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap" }}>
        {templateIds.map(id => {
          const isSelected = selectedId === id;
          return (
            <div key={id} style={{ textAlign: "center" }}>
              <div style={{ display: "inline-block", padding: 6, borderRadius: 12,
                background: isSelected ? "#fef9c3" : "#fff",
                border: isSelected ? "3px solid #ca8a04" : "3px solid #e5e7eb",
                transition: "all 0.15s" }}>
                <TemplatePreview templateId={id} data={data} images={images}
                  size={previewSize} width={cardWidth} aspectSize={spotSize} />
              </div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
                {TEMPLATES[id]?.name} <span style={{ opacity: 0.6 }}>· {id}</span>
              </div>
              <button onClick={() => setSelectedId(id)}
                style={{ marginTop: 8, padding: "8px 18px", borderRadius: 8,
                  background: isSelected ? "#ca8a04" : "#fff",
                  color: isSelected ? "#fff" : "#111",
                  border: isSelected ? "none" : "2px solid #d1d5db",
                  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "sans-serif" }}>
                {isSelected ? "✓ Selected" : "Select This Design"}
              </button>
            </div>
          );
        })}
      </div>
      {RESTAURANT_INDUSTRIES.has(data.category) && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button onClick={onReshuffle}
            style={{ background: "transparent", border: "none", color: "#0369a1",
              fontSize: 13, cursor: "pointer", textDecoration: "underline",
              fontFamily: "sans-serif" }}>
            🎲 Show different designs
          </button>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
        <button onClick={onBack}
          style={{ background: "#fff", color: "#374151", border: "1.5px solid #d1d5db",
            borderRadius: 9, padding: "12px 24px", fontSize: 14, fontWeight: 700,
            cursor: "pointer", fontFamily: "sans-serif" }}>← Back</button>
        <button onClick={onNext} disabled={!selectedId}
          style={{ background: selectedId ? "#991b1b" : "#d1d5db", color: "#fff",
            border: "none", borderRadius: 9, padding: "12px 28px", fontSize: 14,
            fontWeight: 800, cursor: selectedId ? "pointer" : "not-allowed",
            fontFamily: "sans-serif" }}>
          Next: Preview →
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Preview & Confirm ───────────────────────────────────────────────
function Step3Preview({ data, images, spotSize, spotPrice, selectedId,
  onBack, onConfirm, isLoading, error }) {
  // Per spec, render the final preview at "large" template size so the
  // customer sees the most detailed version. The container's aspect ratio
  // still reflects the spot they actually purchased.
  const previewWidth = spotSize === "small" ? 560 : 380;
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 20, color: "#555", fontSize: 14 }}>
        Here's how your ad will look on the postcard.
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "center",
        justifyContent: "center", flexWrap: "wrap" }}>
        <TemplatePreview templateId={selectedId} data={data} images={images}
          size="large" width={previewWidth} aspectSize={spotSize} />
        <div style={{ width: 240, padding: 18, background: "#f8fafc", borderRadius: 12,
          border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 2,
            textTransform: "uppercase", marginBottom: 4 }}>Your Spot</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#111",
            fontFamily: "Georgia, serif", lineHeight: 1.1 }}>
            {spotSize === "large" ? "Large" : spotSize === "medium" ? "Medium" : "Small"}
          </div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
            {spotSize === "large" ? '4" × 5"' : spotSize === "medium" ? '3" × 4"' : '3" × 2"'}
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#991b1b",
            marginTop: 10, fontFamily: "sans-serif" }}>${spotPrice}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            One-time · 5,000 homes
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 14,
            paddingTop: 12, borderTop: "1px solid #e5e7eb", lineHeight: 1.5 }}>
            Design: <strong>{TEMPLATES[selectedId]?.name}</strong><br />
            Industry: <strong>{data.category}</strong>
          </div>
        </div>
      </div>
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
          padding: "10px 14px", marginTop: 18, color: "#991b1b", fontSize: 13,
          textAlign: "center" }}>{error}</div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
        <button onClick={onBack} disabled={isLoading}
          style={{ background: "#fff", color: "#374151", border: "1.5px solid #d1d5db",
            borderRadius: 9, padding: "12px 24px", fontSize: 14, fontWeight: 700,
            cursor: isLoading ? "not-allowed" : "pointer", fontFamily: "sans-serif",
            opacity: isLoading ? 0.6 : 1 }}>← Back</button>
        <button onClick={onConfirm} disabled={isLoading}
          style={{ background: isLoading ? "#9ca3af" : "#991b1b", color: "#fff",
            border: "none", borderRadius: 9, padding: "12px 28px", fontSize: 15,
            fontWeight: 800, cursor: isLoading ? "not-allowed" : "pointer",
            fontFamily: "sans-serif" }}>
          {isLoading ? "Reserving..." : "Looks Great — Reserve My Spot →"}
        </button>
      </div>
    </div>
  );
}

// ─── Step Indicator ──────────────────────────────────────────────────────────
function StepIndicator({ step }) {
  const steps = ["Your Info", "Pick Design", "Confirm"];
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24,
      flexWrap: "wrap" }}>
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%",
              background: done ? "#16a34a" : active ? "#991b1b" : "#e5e7eb",
              color: done || active ? "#fff" : "#6b7280",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800 }}>{done ? "✓" : n}</div>
            <span style={{ fontSize: 13,
              color: active ? "#111" : done ? "#16a34a" : "#9ca3af",
              fontWeight: active ? 800 : 600, fontFamily: "sans-serif" }}>{label}</span>
            {n < steps.length && (
              <span style={{ width: 24, height: 1, background: "#e5e7eb",
                margin: "0 6px" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main AdCreator ──────────────────────────────────────────────────────────
export default function AdCreator({ spotId, spotSize, spotPrice, onComplete, onClose,
  isLoading, error }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    businessName: "", category: "", tagline: "", offer: "", offerFinePrint: "",
    offer2: "", offer2FinePrint: "",
    address: "", phone: "", website: "", hours: "", accentColor: "#374151",
  });
  const [images, setImages] = useState({ logo: "", photos: ["", "", ""] });
  const [email, setEmail] = useState("");
  const [templateIds, setTemplateIds] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  // Recompute templates whenever industry changes
  useEffect(() => {
    if (data.category) {
      const ids = selectTemplates(data.category);
      setTemplateIds(ids);
      if (selectedId && !ids.includes(selectedId)) setSelectedId(null);
    } else {
      setTemplateIds([]);
      setSelectedId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.category]);

  const reshuffle = () => {
    const ids = selectTemplates(data.category);
    setTemplateIds(ids);
    if (selectedId && !ids.includes(selectedId)) setSelectedId(null);
  };

  const handleConfirm = () => {
    onComplete({
      businessName: data.businessName.trim(),
      category: data.category,
      email: email.trim(),
      phone: data.phone.trim(),
      templateId: selectedId,
      adData: { ...data },
      imageData: { logo: images.logo, photos: [...images.photos] },
    });
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-start",
      justifyContent: "center", zIndex: 200, padding: 20, overflow: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff",
        borderRadius: 16, padding: 28, maxWidth: 920, width: "100%",
        boxShadow: "0 30px 80px rgba(0,0,0,0.4)", fontFamily: "sans-serif",
        marginTop: 20, marginBottom: 40 }}>

        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 2,
              textTransform: "uppercase", marginBottom: 4 }}>Build Your Ad</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#111",
              fontFamily: "Georgia, serif", lineHeight: 1.1 }}>
              {spotSize === "large" ? "Large" : spotSize === "medium" ? "Medium" : "Small"} Ad
              <span style={{ color: "#991b1b", marginLeft: 10 }}>${spotPrice}</span>
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "#f3f4f6", border: "none", borderRadius: "50%",
              width: 36, height: 36, cursor: "pointer", fontSize: 20, color: "#374151" }}>×</button>
        </div>

        <StepIndicator step={step} />

        {step === 1 && (
          <Step1Form data={data} setData={setData} images={images} setImages={setImages}
            email={email} setEmail={setEmail} onNext={() => setStep(2)} />
        )}
        {step === 2 && (
          <Step2Picker data={data} images={images} spotSize={spotSize}
            templateIds={templateIds} selectedId={selectedId} setSelectedId={setSelectedId}
            onBack={() => setStep(1)} onNext={() => setStep(3)} onReshuffle={reshuffle} />
        )}
        {step === 3 && (
          <Step3Preview data={data} images={images} spotSize={spotSize} spotPrice={spotPrice}
            selectedId={selectedId} onBack={() => setStep(2)} onConfirm={handleConfirm}
            isLoading={isLoading} error={error} />
        )}
      </div>
    </div>
  );
}
