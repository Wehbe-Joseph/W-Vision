import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { useLocation } from "wouter";

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { login, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, isLoading, setLocation]);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Panel */}
      <div className="hidden lg:flex w-[60%] relative overflow-hidden bg-card border-r border-border items-center justify-center p-12">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(26,23,20,0.06)_0%,transparent_70%)]" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 w-full max-w-lg aspect-square rounded-2xl border border-border bg-muted shadow-2xl overflow-hidden flex items-center justify-center"
        >
          <div className="absolute inset-0 bg-[linear-gradient(rgba(26,23,20,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(26,23,20,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
          <motion.div animate={{ rotateY: 360 }} transition={{ repeat: Infinity, duration: 20, ease: "linear" }} className="w-64 h-64 border border-primary/30 rounded-full flex items-center justify-center relative">
            <div className="w-48 h-48 border border-primary/50 rounded-full flex items-center justify-center">
              <div className="w-32 h-32 bg-primary/20 rounded-full blur-xl animate-pulse" />
            </div>
            <div className="absolute -top-4 right-0 bg-background border border-border px-3 py-1 rounded-md text-xs font-mono text-primary shadow-lg whitespace-nowrap">3D World Mesh</div>
            <div className="absolute bottom-4 -left-12 bg-background border border-border px-3 py-1 rounded-md text-xs font-mono text-primary shadow-lg whitespace-nowrap">AI Confidence: 94%</div>
          </motion.div>
        </motion.div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-[40%] flex items-center justify-center p-8 sm:p-12 relative z-10">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-12">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="font-serif font-bold text-xl tracking-tight">TourVision</span>
          </div>

          <h1 className="text-3xl font-serif font-bold mb-2">
            {mode === 'login' ? 'Welcome back.' : 'Start for free.'}
          </h1>
          <p className="text-muted-foreground mb-10">
            {mode === 'login'
              ? 'Sign in to access your tours and analytics.'
              : 'Create your account to generate your first 3D tour.'}
          </p>

          <button
            onClick={login}
            disabled={isLoading}
            className="w-full h-12 bg-primary text-primary-foreground rounded-md font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : (mode === 'login' ? 'Sign In →' : 'Create Account →')}
          </button>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>Don't have an account?{' '}
                <button onClick={login} className="text-primary hover:underline font-bold bg-transparent border-none cursor-pointer p-0">
                  Start free →
                </button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button onClick={login} className="text-primary hover:underline font-bold bg-transparent border-none cursor-pointer p-0">
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
