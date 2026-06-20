import { useEffect } from "react";
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
