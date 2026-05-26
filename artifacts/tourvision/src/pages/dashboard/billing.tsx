import { useGetUserLimits } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PricingPlans } from "@/components/billing/PricingPlans";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function Billing() {
  const { data: limits, isLoading } = useGetUserLimits();

  if (isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-[520px] w-full rounded-2xl" />
      </div>
    );
  }

  const tier = limits?.tier ?? "free";

  return (
    <div className="relative p-6 max-w-7xl mx-auto w-full space-y-8">
      <div className="rounded-3xl border border-zinc-200 bg-white/90 backdrop-blur p-6 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Billing
        </p>
        <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight text-zinc-900">
          Plans & pricing
        </h1>
        <p className="text-zinc-500 mt-2 text-sm max-w-2xl">
          Start free with one room. Unlock the full house for{" "}
          <strong className="text-zinc-800">$29</strong> per tour when you&apos;re
          ready. Subscriptions are coming after Stripe is connected.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full border border-zinc-200 bg-[#faf9f5] px-3 py-1">
            Current: <strong className="capitalize">{tier}</strong>
          </span>
          <span className="rounded-full border border-zinc-200 bg-[#faf9f5] px-3 py-1">
            Tours: {limits?.toursThisMonth ?? 0} / {limits?.toursLimit ?? 1} used
          </span>
        </div>
      </div>

      <PricingPlans currentTier={tier} variant="dashboard" />

      <div className="rounded-2xl border border-zinc-200 bg-[#faf9f5] p-5 text-sm text-zinc-600 space-y-3">
        <p className="font-medium text-zinc-900">How billing works today</p>
        <ol className="list-decimal list-inside space-y-1.5">
          <li>Create a tour — we classify your photos and generate one free 360° room.</li>
          <li>Remaining rooms stay locked until you unlock the full house ($29).</li>
          <li>Free tours can be viewed for 24 hours; unlock removes that limit.</li>
        </ol>
        <Link href="/dashboard/new-tour">
          <Button className="mt-2 font-bold">
            Create a tour <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
