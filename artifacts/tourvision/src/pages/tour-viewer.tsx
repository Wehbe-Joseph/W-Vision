import { useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, PanelLeftOpen, Share2, X } from "lucide-react";
import { ApiError, useGetPublicTour } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import WVisionLogo from "@/components/WVisionLogo";
import PannellumViewer from "@/components/tour/PannellumViewer";
import TourRoomSidebar from "@/components/tour/TourRoomSidebar";
import AddRoomDialog from "@/components/tour/AddRoomDialog";
import type { PendingPhoto } from "@/hooks/use-pending-tour";
import { getApiUrl } from "@/lib/runtime-api";
import {
  hasAiPanorama,
  panoramaUrlForViewer,
  pickPanoramaRoomsForViewer,
} from "@/lib/panorama-rooms";
import UnlockFullHouseCard from "@/components/billing/UnlockFullHouseCard";

interface TourPhotoPanorama {
  roomLabel?: string | null;
  roomType?: string | null;
  panoramaUrl?: string | null;
  thumbnailUrl?: string | null;
  panoramaStatus?: string | null;
  floorNumber?: number | null;
  isAiGenerated?: boolean;
}

interface ScenePanorama {
  id?: string;
  label?: string;
  roomType?: string;
  generationStatus?: string;
  generatedTourUrl?: string | null;
  locked?: boolean;
}

interface PublicTourLike {
  id?: string;
  listingAddress?: string | null;
  listingPlatform?: string | null;
  status?: string | null;
  generationStatus?: string | null;
  panoramaStatus?: string | null;
  isFullHouse?: boolean;
  fullHouseUnlocked?: boolean;
  previewImageUrl?: string | null;
  rooms?: TourPhotoPanorama[];
  scenes?: ScenePanorama[];
}

export default function TourViewer() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  const shareToken = params.shareToken || "";

  const { data, isLoading, error } = useGetPublicTour(shareToken, {
    query: {
      enabled: !!shareToken,
      queryKey: ["public-tour", shareToken],
      refetchInterval: 4000,
    },
  });
  const tour = (data ?? null) as PublicTourLike | null;

  const [activeSceneId, setActiveSceneId] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [addingRoom, setAddingRoom] = useState(false);
  const [pendingRoomLabel, setPendingRoomLabel] = useState<string | null>(null);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadSuccess, setLeadSuccess] = useState(false);
  const [leadForm, setLeadForm] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  const panoramaRooms = useMemo(() => {
    const fromPhotos = pickPanoramaRoomsForViewer(tour?.rooms ?? []);
    if (fromPhotos.length > 0) {
      return fromPhotos.map((r) => ({
        ...r,
        panoramaUrl: panoramaUrlForViewer(r),
      }));
    }

    return (tour?.scenes ?? [])
      .filter(
        (s) =>
          s.generationStatus === "completed" &&
          typeof s.generatedTourUrl === "string" &&
          s.generatedTourUrl.length > 0,
      )
      .map((s, i) => ({
        sceneId: s.id ? `scene-${s.id}` : `scene-fallback-${i}`,
        roomType: s.roomType ?? s.label ?? "Room",
        panoramaUrl: s.generatedTourUrl!,
        floorNumber: i + 1,
        isAiGenerated: true,
      }));
  }, [tour?.rooms, tour?.scenes]);

  const resolvedActiveSceneId =
    activeSceneId && panoramaRooms.some((r) => r.sceneId === activeSceneId)
      ? activeSceneId
      : panoramaRooms[0]?.sceneId ?? "";

  const canEditTour = isAuthenticated && !!tour?.id;

  async function handleAddRoom(photos: PendingPhoto[]) {
    if (!tour?.id) {
      toast({ title: "Tour not loaded", variant: "destructive" });
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      toast({
        title: "Sign in required",
        description: "Log in to add rooms to your tour.",
        variant: "destructive",
      });
      return;
    }

    setAddingRoom(true);
    setPendingRoomLabel("New room…");
    try {
      const res = await fetch(getApiUrl(`/api/tours/${tour.id}/rooms/add`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          uploadedImages: photos.map((p) => ({
            name: p.name,
            dataUrl: p.dataUrl,
          })),
        }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        room?: {
          sceneId?: string;
          label?: string;
          roomType?: string;
        };
      };

      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      await queryClient.invalidateQueries({
        queryKey: ["public-tour", shareToken],
      });

      if (body.room?.sceneId) setActiveSceneId(body.room.sceneId);

      toast({
        title: "Room added",
        description: body.room?.label
          ? `${body.room.label} is ready in 360°.`
          : "Your new room panorama is ready.",
      });
    } catch (err) {
      toast({
        title: "Could not add room",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setAddingRoom(false);
      setPendingRoomLabel(null);
    }
  }

  const isFreetier = false;

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
    const loadFailed = apiErr != null;
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
              Pay $29 to unlock the full house and remove the countdown.
            </p>
            <Button
              className="mt-5 bg-white text-black hover:bg-white/90"
              onClick={() => setLocation("/dashboard/billing")}
            >
              Unlock full house
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 bg-[#080808] flex items-center justify-center text-white">
        <div className="text-center max-w-md px-6">
          <div className="text-3xl font-semibold tracking-tight mb-2">
            WVISION
          </div>
          <p className="text-white/60">
            {loadFailed
              ? "Could not load this tour."
              : "Tour not found."}
          </p>
          {loadFailed && (
            <p className="text-white/40 mt-2 text-xs font-mono break-all">
              {apiErr.message}
              {apiErr.status ? ` (HTTP ${apiErr.status})` : ""}
            </p>
          )}
          <p className="text-white/40 mt-3 text-xs">
            Check that the site API is up:{" "}
            <code className="text-white/60">{getApiUrl("/api/healthz")}</code>
          </p>
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
    tour.panoramaStatus === "processing" ||
    tour.status === "processing";

  const hasPanoramas = panoramaRooms.length > 0;
  const has360Panoramas =
    hasPanoramas && panoramaRooms.some((r) => hasAiPanorama(r));

  const lockedRoomsCount = useMemo(
    () =>
      (tour?.scenes ?? []).filter(
        (s) => s.locked && s.generationStatus !== "completed",
      ).length,
    [tour?.scenes],
  );
  const showUnlockCta =
    canEditTour &&
    !!tour?.id &&
    lockedRoomsCount > 0 &&
    !tour.fullHouseUnlocked;

  return (
    <div className="fixed inset-0 bg-[#080808] text-white overflow-hidden">
      <div className="absolute inset-0 z-0 top-14 flex">
        {!generating && has360Panoramas ? (
          <>
            {sidebarOpen ? (
              <TourRoomSidebar
                rooms={[
                  ...panoramaRooms.map((r) => ({
                    sceneId: r.sceneId,
                    roomType: r.roomType,
                  })),
                  ...(pendingRoomLabel
                    ? [
                        {
                          sceneId: "__pending__",
                          roomType: pendingRoomLabel,
                          isGenerating: true,
                        },
                      ]
                    : []),
                ]}
                activeSceneId={resolvedActiveSceneId || "__pending__"}
                onSelectRoom={setActiveSceneId}
                onAddRoom={canEditTour ? () => setShowAddRoom(true) : undefined}
                addDisabled={addingRoom}
                onClose={() => setSidebarOpen(false)}
              />
            ) : null}
            <div className="flex-1 min-w-0 relative">
              {!sidebarOpen ? (
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open rooms sidebar"
                  className="absolute left-3 top-3 z-20 h-9 px-3 rounded-lg border border-white/20 bg-black/60 backdrop-blur-sm text-white/90 text-xs font-medium hover:bg-black/80 inline-flex items-center gap-2"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                  Rooms
                </button>
              ) : null}
              <PannellumViewer
                rooms={panoramaRooms}
                isFreetier={isFreetier}
                activeSceneId={resolvedActiveSceneId}
                onActiveSceneIdChange={setActiveSceneId}
                hideBottomNav={sidebarOpen}
              />
            </div>
            <AddRoomDialog
              open={showAddRoom}
              onOpenChange={setShowAddRoom}
              loading={addingRoom}
              onSubmit={handleAddRoom}
            />
            {showUnlockCta ? (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 w-full max-w-lg px-4 pointer-events-auto">
                <UnlockFullHouseCard
                  tourId={tour.id!}
                  lockedRoomsCount={lockedRoomsCount}
                  className="border-white/20 bg-black/80 text-white [&_h3]:text-white [&_p]:text-white/70"
                />
              </div>
            ) : null}
          </>
        ) : !generating && hasPanoramas ? (
          <div className="w-full h-full flex items-center justify-center px-6 text-center">
            <div className="max-w-md space-y-3">
              <p className="text-white/90 font-medium">
                360° panoramas are not ready for this tour yet.
              </p>
              <p className="text-white/50 text-sm">
                Generate a new tour from your listing URL so we can classify all
                photos and build room panoramas.
              </p>
            </div>
          </div>
        ) : generating ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 rounded-xl bg-black/50 border border-white/10 px-6 py-5">
              <Loader2 className="w-6 h-6 animate-spin text-white/80" />
              <p className="text-sm text-white/70">
                Building your 360° tour…
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-sm text-white/60">
              Panoramas are not ready yet. Check back shortly.
            </p>
          </div>
        )}
      </div>

      <div className="fixed top-0 left-0 right-0 z-30 h-14 bg-[rgba(8,8,8,0.8)] backdrop-blur-xl border-b border-[#222222] flex items-center justify-between px-4">
        <WVisionLogo className="h-6 w-auto object-contain" />
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
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
