import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  useGenerateTour,
  useGetGenerationStatus,
  generateTour,
  ApiError,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Link2, Loader2, CheckCircle2, Copy, ExternalLink, AlertCircle,
  ImagePlus, Upload, X, Sparkles, ChevronRight, RefreshCw,
  Globe, Zap, Clock, Image as ImageIcon, Home, Layers, Palette, Scan,
} from "lucide-react";
import {
  loadPendingTour, clearPendingTour,
  filesToPendingPhotos, PendingPhoto,
} from "@/hooks/use-pending-tour";
import { getApiUrl } from "@/lib/runtime-api";

// ─── Types ────────────────────────────────────────────────────────────────────

type GenStatus = "queued" | "processing" | "completed" | "failed";

interface GenerationResult {
  tourId: string;
  shareToken: string;
  generationStatus: GenStatus;
  generatedTourUrl: string | null;
  previewImageUrl: string | null;
  confidenceScore: number;
  roomsDetected: number | null;
  currentStage: string | null;
  errorMessage: string | null;
}

// ─── Stage config ─────────────────────────────────────────────────────────────

const STAGE_STEPS = [
  { key: "queued",     label: "Queued",     icon: Clock },
  { key: "processing", label: "Processing", icon: Zap },
  { key: "completed",  label: "Ready",      icon: CheckCircle2 },
] as const;

function stageIndex(status: GenStatus) {
  if (status === "completed") return 2;
  if (status === "processing") return 1;
  return 0;
}

/**
 * Stage messages cycled through during the "Working through your home" screen.
 * Backend doesn't surface granular Spatial AI engine stages, so we display a synthetic
 * sequence that loops while the user waits. Each step has a hint icon.
 */
const WORK_STAGES = [
  { label: "Analyzing your photos",   icon: Scan },
  { label: "Detecting rooms",         icon: Home },
  { label: "Mapping spatial layout",  icon: Layers },
  { label: "Building the 3D mesh",    icon: Globe },
  { label: "Adding textures & light", icon: Palette },
  { label: "Polishing your tour",     icon: Sparkles },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewTour() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 1=input 2=processing 3=done 4=failed
  const [url, setUrl] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [apifyImageUrls, setApifyImageUrls] = useState<string[]>([]);
  // Per-image room/caption labels parsed from the listing scrape, indexed by
  // image URL. Used to label the scanning badge with a real room name when
  // we have one (e.g. "Living room") instead of a synthetic stage.
  const [apifyImageLabels, setApifyImageLabels] = useState<
    Record<string, string>
  >({});
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isFetchingImages, setIsFetchingImages] = useState(false);
  // Snapshot of the images being worked on — shown in the processing screen's
  // scanning gallery. Captured at submit time so it doesn't change if the user
  // navigates back.
  const [processingImages, setProcessingImages] = useState<string[]>([]);
  // Per-room scenes from the backend (Gemini classification + Spatial AI dispatch).
  // Populated as the status endpoint reports progress.
  const [scenes, setScenes] = useState<
    Array<{
      id: string;
      label: string;
      roomType: string;
      thumbnailUrl: string;
      imageCount: number;
      generationStatus: GenStatus;
      generatedTourUrl: string | null;
    }>
  >([]);

  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const { getAccessToken } = useAuth();
  const generateMutation = useGenerateTour({
    mutation: {
      mutationFn: async (vars: { data: { listingUrl: string; imageUrls?: string[] } }) => {
        const token = await getAccessToken();
        if (!token) {
          throw new Error(
            "Your session expired — sign in again to generate a tour.",
          );
        }
        return generateTour(vars.data, {
          headers: { Authorization: `Bearer ${token}` },
        });
      },
    },
  });

  // Load pending tour from sessionStorage on mount
  useEffect(() => {
    const pending = loadPendingTour();
    if (pending) {
      if (pending.url) setUrl(pending.url);
      if (pending.photos?.length) setPhotos(pending.photos);
    }
  }, []);

  // Auto-extract listing images via the api-server's Apify integration when
  // the user pastes a supported URL (Airbnb today; Booking.com / Zillow next).
  // Debounced so we don't fire on every keystroke.
  const apifyFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const trimmed = url.trim();
    if (!trimmed || trimmed === "manual-upload") {
      setApifyImageUrls([]);
      setApifyImageLabels({});
      return;
    }
    if (apifyFetchRef.current) clearTimeout(apifyFetchRef.current);
    apifyFetchRef.current = setTimeout(async () => {
      try {
        setIsFetchingImages(true);
        const res = await fetch(getApiUrl("/api/scrape-listing"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmed }),
        });
        if (!res.ok) {
          // Unsupported platform (501) etc. — silently leave the user to
          // upload photos manually; the input field's helper text already
          // lists supported platforms.
          setApifyImageUrls([]);
          setApifyImageLabels({});
          return;
        }
        const body = (await res.json()) as {
          success: boolean;
          data?: {
            images?: { url: string; caption?: string | null; room?: string | null }[];
          };
        };
        const list = body?.data?.images ?? [];
        const urls: string[] = [];
        const labels: Record<string, string> = {};
        for (const img of list) {
          if (!img?.url) continue;
          urls.push(img.url);
          const label = img.room || img.caption;
          if (label) labels[img.url] = label;
        }
        setApifyImageUrls(urls.slice(0, 20));
        setApifyImageLabels(labels);
      } catch {
        // Network blip — silently ignore; user can still upload photos.
      } finally {
        setIsFetchingImages(false);
      }
    }, 1500);
    return () => {
      if (apifyFetchRef.current) clearTimeout(apifyFetchRef.current);
    };
  }, [url]);

  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;
    const converted = await filesToPendingPhotos(arr);
    setPhotos((prev) => {
      const existing = new Set(prev.map((p) => p.name));
      const fresh = converted.filter((c) => !existing.has(c.name));
      return [...prev, ...fresh].slice(0, 20);
    });
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const [isUploading, setIsUploading] = useState(false);

  function dataUrlToBlob(dataUrl: string): Blob {
    const [header, data] = dataUrl.split(",");
    const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
    const bytes = atob(data);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  const handleGenerate = async () => {
    if (!url.trim() && !photos.length) return;
    try {
      let uploadedUrls: string[] = [];

      if (photos.length > 0) {
        setIsUploading(true);
        const formData = new FormData();
        for (const photo of photos) {
          const blob = dataUrlToBlob(photo.dataUrl);
          formData.append("images", blob, photo.name);
        }

        // /api/images/upload is auth-gated; without the Supabase bearer
        // token the backend returns 401, which manifested to the user as
        // a generic "check your connection" toast.
        const token = await getAccessToken();
        if (!token) {
          setIsUploading(false);
          toast({
            title: "Please sign in",
            description: "Your session expired — sign in again to upload photos.",
            variant: "destructive",
          });
          setLocation("/login");
          return;
        }

        const uploadRes = await fetch(getApiUrl("/api/images/upload"), {
          method: "POST",
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        setIsUploading(false);

        if (uploadRes.ok) {
          const uploadData = (await uploadRes.json()) as { images: { url: string }[] };
          uploadedUrls = uploadData.images.map((i) => i.url);
        } else {
          let detail = `HTTP ${uploadRes.status}`;
          try {
            const errBody = await uploadRes.json();
            if (errBody?.detail) detail = errBody.detail;
            else if (errBody?.error) detail = errBody.error;
          } catch {
            // Body wasn't JSON — fall back to text snippet
            try {
              const t = await uploadRes.text();
              if (t) detail = t.slice(0, 200);
            } catch {
              // ignore
            }
          }
          toast({
            title: "Upload failed",
            description: detail,
            variant: "destructive",
          });
          return;
        }
      }

      const allImageUrls = [...apifyImageUrls, ...uploadedUrls];

      // Snapshot a preview-friendly set of images for the processing screen.
      // We always want the user to see *their* photos — combine Apify-scraped
      // listing photos with any locally uploaded photo data URLs so the
      // scanning gallery is populated even if one source returned nothing.
      const localPreviewUrls = photos.map((p) => p.dataUrl);
      const galleryImages = [
        ...apifyImageUrls,
        ...localPreviewUrls,
      ];
      setProcessingImages(galleryImages.slice(0, 12));

      const res = await generateMutation.mutateAsync({
        data: {
          listingUrl: url.trim() || "manual-upload",
          imageUrls: allImageUrls.filter(
            (u): u is string => typeof u === "string" && u.length > 0,
          ),
        },
      });
      setResult({
        tourId: res.tourId,
        shareToken: res.shareToken,
        // Skip the visual "queued" pause — by the time the response lands
        // we're already past upload and image-prep on the server.
        generationStatus: "processing",
        generatedTourUrl: null,
        previewImageUrl: null,
        confidenceScore: 0,
        roomsDetected: null,
        currentStage: "Analyzing your photos…",
        errorMessage: null,
      });
      clearPendingTour();
      setStep(2);
    } catch (err) {
      setIsUploading(false);
      let description =
        "Something went wrong. Check your connection and try again.";
      if (err instanceof ApiError) {
        description = err.message;
        const payload = err.data as {
          error?: string;
          code?: string;
          message?: string;
        } | null;
        if (typeof payload?.error === "string" && payload.error.trim()) {
          description = payload.error;
        } else if (typeof payload?.message === "string" && payload.message.trim()) {
          description = payload.message;
        }
      } else if (err instanceof Error) {
        description = err.message;
      }
      const unauthorized =
        (err instanceof ApiError && err.status === 401) ||
        (err instanceof Error && /sign in|session expired/i.test(err.message));
      const limitReached =
        err instanceof ApiError &&
        (err.status === 403 ||
          (err.data as { code?: string } | null)?.code === "LIMIT_REACHED");
      const apiNotReachable =
        err instanceof ApiError &&
        (err.status === 405 ||
          err.status === 404 ||
          err.status === 502 ||
          err.status === 503);
      toast({
        title: unauthorized
          ? "Please sign in"
          : limitReached
          ? "Tour limit reached"
          : "Could not start generation",
        description: apiNotReachable
          ? "The app could not reach the API server. Set VITE_API_BASE_URL in Vercel to your live API URL (e.g. Railway), or update vercel.json to proxy /api to that host."
          : description,
        variant: "destructive",
      });
      if (unauthorized) {
        setLocation("/login");
      }
    }
  };

  // Poll generation status — fast (2.5s) so the user moves out of "queued"
  // immediately when the backend updates the status, and lands on "completed"
  // the moment the spatial AI engine (or the dry-run fallback) finishes.
  const tourId = result?.tourId ?? null;
  const { data: statusData } = useGetGenerationStatus(tourId as string, {
    query: {
      enabled: !!tourId && step === 2,
      refetchInterval: 2500,
      queryKey: ["gen-status", tourId],
    },
  });

  useEffect(() => {
    if (!statusData) return;
    const gs = statusData.generationStatus as GenStatus;
    // The generated `GenerationStatus` type doesn't yet include `scenes` —
    // cast through unknown so we can pick it up without regenerating the
    // OpenAPI client.
    const extendedStatus = statusData as unknown as {
      scenes?: Array<{
        id: string;
        label: string;
        roomType: string;
        thumbnailUrl: string;
        imageCount: number;
        generationStatus: GenStatus;
        generatedTourUrl: string | null;
      }>;
    };
    setResult((prev) => {
      if (!prev) return prev;
      const nextStatus: GenStatus =
        gs === "queued" && prev.generationStatus === "processing"
          ? "processing"
          : gs;
      return {
        ...prev,
        generationStatus: nextStatus,
        generatedTourUrl: statusData.generatedTourUrl ?? prev.generatedTourUrl,
        previewImageUrl: statusData.previewImageUrl ?? prev.previewImageUrl,
        confidenceScore: statusData.confidenceScore ?? prev.confidenceScore,
        roomsDetected: statusData.roomsDetected ?? prev.roomsDetected,
        currentStage: statusData.currentStage ?? prev.currentStage,
        errorMessage: statusData.errorMessage ?? prev.errorMessage,
      };
    });
    if (extendedStatus.scenes) {
      setScenes(extendedStatus.scenes);
    }
    if (gs === "completed") setStep(3);
    if (gs === "failed") setStep(4);
  }, [statusData]);

  const urlPasted = url.trim().length > 0;
  const hasPhotos = photos.length > 0;
  const canSubmit = urlPasted || hasPhotos;
  const totalImages = apifyImageUrls.length + photos.length;

  const shareUrl = result ? `${window.location.origin}/tour/${result.shareToken}` : "";

  // Cycle a synthetic "work stage" every 4s while step 2 is visible so the
  // user sees motion even if the backend doesn't push fine-grained progress.
  const [workStageIndex, setWorkStageIndex] = useState(0);
  useEffect(() => {
    if (step !== 2) return;
    const id = window.setInterval(() => {
      setWorkStageIndex((i) => (i + 1) % WORK_STAGES.length);
    }, 4000);
    return () => window.clearInterval(id);
  }, [step]);

  // Highlight one image at a time in the scanning gallery (rotates every 2s).
  const [scanIndex, setScanIndex] = useState(0);
  useEffect(() => {
    if (step !== 2 || processingImages.length <= 1) return;
    const id = window.setInterval(() => {
      setScanIndex((i) => (i + 1) % processingImages.length);
    }, 2000);
    return () => window.clearInterval(id);
  }, [step, processingImages.length]);

  const currentWorkStage = useMemo(
    () => WORK_STAGES[workStageIndex],
    [workStageIndex],
  );

  return (
    <div className="flex-1 flex items-start justify-center p-6 relative">
      <AnimatePresence mode="wait">

        {/* ── Step 1: Input ─────────────────────────────────────────────── */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-2xl"
          >
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 bg-primary" />
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">New Tour</span>
              </div>
              <h2 className="text-4xl font-serif mb-1">CREATE NEW TOUR</h2>
              <p className="text-muted-foreground text-sm">
                Paste a listing URL, upload photos, or both for the best results.
              </p>
            </div>

            <div className="bg-card border-2 border-foreground shadow-[6px_6px_0px_0px_#1A1714] overflow-hidden">
              {/* Window titlebar */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b-2 border-foreground bg-foreground">
                <span className="w-2 h-2 bg-primary" />
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-background">Tour Generator</span>
              </div>
              {/* URL section */}
              <div className="p-6 border-b-2 border-foreground">
                <label className="text-xs font-mono font-bold uppercase tracking-widest mb-3 flex items-center gap-2 text-muted-foreground">
                  <Link2 className="w-3.5 h-3.5" /> Listing URL
                </label>
                <div className="flex items-center gap-2 px-3 h-11 bg-background border-2 border-foreground focus-within:border-primary transition-all">
                  <input
                    type="url"
                    placeholder="https://zillow.com/homedetails/…"
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={generateMutation.isPending || isUploading}
                  />
                  {url && (
                    <button onClick={() => setUrl("")} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {/* Apify image count badge */}
                <AnimatePresence>
                  {urlPasted && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-2 overflow-hidden"
                    >
                      {isFetchingImages ? (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 animate-spin" /> Fetching listing images…
                        </p>
                      ) : apifyImageUrls.length > 0 ? (
                        <p className="text-xs text-emerald-600 flex items-center gap-1.5">
                          <ImageIcon className="w-3 h-3" />
                          {apifyImageUrls.length} listing images found — will be sent to generation
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Globe className="w-3 h-3" /> Supports Zillow, Airbnb, Bayut, Property Finder
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Photos section */}
              <div className="p-6 border-b-2 border-foreground">
                <label className="text-xs font-mono font-bold uppercase tracking-widest mb-3 flex items-center gap-2 text-muted-foreground">
                  <ImagePlus className="w-3.5 h-3.5" /> Extra Photos
                  <span className="text-xs font-normal text-muted-foreground normal-case tracking-normal">
                    (optional — improves 3D quality)
                  </span>
                </label>

                <div
                  className={`border-2 border-dashed transition-all cursor-pointer ${
                    dragging
                      ? "border-primary bg-primary/5"
                      : "border-foreground/30 hover:border-foreground hover:bg-accent/30"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  {hasPhotos ? (
                    <div className="p-4 flex gap-2 flex-wrap">
                      {photos.map((photo) => (
                        <div
                          key={photo.name}
                          className="relative group w-16 h-16 overflow-hidden border-2 border-foreground shrink-0"
                        >
                          <img src={photo.dataUrl} alt={photo.name} className="w-full h-full object-cover" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPhotos((p) => p.filter((x) => x.name !== photo.name));
                            }}
                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center"
                          >
                            <X className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      ))}
                      <div className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
                        <Upload className="w-5 h-5" />
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 flex flex-col items-center gap-2 text-center">
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
                        <ImagePlus className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-medium">Drag & drop or click to add photos</p>
                      <p className="text-xs text-muted-foreground">JPG, PNG, WEBP — up to 20 photos</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </div>

              {/* Smart nudge */}
              <AnimatePresence>
                {urlPasted && !hasPhotos && !isFetchingImages && apifyImageUrls.length === 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="px-6 py-3 bg-[#00C853]/10 border-l-4 border-[#00C853] flex items-center gap-3 cursor-pointer hover:bg-[#00C853]/20 transition-colors"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Sparkles className="w-4 h-4 text-[#00C853] shrink-0" />
                      <p className="text-sm font-bold uppercase tracking-wide flex-1">
                        Add extra photos to improve 3D quality
                      </p>
                      <ChevronRight className="w-4 h-4 text-foreground shrink-0" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Summary strip */}
              <AnimatePresence>
                {totalImages > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 py-3 border-b border-border bg-muted/30 flex items-center gap-2 text-xs text-muted-foreground">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>
                        {totalImages} image{totalImages !== 1 ? "s" : ""} ready for 3D generation
                        {apifyImageUrls.length > 0 && photos.length > 0
                          ? ` (${apifyImageUrls.length} from listing, ${photos.length} uploaded)`
                          : apifyImageUrls.length > 0
                          ? ` from listing`
                          : ` uploaded`}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit */}
              <div className="p-6">
                <Button
                  onClick={handleGenerate}
                  disabled={!canSubmit || generateMutation.isPending || isUploading}
                  size="lg"
                  className="w-full"
                >
                  {isUploading ? (
                    <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Uploading photos…</>
                  ) : generateMutation.isPending ? (
                    <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Starting generation…</>
                  ) : (
                    "Generate 3D Tour →"
                  )}
                </Button>
                {!canSubmit && (
                  <p className="text-center text-xs text-muted-foreground mt-2">
                    Paste a URL or upload photos to continue
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Step 2: Processing — "Working through your home" ──────────── */}
        {step === 2 && result && (
          <motion.div
            key="step2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-4xl"
          >
            <div className="bg-card border-2 border-foreground shadow-[6px_6px_0px_0px_#1A1714] overflow-hidden">
              {/* Window titlebar */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b-2 border-foreground bg-foreground">
                <span className="w-2 h-2 bg-primary animate-pulse" />
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-background">
                  Working Through Your Home
                </span>
                <span className="ml-auto text-[10px] font-mono text-background/60 uppercase tracking-widest">
                  Live
                </span>
              </div>

              <div className="p-6 md:p-8 grid md:grid-cols-[1fr_280px] gap-6">
                {/* ── Scanning gallery ─────────────────────────────────── */}
                <div className="space-y-4">
                  {processingImages.length > 0 ? (
                    <>
                      <div className="relative aspect-[16/10] bg-foreground border-2 border-foreground overflow-hidden">
                        <AnimatePresence mode="wait">
                          <motion.img
                            key={scanIndex}
                            src={processingImages[scanIndex]}
                            alt={`Listing photo ${scanIndex + 1}`}
                            initial={{ opacity: 0, scale: 1.05 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.5 }}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        </AnimatePresence>

                        {/* Scanning line sweep */}
                        <motion.div
                          aria-hidden
                          className="absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_24px_4px_rgba(255,0,90,0.6)] pointer-events-none"
                          animate={{ top: ["0%", "100%", "0%"] }}
                          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                        />

                        {/* Grid overlay for that "AI scanning" feel */}
                        <div
                          aria-hidden
                          className="absolute inset-0 pointer-events-none opacity-30"
                          style={{
                            backgroundImage:
                              "linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)",
                            backgroundSize: "32px 32px",
                          }}
                        />

                        {/* Bottom badge — prefer a real room label from the
                            listing scrape over the synthetic stage label. */}
                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
                          <div className="bg-background/95 border-2 border-foreground px-2.5 py-1.5 flex items-center gap-2">
                            {(() => {
                              const StageIcon = currentWorkStage.icon;
                              return <StageIcon className="w-3.5 h-3.5 text-primary" />;
                            })()}
                            <span className="text-[11px] font-mono font-bold uppercase tracking-widest">
                              {(() => {
                                const src = processingImages[scanIndex];
                                const label = src ? apifyImageLabels[src] : null;
                                return label
                                  ? `Analyzing: ${label}`
                                  : currentWorkStage.label;
                              })()}
                            </span>
                          </div>
                          <div className="bg-foreground border-2 border-foreground px-2 py-1 text-[10px] font-mono text-background uppercase tracking-widest">
                            {scanIndex + 1} / {processingImages.length}
                          </div>
                        </div>
                      </div>

                      {/* Thumbnail strip */}
                      {processingImages.length > 1 && (
                        <div className="flex gap-1.5 overflow-x-auto pb-1">
                          {processingImages.map((src, i) => (
                            <button
                              key={`${src}-${i}`}
                              type="button"
                              onClick={() => setScanIndex(i)}
                              className={`relative shrink-0 w-14 h-14 border-2 overflow-hidden transition-all ${
                                i === scanIndex
                                  ? "border-primary shadow-[2px_2px_0px_0px_#1A1714]"
                                  : "border-foreground/30 opacity-60 hover:opacity-100"
                              }`}
                              aria-label={`Show photo ${i + 1}`}
                            >
                              <img src={src} alt="" className="w-full h-full object-cover" />
                              {i === scanIndex && (
                                <div className="absolute inset-0 ring-2 ring-primary ring-inset pointer-events-none" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    // Fallback when we have no images (rare — only if generation
                    // started before photos were attached).
                    <div className="relative aspect-[16/10] bg-foreground border-2 border-foreground overflow-hidden flex items-center justify-center">
                      <div className="text-center text-background space-y-3">
                        <div className="relative w-20 h-20 mx-auto">
                          <div className="w-20 h-20 border-4 border-background/20 rounded-full" />
                          <div className="absolute inset-0 w-20 h-20 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Globe className="w-7 h-7 text-primary" />
                          </div>
                        </div>
                        <p className="text-xs font-mono uppercase tracking-widest opacity-80">
                          Building your 3D world…
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Right column: stages + meta ──────────────────────── */}
                <div className="flex flex-col gap-5">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 bg-primary" />
                      <span className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">
                        Status
                      </span>
                    </div>
                    <h2 className="font-serif text-2xl md:text-3xl leading-tight">
                      Working through your home
                    </h2>
                    <p className="text-muted-foreground text-sm mt-1">
                      Hang tight — your virtual tour is being assembled.
                    </p>
                  </div>

                  {/* Live stage list */}
                  <ul className="space-y-1.5">
                    {WORK_STAGES.map((s, i) => {
                      const Icon = s.icon;
                      const done = i < workStageIndex;
                      const active = i === workStageIndex;
                      return (
                        <li
                          key={s.label}
                          className={`flex items-center gap-2.5 px-3 py-2 border-2 transition-all ${
                            active
                              ? "border-foreground bg-primary/10"
                              : done
                              ? "border-foreground/20"
                              : "border-transparent"
                          }`}
                        >
                          <div
                            className={`w-6 h-6 border-2 flex items-center justify-center shrink-0 ${
                              done
                                ? "bg-foreground border-foreground text-background"
                                : active
                                ? "border-foreground bg-background animate-pulse"
                                : "border-foreground/30 bg-background text-muted-foreground"
                            }`}
                          >
                            {done ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : active ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Icon className="w-3 h-3" />
                            )}
                          </div>
                          <span
                            className={`text-xs font-mono uppercase tracking-wide ${
                              active
                                ? "font-bold"
                                : done
                                ? ""
                                : "text-muted-foreground"
                            }`}
                          >
                            {s.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Detected rooms — shows up once Gemini classification lands */}
                  {scenes.length > 0 && (
                    <div className="border-2 border-foreground/20 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                          Rooms detected
                        </span>
                        <span className="text-[10px] font-mono text-primary">
                          {scenes.filter((s) => s.generationStatus === "completed").length}/{scenes.length} ready
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {scenes.map((s) => {
                          const ready = s.generationStatus === "completed";
                          const failed = s.generationStatus === "failed";
                          return (
                            <li
                              key={s.id}
                              className="flex items-center gap-2 text-xs"
                            >
                              <img
                                src={s.thumbnailUrl}
                                alt=""
                                className="w-6 h-6 rounded object-cover border border-foreground/10"
                              />
                              <span className="flex-1 truncate">{s.label}</span>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {s.imageCount} photo{s.imageCount === 1 ? "" : "s"}
                              </span>
                              {ready ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                              ) : failed ? (
                                <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                              ) : (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* Meta grid */}
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="border-2 border-foreground/20 px-3 py-2">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        Photos
                      </div>
                      <div className="font-bold text-lg">
                        {processingImages.length || totalImages || "—"}
                      </div>
                    </div>
                    <div className="border-2 border-foreground/20 px-3 py-2">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        ETA
                      </div>
                      <div className="font-bold text-lg">
                        ~{statusData?.estimatedMinutes ?? 3}m
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground font-mono leading-relaxed">
                    Safe to close this window — generation continues in the
                    background and we'll surface it on your dashboard when it's
                    ready.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Step 3: Completed ─────────────────────────────────────────── */}
        {step === 3 && result && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-8 text-center border-b border-border">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-3xl font-display font-bold mb-1">Tour Ready!</h2>
              <p className="text-muted-foreground text-sm">Your 3D world has been generated</p>
            </div>

            <div className="p-6 grid sm:grid-cols-2 gap-6">
              {/* Preview */}
              <div className="aspect-video bg-muted rounded-xl overflow-hidden relative">
                {result.previewImageUrl ? (
                  <img
                    src={result.previewImageUrl}
                    alt="Tour preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground font-mono text-sm">
                    No Preview
                  </div>
                )}
                {result.roomsDetected ? (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                    <span className="text-white text-sm font-medium">
                      {result.roomsDetected} rooms detected
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Stats + actions */}
              <div className="flex flex-col gap-3">
                {result.confidenceScore > 0 && (
                  <div className="p-3 border border-border rounded-xl bg-background text-center">
                    <div className="text-xs text-muted-foreground mb-0.5">AI Confidence</div>
                    <div className="text-3xl font-display font-bold text-primary">
                      {Math.round(result.confidenceScore)}%
                    </div>
                  </div>
                )}

                <Button
                  variant="outline"
                  className="w-full justify-between border-primary/30 text-primary hover:bg-primary/5"
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    toast({ title: "Link copied!" });
                  }}
                >
                  Copy Share Link <Copy className="w-4 h-4" />
                </Button>

                <Button
                  className="w-full justify-between bg-primary text-primary-foreground font-bold"
                  onClick={() => window.open(`/tour/${result.shareToken}`, "_blank")}
                >
                  Open 3D Tour <ExternalLink className="w-4 h-4" />
                </Button>

                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => setLocation("/dashboard")}
                >
                  Back to Dashboard
                </Button>
              </div>
            </div>

            {/* 3D viewer opens in-app on the public tour route */}
          </motion.div>
        )}

        {/* ── Step 4: Failed ────────────────────────────────────────────── */}
        {step === 4 && result && (
          <motion.div
            key="step4"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg bg-card border border-destructive/30 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-destructive" />
              </div>
              <h2 className="text-2xl font-display font-bold mb-2">Generation Failed</h2>
              {result.errorMessage && (
                <p className="text-sm text-muted-foreground mb-4">{result.errorMessage}</p>
              )}
              <p className="text-xs text-muted-foreground mb-6">
                This can happen due to image quality issues or a temporary service disruption.
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={() => {
                    setStep(1);
                    setResult(null);
                  }}
                  className="bg-primary text-primary-foreground font-bold"
                >
                  <RefreshCw className="w-4 h-4 mr-2" /> Try Again
                </Button>
                <Button variant="outline" onClick={() => setLocation("/dashboard")}>
                  Dashboard
                </Button>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
