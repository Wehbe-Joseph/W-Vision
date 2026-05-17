import {
  useGetUserLimits,
  useSubscribeNewsletter,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Sparkles, Rocket, CalendarClock, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

export default function Billing() {
  const { data: limits, isLoading } = useGetUserLimits();
  const subscribe = useSubscribeNewsletter();
  const qc = useQueryClient();
  const { toast } = useToast();

  const upgrade = async (tier: "pro" | "unlimited") => {
    try {
      const result = await subscribe.mutateAsync({
        // The generated client types this as a "newsletter" body, but our
        // backend uses it as the subscription endpoint. Cast and pass tier.
        data: { tier } as unknown as { email: string },
      });
      toast({ title: "Plan updated", description: (result as { message?: string }).message ?? `Upgraded to ${tier}` });
      qc.invalidateQueries();
    } catch {
      toast({ title: "Could not upgrade plan", variant: "destructive" });
    }
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-[520px] w-full rounded-2xl" /></div>;

  return (
    <div className="relative p-6 max-w-7xl mx-auto w-full space-y-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-16 -right-16 h-72 w-72 rounded-full bg-gradient-to-br from-rose-200/35 to-transparent blur-3xl" />
      </div>

      <div className="relative rounded-3xl border border-zinc-200 bg-white/90 backdrop-blur p-6 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)]">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-[#f5f4ef] px-3 py-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
            Billing
          </span>
        </div>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-zinc-900">
          Upgrade Your Account
        </h1>
        <p className="text-zinc-500 mt-1 text-sm">
          Choose your billing cycle and unlock premium tours.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 [perspective:1000px]">
        <motion.div
          whileHover={{ y: -5, rotateX: 2, rotateY: -2 }}
          transition={{ type: "spring", stiffness: 240, damping: 18 }}
          className="lg:col-span-1"
        >
          <Card className="bg-white border-zinc-200 rounded-2xl shadow-[0_14px_28px_-18px_rgba(0,0,0,0.5)] h-full">
            <CardHeader>
              <CardTitle className="text-lg font-serif inline-flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-zinc-500" />
                Current Plan
              </CardTitle>
              <CardDescription>
                Your active billing status.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-zinc-200 bg-[#faf9f5] px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Tier</p>
                <p className="text-2xl font-semibold text-zinc-900 capitalize">{limits?.tier || "free"}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-[#faf9f5] px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Usage</p>
                <p className="text-sm text-zinc-700">
                  {limits?.toursThisMonth ?? 0} / {limits?.toursLimit ?? 0} tours used
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-[#faf9f5] px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Renewal</p>
                <p className="text-sm text-zinc-700">
                  {limits?.renewalDate
                    ? new Date(limits.renewalDate).toLocaleDateString()
                    : "Not scheduled"}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          whileHover={{ y: -5, rotateX: 2, rotateY: 2 }}
          transition={{ type: "spring", stiffness: 240, damping: 18 }}
          className="lg:col-span-2"
        >
          <Card className="bg-white border-zinc-200 rounded-2xl shadow-[0_14px_28px_-18px_rgba(0,0,0,0.5)] overflow-hidden">
            <div className="h-2 w-full bg-gradient-to-r from-rose-400 via-amber-300 to-emerald-400" />
            <CardHeader>
              <CardTitle className="text-2xl font-serif inline-flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-zinc-600" />
                Founding Launch Offer
              </CardTitle>
              <CardDescription>
                Early access pricing during beta launch.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-zinc-200 bg-[#faf9f5] p-5">
                <div className="text-4xl font-serif text-zinc-900">$59</div>
                <p className="text-sm text-zinc-500 mt-1">
                  Upfront activation
                </p>
                <p className="text-sm text-zinc-500">
                  First month free, then <span className="font-semibold text-zinc-900">$13/month</span>
                </p>
                <Button
                  className="w-full mt-4 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800"
                  disabled={subscribe.isPending || limits?.tier === "pro"}
                  onClick={() => upgrade("pro")}
                >
                  <Rocket className="w-4 h-4 mr-2" />
                  {limits?.tier === "pro" ? "Current Plan" : "Upgrade Monthly"}
                </Button>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-[#faf9f5] p-5">
                <div className="text-4xl font-serif text-zinc-900">$100</div>
                <p className="text-sm text-zinc-500 mt-1">
                  Yearly billing
                </p>
                <p className="text-sm text-zinc-500">
                  Best value annual access
                </p>
                <Button
                  variant="outline"
                  className="w-full mt-4 rounded-xl border-zinc-300"
                  disabled={subscribe.isPending || limits?.tier === "unlimited"}
                  onClick={() => upgrade("unlimited")}
                >
                  <CalendarClock className="w-4 h-4 mr-2" />
                  {limits?.tier === "unlimited" ? "Current Plan" : "Upgrade Yearly"}
                </Button>
              </div>
            </CardContent>
            <CardFooter className="border-t border-zinc-200 flex-col items-start gap-2">
              {[
                "Full property immersive walkthrough",
                "All rooms",
                "Hosted shareable tour",
                "Room navigation",
                "Premium property page",
              ].map((item) => (
                <div key={item} className="inline-flex items-center gap-2 text-sm text-zinc-600">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  {item}
                </div>
              ))}
            </CardFooter>
          </Card>
        </motion.div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-500">
        Billing actions update your subscription in real time. Refresh may take a few seconds after provider confirmation.
      </div>
    </div>
  );
}