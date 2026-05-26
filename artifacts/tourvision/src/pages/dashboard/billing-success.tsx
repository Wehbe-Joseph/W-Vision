import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { getApiUrl } from "@/lib/runtime-api";

export default function BillingSuccess() {
  const [, setLocation] = useLocation();
  const { getAccessToken } = useAuth();
  const [message, setMessage] = useState("Confirming your payment…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tourId = params.get("tour_id");
    if (!tourId) {
      setMessage("Payment received. Open your tour from the dashboard.");
      return;
    }

    void (async () => {
      try {
        const token = await getAccessToken();
        await fetch(getApiUrl(`/api/generate-tour/${tourId}/resume`), {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        setMessage("Full house unlocked — generating your remaining rooms.");
      } catch {
        setMessage("Payment received. Generation will continue shortly.");
      }
    })();
  }, [getAccessToken]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4 rounded-2xl border border-border bg-card p-8 shadow-xl">
        <CheckCircle2 className="w-14 h-14 text-primary mx-auto" />
        <h1 className="text-2xl font-display font-bold">Thank you!</h1>
        <p className="text-muted-foreground text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          {message}
        </p>
        <Button
          className="w-full font-bold"
          onClick={() => setLocation("/dashboard/tours")}
        >
          Go to my tours
        </Button>
      </div>
    </div>
  );
}
