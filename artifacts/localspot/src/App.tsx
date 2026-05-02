import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LandingPage from "./pages/LandingPage";
import CheckoutPage from "./pages/CheckoutPage";
import UploadAdPage from "./pages/UploadAdPage";
import ConfirmationPage from "./pages/ConfirmationPage";
import AdminDashboard from "./pages/AdminDashboard";
import AdminPrintPage from "./pages/AdminPrintPage";
import OutreachPage from "./pages/OutreachPage";
import ScanAnalyticsPage from "./pages/ScanAnalyticsPage";

const queryClient = new QueryClient();

function Router() {
  return (
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
