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
} from "../landingSections";
// @ts-expect-error JSX module without types
import GeorgiaTerritoryMap from "../components/GeorgiaTerritoryMap";

// The generic My Town Postcard home page — entry point for all of Georgia.
// Renders with DEFAULT_COPY (fully generic, no county/city names) so any
// visitor lands on a page that speaks to them regardless of where they're from.
// Individual territory pages (/{slug}) use the same sections with city-specific
// copy passed via the `copy` prop.
export default function LandingPage() {
  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      <NavBar />
      <Hero />
      <GeorgiaTerritoryMap />
      <HowItWorks />
      <WhyChooseUs />
      <PostcardBook />
      <Pricing />
      <Features />
      <CTABanner />
      <FAQSection />
      <ReserveForm />
      <Footer />
    </div>
  );
}
