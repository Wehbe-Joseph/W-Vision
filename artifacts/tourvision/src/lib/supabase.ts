import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseEnvError =
  !supabaseUrl || !supabaseAnonKey
    ? "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Add them to your environment."
    : null;

function createSupabaseClient(): SupabaseClient {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      flowType: "pkce",
      /** We complete OAuth on `/auth/callback` via `exchangeCodeForSession` only. */
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export const supabase = supabaseEnvError ? null : createSupabaseClient();
