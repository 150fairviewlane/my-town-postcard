// ─────────────────────────────────────────────────────────────────────────────
// POSTCARD SAMPLE ADS — Rich Edition
// ─────────────────────────────────────────────────────────────────────────────

import { INDUSTRIES } from "./industryAssets";

// ─── Helper: Logo Badge ───────────────────────────────────────────────────────
function LogoBadge({ emoji, size = 40, bg = "rgba(255,255,255,0.18)", color = "#fff", border }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: bg,
      border: border || `2px solid ${color}55`,
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", flexShrink: 0,
    }}>
      <span style={{ fontSize: size * 0.5, lineHeight: 1 }}>{emoji}</span>
    </div>
  );
}

// ─── Helper: Coupon ───────────────────────────────────────────────────────────
function Coupon({ offer, fine, accent, scale = 1, dark = false }) {
  if (!offer) return null;
  return (
    <div style={{
      border: `${1.5 * scale}px dashed ${accent}`,
      background: dark ? "rgba(0,0,0,0.35)" : `${accent}15`,
      borderRadius: 4 * scale,
      padding: `${5 * scale}px ${10 * scale}px ${4 * scale}px`,
      textAlign: "center", position: "relative", flexShrink: 0,
    }}>
      <div style={{ position: "absolute", top: -1, left: 0, right: 0, display: "flex", alignItems: "center", padding: `0 ${4 * scale}px` }}>
        <span style={{ fontSize: 9 * scale, lineHeight: 1, flexShrink: 0, opacity: 0.75 }}>✂</span>
        <div style={{ flex: 1, marginLeft: 3 * scale, borderTop: `${1.2 * scale}px dashed ${accent}88` }} />
        <span style={{ fontSize: 9 * scale, lineHeight: 1, flexShrink: 0, opacity: 0.75, transform: "scaleX(-1)", display: "inline-block" }}>✂</span>
      </div>
      <div style={{ color: accent, fontWeight: 900, fontSize: 13 * scale, lineHeight: 1, letterSpacing: 0.3, marginTop: 3 * scale }}>{offer}</div>
      {fine && <div style={{ color: dark ? "rgba(255,255,255,0.75)" : "#666", fontSize: 7 * scale, marginTop: 2, fontFamily: "sans-serif" }}>{fine}</div>}
    </div>
  );
}

// ─── Helper: Starburst badge ──────────────────────────────────────────────────
function Starburst({ text, color = "#dc2626", size = 50 }) {
  return (
    <div style={{
      position: "relative", width: size, height: size,
      display: "flex", alignItems: "center", justifyContent: "center",
      transform: "rotate(-12deg)",
    }}>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: "absolute", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}>
        <polygon
          points="50,2 58,18 76,8 73,28 92,28 80,42 96,55 78,60 87,78 68,75 70,94 53,84 50,98 47,84 30,94 32,75 13,78 22,60 4,55 20,42 8,28 27,28 24,8 42,18"
          fill={color}
        />
      </svg>
      <span style={{ color: "#fff", fontWeight: 900, fontSize: size * 0.18, textAlign: "center", lineHeight: 1, position: "relative", zIndex: 1, padding: "0 4px", textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>{text}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE AD DATA CONFIGS
// ─────────────────────────────────────────────────────────────────────────────
export const SAMPLE_AD_CONFIGS = {
  "pizza": {
    template: "photo-bold", sizeKey: "L",
    data: {
      businessName: "Roma's Pizza & Subs", industry: "Pizza Restaurant",
      tagline: "Hand-Tossed. Oven Fresh.", starburst: "BOGO!",
      offer: "Buy 1 Pizza Get 1 FREE", offerFine: "Tues & Wed only · dine-in · show ad",
      phone: "(706) 555-0712", address: "182 Main St, Clarkesville",
      menuItems: ["Large Pizza $14.99", "Family Special $24.99", "Wings & Pizza Combo", "Free Delivery"],
    },
  },
  "dental": {
    template: "split-clean", sizeKey: "L",
    data: {
      businessName: "Clarkesville Family Dental", industry: "Dentist",
      tagline: "Accepting New Patients!", starburst: "NEW!",
      offer: "FREE Whitening Kit", offerFine: "w/ exam & cleaning · show this ad",
      phone: "(706) 555-0142", address: "142 Commerce St, Clarkesville",
      menuItems: ["Preventive Care & Cleanings", "Cosmetic & Whitening", "Family & Children's Care"],
    },
  },
  "insurance": {
    template: "magazine", sizeKey: "M",
    data: {
      businessName: "Tanner Insurance", industry: "Insurance",
      tagline: "Local Agent. Real Savings.",
      offer: "Save up to $500/yr", offerFine: "Free quote · no obligation",
      phone: "(706) 555-0388", address: "55 Green St, Clarkesville",
      menuItems: ["Auto", "Home", "Life", "Business"],
    },
  },
  "lawn": {
    template: "stamp", sizeKey: "M",
    data: {
      businessName: "Green Acres Lawn Care", industry: "Lawn & Landscaping",
      tagline: "Your Yard. Our Pride.", starburst: "$25 OFF",
      offer: "$25 OFF First Service", offerFine: "New customers · expires 6/30",
      phone: "(706) 555-0291", address: "Clarkesville, GA",
      menuItems: ["Weekly Mowing", "Spring Cleanup", "Mulch", "Free Estimates"],
    },
  },
  "salon": {
    template: "photo-bold", sizeKey: "M",
    data: {
      businessName: "The Cut Above Salon", industry: "Salon & Beauty",
      tagline: "Look Beautiful. Feel Confident.", starburst: "20% OFF",
      offer: "20% OFF First Visit", offerFine: "New clients · show this ad",
      phone: "(706) 555-0519", address: "Clarkesville, GA",
      menuItems: ["Cut & Color", "Wedding Hair", "Walk-Ins"],
    },
  },
  "autorepair": {
    template: "stamp", sizeKey: "L",
    data: {
      businessName: "Shadetree Auto Repair", industry: "Auto Repair",
      tagline: "Honest Repair. Fair Prices.", starburst: "FREE!",
      offer: "Free Diagnostic Check", offerFine: "With any repair · show ad",
      phone: "(770) 678-7890", address: "Clarkesville, GA",
      menuItems: ["Oil Change Special", "Brake Service", "AC Repair", "Free Estimates"],
    },
  },
  "mexican": {
    template: "photo-bold", sizeKey: "L",
    data: {
      businessName: "El Rancho Grill", industry: "Mexican Restaurant",
      tagline: "Auténtico Mexican Cuisine", starburst: "FREE!",
      offer: "Free Chips & Queso", offerFine: "With entrée purchase · show ad",
      phone: "(706) 555-0644", address: "Clarkesville, GA",
      menuItems: ["Taco Tuesday $1", "Margarita Hour", "Family Fajitas", "Free Chips"],
    },
  },
  "gym": {
    template: "photo-bold", sizeKey: "M",
    data: {
      businessName: "Peak Performance Gym", industry: "Gym & Fitness",
      tagline: "Get Fit. Feel Great.", starburst: "FREE!",
      offer: "Free 7-Day Trial", offerFine: "New members · no card needed",
      phone: "(706) 555-0788", address: "Clarkesville, GA",
      menuItems: ["Personal Training", "Group Classes", "24/7 Access"],
    },
  },
  "vet": {
    template: "split-clean", sizeKey: "M",
    data: {
      businessName: "Clarkesville Animal Clinic", industry: "Veterinarian",
      tagline: "Compassionate Pet Care",
      offer: "Free First Exam", offerFine: "New patients · call to schedule",
      phone: "(706) 555-0322", address: "Clarkesville, GA",
      menuItems: ["Wellness Exams", "Vaccinations", "Surgery & Dental", "Emergency Care"],
    },
  },
  "mrbiscuits": {
    template: "photo-bold", sizeKey: "XL",
    data: {
      businessName: "Mr. Biscuit's Café", industry: "Breakfast & Cafe",
      tagline: "From-Scratch Biscuits & Boba!", starburst: "$1 OFF",
      offer: "$1 OFF Any Biscuit", offerFine: "1 per visit · with this postcard",
      phone: "(706) 754-0105", address: "596 W Louise St D, Clarkesville",
      menuItems: ["Plain Biscuit $2.99", "Bacon Biscuit $4.99", "Chicken Tender $5.99", "NY Bagels $5.49"],
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 1: PHOTO-BOLD
// ─────────────────────────────────────────────────────────────────────────────
function PhotoBoldAd({ data, sizeKey }) {
  const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
  const photo = ind.photos[0];
  const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
  const fScale = isXL ? 1.7 : isL ? 1.35 : isM ? 0.95 : 0.7;
  const starColor = ind.colors.accent === "#fff" || ind.colors.accent === "#ffffff" ? "#dc2626" : ind.colors.accent;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "Georgia, serif", position: "relative", background: ind.colors.dark }}>
      <img src={photo} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        onError={e => { e.target.style.display = "none"; }} />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${ind.colors.dark}f0 0%, ${ind.colors.dark}40 22%, transparent 42%, transparent 58%, ${ind.colors.dark}cc 80%, ${ind.colors.dark}ff 100%)` }} />

      {/* Starburst */}
      {data.starburst && !isS && (
        <div style={{ position: "absolute", top: 8 * fScale, right: 8 * fScale, zIndex: 5 }}>
          <Starburst text={data.starburst} color={starColor} size={(isXL ? 75 : 58) * fScale} />
        </div>
      )}

      {/* Top: logo + name */}
      <div style={{ position: "relative", zIndex: 2, padding: `${9 * fScale}px ${10 * fScale}px ${4 * fScale}px`, display: "flex", alignItems: "center", gap: 8 * fScale, flexShrink: 0 }}>
        <LogoBadge emoji={ind.emoji} size={42 * fScale} bg={`${ind.colors.primary}dd`} color="#fff" border="2.5px solid #fff" />
        <div style={{ flex: 1, minWidth: 0, paddingRight: data.starburst && !isS ? 50 * fScale : 0 }}>
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 20 * fScale, lineHeight: 1.0, textShadow: "0 2px 12px rgba(0,0,0,0.95)", letterSpacing: -0.3 }}>{data.businessName}</div>
          {!isS && <div style={{ color: "#fff", opacity: 0.95, fontSize: 9 * fScale, marginTop: 2, fontFamily: "sans-serif", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}>{data.industry}</div>}
        </div>
      </div>

      {/* Center: tagline + phone badge */}
      <div style={{ position: "relative", zIndex: 2, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: `${4 * fScale}px ${12 * fScale}px`, gap: 7 * fScale }}>
        {!isS && (
          <div style={{ color: "#fff", fontWeight: 800, fontSize: (isXL ? 22 : isL ? 18 : 14) * fScale, lineHeight: 1.15, fontStyle: "italic", textShadow: "0 2px 14px rgba(0,0,0,0.95)", textAlign: "center" }}>
            &ldquo;{data.tagline}&rdquo;
          </div>
        )}
        {(isXL || isL) && data.phone && (
          <div style={{
            background: "rgba(0,0,0,0.55)", border: "2.5px solid #fff",
            color: "#fff", fontWeight: 900, fontSize: (isXL ? 24 : 19) * fScale,
            fontFamily: "sans-serif", padding: `${5 * fScale}px ${14 * fScale}px`,
            borderRadius: 8, letterSpacing: 0.5, textShadow: "0 2px 8px rgba(0,0,0,0.9)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}>
            📞 {data.phone}
          </div>
        )}
      </div>

      {/* Bottom: coupon + contact */}
      <div style={{ position: "relative", zIndex: 2, padding: `${5 * fScale}px ${10 * fScale}px ${8 * fScale}px`, display: "flex", flexDirection: "column", gap: 4 * fScale, flexShrink: 0 }}>
        {data.offer && <Coupon offer={data.offer} fine={isS ? null : data.offerFine} accent="#fff" scale={fScale} dark={true} />}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#fff", fontFamily: "sans-serif", textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}>
          {data.address && <div style={{ fontSize: 9 * fScale, fontWeight: 600 }}>📍 {data.address}</div>}
          {(isS || isM) && data.phone && <div style={{ fontWeight: 900, fontSize: 11 * fScale, color: "#fff" }}>📞 {data.phone}</div>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 2: SPLIT-CLEAN
// ─────────────────────────────────────────────────────────────────────────────
function SplitCleanAd({ data, sizeKey }) {
  const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
  const photo = ind.photos[0];
  const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
  const fScale = isXL ? 1.7 : isL ? 1.35 : isM ? 0.95 : 0.7;
  const isVertical = isXL;

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", display: "flex", flexDirection: isVertical ? "column" : "row", background: "#fff", fontFamily: "sans-serif", position: "relative" }}>
      {data.starburst && !isS && (
        <div style={{ position: "absolute", top: 6 * fScale, right: 6 * fScale, zIndex: 10 }}>
          <Starburst text={data.starburst} color={ind.colors.primary} size={(isXL ? 70 : 56) * fScale} />
        </div>
      )}

      {/* Photo */}
      <div style={{ width: isVertical ? "100%" : isS ? "35%" : "44%", height: isVertical ? "42%" : "100%", position: "relative", flexShrink: 0, overflow: "hidden", background: ind.colors.dark }}>
        <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={e => { e.target.style.display = "none"; }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, transparent 60%, ${ind.colors.primary}33 100%)` }} />
        {!isS && (
          <div style={{ position: "absolute", top: 8 * fScale, left: 8 * fScale }}>
            <LogoBadge emoji={ind.emoji} size={42 * fScale} bg={ind.colors.primary} color="#fff" border="3px solid #fff" />
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: `${(isS ? 6 : 11) * fScale}px ${(isS ? 7 : 13) * fScale}px`, display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0, background: ind.colors.light, position: "relative" }}>
        <div>
          {isS && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
              <LogoBadge emoji={ind.emoji} size={22 * fScale} bg={ind.colors.primary} color="#fff" />
              <div style={{ color: ind.colors.accent, fontSize: 7 * fScale, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>{data.industry}</div>
            </div>
          )}
          {!isS && (
            <div style={{ color: ind.colors.accent, fontSize: 9 * fScale, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 3 }}>{data.industry}</div>
          )}
          <div style={{ color: ind.colors.dark, fontWeight: 900, fontSize: (isS ? 12 : 21) * fScale, fontFamily: "Georgia, serif", lineHeight: 1.0, marginBottom: 3 * fScale }}>{data.businessName}</div>
          {!isS && (
            <div style={{ fontSize: 12 * fScale, color: ind.colors.primary, fontWeight: 700, fontStyle: "italic", lineHeight: 1.2 }}>{data.tagline}</div>
          )}
        </div>

        {(isXL || isL) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 * fScale, margin: `${5 * fScale}px 0` }}>
            {(data.menuItems || []).slice(0, 3).map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 7, alignItems: "center" }}>
                <div style={{ width: 16 * fScale, height: 16 * fScale, borderRadius: "50%", background: ind.colors.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ color: "#fff", fontSize: 9 * fScale, fontWeight: 900 }}>✓</span>
                </div>
                <span style={{ fontSize: 10.5 * fScale, color: "#222", fontWeight: 500 }}>{item}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: data.offer ? 5 * fScale : 0 }}>
            {data.address && <div style={{ fontSize: (isS ? 8 : 9) * fScale, color: "#555" }}>📍 {data.address.split(",")[0]}</div>}
            {data.phone && <div style={{ fontSize: (isS ? 11 : 15) * fScale, color: ind.colors.primary, fontWeight: 900, letterSpacing: 0.3 }}>📞 {data.phone}</div>}
          </div>
          <Coupon offer={data.offer} fine={isS ? null : data.offerFine} accent={ind.colors.primary} scale={fScale} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 3: MAGAZINE
// ─────────────────────────────────────────────────────────────────────────────
function MagazineAd({ data, sizeKey }) {
  const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
  const photos = ind.photos.slice(0, 2);
  const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
  const fScale = isXL ? 1.7 : isL ? 1.35 : isM ? 0.95 : 0.7;

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", display: "flex", flexDirection: "column", background: "#fff", fontFamily: "Georgia, serif", border: `${3 * fScale}px solid ${ind.colors.primary}`, boxSizing: "border-box", position: "relative" }}>
      {/* Gradient header */}
      <div style={{ background: `linear-gradient(135deg, ${ind.colors.primary}, ${ind.colors.dark})`, padding: `${7 * fScale}px ${10 * fScale}px`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 * fScale }}>
          <LogoBadge emoji={ind.emoji} size={36 * fScale} bg={ind.colors.accent} color="#fff" border="2px solid rgba(255,255,255,0.4)" />
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 17 * fScale, fontFamily: "Georgia, serif", lineHeight: 1.0, textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>{data.businessName}</div>
        </div>
        {!isS && data.phone && (
          <div style={{ color: "#fff", fontSize: 13 * fScale, fontWeight: 900, background: "rgba(0,0,0,0.4)", padding: `${4 * fScale}px ${10 * fScale}px`, borderRadius: 5, fontFamily: "sans-serif", letterSpacing: 0.3, border: "1px solid rgba(255,255,255,0.3)" }}>{data.phone}</div>
        )}
      </div>

      {/* Photo strip — always shown; S gets 1 photo, others get 2 */}
      <div style={{ display: "flex", gap: 1, height: isXL ? "30%" : isL ? "34%" : isM ? "36%" : "32%", flexShrink: 0 }}>
        {(isS ? photos.slice(0, 1) : photos).map((src, i) => (
          <div key={i} style={{ flex: 1, overflow: "hidden", background: ind.colors.dark, position: "relative" }}>
            <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              onError={e => { e.target.style.display = "none"; }} />
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: `${5 * fScale}px ${10 * fScale}px`, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 0 }}>
        <div>
          <div style={{ color: ind.colors.accent, fontSize: 8.5 * fScale, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{data.industry}</div>
          <div style={{ color: ind.colors.dark, fontSize: (isS ? 12 : 16) * fScale, fontWeight: 900, fontFamily: "Georgia, serif", lineHeight: 1.1, marginTop: 2 }}>{data.tagline}</div>
        </div>

        {!isS && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: `${3 * fScale}px ${10 * fScale}px`, margin: `${4 * fScale}px 0` }}>
            {(data.menuItems || []).slice(0, 4).map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: ind.colors.primary, fontSize: 8 * fScale }}>★</span>
                <span style={{ fontSize: 10 * fScale, color: "#222", fontFamily: "sans-serif", fontWeight: 500 }}>{item}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 3 * fScale }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {data.address && <div style={{ fontSize: (isS ? 8 : 9) * fScale, color: "#555", fontFamily: "sans-serif" }}>📍 {data.address.split(",")[0]}</div>}
            {isS && data.phone && <div style={{ fontSize: 11 * fScale, color: ind.colors.primary, fontWeight: 900, fontFamily: "sans-serif" }}>📞 {data.phone}</div>}
          </div>
          <Coupon offer={data.offer} fine={isS ? null : data.offerFine} accent={ind.colors.primary} scale={fScale} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 4: STAMP
// ─────────────────────────────────────────────────────────────────────────────
function StampAd({ data, sizeKey }) {
  const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
  const photo = ind.photos[0];
  const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
  const fScale = isXL ? 1.7 : isL ? 1.35 : isM ? 0.95 : 0.7;

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative", background: ind.colors.dark, fontFamily: "sans-serif" }}>
      <div style={{ position: "absolute", inset: 0, clipPath: "polygon(0 0, 100% 0, 100% 50%, 0 68%)", overflow: "hidden" }}>
        <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={e => { e.target.style.display = "none"; }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${ind.colors.dark}30 0%, ${ind.colors.dark}cc 100%)` }} />
      </div>

      {/* Starburst top-left */}
      {data.starburst && !isS && (
        <div style={{ position: "absolute", top: 6 * fScale, left: 6 * fScale, zIndex: 5 }}>
          <Starburst text={data.starburst} color={ind.colors.accent} size={(isXL ? 70 : 58) * fScale} />
        </div>
      )}

      {/* Logo top-right */}
      <div style={{ position: "absolute", top: 8 * fScale, right: 10 * fScale, zIndex: 3 }}>
        <LogoBadge emoji={ind.emoji} size={42 * fScale} bg="rgba(255,255,255,0.18)" color="#fff" border="2.5px solid rgba(255,255,255,0.6)" />
      </div>

      {/* Center: name + phone */}
      <div style={{ position: "absolute", top: "28%", left: 0, right: 0, padding: `0 ${12 * fScale}px`, textAlign: "center", zIndex: 3 }}>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: (isS ? 13 : 17) * fScale, fontFamily: "Georgia, serif", textShadow: "0 2px 10px rgba(0,0,0,0.9)", lineHeight: 1.0 }}>
          {data.businessName}
        </div>
        {data.phone && !isS && (
          <div style={{ color: ind.colors.accent, fontWeight: 900, fontSize: (isXL ? 32 : isL ? 26 : 21) * fScale, lineHeight: 1.05, marginTop: 5 * fScale, letterSpacing: -0.5, textShadow: "0 2px 14px rgba(0,0,0,0.95)" }}>
            {data.phone}
          </div>
        )}
        {!isS && (
          <div style={{ color: "rgba(255,255,255,0.95)", fontSize: 11 * fScale, marginTop: 4 * fScale, fontStyle: "italic", textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>
            {data.tagline}
          </div>
        )}
      </div>

      {/* Bottom */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: `${6 * fScale}px ${10 * fScale}px ${8 * fScale}px`, display: "flex", flexDirection: "column", gap: 4 * fScale, zIndex: 3 }}>
        {(isXL || isL) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: `${3 * fScale}px ${10 * fScale}px`, justifyContent: "center" }}>
            {(data.menuItems || []).slice(0, 3).map((item, i) => (
              <div key={i} style={{ color: "#fff", fontSize: 9.5 * fScale, fontWeight: 600, textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}>
                ✓ {item}
              </div>
            ))}
          </div>
        )}
        {data.offer && (
          <div style={{ background: `linear-gradient(90deg, ${ind.colors.accent}, ${ind.colors.accent}ee)`, padding: `${5 * fScale}px ${9 * fScale}px`, borderRadius: 4, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
            <div style={{ color: ind.colors.dark, fontWeight: 900, fontSize: 14 * fScale }}>{data.offer}</div>
            {data.offerFine && !isS && <div style={{ color: ind.colors.dark, fontSize: 8 * fScale, opacity: 0.85 }}>{data.offerFine}</div>}
          </div>
        )}
        <div style={{ color: "rgba(255,255,255,0.95)", fontSize: (isS ? 8.5 : 9.5) * fScale, textAlign: "center", fontFamily: "sans-serif", display: "flex", justifyContent: "center", gap: 10 * fScale, textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}>
          {data.address && <span>📍 {data.address.split(",")[0]}</span>}
          {isS && data.phone && <span style={{ fontWeight: 900, color: ind.colors.accent }}>📞 {data.phone}</span>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE REGISTRY + EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
const TEMPLATE_RENDERERS = {
  "photo-bold":  PhotoBoldAd,
  "split-clean": SplitCleanAd,
  "magazine":    MagazineAd,
  "stamp":       StampAd,
};

export function getSampleAd(configKey, sizeKeyOverride) {
  const config = SAMPLE_AD_CONFIGS[configKey];
  if (!config) return null;
  const sizeKey = sizeKeyOverride || config.sizeKey;
  const Renderer = TEMPLATE_RENDERERS[config.template];
  if (!Renderer) return null;
  return <Renderer data={config.data} sizeKey={sizeKey} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// SPOT_SAMPLE_MAP — INTENTIONALLY SPARSE
//
// Keys are actual gridArea values from the postcard grid.
// Spots NOT listed here render as green AvailableSpot (purchase prompt).
//
// Filled  (sample ad): mb (XL), dn (L), ins (M), a1 (S)     — 4 spots
// Available (green +): re (L), hv (M), pz (S), lw (S), a2 (S) — 5 spots
//
// Front available count: 1 L + 1 M + 3 S = 5 purchasable spots visible
// ─────────────────────────────────────────────────────────────────────────────
export const SPOT_SAMPLE_MAP = {
  "mb":  "mrbiscuits",
  "dn":  "dental",
  "ins": "insurance",
  "pz":  "pizza",
  "lw":  "lawn",
  "a1":  "salon",
  "a3":  "vet",
};
