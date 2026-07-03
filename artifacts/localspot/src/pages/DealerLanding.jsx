import { useState } from "react";
import { Link } from "wouter";
import { useIsMobile } from "../hooks/use-mobile";
import { MailboxLogo } from "../components/MailboxLogo";
import { DEALER_COMMISSION_RATE, SOLD_OUT_REVENUE_CENTS } from "@/lib/commission";

const RED = "#7B1418";
const GOLD = "#d4a017";

// Derived from DEALER_COMMISSION_RATE and SOLD_OUT_REVENUE_CENTS — no hardcoded
// percentages or dollar figures below. If the rate or spot prices change,
// updating those two constants is sufficient.
const commissionPct = Math.round(DEALER_COMMISSION_RATE * 100);
// Round to nearest $100 for clean "~$X,XXX" display (e.g. $5,985 → $6,000; $1,795.50 → $1,800)
const soldOutRevenueDollars = Math.round(SOLD_OUT_REVENUE_CENTS / 10000) * 100;
const perPostcardDollars = Math.round(SOLD_OUT_REVENUE_CENTS * DEALER_COMMISSION_RATE / 10000) * 100;
const monthlyDollars = perPostcardDollars * 4;

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
      justifyContent: "space-between", height: isMobile ? 72 : 92, gap: 12,
    }}>
      <Link href="/"
        style={{ display: "flex", alignItems: "center", gap: 14,
          textDecoration: "none", color: "inherit", minWidth: 0 }}>
        <MailboxLogo height={isMobile ? 44 : 64} />
        <div style={{
          fontWeight: 900, fontSize: isMobile ? 22 : 40, color: "#111",
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
                position: "fixed", inset: 0, top: 72, background: "rgba(0,0,0,0.4)", zIndex: 40,
              }} />
              <nav style={{
                position: "fixed", top: 72, left: 0, right: 0, background: "#fff",
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
                <a href={`${baseUrl}/dealers/blog`}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 16, fontWeight: 600, color: "#374151",
                    fontFamily: "sans-serif", textAlign: "left",
                    padding: "14px 8px", minHeight: 44, borderRadius: 8,
                    textDecoration: "none", display: "block",
                  }}>
                  Dealer Blog
                </a>
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
          <a href={`${baseUrl}/dealers/blog`}
            style={{ fontSize: 14, fontWeight: 600, color: "#374151",
              fontFamily: "sans-serif", textDecoration: "none" }}>
            Dealer Blog
          </a>
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
            `Earn ${commissionPct}% of Revenue`,
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
          src={`${import.meta.env.BASE_URL}postcard-hero.png`}
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
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>${perPostcardDollars.toLocaleString()}+</div>
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.95 }}>Per Sold-Out<br />Postcard</div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "1", icon: "📝", title: "Apply & Pay $99 Setup",
      desc: "Sign up below, see your 4 proposed territories, and pay the one-time $99 setup fee, which includes your first month of subscription." },
    { n: "2", icon: "🗺️", title: "Get Your Territories",
      desc: "We assign you 4 distinct postcard zones (~5,000 homes each) clustered around your hometown. Exclusive — no other dealer can sell in your area." },
    { n: "3", icon: "📞", title: "Sell Local Ad Spots",
      desc: "Reach out to local businesses — restaurants, dentists, HVAC, realtors. Use our pricing, our designs, our mailing. You just close the deal." },
    { n: "4", icon: "💰", title: `Earn ~$${perPostcardDollars.toLocaleString()} Per Postcard`,
      desc: `A sold-out postcard generates ~$${soldOutRevenueDollars.toLocaleString()} in ad revenue. You keep ${commissionPct}% of that — about $${perPostcardDollars.toLocaleString()} — no need to track printing or mailing costs. Fill one card per territory per month and take home about $${monthlyDollars.toLocaleString()}.` },
  ];
  return (
    <section id="how-it-works" style={{ background: "#fff", padding: "80px 32px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", fontSize: 36, fontWeight: 900, color: "#111",
          fontFamily: "Georgia,serif", marginBottom: 10 }}>How the Dealer Program Works</h2>
        <p style={{ textAlign: "center", color: "#666", fontSize: 16, marginBottom: 56,
          maxWidth: 580, margin: "0 auto 56px", fontFamily: "sans-serif" }}>
          You bring the local relationships. We bring the system, the design,
          the printing, and the mailing. You keep {commissionPct}% of the revenue on every card.
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
    { icon: "🗺️", t: "Unlimited postcard territories", d: "Start with 4 exclusive zones (~20,000 households). Keep filling postcards and keep adding — your $99/month covers as many territories as you can handle." },
    { icon: "🎨", t: "Done-for-you ad design", d: "We handle every ad — your job is closing, not designing." },
    { icon: "📬", t: "Printing + USPS EDDM mailing", d: "We print, sort, and drop. You never touch a postcard." },
    { icon: "💻", t: "Online ordering platform", d: "Send a link, the customer pays online, you get the credit." },
    { icon: "📱", t: "QR scan tracking", d: "Every paid spot gets a QR code so customers see real ROI." },
    { icon: "🤝", t: "Personal dealer account manager", d: "One human on our team is your direct line, every step." },
  ];
  return (
    <section style={{ background: "#fafafa", padding: "80px 32px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", fontSize: 32, fontWeight: 900, color: "#111",
          fontFamily: "Georgia,serif", marginBottom: 40 }}>What You Get for $99/month</h2>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
        }}>
          {bullets.map(item => (
            <div key={item.t} style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              textAlign: "center",
              background: "#fff",
              border: `2px solid ${RED}22`,
              borderRadius: 16,
              padding: "28px 20px 24px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
            }}>
              <div style={{ fontSize: 32, marginBottom: 12, lineHeight: 1 }}>{item.icon}</div>
              <div style={{ fontWeight: 800, color: RED, marginBottom: 8,
                fontFamily: "sans-serif", fontSize: 15, lineHeight: 1.3 }}>{item.t}</div>
              <div style={{ color: "#666", fontSize: 13.5, lineHeight: 1.6,
                fontFamily: "sans-serif" }}>{item.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Territories() {
  return null;
}

const FAQ_ITEMS = [
  { q: "What does the $99/month subscription cover?",
    a: "Your monthly subscription covers your access to the entire dealer platform: your assigned territories stay locked to you, you can add more as you grow (no cap — keep filling postcards and keep expanding), you get our online ordering portal, ad-design system, customer-facing checkout pages, payment processing, QR tracking, and a personal account manager. You sell ads; we do everything else." },
  { q: "How is commission calculated?",
    a: `A sold-out postcard generates roughly $${soldOutRevenueDollars.toLocaleString()} in ad revenue. You keep ${commissionPct}% of that revenue — about $${perPostcardDollars.toLocaleString()} per postcard — with no need to track printing, mailing, or fulfillment costs. With 4 territories running one postcard each per month, that's about $${monthlyDollars.toLocaleString()}/month in earning potential. Commissions are paid within 3 business days of the postcard's mail date.` },
  { q: "How exclusive are the territories?",
    a: "Fully exclusive. Once you're assigned a ZIP-code cluster, no other My Town Postcard dealer can be active in those ZIPs. If you cancel, the territories are released back to the pool after a 30-day grace period." },
  { q: "Do I have to provide my own designs or printer?",
    a: "No - that's the best part! We design every business's ad, print the postcards on commercial stock, and drop them with USPS EDDM. You're the local relationship — we're the operations engine." },
  { q: "What kind of business is good for selling these?",
    a: "Anyone with strong local relationships does well: real estate agents, insurance brokers, chamber-of-commerce types, retired sales reps, networking pros - even stay-at-home parents and college students. Make it a side hustle or a full time business - you decide." },
  { q: "How quickly will I see my territories?",
    a: "Immediately. As soon as you complete the application form and confirm your home ZIP, our system shows you the proposed territory live, before payment." },
  { q: "Can I cancel anytime?",
    a: "Yes — your monthly subscription cancels with one click from your dealer portal - no long-term contracts. But, please contact us first - we would love to help you succeed!" },
  { q: "What does it cost the businesses I sell to?",
    a: "Spots range from $199 (Small) to $499 (Extra-Large). All include design, printing and mailing." },
  { q: "Can I get more than 4 territories?",
    a: "Yes — and there's no hard cap. As long as you're consistently filling postcards in your existing territories, your $99/month covers as many as you can handle. Once you've proven you can sell out your current zones, just reach out to your account manager and we'll add more. The only limit is how many you can actively sell." },
  { q: "Is there a sales quota?",
    a: "No quotas. As long as you can fill a postcard at least once a year, you remain a dealer. We'll work with you actively if you're not seeing traction." },
  { q: "When and how are commissions paid?",
    a: "Commissions are paid at the mail date. Once a postcard ships to USPS, your commission is calculated and paid within 3 business days. No waiting, no surprises." },
  { q: "Will I have to make ads?",
    a: "Not at all. If you fancy yourself a designer, you can always upload your own ad. Or, just let My Town's Ad Generator create a masterpiece for you!" },
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
                <span style={{ fontSize: 15, fontWeight: 600, color: "#111", fontFamily: "sans-serif" }}>{item.q}</span>
                <span style={{ fontSize: 18, color: RED, flexShrink: 0 }}>{open === i ? "−" : "+"}</span>
              </button>
              {open === i && (
                <div style={{ padding: "0 0 18px", color: "#555", fontSize: 14, lineHeight: 1.7,
                  fontFamily: "sans-serif" }}>{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return (
    <footer style={{
      background: "#111", borderTop: "3px solid #7B1418",
      padding: "36px 32px", textAlign: "center",
    }}>
      <div style={{
        display: "flex", flexWrap: "wrap", justifyContent: "center",
        gap: "12px 32px", marginBottom: 20,
      }}>
        {[
          { label: "Advertise on a Postcard", href: `${baseUrl}/` },
          { label: "Dealer Blog", href: `${baseUrl}/dealers/blog` },
          { label: "Apply to Become a Dealer", href: `${baseUrl}/dealers/signup` },
        ].map(l => (
          <a key={l.label} href={l.href}
            style={{
              color: "#ccc", fontSize: 13, fontWeight: 600,
              fontFamily: "sans-serif", textDecoration: "none",
            }}
            onMouseOver={e => e.currentTarget.style.color = "#fff"}
            onMouseOut={e => e.currentTarget.style.color = "#ccc"}
          >
            {l.label}
          </a>
        ))}
      </div>
      <p style={{ color: "#666", fontSize: 12, fontFamily: "sans-serif", margin: 0 }}>
        © {new Date().getFullYear()} My Town Postcard. All rights reserved.
      </p>
    </footer>
  );
}

export default function DealerLanding() {
  return (
    <div>
      <NavBar />
      <Hero />
      <HowItWorks />
      <WhatYouGet />
      <Territories />
      <FAQSection />
      <Footer />
    </div>
  );
}
