import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

type Props = {
  tourId: string;
  lockedRoomsCount: number;
  roomsDetected?: number;
  className?: string;
};

export default function UnlockFullHouseCard({
  tourId: _tourId,
  lockedRoomsCount,
  roomsDetected,
  className = "",
}: Props) {
  if (lockedRoomsCount <= 0) return null;

  const total = roomsDetected ?? lockedRoomsCount + 1;

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
              One-time purchase — card checkout coming next
            </li>
          </ul>
          <Link href="/dashboard/billing">
            <Button className="mt-2 w-full sm:w-auto font-bold" size="lg">
              View pricing — $29 full house
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
