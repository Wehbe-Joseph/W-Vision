import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Home, Pencil, Code2, HelpCircle,
  MessageCircle, Music2, Youtube, Search, Users, Smile, CheckCircle2, ArrowRight
} from "lucide-react";
import { loadPendingTour, clearPendingTour } from "@/hooks/use-pending-tour";

const slide = {
  enter: (d: number) => ({ x: d > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d < 0 ? 60 : -60, opacity: 0 }),
};

const ROLES = [
  { id: "real_estate_agent", label: "Real Estate Agent", icon: Building2 },
  { id: "airbnb_host",       label: "Airbnb Host",        icon: Home },
  { id: "architect_designer", label: "Architect / Designer", icon: Pencil },
  { id: "developer",         label: "Developer",           icon: Code2 },
  { id: "other",             label: "Other",               icon: HelpCircle },
];

const SOURCES = [
  { id: "reddit",   label: "Reddit",    icon: MessageCircle },
  { id: "tiktok",   label: "TikTok",    icon: Music2 },
  { id: "youtube",  label: "YouTube",   icon: Youtube },
  { id: "google",   label: "Google",    icon: Search },
  { id: "friend",   label: "A Friend",  icon: Users },
  { id: "other",    label: "Other",     icon: Smile },
];

function SelectCard<T extends string>({
  item,
  selected,
  onSelect,
}: {
  item: { id: T; label: string; icon: React.ComponentType<{ className?: string }> };
  selected: boolean;
  onSelect: (id: T) => void;
}) {
  return (
    <button
      onClick={() => onSelect(item.id)}
      className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all font-medium text-sm w-full ${
        selected
          ? "border-primary bg-primary text-primary-foreground shadow-md scale-[1.01]"
          : "border-border bg-background hover:border-primary/40 hover:bg-accent"
      }`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${selected ? "bg-primary-foreground/20" : "bg-muted"}`}>
        <item.icon className="w-4 h-4" />
      </div>
      {item.label}
    </button>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState(1);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [useCase, setUseCase] = useState<string>("");
  const [referralSource, setReferralSource] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const go = (next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  };

  const finish = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/onboarding", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useCase, referralSource }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      toast({ title: "Couldn't save answers", description: "Continuing anyway…", variant: "destructive" });
    } finally {
      setSaving(false);
    }

    const pending = loadPendingTour();
    if (pending?.url || pending?.photos?.length) {
      setLocation("/dashboard/new-tour");
    } else {
      setLocation("/dashboard");
    }
  };

  const skip = () => {
    const pending = loadPendingTour();
    if (pending?.url || pending?.photos?.length) {
      setLocation("/dashboard/new-tour");
    } else {
      setLocation("/dashboard");
    }
  };

  const totalSteps = 2;
  const progress = ((step - 1) / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-border">
        <motion.div
          className="h-full bg-primary"
          animate={{ width: `${step === 3 ? 100 : progress}%` }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        />
      </div>

      {/* Logo */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-primary" />
        <span className="font-display font-bold text-lg tracking-tight">WVISION</span>
      </div>

      <div className="w-full max-w-xl mt-8">
        <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden relative" style={{ minHeight: 420 }}>
          <AnimatePresence mode="wait" custom={dir}>
            {/* Step 1: Role */}
            {step === 1 && (
              <motion.div
                key="step1"
                custom={dir}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="p-8 sm:p-10 flex flex-col"
              >
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2">Step 1 of 2</p>
                <h2 className="text-2xl font-display font-bold mb-1">What are you using WVISION for?</h2>
                <p className="text-sm text-muted-foreground mb-7">We'll tailor your experience to your role.</p>

                <div className="grid sm:grid-cols-2 gap-3 mb-8">
                  {ROLES.map((role) => (
                    <SelectCard key={role.id} item={role} selected={useCase === role.id} onSelect={setUseCase} />
                  ))}
                </div>

                <div className="flex justify-between items-center mt-auto">
                  <button onClick={skip} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Skip setup
                  </button>
                  <Button
                    onClick={() => go(2)}
                    disabled={!useCase}
                    className="bg-primary text-primary-foreground font-bold px-8 h-11 disabled:opacity-40"
                  >
                    Continue <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 2: Referral */}
            {step === 2 && (
              <motion.div
                key="step2"
                custom={dir}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="p-8 sm:p-10 flex flex-col"
              >
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2">Step 2 of 2</p>
                <h2 className="text-2xl font-display font-bold mb-1">Where did you hear about us?</h2>
                <p className="text-sm text-muted-foreground mb-7">This helps us understand where to improve.</p>

                <div className="grid sm:grid-cols-2 gap-3 mb-8">
                  {SOURCES.map((src) => (
                    <SelectCard key={src.id} item={src} selected={referralSource === src.id} onSelect={setReferralSource} />
                  ))}
                </div>

                <div className="flex justify-between items-center mt-auto">
                  <button onClick={() => go(1)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    ← Back
                  </button>
                  <Button
                    onClick={finish}
                    disabled={!referralSource || saving}
                    className="bg-primary text-primary-foreground font-bold px-8 h-11 disabled:opacity-40"
                  >
                    {saving ? "Saving…" : "Finish Setup →"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Takes 20 seconds · You can change this later in settings
        </p>
      </div>
    </div>
  );
}
