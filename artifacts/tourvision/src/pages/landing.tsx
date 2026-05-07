import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SiZillow, SiAirbnb } from "react-icons/si";
import {
  CheckCircle2, ArrowRight, Link as LinkIcon, Upload, X, ImagePlus,
  Sparkles, ChevronRight, BarChart3, Share2, ShieldCheck
} from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  savePendingTour, filesToPendingPhotos, PendingPhoto
} from "@/hooks/use-pending-tour";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
      {/* Subtle grid */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-grid opacity-60" />

      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b-2 border-foreground bg-background">
        <div className="mx-auto px-6 h-14 flex items-center justify-between max-w-7xl">
          {/* Logo group */}
          <div className="flex items-center gap-0">
            <div className="flex items-center gap-2 border-2 border-foreground px-3 py-1.5 mr-4">
              <span className="w-2 h-2 bg-primary" />
              <span className="font-serif text-lg tracking-tight">TOURVISION</span>
            </div>
            <div className="hidden md:flex items-center">
              <a href="#how-it-works" className="px-4 py-1.5 text-sm font-bold uppercase tracking-wide border-l-2 border-foreground hover:bg-accent transition-colors">How It Works</a>
              <a href="#pricing" className="px-4 py-1.5 text-sm font-bold uppercase tracking-wide border-l-2 border-foreground hover:bg-accent transition-colors">Pricing</a>
              <a href="#features" className="px-4 py-1.5 text-sm font-bold uppercase tracking-wide border-l-2 border-r-2 border-foreground hover:bg-accent transition-colors">Features</a>
            </div>
          </div>
          {/* Nav CTA */}
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Link href="/dashboard">
                <Button>Dashboard</Button>
              </Link>
            ) : (
              <>
                <a href={`${BASE}/api/login`} className="px-4 py-2 text-sm font-bold uppercase tracking-wide border-2 border-foreground hover:bg-accent transition-colors">
                  Login
                </a>
                <a href={`${BASE}/api/login`}>
                  <Button>Get Started</Button>
                </a>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-20">

        {/* ── HERO ── */}
        <section className="mx-auto px-6 max-w-7xl pt-16 pb-20">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Left: copy */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col gap-6"
            >
              <div className="inline-flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-[#00C853]" />
                <span className="text-xs font-mono font-bold uppercase tracking-widest">Next-Gen Spatial AI</span>
              </div>

              <h1 className="text-6xl md:text-8xl font-serif leading-none tracking-tight">
                ANY LISTING.<br />
                <span className="text-primary">INSTANT</span><br />
                3D TOUR.
              </h1>

              <p className="text-base text-muted-foreground max-w-md leading-relaxed">
                Paste a listing URL or upload photos — our AI builds a photorealistic 3D walkthrough and gives you a shareable link in minutes.
              </p>

              <div className="flex items-center gap-6 text-xs text-muted-foreground font-mono">
                <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> No credit card</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Free tour</span>
                <span className="flex items-center gap-1.5"><Share2 className="w-3.5 h-3.5" /> Instant link</span>
              </div>
            </motion.div>

            {/* Right: creation box (OS window style) */}
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.1 }}
            >
              <div className="border-2 border-foreground shadow-[8px_8px_0px_0px_#1A1714] bg-card">
                {/* Window title bar */}
                <div className="flex items-center gap-2 px-4 py-2 border-b-2 border-foreground bg-foreground">
                  <span className="w-2.5 h-2.5 bg-primary" />
                  <span className="text-xs font-mono font-bold uppercase tracking-widest text-background">Create 3D Tour</span>
                </div>

                <div className="grid md:grid-cols-[1fr_auto_1fr]">
                  {/* Option A — URL */}
                  <div className="p-5 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-foreground text-background text-xs font-bold flex items-center justify-center font-mono">A</span>
                      <span className="text-sm font-bold uppercase tracking-wide">Paste listing URL</span>
                    </div>
                    <div className={`flex items-center gap-2 px-3 h-11 bg-background border-2 transition-all ${urlPasted ? "border-foreground" : "border-foreground/30 focus-within:border-foreground"}`}>
                      <LinkIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <input
                        type="url"
                        placeholder="https://zillow.com/..."
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground font-mono"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                      {url && (
                        <button onClick={() => setUrl("")} className="text-muted-foreground hover:text-foreground">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                      <SiZillow className="w-3.5 h-3.5" />
                      <SiAirbnb className="w-3.5 h-3.5" />
                      <span>Zillow, Airbnb, Bayut…</span>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="hidden md:flex flex-col items-center justify-center px-2 gap-2 py-5">
                    <div className="w-px flex-1 bg-foreground/20" />
                    <span className="text-xs font-mono font-bold text-muted-foreground border border-foreground/20 px-1">OR</span>
                    <div className="w-px flex-1 bg-foreground/20" />
                  </div>
                  <div className="md:hidden h-px bg-foreground/20 mx-5" />

                  {/* Option B — Photos */}
                  <div className="p-5 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-foreground text-background text-xs font-bold flex items-center justify-center font-mono">B</span>
                      <span className="text-sm font-bold uppercase tracking-wide">Upload photos</span>
                    </div>
                    <div
                      className={`relative flex-1 min-h-[72px] border-2 border-dashed flex items-center justify-center cursor-pointer transition-all ${dragging ? "border-primary bg-primary/5" : "border-foreground/30 hover:border-foreground hover:bg-accent/30"}`}
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={onDrop}
                      onClick={() => fileRef.current?.click()}
                    >
                      <div className="flex flex-col items-center gap-1 py-3 text-center">
                        <div className={`w-8 h-8 flex items-center justify-center transition-colors ${hasPhotos ? "bg-[#00C853] text-white" : "bg-muted text-muted-foreground"}`}>
                          {hasPhotos ? <CheckCircle2 className="w-4 h-4" /> : <ImagePlus className="w-4 h-4" />}
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wide">
                          {hasPhotos ? `${photos.length} photo${photos.length > 1 ? "s" : ""} added` : "Drag & drop or click"}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">Up to 20 photos</p>
                      </div>
                      <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => addFiles(e.target.files)} />
                    </div>
                  </div>
                </div>

                {/* Photo thumbnails */}
                <AnimatePresence>
                  {hasPhotos && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t-2 border-foreground/20 overflow-hidden"
                    >
                      <div className="p-4 flex gap-2 flex-wrap">
                        {photos.map((photo) => (
                          <div key={photo.name} className="relative group w-14 h-14 overflow-hidden border-2 border-foreground shrink-0">
                            <img src={photo.dataUrl} alt={photo.name} className="w-full h-full object-cover" />
                            <button
                              onClick={() => removePhoto(photo.name)}
                              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            >
                              <X className="w-4 h-4 text-white" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => fileRef.current?.click()}
                          className="w-14 h-14 border-2 border-dashed border-foreground/30 hover:border-foreground flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Upload className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Suggestion */}
                <AnimatePresence>
                  {urlPasted && !hasPhotos && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t-2 border-foreground/20 overflow-hidden"
                    >
                      <div
                        className="p-3 bg-[#00C853]/10 border-l-4 border-[#00C853] flex items-center gap-3 cursor-pointer hover:bg-[#00C853]/20 transition-colors"
                        onClick={() => fileRef.current?.click()}
                      >
                        <Sparkles className="w-4 h-4 text-[#00C853] shrink-0" />
                        <p className="text-sm font-bold flex-1 text-foreground">Add photos for a better 3D tour</p>
                        <ChevronRight className="w-4 h-4 text-foreground shrink-0" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit */}
                <div className="p-4 border-t-2 border-foreground bg-background/50">
                  <button
                    onClick={handleCreate}
                    disabled={!canSubmit || submitting}
                    className="w-full h-12 bg-primary text-white border-2 border-foreground text-base font-bold uppercase tracking-wide shadow-[4px_4px_0px_0px_#1A1714] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Redirecting…" : "Create 3D Tour →"}
                  </button>
                  {!canSubmit && (
                    <p className="text-center text-xs text-muted-foreground mt-2 font-mono">
                      Paste a URL or upload photos to get started
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── TRUSTED BY ── */}
        <section className="border-y-2 border-foreground bg-foreground text-background py-4">
          <div className="mx-auto px-6 max-w-7xl flex flex-col sm:flex-row items-center gap-6 justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-widest opacity-60">Trusted by agents worldwide</span>
            <div className="flex items-center gap-8 text-sm font-bold uppercase tracking-wide opacity-70">
              <span>Zillow</span>
              <span>Airbnb</span>
              <span>Bayut</span>
              <span>Rightmove</span>
              <span>Realtor</span>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section id="how-it-works" className="mx-auto px-6 max-w-7xl py-24">
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 bg-[#00C853]" />
              <span className="text-xs font-mono font-bold uppercase tracking-widest">Process</span>
            </div>
            <h2 className="text-5xl md:text-6xl font-serif">HOW IT WORKS</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-0 border-2 border-foreground">
            {[
              {
                num: "01", title: "Paste or Upload",
                desc: "Drop any listing URL or upload your own property photos — or both for the best results.",
                accent: "bg-[#00C853]",
              },
              {
                num: "02", title: "AI Processes",
                desc: "Our spatial AI extracts room geometry, classifies surfaces, and builds a full 3D world mesh.",
                accent: "bg-[#FFD000]",
              },
              {
                num: "03", title: "Share Instantly",
                desc: "Get a branded, shareable tour link in minutes. Embed on your site or send directly to buyers.",
                accent: "bg-primary",
              },
            ].map(({ num, title, desc, accent }, i) => (
              <motion.div
                key={num}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className={`p-8 flex flex-col gap-4 ${i < 2 ? "border-r-2 border-foreground" : ""}`}
              >
                <div className={`w-8 h-8 ${accent} flex items-center justify-center`}>
                  <span className="text-white text-xs font-mono font-bold">{num}</span>
                </div>
                <h3 className="text-2xl font-serif">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── STATS ── */}
        <section className="mx-auto px-6 max-w-7xl pb-8">
          <div className="border-2 border-foreground shadow-[8px_8px_0px_0px_#1A1714] bg-foreground text-background">
            {/* title bar */}
            <div className="flex items-center gap-2 px-6 py-3 border-b-2 border-background/20">
              <span className="w-2.5 h-2.5 bg-primary" />
              <span className="text-xs font-mono font-bold uppercase tracking-widest opacity-60">Performance Metrics</span>
            </div>
            <div className="grid md:grid-cols-3 divide-x-2 divide-background/20">
              {[
                { val: "3 min", label: "Average processing time" },
                { val: "94%", label: "AI confidence score" },
                { val: "10×", label: "More buyer engagement" },
              ].map(({ val, label }) => (
                <div key={label} className="p-10 text-center">
                  <div className="text-6xl font-serif mb-2">{val}</div>
                  <div className="text-sm opacity-60 font-mono uppercase tracking-wide">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FEATURES ── */}
        <section id="features" className="mx-auto px-6 max-w-7xl py-24">
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                label: "Agents",
                title: "Close deals faster",
                desc: "Give every buyer an immersive 3D experience from any listing URL. No camera equipment needed.",
                cta: "Explore Features", ctaVariant: "green" as const,
              },
              {
                label: "Enterprise",
                title: "Deploy at scale",
                desc: "Production-grade infrastructure for secure, real-time 3D tour generation across your entire portfolio.",
                cta: "Book Demo", ctaVariant: "yellow" as const,
                featured: true,
              },
              {
                label: "Developers",
                title: "Build with our API",
                desc: "Full REST API for embedding 3D tour generation into your own products and platforms.",
                cta: "Get Access", ctaVariant: "default" as const,
              },
            ].map(({ label, title, desc, cta, ctaVariant, featured }) => (
              <div
                key={label}
                className={`border-2 border-foreground flex flex-col ${featured ? "shadow-[8px_8px_0px_0px_#1A1714]" : ""}`}
              >
                {/* Title bar */}
                <div className="flex items-center gap-2 px-4 py-2 border-b-2 border-foreground">
                  <span className={`w-2 h-2 ${ctaVariant === "green" ? "bg-[#00C853]" : ctaVariant === "yellow" ? "bg-[#FFD000]" : "bg-primary"}`} />
                  <span className="text-xs font-mono font-bold uppercase tracking-widest">{label}</span>
                </div>
                <div className="p-6 flex flex-col gap-4 flex-1">
                  <h3 className="text-3xl font-serif leading-tight">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">{desc}</p>
                  <Button variant={ctaVariant} className="self-start">{cta}</Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── PRICING ── */}
        <section id="pricing" className="mx-auto px-6 max-w-7xl pb-24">
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 bg-primary" />
              <span className="text-xs font-mono font-bold uppercase tracking-widest">Pricing</span>
            </div>
            <h2 className="text-5xl md:text-6xl font-serif">SIMPLE PLANS</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: "Free", price: "$0", features: ["1 3D tour per month", "Watermarked", "Shareable link"], variant: "outline" as const },
              { name: "Pro", price: "$29", features: ["15 tours per month", "No watermark", "Analytics dashboard", "Priority processing"], variant: "default" as const, featured: true },
              { name: "Unlimited", price: "$79", features: ["Unlimited tours", "White-label", "API access", "Dedicated support"], variant: "yellow" as const },
            ].map(({ name, price, features, variant, featured }) => (
              <div
                key={name}
                className={`border-2 border-foreground flex flex-col ${featured ? "shadow-[8px_8px_0px_0px_#1A1714] bg-foreground text-background" : "bg-card"}`}
              >
                {/* Title bar */}
                <div className={`flex items-center gap-2 px-4 py-2 border-b-2 ${featured ? "border-background/20" : "border-foreground"}`}>
                  <span className="text-xs font-mono font-bold uppercase tracking-widest opacity-70">{name}</span>
                </div>
                <div className="p-6 flex flex-col gap-6 flex-1">
                  <div className="text-5xl font-serif">{price}<span className="text-xl opacity-50">/mo</span></div>
                  <ul className="space-y-2.5 flex-1">
                    {features.map((f) => (
                      <li key={f} className={`flex items-center gap-2 text-sm ${featured ? "opacity-80" : "text-muted-foreground"}`}>
                        <CheckCircle2 className="w-4 h-4 shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant={featured ? "outline" : variant}
                    className={`w-full ${featured ? "bg-background text-foreground border-background" : ""}`}
                    onClick={handleCreate}
                  >
                    Get Started <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer className="border-t-2 border-foreground py-8">
        <div className="mx-auto px-6 max-w-7xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-serif text-lg">
            <span className="w-2.5 h-2.5 bg-primary" />
            TOURVISION
          </div>
          <p className="text-sm text-muted-foreground font-mono">© {new Date().getFullYear()} TourVision. All rights reserved.</p>
          <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="#" className="hover:text-foreground">Terms</a>
            <a href="#" className="hover:text-foreground">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
