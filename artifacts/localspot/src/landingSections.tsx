import { useState } from "react";
// @ts-expect-error JSX module without types
import PostcardPickerSection from "./PostcardPickerSection";
import { useIsMobile } from "./hooks/use-mobile";
import { MailboxLogo } from "./components/MailboxLogo";

export const RED = "#7B1418";

// Copy that varies between the flagship Habersham home page and per-territory
// dealer landing pages. Defaults reproduce the original hard-coded home-page
// copy verbatim, so rendering with no `copy` prop is byte-for-byte the old page.
// Several fields are FULL sentences (not fragments) because the original copy
// mixed forms that a single token can't reproduce exactly — e.g. "Habersham
// homes" in How-It-Works vs "Habersham County homes" in Features, and the FAQ's
// Oxford-comma city list. Territory pages compose these sentences in buildCopy.
export type LandingCopy = {
  countyPossessive: string; // hero headline line 2, e.g. "Habersham County's"
  heroCities: string; // hero subcopy city list (no Oxford comma)
  heroSeason: string; // "this <season>" in hero subcopy
  howItWorksMailDesc: string; // How-It-Works step 3 full description
  mailingLabel: string; // Features card title
  mailingDetail: string; // Features mailing-window full description
  targetedAreasDesc: string; // Features "Targeted Areas" full description
  faqEddm: string; // FAQ "how do you pick homes" full answer
  faqMailboxes: string; // FAQ "when will my ad hit mailboxes" full answer
  faqGoodFit: string; // FAQ "is my business good for this" full answer
  citiesListAmp: string; // footer city list, comma + "&"
  // Optional overrides for single-city dealer area pages. When `heroCity` is
  // set the Hero renders "Advertise in [City]" instead of the standard headline.
  heroCity?: string;     // e.g. "Woodstock" — triggers the single-city hero
  heroSubhead?: string;  // e.g. "Reach 5,000 local households via USPS EDDM"
  heroContext?: string;  // e.g. "Part of the Cherokee County dealer territory"
};

export const DEFAULT_COPY: LandingCopy = {
  countyPossessive: "Habersham County's",
  heroCities: "Clarkesville, Demorest, Cornelia and Alto",
  heroSeason: "Summer",
  howItWorksMailDesc: "5,000 postcards printed and delivered to Habersham homes via USPS.",
  mailingLabel: "Summer 2026 Mailing",
  mailingDetail:
    "Timed to reach 5,000 Habersham County homes during peak local shopping season — targeted for mid-July 2026.",
  targetedAreasDesc:
    "We focus on specific Habersham County neighborhoods where your customers already live.",
  faqEddm:
    "We use USPS Every Door Direct Mail (EDDM) to target specific Habersham County postal routes — reaching 5,000 households across Clarkesville, Demorest, Cornelia, and Alto.",
  faqMailboxes:
    "The Summer 2026 mailing is targeted for the third week of June 2026. Once all spots are filled, your ad is designed, printed, and mailed.",
  faqGoodFit:
    "Any local business that serves Habersham County residents is a great fit — restaurants, home services, medical, legal, retail, and more.",
  citiesListAmp: "Clarkesville, Demorest, Cornelia & Alto",
};

const NAV_LINKS = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

export function NavBar() {
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNav = (id: string) => {
    setMenuOpen(false);
    setTimeout(() => scrollTo(id), 50);
  };

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50, background: "#fff",
      borderBottom: "1px solid #e5e7eb",
      boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
      padding: isMobile ? "0 16px" : "0 32px", display: "flex", alignItems: "center",
      justifyContent: "space-between", height: isMobile ? 72 : 92, gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer", minWidth: 0 }}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        <MailboxLogo height={isMobile ? 44 : 64} />
        <div style={{
          fontWeight: 900,
          // Mobile (<768px): fixed 22px, wraps to 2 lines if needed
          // Non-mobile: clamp from 22px→40px so landscape phones (~844px)
          // get ~30px and never need ellipsis; true desktop (≥1143px) gets 40px
          fontSize: isMobile ? 22 : "clamp(22px, 3.5vw, 40px)",
          color: "#111",
          fontFamily: "Georgia,serif",
          lineHeight: 1.15,
          // Allow wrapping at any viewport — on wide desktop the text fits
          // on one line naturally; on narrow/mobile it wraps to a 2nd line
          // instead of being truncated with "..."
          whiteSpace: "normal",
        }}>
          My Town Postcard
        </div>
      </div>

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
                      padding: "14px 8px", minHeight: 44,
                      borderRadius: 8,
                    }}>
                    {l.label}
                  </button>
                ))}
                <a href="/blog"
                  onClick={() => setMenuOpen(false)}
                  style={{
                    fontSize: 16, fontWeight: 600, color: "#374151",
                    fontFamily: "sans-serif", textDecoration: "none",
                    padding: "14px 8px", minHeight: 44, display: "block",
                    borderRadius: 8,
                  }}>
                  Blog
                </a>
                <a href="/dealers"
                  onClick={() => setMenuOpen(false)}
                  style={{
                    marginTop: 4, background: "#fff", color: RED,
                    border: `1.5px solid ${RED}`, borderRadius: 8,
                    padding: "12px 22px", fontSize: 14, fontWeight: 700,
                    cursor: "pointer", fontFamily: "sans-serif", minHeight: 44,
                    textAlign: "center", textDecoration: "none",
                  }}>
                  💼 Become a Dealer
                </a>
                <button onClick={() => handleNav("book")}
                  style={{
                    marginTop: 4, background: RED, color: "#fff", border: "none",
                    borderRadius: 8, padding: "14px 22px", fontSize: 15, fontWeight: 800,
                    cursor: "pointer", fontFamily: "sans-serif", minHeight: 44,
                  }}>
                  Save Your Spot →
                </button>
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
          <a href="/blog"
            style={{ fontSize: 14, fontWeight: 600, color: "#374151",
              fontFamily: "sans-serif", textDecoration: "none" }}>
            Blog
          </a>
          <a href="/dealers"
            style={{ fontSize: 14, fontWeight: 700, color: RED,
              fontFamily: "sans-serif", textDecoration: "none",
              padding: "9px 14px", borderRadius: 8, border: `1.5px solid ${RED}` }}>
            💼 Become a Dealer
          </a>
        </nav>
      )}
    </header>
  );
}

export function Hero({ copy = DEFAULT_COPY }: { copy?: LandingCopy }) {
  return (
    <section style={{ background: "#fff", padding: "72px 32px 80px", maxWidth: 1180, margin: "0 auto",
      display: "flex", alignItems: "center", gap: 64, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 420px", minWidth: 300 }}>
        {copy.heroCity ? (
          <>
            <h1 style={{ fontSize: "clamp(30px, 4vw, 48px)", fontWeight: 900, color: "#111",
              fontFamily: "Georgia,serif", lineHeight: 1.18, margin: "0 0 12px" }}>
              Advertise in{" "}
              <span style={{ color: RED }}>{copy.heroCity}</span>
            </h1>
            <p style={{ fontSize: 17, color: "#444", lineHeight: 1.6, margin: "0 0 8px", maxWidth: 460 }}>
              {copy.heroSubhead ?? "Reach 5,000 local households via USPS EDDM"}
            </p>
            {copy.heroContext && (
              <p style={{ fontSize: 13, color: "#9ca3af", margin: "0 0 24px", maxWidth: 460 }}>
                {copy.heroContext}
              </p>
            )}
          </>
        ) : (
          <>
            <h1 style={{ fontSize: "clamp(32px, 4vw, 50px)", fontWeight: 900, color: "#111",
              fontFamily: "Georgia,serif", lineHeight: 1.18, margin: "0 0 18px" }}>
              Save Your Spot on<br />
              <span style={{ color: RED }}>{copy.countyPossessive}</span> 9×12<br />
              Postcard
            </h1>
            <p style={{ fontSize: 17, color: "#444", lineHeight: 1.6, margin: "0 0 24px", maxWidth: 460 }}>
              Reaching <strong>5,000 {copy.heroCities} homes</strong> this {copy.heroSeason}.
              Will it feature you — or your competitor?
            </p>
          </>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", marginBottom: 32 }}>
          {[
            "No Competing Ads", "5,000 Local Homes",
            "Under 10¢ Per Home", "Spots Filling Now",
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
          <button onClick={() => scrollTo("book")}
            style={{ background: RED, color: "#fff", border: "none", borderRadius: 9,
              padding: "14px 32px", fontSize: 16, fontWeight: 800, cursor: "pointer",
              fontFamily: "sans-serif", boxShadow: `0 4px 18px ${RED}55` }}>
            Save Your Spot
          </button>
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
          alt="Sample 9×12 co-op postcard"
          style={{ width: "100%", maxWidth: 560, borderRadius: 12,
            boxShadow: "0 24px 60px rgba(0,0,0,0.18)", display: "block" }}
        />
        <div style={{
          position: "absolute", bottom: 24, left: -12,
          background: "#d4a017", color: "#fff",
          borderRadius: 10, padding: "14px 20px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)", fontFamily: "sans-serif",
        }}>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>9"×12"</div>
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>Impossible<br />to Miss</div>
        </div>
      </div>
    </section>
  );
}

export function HowItWorks({ copy = DEFAULT_COPY }: { copy?: LandingCopy }) {
  const steps = [
    { n: "1", icon: "🛡️", title: "Exclusive Categories",
      desc: "Only one business per category on each postcard. No direct competition on your ad." },
    { n: "2", icon: "🎨", title: "Done-for-You Design",
      desc: "Polished professional ad design that makes your business stand out." },
    { n: "3", icon: "✉️", title: "Printed & Mailed for You",
      desc: copy.howItWorksMailDesc },
    { n: "4", icon: "🎯", title: "Instant Local Reach",
      desc: "Your ad reaches 5,000 local homes — real customers, not clicks." },
  ];
  return (
    <section id="how-it-works" style={{ background: "#fff", padding: "80px 32px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", fontSize: 36, fontWeight: 900, color: "#111",
          fontFamily: "Georgia,serif", marginBottom: 10 }}>How It Works</h2>
        <p style={{ textAlign: "center", color: "#666", fontSize: 16, marginBottom: 56, maxWidth: 520, margin: "0 auto 56px" }}>
          Simple, cost-effective advertising that connects local businesses with their neighbors.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 32 }}>
          {steps.map(s => (
            <div key={s.n} style={{ textAlign: "center", padding: "28px 20px",
              border: "1px solid #f0f0f0", borderRadius: 16, background: "#fff",
              boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>{s.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: RED, marginBottom: 8, fontFamily: "sans-serif" }}>
                {s.n}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#111", marginBottom: 10, fontFamily: "Georgia,serif" }}>
                {s.title}
              </div>
              <div style={{ fontSize: 14, color: "#666", lineHeight: 1.6, fontFamily: "sans-serif" }}>
                {s.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function WhyChooseUs() {
  const bullets = [
    "No rifling through coupon packs — your business is on page one.",
    "No competitors crowding you out — one business per category, exclusive.",
    "No scrolling past your ad — every homeowner holds this postcard in their hands.",
    "No wasted ad spend on tire-kickers — calls come from homeowners who need you.",
  ];
  return (
    <section style={{ background: "#fafafa", padding: "80px 32px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex",
        alignItems: "center", gap: 64, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 360px" }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: "#111", fontFamily: "Georgia,serif",
            marginBottom: 24, lineHeight: 1.3 }}>
            Why Local Businesses<br />Choose My Town Postcard
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {bullets.map((b, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontFamily: "sans-serif" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: RED, marginTop: 7, flexShrink: 0 }} />
                <span style={{ fontSize: 15, color: "#333", lineHeight: 1.55 }}>{b}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: "1 1 360px" }}>
          <img
            src={`${import.meta.env.BASE_URL}postcard-hero-single.png`}
            alt="9×12 postcard sample"
            style={{ width: "100%", maxWidth: 520, borderRadius: 12,
              boxShadow: "0 16px 48px rgba(0,0,0,0.14)", display: "block" }}
          />
        </div>
      </div>
    </section>
  );
}

export function PostcardBook({ slug }: { slug?: string }) {
  return (
    <section id="book">
      <PostcardPickerSection slug={slug} />
    </section>
  );
}

export function Pricing() {
  const plans = [
    { label: "Small Ad",       price: 199, dim: '2"×2"', tag: "Affordable local reach",
      features: ["Your ad in 5,000 local homes", "No Competition", "Professional design"],
      highlight: false },
    { label: "Medium Ad",      price: 299, dim: '3"×2"', tag: "Growing reach, great value",
      features: ["Your ad in 5,000 local homes", "No Competition", "Professional design"],
      highlight: false },
    { label: "Large Ad",       price: 399, dim: '3"×4"', tag: "Great visibility, popular choice",
      features: ["Your ad in 5,000 local homes", "No Competition", "Professional design",
        "Prominent placement"],
      highlight: false },
    { label: "Extra-Large Ad", price: 499, dim: '4"×5"', tag: "Maximum impact, prime spot",
      features: ["Your ad in 5,000 local homes", "No Competition", "Professional design",
        "Largest ad space", "Top-of-postcard placement"],
      highlight: true },
  ];
  return (
    <section id="pricing" style={{ background: "#fff", padding: "80px 32px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", fontSize: 36, fontWeight: 900, color: "#111",
          fontFamily: "Georgia,serif", marginBottom: 10 }}>Pricing &amp; Availability</h2>
        <p style={{ textAlign: "center", color: "#666", fontSize: 16, marginBottom: 52, maxWidth: 480, margin: "0 auto 52px" }}>
          All spots include professional ad design and direct mailing to 5,000 homes.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {plans.map(p => (
            <div key={p.label} style={{
              border: p.highlight ? `2px solid ${RED}` : "1.5px solid #e5e7eb",
              borderRadius: 16, padding: "28px 20px",
              boxShadow: p.highlight ? `0 8px 32px ${RED}22` : "0 2px 10px rgba(0,0,0,0.05)",
              position: "relative", background: "#fff",
              display: "flex", flexDirection: "column",
            }}>
              {p.highlight && (
                <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
                  background: RED, color: "#fff", borderRadius: 20, padding: "4px 18px",
                  fontSize: 11.5, fontWeight: 800, letterSpacing: 0.5, fontFamily: "sans-serif",
                  whiteSpace: "nowrap" }}>
                  Most Popular
                </div>
              )}
              <div style={{ fontSize: 18, fontWeight: 800, color: "#111", marginBottom: 6,
                fontFamily: "sans-serif" }}>{p.label}</div>
              <div style={{ fontSize: 42, fontWeight: 900, color: RED, lineHeight: 1.1, marginBottom: 2,
                fontFamily: "sans-serif" }}>${p.price}</div>
              <div style={{ fontSize: 13, color: "#888", marginBottom: 8, fontFamily: "sans-serif" }}>
                {p.dim} ad space
              </div>
              <div style={{ fontSize: 14, color: "#555", marginBottom: 20, fontFamily: "sans-serif" }}>
                {p.tag}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                {p.features.map((f, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: "sans-serif" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%",
                      background: i === 1 ? RED : "#bbb", flexShrink: 0 }} />
                    <span style={{ fontSize: 13.5, color: i === 1 ? "#111" : "#555",
                      fontWeight: i === 1 ? 700 : 400 }}>{f}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => scrollTo("book")}
                style={{ width: "100%", padding: "12px 0", borderRadius: 9, marginTop: "auto",
                  background: p.highlight ? RED : "#fff",
                  color: p.highlight ? "#fff" : RED,
                  border: `2px solid ${RED}`,
                  fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "sans-serif" }}>
                Claim This Spot →
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Features({ copy = DEFAULT_COPY }: { copy?: LandingCopy }) {
  const items = [
    { icon: "🛡️", title: "Category Exclusive",
      desc: "Only one business per category is featured on each postcard. No direct competition on your ad." },
    { icon: "⏰", title: copy.mailingLabel,
      desc: copy.mailingDetail },
    { icon: "🎯", title: "Targeted Areas",
      desc: copy.targetedAreasDesc },
  ];
  return (
    <section style={{ background: "#fafafa", padding: "72px 32px" }}>
      <div style={{ maxWidth: 1060, margin: "0 auto", display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 28 }}>
        {items.map(it => (
          <div key={it.title} style={{ background: "#fff", borderRadius: 14, padding: "32px 24px",
            border: "1px solid #ececec", boxShadow: "0 2px 10px rgba(0,0,0,0.04)", textAlign: "center" }}>
            <div style={{ fontSize: 38, marginBottom: 14 }}>{it.icon}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#111", marginBottom: 10,
              fontFamily: "Georgia,serif" }}>{it.title}</div>
            <div style={{ fontSize: 14, color: "#666", lineHeight: 1.6, fontFamily: "sans-serif" }}>
              {it.desc}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CTABanner() {
  return (
    <section style={{ background: RED, padding: "60px 32px", textAlign: "center" }}>
      <h2 style={{ color: "#fff", fontSize: 32, fontWeight: 900, fontFamily: "Georgia,serif",
        margin: "0 0 20px" }}>Don't Miss Out.</h2>
      <button onClick={() => scrollTo("book")}
        style={{ background: "#fff", color: RED, border: "none", borderRadius: 9,
          padding: "14px 36px", fontSize: 16, fontWeight: 800, cursor: "pointer",
          fontFamily: "sans-serif", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
        Save Your Spot →
      </button>
    </section>
  );
}

export function FAQSection({ copy = DEFAULT_COPY }: { copy?: LandingCopy }) {
  const FAQ_ITEMS = [
    { q: "How do you pick which homes get the postcard?",
      a: copy.faqEddm },
    { q: "When will my ad hit mailboxes?",
      a: copy.faqMailboxes },
    { q: "How much does it cost?",
      a: "Spots range from $199 (Small, 2\"×2\") to $499 (Extra-Large, 4\"×5\"). All sizes include professional ad design and mailing to 5,000 homes." },
    { q: "Is my business good for this postcard?",
      a: copy.faqGoodFit },
    { q: "What happens if another business like mine is already on it?",
      a: "We guarantee exclusivity by category. If a competing business is already in your category, contact us and we'll get you queued up for the next card." },
    { q: "Do I have to design the ad myself?",
      a: "Not at all. Professional ad design is included with every spot. Provide your logo and photos OR let our Ad Generator create a masterpiece for you!" },
    { q: "How big will my ad be on the postcard?",
      a: "Extra-Large ads are 4\"×5\", Large ads are 3\"×4\", Medium ads are 3\"×2\", and Small ads are 2\"×2\". On the 9\"×12\" postcard, every ad is clearly visible and impactful." },
  ];
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section id="faq" style={{ background: "#fff", padding: "80px 32px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", fontSize: 36, fontWeight: 900, color: "#111",
          fontFamily: "Georgia,serif", marginBottom: 10 }}>FAQ</h2>
        <p style={{ textAlign: "center", color: "#666", fontSize: 15, marginBottom: 44,
          fontFamily: "sans-serif" }}>Common questions from our local business neighbors.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} style={{ borderBottom: "1px solid #e5e7eb" }}>
              <button onClick={() => setOpen(open === i ? null : i)}
                style={{ width: "100%", textAlign: "left", padding: "18px 0",
                  background: "none", border: "none", cursor: "pointer",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#111", fontFamily: "sans-serif",
                  lineHeight: 1.4 }}>{item.q}</span>
                <span style={{ fontSize: 20, color: "#999", flexShrink: 0, transform: open === i ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s" }}>⌄</span>
              </button>
              {open === i && (
                <div style={{ padding: "0 0 18px", fontSize: 14.5, color: "#555", lineHeight: 1.7,
                  fontFamily: "sans-serif" }}>{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ReserveForm() {
  const [form, setForm] = useState({ first: "", last: "", biz: "", email: "", phone: "" });
  const [sent, setSent] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch(`${import.meta.env.BASE_URL}api/leads`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } catch {}
    setSent(true);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: 8,
    border: "1.5px solid #d1d5db", fontSize: 14, fontFamily: "sans-serif",
    outline: "none", boxSizing: "border-box", color: "#111",
  };

  return (
    <section style={{ background: "#f9f9f9", padding: "80px 32px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ background: "#fff", borderRadius: 16,
          padding: "36px 32px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          {sent ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
              <h3 style={{ fontSize: 22, fontWeight: 800, color: "#111", fontFamily: "Georgia,serif", marginBottom: 10 }}>
                We'll be in touch!
              </h3>
              <p style={{ color: "#666", fontSize: 15, fontFamily: "sans-serif" }}>
                Thanks for your interest. We'll reach out within 1 business day to confirm your spot.
              </p>
            </div>
          ) : (
            <>
              <div style={{
                fontSize: 32, fontWeight: 900, color: "#7B1418",
                fontFamily: "Georgia,serif", marginBottom: 6, lineHeight: 1.15,
              }}>
                Got Questions?
              </div>
              <p style={{ color: "#666", fontSize: 14, marginBottom: 24, fontFamily: "sans-serif" }}>
                Enter your info below and we'll guide you through next steps.
              </p>
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151",
                      display: "block", marginBottom: 4, fontFamily: "sans-serif" }}>First Name *</label>
                    <input style={inputStyle} required value={form.first} onChange={set("first")} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151",
                      display: "block", marginBottom: 4, fontFamily: "sans-serif" }}>Last Name *</label>
                    <input style={inputStyle} required value={form.last} onChange={set("last")} />
                  </div>
                </div>
                {[["biz", "Business Name *", true], ["email", "Email Address *", true],
                  ["phone", "Phone Number *", true]].map(([k, lbl, req]) => (
                  <div key={k as string}>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: "#374151",
                      display: "block", marginBottom: 4, fontFamily: "sans-serif" }}>{lbl as string}</label>
                    <input style={inputStyle} type={k === "email" ? "email" : "text"}
                      required={!!req} value={(form as any)[k as string]} onChange={set(k as string)} />
                  </div>
                ))}
                <button type="submit"
                  style={{ marginTop: 8, background: RED, color: "#fff", border: "none",
                    borderRadius: 9, padding: "14px 0", fontSize: 15, fontWeight: 800,
                    cursor: "pointer", fontFamily: "sans-serif" }}>
                  ✈ Save Your Spot
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function Footer({ copy = DEFAULT_COPY }: { copy?: LandingCopy }) {
  return (
    <footer style={{ background: "#fff", padding: "48px 32px 32px", borderTop: "1px solid #7B1418" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto",
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 40, alignItems: "start" }}>
        <div style={{ marginTop: -16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <img src="/mailbox-logo.png" alt="My Town Postcard" height={56} style={{ height: 56, width: "auto" }} />
            <div style={{ fontWeight: 900, fontSize: 18, color: "#111", fontFamily: "Georgia,serif", lineHeight: 1.2 }}>
              My Town Postcard
            </div>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "#555", fontFamily: "sans-serif", margin: 0, paddingLeft: 68, maxWidth: 300 }}>
            Helping local businesses connect with their neighbors through cost-effective postcard marketing.
          </p>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700, color: "#111", fontSize: 14, marginBottom: 14,
            fontFamily: "sans-serif" }}>Quick Links</div>
          {["How It Works", "Pricing & Availability", "FAQ"].map(l => (
            <div key={l} style={{ marginBottom: 8 }}>
              <a href="#" onClick={e => { e.preventDefault(); scrollTo(l === "How It Works" ? "how-it-works" : l === "FAQ" ? "faq" : "pricing"); }}
                style={{ fontSize: 13, color: "#555", textDecoration: "none", fontFamily: "sans-serif" }}>
                {l}
              </a>
            </div>
          ))}
          <div style={{ marginBottom: 8 }}>
            <a href="/blog"
              style={{ fontSize: 13, color: "#555", textDecoration: "none", fontFamily: "sans-serif" }}>
              Blog
            </a>
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 700, color: "#111", fontSize: 14, marginBottom: 14,
            fontFamily: "sans-serif" }}>Contact</div>
          <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, fontFamily: "sans-serif" }}>
            Serving {copy.citiesListAmp}.<br />
            Questions? Email us at info@mytownpostcard.com
          </p>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "32px auto 0", borderTop: "1px solid #7B1418",
        paddingTop: 20, textAlign: "center" }}>
        <span style={{ fontSize: 12, color: "#9ca3af", fontFamily: "sans-serif" }}>
          © 2025 My Town Postcard · mytownpostcard.com · Clarkesville, GA
        </span>
      </div>
    </footer>
  );
}
