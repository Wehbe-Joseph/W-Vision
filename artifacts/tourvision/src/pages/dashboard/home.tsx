import { useGetTourStats, useGetRecentTours } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useLocation } from "wouter";
import { Play, Copy, Trash2, Home, Clock, Eye, LayoutGrid, Link2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { motion } from "framer-motion";

export default function DashboardHome() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: stats, isLoading: statsLoading } = useGetTourStats();
  const { data: recentToursData, isLoading: toursLoading } = useGetRecentTours();
  const [url, setUrl] = useState("");

  const handleQuickGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (url) {
      setLocation(`/dashboard/new-tour?url=${encodeURIComponent(url)}`);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto w-full space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-serif font-bold">Good morning, {user?.name?.split(' ')[0] || 'Agent'}</h1>
        <p className="text-muted-foreground">You have 11 tours remaining this month.</p>
        {user?.subscriptionTier === 'free' && (
          <div className="mt-2 bg-primary/10 border border-primary/20 text-primary px-4 py-3 rounded-lg flex items-center justify-between">
            <span className="text-sm font-medium">Upgrade to Pro for priority processing and analytics.</span>
            <Button variant="outline" className="border-primary text-primary hover:bg-primary/20 h-8">Upgrade Now</Button>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Tours This Month", value: stats?.toursThisMonth || 0, icon: LayoutGrid, loading: statsLoading },
          { label: "Avg Processing", value: stats?.avgProcessingMinutes ? `${stats.avgProcessingMinutes}m` : '0m', icon: Clock, loading: statsLoading },
          { label: "Total Views", value: stats?.totalViewsThisMonth || 0, icon: Eye, loading: statsLoading },
          { label: "Tours All Time", value: stats?.totalToursAllTime || 0, icon: Home, loading: statsLoading }
        ].map((stat, i) => (
          <Card key={i} className="bg-card border-border">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-muted-foreground font-mono text-xs uppercase">{stat.label}</span>
                <stat.icon className="w-4 h-4 text-primary" />
              </div>
              {stat.loading ? <Skeleton className="h-10 w-16" /> : <div className="text-4xl font-serif font-bold text-primary">{stat.value}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-serif font-bold">Recent Tours</h2>
            <Link href="/dashboard/tours" className="text-sm text-primary hover:underline">View All →</Link>
          </div>
          
          <div className="space-y-3">
            {toursLoading ? (
              Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
            ) : recentToursData?.tours?.length === 0 ? (
              <div className="text-center p-8 border border-dashed border-border rounded-xl">
                <p className="text-muted-foreground mb-4">No tours generated yet.</p>
                <Link href="/dashboard/new-tour">
                  <Button className="bg-primary text-primary-foreground font-bold">Create First Tour</Button>
                </Link>
              </div>
            ) : (
              recentToursData?.tours?.map((tour: any) => (
                <motion.div key={tour.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center p-4 bg-card border border-border rounded-xl gap-4 group hover:border-primary/50 transition-colors">
                  <div className="w-16 h-16 rounded-md bg-muted overflow-hidden flex-shrink-0 relative">
                    {tour.thumbnailUrl ? (
                      <img src={tour.thumbnailUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Home className="text-muted-foreground w-6 h-6" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold truncate text-sm">{tour.listingAddress || tour.listingUrl}</h3>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${tour.status === 'ready' ? 'bg-primary animate-pulse' : 'bg-yellow-500'}`} />
                        {tour.status}
                      </span>
                      <span>{tour.roomsDetected} rooms</span>
                      <span className="text-primary">{tour.confidenceScore}% conf</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-primary"><Play className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8"><Copy className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <Card className="bg-card border-border sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg font-serif">Quick Generate</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleQuickGenerate} className="space-y-4">
                <div className="space-y-2">
                  <div className="relative">
                    <Link2 className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input 
                      placeholder="Paste Zillow or Airbnb URL..." 
                      className="pl-9 bg-background h-10 text-sm"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90 glow-primary" disabled={!url}>
                  Generate Tour →
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}