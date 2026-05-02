import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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

function Router() {
  return (
    <Suspense fallback={null}>
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
