import { useGetTourStats, useGetRecentTours } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useLocation } from "wouter";
import {
  ArrowUpRight,
  Copy,
  Eye,
  Home,
  LayoutGrid,
  Link2,
  Plus,
  Timer,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { motion } from "framer-motion";

export default function DashboardHome() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const authReady = isAuthenticated && !authLoading;
  const { data: stats, isLoading: statsLoading } = useGetTourStats({
    query: { enabled: authReady },
  });
  const { data: recentToursData, isLoading: toursLoading } = useGetRecentTours({
    query: { enabled: authReady },
  });
  const [url, setUrl] = useState("");

  const handleQuickGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (url) setLocation(`/dashboard/new-tour?url=${encodeURIComponent(url)}`);
  };

  const statCards = [
    {
      label: "Tours Built",
      value: stats?.totalToursAllTime || 0,
      icon: LayoutGrid,
      accent: "from-emerald-400/30 to-emerald-100/0",
      loading: statsLoading,
    },
    {
      label: "Avg Processing",
      value: stats?.avgProcessingMinutes ? `${stats.avgProcessingMinutes}m` : "0m",
      icon: Timer,
      accent: "from-amber-400/30 to-amber-100/0",
      loading: statsLoading,
    },
    {
      label: "Tour Views",
      value: stats?.totalViewsThisMonth || 0,
      icon: Eye,
      accent: "from-rose-400/30 to-rose-100/0",
      loading: statsLoading,
    },
    {
      label: "This Month",
      value: stats?.toursThisMonth || 0,
      icon: Home,
      accent: "from-zinc-500/25 to-zinc-100/0",
      loading: statsLoading,
    },
  ];

  return (
    <div className="relative p-6 max-w-7xl mx-auto w-full space-y-7">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-gradient-to-br from-rose-200/40 to-transparent blur-3xl" />
        <div className="absolute top-40 -left-24 h-72 w-72 rounded-full bg-gradient-to-br from-emerald-200/35 to-transparent blur-3xl" />
      </div>

      {/* Page header */}
      <div className="relative rounded-3xl border border-zinc-200 bg-white/90 backdrop-blur p-6 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-[#f5f4ef] px-3 py-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                Dashboard
              </span>
            </div>
            <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-zinc-900">
              Good morning, {(user?.firstName || "Agent").toUpperCase()}
            </h1>
            <p className="text-zinc-500 mt-1 text-sm">
              Build immersive walkthroughs instantly and share them with your clients.
            </p>
          </div>
          <Link href="/dashboard/new-tour">
            <Button className="h-11 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800">
              <Plus className="w-4 h-4 mr-2" />
              New Tour
            </Button>
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="relative grid sm:grid-cols-2 lg:grid-cols-4 gap-4 [perspective:1000px]">
        {statCards.map((stat, i) => (
          <motion.div
            key={i}
            whileHover={{ y: -5, rotateX: 3, rotateY: i % 2 === 0 ? -3 : 3 }}
            transition={{ type: "spring", stiffness: 250, damping: 18 }}
            className="group relative rounded-2xl border border-zinc-200 bg-white p-4 overflow-hidden shadow-[0_12px_28px_-20px_rgba(0,0,0,0.55)]"
          >
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${stat.accent} opacity-70`} />
            <div className="relative flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                {stat.label}
              </span>
              <div className="rounded-lg border border-zinc-200 bg-white p-2">
                <stat.icon className="w-3.5 h-3.5 text-zinc-600" />
              </div>
            </div>
            <div className="relative mt-4">
              {stat.loading ? (
                <Skeleton className="h-10 w-20" />
              ) : (
                <div className="text-4xl font-semibold tracking-tight text-zinc-900">
                  {stat.value}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="relative grid lg:grid-cols-3 gap-6">
        {/* Recent tours */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <h2 className="text-lg font-semibold text-zinc-900 tracking-wide">RECENT TOURS</h2>
            </div>
            <Link href="/dashboard/tours" className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-900">
              View All <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-[0_10px_28px_-18px_rgba(0,0,0,0.4)]">
            {toursLoading ? (
              Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
            ) : recentToursData?.tours?.length === 0 ? (
              <div className="text-center p-10 border border-dashed border-zinc-300 rounded-xl">
                <p className="text-zinc-500 mb-4 text-sm">No tours generated yet.</p>
                <Link href="/dashboard/new-tour">
                  <Button className="rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white">Create First Tour</Button>
                </Link>
              </div>
            ) : (
              recentToursData?.tours?.map((tour: any) => (
                <motion.div
                  key={tour.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -2 }}
                  className="flex items-center p-3 bg-[#faf9f5] rounded-xl border border-zinc-200 gap-4 group transition-all"
                >
                  <div className="w-16 h-16 rounded-lg border border-zinc-200 overflow-hidden flex-shrink-0 bg-muted">
                    {tour.thumbnailUrl ? (
                      <img src={tour.thumbnailUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Home className="text-muted-foreground w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate text-sm uppercase tracking-wide">{tour.listingAddress || tour.listingUrl}</h3>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1 font-mono">
                      <span className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${tour.status === "ready" ? "bg-emerald-500" : "bg-amber-400"}`} />
                        {tour.status}
                      </span>
                      <span>{tour.roomsDetected} rooms</span>
                      <span className="text-rose-500 font-bold">{tour.confidenceScore}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-2 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 transition-colors">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-2 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 transition-colors">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Quick generate */}
        <div className="lg:col-span-1">
          <div className="relative rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-[0_14px_30px_-18px_rgba(0,0,0,0.48)]">
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br from-rose-200/45 to-transparent blur-2xl" />
            <div className="relative flex items-center gap-2 px-4 py-3 border-b border-zinc-200">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600">Quick Generate</span>
            </div>
            <div className="relative p-5">
              <form onSubmit={handleQuickGenerate} className="space-y-4">
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Paste listing URL..."
                    className="pl-9 bg-[#faf9f5] border border-zinc-300 rounded-xl h-11 text-sm"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full h-11 rounded-xl bg-rose-500 text-white hover:bg-rose-400" disabled={!url}>
                  Generate Tour →
                </Button>
              </form>
            </div>
          </div>

          {/* Tips panel */}
          <div className="rounded-2xl border border-zinc-200 bg-white mt-4 overflow-hidden shadow-[0_10px_22px_-16px_rgba(0,0,0,0.45)]">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600">Tips</span>
            </div>
            <ul className="p-4 space-y-3">
              {[
                "Add extra photos for higher AI confidence",
                "Share tour links directly with buyers",
                "Analytics track every viewer click",
              ].map((tip) => (
                <li key={tip} className="text-xs text-zinc-500 flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
