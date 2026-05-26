import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getOnboardingStatus } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { DashboardLayout } from "@/components/layout";
import NotFound from "@/pages/not-found";
import { useEffect, useRef } from "react";

import Landing from "@/pages/landing";
import { AuthPage } from "@/pages/auth";
import Onboarding from "@/pages/onboarding";
import DashboardHome from "@/pages/dashboard/home";
import NewTour from "@/pages/dashboard/new-tour";
import MyTours from "@/pages/dashboard/my-tours";
import Analytics from "@/pages/dashboard/analytics";
import Settings from "@/pages/dashboard/settings";
import Billing from "@/pages/dashboard/billing";
import BillingSuccess from "@/pages/dashboard/billing-success";
import ListingImport from "@/pages/dashboard/listing-import";
import TourViewer from "@/pages/tour-viewer";
import TestPanoramaPage from "@/pages/test-panorama";
import { hasPendingTour } from "@/hooks/use-pending-tour";

const queryClient = new QueryClient();

function PostLoginRouter() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const handled = useRef(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated || handled.current) return;
    if (!hasPendingTour()) return;

    handled.current = true;

    getOnboardingStatus()
      .then((data: { completed?: boolean }) => {
        if (!data.completed) {
          setLocation("/onboarding");
        } else {
          setLocation("/dashboard/new-tour");
        }
      })
      .catch(() => {
        setLocation("/dashboard/new-tour");
      });
  }, [isAuthenticated, isLoading, setLocation]);

  return null;
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  return <Component />;
}

function AuthLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-widest text-muted-foreground">
        <span className="w-2 h-2 bg-primary animate-pulse" />
        Loading…
      </div>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <AuthLoading />;
  if (!isAuthenticated) return <Redirect to="/login" />;
  return (
    <DashboardLayout>
      <Component />
    </DashboardLayout>
  );
}

function Router() {
  return (
    <>
      <PostLoginRouter />
      <Switch>
        <Route path="/" component={() => <PublicRoute component={Landing} />} />
        <Route path="/login" component={() => <PublicRoute component={() => <AuthPage mode="login" />} />} />
        <Route path="/signup" component={() => <PublicRoute component={() => <AuthPage mode="signup" />} />} />
        <Route path="/onboarding" component={() => <PublicRoute component={Onboarding} />} />
        <Route path="/dashboard" component={() => <ProtectedRoute component={DashboardHome} />} />
        <Route path="/dashboard/new-tour" component={() => <ProtectedRoute component={NewTour} />} />
        <Route path="/dashboard/import" component={() => <ProtectedRoute component={ListingImport} />} />
        <Route path="/dashboard/tours" component={() => <ProtectedRoute component={MyTours} />} />
        <Route path="/dashboard/analytics" component={() => <ProtectedRoute component={Analytics} />} />
        <Route path="/dashboard/billing" component={() => <ProtectedRoute component={Billing} />} />
        <Route path="/dashboard/billing/success" component={() => <ProtectedRoute component={BillingSuccess} />} />
        <Route path="/dashboard/settings" component={() => <ProtectedRoute component={Settings} />} />
        <Route path="/tour/:shareToken" component={() => <PublicRoute component={TourViewer} />} />
        <Route path="/test-panorama" component={() => <PublicRoute component={TestPanoramaPage} />} />
        <Route component={NotFound} />
      </Switch>
    </>
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
