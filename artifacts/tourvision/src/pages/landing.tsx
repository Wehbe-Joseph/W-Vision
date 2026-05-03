import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SiZillow, SiAirbnb } from "react-icons/si";
import { CheckCircle2, Play, ArrowRight, Camera, Cuboid, Link as LinkIcon, ShieldCheck, BarChart3 } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(26,23,20,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(26,23,20,0.04)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000_60%,transparent_100%)]" />
      </div>

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
            <span className="font-serif font-bold text-xl tracking-tight">TourVision</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#how-it-works" className="hover:text-primary transition-colors">How it Works</a>
            <a href="#pricing" className="hover:text-primary transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="outline" className="border-primary text-primary hover:bg-primary/10">Sign In</Button>
            </Link>
            <Link href="/signup">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 glow-primary font-bold">Start Free</Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-32 pb-20 overflow-hidden">
        {/* Hero */}
        <section className="container mx-auto px-6 text-center max-w-5xl">
          <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="flex flex-col items-center">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary text-sm mb-8 font-mono">
              ✦ Powered by World Labs Marble AI
            </motion.div>
            <motion.h1 variants={fadeUp} className="text-5xl md:text-7xl font-serif font-extrabold tracking-tighter leading-[1.1] mb-6">
              Any Listing. Any Photos.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary-foreground">Instant 3D Walkthrough.</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="text-xl text-muted-foreground mb-10 max-w-2xl">
              Paste a URL. Our AI extracts the photos, builds a photorealistic 3D world, and gives you a shareable tour link in minutes.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center gap-4 mb-12">
              <Link href="/signup">
                <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 glow-primary font-bold text-lg h-14 px-8">
                  Generate Your First Tour Free <ArrowRight className="ml-2" />
                </Button>
              </Link>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10 h-14 px-8 text-lg font-bold">
                    <Play className="mr-2 w-5 h-5 fill-current" /> Watch 60s Demo
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-4xl p-0 bg-black border-border">
                   <div className="aspect-video bg-card flex items-center justify-center text-muted-foreground font-mono">
                      [Demo Video Embed Placeholder]
                   </div>
                </DialogContent>
              </Dialog>
            </motion.div>
            <motion.div variants={fadeUp} className="flex flex-wrap justify-center gap-8 text-sm text-muted-foreground font-medium">
              <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> No credit card required</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> First tour completely free</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Ready in under 30 minutes</div>
            </motion.div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.8 }} className="mt-20 relative">
            <div className="absolute -inset-10 bg-foreground/5 blur-[80px] rounded-full z-0" />
            <div className="relative z-10 rounded-xl border border-border bg-card shadow-2xl overflow-hidden aspect-[16/9] flex items-center justify-center">
              <span className="text-muted-foreground font-mono uppercase tracking-widest text-sm">Dashboard Preview</span>
            </div>
            
            {/* Floating Stats */}
            <motion.div animate={{ y: [-10, 10, -10] }} transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }} className="absolute -left-10 top-20 bg-card border border-border p-4 rounded-xl shadow-xl flex flex-col gap-1 hidden md:flex">
              <span className="text-3xl font-bold text-primary font-serif">2,847</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Tours Generated</span>
            </motion.div>
            <motion.div animate={{ y: [10, -10, 10] }} transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }} className="absolute -right-10 bottom-20 bg-card border border-border p-4 rounded-xl shadow-xl flex flex-col gap-1 hidden md:flex">
              <span className="text-3xl font-bold text-primary font-serif">28 min</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Avg Processing</span>
            </motion.div>
          </motion.div>
        </section>

        {/* Logo bar */}
        <section className="border-y border-border bg-card/50 py-8 mt-24 overflow-hidden flex flex-col items-center">
          <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest mb-6">Trusted by elite agents across MENA</p>
          <div className="flex gap-16 items-center text-muted opacity-50 px-6">
            <div className="flex items-center gap-2 text-2xl font-bold font-serif"><SiZillow /> Zillow</div>
            <div className="flex items-center gap-2 text-2xl font-bold font-serif"><SiAirbnb /> Airbnb</div>
            <div className="text-2xl font-bold font-serif tracking-tight">Bayut</div>
            <div className="text-2xl font-bold font-serif tracking-tight">PropertyFinder</div>
            <div className="text-2xl font-bold font-serif tracking-tight">Rightmove</div>
          </div>
        </section>

        {/* How it Works */}
        <section id="how-it-works" className="container mx-auto px-6 py-24">
          <h2 className="text-4xl font-serif font-bold text-center mb-16">Three steps to a <span className="text-primary">virtual world.</span></h2>
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {[
              { step: "01", title: "Paste URL", desc: "Drop any Zillow, Airbnb, or Property Finder link.", icon: LinkIcon },
              { step: "02", title: "AI Builds 3D", desc: "World Labs Marble extracts photos and builds the geometry.", icon: Cuboid },
              { step: "03", title: "Share One Link", desc: "Get an instant, navigable embed for buyers.", icon: ArrowRight }
            ].map((s, i) => (
              <div key={i} className="bg-card border border-border p-8 rounded-xl flex flex-col items-center text-center relative group hover:border-primary/50 transition-colors">
                <div className="w-16 h-16 rounded-full bg-background border border-border flex items-center justify-center mb-6 group-hover:bg-primary/10 transition-colors">
                  <s.icon className="w-8 h-8 text-primary" />
                </div>
                <div className="font-mono text-primary text-sm mb-2">{s.step}</div>
                <h3 className="text-xl font-bold mb-3">{s.title}</h3>
                <p className="text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="bg-card border border-border p-10 rounded-xl text-center">
            <ShieldCheck className="w-12 h-12 text-primary mx-auto mb-4" />
            <h3 className="text-2xl font-bold mb-2">AI Confidence Indicator</h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Not sure if the AI guessed a corner? TourVision highlights exactly what is real photography and what is AI-generated fill, ensuring complete transparency for your buyers.
            </p>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="container mx-auto px-6 py-24">
           <h2 className="text-4xl font-serif font-bold text-center mb-16">Simple, <span className="text-primary">powerful</span> pricing.</h2>
           <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto items-center">
              <div className="bg-card border border-border p-8 rounded-xl">
                <h3 className="text-xl font-bold mb-2">Free</h3>
                <div className="text-4xl font-serif font-bold mb-6">$0</div>
                <ul className="flex flex-col gap-3 mb-8 text-muted-foreground text-sm">
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> 1 Free Tour</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> Standard Processing</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> TourVision Watermark</li>
                </ul>
                <Link href="/signup">
                  <Button className="w-full" variant="outline">Start Free</Button>
                </Link>
              </div>
              <div className="bg-foreground text-background p-8 rounded-xl relative scale-105 shadow-2xl">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background text-foreground text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-border">Most Popular</div>
                <h3 className="text-xl font-bold mb-2 text-background">Pro</h3>
                <div className="text-4xl font-serif font-bold mb-6 text-background">$149<span className="text-lg opacity-60 font-sans font-normal">/mo</span></div>
                <ul className="flex flex-col gap-3 mb-8 text-background/70 text-sm">
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-background shrink-0" /> 15 Tours per month</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-background shrink-0" /> Priority Processing</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-background shrink-0" /> Custom Agency Branding</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-background shrink-0" /> Analytics Dashboard</li>
                </ul>
                <Link href="/signup">
                  <Button className="w-full bg-background text-foreground hover:bg-background/90 font-bold">Upgrade to Pro</Button>
                </Link>
              </div>
              <div className="bg-card border border-border p-8 rounded-xl">
                <h3 className="text-xl font-bold mb-2">Unlimited</h3>
                <div className="text-4xl font-serif font-bold mb-6">$299<span className="text-lg text-muted-foreground font-sans font-normal">/mo</span></div>
                <ul className="flex flex-col gap-3 mb-8 text-muted-foreground text-sm">
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> Unlimited Tours</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> Highest Priority Processing</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> API Access</li>
                </ul>
                <Link href="/signup">
                  <Button className="w-full" variant="outline">Contact Sales</Button>
                </Link>
              </div>
           </div>
        </section>

        <section className="container mx-auto px-6 py-24 max-w-3xl">
          <h2 className="text-3xl font-serif font-bold text-center mb-10">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1" className="border-border">
              <AccordionTrigger className="hover:text-primary">What platforms do you support?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">Any platform. Just paste the public URL and our system will extract the photos. Works best with Zillow, Airbnb, Bayut, and Property Finder.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2" className="border-border">
              <AccordionTrigger className="hover:text-primary">How long does processing take?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">Typically between 20-30 minutes depending on the number of photos and rooms.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3" className="border-border">
              <AccordionTrigger className="hover:text-primary">How accurate is the AI?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">World Labs Marble AI creates photorealistic geometry based on your photos. Areas not captured in photos are AI-estimated, which you can clearly see using our Confidence Indicator.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

      </main>

      <footer className="border-t border-border bg-card pt-16 pb-8">
        <div className="container mx-auto px-6 grid md:grid-cols-4 gap-12 mb-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="font-serif font-bold text-xl tracking-tight">TourVision</span>
            </div>
            <p className="text-muted-foreground text-sm">The cockpit for elite MENA real estate agents.</p>
          </div>
          <div>
            <h4 className="font-bold mb-4 font-mono text-sm uppercase">Product</h4>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary">Features</a></li>
              <li><a href="#" className="hover:text-primary">Pricing</a></li>
              <li><a href="#" className="hover:text-primary">Case Studies</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 font-mono text-sm uppercase">Support</h4>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary">Documentation</a></li>
              <li><a href="#" className="hover:text-primary">Contact</a></li>
              <li><a href="#" className="hover:text-primary">API Status</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 font-mono text-sm uppercase">Join 2,800+ agents</h4>
            <div className="flex gap-2">
              <Input placeholder="Email address" className="bg-background" />
              <Button className="bg-primary text-primary-foreground font-bold">Subscribe</Button>
            </div>
          </div>
        </div>
        <div className="container mx-auto px-6 border-t border-border pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} TourVision Inc. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-primary">Privacy Policy</a>
            <a href="#" className="hover:text-primary">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}