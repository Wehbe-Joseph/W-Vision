import { useState } from "react";
import { useListTours, useDeleteTour } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, MapPin, MoreHorizontal, Home, Copy, ExternalLink, Trash2 } from "lucide-react";
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

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
        <h1 className="text-3xl font-serif font-bold">My Tours</h1>
        <Link href="/dashboard/new-tour">
          <Button className="bg-primary text-primary-foreground font-bold">Generate New Tour</Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search address or URL..." 
            className="pl-9 bg-card border-border"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v: any) => setStatus(v)}>
          <SelectTrigger className="w-[180px] bg-card">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tours</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : data?.tours?.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-dashed border-border">
          <Home className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">No tours found</h3>
          <p className="text-muted-foreground mb-6">Create your first 3D tour from any listing URL.</p>
          <Link href="/dashboard/new-tour">
            <Button className="bg-primary text-primary-foreground">Create Tour</Button>
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {data?.tours?.map((tour: any) => (
            <div key={tour.id} className="bg-card border border-border rounded-xl overflow-hidden flex flex-col group hover:border-primary/50 transition-colors">
              <div className="aspect-video bg-muted relative">
                {tour.thumbnailUrl ? (
                  <img src={tour.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Home className="w-8 h-8 opacity-20" /></div>
                )}
                <div className="absolute top-3 left-3 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider backdrop-blur-md bg-black/50 text-white border border-white/10">
                  {tour.status}
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="font-bold text-lg mb-1 truncate">{tour.listingAddress || "Unknown Address"}</h3>
                <p className="text-sm text-muted-foreground mb-4 truncate">{tour.listingUrl}</p>
                
                <div className="flex items-center justify-between text-sm mt-auto">
                  <span className="font-mono text-primary bg-primary/10 px-2 py-1 rounded">{tour.confidenceScore}% conf</span>
                  <span className="text-muted-foreground">{tour.viewCount} views</span>
                </div>
              </div>
              <div className="border-t border-border p-3 flex gap-2">
                <Button variant="ghost" className="flex-1 text-primary hover:bg-primary/10" disabled={tour.status !== 'ready'} onClick={() => window.open(`/tour/${tour.shareToken}`, '_blank')}>
                  <ExternalLink className="w-4 h-4 mr-2" /> View
                </Button>
                <Button variant="ghost" className="flex-1" disabled={tour.status !== 'ready'}>
                  <Copy className="w-4 h-4 mr-2" /> Link
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-card border-border">
                    <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer" onClick={() => handleDelete(tour.id)}>
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