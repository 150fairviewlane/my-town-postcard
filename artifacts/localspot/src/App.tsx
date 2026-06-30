import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
// @ts-expect-error JSX module without types
import ErrorBoundary from "./components/ErrorBoundary";
import LandingPage from "./pages/LandingPage";
// @ts-expect-error JSX module without types
import CheckoutPage from "./pages/CheckoutPage";

// @ts-expect-error JSX module without types
const UploadAdPage = lazy(() => import("./pages/UploadAdPage"));
// @ts-expect-error JSX module without types
const ConfirmationPage = lazy(() => import("./pages/ConfirmationPage"));
// @ts-expect-error JSX module without types
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
// @ts-expect-error JSX module without types
const AdminPrintPage = lazy(() => import("./pages/AdminPrintPage"));
// @ts-expect-error JSX module without types
const OutreachPage = lazy(() => import("./pages/OutreachPage"));
// @ts-expect-error JSX module without types
const ScanAnalyticsPage = lazy(() => import("./pages/ScanAnalyticsPage"));
// @ts-expect-error JSX module without types
const TestAdPage = lazy(() => import("./pages/TestAdPage"));
// @ts-expect-error JSX module without types
const DealerLanding = lazy(() => import("./pages/DealerLanding"));
// @ts-expect-error JSX module without types
const DealerSignup = lazy(() => import("./pages/DealerSignup"));
// @ts-expect-error JSX module without types
const DealerConfirmation = lazy(() => import("./pages/DealerConfirmation"));
// @ts-expect-error JSX module without types
const DealerPortal = lazy(() => import("./pages/DealerPortal"));
// @ts-expect-error JSX module without types
const DealerLogin = lazy(() => import("./pages/DealerLogin"));
// @ts-expect-error JSX module without types
const DealerForgotPassword = lazy(() => import("./pages/DealerForgotPassword"));
// @ts-expect-error JSX module without types
const DealerResetPassword = lazy(() => import("./pages/DealerResetPassword"));
// @ts-expect-error JSX module without types
const DealerDashboard = lazy(() => import("./pages/DealerDashboard"));
// @ts-expect-error JSX module without types
const AdminDealersPage = lazy(() => import("./pages/AdminDealersPage"));
// @ts-expect-error JSX module without types
const AdminDealerDetailPage = lazy(() => import("./pages/AdminDealerDetailPage"));
// @ts-expect-error JSX module without types
const AdminAITestPage = lazy(() => import("./pages/AdminAITestPage"));
// @ts-expect-error JSX module without types
const AdGenV7Page = lazy(() => import("./pages/AdGenV7Page"));
// @ts-expect-error JSX module without types
const RequestOptionsPage = lazy(() => import("./pages/RequestOptionsPage"));
// @ts-expect-error JSX module without types
const SubscriptionConfirmationPage = lazy(() => import("./pages/SubscriptionConfirmationPage"));
// @ts-expect-error JSX module without types
const AdminSubscriptionsPage = lazy(() => import("./pages/AdminSubscriptionsPage"));
// @ts-expect-error JSX module without types
const SpotConfirmationPage = lazy(() => import("./pages/SpotConfirmationPage"));
const TerritoryLandingPage = lazy(() => import("./pages/TerritoryLandingPage"));

// ── Advertiser blog pages ─────────────────────────────────────────────────────
const BlogIndexPage = lazy(() => import("./pages/BlogIndexPage"));
const BlogArticlePage = lazy(() => import("./pages/BlogArticlePage"));

// ── Dealer guide ──────────────────────────────────────────────────────────────
// @ts-expect-error JSX module without types
const DealerGuide = lazy(() => import("./pages/DealerGuide"));

// ── Dealer blog pages ─────────────────────────────────────────────────────────
const DealerBlogIndexPage = lazy(() => import("./pages/DealerBlogIndexPage"));
const DealerBlogArticlePage = lazy(() => import("./pages/DealerBlogArticlePage"));

// ── Admin tools ───────────────────────────────────────────────────────────────
// @ts-expect-error JSX module without types
const AdminImageGenPage = lazy(() => import("./pages/AdminImageGenPage"));
// @ts-expect-error JSX module without types
const AdminTemplateViewerPage = lazy(() => import("./pages/AdminTemplateViewerPage"));
// @ts-expect-error JSX module without types
const AdminCreateCustomTerritoryPage = lazy(() => import("./pages/AdminCreateCustomTerritoryPage"));
// @ts-expect-error JSX module without types
const DiscoverLeadsPage = lazy(() => import("./pages/DiscoverLeadsPage"));
// @ts-expect-error JSX module without types
const AdminOverviewPage = lazy(() => import("./pages/AdminOverviewPage"));
// @ts-expect-error JSX module without types
const AdminTerritoriesPage = lazy(() => import("./pages/AdminTerritoriesPage"));
// @ts-expect-error JSX module without types
const AdminPaidCustomersPage = lazy(() => import("./pages/AdminPaidCustomersPage"));

import NotFound from "./pages/not-found";

// Top-level frontend route prefixes that must NEVER be shadowed by a
// territory slug. The /:slug catch-all is registered last, but wouter's
// Switch matches the first hit, so these explicit routes already win — this
// list is the guard for the catch-all's own handler (and documents intent).
// NOTE: "blog" and "dealers" are included so that /blog, /blog/:slug,
// /dealers/blog, and /dealers/blog/:slug are never intercepted by the
// territory landing page catch-all.
const RESERVED_SLUGS = new Set([
  "blog",
  "checkout", "upload", "confirmation", "admin", "subscription-confirmation",
  "spot-confirmation", "ad-gen", "request-options", "dealers", "dealer", "find-territory",
  "my-territory", "test", "go", "api",
]);

const queryClient = new QueryClient();

function RouteLoading() {
  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex", alignItems: "center",
      justifyContent: "center", background: "#fff", zIndex: 9999,
      flexDirection: "column", gap: 16, fontFamily: "sans-serif", color: "#374151",
    }}>
      <div style={{
        width: 36, height: 36, border: "3px solid #e5e7eb",
        borderTopColor: "#7B1418", borderRadius: "50%",
        animation: "lsspin 0.8s linear infinite",
      }} />
      <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.3 }}>Loading…</div>
      <style>{`@keyframes lsspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/checkout/:spotId" component={CheckoutPage} />
        <Route path="/upload/:spotId" component={UploadAdPage} />
        <Route path="/confirmation/:spotId" component={ConfirmationPage} />

        {/* ── Blog routes — must appear before the /:slug catch-all ─────────
            /blog          → article index
            /blog/:slug    → individual article (e.g. /blog/eddm-vs-digital)
        ─────────────────────────────────────────────────────────────────── */}
        <Route path="/blog" component={BlogIndexPage} />
        <Route path="/blog/:slug">
          {(params) => <BlogArticlePage params={params} />}
        </Route>

        {/* Admin routes — more-specific paths before /admin */}
        <Route path="/admin/territories/detail" component={AdminDashboard} />
        <Route path="/admin/territories/custom" component={AdminCreateCustomTerritoryPage} />
        <Route path="/admin/territories" component={AdminTerritoriesPage} />
        <Route path="/admin/templates" component={AdminTemplateViewerPage} />
        <Route path="/admin/image-gen" component={AdminImageGenPage} />
        <Route path="/admin/campaign/:id/print" component={AdminPrintPage} />
        <Route path="/admin/discover" component={DiscoverLeadsPage} />
        <Route path="/admin/outreach" component={OutreachPage} />
        <Route path="/admin/scans" component={ScanAnalyticsPage} />
        <Route path="/admin/dealers/:id" component={AdminDealerDetailPage} />
        <Route path="/admin/dealers" component={AdminDealersPage} />
        <Route path="/admin/subscriptions" component={AdminSubscriptionsPage} />
        <Route path="/admin/paid-customers" component={AdminPaidCustomersPage} />
        <Route path="/admin/campaign/:id">
          {(params: { id: string }) => {
            window.location.replace(`/admin/territories/detail?id=${params.id}`);
            return null;
          }}
        </Route>
        <Route path="/admin/ai-test" component={AdminAITestPage} />
        <Route path="/admin" component={AdminOverviewPage} />

        <Route path="/subscription-confirmation" component={SubscriptionConfirmationPage} />
        <Route path="/spot-confirmation" component={SpotConfirmationPage} />
        <Route path="/ad-gen" component={AdGenV7Page} />
        <Route path="/request-options" component={RequestOptionsPage} />

        {/* Dealer program routes */}
        <Route path="/dealers" component={DealerLanding} />
        <Route path="/dealers/signup" component={DealerSignup} />
        <Route path="/dealers/confirmation" component={DealerConfirmation} />
        <Route path="/dealers/guide" component={DealerGuide} />
        <Route path="/my-territory">
          {() => {
            window.location.replace("/dealer/dashboard");
            return null;
          }}
        </Route>

        {/* Dealer auth + dashboard routes */}
        <Route path="/dealer/login" component={DealerLogin} />
        <Route path="/dealer/forgot-password" component={DealerForgotPassword} />
        <Route path="/dealer/reset-password" component={DealerResetPassword} />
        <Route path="/dealer/dashboard" component={DealerDashboard} />

        {/* ── Dealer blog routes — nested under /dealers, before catch-all ──
            /dealers/blog          → dealer article index
            /dealers/blog/:slug    → individual dealer article
        ─────────────────────────────────────────────────────────────────── */}
        <Route path="/dealers/blog" component={DealerBlogIndexPage} />
        <Route path="/dealers/blog/:slug">
          {(params) => <DealerBlogArticlePage params={params} />}
        </Route>

        {import.meta.env.DEV && <Route path="/test/ad" component={TestAdPage} />}

        {/* Catch-all territory/dealer landing pages — MUST be last */}
        <Route path="/:slug">
          {(params) =>
            RESERVED_SLUGS.has(params.slug)
              ? <NotFound />
              : <TerritoryLandingPage params={params} />
          }
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
