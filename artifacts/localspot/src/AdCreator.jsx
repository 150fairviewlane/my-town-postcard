import { useState, useRef, useMemo, useEffect } from "react";
import { pickFallbackPhoto } from "./industryImages.js";

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
// Flex-column layout so every pixel is filled: hero band, name/logo row,
// coupon block (flex:1 — fills all remaining space), contact strip footer.
export function RestaurantA({ businessName, tagline, offer, offerFinePrint,
  offer2, offer2FinePrint, address, phone, hours, website, logo,
  photos = [], size, accentColor, industry = "Restaurant" }) {
  const f = scaleFactor(size);
  const userHero = (photos || []).find(p => p);
  const heroPhoto = userHero || pickFallbackPhoto(industry, businessName, "hero", 0);
  const isLarge = size === "large";
  const isMedium = size === "medium";
  const darkBg = shade(accentColor, -45);
  const deepBg = shade(accentColor, -60);

  // Hero height: taller when no coupons, shorter when 2 coupons so coupon area is generous
  const heroFlex = (offer && offer2) ? "0 0 36%" : offer ? "0 0 42%" : "0 0 52%";

  const Coupon = ({ headline, fineline }) => (
    <div style={{
      flex: 1,
      position: "relative",
      border: `${2 * f}px dashed rgba(253,232,160,0.75)`,
      borderRadius: 5 * f,
      padding: `${6 * f}px ${7 * f}px`,
      background: "rgba(0,0,0,0.38)",
      textAlign: "center",
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 3 * f,
    }}>
      {/* Scissors notch */}
      <div style={{ position: "absolute", top: -8 * f, left: "50%",
        transform: "translateX(-50%)", color: "#fde8a0",
        fontSize: 10 * f, lineHeight: 1, background: deepBg, padding: "0 4px" }}>✂</div>

      <div style={{ color: "#fde8a0", fontWeight: 900,
        fontSize: (isLarge ? 19 : isMedium ? 15 : 11) * f,
        lineHeight: 1.0, fontFamily: "Georgia, serif", letterSpacing: 0.3 }}>
        {headline}
      </div>
      {fineline && (
        <div style={{ color: "rgba(255,255,255,0.75)", fontWeight: 600,
          fontSize: (isLarge ? 8 : 7) * f, lineHeight: 1.3,
          marginTop: 1 * f }}>
          {fineline}
        </div>
      )}
      <div style={{ color: "rgba(255,255,255,0.5)",
        fontSize: (isLarge ? 7 : 6) * f, fontStyle: "italic", marginTop: 1 * f }}>
        with this postcard
      </div>
    </div>
  );

  return (
    <div style={{ ...baseBox, background: darkBg, color: "#fff",
      display: "flex", flexDirection: "column" }}>

      {/* ── HERO BAND ── full-bleed food photo */}
      <div style={{ flex: heroFlex, position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0,
          ...(heroPhoto
            ? { backgroundImage: `url(${heroPhoto})`,
                backgroundSize: "cover", backgroundPosition: "center" }
            : { background: `linear-gradient(135deg, ${shade(accentColor, 10)}, ${shade(accentColor, -20)})` })
        }} />
        {/* bottom fade into the dark bg */}
        <div style={{ position: "absolute", inset: 0,
          background: `linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 50%, ${darkBg} 100%)` }} />
        {/* Phone pill top-right */}
        {phone && (
          <div style={{ position: "absolute", top: 5 * f, right: 6 * f,
            background: accentColor, color: contrastText(accentColor),
            padding: `${2 * f}px ${7 * f}px`, borderRadius: 999,
            fontWeight: 800, fontSize: 9 * f, letterSpacing: 0.3,
            border: "1.5px solid rgba(255,255,255,0.8)",
            boxShadow: "0 2px 5px rgba(0,0,0,0.45)", zIndex: 2 }}>
            ☎ {phone}
          </div>
        )}
      </div>

      {/* ── LOGO + NAME ROW ── sits just below the hero */}
      <div style={{ flexShrink: 0,
        display: "flex", alignItems: "center", gap: 7 * f,
        padding: `${5 * f}px ${9 * f}px`,
        background: shade(accentColor, -50),
        borderBottom: `${1 * f}px solid rgba(255,255,255,0.12)` }}>
        <LogoBadge logo={logo} businessName={businessName}
          size={(isLarge ? 44 : isMedium ? 34 : 26) * f}
          bg="#fff" color={accentColor}
          border={`2px solid ${accentColor}`} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 900,
            fontSize: (isLarge ? 15 : isMedium ? 12 : 9.5) * f,
            fontFamily: "Georgia, serif", lineHeight: 1.1,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
            {businessName || "Your Business"}
          </div>
          {tagline && (
            <div style={{ color: "rgba(253,232,160,0.9)",
              fontSize: (isLarge ? 8.5 : 7.5) * f, fontStyle: "italic",
              fontFamily: "Georgia, serif", marginTop: 1 * f,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {tagline}
            </div>
          )}
        </div>
      </div>

      {/* ── COUPON BLOCK ── fills all remaining space */}
      {offer && (
        <div style={{ flex: 1, minHeight: 0,
          display: "flex", gap: 6 * f,
          padding: `${8 * f}px ${8 * f}px`,
          alignItems: "stretch" }}>
          <Coupon headline={offer} fineline={offerFinePrint} />
          {offer2 && <Coupon headline={offer2} fineline={offer2FinePrint} />}
        </div>
      )}

      {/* ── CONTACT STRIP ── pinned at the very bottom */}
      <div style={{ flexShrink: 0,
        background: deepBg,
        borderTop: `${1 * f}px solid rgba(255,255,255,0.15)`,
        padding: `${3 * f}px ${8 * f}px`,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5 * f }}>
        <div style={{ color: "rgba(255,255,255,0.85)",
          fontSize: (isLarge ? 8 : 7) * f, fontWeight: 600,
          lineHeight: 1.3, minWidth: 0, flex: 1 }}>
          {address && <div style={{ whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis" }}>📍 {address}</div>}
          {hours && <div style={{ whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis", marginTop: 1 * f }}>⏰ {hours}</div>}
        </div>
        {website && isLarge && (
          <div style={{ color: "#fde8a0", fontSize: 7 * f, fontWeight: 700,
            whiteSpace: "nowrap" }}>🌐 {website}</div>
        )}
      </div>
    </div>
  );
}

// ─── RESTAURANT-B: The Board (chalkboard) ────────────────────────────────────
function RestaurantB({ businessName, tagline, offer, offerFinePrint, offer2, offer2FinePrint,
  address, phone, hours, logo, photos = [], size, accentColor, industry = "Restaurant" }) {
  const f = scaleFactor(size);
  const isL = size === "large";
  const heroPhoto = (photos || []).find(p => p) || pickFallbackPhoto(industry, businessName, "hero", 0);
  const chalkBg = "radial-gradient(ellipse at center, #2d3a2d 0%, #1a2118 100%)";
  return (
    <div style={{ ...baseBox, background: chalkBg, color: "#f5f1e6", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.04,
        backgroundImage: "repeating-linear-gradient(45deg, #fff 0px, #fff 1px, transparent 1px, transparent 6px)",
        pointerEvents: "none", zIndex: 0 }} />
      {/* Hero photo */}
      <div style={{ flex: "0 0 38%", position: "relative", overflow: "hidden", flexShrink: 0, zIndex: 1 }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${heroPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(26,33,24,0.92) 100%)" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
          padding: `${4 * f}px ${8 * f}px`, display: "flex", alignItems: "center", gap: 6 * f }}>
          <LogoBadge logo={logo} businessName={businessName}
            size={(isL ? 36 : 28) * f} bg="#f5f1e6" color="#1a2118" border="2px solid #d4c896" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#f5f1e6", fontWeight: 900, fontSize: (isL ? 15 : 12) * f,
              fontFamily: "'Caveat', cursive, Georgia, serif", lineHeight: 1.1,
              textShadow: "0 1px 4px rgba(0,0,0,0.8)", whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis" }}>
              {businessName || "Your Restaurant"}
            </div>
            {tagline && <div style={{ color: "#d4c896", fontSize: (isL ? 8 : 7) * f,
              fontStyle: "italic", fontFamily: "Georgia, serif" }}>~ {tagline} ~</div>}
          </div>
        </div>
      </div>
      {/* Coupon area */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6 * f,
        padding: `${7 * f}px ${8 * f}px`, alignItems: "stretch", position: "relative", zIndex: 1 }}>
        {[{ h: offer, fp: offerFinePrint }, ...(offer2 ? [{ h: offer2, fp: offer2FinePrint }] : [])].map(({ h, fp }, i) => h && (
          <div key={i} style={{ flex: 1, position: "relative",
            border: "2px dashed rgba(212,200,150,0.7)", borderRadius: 5 * f,
            background: "rgba(0,0,0,0.3)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", padding: `${6 * f}px ${5 * f}px`, gap: 3 * f }}>
            <div style={{ position: "absolute", top: -9 * f, left: "50%", transform: "translateX(-50%)",
              color: "#d4c896", fontSize: 11 * f, background: "#1a2118", padding: "0 4px" }}>✂</div>
            <div style={{ color: "rgba(212,200,150,0.9)", fontSize: (isL ? 7.5 : 6.5) * f,
              letterSpacing: 2, textTransform: "uppercase", fontFamily: "sans-serif" }}>Bring This Ad</div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: (isL ? 21 : 16) * f,
              lineHeight: 1, fontFamily: "'Caveat', cursive, Georgia, serif", textAlign: "center" }}>{h}</div>
            {fp && <div style={{ color: "rgba(245,241,230,0.65)", fontSize: (isL ? 7.5 : 6.5) * f,
              textAlign: "center", fontFamily: "sans-serif", lineHeight: 1.3 }}>{fp}</div>}
            <div style={{ color: "rgba(212,200,150,0.5)", fontSize: (isL ? 7 : 6) * f,
              fontFamily: "sans-serif", fontStyle: "italic" }}>with this postcard</div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div style={{ flexShrink: 0, position: "relative", zIndex: 1,
        background: "rgba(0,0,0,0.45)", padding: `${3 * f}px ${8 * f}px`,
        display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {phone && <div style={{ color: "#d4c896", fontWeight: 700, fontSize: (isL ? 7.5 : 7) * f }}>☎ {phone}</div>}
        {address && <div style={{ color: "rgba(212,200,150,0.7)", fontSize: 7 * f,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>📍 {address}</div>}
      </div>
    </div>
  );
}

// ─── RESTAURANT-C: The Fresh ─────────────────────────────────────────────────
function RestaurantC({ businessName, tagline, offer, offerFinePrint, offer2, offer2FinePrint,
  address, phone, hours, logo, photos = [], size, accentColor, industry = "Restaurant" }) {
  const f = scaleFactor(size);
  const isL = size === "large";
  const ct = contrastText(accentColor);
  const heroPhoto = (photos || []).find(p => p) || pickFallbackPhoto(industry, businessName, "hero", 0);
  return (
    <div style={{ ...baseBox, background: "#fff", color: "#111", display: "flex", flexDirection: "column" }}>
      {/* Hero photo */}
      <div style={{ flex: "0 0 40%", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${heroPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0,
          background: `linear-gradient(180deg, rgba(0,0,0,0.05) 60%, ${shade(accentColor, -15)} 100%)` }} />
      </div>
      {/* Name/logo band */}
      <div style={{ flexShrink: 0, background: accentColor,
        padding: `${5 * f}px ${9 * f}px`, display: "flex", alignItems: "center", gap: 7 * f }}>
        <LogoBadge logo={logo} businessName={businessName}
          size={(isL ? 36 : 28) * f} bg="#fff" color={accentColor} border="none" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: ct, fontWeight: 900, fontSize: (isL ? 14 : 11) * f,
            fontFamily: "Georgia, serif", lineHeight: 1.1,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {businessName || "Your Restaurant"}
          </div>
          {tagline && <div style={{ color: ct === "#fff" ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.65)",
            fontSize: (isL ? 8 : 7) * f, marginTop: 1 * f,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tagline}</div>}
        </div>
        {phone && <div style={{ color: ct === "#fff" ? "#fde8a0" : shade(accentColor, -40),
          fontWeight: 800, fontSize: (isL ? 8 : 7.5) * f, flexShrink: 0 }}>☎ {phone}</div>}
      </div>
      {/* Coupon block */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6 * f,
        padding: `${7 * f}px ${8 * f}px`, alignItems: "stretch",
        background: shade(accentColor, -20) }}>
        {[{ h: offer, fp: offerFinePrint }, ...(offer2 ? [{ h: offer2, fp: offer2FinePrint }] : [])].map(({ h, fp }, i) => h && (
          <div key={i} style={{ flex: 1, position: "relative",
            border: `2px dashed rgba(255,255,255,0.6)`, borderRadius: 5 * f,
            background: "rgba(0,0,0,0.25)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: `${6 * f}px ${5 * f}px`, gap: 3 * f }}>
            <div style={{ position: "absolute", top: -9 * f, left: "50%", transform: "translateX(-50%)",
              color: "#fde8a0", fontSize: 11 * f, background: shade(accentColor, -20), padding: "0 4px" }}>✂</div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: (isL ? 7 : 6.5) * f,
              letterSpacing: 2, textTransform: "uppercase", fontFamily: "sans-serif" }}>Bring This Ad</div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: (isL ? 21 : 16) * f,
              lineHeight: 1, fontFamily: "Georgia, serif", textAlign: "center" }}>{h}</div>
            {fp && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: (isL ? 7.5 : 6.5) * f,
              textAlign: "center", fontFamily: "sans-serif", lineHeight: 1.3 }}>{fp}</div>}
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: (isL ? 7 : 6) * f,
              fontStyle: "italic" }}>with this postcard</div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div style={{ flexShrink: 0, background: shade(accentColor, -35),
        padding: `${3 * f}px ${8 * f}px`, display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 4 * f }}>
        <div style={{ color: "rgba(255,255,255,0.75)", fontSize: (isL ? 7.5 : 7) * f, lineHeight: 1.3 }}>
          {address && <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            📍 {address}
          </span>}
        </div>
        {hours && isL && <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 7 * f,
          whiteSpace: "nowrap" }}>⏰ {hours}</div>}
      </div>
    </div>
  );
}

// ─── RESTAURANT-D: The Corner Spot ───────────────────────────────────────────
function RestaurantD({ businessName, tagline, offer, offerFinePrint, offer2, offer2FinePrint,
  address, phone, logo, photos = [], size, accentColor, industry = "Restaurant" }) {
  const f = scaleFactor(size);
  const isL = size === "large";
  const ct = contrastText(accentColor);
  const dark = shade(accentColor, -30);
  const heroPhoto = (photos || []).find(p => p) || pickFallbackPhoto(industry, businessName, "hero", 0);
  return (
    <div style={{ ...baseBox, display: "flex", flexDirection: "column", background: dark }}>
      {/* Full-bleed hero with accent-triangle overlay */}
      <div style={{ flex: "0 0 42%", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${heroPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.55) 100%)" }} />
        {/* Logo + name */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
          padding: `${4 * f}px ${8 * f}px`, display: "flex", alignItems: "center", gap: 6 * f }}>
          <LogoBadge logo={logo} businessName={businessName}
            size={(isL ? 36 : 28) * f} bg="#fff" color={accentColor}
            border={`2px solid ${accentColor}`} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: (isL ? 14 : 11) * f,
              fontFamily: "Georgia, serif", lineHeight: 1.1, textShadow: "0 1px 4px rgba(0,0,0,0.8)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {businessName || "Your Restaurant"}
            </div>
            {tagline && <div style={{ color: "rgba(255,255,255,0.8)", fontSize: (isL ? 8 : 7) * f,
              fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {tagline}
            </div>}
          </div>
        </div>
      </div>
      {/* Coupon block */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6 * f,
        padding: `${7 * f}px ${8 * f}px`, alignItems: "stretch" }}>
        {[{ h: offer, fp: offerFinePrint }, ...(offer2 ? [{ h: offer2, fp: offer2FinePrint }] : [])].map(({ h, fp }, i) => h && (
          <div key={i} style={{ flex: 1, position: "relative",
            border: `2px dashed ${accentColor}`, borderRadius: 5 * f,
            background: "rgba(255,255,255,0.07)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: `${5 * f}px ${5 * f}px`, gap: 3 * f }}>
            <div style={{ position: "absolute", top: -9 * f, left: "50%", transform: "translateX(-50%)",
              color: accentColor, fontSize: 11 * f, background: dark, padding: "0 4px" }}>✂</div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: (isL ? 7 : 6.5) * f,
              letterSpacing: 2, textTransform: "uppercase" }}>Bring This Ad</div>
            <div style={{ color: accentColor, fontWeight: 900, fontSize: (isL ? 22 : 17) * f,
              lineHeight: 1, fontFamily: "Georgia, serif", textAlign: "center" }}>{h}</div>
            {fp && <div style={{ color: "rgba(255,255,255,0.65)", fontSize: (isL ? 7.5 : 6.5) * f,
              textAlign: "center", lineHeight: 1.3 }}>{fp}</div>}
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: (isL ? 7 : 6) * f,
              fontStyle: "italic" }}>with this postcard</div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div style={{ flexShrink: 0, background: "rgba(0,0,0,0.4)",
        padding: `${3 * f}px ${8 * f}px`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {phone && <span style={{ color: accentColor, fontWeight: 800, fontSize: (isL ? 8 : 7) * f }}>☎ {phone}</span>}
        {address && <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 7 * f,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>📍 {address}</span>}
      </div>
    </div>
  );
}

// ─── DENTAL-A: Clean Smile ───────────────────────────────────────────────────
function DentalA({ businessName, tagline, offer, offerFinePrint, offer2, offer2FinePrint,
  address, phone, hours, logo, photos = [], size, accentColor, industry = "Dentist" }) {
  const f = scaleFactor(size);
  const isL = size === "large";
  const gold = "#d4a017";
  const heroPhoto = (photos || []).find(p => p) || pickFallbackPhoto(industry, businessName, "hero", 0);
  return (
    <div style={{ ...baseBox, background: "#fff", color: "#111", display: "flex", flexDirection: "column" }}>
      {/* Hero photo */}
      <div style={{ flex: "0 0 36%", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${heroPhoto})`, backgroundSize: "cover", backgroundPosition: "center top" }} />
        <div style={{ position: "absolute", inset: 0,
          background: `linear-gradient(180deg, rgba(0,0,0,0.05) 40%, ${shade(accentColor, -10)} 100%)` }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
          padding: `${4 * f}px ${8 * f}px`, display: "flex", alignItems: "center", gap: 6 * f }}>
          <LogoBadge logo={logo} businessName={businessName}
            size={(isL ? 34 : 27) * f} bg={gold} color="#fff" border="2px solid rgba(255,255,255,0.6)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: (isL ? 13 : 11) * f,
              fontFamily: "Georgia, serif", lineHeight: 1.1, textShadow: "0 1px 4px rgba(0,0,0,0.7)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {businessName || "Your Practice"}
            </div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: (isL ? 8 : 7) * f }}>
              {tagline || "Accepting New Patients"}
            </div>
          </div>
        </div>
      </div>
      {/* Coupon block */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6 * f,
        padding: `${7 * f}px ${8 * f}px`, alignItems: "stretch", background: shade(accentColor, -5) }}>
        {[{ h: offer, fp: offerFinePrint }, ...(offer2 ? [{ h: offer2, fp: offer2FinePrint }] : [])].map(({ h, fp }, i) => h && (
          <div key={i} style={{ flex: 1, position: "relative",
            border: `2px dashed ${gold}`, borderRadius: 5 * f,
            background: "rgba(0,0,0,0.2)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: `${5 * f}px ${5 * f}px`, gap: 3 * f }}>
            <div style={{ position: "absolute", top: -9 * f, left: "50%", transform: "translateX(-50%)",
              color: gold, fontSize: 11 * f, background: shade(accentColor, -5), padding: "0 4px" }}>✂</div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: (isL ? 7 : 6.5) * f,
              letterSpacing: 2, textTransform: "uppercase", fontFamily: "sans-serif" }}>Bring This Ad</div>
            <div style={{ color: gold, fontWeight: 900, fontSize: (isL ? 21 : 16) * f,
              lineHeight: 1, fontFamily: "Georgia, serif", textAlign: "center" }}>{h}</div>
            {fp && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: (isL ? 7.5 : 6.5) * f,
              textAlign: "center", lineHeight: 1.3 }}>{fp}</div>}
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: (isL ? 7 : 6) * f,
              fontStyle: "italic" }}>with this postcard</div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div style={{ flexShrink: 0, background: shade(accentColor, -25),
        padding: `${3 * f}px ${8 * f}px`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {phone && <span style={{ color: gold, fontWeight: 800, fontSize: (isL ? 7.5 : 7) * f }}>☎ {phone}</span>}
        {address && <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 7 * f,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "62%" }}>📍 {address}</span>}
      </div>
    </div>
  );
}

// ─── DENTAL-B: Modern Care ───────────────────────────────────────────────────
function DentalB({ businessName, tagline, offer, offerFinePrint, offer2, offer2FinePrint,
  address, phone, hours, logo, photos = [], size, accentColor, industry = "Dentist" }) {
  const f = scaleFactor(size);
  const isL = size === "large";
  const heroPhoto = (photos || []).find(p => p) || pickFallbackPhoto(industry, businessName, "hero", 1);
  const light = shade(accentColor, 120);
  return (
    <div style={{ ...baseBox, display: "flex", flexDirection: "column",
      background: "linear-gradient(160deg, #f0f9ff 0%, #dbeafe 100%)" }}>
      {/* Hero photo */}
      <div style={{ flex: "0 0 36%", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${heroPhoto})`, backgroundSize: "cover", backgroundPosition: "center top" }} />
        <div style={{ position: "absolute", inset: 0,
          background: `linear-gradient(180deg, rgba(0,0,0,0.05) 50%, ${accentColor} 100%)` }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
          padding: `${4 * f}px ${8 * f}px`, display: "flex", alignItems: "center", gap: 6 * f }}>
          <LogoBadge logo={logo} businessName={businessName}
            size={(isL ? 34 : 27) * f} bg={accentColor} color="#fff"
            border="2px solid rgba(255,255,255,0.5)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: (isL ? 13 : 11) * f,
              fontFamily: "Georgia, serif", lineHeight: 1.1, textShadow: "0 1px 4px rgba(0,0,0,0.7)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {businessName || "Your Practice"}
            </div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: (isL ? 8 : 7) * f }}>
              {tagline || "Now Accepting New Patients"}
            </div>
          </div>
          {phone && <div style={{ color: "#fde8a0", fontWeight: 800, fontSize: (isL ? 8 : 7) * f, flexShrink: 0 }}>
            ☎ {phone}
          </div>}
        </div>
      </div>
      {/* Coupon block */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6 * f,
        padding: `${7 * f}px ${8 * f}px`, alignItems: "stretch", background: accentColor }}>
        {[{ h: offer, fp: offerFinePrint }, ...(offer2 ? [{ h: offer2, fp: offer2FinePrint }] : [])].map(({ h, fp }, i) => h && (
          <div key={i} style={{ flex: 1, position: "relative",
            border: "2px dashed rgba(255,255,255,0.6)", borderRadius: 5 * f,
            background: "rgba(0,0,0,0.2)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: `${5 * f}px ${5 * f}px`, gap: 3 * f }}>
            <div style={{ position: "absolute", top: -9 * f, left: "50%", transform: "translateX(-50%)",
              color: "#fde8a0", fontSize: 11 * f, background: accentColor, padding: "0 4px" }}>✂</div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: (isL ? 7 : 6.5) * f,
              letterSpacing: 2, textTransform: "uppercase" }}>Bring This Ad</div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: (isL ? 21 : 16) * f,
              lineHeight: 1, fontFamily: "Georgia, serif", textAlign: "center" }}>{h}</div>
            {fp && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: (isL ? 7.5 : 6.5) * f,
              textAlign: "center", lineHeight: 1.3 }}>{fp}</div>}
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: (isL ? 7 : 6) * f,
              fontStyle: "italic" }}>with this postcard</div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div style={{ flexShrink: 0, background: shade(accentColor, -25),
        padding: `${3 * f}px ${8 * f}px`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {address && <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 7 * f,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {address}</span>}
        {hours && isL && <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 7 * f }}>⏰ {hours}</span>}
      </div>
    </div>
  );
}

// ─── HVAC-A: Emergency ───────────────────────────────────────────────────────
function HvacA({ businessName, tagline, offer, offerFinePrint, offer2, offer2FinePrint,
  address, phone, photos = [], logo, size, accentColor, industry = "HVAC and Heating and Cooling" }) {
  const f = scaleFactor(size);
  const isL = size === "large";
  const heroPhoto = (photos || []).find(p => p) || pickFallbackPhoto(industry, businessName, "hero", 0);
  const red = "#dc2626";
  const darkBg = "linear-gradient(160deg, #001a2e 0%, #000c18 100%)";
  return (
    <div style={{ ...baseBox, display: "flex", flexDirection: "column",
      background: "linear-gradient(160deg, #001a2e 0%, #000c18 100%)" }}>
      {/* Hero photo with emergency banner */}
      <div style={{ flex: "0 0 38%", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${heroPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,12,24,0.9) 100%)" }} />
        {/* Emergency badge */}
        <div style={{ position: "absolute", top: 6 * f, left: 6 * f,
          background: red, color: "#fff", padding: `${3 * f}px ${8 * f}px`,
          borderRadius: 4, fontSize: 9 * f, fontWeight: 900, letterSpacing: 1.5,
          boxShadow: "0 2px 8px rgba(220,38,38,0.7)", zIndex: 2 }}>24/7 EMERGENCY</div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
          padding: `${4 * f}px ${8 * f}px`, display: "flex", alignItems: "center", gap: 6 * f }}>
          <LogoBadge logo={logo} businessName={businessName}
            size={(isL ? 34 : 27) * f} bg={accentColor} color="#fff"
            border="2px solid rgba(255,255,255,0.4)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: (isL ? 13 : 11) * f,
              fontFamily: "Georgia, serif", lineHeight: 1.1, textShadow: "0 1px 4px rgba(0,0,0,0.9)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {businessName || "Your HVAC Co."}
            </div>
            {phone && <div style={{ color: "#fbbf24", fontWeight: 900, fontSize: (isL ? 9 : 8) * f }}>
              ☎ {phone}
            </div>}
          </div>
        </div>
      </div>
      {/* Coupon block */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6 * f,
        padding: `${7 * f}px ${8 * f}px`, alignItems: "stretch" }}>
        {[{ h: offer, fp: offerFinePrint }, ...(offer2 ? [{ h: offer2, fp: offer2FinePrint }] : [])].map(({ h, fp }, i) => h && (
          <div key={i} style={{ flex: 1, position: "relative",
            border: `2px dashed ${red}`, borderRadius: 5 * f,
            background: "rgba(220,38,38,0.12)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: `${5 * f}px ${5 * f}px`, gap: 3 * f }}>
            <div style={{ position: "absolute", top: -9 * f, left: "50%", transform: "translateX(-50%)",
              color: red, fontSize: 11 * f, background: "#000c18", padding: "0 4px" }}>✂</div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: (isL ? 7 : 6.5) * f,
              letterSpacing: 2, textTransform: "uppercase" }}>Bring This Ad</div>
            <div style={{ color: "#fbbf24", fontWeight: 900, fontSize: (isL ? 21 : 16) * f,
              lineHeight: 1, fontFamily: "Georgia, serif", textAlign: "center" }}>{h}</div>
            {fp && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: (isL ? 7.5 : 6.5) * f,
              textAlign: "center", lineHeight: 1.3 }}>{fp}</div>}
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: (isL ? 7 : 6) * f,
              fontStyle: "italic" }}>with this postcard</div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div style={{ flexShrink: 0, background: "rgba(0,0,0,0.5)",
        padding: `${3 * f}px ${8 * f}px`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {tagline && <span style={{ color: "rgba(255,255,255,0.6)", fontSize: (isL ? 7.5 : 7) * f,
          fontStyle: "italic" }}>{tagline}</span>}
        {address && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 7 * f,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>📍 {address}</span>}
      </div>
    </div>
  );
}

// ─── HVAC-B: Pro Service ─────────────────────────────────────────────────────
function HvacB({ businessName, tagline, offer, offerFinePrint, offer2, offer2FinePrint,
  address, phone, hours, logo, photos = [], size, accentColor, industry = "HVAC and Heating and Cooling" }) {
  const f = scaleFactor(size);
  const isL = size === "large";
  const heroPhoto = (photos || []).find(p => p) || pickFallbackPhoto(industry, businessName, "hero", 1);
  const ct = contrastText(accentColor);
  const dark = shade(accentColor, -25);
  return (
    <div style={{ ...baseBox, display: "flex", flexDirection: "column", background: dark }}>
      {/* Hero photo */}
      <div style={{ flex: "0 0 38%", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${heroPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0,
          background: `linear-gradient(180deg, rgba(0,0,0,0.1) 0%, ${dark} 100%)` }} />
        <div style={{ position: "absolute", top: 6 * f, left: 6 * f,
          background: accentColor, color: ct, padding: `${3 * f}px ${8 * f}px`,
          borderRadius: 4, fontSize: 9 * f, fontWeight: 900, letterSpacing: 1 }}>PRO SERVICE</div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
          padding: `${4 * f}px ${8 * f}px`, display: "flex", alignItems: "center", gap: 6 * f }}>
          <LogoBadge logo={logo} businessName={businessName}
            size={(isL ? 34 : 27) * f} bg="#fff" color={accentColor}
            border={`2px solid ${accentColor}`} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: (isL ? 13 : 11) * f,
              fontFamily: "Georgia, serif", lineHeight: 1.1, textShadow: "0 1px 4px rgba(0,0,0,0.8)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {businessName || "Your HVAC Co."}
            </div>
            {phone && <div style={{ color: accentColor, fontWeight: 800, fontSize: (isL ? 9 : 8) * f }}>
              ☎ {phone}
            </div>}
          </div>
        </div>
      </div>
      {/* Coupon block */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6 * f,
        padding: `${7 * f}px ${8 * f}px`, alignItems: "stretch" }}>
        {[{ h: offer, fp: offerFinePrint }, ...(offer2 ? [{ h: offer2, fp: offer2FinePrint }] : [])].map(({ h, fp }, i) => h && (
          <div key={i} style={{ flex: 1, position: "relative",
            border: `2px dashed ${accentColor}`, borderRadius: 5 * f,
            background: "rgba(255,255,255,0.07)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: `${5 * f}px ${5 * f}px`, gap: 3 * f }}>
            <div style={{ position: "absolute", top: -9 * f, left: "50%", transform: "translateX(-50%)",
              color: accentColor, fontSize: 11 * f, background: dark, padding: "0 4px" }}>✂</div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: (isL ? 7 : 6.5) * f,
              letterSpacing: 2, textTransform: "uppercase" }}>Bring This Ad</div>
            <div style={{ color: accentColor, fontWeight: 900, fontSize: (isL ? 21 : 16) * f,
              lineHeight: 1, fontFamily: "Georgia, serif", textAlign: "center" }}>{h}</div>
            {fp && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: (isL ? 7.5 : 6.5) * f,
              textAlign: "center", lineHeight: 1.3 }}>{fp}</div>}
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: (isL ? 7 : 6) * f,
              fontStyle: "italic" }}>with this postcard</div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div style={{ flexShrink: 0, background: "rgba(0,0,0,0.4)",
        padding: `${3 * f}px ${8 * f}px`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {address && <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 7 * f,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {address}</span>}
        {hours && isL && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 7 * f }}>⏰ {hours}</span>}
      </div>
    </div>
  );
}

// ─── REALTY-A: The Listing ───────────────────────────────────────────────────
function RealtyA({ businessName, tagline, offer, offerFinePrint, offer2, offer2FinePrint,
  address, phone, website, logo, photos = [], size, accentColor, industry = "Real Estate" }) {
  const f = scaleFactor(size);
  const isL = size === "large";
  const gold = "#c9a227";
  const heroPhoto = (photos || []).find(p => p) || pickFallbackPhoto(industry, businessName, "hero", 0);
  const dark = shade(accentColor, -20);
  return (
    <div style={{ ...baseBox, display: "flex", flexDirection: "column", background: "#faf6ed" }}>
      {/* Property photo */}
      <div style={{ flex: "0 0 40%", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${heroPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0,
          background: `linear-gradient(180deg, rgba(0,0,0,0.05) 40%, ${dark} 100%)` }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
          padding: `${4 * f}px ${8 * f}px`, display: "flex", alignItems: "center", gap: 6 * f }}>
          <LogoBadge logo={logo} businessName={businessName}
            size={(isL ? 34 : 27) * f} bg={gold} color="#fff" border="2px solid rgba(255,255,255,0.5)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: (isL ? 13 : 11) * f,
              fontFamily: "Georgia, serif", lineHeight: 1.1, textShadow: "0 1px 4px rgba(0,0,0,0.8)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {businessName || "Your Realty"}
            </div>
            {tagline && <div style={{ color: gold, fontSize: (isL ? 8 : 7) * f,
              fontStyle: "italic" }}>"{tagline}"</div>}
          </div>
          {phone && <div style={{ color: gold, fontWeight: 800, fontSize: (isL ? 8 : 7) * f, flexShrink: 0 }}>
            ☎ {phone}
          </div>}
        </div>
      </div>
      {/* Coupon block */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6 * f,
        padding: `${7 * f}px ${8 * f}px`, alignItems: "stretch", background: dark }}>
        {[{ h: offer, fp: offerFinePrint }, ...(offer2 ? [{ h: offer2, fp: offer2FinePrint }] : [])].map(({ h, fp }, i) => h && (
          <div key={i} style={{ flex: 1, position: "relative",
            border: `2px dashed ${gold}`, borderRadius: 5 * f,
            background: "rgba(0,0,0,0.2)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: `${5 * f}px ${5 * f}px`, gap: 3 * f }}>
            <div style={{ position: "absolute", top: -9 * f, left: "50%", transform: "translateX(-50%)",
              color: gold, fontSize: 11 * f, background: dark, padding: "0 4px" }}>✂</div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: (isL ? 7 : 6.5) * f,
              letterSpacing: 2, textTransform: "uppercase" }}>Bring This Ad</div>
            <div style={{ color: gold, fontWeight: 900, fontSize: (isL ? 21 : 16) * f,
              lineHeight: 1, fontFamily: "Georgia, serif", textAlign: "center" }}>{h}</div>
            {fp && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: (isL ? 7.5 : 6.5) * f,
              textAlign: "center", lineHeight: 1.3 }}>{fp}</div>}
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: (isL ? 7 : 6) * f,
              fontStyle: "italic" }}>with this postcard</div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div style={{ flexShrink: 0, background: shade(accentColor, -35),
        padding: `${3 * f}px ${8 * f}px`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {address && <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 7 * f,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {address}</span>}
        {website && isL && <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 7 * f }}>🌐 {website}</span>}
      </div>
    </div>
  );
}

// ─── REALTY-B: Bold Sale ─────────────────────────────────────────────────────
function RealtyB({ businessName, tagline, offer, offerFinePrint, offer2, offer2FinePrint,
  address, phone, logo, photos = [], size, accentColor, industry = "Real Estate" }) {
  const f = scaleFactor(size);
  const isL = size === "large";
  const gold = "#fbbf24";
  const bg = "#0f3a2e";
  const heroPhoto = (photos || []).find(p => p) || pickFallbackPhoto(industry, businessName, "hero", 1);
  return (
    <div style={{ ...baseBox, display: "flex", flexDirection: "column", background: bg }}>
      {/* Property photo */}
      <div style={{ flex: "0 0 38%", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${heroPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0,
          background: "linear-gradient(180deg, rgba(15,58,46,0.2) 0%, rgba(15,58,46,0.9) 100%)" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
          padding: `${4 * f}px ${8 * f}px`, display: "flex", alignItems: "center", gap: 6 * f,
          borderBottom: `1px solid ${gold}` }}>
          <LogoBadge logo={logo} businessName={businessName}
            size={(isL ? 34 : 27) * f} bg={gold} color={bg} border="none" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: (isL ? 13 : 11) * f,
              fontFamily: "Georgia, serif", lineHeight: 1.1, textShadow: "0 1px 4px rgba(0,0,0,0.8)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {businessName || "Your Realty"}
            </div>
            <div style={{ color: gold, fontSize: (isL ? 8 : 7) * f, fontWeight: 700,
              letterSpacing: 1, textTransform: "uppercase" }}>Buying or Selling?</div>
          </div>
          {phone && <div style={{ color: gold, fontWeight: 800, fontSize: (isL ? 8 : 7) * f, flexShrink: 0 }}>
            ☎ {phone}
          </div>}
        </div>
      </div>
      {/* Coupon block */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6 * f,
        padding: `${7 * f}px ${8 * f}px`, alignItems: "stretch" }}>
        {[{ h: offer, fp: offerFinePrint }, ...(offer2 ? [{ h: offer2, fp: offer2FinePrint }] : [])].map(({ h, fp }, i) => h && (
          <div key={i} style={{ flex: 1, position: "relative",
            border: `2px dashed ${gold}`, borderRadius: 5 * f,
            background: "rgba(251,191,36,0.08)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: `${5 * f}px ${5 * f}px`, gap: 3 * f }}>
            <div style={{ position: "absolute", top: -9 * f, left: "50%", transform: "translateX(-50%)",
              color: gold, fontSize: 11 * f, background: bg, padding: "0 4px" }}>✂</div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: (isL ? 7 : 6.5) * f,
              letterSpacing: 2, textTransform: "uppercase" }}>Bring This Ad</div>
            <div style={{ color: gold, fontWeight: 900, fontSize: (isL ? 21 : 16) * f,
              lineHeight: 1, fontFamily: "Georgia, serif", textAlign: "center" }}>{h}</div>
            {fp && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: (isL ? 7.5 : 6.5) * f,
              textAlign: "center", lineHeight: 1.3 }}>{fp}</div>}
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: (isL ? 7 : 6) * f,
              fontStyle: "italic" }}>with this postcard</div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div style={{ flexShrink: 0, background: "rgba(0,0,0,0.4)",
        borderTop: `1px solid rgba(251,191,36,0.3)`,
        padding: `${3 * f}px ${8 * f}px`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {address && <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 7 * f,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {address}</span>}
        {tagline && isL && <span style={{ color: gold, fontSize: 7 * f, fontStyle: "italic" }}>{tagline}</span>}
      </div>
    </div>
  );
}

// ─── INSURANCE-A: The Shield ─────────────────────────────────────────────────
function InsuranceA({ businessName, tagline, offer, offerFinePrint, offer2, offer2FinePrint,
  address, phone, logo, photos = [], size, accentColor, industry = "Insurance" }) {
  const f = scaleFactor(size);
  const isL = size === "large";
  const gold = "#e2b714";
  const heroPhoto = (photos || []).find(p => p) || pickFallbackPhoto(industry, businessName, "hero", 0);
  const dark = shade(accentColor, -20);
  return (
    <div style={{ ...baseBox, display: "flex", flexDirection: "column", background: accentColor }}>
      {/* Hero photo */}
      <div style={{ flex: "0 0 38%", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${heroPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0,
          background: `linear-gradient(180deg, rgba(0,0,0,0.2) 0%, ${accentColor} 100%)` }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
          padding: `${4 * f}px ${8 * f}px`, display: "flex", alignItems: "center", gap: 6 * f }}>
          <div style={{ width: (isL ? 32 : 26) * f, height: (isL ? 38 : 31) * f, position: "relative",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ position: "absolute", inset: 0, background: gold,
              clipPath: "polygon(50% 0%, 100% 18%, 100% 55%, 50% 100%, 0% 55%, 0% 18%)" }} />
            <LogoBadge logo={logo} businessName={businessName}
              size={(isL ? 22 : 18) * f} bg="transparent" color={accentColor} border="none" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: gold, fontSize: (isL ? 7.5 : 6.5) * f, fontWeight: 700,
              letterSpacing: 2, textTransform: "uppercase" }}>Your Local Agent</div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: (isL ? 13 : 10) * f,
              fontFamily: "Georgia, serif", lineHeight: 1.1,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {businessName || "Your Insurance"}
            </div>
          </div>
          {phone && <div style={{ color: gold, fontWeight: 800, fontSize: (isL ? 8 : 7) * f, flexShrink: 0 }}>
            ☎ {phone}
          </div>}
        </div>
      </div>
      {/* Coupon block */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6 * f,
        padding: `${7 * f}px ${8 * f}px`, alignItems: "stretch" }}>
        {[{ h: offer, fp: offerFinePrint }, ...(offer2 ? [{ h: offer2, fp: offer2FinePrint }] : [])].map(({ h, fp }, i) => h && (
          <div key={i} style={{ flex: 1, position: "relative",
            border: `2px dashed ${gold}`, borderRadius: 5 * f,
            background: "rgba(226,183,20,0.12)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: `${5 * f}px ${5 * f}px`, gap: 3 * f }}>
            <div style={{ position: "absolute", top: -9 * f, left: "50%", transform: "translateX(-50%)",
              color: gold, fontSize: 11 * f, background: accentColor, padding: "0 4px" }}>✂</div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: (isL ? 7 : 6.5) * f,
              letterSpacing: 2, textTransform: "uppercase" }}>Bring This Ad</div>
            <div style={{ color: gold, fontWeight: 900, fontSize: (isL ? 21 : 16) * f,
              lineHeight: 1, fontFamily: "Georgia, serif", textAlign: "center" }}>{h}</div>
            {fp && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: (isL ? 7.5 : 6.5) * f,
              textAlign: "center", lineHeight: 1.3 }}>{fp}</div>}
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: (isL ? 7 : 6) * f,
              fontStyle: "italic" }}>with this postcard</div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div style={{ flexShrink: 0, background: dark,
        borderTop: `1px solid rgba(226,183,20,0.3)`,
        padding: `${3 * f}px ${8 * f}px`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {tagline && <span style={{ color: "rgba(255,255,255,0.7)", fontSize: (isL ? 7.5 : 7) * f,
          fontStyle: "italic" }}>{tagline}</span>}
        {address && <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 7 * f,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>📍 {address}</span>}
      </div>
    </div>
  );
}

// ─── INSURANCE-B: The Trustworthy ────────────────────────────────────────────
function InsuranceB({ businessName, tagline, offer, offerFinePrint, offer2, offer2FinePrint,
  address, phone, hours, logo, photos = [], size, accentColor, industry = "Insurance" }) {
  const f = scaleFactor(size);
  const isL = size === "large";
  const gold = "#d4a017";
  const heroPhoto = (photos || []).find(p => p) || pickFallbackPhoto(industry, businessName, "hero", 1);
  const dark = shade(accentColor, -22);
  return (
    <div style={{ ...baseBox, display: "flex", flexDirection: "column", background: dark }}>
      {/* Hero photo */}
      <div style={{ flex: "0 0 38%", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${heroPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0,
          background: `linear-gradient(180deg, rgba(0,0,0,0.1) 0%, ${dark} 100%)` }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
          padding: `${4 * f}px ${8 * f}px`, display: "flex", alignItems: "center", gap: 6 * f }}>
          <LogoBadge logo={logo} businessName={businessName}
            size={(isL ? 34 : 27) * f} bg={accentColor} color="#fff" border="none" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: (isL ? 13 : 10) * f,
              fontFamily: "Georgia, serif", lineHeight: 1.1,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {businessName || "Your Insurance"}
            </div>
            <div style={{ color: gold, fontWeight: 700, fontSize: (isL ? 8 : 7) * f,
              letterSpacing: 1 }}>AUTO · HOME · LIFE</div>
          </div>
          {phone && <div style={{ color: gold, fontWeight: 800, fontSize: (isL ? 8 : 7) * f, flexShrink: 0 }}>
            ☎ {phone}
          </div>}
        </div>
      </div>
      {/* Coupon block */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6 * f,
        padding: `${7 * f}px ${8 * f}px`, alignItems: "stretch" }}>
        {[{ h: offer, fp: offerFinePrint }, ...(offer2 ? [{ h: offer2, fp: offer2FinePrint }] : [])].map(({ h, fp }, i) => h && (
          <div key={i} style={{ flex: 1, position: "relative",
            border: `2px dashed ${gold}`, borderRadius: 5 * f,
            background: "rgba(0,0,0,0.2)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: `${5 * f}px ${5 * f}px`, gap: 3 * f }}>
            <div style={{ position: "absolute", top: -9 * f, left: "50%", transform: "translateX(-50%)",
              color: gold, fontSize: 11 * f, background: dark, padding: "0 4px" }}>✂</div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: (isL ? 7 : 6.5) * f,
              letterSpacing: 2, textTransform: "uppercase" }}>Bring This Ad</div>
            <div style={{ color: gold, fontWeight: 900, fontSize: (isL ? 21 : 16) * f,
              lineHeight: 1, fontFamily: "Georgia, serif", textAlign: "center" }}>{h}</div>
            {fp && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: (isL ? 7.5 : 6.5) * f,
              textAlign: "center", lineHeight: 1.3 }}>{fp}</div>}
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: (isL ? 7 : 6) * f,
              fontStyle: "italic" }}>with this postcard</div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div style={{ flexShrink: 0, background: "rgba(0,0,0,0.4)",
        padding: `${3 * f}px ${8 * f}px`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {address && <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 7 * f,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {address}</span>}
        {tagline && isL && <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 7 * f,
          fontStyle: "italic" }}>{tagline}</span>}
      </div>
    </div>
  );
}

// ─── LAWN-A: The Outdoor ─────────────────────────────────────────────────────
function LawnA({ businessName, tagline, offer, offerFinePrint, offer2, offer2FinePrint,
  address, phone, logo, photos = [], size, accentColor, industry = "Lawn and Landscaping" }) {
  const f = scaleFactor(size);
  const isL = size === "large";
  const heroPhoto = (photos || []).find(p => p) || pickFallbackPhoto(industry, businessName, "hero", 0);
  const dark = shade(accentColor, -22);
  const sun = "#fbbf24";
  return (
    <div style={{ ...baseBox, display: "flex", flexDirection: "column", background: dark }}>
      {/* Hero photo */}
      <div style={{ flex: "0 0 40%", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${heroPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0,
          background: `linear-gradient(180deg, rgba(0,0,0,0.05) 0%, ${dark} 100%)` }} />
        {/* Sun decoration */}
        <div style={{ position: "absolute", top: 6 * f, right: 8 * f,
          width: 22 * f, height: 22 * f, borderRadius: "50%", background: sun,
          boxShadow: "0 0 12px rgba(251,191,36,0.7)", opacity: 0.9 }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
          padding: `${4 * f}px ${8 * f}px`, display: "flex", alignItems: "center", gap: 6 * f }}>
          <LogoBadge logo={logo} businessName={businessName}
            size={(isL ? 34 : 27) * f} bg="rgba(255,255,255,0.2)" color="#fff"
            border="2px solid rgba(255,255,255,0.6)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: (isL ? 13 : 10) * f,
              fontFamily: "Georgia, serif", lineHeight: 1.1, textShadow: "0 1px 4px rgba(0,0,0,0.8)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {businessName || "Your Lawn Care"}
            </div>
            {tagline && <div style={{ color: "rgba(255,255,255,0.8)", fontSize: (isL ? 8 : 7) * f }}>
              {tagline}
            </div>}
          </div>
          {phone && <div style={{ color: sun, fontWeight: 800, fontSize: (isL ? 8 : 7) * f, flexShrink: 0 }}>
            ☎ {phone}
          </div>}
        </div>
      </div>
      {/* Coupon block */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6 * f,
        padding: `${7 * f}px ${8 * f}px`, alignItems: "stretch" }}>
        {[{ h: offer, fp: offerFinePrint }, ...(offer2 ? [{ h: offer2, fp: offer2FinePrint }] : [])].map(({ h, fp }, i) => h && (
          <div key={i} style={{ flex: 1, position: "relative",
            border: "2px dashed rgba(255,255,255,0.55)", borderRadius: 5 * f,
            background: "rgba(0,0,0,0.25)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: `${5 * f}px ${5 * f}px`, gap: 3 * f }}>
            <div style={{ position: "absolute", top: -9 * f, left: "50%", transform: "translateX(-50%)",
              color: sun, fontSize: 11 * f, background: dark, padding: "0 4px" }}>✂</div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: (isL ? 7 : 6.5) * f,
              letterSpacing: 2, textTransform: "uppercase" }}>Bring This Ad</div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: (isL ? 21 : 16) * f,
              lineHeight: 1, fontFamily: "Georgia, serif", textAlign: "center" }}>{h}</div>
            {fp && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: (isL ? 7.5 : 6.5) * f,
              textAlign: "center", lineHeight: 1.3 }}>{fp}</div>}
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: (isL ? 7 : 6) * f,
              fontStyle: "italic" }}>with this postcard</div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div style={{ flexShrink: 0, background: "rgba(0,0,0,0.4)",
        padding: `${3 * f}px ${8 * f}px`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {address && <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 7 * f,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {address}</span>}
      </div>
    </div>
  );
}

// ─── LAWN-B: The Clean Cut ───────────────────────────────────────────────────
function LawnB({ businessName, tagline, offer, offerFinePrint, offer2, offer2FinePrint,
  address, phone, hours, logo, photos = [], size, accentColor, industry = "Lawn and Landscaping" }) {
  const f = scaleFactor(size);
  const isL = size === "large";
  const heroPhoto = (photos || []).find(p => p) || pickFallbackPhoto(industry, businessName, "hero", 1);
  const ct = contrastText(accentColor);
  const dark = shade(accentColor, -20);
  return (
    <div style={{ ...baseBox, display: "flex", flexDirection: "column", background: "#fff" }}>
      {/* Hero photo */}
      <div style={{ flex: "0 0 38%", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${heroPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0,
          background: `linear-gradient(180deg, rgba(0,0,0,0.05) 40%, ${accentColor} 100%)` }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
          padding: `${4 * f}px ${8 * f}px`, display: "flex", alignItems: "center", gap: 6 * f }}>
          <LogoBadge logo={logo} businessName={businessName}
            size={(isL ? 32 : 26) * f} bg="#fff" color={accentColor} border="none" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: ct, fontWeight: 900, fontSize: (isL ? 13 : 10) * f,
              fontFamily: "Georgia, serif", lineHeight: 1.1, textShadow: "0 1px 3px rgba(0,0,0,0.6)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {businessName || "Your Lawn Care"}
            </div>
            {tagline && <div style={{ color: ct === "#fff" ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.7)",
              fontSize: (isL ? 8 : 7) * f }}>{tagline}</div>}
          </div>
          {phone && <div style={{ color: ct === "#fff" ? "#fde8a0" : dark,
            fontWeight: 800, fontSize: (isL ? 8 : 7) * f, flexShrink: 0 }}>☎ {phone}</div>}
        </div>
      </div>
      {/* Coupon block */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6 * f,
        padding: `${7 * f}px ${8 * f}px`, alignItems: "stretch", background: accentColor }}>
        {[{ h: offer, fp: offerFinePrint }, ...(offer2 ? [{ h: offer2, fp: offer2FinePrint }] : [])].map(({ h, fp }, i) => h && (
          <div key={i} style={{ flex: 1, position: "relative",
            border: "2px dashed rgba(255,255,255,0.55)", borderRadius: 5 * f,
            background: "rgba(0,0,0,0.2)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: `${5 * f}px ${5 * f}px`, gap: 3 * f }}>
            <div style={{ position: "absolute", top: -9 * f, left: "50%", transform: "translateX(-50%)",
              color: ct === "#fff" ? "#fde8a0" : "#fff", fontSize: 11 * f,
              background: accentColor, padding: "0 4px" }}>✂</div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: (isL ? 7 : 6.5) * f,
              letterSpacing: 2, textTransform: "uppercase" }}>Bring This Ad</div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: (isL ? 21 : 16) * f,
              lineHeight: 1, fontFamily: "Georgia, serif", textAlign: "center" }}>{h}</div>
            {fp && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: (isL ? 7.5 : 6.5) * f,
              textAlign: "center", lineHeight: 1.3 }}>{fp}</div>}
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: (isL ? 7 : 6) * f,
              fontStyle: "italic" }}>with this postcard</div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div style={{ flexShrink: 0, background: dark,
        padding: `${3 * f}px ${8 * f}px`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {address && <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 7 * f,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {address}</span>}
        {hours && isL && <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 7 * f }}>⏰ {hours}</span>}
      </div>
    </div>
  );
}

// ─── GENERAL-A: Bold Block ───────────────────────────────────────────────────
function GeneralA({ businessName, tagline, offer, offerFinePrint, offer2, offer2FinePrint,
  address, phone, logo, photos = [], size, accentColor, industry = "Other" }) {
  const f = scaleFactor(size);
  const isL = size === "large";
  const ct = contrastText(accentColor);
  const heroPhoto = (photos || []).find(p => p) || pickFallbackPhoto(industry, businessName, "hero", 0);
  const dark = shade(accentColor, -25);
  const accent2 = ct === "#fff" ? "#fbbf24" : accentColor;
  return (
    <div style={{ ...baseBox, display: "flex", flexDirection: "column", background: dark }}>
      {/* Hero photo */}
      <div style={{ flex: "0 0 38%", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${heroPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0,
          background: `linear-gradient(180deg, rgba(0,0,0,0.1) 0%, ${dark} 100%)` }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
          padding: `${4 * f}px ${8 * f}px`, display: "flex", alignItems: "center", gap: 6 * f }}>
          <LogoBadge logo={logo} businessName={businessName}
            size={(isL ? 34 : 27) * f}
            bg={ct === "#fff" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"}
            color={ct} border={`2px solid ${ct === "#fff" ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.2)"}`} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: (isL ? 14 : 11) * f,
              fontFamily: "Georgia, serif", lineHeight: 1.1, textShadow: "0 1px 4px rgba(0,0,0,0.8)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {businessName || "Your Business"}
            </div>
            {tagline && <div style={{ color: "rgba(255,255,255,0.8)", fontSize: (isL ? 8 : 7) * f,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tagline}</div>}
          </div>
          {phone && <div style={{ color: accent2, fontWeight: 800, fontSize: (isL ? 8 : 7) * f, flexShrink: 0 }}>
            ☎ {phone}
          </div>}
        </div>
      </div>
      {/* Coupon block */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6 * f,
        padding: `${7 * f}px ${8 * f}px`, alignItems: "stretch" }}>
        {[{ h: offer, fp: offerFinePrint }, ...(offer2 ? [{ h: offer2, fp: offer2FinePrint }] : [])].map(({ h, fp }, i) => h && (
          <div key={i} style={{ flex: 1, position: "relative",
            border: `2px dashed ${accent2}`, borderRadius: 5 * f,
            background: "rgba(0,0,0,0.2)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: `${5 * f}px ${5 * f}px`, gap: 3 * f }}>
            <div style={{ position: "absolute", top: -9 * f, left: "50%", transform: "translateX(-50%)",
              color: accent2, fontSize: 11 * f, background: dark, padding: "0 4px" }}>✂</div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: (isL ? 7 : 6.5) * f,
              letterSpacing: 2, textTransform: "uppercase" }}>Bring This Ad</div>
            <div style={{ color: accent2, fontWeight: 900, fontSize: (isL ? 21 : 16) * f,
              lineHeight: 1, fontFamily: "Georgia, serif", textAlign: "center" }}>{h}</div>
            {fp && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: (isL ? 7.5 : 6.5) * f,
              textAlign: "center", lineHeight: 1.3 }}>{fp}</div>}
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: (isL ? 7 : 6) * f,
              fontStyle: "italic" }}>with this postcard</div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div style={{ flexShrink: 0, background: "rgba(0,0,0,0.4)",
        padding: `${3 * f}px ${8 * f}px`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {address && <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 7 * f,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {address}</span>}
      </div>
    </div>
  );
}

// ─── GENERAL-B: The Split ────────────────────────────────────────────────────
function GeneralB({ businessName, tagline, offer, offerFinePrint, offer2, offer2FinePrint,
  address, phone, hours, logo, photos = [], size, accentColor, industry = "Other" }) {
  const f = scaleFactor(size);
  const isL = size === "large";
  const heroPhoto = (photos || []).find(p => p) || pickFallbackPhoto(industry, businessName, "hero", 1);
  const ct = contrastText(accentColor);
  const dark = shade(accentColor, -22);
  return (
    <div style={{ ...baseBox, display: "flex", flexDirection: "column", background: dark }}>
      {/* Hero photo */}
      <div style={{ flex: "0 0 38%", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${heroPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0,
          background: `linear-gradient(180deg, rgba(0,0,0,0.05) 0%, ${dark} 100%)` }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
          padding: `${4 * f}px ${8 * f}px`, display: "flex", alignItems: "center", gap: 6 * f }}>
          <LogoBadge logo={logo} businessName={businessName}
            size={(isL ? 34 : 27) * f} bg="rgba(255,255,255,0.2)" color="#fff"
            border="2px solid rgba(255,255,255,0.4)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: (isL ? 14 : 11) * f,
              fontFamily: "Georgia, serif", lineHeight: 1.1, textShadow: "0 1px 4px rgba(0,0,0,0.8)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {businessName || "Your Business"}
            </div>
            {tagline && <div style={{ color: "rgba(255,255,255,0.8)", fontSize: (isL ? 8 : 7) * f }}>
              {tagline}
            </div>}
          </div>
          {phone && <div style={{ color: accentColor, fontWeight: 800,
            fontSize: (isL ? 8 : 7) * f, flexShrink: 0 }}>☎ {phone}</div>}
        </div>
      </div>
      {/* Coupon block */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 6 * f,
        padding: `${7 * f}px ${8 * f}px`, alignItems: "stretch" }}>
        {[{ h: offer, fp: offerFinePrint }, ...(offer2 ? [{ h: offer2, fp: offer2FinePrint }] : [])].map(({ h, fp }, i) => h && (
          <div key={i} style={{ flex: 1, position: "relative",
            border: `2px dashed ${accentColor}`, borderRadius: 5 * f,
            background: "rgba(255,255,255,0.06)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: `${5 * f}px ${5 * f}px`, gap: 3 * f }}>
            <div style={{ position: "absolute", top: -9 * f, left: "50%", transform: "translateX(-50%)",
              color: accentColor, fontSize: 11 * f, background: dark, padding: "0 4px" }}>✂</div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: (isL ? 7 : 6.5) * f,
              letterSpacing: 2, textTransform: "uppercase" }}>Bring This Ad</div>
            <div style={{ color: accentColor, fontWeight: 900, fontSize: (isL ? 21 : 16) * f,
              lineHeight: 1, fontFamily: "Georgia, serif", textAlign: "center" }}>{h}</div>
            {fp && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: (isL ? 7.5 : 6.5) * f,
              textAlign: "center", lineHeight: 1.3 }}>{fp}</div>}
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: (isL ? 7 : 6) * f,
              fontStyle: "italic" }}>with this postcard</div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div style={{ flexShrink: 0, background: "rgba(0,0,0,0.4)",
        padding: `${3 * f}px ${8 * f}px`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {address && <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 7 * f,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {address}</span>}
        {hours && isL && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 7 * f }}>⏰ {hours}</span>}
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
