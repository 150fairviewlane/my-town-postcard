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

// The flagship Habersham County home page. It renders the shared landing
// sections with their default copy, so it stays identical to the original
// hand-written page while territory/dealer pages reuse the same sections
// with their own copy. Loads the single active campaign (no slug).
export default function LandingPage() {
  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      <NavBar />
      <Hero />
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
