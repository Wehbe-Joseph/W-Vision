import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Chrome, Lock, Mail, MailCheck, UserRound } from "lucide-react";
import WVisionLogo from "@/components/WVisionLogo";

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const {
    loginWithGoogle,
    loginWithEmail,
    signupWithEmail,
    isAuthenticated,
    isLoading,
  } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setError(decodeURIComponent(err.replace(/\+/g, " ")));
    }
  }, []);

  // The auth provider drives navigation: as soon as a session exists we
  // route to the dashboard. Doing this exclusively from a useEffect avoids
  // a race where setLocation fires before isAuthenticated has flipped, which
  // would bounce the user back to /login through ProtectedRoute.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, isLoading, setLocation]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        await loginWithEmail(email, password);
        // The useEffect above will navigate once isAuthenticated flips.
      } else {
        const result = await signupWithEmail(
          email,
          password,
          fullName.trim() || undefined,
        );
        if (result.needsEmailConfirmation) {
          setEmailSent(true);
        }
        // If email confirmation is disabled, onAuthStateChange will fire
        // with a session and the useEffect will navigate to /dashboard.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogle();
      // The browser is redirected to Google; nothing to do here.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex w-[58%] relative overflow-hidden bg-card border-r-2 border-foreground items-center justify-center p-12">
        <div className="absolute inset-0 bg-grid opacity-50" />
        <motion.div
          initial={{ opacity: 0, y: 24, rotateX: -8 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 0.7 }}
          className="relative z-10 w-full max-w-md border-2 border-foreground shadow-[10px_10px_0px_0px_#1A1714] bg-background [transform-style:preserve-3d]"
        >
          <div className="flex items-center gap-2 px-4 py-2.5 border-b-2 border-foreground bg-foreground">
            <span className="w-2.5 h-2.5 bg-primary" />
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-background">
              3D Tour Preview
            </span>
          </div>

          <div className="p-8 aspect-square flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-grid opacity-30" />
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
              <motion.div
                animate={{
                  y: [0, -7, 0],
                  rotateY: [0, 18, -18, 0],
                  rotateX: [0, 7, -7, 0],
                }}
                transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
                className="relative w-40 h-40 border-2 border-foreground bg-card flex items-center justify-center [transform-style:preserve-3d]"
              >
                {[
                  { top: "-8px", left: "-8px", delay: 0 },
                  { top: "-8px", right: "-8px", delay: 0.35 },
                  { bottom: "-8px", left: "-8px", delay: 0.7 },
                  { bottom: "-8px", right: "-8px", delay: 1.05 },
                ].map((dot, i) => (
                  <motion.span
                    key={i}
                    className="absolute w-3 h-3 rounded-full bg-primary"
                    style={dot}
                    animate={{ scale: [1, 1.65, 1], opacity: [0.45, 1, 0.45] }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.8,
                      ease: "easeInOut",
                      delay: dot.delay,
                    }}
                  />
                ))}
                <WVisionLogo className="w-20 h-20 object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.15)]" />
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="w-full lg:w-[42%] flex items-center justify-center p-8 sm:p-14 relative z-10">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-14">
            <span className="w-2.5 h-2.5 bg-primary" />
            <span className="font-serif text-xl tracking-tight">WVISION</span>
          </div>

          {emailSent ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="space-y-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 bg-[#00C853]" />
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">
                  Check your inbox
                </span>
              </div>
              <h1 className="text-4xl font-serif leading-none">
                CONFIRM
                <br />
                YOUR EMAIL.
              </h1>
              <div className="border-2 border-foreground bg-card p-5 flex items-start gap-3 shadow-[4px_4px_0px_0px_#1A1714]">
                <MailCheck className="w-5 h-5 text-[#00C853] shrink-0 mt-0.5" />
                <div className="text-sm leading-relaxed">
                  We just sent a verification link to{" "}
                  <span className="font-mono font-bold">{email}</span>. Click
                  the link to activate your account, then come back here to
                  sign in.
                </div>
              </div>
              <button
                onClick={() => {
                  setEmailSent(false);
                  setLocation("/login");
                }}
                className="w-full h-11 border-2 border-foreground bg-card text-foreground text-sm font-bold uppercase tracking-wide shadow-[4px_4px_0px_0px_#1A1714] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all"
              >
                Go to sign in →
              </button>
            </motion.div>
          ) : (
            <>
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 bg-[#00C853]" />
                  <span className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">
                    {mode === "login" ? "Sign In" : "Get Started"}
                  </span>
                </div>
                <h1 className="text-5xl font-serif leading-none">
                  {mode === "login" ? (
                    <>
                      WELCOME
                      <br />
                      BACK.
                    </>
                  ) : (
                    <>
                      START
                      <br />
                      FOR FREE.
                    </>
                  )}
                </h1>
                <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
                  {mode === "login"
                    ? "Sign in to access your tours and analytics."
                    : "Create your account to generate your first 3D tour."}
                </p>
              </div>

              <motion.form
                initial={{ opacity: 0, y: 16, rotateX: -7 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                transition={{ duration: 0.45 }}
                onSubmit={handleEmailSubmit}
                className="space-y-3 [perspective:1400px]"
              >
                {mode === "signup" && (
                  <div className="relative">
                    <UserRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Full name"
                      className="h-11 w-full border-2 border-foreground bg-card pl-9 pr-3 text-sm font-mono outline-none"
                    />
                  </div>
                )}
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="h-11 w-full border-2 border-foreground bg-card pl-9 pr-3 text-sm font-mono outline-none"
                  />
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="h-11 w-full border-2 border-foreground bg-card pl-9 pr-3 text-sm font-mono outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || submitting}
                  className="w-full h-12 bg-primary text-white border-2 border-foreground text-sm font-bold uppercase tracking-wide shadow-[4px_4px_0px_0px_#1A1714] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting
                    ? "Working..."
                    : mode === "login"
                      ? "Sign In with Email →"
                      : "Create Account →"}
                </button>
              </motion.form>

              <div className="flex items-center gap-2 my-4">
                <div className="h-px bg-foreground/20 flex-1" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  or
                </span>
                <div className="h-px bg-foreground/20 flex-1" />
              </div>

              <motion.button
                whileHover={{ rotateX: 6, rotateY: -4, y: -2 }}
                transition={{ type: "spring", stiffness: 220, damping: 16 }}
                onClick={handleGoogle}
                disabled={isLoading || submitting}
                className="w-full h-11 border-2 border-foreground bg-card text-foreground text-sm font-bold uppercase tracking-wide shadow-[4px_4px_0px_0px_#1A1714] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Chrome className="w-4 h-4" />
                Continue with Google
              </motion.button>

              {error && (
                <p className="mt-3 text-xs font-mono text-red-600">{error}</p>
              )}

              <p className="mt-8 text-sm text-muted-foreground">
                {mode === "login" ? (
                  <>
                    Don&apos;t have an account?{" "}
                    <button
                      onClick={() => setLocation("/signup")}
                      className="text-primary hover:underline font-bold bg-transparent border-none cursor-pointer p-0 uppercase text-xs tracking-wide"
                    >
                      Start free →
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      onClick={() => setLocation("/login")}
                      className="text-primary hover:underline font-bold bg-transparent border-none cursor-pointer p-0 uppercase text-xs tracking-wide"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
