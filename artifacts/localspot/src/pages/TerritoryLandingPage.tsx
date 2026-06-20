import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useGetCampaignBySlug } from "@workspace/api-client-react";
import {
  NavBar,
  Hero,
  HowItWorks,
  WhyChooseUs,
  PostcardBook,
  Pricing,
  Features,
  CTABanner,
  FAQSection,
  ReserveForm,
  Footer,
  DEFAULT_COPY,
  type LandingCopy,
} from "../landingSections";

// ─── Haversine distance (km) between two lat/lng pairs ───────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── "Wrong town?" wayfinding banner ─────────────────────────────────────────
// Slim strip below the NavBar showing the 5 nearest other published territories
// as clickable pills. Dismissible for the browser session via sessionStorage.
const SESSION_KEY = "localspot:wrongtown:dismissed";
const MAX_VISIBLE = 5;

interface TerritoryPill {
  slug: string;
  label: string;
  lat?: number;
  lng?: number;
}

function WrongTownBanner({
  currentSlug,
  currentLat,
  currentLng,
}: {
  currentSlug: string;
  currentLat: number | null;
  currentLng: number | null;
}) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch { return false; }
  });
  const [territories, setTerritories] = useState<TerritoryPill[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    fetch("/api/campaigns/public-territories")
      .then(r => r.ok ? r.json() : null)
      .then((data: { territories: TerritoryPill[] } | null) => {
        if (!data?.territories) return;
        let others = data.territories.filter(t => t.slug !== currentSlug);
        if (currentLat != null && currentLng != null) {
          others = [...others].sort((a, b) => {
            const aDist = a.lat != null && a.lng != null
              ? haversineKm(currentLat, currentLng, a.lat, a.lng) : Infinity;
            const bDist = b.lat != null && b.lng != null
              ? haversineKm(currentLat, currentLng, b.lat, b.lng) : Infinity;
            return aDist - bDist;
          });
        }
        setTerritories(others);
      })
      .catch(() => {});
  }, [dismissed, currentSlug, currentLat, currentLng]);

  if (dismissed || territories.length === 0) return null;

  const visible = showAll ? territories : territories.slice(0, MAX_VISIBLE);
  const hiddenCount = territories.length - MAX_VISIBLE;

  function dismiss() {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch {}
    setDismissed(true);
  }

  return (
    <div style={{
      background: "#fdf8f3",
      borderLeft: "3px solid #C9A84C",
      padding: "8px 16px",
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      flexWrap: "wrap",
      fontFamily: "'DM Sans', sans-serif",
      fontSize: 13,
      color: "#555",
      lineHeight: "1.5",
    }}>
      <span style={{ whiteSpace: "nowrap", fontWeight: 500, alignSelf: "center" }}>
        Looking for a different town?
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: 1, alignItems: "center" }}>
        {visible.map(t => (
          <Link
            key={t.slug}
            href={`/${t.slug}`}
            style={{
              display: "inline-block",
              padding: "2px 10px",
              border: "1.5px solid #C9A84C",
              borderRadius: 9999,
              background: "#fdf8f3",
              color: "#7B1418",
              fontWeight: 600,
              fontSize: 12,
              textDecoration: "none",
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
              (e.currentTarget as HTMLAnchorElement).style.background = "#7B1418";
              (e.currentTarget as HTMLAnchorElement).style.color = "#fff";
            }}
            onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
              (e.currentTarget as HTMLAnchorElement).style.background = "#fdf8f3";
              (e.currentTarget as HTMLAnchorElement).style.color = "#7B1418";
            }}
          >
            {t.label}
          </Link>
        ))}
        {!showAll && hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(true)}
            style={{
              background: "none", border: "none", padding: "2px 4px",
              color: "#C9A84C", fontWeight: 600, fontSize: 12,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            +{hiddenCount} more
          </button>
        )}
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: "none", border: "none", padding: "0 2px",
          color: "#aaa", fontSize: 16, cursor: "pointer",
          lineHeight: 1, alignSelf: "center", flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

// Joins a comma-separated city list with an Oxford-style "and"/"&" tail so
// "Clarkesville, Cornelia, Demorest" reads naturally in body copy.
function joinCities(list: string, conjunction: "and" | "&"): string {
  const cities = list.split(",").map(c => c.trim()).filter(Boolean);
  if (cities.length === 0) return "";
  if (cities.length === 1) return cities[0];
  return `${cities.slice(0, -1).join(", ")} ${conjunction} ${cities[cities.length - 1]}`;
}

function buildCopy(campaign: any): LandingCopy {
  // Territory name: prefer the campaign's territory label, else its name.
  const territory: string = (campaign?.territory || campaign?.name || "").trim();
  const cityListRaw: string = (campaign?.cityList || "").trim();
  const season: string = (campaign?.mailingSeason || "").trim();
  const month: string = (campaign?.mailingMonth || "").trim();

  // If the campaign carries no territory copy at all, fall back wholesale to the
  // generic default copy so the page still reads cleanly.
  if (!territory && !cityListRaw && !season && !month) {
    return { ...DEFAULT_COPY };
  }

  // Detect single-city campaigns (one hub city per mailing zone).
  // When cityList is exactly one city, it IS the mailing zone identity —
  // use it as the primary location label everywhere so /cherokee-canton says
  // "Canton" instead of "Cherokee" throughout the page.
  const cityCount = cityListRaw.split(",").map(c => c.trim()).filter(Boolean).length;
  const hubCity = cityCount === 1 ? cityListRaw.trim() : null;

  // place = hub city for single-zone pages; territory name for multi-city or
  // territory-only campaigns; "your area" as a safe fallback.
  const place = hubCity || territory || "your area";

  // City lists for body copy. When the campaign has no cityList, fall back to
  // place so sentences stay grammatical: "Reaching 5,000 <place> homes."
  const citiesOxford = cityListRaw ? joinCities(cityListRaw, "and") : place;
  const citiesAmp = cityListRaw ? joinCities(cityListRaw, "&") : place;
  // Oxford-comma variant for the EDDM FAQ sentence ("A, B, and C"). Only applies
  // to 3+ cities — a 2-city list ("A and B") must NOT gain a comma.
  const citiesOxfordComma =
    cityCount > 2 && citiesOxford.includes(" and ")
      ? citiesOxford.replace(/ and ([^,]*)$/, ", and $1")
      : citiesOxford;
  const mailingLabel = season ? `${season} Mailing` : DEFAULT_COPY.mailingLabel;
  const mailingWhen = month ? ` — targeted for ${month}` : "";

  // For single-city zones, name both the hub city and the parent territory in
  // the EDDM FAQ answer so the geographic context is clear.
  const faqEddmSentence = hubCity && territory
    ? `We use USPS Every Door Direct Mail (EDDM) to target specific ${hubCity} postal routes within ${territory} County — reaching 5,000 households right in your neighborhood.`
    : `We use USPS Every Door Direct Mail (EDDM) to target specific ${place} postal routes — reaching 5,000 households across ${citiesOxfordComma}.`;

  return {
    // Single-city zone: "Canton's". Multi-city territory: apply Counties→County's.
    countyPossessive: hubCity
      ? `${hubCity}'s`
      : territory
        ? `${territory.replace(/\bCounties\b$/, "County")}'s`
        : DEFAULT_COPY.countyPossessive,
    heroCities: citiesOxford,
    heroSeason: season || DEFAULT_COPY.heroSeason,
    howItWorksMailDesc: `5,000 postcards printed and delivered to ${place} homes via USPS.`,
    mailingLabel,
    mailingDetail: `Timed to reach 5,000 ${place} homes during peak local shopping season${mailingWhen}.`,
    targetedAreasDesc: `We focus on specific ${place} neighborhoods where your customers already live.`,
    faqEddm: faqEddmSentence,
    faqMailboxes: `The ${mailingLabel.toLowerCase()}${month ? ` is targeted for ${month}` : " is timed for peak local shopping season"}. Once all spots are filled, your ad is designed, printed, and mailed.`,
    faqGoodFit: `Any local business that serves ${place} residents is a great fit — restaurants, home services, medical, legal, retail, and more.`,
    citiesListAmp: citiesAmp,
  };
}

// Derives the primary location label for a campaign — hub city for single-zone
// pages, territory name for multi-city pages, empty string if unknown.
function derivePlaceName(campaign: any): string {
  const territory: string = (campaign?.territory || campaign?.name || "").trim();
  const cityListRaw: string = (campaign?.cityList || "").trim();
  const cityCount = cityListRaw.split(",").map((c: string) => c.trim()).filter(Boolean).length;
  const hubCity = cityCount === 1 ? cityListRaw.trim() : null;
  return hubCity || territory || "";
}

// A published per-territory / per-dealer landing page served at a root slug
// (e.g. /white-habersham). Reuses every shared landing section and the live
// postcard picker, but feeds them copy derived from the slug's campaign and
// points the picker at that campaign via the `slug` prop.
export default function TerritoryLandingPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const { data: campaign, isLoading, isError } = useGetCampaignBySlug(slug, {
    query: {
      enabled: !!slug,
      retry: false,
      queryKey: ["/api/campaigns/by-slug", slug],
    },
  });

  // Set page <title>, <meta name="description">, and Open Graph tags once
  // campaign data is ready. Restore defaults on unmount so navigating back to
  // the home page isn't affected.
  useEffect(() => {
    if (!campaign) return;
    const place = derivePlaceName(campaign);
    if (!place) return;

    const ogTitle = `${place} Postcard Advertising | My Town Postcard`;
    const ogDescription = `Reach 5,000 ${place} homes with a 9×12 co-op postcard. Reserve your spot today.`;
    const ogImageUrl = `${window.location.origin}/opengraph.jpg`;

    // --- <title> ---
    const prevTitle = document.title;
    document.title = ogTitle;

    // Upsert a <meta name="…"> tag; returns the previous content (or null if new).
    function upsertNameMeta(name: string, content: string): string | null {
      let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      const prev = el?.getAttribute("content") ?? null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
      return prev;
    }

    // Upsert a <meta property="…"> tag; returns the previous content (or null if new).
    function upsertPropertyMeta(property: string, content: string): string | null {
      let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
      const prev = el?.getAttribute("content") ?? null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
      return prev;
    }

    // --- <meta name="description"> ---
    const prevDesc = upsertNameMeta("description", ogDescription);

    // --- Open Graph tags ---
    // Capture previous values so we can restore the home page's static tags on unmount.
    const prevOgTitle       = upsertPropertyMeta("og:title", ogTitle);
    const prevOgDescription = upsertPropertyMeta("og:description", ogDescription);
    const prevOgImage       = upsertPropertyMeta("og:image", ogImageUrl);
    const prevOgUrl         = upsertPropertyMeta("og:url", window.location.href);
    const prevOgType        = upsertPropertyMeta("og:type", "website");

    return () => {
      document.title = prevTitle;

      // Restore or remove <meta name="description">
      const descEl = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (descEl) {
        if (prevDesc !== null) {
          descEl.setAttribute("content", prevDesc);
        } else {
          descEl.remove();
        }
      }

      // Restore each OG tag to its previous value, or remove it if we created it.
      const ogRestores: [string, string | null][] = [
        ["og:title", prevOgTitle],
        ["og:description", prevOgDescription],
        ["og:image", prevOgImage],
        ["og:url", prevOgUrl],
        ["og:type", prevOgType],
      ];
      for (const [property, prev] of ogRestores) {
        const el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
        if (!el) continue;
        if (prev !== null) {
          el.setAttribute("content", prev);
        } else {
          el.remove();
        }
      }
    };
  }, [campaign]);

  // Scroll to the ad picker (#book) when the URL contains a hash and the page is fully rendered.
  useEffect(() => {
    if (isLoading || isError || !campaign) return;
    const hash = window.location.hash;
    if (hash) {
      const id = hash.replace("#", "");
      const el = document.getElementById(id);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      }
    }
  }, [isLoading, isError, campaign]);

  if (isLoading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "sans-serif", color: "#374151",
      }}>
        Loading…
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column", gap: 12,
        alignItems: "center", justifyContent: "center", fontFamily: "sans-serif",
        color: "#374151", padding: 24, textAlign: "center",
      }}>
        <div style={{ fontSize: 48 }}>📭</div>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", fontFamily: "Georgia,serif", margin: 0 }}>
          Page not found
        </h1>
        <p style={{ fontSize: 15, color: "#666", maxWidth: 420 }}>
          There's no published postcard for this address. Visit the{" "}
          <a href="/" style={{ color: "#7B1418", fontWeight: 700 }}>home page</a> to find an active campaign.
        </p>
      </div>
    );
  }

  const copy = buildCopy(campaign);

  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      <NavBar />
      <WrongTownBanner
        currentSlug={slug}
        currentLat={(campaign as any)?.latitude ?? null}
        currentLng={(campaign as any)?.longitude ?? null}
      />
      <Hero copy={copy} />
      <HowItWorks copy={copy} />
      <WhyChooseUs />
      <PostcardBook slug={slug} />
      <Pricing />
      <Features copy={copy} />
      <CTABanner />
      <FAQSection copy={copy} />
      <ReserveForm />
      <Footer copy={copy} />
    </div>
  );
}
