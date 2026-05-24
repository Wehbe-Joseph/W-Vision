import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Menu, Share2, X } from "lucide-react";
import { ApiError, useGetPublicTour } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import WVisionLogo from "@/components/WVisionLogo";
import { getApiUrl } from "@/lib/runtime-api";

interface SceneExtra {
  id: string;
  label: string;
  roomType: string;
  thumbnailUrl?: string | null;
  generationStatus: "queued" | "processing" | "completed" | "failed";
  generatedTourUrl: string | null;
  worldEmbedUrl?: string | null;
}

interface TourRoom {
  id: string;
  roomLabel?: string | null;
  floorNumber?: number | null;
  thumbnailUrl?: string | null;
  worldEmbedUrl?: string | null;
  qualityScore?: number | null;
  confidenceScore?: number | null;
}

interface PublicTourLike {
  id?: string;
  listingAddress?: string | null;
  listingPlatform?: string | null;
  status?: string | null;
  generationStatus?: string | null;
  isFullHouse?: boolean;
  previewImageUrl?: string | null;
  generatedTourUrl?: string | null;
  scenes?: SceneExtra[];
  rooms?: TourRoom[];
}

interface ViewerRoom {
  id: string;
  label: string;
  floor: number;
  thumbnailUrl: string | null;
  ready: boolean;
  rank: number;
}

function isPhotoUrl(url: string | null | undefined): url is string {
  return !!url && (url.startsWith("http") || url.startsWith("data:"));
}

export default function TourViewer() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const shareToken = params.shareToken || "";

  const { data, isLoading, error } = useGetPublicTour(shareToken, {
    query: {
      enabled: !!shareToken,
      queryKey: ["public-tour", shareToken],
      refetchInterval: 4000,
    },
  });
  const tour = (data ?? null) as PublicTourLike | null;

  const rooms = useMemo<ViewerRoom[]>(() => {
    if (!tour) return [];
    if (tour.scenes && tour.scenes.length > 0) {
      return tour.scenes
        .map((s) => {
        const thumbnailUrl = s.thumbnailUrl ?? null;
        return {
          id: s.id,
          label: s.label,
          floor: 1,
          thumbnailUrl,
          ready: s.generationStatus === "completed" && isPhotoUrl(thumbnailUrl),
          rank:
            s.generationStatus === "completed"
              ? 200
              : s.generationStatus === "processing"
                ? 100
                : 0,
        };
        })
        .sort((a, b) => b.rank - a.rank);
    }
    return (tour.rooms ?? [])
      .map((r) => {
        const thumbnailUrl = r.thumbnailUrl ?? r.worldEmbedUrl ?? null;
        const quality = r.qualityScore ?? 0;
        const confidence = r.confidenceScore ?? 0;
        return {
          id: r.id,
          label: r.roomLabel ?? "Room",
          floor: r.floorNumber ?? 1,
          thumbnailUrl,
          ready: isPhotoUrl(thumbnailUrl),
          rank: quality * 100 + confidence,
        };
      })
      .sort((a, b) => b.rank - a.rank);
  }, [tour]);

  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadSuccess, setLeadSuccess] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [hintDismissedByClick, setHintDismissedByClick] = useState(false);
  const [leadForm, setLeadForm] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  const activeRoom =
    rooms.find((r) => r.id === activeRoomId) ??
    rooms.find((r) => r.ready) ??
    rooms[0] ??
    null;

  const photoUrl =
    activeRoom?.thumbnailUrl ??
    tour?.previewImageUrl ??
    null;

  const isFullHouse =
    Boolean(tour?.isFullHouse) ||
    rooms.length > 1 ||
    (tour?.scenes?.length ?? 0) > 1;
  const showSidebarMenu = isFullHouse && rooms.length > 1;

  const floors = useMemo(() => {
    const grouped = new Map<number, ViewerRoom[]>();
    for (const room of rooms) {
      const list = grouped.get(room.floor) ?? [];
      list.push(room);
      grouped.set(room.floor, list);
    }
    return [...grouped.entries()].sort((a, b) => a[0] - b[0]);
  }, [rooms]);

  useEffect(() => {
    if (activeRoomId) return;
    const firstReady = rooms.find((r) => r.ready);
    if (firstReady) setActiveRoomId(firstReady.id);
  }, [rooms, activeRoomId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!hintDismissedByClick) setShowHint(false);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [hintDismissedByClick]);

  useEffect(() => {
    const dismissHint = () => {
      setHintDismissedByClick(true);
      setShowHint(false);
    };
    window.addEventListener("click", dismissHint, { once: true });
    return () => window.removeEventListener("click", dismissHint);
  }, []);

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied!" });
    } catch {
      toast({
        title: "Could not copy link",
        description: "Copy the URL from your address bar instead.",
        variant: "destructive",
      });
    }
  }

  async function handleLeadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tour?.id) {
      toast({ title: "Tour id missing", variant: "destructive" });
      return;
    }
    if (!leadForm.name.trim() || !leadForm.email.trim()) {
      toast({
        title: "Name and email are required.",
        variant: "destructive",
      });
      return;
    }

    setLeadLoading(true);
    try {
      const res = await fetch(getApiUrl("/api/tours/lead"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tour_id: tour.id,
          name: leadForm.name.trim(),
          email: leadForm.email.trim(),
          phone: leadForm.phone.trim() || undefined,
          message: leadForm.message.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      setLeadSuccess(true);
      toast({
        title: "Request sent!",
        description: "The agent will contact you shortly.",
      });
      window.setTimeout(() => {
        setShowLeadModal(false);
        setLeadSuccess(false);
        setLeadForm({ name: "", email: "", phone: "", message: "" });
      }, 2000);
    } catch (err) {
      toast({
        title: "Could not send request",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setLeadLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-[#080808] flex items-center justify-center text-white">
        <div className="flex items-center gap-3 text-sm text-white/70">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading tour...
        </div>
      </div>
    );
  }

  if (!tour) {
    const apiErr = error as ApiError<{ code?: string; message?: string } | null> | null;
    const frozen =
      apiErr?.status === 410 ||
      (typeof apiErr?.data === "object" && apiErr?.data?.code === "TOUR_FROZEN");
    if (frozen) {
      return (
        <div className="fixed inset-0 bg-[#080808] flex items-center justify-center text-white">
          <div className="text-center max-w-md px-6">
            <div className="text-3xl font-semibold tracking-tight mb-2">
              WVISION
            </div>
            <p className="text-white/90 text-lg font-medium">This tour is frozen.</p>
            <p className="text-white/60 mt-2 text-sm">
              Free tours are available for 24 hours, then automatically frozen.
            </p>
            <Button
              className="mt-5 bg-white text-black hover:bg-white/90"
              onClick={() => setLocation("/")}
            >
              Back home
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 bg-[#080808] flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-3xl font-semibold tracking-tight mb-2">
            WVISION
          </div>
          <p className="text-white/60">Tour not found.</p>
          <Button
            className="mt-4 bg-white text-black hover:bg-white/90"
            onClick={() => setLocation("/")}
          >
            Back home
          </Button>
        </div>
      </div>
    );
  }

  const generating =
    tour.generationStatus === "processing" ||
    tour.generationStatus === "queued" ||
    tour.status === "processing";

  return (
    <div className="fixed inset-0 bg-[#080808] text-white overflow-hidden">
      <div className="absolute inset-0 z-0">
        {!generating && isPhotoUrl(photoUrl) ? (
          <motion.div className="w-full h-full flex items-center justify-center bg-black">
            <img
              src={photoUrl}
              alt={activeRoom?.label ?? "Room photo"}
              className="max-w-full max-h-full object-contain"
            />
          </motion.div>
        ) : generating ? (
          <motion.div className="w-full h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 rounded-xl bg-black/50 border border-white/10 px-6 py-5">
              <Loader2 className="w-6 h-6 animate-spin text-white/80" />
              <p className="text-sm text-white/70">
                Tour is still being generated
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div className="w-full h-full flex items-center justify-center">
            <p className="text-sm text-white/60">No room photos available yet.</p>
          </motion.div>
        )}
      </div>

      <div className="fixed top-0 left-0 right-0 z-30 h-14 bg-[rgba(8,8,8,0.8)] backdrop-blur-xl border-b border-[#222222] flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          {showSidebarMenu && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="h-8 w-8 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 flex items-center justify-center"
              aria-label="Open room list"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
          <WVisionLogo className="h-6 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="h-8 px-3 rounded-md border border-white/20 text-xs text-white/85 hover:bg-white/10 inline-flex items-center gap-1.5"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share
          </button>
          <button
            onClick={() => setShowLeadModal(true)}
            className="h-8 px-3 rounded-md border border-white/20 bg-white/5 text-xs text-white hover:bg-white/12 backdrop-blur-sm"
          >
            Request a Visit
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showSidebarMenu && sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/45"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.22 }}
              className="fixed top-14 left-0 bottom-0 z-50 w-[260px] bg-[rgba(8,8,8,0.97)] backdrop-blur-2xl border-r border-white/10 overflow-y-auto"
            >
              <div className="px-4 py-4 border-b border-white/10">
                <p className="text-[11px] uppercase tracking-wider text-white/45">
                  Property
                </p>
                <p className="text-sm mt-1 leading-snug">{tour.listingAddress}</p>
              </div>
              <div className="px-2 py-2">
                {floors.map(([floor, list]) => (
                  <div key={floor} className="mb-3">
                    <p className="px-2 py-1 text-[11px] uppercase tracking-wider text-white/40">
                      Floor {floor}
                    </p>
                    {list.map((room) => {
                      const active = activeRoom?.id === room.id;
                      return (
                        <button
                          key={room.id}
                          onClick={() => {
                            setActiveRoomId(room.id);
                            setSidebarOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-2 rounded-md text-sm flex items-center gap-2 border-l-2 ${
                            active
                              ? "bg-white/12 border-white/70"
                              : "border-transparent hover:bg-white/5"
                          }`}
                        >
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              room.ready ? "bg-white" : "bg-zinc-500"
                            }`}
                          />
                          <span className="truncate">{room.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLeadModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/55 flex items-center justify-center px-4"
            onClick={() => !leadLoading && setShowLeadModal(false)}
          >
            <motion.form
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              onSubmit={handleLeadSubmit}
              onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[rgba(12,12,12,0.95)] text-white border border-white/15 backdrop-blur-xl p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Interested in this property?</h2>
                <button
                  type="button"
                  onClick={() => !leadLoading && setShowLeadModal(false)}
                  className="h-7 w-7 rounded-md hover:bg-white/10 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Full name *"
                  required
                  value={leadForm.name}
                  onChange={(e) =>
                    setLeadForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="w-full h-10 rounded-md border border-white/20 bg-white/5 px-3 text-sm placeholder:text-white/50"
                />
                <input
                  type="email"
                  placeholder="Email *"
                  required
                  value={leadForm.email}
                  onChange={(e) =>
                    setLeadForm((f) => ({ ...f, email: e.target.value }))
                  }
                  className="w-full h-10 rounded-md border border-white/20 bg-white/5 px-3 text-sm placeholder:text-white/50"
                />
                <input
                  type="tel"
                  placeholder="Phone number (optional)"
                  value={leadForm.phone}
                  onChange={(e) =>
                    setLeadForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  className="w-full h-10 rounded-md border border-white/20 bg-white/5 px-3 text-sm placeholder:text-white/50"
                />
                <textarea
                  placeholder="Message (optional)"
                  value={leadForm.message}
                  onChange={(e) =>
                    setLeadForm((f) => ({ ...f, message: e.target.value }))
                  }
                  className="w-full min-h-24 rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm resize-none placeholder:text-white/50"
                />
              </div>

              <button
                type="submit"
                disabled={leadLoading || leadSuccess}
                className="mt-4 h-10 w-full rounded-md border border-white/20 bg-white/10 text-white text-sm font-semibold hover:bg-white/15 disabled:opacity-60"
              >
                {leadLoading
                  ? "Sending..."
                  : leadSuccess
                  ? "Request sent!"
                  : "Send Request"}
              </button>
              {leadSuccess && (
                <p className="mt-2 text-xs text-white/70 text-center">
                  Request sent! The agent will contact you shortly.
                </p>
              )}
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHint && !generating && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed z-20 left-1/2 -translate-x-1/2 bottom-6 bg-black/65 border border-white/15 rounded-full px-4 py-2 text-xs text-white/90 pointer-events-none text-center"
          >
            Tap a room to preview photos
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
