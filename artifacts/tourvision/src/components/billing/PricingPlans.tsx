import { CheckCircle2, Home, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export type PricingPlanId = "free" | "full_house" | "pro";

export type PricingPlansProps = {
  /** Highlight the user's current tier when known */
  currentTier?: string;
  /** Called when user picks Free / Get started */
  onGetStarted?: () => void;
  /** Compact layout for dashboard billing page */
  variant?: "landing" | "dashboard";
  className?: string;
};

const FREE_FEATURES = [
  "1 property tour",
  "1 room 360° preview",
  "Shareable link for 24 hours",
  "AI room classification",
];

const FULL_HOUSE_FEATURES = [
  "Unlock after your free preview",
  "Every room as a 360° panorama",
  "Remove the 24-hour viewing limit",
  "One-time payment per tour",
];

const PRO_FEATURES = [
  "Multiple tours per month",
  "Full house on every tour",
  "Priority generation",
  "No per-tour unlock fee",
];

export function PricingPlans({
  currentTier = "free",
  onGetStarted,
  variant = "landing",
  className,
}: PricingPlansProps) {
  const isDashboard = variant === "dashboard";
  const paid = currentTier === "pro" || currentTier === "unlimited";

  return (
    <div
      className={cn(
        "grid gap-6",
        isDashboard ? "md:grid-cols-3" : "lg:grid-cols-3",
        className,
      )}
    >
      {/* Free */}
      <div
        className={cn(
          "flex flex-col border-2 border-foreground bg-card shadow-[6px_6px_0px_0px_#1A1714]",
          currentTier === "free" && !paid && "ring-2 ring-primary ring-offset-2",
        )}
      >
        <div className="px-4 py-2 border-b-2 border-foreground bg-muted/50">
          <span className="text-xs font-mono font-bold uppercase tracking-widest">
            Free
          </span>
        </div>
        <div className="p-6 flex flex-col flex-1 gap-4">
          <div>
            <div className="text-5xl font-serif">$0</div>
            <p className="text-sm text-muted-foreground mt-2">
              Try W-Vision with one room — perfect to see the quality before you
              pay.
            </p>
          </div>
          <ul className="space-y-2 flex-1">
            {FREE_FEATURES.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 text-primary mt-0.5" />
                {f}
              </li>
            ))}
          </ul>
          {onGetStarted ? (
            <Button className="w-full font-bold" onClick={onGetStarted}>
              Get started free
            </Button>
          ) : isDashboard && currentTier === "free" && !paid ? (
            <Button className="w-full font-bold" disabled variant="secondary">
              Current plan
            </Button>
          ) : (
            <Link href="/signup">
              <Button className="w-full font-bold">Get started free</Button>
            </Link>
          )}
        </div>
      </div>

      {/* $29 full house — hero plan */}
      <div
        className={cn(
          "flex flex-col border-2 border-primary bg-card shadow-[8px_8px_0px_0px_#1A1714] relative",
          "lg:-mt-2 lg:mb-2",
        )}
      >
        <div className="absolute -top-3 left-4 px-3 py-0.5 bg-primary text-primary-foreground text-[10px] font-mono font-bold uppercase tracking-widest">
          Most popular
        </div>
        <div className="px-4 py-2 border-b-2 border-primary bg-primary/10">
          <span className="text-xs font-mono font-bold uppercase tracking-widest flex items-center gap-2">
            <Home className="w-3.5 h-3.5" />
            Full house
          </span>
        </div>
        <div className="p-6 flex flex-col flex-1 gap-4">
          <div>
            <div className="text-5xl font-serif">$29</div>
            <p className="text-sm text-muted-foreground mt-2">
              One-time per tour. Generate every room and keep the tour live
              without the free countdown.
            </p>
          </div>
          <ul className="space-y-2 flex-1">
            {FULL_HOUSE_FEATURES.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <Sparkles className="w-4 h-4 shrink-0 text-primary mt-0.5" />
                {f}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground font-mono leading-relaxed">
            <Lock className="w-3 h-3 inline mr-1" />
            Available from your tour after the free room finishes. Card checkout
            (Stripe) is next — you&apos;ll see the unlock button on your tour.
          </p>
          <Link href="/dashboard/new-tour">
            <Button variant="outline" className="w-full font-bold border-primary">
              Create a tour
            </Button>
          </Link>
        </div>
      </div>

      {/* Pro — coming soon */}
      <div
        className={cn(
          "flex flex-col border-2 border-foreground bg-card shadow-[6px_6px_0px_0px_#1A1714] opacity-90",
          paid && "ring-2 ring-primary ring-offset-2",
        )}
      >
        <div className="px-4 py-2 border-b-2 border-foreground bg-foreground text-background">
          <span className="text-xs font-mono font-bold uppercase tracking-widest">
            Pro — coming soon
          </span>
        </div>
        <div className="p-6 flex flex-col flex-1 gap-4">
          <div>
            <div className="text-5xl font-serif text-muted-foreground">Soon</div>
            <p className="text-sm text-muted-foreground mt-2">
              Monthly plans for agents who publish many listings. Stripe
              subscriptions will launch after the $29 tour unlock.
            </p>
          </div>
          <ul className="space-y-2 flex-1">
            {PRO_FEATURES.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
                {f}
              </li>
            ))}
          </ul>
          <Button className="w-full" disabled variant="secondary">
            {paid ? "Current plan (beta)" : "Notify me at launch"}
          </Button>
        </div>
      </div>
    </div>
  );
}
