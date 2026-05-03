import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
// @ts-expect-error JSX module without types
import ErrorBoundary from "./components/ErrorBoundary";
// LandingPage stays eagerly imported because it is the first paint for the
// vast majority of visits — code-splitting it would just add a Suspense
// flash to the home page. Every other route is lazy so a cold load doesn't
// have to transform the admin/checkout/upload code before showing the home
// page or the ad picker.
import LandingPage from "./pages/LandingPage";

const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const UploadAdPage = lazy(() => import("./pages/UploadAdPage"));
const ConfirmationPage = lazy(() => import("./pages/ConfirmationPage"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminPrintPage = lazy(() => import("./pages/AdminPrintPage"));
const OutreachPage = lazy(() => import("./pages/OutreachPage"));
const ScanAnalyticsPage = lazy(() => import("./pages/ScanAnalyticsPage"));

const queryClient = new QueryClient();

// Visible Suspense fallback so a slow lazy chunk fetch on the Replit dev
// preview (especially over a tablet/phone connection) feels like loading
// rather than a broken page.
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
        {/* More-specific admin routes must come before /admin so wouter's Switch
            matches them first. */}
        <Route path="/admin/campaign/:id/print" component={AdminPrintPage} />
        <Route path="/admin/outreach" component={OutreachPage} />
        <Route path="/admin/scans" component={ScanAnalyticsPage} />
        <Route path="/admin" component={AdminDashboard} />
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
