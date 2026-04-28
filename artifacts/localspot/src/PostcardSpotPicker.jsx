import { useState } from "react";
import { useLocation } from "wouter";
import { useGetActiveCampaign, useReserveSpot } from "@workspace/api-client-react";

// Mr. Biscuit's Cafe real logo (resized from their Facebook page)
const MRB_LOGO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAB4AHgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD17FJS0ViahRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB//2Q==";

const SIZES = {
  large:  { label: "Large",  price: 399, dim: '4.5" × 3"',  desc: "Prime placement, maximum impact" },
  medium: { label: "Medium", price: 299, dim: '3" × 3"',    desc: "Great visibility, popular choice" },
  small:  { label: "Small",  price: 199, dim: '3" × 1.5"',  desc: "Affordable local reach" },
};

const ADS = {
  "Mr. Biscuit's Café": {
    name: "Mr. Biscuit's Café", cat: "Café & Breakfast",
    tagline: "From-Scratch Biscuits & Boba!", sub: "Drive-thru or dine-in daily.",
    addr: "596 W Louise Dr, Ste D · Clarkesville", phone: "(706) 555-0596",
    hours: "Mon–Sat  6am–2pm",
    coupon: "BUY A BISCUIT", couponSub: "Get a FREE Drink! · show this ad",
    bg: "linear-gradient(150deg,#1a0800,#3d1500,#5a2200)", accent: "#c8541a", light: true, icon: null, logo: MRB_LOGO,
  },
  "Clarkesville Family Dental": {
    name: "Clarkesville Family Dental", cat: "General Dentistry",
    tagline: "Accepting New Patients!", sub: "Gentle care for the whole family.",
    addr: "142 Commerce St, Clarkesville, GA", phone: "(706) 555-0142",
    hours: "Mon–Fri  8am–5pm",
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
    hours: "By Appointment · 7 Days",
    coupon: "Free Home Valuation", couponSub: "No obligation · call or text today",
    bg: "#f5f0e8", accent: "#2d6a4f", light: false, icon: "🏡",
  },
  "Tanner Insurance Agency": {
    name: "Tanner Insurance Agency", cat: "Auto · Home · Life",
    tagline: "Local Agent. Real Savings.", sub: "We shop dozens of carriers for you.",
    addr: "55 S Main St, Cornelia, GA", phone: "(706) 555-0055",
    hours: "Mon–Fri  9am–5pm",
    coupon: "Save up to $500/yr", couponSub: "Free quote · no obligation",
    bg: "#1a1a2e", accent: "#e2b714", light: true, icon: "🛡️",
  },
  "Roma's Pizza & Subs": {
    name: "Roma's Pizza & Subs", cat: "Italian Restaurant",
    tagline: "Hand-Tossed. Oven Fresh.", sub: "Dine-in, carry-out & delivery.",
    addr: "712 Washington St, Clarkesville", phone: "(706) 555-0712",
    hours: "Daily  11am–9pm",
    coupon: "BOGO Medium Pizza", couponSub: "Tues & Wed · dine-in only",
    bg: "#fff8f0", accent: "#c0392b", light: false, icon: "🍕",
  },
  "Green Acres Lawn Care": {
    name: "Green Acres Lawn Care", cat: "Lawn & Landscaping",
    tagline: "Your Yard. Our Pride.", sub: "Mowing, mulching & clean-ups.",
    addr: "Serving All of Habersham County", phone: "(706) 555-0399",
    hours: "Mon–Sat  7am–6pm",
    coupon: "$25 Off First Service", couponSub: "New customers · show this ad",
    bg: "#f0fdf4", accent: "#16a34a", light: false, icon: "🌿",
  },
};

const GRID_AREAS = `"mb  mb  mb  mb  dn  dn  dn  dn  hv  hv  hv  re" "mb  mb  mb  mb  dn  dn  dn  dn  hv  hv  hv  re" "ins ins ins pz  pz  pz  lw  lw  lw  a1  a1  re" "ins ins ins a2  a2  a2  a3  a3  a3  a1  a1  re"`;

const AREA_MAP = { mb: 0, dn: 1, hv: 2, re: 3, ins: 4, pz: 5, lw: 6, a1: 7, a2: 8, a3: 9 };

function PaidAd({ spot, size }) {
  const sm = size === "small", md = size === "medium";
  const d = ADS[spot.businessName];

  if (!d) {
    return (
      <div style={{ width: "100%", height: "100%", background: "#f9fafb", border: "1px solid #e5e7eb", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
        <span style={{ fontSize: 16 }}>📌</span>
        <div style={{ fontSize: 8.5, fontWeight: 700, color: "#374151", fontFamily: "sans-serif", textAlign: "center", padding: "0 4px" }}>{spot.businessName}</div>
        <div style={{ fontSize: 7, color: "#9ca3af", fontFamily: "sans-serif" }}>Reserved</div>
      </div>
    );
  }

  const tc = d.light ? "#fff" : "#111";
  const tc2 = d.light ? "rgba(255,255,255,0.75)" : "#444";

  return (
    <div style={{ width: "100%", height: "100%", background: d.bg, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: d.logo ? "Georgia,serif" : "sans-serif" }}>
      <div style={{ background: d.accent, padding: sm ? "3px 6px" : "5px 10px", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
        {d.logo ? (
          <img src={d.logo} alt={d.name} style={{ width: sm ? 22 : md ? 32 : 42, height: sm ? 22 : md ? 32 : 42, borderRadius: "50%", border: "1.5px solid #ffd49e", objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <span style={{ fontSize: sm ? 13 : md ? 16 : 20 }}>{d.icon}</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: sm ? 7.5 : md ? 9 : 11.5, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
          {!sm && <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 7 }}>{d.cat}</div>}
        </div>
      </div>
      <div style={{ flex: 1, padding: sm ? "3px 6px" : "5px 10px", display: "flex", flexDirection: sm ? "row" : "column", gap: sm ? 5 : 4, alignItems: sm ? "center" : "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: tc, fontWeight: 700, fontSize: sm ? 7 : md ? 9 : 11, lineHeight: 1.25 }}>{d.tagline}</div>
          {!sm && <div style={{ color: tc2, fontSize: md ? 8 : 9, marginTop: 2 }}>{d.sub}</div>}
          {!sm && <div style={{ color: tc2, fontSize: 7.5, marginTop: 3 }}>⏰ {d.hours}</div>}
        </div>
        <div style={{ background: d.accent + "22", border: `1.5px dashed ${d.accent}`, borderRadius: 4, padding: sm ? "3px 5px" : "4px 8px", textAlign: "center", flexShrink: 0 }}>
          <div style={{ color: d.accent, fontWeight: 800, fontSize: sm ? 7 : md ? 8.5 : 10, lineHeight: 1.2 }}>{d.coupon}</div>
          {!sm && <div style={{ color: d.light ? tc2 : "#555", fontSize: 6.5, marginTop: 1 }}>{d.couponSub}</div>}
        </div>
      </div>
      <div style={{ background: "rgba(0,0,0,0.07)", padding: sm ? "2px 6px" : "3px 10px", display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ color: tc2, fontSize: sm ? 5.5 : 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {sm ? d.addr.split(",")[0] : d.addr}</div>
        <div style={{ color: d.accent, fontSize: sm ? 6 : 7, fontWeight: 700, flexShrink: 0, marginLeft: 4 }}>📞 {d.phone}</div>
      </div>
    </div>
  );
}

function AvailableSpot({ spot, isSelected, onClick }) {
  const sz = SIZES[spot.size];
  return (
    <div onClick={onClick} style={{
      width: "100%", height: "100%", borderRadius: 3, cursor: "pointer",
      background: isSelected ? "#fef9c3" : "#f0fdf4",
      border: isSelected ? "2.5px solid #ca8a04" : "2px dashed #22c55e",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 2, padding: 4, textAlign: "center", transition: "all 0.15s", boxSizing: "border-box",
    }}>
      <div style={{ fontSize: spot.size === "small" ? 16 : 22 }}>{isSelected ? "✅" : "➕"}</div>
      <div style={{ fontWeight: 800, fontSize: spot.size === "small" ? 7.5 : 9.5, color: isSelected ? "#92400e" : "#15803d", fontFamily: "sans-serif" }}>
        {isSelected ? "SELECTED" : sz.label + " Spot"}
      </div>
      <div style={{ fontSize: spot.size === "small" ? 7 : 9, color: isSelected ? "#b45309" : "#166534", fontWeight: 700, fontFamily: "sans-serif" }}>${sz.price}</div>
      {spot.size !== "small" && <div style={{ fontSize: 6.5, color: "#6b7280", fontFamily: "sans-serif" }}>{sz.dim}</div>}
    </div>
  );
}

function Modal({ spot, onClose, onSubmit, isLoading, error }) {
  const sz = SIZES[spot.size];
  const [f, setF] = useState({ biz: "", cat: "", email: "", phone: "" });
  const ok = f.biz.trim() && f.cat.trim() && f.email.includes("@");
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: 28, maxWidth: 430, width: "100%", boxShadow: "0 30px 80px rgba(0,0,0,0.35)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10, color: "#9ca3af", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>{sz.label} Ad · {sz.dim}</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#111", fontFamily: "Georgia,serif", lineHeight: 1 }}>${sz.price}</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Reaches 5,000 Clarkesville-area homes</div>
          </div>
          <button onClick={onClose} style={{ background: "#f3f4f6", border: "none", borderRadius: "50%", width: 34, height: 34, cursor: "pointer", fontSize: 18, color: "#374151" }}>×</button>
        </div>

        <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 16px", marginBottom: 18, lineHeight: 2, fontSize: 12.5, color: "#374151" }}>
          ✅ &nbsp;One business per category — zero competition<br />
          ✅ &nbsp;Professional ad design included<br />
          ✅ &nbsp;Printed &amp; mailed via USPS EDDM<br />
          ✅ &nbsp;Under 10¢ per home reached
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 14, color: "#991b1b", fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          {[["biz", "Business Name *"], ["cat", "Business Category (e.g. Pizza Restaurant) *"], ["email", "Email Address *"], ["phone", "Phone Number"]].map(([k, ph]) => (
            <input key={k} placeholder={ph} value={f[k]} onChange={set(k)}
              style={{ padding: "10px 13px", borderRadius: 9, border: "1.5px solid #d1d5db", fontSize: 13.5, outline: "none", fontFamily: "sans-serif" }} />
          ))}
        </div>

        <button disabled={!ok || isLoading} onClick={() => onSubmit(f)} style={{
          width: "100%", padding: 14, borderRadius: 11, border: "none",
          background: ok && !isLoading ? "#991b1b" : "#d1d5db",
          color: "#fff", fontSize: 15, fontWeight: 800, cursor: ok && !isLoading ? "pointer" : "not-allowed", fontFamily: "sans-serif",
        }}>
          {isLoading ? "Reserving..." : `Reserve This Spot — $${sz.price}`}
        </button>
        <p style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", margin: "10px 0 0" }}>No charge now. You'll pay on the next screen.</p>
      </div>
    </div>
  );
}

export default function PostcardSpotPicker() {
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [reserveError, setReserveError] = useState(null);

  const { data: campaign, isLoading, refetch } = useGetActiveCampaign();
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
      setModal(null);
      setSelected(null);
      navigate(`/checkout/${result.id}`);
    } catch (err) {
      const msg = err?.data?.error || err?.message || "Something went wrong. Please try again.";
      setReserveError(msg);
    }
  };

  const renderCell = (spot) => {
    if (spot.status === "paid" || spot.status === "reserved") {
      if (spot.businessName && ADS[spot.businessName]) {
        return <PaidAd spot={spot} size={spot.size} />;
      }
      return (
        <div style={{ width: "100%", height: "100%", background: "#f9fafb", border: "1px solid #e5e7eb", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
          <span style={{ fontSize: 16 }}>📌</span>
          <div style={{ fontSize: 8.5, fontWeight: 700, color: "#374151", fontFamily: "sans-serif", textAlign: "center", padding: "0 4px" }}>{spot.businessName || "Reserved"}</div>
          <div style={{ fontSize: 7, color: "#9ca3af", fontFamily: "sans-serif" }}>Spot Taken</div>
        </div>
      );
    }

    if (spot.status === "available") {
      return (
        <AvailableSpot
          spot={spot}
          isSelected={selected?.id === spot.id}
          onClick={() => { setSelected(spot); setModal(spot); setReserveError(null); }}
        />
      );
    }

    return null;
  };

  const sortedSpots = [...spots].sort((a, b) => {
    const order = ["mb", "dn", "hv", "re", "ins", "pz", "lw", "a1", "a2", "a3"];
    return (order.indexOf(a.gridArea) || 0) - (order.indexOf(b.gridArea) || 0);
  });

  return (
    <div style={{ minHeight: "100vh", background: "#dde3ea", fontFamily: "sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18, color: "#111", fontFamily: "Georgia,serif" }}>📮 LocalSpot Mailer</div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>9×12 Co-op Postcard · Clarkesville, GA</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {["How It Works", "Pricing", "FAQ"].map(l => (
            <button key={l} style={{ background: "none", border: "none", color: "#374151", fontSize: 13, cursor: "pointer", padding: "6px 10px", fontWeight: 500 }}>{l}</button>
          ))}
          <button
            onClick={() => { const a = spots.find(s => s.status === "available"); if (a) { setSelected(a); setModal(a); setReserveError(null); } }}
            style={{ background: "#991b1b", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
            Save Your Spot
          </button>
        </div>
      </div>

      <div style={{ padding: "24px 24px 12px", textAlign: "center" }}>
        <div style={{ fontSize: 10, color: "#991b1b", fontWeight: 800, letterSpacing: 3, textTransform: "uppercase", marginBottom: 7 }}>
          {campaign.mailDate ? `Mailing ${campaign.mailDate}` : "Spring 2025"} · {campaign.territory}
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#111", margin: "0 0 8px", fontFamily: "Georgia,serif", lineHeight: 1.2 }}>
          Reserve Your Spot on the <span style={{ color: "#991b1b" }}>Local 9×12 Postcard</span>
        </h1>
        <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 16px" }}>
          Mailed to <strong>{campaign.homesCount?.toLocaleString()} homes</strong> in the {campaign.territory} area. Click any <span style={{ color: "#16a34a", fontWeight: 700 }}>green spot</span> to claim yours.
        </p>
        <div style={{ display: "inline-flex", background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", overflow: "hidden" }}>
          {[[openSpots.length, "Open Spots", "#22c55e"], [takenSpots.length, "Spots Taken", "#374151"], [campaign.homesCount?.toLocaleString(), "Homes Reached", "#374151"], ["1", "Per Category", "#374151"]].map(([v, l, c], i) => (
            <div key={l} style={{ textAlign: "center", padding: "12px 22px", borderRight: i < 3 ? "1px solid #f3f4f6" : "none" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: c }}>{v}</div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px 20px 48px", maxWidth: 1260, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 10, boxShadow: "0 12px 48px rgba(0,0,0,0.15)", position: "relative" }}>
              <div style={{ position: "absolute", top: -12, left: 18, background: "#111", color: "#fff", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, padding: "3px 14px", borderRadius: 20, textTransform: "uppercase" }}>
                Live Postcard Preview · 9" × 12" Horizontal
              </div>
              <div style={{ background: "linear-gradient(90deg,#7f1d1d,#991b1b)", borderRadius: "6px 6px 0 0", padding: "7px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: "Georgia,serif" }}>📮 Clarkesville Community Mailer</div>
                <div style={{ color: "#fca5a5", fontSize: 9.5 }}>Reaching {campaign.homesCount?.toLocaleString()} Local Homes · Spring 2025</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(12,1fr)", gridTemplateRows: "repeat(4,64px)", gridTemplateAreas: GRID_AREAS, gap: 3 }}>
                {sortedSpots.map(spot => (
                  <div key={spot.id} style={{ gridArea: spot.gridArea, overflow: "hidden", borderRadius: 3 }}>
                    {renderCell(spot)}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 3, padding: "4px 10px", background: "#f8fafc", borderRadius: "0 0 6px 6px", display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontSize: 8, color: "#9ca3af" }}>LOCAL POSTAL CUSTOMER · EDDM</div>
                <div style={{ fontSize: 8, color: "#9ca3af" }}>PRESORTED STD · U.S. POSTAGE PAID · CLARKESVILLE GA {campaign.zipCode}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 20, marginTop: 12, justifyContent: "center" }}>
              {[
                { bg: "#f0fdf4", border: "2px dashed #22c55e", label: "Available — click to reserve" },
                { bg: "#fef9c3", border: "2px solid #ca8a04", label: "Your selection" },
                { bg: "#f3f4f6", border: "1px solid #e5e7eb", label: "Spot taken" },
              ].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 18, height: 13, background: l.bg, border: l.border, borderRadius: 3, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "#6b7280" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ width: 230, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#111", marginBottom: 14, fontFamily: "Georgia,serif" }}>Ad Spot Pricing</div>
              {Object.entries(SIZES).map(([k, sz]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#111" }}>{sz.label}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{sz.dim}</div>
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 18, color: "#991b1b" }}>${sz.price}</div>
                </div>
              ))}
              <div style={{ marginTop: 12, fontSize: 11, color: "#6b7280", lineHeight: 1.6 }}>All spots include professional ad design &amp; direct mailing to {campaign.homesCount?.toLocaleString()} homes.</div>
            </div>

            <div style={{ background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#111", marginBottom: 12, fontFamily: "Georgia,serif" }}>Why It Works</div>
              {[["🚫", "One business per category"], ["📬", "Physical mail — not a digital ad"], ["🎨", "Pro ad design included"], ["📍", "Targeted local neighborhoods"], ["💰", "Under 10¢ per home"], ["⭐", `${campaign.homesCount?.toLocaleString()} Clarkesville-area homes`]].map(([ic, tx]) => (
                <div key={tx} style={{ display: "flex", gap: 8, marginBottom: 9, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{ic}</span>
                  <span style={{ fontSize: 12, color: "#374151", lineHeight: 1.4 }}>{tx}</span>
                </div>
              ))}
            </div>

            <div style={{ background: "linear-gradient(145deg,#7f1d1d,#991b1b)", borderRadius: 12, padding: 18, textAlign: "center", color: "#fff" }}>
              <div style={{ fontSize: 26, marginBottom: 6 }}>⏳</div>
              <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 6, fontFamily: "Georgia,serif" }}>Only {openSpots.length} spot{openSpots.length !== 1 ? "s" : ""} left!</div>
              <div style={{ fontSize: 11.5, opacity: 0.85, marginBottom: 14, lineHeight: 1.5 }}>One business per category. Don't let your competitor claim your spot.</div>
              <button
                onClick={() => { const a = spots.find(s => s.status === "available"); if (a) { setSelected(a); setModal(a); setReserveError(null); } }}
                style={{ background: "#fff", color: "#991b1b", border: "none", borderRadius: 9, padding: "11px 0", fontWeight: 900, fontSize: 13, cursor: "pointer", width: "100%" }}>
                Claim Your Spot →
              </button>
            </div>
          </div>
        </div>
      </div>

      {modal && (
        <Modal
          spot={modal}
          onClose={() => { setModal(null); setSelected(null); setReserveError(null); }}
          onSubmit={handleSubmit}
          isLoading={reserveMutation.isPending}
          error={reserveError}
        />
      )}

      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#14532d", color: "#fff", borderRadius: 12, padding: "14px 26px", zIndex: 300, boxShadow: "0 8px 30px rgba(0,0,0,0.25)", display: "flex", alignItems: "center", gap: 14, maxWidth: 460, width: "90%", fontFamily: "sans-serif" }}>
          <span style={{ fontSize: 28 }}>🎉</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Spot Reserved!</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Redirecting to checkout...</div>
          </div>
          <button onClick={() => setToast(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", opacity: 0.7 }}>×</button>
        </div>
      )}
    </div>
  );
}
