import { useState } from "react";
import { useParams } from "wouter";
import { useGetPublicTour } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Share2, CheckCircle2, AlertTriangle, ArrowUpRight, Cuboid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function TourViewer() {
  const params = useParams();
  const shareToken = params.shareToken || "";
  const { data: tour, isLoading } = useGetPublicTour(shareToken, { query: { enabled: !!shareToken, queryKey: ["public-tour", shareToken] } });

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showConfidence, setShowConfidence] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState(false);

  if (isLoading) return (
    <div className="fixed inset-0 bg-background flex items-center justify-center">
      <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!tour) return (
    <div className="fixed inset-0 bg-background flex items-center justify-center text-xl text-muted-foreground">
      Tour not found.
    </div>
  );

  const currentRoom = activeRoomId ? tour.rooms.find(r => r.id === activeRoomId) : tour.rooms[0];
  const marbleUrl = currentRoom?.marbleEmbedUrl;
  const thumbnailUrl = currentRoom?.thumbnailUrl;
  const useIframe = marbleUrl && !iframeError;

  return (
    <div className="fixed inset-0 bg-black overflow-hidden font-sans text-foreground">
      {/* Background Layer: thumbnail or iframe */}
      <div className="absolute inset-0 z-0">
        <AnimatePresence mode="wait">
          {useIframe ? (
            <iframe
              key={`iframe-${currentRoom?.id}`}
              src={marbleUrl}
              className="w-full h-full border-none"
              allow="xr-spatial-tracking"
              onError={() => setIframeError(true)}
            />
          ) : thumbnailUrl ? (
            <motion.div
              key={`thumb-${currentRoom?.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="w-full h-full relative"
            >
              <img
                src={thumbnailUrl}
                alt={currentRoom?.roomLabel ?? "Room"}
                className="w-full h-full object-cover"
              />
              {/* Dark vignette overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />
              {/* 3D engine placeholder badge */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-background/60 backdrop-blur-md border border-border/60 rounded-2xl px-6 py-4 flex flex-col items-center gap-2 shadow-2xl">
                  <Cuboid className="w-8 h-8 text-primary/70 animate-pulse" />
                  <span className="font-mono text-xs text-muted-foreground">3D generation engine</span>
                  <span className="font-mono text-xs text-primary/60">Spatial AI is rendering your tour...</span>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full bg-card flex items-center justify-center"
            >
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Cuboid className="w-12 h-12 text-primary/40 animate-pulse" />
                <span className="font-mono text-sm">No preview available</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Confidence overlay */}
        {showConfidence && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-primary/20 border border-primary/50 rounded-full blur-sm flex items-center justify-center font-mono text-primary text-xs">Real Photo</div>
            <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-blue-500/20 border border-blue-500/50 rounded-full blur-sm flex items-center justify-center font-mono text-blue-400 text-xs">AI High Conf</div>
          </div>
        )}
      </div>

      {/* Floating UI */}
      <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between">
        {/* Top Bar */}
        <div className="p-4 flex justify-between items-start pointer-events-auto">
          <div className="flex items-center gap-3">
            {/* Hamburger button — fixed top-left, dark bg, green on hover */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-black/80 backdrop-blur-md border border-white/10 text-white hover:text-primary hover:border-primary/50 transition-all duration-200 shadow-lg"
              aria-label="Open rooms"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-lg px-4 py-2 flex flex-col shadow-lg">
              <span className="font-serif font-bold text-sm tracking-tight flex items-center gap-2 text-white">
                {tour.listingAddress} <ArrowUpRight className="w-3 h-3 text-white/40" />
              </span>
              <span className="text-xs text-white/50 font-mono">{currentRoom?.roomLabel ?? "Room"}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="bg-black/70 backdrop-blur-md border-white/10 text-white font-medium hover:border-primary/50 hover:text-primary">
              <Share2 className="w-4 h-4 mr-2" /> Share
            </Button>
            <Button className="bg-primary text-black font-bold glow-primary hover:bg-primary/90">
              Request Visit
            </Button>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="p-4 flex justify-between items-end pointer-events-auto">
          <div className="bg-black/50 backdrop-blur border border-white/10 px-3 py-1.5 rounded text-xs font-serif font-bold text-white/60 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary/60" /> WVISION
          </div>

          <div className="bg-black/70 backdrop-blur-md border border-white/10 p-3 rounded-xl flex items-center gap-4">
            <div className="flex flex-col">
              <Label className="font-bold text-sm text-white">AI Confidence Layer</Label>
              <span className="text-xs text-white/50 font-mono">{tour.confidenceScore}% avg</span>
            </div>
            <Switch checked={showConfidence} onCheckedChange={setShowConfidence} />
          </div>
        </div>
      </div>

      {/* Room Sidebar — slides from left, 300ms, rgba(8,8,8,0.95) + blur */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm z-40"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              style={{ backgroundColor: "rgba(8,8,8,0.95)" }}
              className="absolute top-0 left-0 bottom-0 w-full sm:w-[280px] border-r border-white/10 z-50 flex flex-col backdrop-blur-xl"
            >
              {/* Sidebar header */}
              <div className="p-4 border-b border-white/10 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="font-serif font-bold tracking-tight text-white">Rooms</span>
                  <span className="font-mono text-xs text-white/30 ml-1">({tour.rooms.length})</span>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Listing info */}
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-xs font-mono text-white/40 uppercase tracking-wider mb-1">Property</p>
                <p className="text-sm font-bold text-white leading-tight">{tour.listingAddress}</p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-white/40 font-mono">
                  {tour.listingBedrooms && <span>{tour.listingBedrooms}bd</span>}
                  {tour.listingBathrooms && <span>{tour.listingBathrooms}ba</span>}
                  {tour.listingPrice && <span className="text-primary/80">{tour.listingPrice}</span>}
                </div>
              </div>

              {/* Room list */}
              <div className="overflow-y-auto flex-1 p-2 space-y-0.5">
                {tour.rooms.map(room => {
                  const isActive = activeRoomId === room.id || (!activeRoomId && room.id === tour.rooms[0]?.id);
                  return (
                    <button
                      key={room.id}
                      onClick={() => { setActiveRoomId(room.id); setSidebarOpen(false); }}
                      className={`w-full text-left px-3 py-3 rounded-lg flex items-center gap-3 transition-all duration-150 ${
                        isActive
                          ? "bg-primary/15 border border-primary/30 text-primary"
                          : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
                      }`}
                    >
                      {room.thumbnailUrl && (
                        <img
                          src={room.thumbnailUrl}
                          alt=""
                          className="w-10 h-10 rounded object-cover flex-shrink-0 border border-white/10"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm block truncate">{room.roomLabel}</span>
                        <span className="text-xs opacity-50 font-mono">Floor {room.floorNumber}</span>
                      </div>
                      {room.confidenceScore && room.confidenceScore > 0.9 ? (
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-yellow-500/70 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Agent footer */}
              <div className="p-4 border-t border-white/10">
                <p className="text-xs font-mono text-white/30 uppercase tracking-wider mb-2">Listing Agent</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                    {tour.agentLogo
                      ? <img src={tour.agentLogo} alt="" className="w-full h-full object-cover rounded-full" />
                      : <span className="text-primary font-bold text-xs">{(tour.agentName || "A")[0]}</span>
                    }
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-white truncate">{tour.agentName ?? "Listing Agent"}</span>
                    <span className="text-xs text-white/40 font-mono capitalize">{tour.listingPlatform}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
