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
      {/* Left Panel — editorial illustration */}
      <div className="hidden lg:flex w-[58%] relative overflow-hidden bg-card border-r-2 border-foreground items-center justify-center p-12">
        <div className="absolute inset-0 bg-grid opacity-50" />

        {/* OS-window style card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 w-full max-w-md border-2 border-foreground shadow-[10px_10px_0px_0px_#1A1714] bg-background"
        >
          {/* Window title bar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b-2 border-foreground bg-foreground">
            <span className="w-2.5 h-2.5 bg-primary" />
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-background">3D Tour Preview</span>
          </div>

          {/* Content */}
          <div className="p-8 aspect-square flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-grid opacity-30" />

            {/* Animated ring graphic */}
            <div className="relative z-10 flex items-center justify-center w-full h-full">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 30, ease: "linear" }}
                className="absolute w-64 h-64 border-2 border-foreground/20"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
                className="absolute w-44 h-44 border-2 border-dashed border-primary/40"
              />
              <div className="w-28 h-28 border-2 border-foreground bg-card flex items-center justify-center">
                <span className="text-4xl font-serif">3D</span>
              </div>

              {/* Floating labels */}
              <div className="absolute top-4 right-4 bg-background border-2 border-foreground px-3 py-1 shadow-[3px_3px_0px_0px_#1A1714]">
                <span className="text-xs font-mono font-bold">3D WORLD MESH</span>
              </div>
              <div className="absolute bottom-8 left-2 bg-[#00C853] border-2 border-foreground px-3 py-1 shadow-[3px_3px_0px_0px_#1A1714]">
                <span className="text-xs font-mono font-bold text-white">AI CONFIDENCE: 94%</span>
              </div>
              <div className="absolute bottom-20 right-2 bg-primary border-2 border-foreground px-3 py-1 shadow-[3px_3px_0px_0px_#1A1714]">
                <span className="text-xs font-mono font-bold text-white">READY IN 3 MIN</span>
              </div>
            </div>
          </div>

          {/* Stats bar */}
          <div className="border-t-2 border-foreground grid grid-cols-3 divide-x-2 divide-foreground">
            {[
              { val: "3 min", label: "Speed" },
              { val: "94%", label: "Accuracy" },
              { val: "10×", label: "Engagement" },
            ].map(({ val, label }) => (
              <div key={label} className="px-4 py-3 text-center">
                <div className="text-xl font-serif">{val}</div>
                <div className="text-xs text-muted-foreground font-mono uppercase">{label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Bottom label */}
        <div className="absolute bottom-8 left-12 flex items-center gap-2">
          <span className="w-2 h-2 bg-primary" />
          <span className="text-xs font-mono font-bold uppercase tracking-widest">Spatial AI Engine</span>
        </div>
      </div>

      {/* Right Panel — sign in form */}
      <div className="w-full lg:w-[42%] flex items-center justify-center p-8 sm:p-14 relative z-10">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-14">
            <span className="w-2.5 h-2.5 bg-primary" />
            <span className="font-serif text-xl tracking-tight">WVISION</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 bg-[#00C853]" />
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">
                {mode === 'login' ? 'Sign In' : 'Get Started'}
              </span>
            </div>
            <h1 className="text-5xl font-serif leading-none">
              {mode === 'login' ? (
                <>WELCOME<br />BACK.</>
              ) : (
                <>START<br />FOR FREE.</>
              )}
            </h1>
            <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
              {mode === 'login'
                ? 'Sign in to access your tours and analytics.'
                : 'Create your account to generate your first 3D tour.'}
            </p>
          </div>

          {/* CTA */}
          <button
            onClick={login}
            disabled={isLoading}
            className="w-full h-12 bg-primary text-white border-2 border-foreground text-sm font-bold uppercase tracking-wide shadow-[4px_4px_0px_0px_#1A1714] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Loading...' : (mode === 'login' ? 'Sign In →' : 'Create Account →')}
          </button>

          <p className="mt-8 text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>Don't have an account?{' '}
                <button onClick={login} className="text-primary hover:underline font-bold bg-transparent border-none cursor-pointer p-0 uppercase text-xs tracking-wide">
                  Start free →
                </button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button onClick={login} className="text-primary hover:underline font-bold bg-transparent border-none cursor-pointer p-0 uppercase text-xs tracking-wide">
                  Sign in
                </button>
              </>
            )}
          </p>

          {/* Trust badges */}
          <div className="mt-12 pt-8 border-t-2 border-foreground/20 grid grid-cols-3 gap-4">
            {[
              { val: "Free", label: "No CC needed" },
              { val: "< 3m", label: "Processing" },
              { val: "100%", label: "Shareable" },
            ].map(({ val, label }) => (
              <div key={label} className="text-center">
                <div className="text-lg font-serif">{val}</div>
                <div className="text-xs text-muted-foreground font-mono uppercase">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
