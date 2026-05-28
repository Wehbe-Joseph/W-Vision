import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { supabase, supabaseEnvError } from "@/lib/supabase";
import { hasPendingTour } from "@/hooks/use-pending-tour";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState("Finishing sign in…");

  useEffect(() => {
    if (supabaseEnvError || !supabase) {
      setLocation("/login?error=Supabase+is+not+configured");
      return;
    }

    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(
      window.location.hash.replace(/^#/, ""),
    );
    const oauthError =
      search.get("error_description") ||
      search.get("error") ||
      hash.get("error_description") ||
      hash.get("error");

    if (oauthError) {
      setLocation(`/login?error=${encodeURIComponent(oauthError)}`);
      return;
    }

    void (async () => {
      try {
        const code = search.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            const hint =
              /pkce|code verifier/i.test(error.message)
                ? " Use the same site URL you started from (www vs non-www), or sign in again."
                : "";
            setLocation(
              `/login?error=${encodeURIComponent(error.message + hint)}`,
            );
            return;
          }
        }

        // Session write can be slightly delayed on some browsers.
        let session = (await supabase.auth.getSession()).data.session;
        if (!session) {
          const refreshed = await supabase.auth.refreshSession();
          session = refreshed.data.session;
        }

        if (!session) {
          setMessage("Could not complete sign in. Redirecting…");
          window.setTimeout(
            () => setLocation("/login?error=Sign-in+did+not+complete"),
            2000,
          );
          return;
        }

        // Clean OAuth query params from the address bar.
        const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
        window.history.replaceState({}, "", `${base}/auth/callback`);

        if (hasPendingTour()) {
          setLocation("/dashboard/new-tour");
        } else {
          setLocation("/dashboard");
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Authentication failed";
        setLocation(`/login?error=${encodeURIComponent(msg)}`);
      }
    })();
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="font-mono text-xs uppercase tracking-widest">{message}</p>
      </div>
    </div>
  );
}
