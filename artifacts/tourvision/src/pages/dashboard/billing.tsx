import {
  useGetUserLimits,
  useSubscribeNewsletter,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Billing() {
  const { data: limits, isLoading } = useGetUserLimits();
  const subscribe = useSubscribeNewsletter();
  const qc = useQueryClient();
  const { toast } = useToast();

  const upgrade = async (tier: "pro" | "unlimited") => {
    try {
      const result = await subscribe.mutateAsync({
        // The generated client types this as a "newsletter" body, but our
        // backend uses it as the subscription endpoint. Cast and pass tier.
        data: { tier } as unknown as { email: string },
      });
      toast({ title: "Plan updated", description: (result as { message?: string }).message ?? `Upgraded to ${tier}` });
      qc.invalidateQueries();
    } catch {
      toast({ title: "Could not upgrade plan", variant: "destructive" });
    }
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-[400px] w-full rounded-xl" /></div>;

  const usagePercent = limits ? (limits.toursThisMonth / limits.toursLimit) * 100 : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto w-full space-y-8">
      <h1 className="text-3xl font-serif font-bold">Billing & Usage</h1>

      <Card className="bg-card border-border relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-serif">Current Plan: <span className="text-primary uppercase tracking-wider">{limits?.tier}</span></CardTitle>
              <CardDescription className="mt-1">
                {limits?.renewalDate ? `Renews on ${new Date(limits.renewalDate).toLocaleDateString()}` : 'Free forever'}
              </CardDescription>
            </div>
            <div className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-bold uppercase tracking-wider">
              Active
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tours used this month</span>
              <span className="font-mono font-bold">{limits?.toursThisMonth} / {limits?.toursLimit}</span>
            </div>
            <Progress value={usagePercent} className="h-3" />
            <p className="text-xs text-muted-foreground text-right">{limits?.toursRemaining} tours remaining</p>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-serif font-bold mb-4">Available Plans</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <Card className={`bg-card border-border ${limits?.tier === 'free' ? 'border-primary shadow-[0_0_20px_rgba(0,255,136,0.1)]' : ''}`}>
            <CardContent className="p-6">
              <h3 className="font-bold mb-2">Free</h3>
              <div className="text-3xl font-serif font-bold mb-6">$0<span className="text-sm font-sans font-normal text-muted-foreground">/mo</span></div>
              <ul className="space-y-2 mb-6 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> 1 tour limit</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Standard processing</li>
              </ul>
              <Button variant="outline" className="w-full" disabled={limits?.tier === 'free'}>Current Plan</Button>
            </CardContent>
          </Card>
          <Card className={`bg-card border-border ${limits?.tier === 'pro' ? 'border-primary shadow-[0_0_20px_rgba(0,255,136,0.1)]' : ''}`}>
            <CardContent className="p-6">
              <h3 className="font-bold mb-2">Pro</h3>
              <div className="text-3xl font-serif font-bold mb-6">$149<span className="text-sm font-sans font-normal text-muted-foreground">/mo</span></div>
              <ul className="space-y-2 mb-6 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> 15 tours/mo</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Priority processing</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Custom branding</li>
              </ul>
              <Button
                className="w-full bg-primary text-primary-foreground"
                disabled={limits?.tier === 'pro' || subscribe.isPending}
                onClick={() => upgrade("pro")}
              >
                {limits?.tier === 'pro' ? 'Current Plan' : 'Upgrade to Pro'}
              </Button>
            </CardContent>
          </Card>
          <Card className={`bg-card border-border ${limits?.tier === 'unlimited' ? 'border-primary shadow-[0_0_20px_rgba(0,255,136,0.1)]' : ''}`}>
            <CardContent className="p-6">
              <h3 className="font-bold mb-2">Unlimited</h3>
              <div className="text-3xl font-serif font-bold mb-6">$299<span className="text-sm font-sans font-normal text-muted-foreground">/mo</span></div>
              <ul className="space-y-2 mb-6 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Unlimited tours</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Highest priority</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> API Access</li>
              </ul>
              <Button
                variant="outline"
                className="w-full"
                disabled={limits?.tier === 'unlimited' || subscribe.isPending}
                onClick={() => upgrade("unlimited")}
              >
                {limits?.tier === 'unlimited' ? 'Current Plan' : 'Upgrade to Unlimited'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}