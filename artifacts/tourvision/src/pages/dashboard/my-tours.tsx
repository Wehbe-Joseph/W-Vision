import { useState } from "react";
import { useListTours, useDeleteTour } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Home, Copy, ExternalLink, Trash2, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function MyTours() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "ready" | "processing" | "failed">("all");
  const { data, isLoading, refetch } = useListTours({ status, search });
  const deleteMutation = useDeleteTour();
  const { toast } = useToast();

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
    if (s === "ready") return "bg-[#00C853] text-white";
    if (s === "processing") return "bg-[#FFD000] text-[#1A1714]";
    return "bg-destructive text-white";
  };

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="border-b-2 border-foreground pb-5 flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-end">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 bg-[#FFD000]" />
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">Library</span>
          </div>
          <h1 className="text-4xl font-serif">MY TOURS</h1>
        </div>
        <Link href="/dashboard/new-tour">
          <Button>+ New Tour</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search address or URL..."
            className="pl-9 bg-card border-2 border-foreground rounded-none h-10 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v: any) => setStatus(v)}>
          <SelectTrigger className="w-[160px] bg-card border-2 border-foreground rounded-none h-10 text-sm font-bold uppercase">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="rounded-none border-2 border-foreground">
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
          {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      ) : data?.tours?.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-foreground/30">
          <Home className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-30" />
          <h3 className="text-2xl font-serif mb-2">NO TOURS YET</h3>
          <p className="text-muted-foreground mb-6 text-sm">Create your first 3D tour from any listing URL.</p>
          <Link href="/dashboard/new-tour">
            <Button>Create Tour</Button>
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {data?.tours?.map((tour: any) => (
            <div
              key={tour.id}
              className="bg-card border-2 border-foreground flex flex-col hover:shadow-[6px_6px_0px_0px_#1A1714] transition-all group"
            >
              {/* Thumbnail */}
              <div className="aspect-video bg-muted relative overflow-hidden border-b-2 border-foreground">
                {tour.thumbnailUrl ? (
                  <img src={tour.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Home className="w-8 h-8 text-muted-foreground opacity-20" />
                  </div>
                )}
                {/* Status badge */}
                <div className={`absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 border-2 border-foreground text-xs font-mono font-bold uppercase ${statusColor(tour.status)}`}>
                  <span className="w-1.5 h-1.5 bg-current opacity-80" />
                  {tour.status}
                </div>
              </div>

              {/* Body */}
              <div className="p-4 flex-1 flex flex-col gap-2">
                <h3 className="font-bold text-sm uppercase leading-tight truncate">{tour.listingAddress || "Unknown Address"}</h3>
                <p className="text-xs text-muted-foreground font-mono truncate">{tour.listingUrl}</p>

                <div className="flex items-center justify-between text-xs mt-auto pt-2">
                  <span className="font-mono font-bold border border-foreground/30 px-2 py-0.5 bg-background">
                    {tour.confidenceScore}% CONF
                  </span>
                  <span className="text-muted-foreground font-mono">{tour.viewCount} views</span>
                </div>
              </div>

              {/* Actions */}
              <div className="border-t-2 border-foreground p-3 flex gap-2">
                <button
                  disabled={tour.status !== "ready"}
                  onClick={() => window.open(`/tour/${tour.shareToken}`, "_blank")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold uppercase tracking-wide border-2 border-foreground hover:bg-foreground hover:text-background transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> View
                </button>
                <button
                  disabled={tour.status !== "ready"}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold uppercase tracking-wide border-2 border-foreground hover:bg-foreground hover:text-background transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Copy className="w-3.5 h-3.5" /> Link
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1.5 border-2 border-foreground hover:bg-foreground hover:text-background transition-all">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-none border-2 border-foreground bg-card">
                    <DropdownMenuItem
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer font-bold uppercase text-xs"
                      onClick={() => handleDelete(tour.id)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" /> Delete Tour
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
