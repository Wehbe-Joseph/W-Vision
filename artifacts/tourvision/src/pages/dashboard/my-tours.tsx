import { useEffect, useMemo, useState } from "react";
import { useListTours, useDeleteTour } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Home,
  Copy,
  ExternalLink,
  Trash2,
  MoreHorizontal,
  Eye,
  ShieldAlert,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { motion } from "framer-motion";

export default function MyTours() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "ready" | "processing" | "failed">("all");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const { data, isLoading, refetch } = useListTours({ status, search });
  const deleteMutation = useDeleteTour();
  const { toast } = useToast();

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleDelete = async (id: string) => {
    if (confirm("Delete this tour?")) {
      try {
        await deleteMutation.mutateAsync({ tourId: id });
        toast({ title: "Deleted" });
        refetch();
      } catch (e) {
        toast({ title: "Error", variant: "destructive" });
      }
    }
  };

  const statusColor = (s: string) => {
    if (s === "ready") return "bg-emerald-500 text-white";
    if (s === "processing") return "bg-amber-300 text-zinc-900";
    if (s === "frozen") return "bg-zinc-900 text-white";
    return "bg-destructive text-white";
  };

  const countdownLabel = (tour: any) => {
    if (tour?.frozen) return "Tour frozen";

    const expiresAtMs = tour?.expiresAt
      ? new Date(tour.expiresAt).getTime()
      : tour?.createdAt
        ? new Date(tour.createdAt).getTime() + 24 * 60 * 60 * 1000
        : null;

    if (!expiresAtMs || Number.isNaN(expiresAtMs)) return null;

    const remaining = expiresAtMs - nowMs;
    if (remaining <= 0) return "Tour frozen";

    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    return `${hh}:${mm}:${ss} left`;
  };

  const tourCards = useMemo(() => data?.tours ?? [], [data?.tours]);

  return (
    <div className="relative p-6 max-w-7xl mx-auto w-full space-y-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-gradient-to-br from-amber-200/40 to-transparent blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative rounded-3xl border border-zinc-200 bg-white/90 backdrop-blur p-6 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)] flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-end">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-[#f5f4ef] px-3 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Library</span>
          </div>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-zinc-900">My Tours</h1>
        </div>
        <Link href="/dashboard/new-tour">
          <Button className="h-11 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800">+ New Tour</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="relative rounded-2xl border border-zinc-200 bg-white p-4 flex flex-col sm:flex-row gap-3 shadow-[0_10px_28px_-18px_rgba(0,0,0,0.4)]">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search address or URL..."
            className="pl-9 bg-[#faf9f5] border border-zinc-300 rounded-xl h-10 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v: any) => setStatus(v)}>
          <SelectTrigger className="w-[170px] bg-[#faf9f5] border border-zinc-300 rounded-xl h-10 text-sm font-semibold uppercase tracking-wide">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border border-zinc-300">
            <SelectItem value="all">All Tours</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : tourCards.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-zinc-300 rounded-2xl bg-white">
          <Home className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-30" />
          <h3 className="text-2xl font-semibold mb-2">No Tours Yet</h3>
          <p className="text-muted-foreground mb-6 text-sm">Create your first 3D tour from any listing URL.</p>
          <Link href="/dashboard/new-tour">
            <Button className="rounded-xl bg-zinc-900 text-white hover:bg-zinc-800">Create Tour</Button>
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5 [perspective:1000px]">
          {tourCards.map((tour: any) => (
            <motion.div
              key={tour.id}
              whileHover={{ y: -6, rotateX: 3, rotateY: -2 }}
              transition={{ type: "spring", stiffness: 240, damping: 18 }}
              className="bg-white border border-zinc-200 rounded-2xl flex flex-col shadow-[0_14px_28px_-18px_rgba(0,0,0,0.5)] transition-all group overflow-hidden"
            >
              {/* Thumbnail */}
              <div className="aspect-video bg-muted relative overflow-hidden border-b border-zinc-200">
                {tour.thumbnailUrl ? (
                  <img src={tour.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Home className="w-8 h-8 text-muted-foreground opacity-20" />
                  </div>
                )}
                {/* Status badge */}
                <div className={`absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider ${statusColor(tour.status)}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                  {tour.status === "frozen" ? "Frozen" : tour.status}
                </div>
              </div>

              {/* Body */}
              <div className="p-4 flex-1 flex flex-col gap-2">
                <h3 className="font-semibold text-sm uppercase leading-tight truncate tracking-wide">{tour.listingAddress || "Unknown Address"}</h3>
                <p className="text-xs text-muted-foreground truncate">{tour.listingUrl}</p>
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                  24H access: <span className="text-zinc-900 font-semibold">{countdownLabel(tour) ?? "N/A"}</span>
                </p>

                <div className="flex items-center justify-between text-xs mt-auto pt-2">
                  <span className="font-semibold border border-zinc-200 px-2 py-0.5 rounded-md bg-[#faf9f5] inline-flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 text-zinc-500" />
                    {tour.confidenceScore}% CONF
                  </span>
                  <span className="text-zinc-500 inline-flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {tour.viewCount} views
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="border-t border-zinc-200 p-3 flex gap-2">
                <button
                  disabled={tour.status !== "ready" || tour.frozen}
                  onClick={() => window.open(`/tour/${tour.shareToken}`, "_blank")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold uppercase tracking-wide rounded-lg border border-zinc-300 hover:bg-zinc-900 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> View
                </button>
                <button
                  disabled={tour.status !== "ready" || tour.frozen}
                  onClick={async () => {
                    const shareUrl = `${window.location.origin}/tour/${tour.shareToken}`;
                    await navigator.clipboard.writeText(shareUrl);
                    toast({ title: "Tour link copied" });
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold uppercase tracking-wide border-2 border-foreground hover:bg-foreground hover:text-background transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Copy className="w-3.5 h-3.5" /> Link
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1.5 rounded-lg border border-zinc-300 hover:bg-zinc-900 hover:text-white transition-all">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-xl border border-zinc-300 bg-white">
                    <DropdownMenuItem
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer font-bold uppercase text-xs"
                      onClick={() => handleDelete(tour.id)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" /> Delete Tour
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
