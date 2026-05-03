import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { DashboardLayout } from "@/components/layout";
import NotFound from "@/pages/not-found";

import Landing from "@/pages/landing";
import { AuthPage } from "@/pages/auth";
import Onboarding from "@/pages/onboarding";
import DashboardHome from "@/pages/dashboard/home";
import NewTour from "@/pages/dashboard/new-tour";
import MyTours from "@/pages/dashboard/my-tours";
import Analytics from "@/pages/dashboard/analytics";
import Settings from "@/pages/dashboard/settings";
import Billing from "@/pages/dashboard/billing";
import TourViewer from "@/pages/tour-viewer";

const queryClient = new QueryClient();

function PublicRoute({ component: Component }: { component: any }) {
  return <Component />;
}

function ProtectedRoute({ component: Component }: { component: any }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Redirect to="/login" />;
  return <DashboardLayout><Component /></DashboardLayout>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <PublicRoute component={Landing} />} />
      <Route path="/login" component={() => <PublicRoute component={() => <AuthPage mode="login" />} />} />
      <Route path="/signup" component={() => <PublicRoute component={() => <AuthPage mode="signup" />} />} />
      <Route path="/onboarding" component={() => <PublicRoute component={Onboarding} />} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={DashboardHome} />} />
      <Route path="/dashboard/new-tour" component={() => <ProtectedRoute component={NewTour} />} />
      <Route path="/dashboard/tours" component={() => <ProtectedRoute component={MyTours} />} />
      <Route path="/dashboard/analytics" component={() => <ProtectedRoute component={Analytics} />} />
      <Route path="/dashboard/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/dashboard/billing" component={() => <ProtectedRoute component={Billing} />} />
      <Route path="/tour/:shareToken" component={() => <PublicRoute component={TourViewer} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;