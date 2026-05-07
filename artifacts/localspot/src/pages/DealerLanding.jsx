import { useState } from "react";
import { Link } from "wouter";
import { useIsMobile } from "../hooks/use-mobile";

const RED = "#7B1418";
const GOLD = "#d4a017";

const NAV_LINKS = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Earnings", href: "#earnings" },
  { label: "Territories", href: "#territories" },
  { label: "FAQ", href: "#faq" },
];

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

function NavBar() {
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const handleNav = (id) => {
    setMenuOpen(false);
    setTimeout(() => scrollTo(id), 50);
  };
  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50, background: "#fff",
      borderBottom: "1px solid #e5e7eb",
      padding: isMobile ? "0 16px" : "0 32px", display: "flex", alignItems: "center",
      justifyContent: "space-between", height: 64, gap: 12,
    }}>
      <Link href="/"
        style={{ display: "flex", alignItems: "center", gap: 10,
          textDecoration: "none", color: "inherit", minWidth: 0 }}>
        <span style={{ fontSize: isMobile ? 24 : 32, flexShrink: 0 }}>📮</span>
        <div style={{
          fontWeight: 900, fontSize: isMobile ? 18 : 30, color: "#111",
          fontFamily: "Georgia,serif", lineHeight: 1,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          My Town Postcard
        </div>
      </Link>

      {isMobile ? (
        <>
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            style={{
              background: "none", border: "none", cursor: "pointer",
              width: 44, height: 44, display: "flex", flexDirection: "column",
              justifyContent: "center", alignItems: "center", gap: 5, flexShrink: 0,
            }}
          >
            <span style={{ width: 22, height: 2.5, background: "#111", borderRadius: 2,
              transform: menuOpen ? "translateY(7.5px) rotate(45deg)" : "none",
              transition: "transform 0.2s" }} />
            <span style={{ width: 22, height: 2.5, background: "#111", borderRadius: 2,
              opacity: menuOpen ? 0 : 1, transition: "opacity 0.2s" }} />
            <span style={{ width: 22, height: 2.5, background: "#111", borderRadius: 2,
              transform: menuOpen ? "translateY(-7.5px) rotate(-45deg)" : "none",
              transition: "transform 0.2s" }} />
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{
                position: "fixed", inset: 0, top: 64, background: "rgba(0,0,0,0.4)", zIndex: 40,
              }} />
              <nav style={{
                position: "fixed", top: 64, left: 0, right: 0, background: "#fff",
                borderBottom: "1px solid #e5e7eb", padding: "12px 16px 16px",
                display: "flex", flexDirection: "column", gap: 4, zIndex: 41,
                boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
              }}>
                {NAV_LINKS.map(l => (
                  <button key={l.label} onClick={() => handleNav(l.href.slice(1))}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 16, fontWeight: 600, color: "#374151",
                      fontFamily: "sans-serif", textAlign: "left",
                      padding: "14px 8px", minHeight: 44, borderRadius: 8,
                    }}>
                    {l.label}
                  </button>
                ))}
                <a href={`${baseUrl}/dealers/signup`}
                  style={{
                    marginTop: 8, background: RED, color: "#fff", border: "none",
                    borderRadius: 8, padding: "14px 22px", fontSize: 15, fontWeight: 800,
                    cursor: "pointer", fontFamily: "sans-serif", minHeight: 44,
                    textAlign: "center", textDecoration: "none",
                  }}>
                  Apply Now →
                </a>
              </nav>
            </>
          )}
        </>
      ) : (
        <nav style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {NAV_LINKS.map(l => (
            <button key={l.label} onClick={() => scrollTo(l.href.slice(1))}
              style={{ background: "none", border: "none", cursor: "pointer",
                fontSize: 14, fontWeight: 600, color: "#374151", fontFamily: "sans-serif" }}>
              {l.label}
            </button>
          ))}
          <a href={`${baseUrl}/dealers/signup`}
            style={{ background: RED, color: "#fff", border: "none", borderRadius: 8,
              padding: "9px 22px", fontSize: 14, fontWeight: 800, cursor: "pointer",
              fontFamily: "sans-serif", letterSpacing: 0.2, textDecoration: "none" }}>
            Apply Now →
          </a>
        </nav>
      )}
    </header>
  );
}

function Hero() {
  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return (
    <section style={{ background: "#fff", padding: "72px 32px 80px",
      maxWidth: 1180, margin: "0 auto",
      display: "flex", alignItems: "center", gap: 64, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 420px", minWidth: 300 }}>
        <div style={{
          display: "inline-block", background: `${GOLD}22`, color: "#8a6d11",
          padding: "5px 12px", borderRadius: 999, fontSize: 12.5,
          fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase",
          fontFamily: "sans-serif", marginBottom: 18,
        }}>
          🚀 Independent Dealer Program
        </div>
        <h1 style={{ fontSize: "clamp(32px, 4vw, 50px)", fontWeight: 900, color: "#111",
          fontFamily: "Georgia,serif", lineHeight: 1.18, margin: "0 0 18px" }}>
          Build a Local<br />
          <span style={{ color: RED }}>Direct-Mail Business</span><br />
          in Your Hometown
        </h1>
        <p style={{ fontSize: 17, color: "#444", lineHeight: 1.6, margin: "0 0 24px", maxWidth: 480 }}>
          Become an independent My Town Postcard dealer. We give you the
          system — postcards, design, printing, EDDM mailing — you bring
          the local relationships and earn commission on every spot you sell.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", marginBottom: 32 }}>
          {[
            "4 Postcard Territories",
            "20,000+ Households",
            "Earn 40% Commission",
            "Done-For-You Operations",
          ].map(b => (
            <div key={b} style={{ display: "flex", alignItems: "center", gap: 8,
              fontSize: 14.5, color: "#222", fontFamily: "sans-serif", fontWeight: 500 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: RED,
                flexShrink: 0, display: "inline-block" }} />
              {b}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <a href={`${baseUrl}/dealers/signup`}
            style={{ background: RED, color: "#fff", border: "none", borderRadius: 9,
              padding: "14px 32px", fontSize: 16, fontWeight: 800, cursor: "pointer",
              fontFamily: "sans-serif", boxShadow: `0 4px 18px ${RED}55`, textDecoration: "none" }}>
            Apply Now — $99
          </a>
          <button onClick={() => scrollTo("how-it-works")}
            style={{ background: "#fff", color: RED, border: `2px solid ${RED}`,
              borderRadius: 9, padding: "14px 28px", fontSize: 16, fontWeight: 700,
              cursor: "pointer", fontFamily: "sans-serif" }}>
            How It Works
          </button>
        </div>
      </div>

      <div style={{ flex: "1 1 420px", minWidth: 300, position: "relative" }}>
        <img
          src={`${import.meta.env.BASE_URL}postcard-hero-double.png`}
          alt="My Town Postcard sample"
          style={{ width: "100%", maxWidth: 560, borderRadius: 12,
            boxShadow: "0 24px 60px rgba(0,0,0,0.18)", display: "block" }}
        />
        <div style={{
          position: "absolute", bottom: 24, left: -12,
          background: GOLD, color: "#fff",
          borderRadius: 10, padding: "14px 20px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)", fontFamily: "sans-serif",
        }}>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>$2,500+</div>
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.95 }}>Per Sold-Out<br />Postcard</div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "1", icon: "📝", title: "Apply & Pay $99 Setup",
      desc: "Sign up below, see your 4 proposed territories, and pay the one-time $99 setup fee plus your first $99 monthly subscription." },
    { n: "2", icon: "🗺️", title: "Get Your Territories",
      desc: "We assign you 4 distinct postcard zones (~5,000 homes each) clustered around your hometown. Exclusive — no other dealer can sell in your area." },
    { n: "3", icon: "📞", title: "Sell Local Ad Spots",
      desc: "Reach out to local businesses — restaurants, dentists, HVAC, realtors. Use our pricing, our designs, our mailing. You just close the deal." },
    { n: "4", icon: "💰", title: "Earn 40% Commission",
      desc: "When a postcard sells out, that's $2,500+ in profit — and 40% of that ($1,000+) is yours. Sell 4 postcards a year and you're cleared $4,000+." },
  ];
  return (
    <section id="how-it-works" style={{ background: "#fff", padding: "80px 32px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", fontSize: 36, fontWeight: 900, color: "#111",
          fontFamily: "Georgia,serif", marginBottom: 10 }}>How the Dealer Program Works</h2>
        <p style={{ textAlign: "center", color: "#666", fontSize: 16, marginBottom: 56,
          maxWidth: 580, margin: "0 auto 56px", fontFamily: "sans-serif" }}>
          You bring the local relationships. We bring the system, the design,
          the printing, and the mailing. You keep 40% of every spot.
        </p>
        <div style={{ display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 32 }}>
          {steps.map(s => (
            <div key={s.n} style={{ textAlign: "center", padding: "28px 20px",
              border: "1px solid #f0f0f0", borderRadius: 16, background: "#fff",
              boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>{s.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: RED, marginBottom: 8,
                fontFamily: "sans-serif" }}>{s.n}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#111", marginBottom: 10,
                fontFamily: "Georgia,serif" }}>{s.title}</div>
              <div style={{ fontSize: 14, color: "#666", lineHeight: 1.6,
                fontFamily: "sans-serif" }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhatYouGet() {
  const bullets = [
    { t: "4 exclusive postcard territories", d: "~20,000 households reachable across your assigned zones." },
    { t: "Done-for-you ad design", d: "We handle every ad — your job is closing, not designing." },
    { t: "Printing + USPS EDDM mailing", d: "We print, sort, and drop. You never touch a postcard." },
    { t: "Online ordering platform", d: "Send a link, the customer pays online, you get the credit." },
    { t: "QR scan tracking", d: "Every paid spot gets a QR code so customers see real ROI." },
    { t: "Personal dealer account manager", d: "One human on our team is your direct line, every step." },
  ];
  return (
    <section style={{ background: "#fafafa", padding: "80px 32px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", fontSize: 32, fontWeight: 900, color: "#111",
          fontFamily: "Georgia,serif", marginBottom: 12 }}>What You Get for $99/month</h2>
        <p style={{ textAlign: "center", color: "#666", fontSize: 15, marginBottom: 44,
          maxWidth: 540, margin: "0 auto 44px", fontFamily: "sans-serif" }}>
          One simple subscription. Everything you need to run a local
          direct-mail business — without printing a single postcard yourself.
        </p>
        <div style={{ display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
          {bullets.map(b => (
            <div key={b.t} style={{ background: "#fff", borderRadius: 12,
              padding: "20px 22px", border: "1px solid #ececec",
              display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%",
                background: `${RED}10`, color: RED, fontSize: 16, fontWeight: 900,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, fontFamily: "sans-serif" }}>✓</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#111",
                  fontFamily: "Georgia,serif", marginBottom: 4 }}>{b.t}</div>
                <div style={{ fontSize: 13.5, color: "#666", lineHeight: 1.55,
                  fontFamily: "sans-serif" }}>{b.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EarningsCalculator() {
  const [postcardsPerYear, setPostcardsPerYear] = useState(4);
  const [avgSpotsSold, setAvgSpotsSold] = useState(12);
  const [avgPrice, setAvgPrice] = useState(300);
  const [commissionPct, setCommissionPct] = useState(40);

  const grossPerPostcard = avgSpotsSold * avgPrice;
  const yourCutPerPostcard = Math.round(grossPerPostcard * (commissionPct / 100));
  const annualEarnings = yourCutPerPostcard * postcardsPerYear;
  const annualCost = 99 + 99 * 12;
  const netAnnual = annualEarnings - annualCost;

  const slider = (label, val, set, min, max, step, suffix = "") => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 6, fontFamily: "sans-serif" }}>
        <label style={{ fontSize: 13.5, fontWeight: 700, color: "#374151" }}>{label}</label>
        <span style={{ fontSize: 15, fontWeight: 800, color: RED }}>
          {val}{suffix}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={e => set(Number(e.target.value))}
        style={{ width: "100%", accentColor: RED }} />
    </div>
  );

  return (
    <section id="earnings" style={{ background: "#fff", padding: "80px 32px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", fontSize: 32, fontWeight: 900, color: "#111",
          fontFamily: "Georgia,serif", marginBottom: 10 }}>What Could You Earn?</h2>
        <p style={{ textAlign: "center", color: "#666", fontSize: 15, marginBottom: 40,
          fontFamily: "sans-serif" }}>
          Drag the sliders to model your local market. Honest math, no hype.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 24, alignItems: "stretch" }}>

          <div style={{ background: "#fafafa", borderRadius: 16, padding: 28,
            display: "flex", flexDirection: "column", gap: 22 }}>
            {slider("Postcards mailed per year", postcardsPerYear, setPostcardsPerYear, 1, 12, 1)}
            {slider("Avg spots sold per postcard", avgSpotsSold, setAvgSpotsSold, 1, 16, 1, " of 16")}
            {slider("Avg spot price", avgPrice, setAvgPrice, 199, 450, 1, " $")}
            {slider("Your commission %", commissionPct, setCommissionPct, 20, 50, 5, "%")}
          </div>

          <div style={{ background: RED, color: "#fff", borderRadius: 16, padding: 28,
            display: "flex", flexDirection: "column", justifyContent: "center", gap: 18 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85,
                letterSpacing: 0.5, textTransform: "uppercase",
                fontFamily: "sans-serif", marginBottom: 4 }}>Per Postcard You Earn</div>
              <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1,
                fontFamily: "Georgia,serif" }}>${yourCutPerPostcard.toLocaleString()}</div>
            </div>
            <div style={{ height: 1, background: "rgba(255,255,255,0.25)" }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85,
                letterSpacing: 0.5, textTransform: "uppercase",
                fontFamily: "sans-serif", marginBottom: 4 }}>Annual Gross Earnings</div>
              <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1,
                fontFamily: "Georgia,serif" }}>${annualEarnings.toLocaleString()}</div>
            </div>
            <div style={{ height: 1, background: "rgba(255,255,255,0.25)" }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85,
                letterSpacing: 0.5, textTransform: "uppercase",
                fontFamily: "sans-serif", marginBottom: 4 }}>Net After Subscription</div>
              <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1,
                fontFamily: "Georgia,serif" }}>${netAnnual.toLocaleString()}</div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4, fontFamily: "sans-serif" }}>
                After ${annualCost} setup + 12 months
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SampleTerritories() {
  // Simple SVG infographic showing 4 color-coded territory zones around a
  // dealer's home ZIP. Static — meant to communicate the concept.
  const zones = [
    { x: 90,  y: 90,  r: 60, fill: "#7B1418", label: "Zone 1\n5,000 homes" },
    { x: 260, y: 90,  r: 60, fill: "#d4a017", label: "Zone 2\n5,000 homes" },
    { x: 90,  y: 240, r: 60, fill: "#15803d", label: "Zone 3\n5,000 homes" },
    { x: 260, y: 240, r: 60, fill: "#1d4ed8", label: "Zone 4\n5,000 homes" },
  ];
  return (
    <section id="territories" style={{ background: "#fafafa", padding: "80px 32px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto",
        display: "flex", alignItems: "center", gap: 56, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px" }}>
          <h2 style={{ fontSize: 32, fontWeight: 900, color: "#111",
            fontFamily: "Georgia,serif", marginBottom: 16, lineHeight: 1.25 }}>
            Your 4 Postcard<br />Territories
          </h2>
          <p style={{ fontSize: 15.5, color: "#444", lineHeight: 1.65,
            fontFamily: "sans-serif", marginBottom: 16 }}>
            Each territory is a contiguous cluster of ZIP codes around your
            home base, sized to ~5,000 homes — the standard for one USPS EDDM
            postcard run. That's <strong>~20,000 households total</strong>,
            roughly 4–6 ZIP codes each, all yours exclusively.
          </p>
          <p style={{ fontSize: 14, color: "#666", lineHeight: 1.65,
            fontFamily: "sans-serif" }}>
            We compute your territories live during signup using a US ZIP-code
            map. You'll see exactly which towns and ZIPs are yours before you
            pay a cent.
          </p>
        </div>

        <div style={{ flex: "1 1 320px", display: "flex", justifyContent: "center" }}>
          <svg viewBox="0 0 350 330" width="100%" style={{ maxWidth: 380 }}
            xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="350" height="330" fill="#fff" rx="14" />
            {zones.map((z, i) => (
              <g key={i}>
                <circle cx={z.x} cy={z.y} r={z.r} fill={z.fill} opacity="0.18" />
                <circle cx={z.x} cy={z.y} r={z.r * 0.65} fill={z.fill} opacity="0.32" />
                <circle cx={z.x} cy={z.y} r={6} fill={z.fill} />
                <text x={z.x} y={z.y - z.r - 8} textAnchor="middle"
                  style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 800, fill: "#111" }}>
                  Zone {i + 1}
                </text>
                <text x={z.x} y={z.y - z.r + 6} textAnchor="middle"
                  style={{ fontFamily: "sans-serif", fontSize: 10, fill: "#666" }}>
                  ~5,000 homes
                </text>
              </g>
            ))}
            <circle cx="175" cy="165" r="10" fill="#111" stroke="#fff" strokeWidth="3" />
            <text x="175" y="200" textAnchor="middle"
              style={{ fontFamily: "sans-serif", fontSize: 12, fontWeight: 800, fill: "#111" }}>
              You are here
            </text>
          </svg>
        </div>
      </div>
    </section>
  );
}

function CTABanner() {
  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return (
    <section style={{ background: RED, padding: "60px 32px", textAlign: "center" }}>
      <h2 style={{ color: "#fff", fontSize: 32, fontWeight: 900, fontFamily: "Georgia,serif",
        margin: "0 0 12px" }}>Ready to claim your hometown?</h2>
      <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 16,
        fontFamily: "sans-serif", margin: "0 0 24px" }}>
        Apply now — $99 setup, $99/mo, cancel anytime. We're keeping it
        to one dealer per market, first come first served.
      </p>
      <a href={`${baseUrl}/dealers/signup`}
        style={{ display: "inline-block", background: "#fff", color: RED, border: "none", borderRadius: 9,
          padding: "14px 36px", fontSize: 16, fontWeight: 800, cursor: "pointer",
          fontFamily: "sans-serif", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", textDecoration: "none" }}>
        Apply Now →
      </a>
    </section>
  );
}

const FAQ_ITEMS = [
  { q: "What does the $99/month subscription cover?",
    a: "Your monthly subscription covers your access to the dealer platform: your assigned territories stay locked to you, you get our online ordering portal, ad-design system, customer-facing checkout pages, QR tracking, and a personal account manager. Printing and mailing are billed separately per postcard run." },
  { q: "How is commission calculated?",
    a: "You earn 40% of the gross revenue from spots you sell. A typical 16-spot postcard sells out at $4,500–$5,000 — you'd take home $1,800–$2,000 per run. Commissions are paid out within 7 days of the postcard's mail date." },
  { q: "What if I can't sell out the postcard?",
    a: "You don't have to sell out for the postcard to mail. We have a minimum of 6 spots booked to send a postcard run. If you can't hit that within your campaign window, we'll roll your bookings into the next run with no penalty." },
  { q: "How exclusive are the territories?",
    a: "Fully exclusive. Once you're assigned 4 ZIP-code clusters, no other My Town Postcard dealer can be active in those ZIPs. If you cancel, the territories are released back to the pool after a 30-day grace period." },
  { q: "Do I have to provide my own designs or printer?",
    a: "No — that's the whole point. We design every business's ad, print the postcards on commercial stock, and drop them with USPS EDDM. You're the local relationship — we're the operations engine." },
  { q: "What kind of business is good for selling these?",
    a: "Anyone with strong local relationships does well: real estate agents, insurance brokers, chamber-of-commerce types, retired sales reps, networking pros. If you're already known in town, this is a turnkey side income." },
  { q: "How quickly will I see my territories?",
    a: "Immediately. As soon as you complete the application form and confirm your home ZIP, our system shows you the 4 proposed postcard zones live, before payment. You can re-shuffle the layout if you want a different split." },
  { q: "Can I cancel anytime?",
    a: "Yes — your monthly subscription cancels with one click from your dealer portal (coming in Phase 2). No long-term contracts. The $99 setup fee is non-refundable since we lock your territories the day you sign up." },
  { q: "What does it cost the businesses I sell to?",
    a: "Spots range from $199 (Small) to $450 (Extra-Large). All include design and mailing. You set the pricing within those tiers based on what your local market will bear." },
  { q: "Is there a sales quota?",
    a: "No quotas. As long as you can hit our 6-spot minimum to mail a postcard at least once a year, you keep your territories. We'll work with you actively if you're not seeing traction." },
];

function FAQSection() {
  const [open, setOpen] = useState(null);
  return (
    <section id="faq" style={{ background: "#fff", padding: "80px 32px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", fontSize: 36, fontWeight: 900, color: "#111",
          fontFamily: "Georgia,serif", marginBottom: 10 }}>Dealer FAQ</h2>
        <p style={{ textAlign: "center", color: "#666", fontSize: 15, marginBottom: 44,
          fontFamily: "sans-serif" }}>The most common questions from prospective dealers.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} style={{ borderBottom: "1px solid #e5e7eb" }}>
              <button onClick={() => setOpen(open === i ? null : i)}
                style={{ width: "100%", textAlign: "left", padding: "18px 0",
                  background: "none", border: "none", cursor: "pointer",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#111",
                  fontFamily: "sans-serif", lineHeight: 1.4 }}>{item.q}</span>
                <span style={{ fontSize: 20, color: "#999", flexShrink: 0,
                  transform: open === i ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s" }}>⌄</span>
              </button>
              {open === i && (
                <div style={{ padding: "0 0 18px", fontSize: 14.5, color: "#555",
                  lineHeight: 1.7, fontFamily: "sans-serif" }}>{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ background: "#111", padding: "48px 32px 32px", color: "#ccc" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontWeight: 900, fontSize: 17, color: "#fff",
          fontFamily: "Georgia,serif", marginBottom: 8 }}>My Town Postcard</div>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: "#9ca3af",
          fontFamily: "sans-serif", maxWidth: 480, margin: "0 auto 16px" }}>
          Helping local businesses connect with their neighbors through
          cost-effective postcard marketing — and helping local entrepreneurs
          build a recurring side income doing it.
        </p>
        <div style={{ borderTop: "1px solid #222", paddingTop: 20, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: "#6b7280", fontFamily: "sans-serif" }}>
            © 2025 My Town Postcard · mytownpostcard.com
          </span>
        </div>
      </div>
    </footer>
  );
}

export default function DealerLanding() {
  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      <NavBar />
      <Hero />
      <HowItWorks />
      <WhatYouGet />
      <EarningsCalculator />
      <SampleTerritories />
      <CTABanner />
      <FAQSection />
      <Footer />
    </div>
  );
}
