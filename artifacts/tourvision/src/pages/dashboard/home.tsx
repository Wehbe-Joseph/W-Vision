import { useGetTourStats, useGetRecentTours, useGetUserLimits } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useLocation } from "wouter";
import { Play, Copy, Trash2, Home, Clock, Eye, LayoutGrid, Link2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { motion } from "framer-motion";

const statAccents = [
  { dot: "bg-[#00C853]", bar: "#00C853" },
  { dot: "bg-[#FFD000]", bar: "#FFD000" },
  { dot: "bg-primary", bar: "hsl(340,100%,50%)" },
  { dot: "bg-foreground", bar: "#1A1714" },
];

export default function DashboardHome() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: stats, isLoading: statsLoading } = useGetTourStats();
  const { data: recentToursData, isLoading: toursLoading } = useGetRecentTours();
  const { data: limits } = useGetUserLimits();
  const [url, setUrl] = useState("");

  const handleQuickGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (url) setLocation(`/dashboard/new-tour?url=${encodeURIComponent(url)}`);
  };

  const statCards = [
    { label: "Tours This Month", value: stats?.toursThisMonth || 0, icon: LayoutGrid, loading: statsLoading },
    { label: "Avg Processing", value: stats?.avgProcessingMinutes ? `${stats.avgProcessingMinutes}m` : "0m", icon: Clock, loading: statsLoading },
    { label: "Total Views", value: stats?.totalViewsThisMonth || 0, icon: Eye, loading: statsLoading },
    { label: "All Time Tours", value: stats?.totalToursAllTime || 0, icon: Home, loading: statsLoading },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto w-full space-y-8">

      {/* Page header */}
      <div className="border-b-2 border-foreground pb-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 bg-[#00C853]" />
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">Dashboard</span>
        </div>
        <h1 className="text-4xl font-serif">GOOD MORNING, {(user?.firstName || "AGENT").toUpperCase()}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {limits
            ? `You have ${limits.toursRemaining} ${
                limits.toursRemaining === 1 ? "tour" : "tours"
              } remaining this month on the ${limits.tier} plan.`
            : "Loading your usage…"}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <div
            key={i}
            className="border-2 border-foreground bg-card shadow-[4px_4px_0px_0px_#1A1714] flex flex-col"
          >
            {/* Card header */}
            <div className="flex items-center justify-between px-4 py-2 border-b-2 border-foreground">
              <div className={`w-2 h-2 ${statAccents[i].dot}`} />
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground truncate ml-2 flex-1">{stat.label}</span>
              <stat.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
            </div>
            <div className="px-4 py-5">
              {stat.loading ? (
                <Skeleton className="h-10 w-20" />
              ) : (
                <div className="text-5xl font-serif" style={{ color: statAccents[i].bar }}>{stat.value}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Recent tours */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#FFD000]" />
              <h2 className="text-2xl font-serif">RECENT TOURS</h2>
            </div>
            <Link href="/dashboard/tours" className="text-xs font-bold uppercase tracking-wide text-primary hover:underline">
              View All →
            </Link>
          </div>

          <div className="space-y-3">
            {toursLoading ? (
              Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
            ) : recentToursData?.tours?.length === 0 ? (
              <div className="text-center p-10 border-2 border-dashed border-foreground/30">
                <p className="text-muted-foreground mb-4 text-sm">No tours generated yet.</p>
                <Link href="/dashboard/new-tour">
                  <Button>Create First Tour</Button>
                </Link>
              </div>
            ) : (
              recentToursData?.tours?.map((tour: any) => (
                <motion.div
                  key={tour.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center p-3 bg-card border-2 border-foreground gap-4 group hover:shadow-[4px_4px_0px_0px_#1A1714] transition-all"
                >
                  <div className="w-16 h-16 border-2 border-foreground overflow-hidden flex-shrink-0 bg-muted">
                    {tour.thumbnailUrl ? (
                      <img src={tour.thumbnailUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Home className="text-muted-foreground w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold truncate text-sm uppercase">{tour.listingAddress || tour.listingUrl}</h3>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 font-mono">
                      <span className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 ${tour.status === "ready" ? "bg-[#00C853]" : "bg-[#FFD000]"}`} />
                        {tour.status}
                      </span>
                      <span>{tour.roomsDetected} rooms</span>
                      <span className="text-primary font-bold">{tour.confidenceScore}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1.5 border-2 border-foreground hover:bg-foreground hover:text-background transition-colors">
                      <Play className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 border-2 border-foreground hover:bg-foreground hover:text-background transition-colors">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 border-2 border-primary hover:bg-primary hover:text-white transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Quick generate */}
        <div className="lg:col-span-1">
          <div className="border-2 border-foreground bg-card shadow-[6px_6px_0px_0px_#1A1714]">
            {/* Window bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b-2 border-foreground bg-foreground">
              <span className="w-2 h-2 bg-primary" />
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-background">Quick Generate</span>
            </div>
            <div className="p-5">
              <form onSubmit={handleQuickGenerate} className="space-y-4">
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Paste listing URL..."
                    className="pl-9 bg-background border-2 border-foreground rounded-none h-11 text-sm font-mono"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={!url}>
                  Generate Tour →
                </Button>
              </form>
            </div>
          </div>

          {/* Tips panel */}
          <div className="border-2 border-foreground bg-card mt-4">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b-2 border-foreground">
              <span className="w-2 h-2 bg-[#00C853]" />
              <span className="text-xs font-mono font-bold uppercase tracking-widest">Tips</span>
            </div>
            <ul className="p-4 space-y-3">
              {[
                "Add extra photos for higher AI confidence",
                "Share tour links directly with buyers",
                "Analytics track every viewer click",
              ].map((tip) => (
                <li key={tip} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-[#00C853] mt-1.5 shrink-0" />
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
