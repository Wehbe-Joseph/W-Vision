import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SiZillow, SiAirbnb } from "react-icons/si";
import {
  CheckCircle2, ArrowRight, Link as LinkIcon, Upload, X, ImagePlus,
  Sparkles, ChevronRight, BarChart3, Share2, ShieldCheck, Home, Users
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
              <span className="font-serif text-lg tracking-tight">WVISION</span>
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

      <main className="relative z-10">

        {/* ── HERO ── */}
        <section className="relative flex items-center overflow-hidden pt-14">
          {/* Animated sky background */}
          <div className="absolute inset-0 z-0 hero-sky-bg overflow-hidden">
            <div className="cloud cloud-1" />
            <div className="cloud cloud-2" />
            <div className="cloud cloud-3" />
            <div className="cloud cloud-4" />
            <div className="cloud cloud-5" />
          </div>
          {/* Subtle overlay so text reads clearly */}
          <div className="absolute inset-0 z-[1] bg-background/5" />

          <div className="relative z-[2] mx-auto px-6 max-w-7xl w-full py-20 grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: copy */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col gap-5"
            >
              <div className="inline-flex items-center gap-2">
                <span className="w-2 h-2 bg-[#00C853]" />
                <span className="text-xs font-mono font-bold uppercase tracking-widest">Next-Gen Spatial AI</span>
              </div>

              <h1
                className="text-5xl md:text-7xl leading-[1.05] tracking-tight text-foreground"
                style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700 }}
              >
                Any listing.<br />
                Instant 3D tour.
              </h1>

              <p className="text-base text-foreground/70 max-w-md leading-relaxed">
                Paste a listing URL or upload photos — our AI builds a photorealistic 3D walkthrough and gives you a shareable link in minutes.
              </p>

              <div className="flex items-center gap-6 text-xs text-foreground/60 font-mono">
                <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> No credit card</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Free tour</span>
                <span className="flex items-center gap-1.5"><Share2 className="w-3.5 h-3.5" /> Instant link</span>
              </div>
            </motion.div>

            {/* Right: simplified input card */}
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.12 }}
            >
              <div className="border-2 border-foreground shadow-[8px_8px_0px_0px_#1A1714] bg-card">
                {/* Window title bar */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b-2 border-foreground bg-foreground">
                  <span className="w-2 h-2 bg-primary" />
                  <span className="text-xs font-mono font-bold uppercase tracking-widest text-background">Create 3D Tour</span>
                </div>

                <div className="p-5 flex flex-col gap-4">
                  {/* URL input */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">
                      Listing URL
                    </label>
                    <div className={`flex items-center gap-2 px-3 h-11 bg-background border-2 transition-all ${urlPasted ? "border-foreground" : "border-foreground/25 focus-within:border-foreground"}`}>
                      <LinkIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <input
                        type="url"
                        placeholder="https://zillow.com/homedetails/…"
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
                      <SiZillow className="w-3 h-3" />
                      <SiAirbnb className="w-3 h-3" />
                      <span>Zillow, Airbnb, Bayut, Property Finder</span>
                    </div>
                  </div>

                  {/* Photos — compact drag target */}
                  <div
                    className={`border-2 border-dashed cursor-pointer transition-all flex items-center gap-3 px-4 py-3 ${dragging ? "border-primary bg-primary/5" : hasPhotos ? "border-foreground bg-accent/30" : "border-foreground/25 hover:border-foreground"}`}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    onClick={() => fileRef.current?.click()}
                  >
                    <div className={`w-7 h-7 flex items-center justify-center shrink-0 ${hasPhotos ? "bg-[#00C853] text-white" : "bg-muted text-muted-foreground"}`}>
                      {hasPhotos ? <CheckCircle2 className="w-4 h-4" /> : <ImagePlus className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide">
                        {hasPhotos ? `${photos.length} photo${photos.length > 1 ? "s" : ""} added` : "Add photos (optional)"}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">Drag & drop or click · up to 20 photos</p>
                    </div>
                    {hasPhotos && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setPhotos([]); }}
                        className="ml-auto text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => addFiles(e.target.files)} />
                  </div>

                  {/* Photo thumbnails (compact row) */}
                  <AnimatePresence>
                    {hasPhotos && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="flex gap-1.5 flex-wrap">
                          {photos.map((photo) => (
                            <div key={photo.name} className="relative group w-12 h-12 overflow-hidden border border-foreground/40 shrink-0">
                              <img src={photo.dataUrl} alt={photo.name} className="w-full h-full object-cover" />
                              <button
                                onClick={() => removePhoto(photo.name)}
                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                              >
                                <X className="w-3 h-3 text-white" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => fileRef.current?.click()}
                            className="w-12 h-12 border border-dashed border-foreground/25 hover:border-foreground flex items-center justify-center text-muted-foreground"
                          >
                            <Upload className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* CTA */}
                  <button
                    onClick={handleCreate}
                    disabled={!canSubmit || submitting}
                    className="w-full h-12 bg-primary text-white border-2 border-foreground text-sm font-bold uppercase tracking-widest shadow-[4px_4px_0px_0px_#1A1714] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Redirecting…" : "Create 3D Tour →"}
                  </button>
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

        {/* ── MANIFESTO / HANDS ── */}
        <section className="bg-background overflow-hidden pt-20 pb-0">
          {/* Visual: hands image + animated OS window overlay */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="relative mx-auto max-w-6xl px-6"
          >
            <div className="relative w-full overflow-hidden" style={{ aspectRatio: "1413/430" }}>
              {/* Hands background image — cropped to hands/sky visual only */}
              <img
                src="/hands-bg.png"
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full select-none pointer-events-none"
                style={{ objectFit: "cover", objectPosition: "top", height: "160%" }}
                draggable={false}
              />


            </div>
          </motion.div>

          {/* Text section */}
          <div className="mx-auto max-w-5xl px-6 py-20">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="text-center mb-14"
            >
              <div className="inline-flex items-center gap-2 mb-6">
                <span className="w-2 h-2 bg-[#00C853]" />
                <span className="text-xs font-mono font-bold uppercase tracking-widest">Why 3D tours matter</span>
              </div>
              <h2
                className="text-4xl md:text-6xl mb-6 leading-[1.08]"
                style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700 }}
              >
                Properties with 3D tours<br />sell 31% faster.
              </h2>
              <p className="text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Whether you're a listing agent racing to close, or a buyer exploring from home — WVISION's
                spatial AI gives every property the immersive presentation it deserves.
              </p>
            </motion.div>

            {/* Two-column benefit cards */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="grid md:grid-cols-2 gap-0 border-2 border-foreground"
            >
              {/* Agents */}
              <div className="flex flex-col border-r-0 md:border-r-2 border-b-2 md:border-b-0 border-foreground">
                <div className="flex items-center gap-2 px-6 py-3 border-b-2 border-foreground">
                  <span className="w-2 h-2 bg-primary" />
                  <span className="text-xs font-mono font-bold uppercase tracking-widest">For Agents</span>
                </div>
                <div className="p-8 flex flex-col gap-4 flex-1">
                  <h3 className="text-2xl font-bold leading-snug" style={{ fontFamily: "'Playfair Display', serif" }}>
                    List once. Show everywhere.
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Turn any listing URL into a shareable 3D walkthrough in under 3 minutes — no camera equipment,
                    no photographer, no setup. Buyers spend <strong className="text-foreground">10× longer</strong> engaging
                    with immersive tours, meaning more qualified leads and fewer wasted showings.
                  </p>
                  <div className="flex items-start gap-3 mt-2">
                    <div className="w-px flex-1 bg-foreground/10 self-stretch" />
                    <div className="grid grid-cols-2 gap-3 flex-[8]">
                      {[
                        { val: "3 min", label: "to publish" },
                        { val: "10×", label: "more engagement" },
                        { val: "31%", label: "faster close" },
                        { val: "0", label: "equipment needed" },
                      ].map(({ val, label }) => (
                        <div key={label} className="border border-foreground/20 p-3">
                          <div className="text-xl font-bold font-mono text-primary">{val}</div>
                          <div className="text-xs text-muted-foreground uppercase tracking-wide font-mono">{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Buyers */}
              <div className="flex flex-col">
                <div className="flex items-center gap-2 px-6 py-3 border-b-2 border-foreground">
                  <span className="w-2 h-2 bg-[#FFD000]" />
                  <span className="text-xs font-mono font-bold uppercase tracking-widest">For Buyers</span>
                </div>
                <div className="p-8 flex flex-col gap-4 flex-1">
                  <h3 className="text-2xl font-bold leading-snug" style={{ fontFamily: "'Playfair Display', serif" }}>
                    Explore every room before you visit.
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Walk through any property from your phone or laptop. Get a true sense of space, layout, and light —
                    without scheduling a single showing. Only visit the homes that actually feel right, and make
                    faster, more confident offers.
                  </p>
                  <div className="flex items-start gap-3 mt-2">
                    <div className="w-px flex-1 bg-foreground/10 self-stretch" />
                    <div className="grid grid-cols-2 gap-3 flex-[8]">
                      {[
                        { val: "∞", label: "viewings from home" },
                        { val: "0", label: "wasted site visits" },
                        { val: "24/7", label: "access any time" },
                        { val: "1 link", label: "to share or save" },
                      ].map(({ val, label }) => (
                        <div key={label} className="border border-foreground/20 p-3">
                          <div className="text-xl font-bold font-mono text-[#FFD000]">{val}</div>
                          <div className="text-xs text-muted-foreground uppercase tracking-wide font-mono">{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
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
            WVISION
          </div>
          <p className="text-sm text-muted-foreground font-mono">© {new Date().getFullYear()} WVISION. All rights reserved.</p>
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
