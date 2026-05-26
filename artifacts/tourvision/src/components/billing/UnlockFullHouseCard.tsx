import { useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getApiUrl } from "@/lib/runtime-api";

type Props = {
  tourId: string;
  lockedRoomsCount: number;
  roomsDetected?: number;
  className?: string;
  onUnlocked?: () => void;
};

export default function UnlockFullHouseCard({
  tourId,
  lockedRoomsCount,
  roomsDetected,
  className = "",
  onUnlocked,
}: Props) {
  const { toast } = useToast();
  const { getAccessToken } = useAuth();
  const [loading, setLoading] = useState(false);

  if (lockedRoomsCount <= 0) return null;

  const total = roomsDetected ?? lockedRoomsCount + 1;

  async function startCheckout() {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(getApiUrl("/api/billing/checkout/full-house"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tourId }),
      });
      const data = (await res.json()) as { url?: string; message?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? "Checkout failed");
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No checkout URL returned");
    } catch (err) {
      toast({
        title: "Could not start checkout",
        description: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      onUnlocked?.();
    }
  }

  return (
    <div
      className={`rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-6 text-left shadow-lg ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary/15 p-2.5 shrink-0">
          <Lock className="w-5 h-5 text-primary" />
        </div>
        <div className="space-y-2 flex-1">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Free preview
          </p>
          <h3 className="text-xl font-display font-bold">
            Unlock your full house — $29
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You&apos;ve generated <strong>1 of {total} rooms</strong>. Pay once to
            generate every remaining room as a 360° panorama and remove the viewing
            countdown on this tour.
          </p>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              {lockedRoomsCount} more room{lockedRoomsCount === 1 ? "" : "s"} to generate
            </li>
            <li className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              One-time purchase — no subscription required
            </li>
          </ul>
          <Button
            className="mt-2 w-full sm:w-auto font-bold"
            size="lg"
            disabled={loading}
            onClick={() => void startCheckout()}
          >
            {loading ? "Redirecting to Stripe…" : "Unlock full house — $29"}
          </Button>
        </div>
      </div>
    </div>
  );
}
