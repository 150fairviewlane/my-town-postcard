import { useSearch } from "wouter";
import {
  NavBar,
  Hero,
  HowItWorks,
  WhyChooseUs,
  Pricing,
  Features,
  CTABanner,
  FAQSection,
  ReserveForm,
  Footer,
} from "../landingSections";
// @ts-expect-error JSX module without types
import GeorgiaTerritoryMap from "../components/GeorgiaTerritoryMap";
// @ts-expect-error JSX module without types
import PostcardPicker from "../PostcardPickerSection";

// The generic My Town Postcard home page — entry point for all of Georgia.
// Renders with DEFAULT_COPY (fully generic, no county/city names) so any
// visitor lands on a page that speaks to them regardless of where they're from.
// Individual territory pages (/{slug}) use the same sections with city-specific
// copy passed via the `copy` prop. PostcardBook is NOT rendered here — visitors
// haven't chosen a territory yet, so the map replaces the picker.
//
// Exception: when ?claim=<businessId> is in the URL (outreach fast-lane CTA),
// we render the picker + ClaimSection directly so the business lands in the
// purchase flow rather than the marketing page.
export default function LandingPage() {
  const search = useSearch();
  const claimId = new URLSearchParams(search).get("claim");

  // Fast-lane: business clicked "I Love My Ad" from the outreach email.
  // Render the picker with the ClaimSection instead of the marketing page.
  if (claimId) {
    return (
      <div style={{ background: "#fff", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <NavBar />
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <PostcardPicker />
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      <NavBar />
      <Hero />
      <HowItWorks />
      <WhyChooseUs />
      <GeorgiaTerritoryMap />
      <Pricing />
      <Features />
      <CTABanner />
      <FAQSection />
      <ReserveForm />
      <Footer />
    </div>
  );
}
