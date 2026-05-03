import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompleteOnboarding } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Building2, Home, Briefcase, MapPin, Link2 } from "lucide-react";

const variants = {
  enter: (direction: number) => ({ x: direction > 0 ? 50 : -50, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction < 0 ? 50 : -50, opacity: 0 })
};

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const completeMutation = useCompleteOnboarding();

  // Form state
  const [accountType, setAccountType] = useState("agent");
  const [country, setCountry] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [url, setUrl] = useState("");

  const nextStep = () => {
    if (step === 1 && !accountType) return;
    if (step === 2 && !country) return;
    setDirection(1);
    setStep(s => s + 1);
  };

  const finish = async () => {
    try {
      await completeMutation.mutateAsync({
        data: {
          accountType: accountType as any,
          country,
          whatsappNumber: whatsapp
        }
      });
      // Mock login since we don't have real auth hooked to API
      const mockUser = { id: "1", name: "Agent Smith", email: "agent@example.com", subscriptionTier: "pro" };
      localStorage.setItem("tourvision_user", JSON.stringify(mockUser));
      
      toast({ title: "Setup complete!", description: "Welcome to TourVision." });
      
      if (url) {
        // In a real app we might pass this URL to the new-tour flow via state/params
        setLocation("/dashboard/new-tour");
      } else {
        setLocation("/dashboard");
      }
    } catch (e) {
      toast({ title: "Error", description: "Failed to complete setup.", variant: "destructive" });
      setLocation("/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-card">
        <motion.div 
          className="h-full bg-primary" 
          initial={{ width: "33%" }}
          animate={{ width: `${(step / 3) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-2 mb-12 justify-center">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="font-serif font-bold text-xl tracking-tight">TourVision</span>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden relative min-h-[400px]">
          <AnimatePresence mode="wait" custom={direction}>
            {step === 1 && (
              <motion.div
                key="step1"
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="absolute inset-0 p-8 sm:p-12 flex flex-col"
              >
                <h2 className="text-3xl font-serif font-bold mb-2">What best describes you?</h2>
                <p className="text-muted-foreground mb-8">We'll tailor your dashboard experience based on your role.</p>
                
                <RadioGroup value={accountType} onValueChange={setAccountType} className="grid sm:grid-cols-2 gap-4 flex-1 content-start">
                  {[
                    { id: "agent", label: "Real Estate Agent", icon: Building2 },
                    { id: "host", label: "Airbnb Host", icon: Home },
                    { id: "developer", label: "Property Developer", icon: Briefcase },
                    { id: "manager", label: "Property Manager", icon: Briefcase }
                  ].map(role => (
                    <Label 
                      key={role.id} 
                      className={`flex items-center gap-4 p-4 border rounded-xl cursor-pointer transition-colors ${accountType === role.id ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-accent'}`}
                    >
                      <RadioGroupItem value={role.id} id={role.id} className="sr-only" />
                      <div className={`p-2 rounded-lg ${accountType === role.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        <role.icon className="w-5 h-5" />
                      </div>
                      <span className="font-medium">{role.label}</span>
                    </Label>
                  ))}
                </RadioGroup>

                <div className="mt-8 flex justify-end">
                  <Button onClick={nextStep} className="bg-primary text-primary-foreground font-bold px-8 h-12" disabled={!accountType}>
                    Continue →
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="absolute inset-0 p-8 sm:p-12 flex flex-col"
              >
                <h2 className="text-3xl font-serif font-bold mb-2">Where are you based?</h2>
                <p className="text-muted-foreground mb-8">Help us optimize your server region for the fastest processing.</p>

                <div className="space-y-6 flex-1">
                  <div className="space-y-2">
                    <Label>Country / Region <span className="text-destructive">*</span></Label>
                    <Select value={country} onValueChange={setCountry}>
                      <SelectTrigger className="h-12 bg-background">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="uae">United Arab Emirates</SelectItem>
                        <SelectItem value="ksa">Saudi Arabia</SelectItem>
                        <SelectItem value="lebanon">Lebanon</SelectItem>
                        <SelectItem value="egypt">Egypt</SelectItem>
                        <SelectItem value="qatar">Qatar</SelectItem>
                        <SelectItem value="other">Other Region</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>WhatsApp Number <span className="text-muted-foreground font-normal">(Optional - for tour ready alerts)</span></Label>
                    <Input 
                      placeholder="+971 50 123 4567" 
                      className="h-12 bg-background" 
                      value={whatsapp}
                      onChange={e => setWhatsapp(e.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-8 flex justify-end">
                  <Button onClick={nextStep} className="bg-primary text-primary-foreground font-bold px-8 h-12" disabled={!country}>
                    Continue →
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="absolute inset-0 p-8 sm:p-12 flex flex-col items-center text-center justify-center"
              >
                <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
                  <MapPin className="w-8 h-8" />
                </div>
                <h2 className="text-3xl font-serif font-bold mb-2">You're all set.</h2>
                <p className="text-muted-foreground mb-8">Let's make your first 3D tour. Paste any listing URL below.</p>

                <div className="w-full max-w-md relative flex items-center mb-8">
                  <Link2 className="absolute left-4 text-muted-foreground w-5 h-5" />
                  <Input 
                    placeholder="https://zillow.com/homedetails/..." 
                    className="h-14 pl-12 pr-4 bg-background text-lg"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                  />
                </div>

                <div className="flex flex-col items-center gap-4 w-full">
                  <Button 
                    onClick={finish} 
                    className="w-full max-w-md bg-primary text-primary-foreground hover:bg-primary/90 glow-primary font-bold h-14 text-lg"
                    disabled={completeMutation.isPending}
                  >
                    {completeMutation.isPending ? "Setting up..." : "Generate My First Tour →"}
                  </Button>
                  <Button variant="ghost" onClick={finish} className="text-muted-foreground hover:text-foreground">
                    Skip for now
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}