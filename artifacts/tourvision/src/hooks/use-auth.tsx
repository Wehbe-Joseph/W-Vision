import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { supabase, supabaseEnvError } from "@/lib/supabase";
import { resolveApiBaseUrl } from "@/lib/resolve-api-base";
import type { Session, User } from "@supabase/supabase-js";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  profileImageUrl: string | null;
}

export interface SignupResult {
  /** True when Supabase requires the user to click the email confirmation link. */
  needsEmailConfirmation: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signupWithEmail: (
    email: string,
    password: string,
    fullName?: string,
  ) => Promise<SignupResult>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readMetadata(user: User | null, key: string): string | null {
  if (!user) return null;
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const value = meta?.[key];
  return typeof value === "string" ? value : null;
}

function mapUser(user: User | null | undefined): AuthUser | null {
  if (!user) return null;
  const fullName = readMetadata(user, "full_name") ?? readMetadata(user, "name");
  const [firstName, ...rest] = (fullName ?? "").trim().split(/\s+/);
  return {
    id: user.id,
    email: user.email ?? null,
    firstName: firstName || null,
    lastName: rest.length ? rest.join(" ") : null,
    fullName: fullName ?? null,
    profileImageUrl:
      readMetadata(user, "avatar_url") ?? readMetadata(user, "picture"),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(!supabaseEnvError);

  const getAccessToken = useCallback(async () => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  useEffect(() => {
    if (supabaseEnvError || !supabase) {
      setUser(null);
      setIsLoading(false);
      setAuthTokenGetter(null);
      return;
    }

    setAuthTokenGetter(() => getAccessToken());

    let mounted = true;

    // Single source of truth for auth state. INITIAL_SESSION fires exactly
    // once after supabase-js has finished bootstrapping (including parsing
    // any OAuth hash/code in the URL), so isLoading flips to false at the
    // right time. Subsequent SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED events
    // keep the React state in sync.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      if (!mounted) return;
      setUser(mapUser(session?.user ?? null));
      setIsLoading(false);
    });

    // Defensive fallback: in some environments the INITIAL_SESSION event
    // fires before the listener attaches. Reading the session synchronously
    // catches that case.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(mapUser(data.session?.user ?? null));
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      setAuthTokenGetter(null);
    };
  }, [getAccessToken]);

  useEffect(() => {
    const configuredApiBase = resolveApiBaseUrl();
    setBaseUrl(configuredApiBase || null);
    return () => setBaseUrl(null);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    if (!supabase) {
      throw new Error(supabaseEnvError ?? "Supabase is not configured.");
    }
    const redirectTo = `${window.location.origin}/dashboard`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) throw error;
  }, []);

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!supabase) {
        throw new Error(supabaseEnvError ?? "Supabase is not configured.");
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    [],
  );

  const signupWithEmail = useCallback(
    async (email: string, password: string, fullName?: string): Promise<SignupResult> => {
      if (!supabase) {
        throw new Error(supabaseEnvError ?? "Supabase is not configured.");
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: fullName ? { full_name: fullName } : undefined,
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;

      // When email confirmation is enabled in Supabase Auth, signUp returns
      // a user but no session. The user must click the email link first.
      const needsEmailConfirmation = !data.session;
      return { needsEmailConfirmation };
    },
    [],
  );

  const logout = useCallback(async () => {
    if (!supabase) {
      throw new Error(supabaseEnvError ?? "Supabase is not configured.");
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // Full navigation so protected routes unmount and user lands on marketing home.
    const base = import.meta.env.BASE_URL || "/";
    window.location.assign(new URL(base, window.location.origin).href);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      loginWithGoogle,
      loginWithEmail,
      signupWithEmail,
      logout,
      getAccessToken,
    }),
    [
      user,
      isLoading,
      loginWithGoogle,
      loginWithEmail,
      signupWithEmail,
      logout,
      getAccessToken,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
