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

// The generic My Town Postcard home page — entry point for all of Georgia.
// Renders with DEFAULT_COPY (fully generic, no county/city names) so any
// visitor lands on a page that speaks to them regardless of where they're from.
// Individual territory pages (/{slug}) use the same sections with city-specific
// copy passed via the `copy` prop. PostcardBook is NOT rendered here — visitors
// haven't chosen a territory yet, so the map replaces the picker.
export default function LandingPage() {
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
