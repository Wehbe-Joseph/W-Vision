import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useGenerateTour, useGetGenerationStatus } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Link2, Loader2, CheckCircle2, Copy, ExternalLink, AlertCircle,
  ImagePlus, Upload, X, Sparkles, ChevronRight, RefreshCw,
  Globe, Zap, Clock, Image as ImageIcon,
} from "lucide-react";
import {
  loadPendingTour, clearPendingTour,
  filesToPendingPhotos, PendingPhoto,
} from "@/hooks/use-pending-tour";

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewTour() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 1=input 2=processing 3=done 4=failed
  const [url, setUrl] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [apifyImageUrls, setApifyImageUrls] = useState<string[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isFetchingImages, setIsFetchingImages] = useState(false);

  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const generateMutation = useGenerateTour();
  const { getAccessToken } = useAuth();

  // Load pending tour from sessionStorage on mount
  useEffect(() => {
    const pending = loadPendingTour();
    if (pending) {
      if (pending.url) setUrl(pending.url);
      if (pending.photos?.length) setPhotos(pending.photos);
    }
  }, []);

  // Auto-extract Apify images when a URL is pasted (debounced)
  const apifyFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!url.trim() || url === "manual-upload") {
      setApifyImageUrls([]);
      return;
    }
    if (apifyFetchRef.current) clearTimeout(apifyFetchRef.current);
    apifyFetchRef.current = setTimeout(async () => {
      try {
        setIsFetchingImages(true);
        const res = await fetch("/apify-server/get-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });
        if (res.ok) {
          const data = await res.json();
          const images: string[] = [];
          if (Array.isArray(data)) {
            for (const item of data) {
              if (item.photos) images.push(...item.photos.slice(0, 20));
              if (item.imageUrls) images.push(...item.imageUrls.slice(0, 20));
              if (item.images) {
                for (const img of item.images) {
                  if (typeof img === "string") images.push(img);
                  else if (img?.url) images.push(img.url);
                }
              }
            }
          }
          setApifyImageUrls(images.slice(0, 20));
        }
      } catch {
        // Silently ignore Apify errors
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

        const uploadRes = await fetch("/api/images/upload", {
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

      const res = await generateMutation.mutateAsync({
        data: {
          listingUrl: url.trim() || "manual-upload",
          imageUrls: allImageUrls,
        },
      });
      setResult({
        tourId: res.tourId,
        shareToken: res.shareToken,
        generationStatus: "queued",
        generatedTourUrl: null,
        previewImageUrl: null,
        confidenceScore: 0,
        roomsDetected: null,
        currentStage: "Queued for generation…",
        errorMessage: null,
      });
      clearPendingTour();
      setStep(2);
    } catch {
      setIsUploading(false);
      toast({ title: "Error", description: "Failed to start generation", variant: "destructive" });
    }
  };

  // Poll generation status
  const tourId = result?.tourId ?? null;
  const { data: statusData } = useGetGenerationStatus(tourId as string, {
    query: {
      enabled: !!tourId && step === 2,
      refetchInterval: 8000,
      queryKey: ["gen-status", tourId],
    },
  });

  useEffect(() => {
    if (!statusData) return;
    const gs = statusData.generationStatus as GenStatus;
    setResult((prev) =>
      prev
        ? {
            ...prev,
            generationStatus: gs,
            generatedTourUrl: statusData.generatedTourUrl ?? prev.generatedTourUrl,
            previewImageUrl: statusData.previewImageUrl ?? prev.previewImageUrl,
            confidenceScore: statusData.confidenceScore ?? prev.confidenceScore,
            roomsDetected: statusData.roomsDetected ?? prev.roomsDetected,
            currentStage: statusData.currentStage ?? prev.currentStage,
            errorMessage: statusData.errorMessage ?? prev.errorMessage,
          }
        : prev,
    );
    if (gs === "completed") setStep(3);
    if (gs === "failed") setStep(4);
  }, [statusData]);

  const urlPasted = url.trim().length > 0;
  const hasPhotos = photos.length > 0;
  const canSubmit = urlPasted || hasPhotos;
  const totalImages = apifyImageUrls.length + photos.length;

  const shareUrl = result ? `${window.location.origin}/tour/${result.shareToken}` : "";

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

        {/* ── Step 2: Processing ────────────────────────────────────────── */}
        {step === 2 && result && (
          <motion.div
            key="step2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-2xl text-center"
          >
            {/* Spinner */}
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="w-24 h-24 border-4 border-primary/20 rounded-full" />
              <div className="absolute inset-0 w-24 h-24 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Globe className="w-8 h-8 text-primary/60" />
              </div>
            </div>

            <h2 className="text-3xl font-display font-bold mb-2">Building your 3D world…</h2>
            <p className="text-primary font-mono text-sm mb-8">
              {result.currentStage || "Initializing generation…"}
            </p>

            {/* Stage track */}
            <div className="flex justify-center items-center gap-0 mb-10 max-w-sm mx-auto">
              {STAGE_STEPS.map((s, i) => {
                const current = stageIndex(result.generationStatus);
                const done = i < current;
                const active = i === current;
                const Icon = s.icon;
                return (
                  <div key={s.key} className="flex items-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                          done
                            ? "bg-primary border-primary text-primary-foreground"
                            : active
                            ? "border-primary text-primary bg-primary/10 animate-pulse"
                            : "border-border text-muted-foreground bg-background"
                        }`}
                      >
                        {done ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <Icon className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <span className={`text-xs font-mono uppercase ${active ? "text-primary font-bold" : done ? "text-primary" : "text-muted-foreground"}`}>
                        {s.label}
                      </span>
                    </div>
                    {i < STAGE_STEPS.length - 1 && (
                      <div
                        className={`w-16 h-0.5 mx-1 mb-5 transition-all ${
                          done ? "bg-primary" : "bg-border"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 text-left space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Estimated time remaining</span>
                <span className="font-mono font-bold">
                  ~{statusData?.estimatedMinutes ?? 5} min
                </span>
              </div>
              {totalImages > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Images being processed</span>
                  <span className="font-mono font-bold">{totalImages}</span>
                </div>
              )}
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  You can safely close this window — generation continues in the background.
                  We'll update your dashboard when it's ready.
                </p>
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

            {/* Inline preview of the WVision tour viewer */}
            {result.shareToken && (
              <div className="px-6 pb-6">
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-2 text-xs text-muted-foreground">
                    <Globe className="w-3.5 h-3.5" />
                    <span>3D World Preview</span>
                  </div>
                  <iframe
                    src={`/tour/${result.shareToken}`}
                    className="w-full aspect-video border-0"
                    allow="xr-spatial-tracking; gyroscope; accelerometer"
                    allowFullScreen
                    title="3D Virtual Tour"
                  />
                </div>
              </div>
            )}
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
