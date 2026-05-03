import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SiGoogle } from "react-icons/si";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      if (mode === 'login') {
        login();
      } else {
        setLocation("/onboarding");
      }
    }, 1000);
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Panel */}
      <div className="hidden lg:flex w-[60%] relative overflow-hidden bg-card border-r border-border items-center justify-center p-12">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,255,136,0.1)_0%,transparent_70%)]" />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 w-full max-w-lg aspect-square rounded-2xl border border-border bg-background shadow-2xl overflow-hidden flex items-center justify-center"
        >
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
          
          <motion.div animate={{ rotateY: 360 }} transition={{ repeat: Infinity, duration: 20, ease: "linear" }} className="w-64 h-64 border border-primary/30 rounded-full flex items-center justify-center relative">
            <div className="w-48 h-48 border border-primary/50 rounded-full flex items-center justify-center">
               <div className="w-32 h-32 bg-primary/20 rounded-full blur-xl animate-pulse" />
            </div>
            {/* Feature callouts */}
            <div className="absolute -top-4 right-0 bg-background border border-border px-3 py-1 rounded-md text-xs font-mono text-primary shadow-lg whitespace-nowrap">Marble 3D Mesh</div>
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
          <p className="text-muted-foreground mb-8">
            {mode === 'login' ? 'Enter your details to access your tours.' : 'Create an account to generate your first 3D tour.'}
          </p>

          <Button variant="outline" className="w-full h-12 font-medium mb-6 bg-white text-black hover:bg-gray-100 hover:text-black">
            <SiGoogle className="mr-2 w-4 h-4" /> Continue with Google
          </Button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground font-mono">or continue with email</span></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" required placeholder="Jane Doe" className="h-12" />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required placeholder="jane@example.com" className="h-12" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="password">Password</Label>
                {mode === 'login' && <a href="#" className="text-xs text-primary hover:underline font-mono">Forgot password?</a>}
              </div>
              <Input id="password" type="password" required className="h-12" />
            </div>

            {mode === 'signup' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm Password</Label>
                  <Input id="confirm" type="password" required className="h-12" />
                </div>
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox id="terms" required />
                  <Label htmlFor="terms" className="text-xs text-muted-foreground font-normal leading-tight">
                    I agree to the <a href="#" className="text-primary hover:underline">Terms of Service</a> and <a href="#" className="text-primary hover:underline">Privacy Policy</a>.
                  </Label>
                </div>
              </>
            )}

            <Button type="submit" className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 glow-primary font-bold mt-4" disabled={isLoading}>
              {isLoading ? "Please wait..." : (mode === 'login' ? 'Sign In →' : 'Create Account →')}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>Don't have an account? <Link href="/signup" className="text-primary hover:underline font-bold">Start free →</Link></>
            ) : (
              <>Already have an account? <Link href="/login" className="text-primary hover:underline font-bold">Sign in</Link></>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}