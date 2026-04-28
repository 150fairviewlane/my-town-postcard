import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import PostcardSpotPicker from "./PostcardSpotPicker";
import CheckoutPage from "./pages/CheckoutPage";
import UploadAdPage from "./pages/UploadAdPage";
import ConfirmationPage from "./pages/ConfirmationPage";
import AdminDashboard from "./pages/AdminDashboard";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={PostcardSpotPicker} />
      <Route path="/checkout/:spotId" component={CheckoutPage} />
      <Route path="/upload/:spotId" component={UploadAdPage} />
      <Route path="/confirmation" component={ConfirmationPage} />
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
