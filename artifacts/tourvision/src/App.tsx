import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import TourViewer from "@/pages/tour-viewer";
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

    fetch("/api/user/onboarding-status", { credentials: "include" })
      .then((r) => r.json())
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

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
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
        <Route path="/dashboard/tours" component={() => <ProtectedRoute component={MyTours} />} />
        <Route path="/dashboard/analytics" component={() => <ProtectedRoute component={Analytics} />} />
        <Route path="/dashboard/settings" component={() => <ProtectedRoute component={Settings} />} />
        <Route path="/dashboard/billing" component={() => <ProtectedRoute component={Billing} />} />
        <Route path="/tour/:shareToken" component={() => <PublicRoute component={TourViewer} />} />
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
