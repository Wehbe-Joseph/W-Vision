import { Link, useLocation } from "wouter";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SiZillow, SiAirbnb } from "react-icons/si";
import {
  CheckCircle2, ArrowRight, Link as LinkIcon, Upload, X, ImagePlus,
  Sparkles, ChevronRight, BarChart3, Share2, ShieldCheck
} from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  savePendingTour, filesToPendingPhotos, PendingPhoto
} from "@/hooks/use-pending-tour";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] } },
};
const stagger: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const [url, setUrl] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const removePhoto = (name: string) =>
    setPhotos((prev) => prev.filter((p) => p.name !== name));

  const handleCreate = async () => {
    if (!url.trim() && !photos.length) return;
    setSubmitting(true);

    const pending = { url: url.trim() || undefined, photos: photos.length ? photos : undefined };
    savePendingTour(pending);

    if (isAuthenticated) {
      setLocation("/dashboard/new-tour");
    } else {
      window.location.href = `${BASE}/api/login?returnTo=${encodeURIComponent(BASE + "/dashboard")}`;
    }
  };

  const urlPasted = url.trim().length > 0;
  const hasPhotos = photos.length > 0;
  const canSubmit = urlPasted || hasPhotos;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Grid bg */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(26,23,20,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(26,23,20,0.04)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000_60%,transparent_100%)]" />
      </div>

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
            <span className="font-display font-bold text-xl tracking-tight">TOURVISION</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How it Works</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link href="/dashboard">
                <Button className="bg-primary text-primary-foreground font-bold">Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="outline" className="border-border hover:bg-accent">Sign In</Button>
                </Link>
                <Link href="/login">
                  <Button className="bg-primary text-primary-foreground font-bold">Start Free</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-28 pb-24">
        {/* Hero */}
        <section className="container mx-auto px-6 max-w-5xl text-center">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="flex flex-col items-center">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs mb-8 font-mono tracking-widest">
              ✦ NEXT-GENERATION 3D WORLD GENERATION
            </motion.div>

            <motion.h1 variants={fadeUp} className="text-5xl md:text-7xl font-display font-bold tracking-tight leading-[1.05] mb-6">
              ANY LISTING.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/40">
                INSTANT 3D TOUR.
              </span>
            </motion.h1>

            <motion.p variants={fadeUp} className="text-lg text-muted-foreground mb-12 max-w-xl leading-relaxed">
              Paste a listing URL, upload extra photos, or both — our AI builds a photorealistic walkthrough and gives you a shareable link in minutes.
            </motion.p>

            {/* Creation box */}
            <motion.div variants={fadeUp} className="w-full max-w-3xl">
              <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
                <div className="grid md:grid-cols-[1fr_auto_1fr]">
                  {/* Option A — URL */}
                  <div className="p-6 flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">A</div>
                      <span className="text-sm font-medium">Paste a listing URL</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 h-12 bg-background border border-border rounded-xl focus-within:ring-2 focus-within:ring-primary/30 transition-all">
                      <LinkIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <input
                        type="url"
                        placeholder="https://zillow.com/homedetails/..."
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                      {url && (
                        <button onClick={() => setUrl("")} className="text-muted-foreground hover:text-foreground">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <SiZillow className="w-4 h-4" />
                      <SiAirbnb className="w-4 h-4" />
                      <span>Zillow, Airbnb, Bayut, Property Finder…</span>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="hidden md:flex flex-col items-center justify-center px-2 gap-2 py-6">
                    <div className="w-px flex-1 bg-border" />
                    <span className="text-xs font-mono text-muted-foreground bg-card px-1">OR</span>
                    <div className="w-px flex-1 bg-border" />
                  </div>
                  <div className="md:hidden h-px bg-border mx-6" />

                  {/* Option B — Photos */}
                  <div className="p-6 flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">B</div>
                      <span className="text-sm font-medium">Upload photos</span>
                    </div>
                    <div
                      className={`relative flex-1 min-h-[80px] border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer transition-all ${dragging ? "border-primary bg-primary/5 scale-[0.99]" : "border-border hover:border-primary/50 hover:bg-accent/30"}`}
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={onDrop}
                      onClick={() => fileRef.current?.click()}
                    >
                      <div className="flex flex-col items-center gap-1.5 py-4 text-center">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${hasPhotos ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                          {hasPhotos ? <CheckCircle2 className="w-5 h-5" /> : <ImagePlus className="w-5 h-5" />}
                        </div>
                        <p className="text-sm font-medium">
                          {hasPhotos ? `${photos.length} photo${photos.length > 1 ? "s" : ""} added` : "Drag & drop or click"}
                        </p>
                        <p className="text-xs text-muted-foreground">JPG, PNG, WEBP — up to 20 photos</p>
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
                    <p className="text-xs text-muted-foreground">Adding photos improves 3D quality significantly</p>
                  </div>
                </div>

                {/* Photo thumbnails */}
                <AnimatePresence>
                  {hasPhotos && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="border-t border-border overflow-hidden"
                    >
                      <div className="p-4 flex gap-2 flex-wrap">
                        {photos.map((photo) => (
                          <div key={photo.name} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-border shrink-0">
                            <img src={photo.dataUrl} alt={photo.name} className="w-full h-full object-cover" />
                            <button
                              onClick={() => removePhoto(photo.name)}
                              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            >
                              <X className="w-4 h-4 text-white" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => fileRef.current?.click()}
                          className="w-16 h-16 rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Upload className="w-5 h-5" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Smart suggestion: URL only, no photos */}
                <AnimatePresence>
                  {urlPasted && !hasPhotos && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="border-t border-border overflow-hidden"
                    >
                      <div
                        className="p-3 bg-primary/5 flex items-center gap-3 cursor-pointer hover:bg-primary/10 transition-colors"
                        onClick={() => fileRef.current?.click()}
                      >
                        <Sparkles className="w-4 h-4 text-primary shrink-0" />
                        <p className="text-sm text-primary font-medium flex-1">
                          Want a better 3D tour? Add extra photos to improve tour quality.
                        </p>
                        <ChevronRight className="w-4 h-4 text-primary shrink-0" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit */}
                <div className="p-5 border-t border-border bg-background/50">
                  <Button
                    onClick={handleCreate}
                    disabled={!canSubmit || submitting}
                    className="w-full h-12 bg-primary text-primary-foreground text-base font-bold hover:bg-primary/90 transition-all disabled:opacity-40"
                  >
                    {submitting ? "Redirecting…" : "Create 3D Tour →"}
                  </Button>
                  {!canSubmit && (
                    <p className="text-center text-xs text-muted-foreground mt-2">
                      Paste a URL or upload photos to get started
                    </p>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Trust badges */}
            <motion.div variants={fadeUp} className="flex items-center gap-6 mt-8 text-xs text-muted-foreground flex-wrap justify-center">
              <div className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> No credit card required</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Free tour included</div>
              <div className="flex items-center gap-1.5"><Share2 className="w-3.5 h-3.5" /> Instant shareable link</div>
            </motion.div>
          </motion.div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="container mx-auto px-6 max-w-5xl mt-28">
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">Process</p>
            <h2 className="text-4xl font-display font-bold">HOW IT WORKS</h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                num: "01", icon: LinkIcon, title: "Paste or Upload",
                desc: "Drop any listing URL or upload your own property photos — or both for the best results."
              },
              {
                num: "02", icon: Sparkles, title: "AI Processes",
                desc: "Our spatial AI engine extracts room geometry, classifies surfaces, and builds a full 3D world mesh."
              },
              {
                num: "03", icon: Share2, title: "Share Instantly",
                desc: "Get a branded, shareable tour link ready in minutes. Embed on your site or send to buyers."
              },
            ].map(({ num, icon: Icon, title, desc }) => (
              <motion.div
                key={num}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.4 }}
                className="bg-card border border-border rounded-2xl p-8"
              >
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-4xl font-display font-bold text-primary/20">{num}</span>
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-display font-bold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Stats */}
        <section className="container mx-auto px-6 max-w-5xl mt-16">
          <div className="bg-primary text-primary-foreground rounded-2xl p-10 grid md:grid-cols-3 gap-8 text-center">
            {[
              { val: "3 min", label: "Average processing time" },
              { val: "94%", label: "AI confidence score" },
              { val: "10×", label: "More buyer engagement" },
            ].map(({ val, label }) => (
              <div key={label}>
                <div className="text-5xl font-display font-bold mb-1">{val}</div>
                <div className="text-primary-foreground/70 text-sm">{label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="container mx-auto px-6 max-w-4xl mt-28">
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-4xl font-display font-bold">SIMPLE PLANS</h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: "Free", price: "$0", tours: "1 tour/mo", features: ["1 3D tour per month", "Watermarked", "Shareable link"] },
              { name: "Pro", price: "$29", tours: "15 tours/mo", features: ["15 tours per month", "No watermark", "Analytics dashboard", "Priority processing"], highlight: true },
              { name: "Unlimited", price: "$79", tours: "Unlimited", features: ["Unlimited tours", "White-label", "API access", "Dedicated support"] },
            ].map(({ name, price, features, highlight }) => (
              <motion.div
                key={name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4 }}
                className={`rounded-2xl border p-8 flex flex-col ${highlight ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
              >
                <div className="mb-6">
                  <div className={`text-xs font-mono uppercase tracking-widest mb-2 ${highlight ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{name}</div>
                  <div className="text-4xl font-display font-bold">{price}<span className="text-base font-normal opacity-60">/mo</span></div>
                </div>
                <ul className="space-y-2.5 flex-1 mb-8">
                  {features.map((f) => (
                    <li key={f} className={`flex items-center gap-2 text-sm ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                      <CheckCircle2 className="w-4 h-4 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={handleCreate}
                  className={`w-full font-bold ${highlight ? "bg-primary-foreground text-primary hover:bg-primary-foreground/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
                >
                  Get Started <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-10">
        <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-display font-bold text-foreground">
            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
            TOURVISION
          </div>
          <p>© {new Date().getFullYear()} TourVision. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
