import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateTour, useSetTourFloorCount, useGetTourStatus, useGetTour } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Link2, Loader2, CheckCircle2, Copy, ExternalLink, AlertCircle } from "lucide-react";

export default function NewTour() {
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState("");
  const [tourId, setTourId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const createMutation = useCreateTour();
  const [extracting, setExtracting] = useState(false);

  const handleCreate = async () => {
    if (!url) return;
    setExtracting(true);
    try {
      const res = await createMutation.mutateAsync({ data: { listingUrl: url } });
      setTourId(res.tourId);
      setShareToken(res.shareToken);
      setStep(3); // Skip floor count for simplicity or implement it
    } catch (e) {
      toast({ title: "Error", description: "Failed to create tour", variant: "destructive" });
      setExtracting(false);
    }
  };

  const { data: statusData } = useGetTourStatus(tourId as string, { query: { enabled: !!tourId && step === 3, refetchInterval: 5000, queryKey: ["tour-status", tourId] } });

  useEffect(() => {
    if (statusData?.status === 'ready') {
      setStep(4);
    }
  }, [statusData]);

  const { data: tourData } = useGetTour(tourId as string, { query: { enabled: !!tourId && step === 4, queryKey: ["tour", tourId] } });

  return (
    <div className="flex-1 flex items-center justify-center p-6 relative">
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-2xl bg-card border border-border p-10 rounded-2xl shadow-2xl text-center">
            <h2 className="text-3xl font-serif font-bold mb-4">Create New Tour</h2>
            <p className="text-muted-foreground mb-8">Paste a listing URL from Zillow, Airbnb, or Property Finder.</p>
            
            <div className="relative mb-8">
              <Link2 className="absolute left-4 top-4 text-muted-foreground" />
              <Input 
                placeholder="https://..." 
                className="h-14 pl-12 bg-background text-lg border-border focus:border-primary"
                value={url}
                onChange={e => setUrl(e.target.value)}
                disabled={extracting}
              />
            </div>

            <Button 
              onClick={handleCreate} 
              className="w-full h-14 text-lg bg-primary text-primary-foreground font-bold hover:bg-primary/90 glow-primary"
              disabled={!url || extracting}
            >
              {extracting ? <><Loader2 className="mr-2 animate-spin" /> Extracting Photos...</> : "Extract Photos →"}
            </Button>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="step3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-4xl text-center">
            <div className="w-20 h-20 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-8" />
            <h2 className="text-4xl font-serif font-bold mb-4">Building your 3D world...</h2>
            <p className="text-xl text-primary font-mono mb-12">Stage: {statusData?.currentStage || "Analyzing rooms"}</p>
            
            <div className="flex justify-between items-center max-w-2xl mx-auto relative mb-12">
              <div className="absolute top-1/2 left-0 w-full h-1 bg-muted -z-10 -translate-y-1/2" />
              {['Extracting', 'Generating', 'Building', 'Ready'].map((s, i) => (
                <div key={i} className="flex flex-col items-center gap-2 bg-background px-4">
                  <div className={`w-4 h-4 rounded-full ${i <= 1 ? 'bg-primary' : 'bg-muted'}`} />
                  <span className="text-xs font-mono uppercase text-muted-foreground">{s}</span>
                </div>
              ))}
            </div>
            
            <p className="text-muted-foreground">~{statusData?.estimatedMinutes || 24} minutes remaining. You can close this window, we'll notify you when it's done.</p>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div key="step4" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-3xl bg-card border border-border p-10 rounded-2xl shadow-2xl">
            <div className="flex flex-col items-center text-center mb-10">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-4xl font-serif font-bold mb-2">Tour Ready!</h2>
              <p className="text-muted-foreground">{tourData?.listingAddress}</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <div className="aspect-video bg-muted rounded-xl overflow-hidden relative">
                {tourData?.thumbnailUrl ? (
                  <img src={tourData.thumbnailUrl} alt="Tour" className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground font-mono">No Preview</div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
                  <span className="text-white font-bold">{tourData?.roomsDetected} Rooms</span>
                </div>
              </div>
              
              <div className="flex flex-col justify-center gap-4">
                <div className="p-4 border border-border rounded-xl bg-background">
                  <div className="text-sm text-muted-foreground mb-1">Confidence Score</div>
                  <div className="text-3xl font-bold text-primary">{tourData?.confidenceScore}%</div>
                </div>
                
                <div className="space-y-3 mt-4">
                  <Button variant="outline" className="w-full justify-between border-primary text-primary" onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/tour/${shareToken}`);
                    toast({ title: "Copied!" });
                  }}>
                    Copy Link <Copy className="w-4 h-4" />
                  </Button>
                  <Button className="w-full justify-between bg-primary text-primary-foreground font-bold" onClick={() => window.open(`/tour/${shareToken}`, '_blank')}>
                    Open Tour <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
            
            {tourData?.aiLowAngles ? (
              <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-xl flex gap-3 text-destructive">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-bold">Seller Verification Recommended</p>
                  <p className="opacity-80">This tour has regions with low AI confidence. Review the tour and flag any inaccurate angles.</p>
                </div>
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}