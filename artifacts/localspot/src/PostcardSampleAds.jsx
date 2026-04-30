import { INDUSTRIES } from "./industryAssets";

// ─── Helper: Logo Badge ───────────────────────────────────────────────────────
function LogoBadge({ logo, name, emoji, size = 40, bg = "rgba(255,255,255,0.15)", color = "#fff", border }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: bg,
      border: border || `2px solid ${color}55`,
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", flexShrink: 0,
    }}>
      {logo
        ? <img src={logo} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: size * 0.5 }}>{emoji}</span>
      }
    </div>
  );
}

// ─── Helper: Coupon ───────────────────────────────────────────────────────────
function Coupon({ offer, fine, accent, scale = 1, dark = false }) {
  if (!offer) return null;
  return (
    <div style={{
      border: `${1.5 * scale}px dashed ${accent}`,
      background: dark ? "rgba(0,0,0,0.3)" : `${accent}15`,
      borderRadius: 4 * scale,
      padding: `${5 * scale}px ${10 * scale}px ${4 * scale}px`,
      textAlign: "center", position: "relative", flexShrink: 0,
    }}>
      <div style={{ position: "absolute", top: -1, left: 0, right: 0, display: "flex", alignItems: "center", padding: `0 ${4 * scale}px` }}>
        <span style={{ fontSize: 9 * scale, lineHeight: 1, flexShrink: 0, opacity: 0.75 }}>✂</span>
        <div style={{ flex: 1, marginLeft: 3 * scale, borderTop: `${1.2 * scale}px dashed ${accent}88` }} />
        <span style={{ fontSize: 9 * scale, lineHeight: 1, flexShrink: 0, opacity: 0.75, transform: "scaleX(-1)", display: "inline-block" }}>✂</span>
      </div>
      <div style={{ color: accent, fontWeight: 900, fontSize: 12 * scale, lineHeight: 1, letterSpacing: 0.3, marginTop: 3 * scale }}>{offer}</div>
      {fine && <div style={{ color: dark ? "rgba(255,255,255,0.7)" : "#666", fontSize: 6.5 * scale, marginTop: 2, fontFamily: "sans-serif" }}>{fine}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE AD DATA CONFIGS
// ─────────────────────────────────────────────────────────────────────────────
export const SAMPLE_AD_CONFIGS = {
  "mrbiscuits": {
    template: "photo-bold",
    sizeKey: "XL",
    data: {
      businessName: "Mr. Biscuit's Café",
      industry: "Breakfast & Cafe",
      tagline: "From-Scratch Biscuits & Fresh Boba!",
      offer: "$1 OFF Any Biscuit",
      offerFine: "1 per visit · with this postcard",
      phone: "(706) 754-0105",
      address: "596 W Louise St Ste D, Clarkesville, GA",
      menuItems: ["Plain Biscuit $2.99", "Bacon Biscuit $4.99", "Chicken Tender $5.99", "NY Bagels $5.49"],
    },
  },
  "dental": {
    template: "split-clean",
    sizeKey: "L",
    data: {
      businessName: "Clarkesville Family Dental",
      industry: "Dentist",
      tagline: "Accepting New Patients!",
      offer: "FREE Whitening Kit",
      offerFine: "w/ exam & cleaning · show this ad",
      phone: "(706) 555-0142",
      address: "142 Commerce St, Clarkesville, GA",
      menuItems: ["Preventive Care & Cleanings", "Cosmetic & Whitening Treatments", "Family & Children's Dentistry"],
    },
  },
  "realty": {
    template: "magazine",
    sizeKey: "L",
    data: {
      businessName: "Mountain View Realty",
      industry: "Real Estate",
      tagline: "Buying or Selling in NE Georgia?",
      offer: "Free Home Valuation",
      offerFine: "No obligation · call today",
      phone: "(706) 555-0177",
      address: "Clarkesville, GA",
      menuItems: ["Buyer Representation", "Listing Services", "Investment Properties", "Free Consultation"],
    },
  },
  "hvac": {
    template: "stamp",
    sizeKey: "M",
    data: {
      businessName: "Blue Ridge HVAC",
      industry: "HVAC",
      tagline: "24/7 Emergency Service",
      offer: "$59 A/C Tune-Up",
      offerFine: "Expires 6/30 · mention this ad",
      phone: "(706) 555-0433",
      address: "Clarkesville, GA",
      menuItems: ["A/C Repair & Install", "Heating Systems", "Emergency Service 24/7", "Free Estimates"],
    },
  },
  "insurance": {
    template: "magazine",
    sizeKey: "M",
    data: {
      businessName: "Tanner Insurance Agency",
      industry: "Insurance",
      tagline: "Local Agent. Real Savings.",
      offer: "Save up to $500/yr",
      offerFine: "Free quote · no obligation",
      phone: "(706) 555-0388",
      address: "55 Green St, Clarkesville, GA",
      menuItems: ["Auto Insurance", "Home & Property", "Life Coverage", "Business Policies"],
    },
  },
  "pizza": {
    template: "photo-bold",
    sizeKey: "S",
    data: {
      businessName: "Roma's Pizza & Subs",
      industry: "Pizza Restaurant",
      tagline: "Hand-Tossed. Oven Fresh. Delivered Hot.",
      offer: "BOGO Medium Pizza",
      offerFine: "Tues & Wed only · show ad",
      phone: "(706) 555-0712",
      address: "182 Main St, Clarkesville, GA",
      menuItems: ["Large Pizza $14.99", "Family Special $24.99", "Wings & Pizza Combo", "Free Delivery"],
    },
  },
  "lawn": {
    template: "stamp",
    sizeKey: "S",
    data: {
      businessName: "Green Acres Lawn Care",
      industry: "Lawn & Landscaping",
      tagline: "Your Yard. Our Pride.",
      offer: "$25 OFF First Service",
      offerFine: "New customers only · expires 6/30",
      phone: "(706) 555-0291",
      address: "Clarkesville, GA",
      menuItems: ["Weekly Mowing", "Spring Cleanup", "Mulch Installation", "Free Estimates"],
    },
  },
  "salon": {
    template: "photo-bold",
    sizeKey: "S",
    data: {
      businessName: "The Cut Above Salon",
      industry: "Salon & Beauty",
      tagline: "Look Beautiful. Feel Confident.",
      offer: "20% OFF First Visit",
      offerFine: "New clients · show this ad",
      phone: "(706) 555-0519",
      address: "Clarkesville, GA",
      menuItems: ["Cut & Color", "Wedding Hair", "Bridal Packages", "Walk-Ins Welcome"],
    },
  },
  "coffee": {
    template: "photo-bold",
    sizeKey: "S",
    data: {
      businessName: "Summit Coffee Co.",
      industry: "Coffee Shop",
      tagline: "Locally Roasted. Locally Loved.",
      offer: "Buy 1 Get 1 Free",
      offerFine: "Any specialty drink · show this ad",
      phone: "(706) 555-0844",
      address: "Clarkesville, GA",
      menuItems: ["Specialty Lattes", "Cold Brew on Tap", "Pastries Daily", "Free WiFi"],
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE COMPONENTS — read-only versions (no inline editing)
// ─────────────────────────────────────────────────────────────────────────────

function PhotoBoldAd({ data, sizeKey }) {
  const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
  const photo = ind.photos[0];
  const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
  const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.55;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", fontFamily: "Georgia, serif" }}>
      <img src={photo} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${ind.colors.dark}bb 0%, ${ind.colors.dark}44 28%, ${ind.colors.dark}11 52%, ${ind.colors.dark}99 76%, ${ind.colors.dark}f2 100%)` }} />

      <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: `${8 * fScale}px ${10 * fScale}px`, display: "flex", alignItems: "center", gap: 7 * fScale }}>
        <LogoBadge emoji={ind.emoji} size={32 * fScale} bg={`${ind.colors.primary}cc`} color="#fff" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 22 * fScale, lineHeight: 1.0, textShadow: "0 2px 10px rgba(0,0,0,0.9)" }}>{data.businessName}</div>
          {!isS && <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 8 * fScale, marginTop: 1, fontFamily: "sans-serif", letterSpacing: 1, textTransform: "uppercase" }}>{data.industry}</div>}
        </div>
      </div>

      {!isS && (
        <div style={{ position: "absolute", top: "44%", left: 12 * fScale, right: 12 * fScale, textAlign: "center" }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: (isXL ? 20 : isL ? 16 : 12) * fScale, lineHeight: 1.15, fontStyle: "italic", textShadow: "0 2px 14px rgba(0,0,0,0.9)" }}>"{data.tagline}"</div>
        </div>
      )}

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: `${5 * fScale}px ${10 * fScale}px ${4 * fScale}px`, display: "flex", flexDirection: "column", gap: 3 * fScale }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "rgba(255,255,255,0.9)", fontSize: 7.5 * fScale, fontFamily: "sans-serif" }}>
          {data.address && <div>📍 {isS ? data.address.split(",")[0] : data.address}</div>}
          {data.phone && <div style={{ fontWeight: 800 }}>📞 {data.phone}</div>}
        </div>
        {data.offer && <Coupon offer={data.offer} fine={data.offerFine} accent="#fff" scale={fScale * 0.82} dark={true} />}
      </div>
    </div>
  );
}

function SplitCleanAd({ data, sizeKey }) {
  const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
  const photo = ind.photos[0];
  const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
  const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.55;
  const isVertical = isXL;

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", display: "flex", flexDirection: isVertical ? "column" : "row", background: ind.colors.light, fontFamily: "sans-serif" }}>
      <div style={{ width: isVertical ? "100%" : "50%", height: isVertical ? "48%" : "100%", position: "relative", flexShrink: 0 }}>
        <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <div style={{ position: "absolute", top: 8 * fScale, left: 8 * fScale }}>
          <LogoBadge emoji={ind.emoji} size={36 * fScale} bg={ind.colors.primary} color="#fff" border="2px solid #fff" />
        </div>
      </div>

      <div style={{ flex: 1, padding: `${8 * fScale}px ${10 * fScale}px`, display: "flex", flexDirection: "column", justifyContent: "space-between", background: ind.colors.light, minWidth: 0 }}>
        <div>
          <div style={{ color: ind.colors.accent, fontSize: 8 * fScale, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>{data.industry}</div>
          <div style={{ color: ind.colors.dark, fontWeight: 900, fontSize: 21 * fScale, fontFamily: "Georgia, serif", lineHeight: 1.0 }}>{data.businessName}</div>
          {!isS && <div style={{ fontSize: 10 * fScale, color: ind.colors.primary, fontWeight: 700, marginTop: 4, fontStyle: "italic" }}>{data.tagline}</div>}
        </div>

        {!isS && !isM && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 * fScale, margin: `${4 * fScale}px 0` }}>
            {(data.menuItems || []).slice(0, isXL ? 2 : 3).map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ width: 13 * fScale, height: 13 * fScale, borderRadius: "50%", background: ind.colors.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ color: "#fff", fontSize: 7 * fScale, fontWeight: 900 }}>✓</span>
                </div>
                <span style={{ fontSize: 8.5 * fScale, color: "#333" }}>{item}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: data.offer ? 5 * fScale : 0 }}>
            {data.address && <div style={{ fontSize: 7 * fScale, color: "#555" }}>📍 {data.address.split(",")[0]}</div>}
            {data.phone && <div style={{ fontSize: 10 * fScale, color: ind.colors.primary, fontWeight: 800 }}>📞 {data.phone}</div>}
          </div>
          <Coupon offer={data.offer} fine={data.offerFine} accent={ind.colors.primary} scale={fScale} />
        </div>
      </div>
    </div>
  );
}

function MagazineAd({ data, sizeKey }) {
  const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
  const photos = ind.photos.slice(0, 2);
  const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
  const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.55;

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", display: "flex", flexDirection: "column", background: "#fff", fontFamily: "Georgia, serif", border: `${3 * fScale}px solid ${ind.colors.primary}`, boxSizing: "border-box" }}>
      <div style={{ background: ind.colors.primary, padding: `${5 * fScale}px ${10 * fScale}px`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 * fScale }}>
          <LogoBadge emoji={ind.emoji} size={30 * fScale} bg={ind.colors.accent} color="#fff" />
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 18 * fScale, fontFamily: "Georgia, serif", lineHeight: 1.0 }}>{data.businessName}</div>
        </div>
        {!isS && data.phone && (
          <div style={{ color: "#fff", fontSize: 10 * fScale, fontWeight: 800, background: "rgba(0,0,0,0.25)", padding: `${2 * fScale}px ${7 * fScale}px`, borderRadius: 3, fontFamily: "sans-serif", flexShrink: 0 }}>{data.phone}</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 1, height: isXL ? "32%" : isL ? "38%" : isM ? "34%" : "28%", flexShrink: 0 }}>
        {photos.map((src, i) => (
          <div key={i} style={{ flex: 1, overflow: "hidden", background: ind.colors.dark }}>
            <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={e => { e.target.style.display = "none"; }} />
          </div>
        ))}
      </div>

      <div style={{ flex: 1, padding: `${4 * fScale}px ${10 * fScale}px ${5 * fScale}px`, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 0 }}>
        <div>
          <div style={{ color: ind.colors.accent, fontSize: 7.5 * fScale, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{data.industry}</div>
          <div style={{ color: ind.colors.dark, fontSize: 16 * fScale, fontWeight: 900, fontFamily: "Georgia, serif", lineHeight: 1.1, marginTop: 2 }}>{data.tagline}</div>
        </div>

        {!isS && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: `2px ${10 * fScale}px`, margin: `${3 * fScale}px 0` }}>
            {(data.menuItems || []).slice(0, 4).map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ color: ind.colors.primary, fontSize: 6 }}>●</span>
                <span style={{ fontSize: 8 * fScale, color: "#444", fontFamily: "sans-serif" }}>{item}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 3 * fScale }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
            {data.address && <div style={{ fontSize: 7 * fScale, color: "#666", fontFamily: "sans-serif", flex: 1 }}>📍 {data.address.split(",")[0]}</div>}
            {!isS && data.phone && <div style={{ fontSize: 8 * fScale, color: ind.colors.primary, fontWeight: 800, fontFamily: "sans-serif" }}>📞 {data.phone}</div>}
          </div>
          <Coupon offer={data.offer} fine={data.offerFine} accent={ind.colors.primary} scale={fScale} />
        </div>
      </div>
    </div>
  );
}

function StampAd({ data, sizeKey }) {
  const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
  const photo = ind.photos[0];
  const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
  const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.55;

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative", background: ind.colors.dark, fontFamily: "sans-serif" }}>
      <div style={{ position: "absolute", inset: 0, clipPath: "polygon(0 0, 100% 0, 100% 65%, 0 85%)", overflow: "hidden" }}>
        <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${ind.colors.dark}33 0%, ${ind.colors.dark}88 100%)` }} />
      </div>

      <div style={{ position: "absolute", top: 7 * fScale, left: 9 * fScale, zIndex: 3 }}>
        <div style={{ background: ind.colors.accent, color: ind.colors.dark, padding: `${3 * fScale}px ${7 * fScale}px`, fontSize: 8 * fScale, fontWeight: 900, letterSpacing: 1.5, borderRadius: 3 }}>
          {(data.menuItems?.[0] || ind.menu[0] || "FEATURED").toUpperCase()}
        </div>
      </div>

      <div style={{ position: "absolute", top: 7 * fScale, right: 9 * fScale, zIndex: 3 }}>
        <LogoBadge emoji={ind.emoji} size={34 * fScale} bg="rgba(255,255,255,0.18)" color="#fff" border="2px solid rgba(255,255,255,0.6)" />
      </div>

      <div style={{ position: "absolute", top: isS ? "48%" : "38%", left: 0, right: 0, padding: `0 ${10 * fScale}px`, textAlign: "center", zIndex: 3 }}>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: 19 * fScale, fontFamily: "Georgia, serif", textShadow: "0 2px 10px rgba(0,0,0,0.85)", lineHeight: 1.05 }}>{data.businessName}</div>
        {!isS && data.phone && (
          <div style={{ color: ind.colors.accent, fontWeight: 900, fontSize: (isXL ? 26 : isL ? 22 : 17) * fScale, lineHeight: 1, marginTop: 3, letterSpacing: -0.5, textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>{data.phone}</div>
        )}
        {!isS && <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 9 * fScale, marginTop: 3, fontStyle: "italic" }}>{data.tagline}</div>}
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: `${8 * fScale}px ${10 * fScale}px`, display: "flex", flexDirection: "column", gap: 4 * fScale, zIndex: 3 }}>
        {!isS && !isM && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: `2px ${8 * fScale}px`, justifyContent: "center" }}>
            {(data.menuItems || []).slice(0, 3).map((item, i) => (
              <div key={i} style={{ color: "rgba(255,255,255,0.85)", fontSize: 8 * fScale }}>✓ {item}</div>
            ))}
          </div>
        )}
        {data.offer && (
          <div style={{ background: `linear-gradient(90deg, ${ind.colors.accent}, ${ind.colors.accent}dd)`, padding: `${4 * fScale}px ${8 * fScale}px`, borderRadius: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: ind.colors.dark, fontWeight: 900, fontSize: 12 * fScale }}>{data.offer}</div>
            {data.offerFine && !isS && <div style={{ color: ind.colors.dark, fontSize: 7 * fScale, opacity: 0.8 }}>{data.offerFine}</div>}
          </div>
        )}
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 7 * fScale, textAlign: "center", fontFamily: "sans-serif" }}>
          📍 {data.address?.split(",")[0]}
          {isS && data.phone && <span style={{ marginLeft: 8, fontWeight: 700 }}>📞 {data.phone}</span>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE REGISTRY
// ─────────────────────────────────────────────────────────────────────────────
const TEMPLATE_RENDERERS = {
  "photo-bold":  PhotoBoldAd,
  "split-clean": SplitCleanAd,
  "magazine":    MagazineAd,
  "stamp":       StampAd,
};

// ─────────────────────────────────────────────────────────────────────────────
// getSampleAd(configKey, sizeKeyOverride)
// Returns a rendered React element for the given config + size.
// ─────────────────────────────────────────────────────────────────────────────
export function getSampleAd(configKey, sizeKeyOverride) {
  const config = SAMPLE_AD_CONFIGS[configKey];
  if (!config) return null;
  const sizeKey = sizeKeyOverride || config.sizeKey;
  const Renderer = TEMPLATE_RENDERERS[config.template];
  if (!Renderer) return null;
  return <Renderer data={config.data} sizeKey={sizeKey} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// SPOT_SAMPLE_MAP
// Maps postcard gridArea values to sample ad config keys.
// Keys must match the gridArea field on each spot in the DB.
// ─────────────────────────────────────────────────────────────────────────────
export const SPOT_SAMPLE_MAP = {
  "mb":  "mrbiscuits",
  "dn":  "dental",
  "re":  "realty",
  "hv":  "hvac",
  "ins": "insurance",
  "pz":  "pizza",
  "lw":  "lawn",
  "a1":  "salon",
  "a2":  "coffee",
};
