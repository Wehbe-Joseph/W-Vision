import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useCreateTour, useGetTourStatus, useGetTour } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Link2, Loader2, CheckCircle2, Copy, ExternalLink, AlertCircle,
  ImagePlus, Upload, X, Sparkles, ChevronRight
} from "lucide-react";
import {
  loadPendingTour, clearPendingTour, savePendingTour,
  filesToPendingPhotos, PendingPhoto
} from "@/hooks/use-pending-tour";

export default function NewTour() {
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [tourId, setTourId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const createMutation = useCreateTour();

  // Load pending tour from sessionStorage on mount
  useEffect(() => {
    const pending = loadPendingTour();
    if (pending) {
      if (pending.url) setUrl(pending.url);
      if (pending.photos?.length) setPhotos(pending.photos);
    }
  }, []);

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

  const handleCreate = async () => {
    if (!url.trim() && !photos.length) return;
    try {
      const res = await createMutation.mutateAsync({
        data: { listingUrl: url.trim() || "manual-upload" },
      });
      setTourId(res.tourId);
      setShareToken(res.shareToken);
      clearPendingTour();
      setStep(2);
    } catch {
      toast({ title: "Error", description: "Failed to create tour", variant: "destructive" });
    }
  };

  const { data: statusData } = useGetTourStatus(tourId as string, {
    query: {
      enabled: !!tourId && step === 2,
      refetchInterval: 5000,
      queryKey: ["tour-status", tourId],
    },
  });

  useEffect(() => {
    if (statusData?.status === "ready") setStep(3);
  }, [statusData]);

  const { data: tourData } = useGetTour(tourId as string, {
    query: { enabled: !!tourId && step === 3, queryKey: ["tour", tourId] },
  });

  const urlPasted = url.trim().length > 0;
  const hasPhotos = photos.length > 0;
  const canSubmit = urlPasted || hasPhotos;

  return (
    <div className="flex-1 flex items-start justify-center p-6 relative">
      <AnimatePresence mode="wait">
        {/* Step 1: Input */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-2xl"
          >
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-display font-bold mb-2">Create New Tour</h2>
              <p className="text-muted-foreground">Paste a listing URL, upload photos, or both for the best results.</p>
            </div>

            <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
              {/* URL section */}
              <div className="p-6 border-b border-border">
                <label className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Link2 className="w-4 h-4" /> Listing URL
                </label>
                <div className="flex items-center gap-2 px-3 h-12 bg-background border border-border rounded-xl focus-within:ring-2 focus-within:ring-primary/30 transition-all">
                  <input
                    type="url"
                    placeholder="https://zillow.com/homedetails/..."
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={createMutation.isPending}
                  />
                  {url && (
                    <button onClick={() => setUrl("")} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Photos section */}
              <div className="p-6 border-b border-border">
                <label className="text-sm font-medium mb-3 flex items-center gap-2">
                  <ImagePlus className="w-4 h-4" /> Photos
                  <span className="text-xs font-normal text-muted-foreground">(optional — improves quality)</span>
                </label>

                <div
                  className={`border-2 border-dashed rounded-xl transition-all cursor-pointer ${dragging ? "border-primary bg-primary/5 scale-[0.99]" : "border-border hover:border-primary/40 hover:bg-accent/30"}`}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  {hasPhotos ? (
                    <div className="p-4 flex gap-2 flex-wrap">
                      {photos.map((photo) => (
                        <div key={photo.name} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-border shrink-0">
                          <img src={photo.dataUrl} alt={photo.name} className="w-full h-full object-cover" />
                          <button
                            onClick={(e) => { e.stopPropagation(); setPhotos((p) => p.filter((x) => x.name !== photo.name)); }}
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
                <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => addFiles(e.target.files)} />
              </div>

              {/* Smart suggestion */}
              <AnimatePresence>
                {urlPasted && !hasPhotos && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="px-6 py-3 bg-primary/5 border-b border-border flex items-center gap-3 cursor-pointer hover:bg-primary/10 transition-colors"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Sparkles className="w-4 h-4 text-primary shrink-0" />
                      <p className="text-sm text-primary font-medium flex-1">
                        Want a better 3D tour? Add extra photos to improve quality.
                      </p>
                      <ChevronRight className="w-4 h-4 text-primary shrink-0" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit */}
              <div className="p-6">
                <Button
                  onClick={handleCreate}
                  disabled={!canSubmit || createMutation.isPending}
                  className="w-full h-12 bg-primary text-primary-foreground text-base font-bold hover:bg-primary/90 disabled:opacity-40"
                >
                  {createMutation.isPending ? (
                    <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Creating Tour…</>
                  ) : "Generate 3D Tour →"}
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

        {/* Step 2: Processing */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-2xl text-center"
          >
            <div className="w-20 h-20 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-8" />
            <h2 className="text-3xl font-display font-bold mb-3">Building your 3D world…</h2>
            <p className="text-primary font-mono mb-12">{statusData?.currentStage || "Analyzing rooms"}</p>

            <div className="flex justify-between items-center max-w-sm mx-auto relative mb-12">
              <div className="absolute top-1/2 left-0 w-full h-0.5 bg-muted -z-10 -translate-y-1/2" />
              {["Extracting", "Generating", "Building", "Ready"].map((s, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5 bg-background px-3">
                  <div className={`w-3 h-3 rounded-full ${i <= 1 ? "bg-primary" : "bg-muted"}`} />
                  <span className="text-xs font-mono uppercase text-muted-foreground">{s}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              ~{statusData?.estimatedMinutes || 3} minutes remaining. You can close this window — we'll notify you when it's done.
            </p>
          </motion.div>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-10 text-center border-b border-border">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-3xl font-display font-bold mb-1">Tour Ready!</h2>
              <p className="text-muted-foreground">{tourData?.listingAddress || "Your property"}</p>
            </div>

            <div className="p-8 grid sm:grid-cols-2 gap-6">
              <div className="aspect-video bg-muted rounded-xl overflow-hidden relative">
                {tourData?.thumbnailUrl ? (
                  <img src={tourData.thumbnailUrl} alt="Tour" className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground font-mono text-sm">No Preview</div>
                )}
                {tourData?.roomsDetected ? (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                    <span className="text-white text-sm font-medium">{tourData.roomsDetected} rooms detected</span>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col justify-center gap-4">
                <div className="p-4 border border-border rounded-xl bg-background text-center">
                  <div className="text-xs text-muted-foreground mb-1">AI Confidence Score</div>
                  <div className="text-4xl font-display font-bold text-primary">{tourData?.confidenceScore ?? 94}%</div>
                </div>

                <Button
                  variant="outline"
                  className="w-full justify-between border-primary text-primary"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/tour/${shareToken}`);
                    toast({ title: "Link copied!" });
                  }}
                >
                  Copy Share Link <Copy className="w-4 h-4" />
                </Button>
                <Button
                  className="w-full justify-between bg-primary text-primary-foreground font-bold"
                  onClick={() => window.open(`/tour/${shareToken}`, "_blank")}
                >
                  Open Tour <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {tourData?.aiLowAngles ? (
              <div className="mx-8 mb-8 bg-destructive/10 border border-destructive/20 p-4 rounded-xl flex gap-3 text-destructive">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-bold">Seller Verification Recommended</p>
                  <p className="opacity-80">Some regions have low AI confidence. Review and flag any inaccurate angles.</p>
                </div>
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
