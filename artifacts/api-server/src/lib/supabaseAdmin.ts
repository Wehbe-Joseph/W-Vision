import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const authOpts = {
  auth: { autoRefreshToken: false, persistSession: false },
} as const;

let _auth: SupabaseClient | null | undefined;
let _admin: SupabaseClient | null | undefined;

/**
 * Lazy init so `.env` is loaded before clients are created.
 * (esbuild bundles hoist static imports above dotenv.config in index.ts.)
 */
export function getSupabaseAuth(): SupabaseClient | null {
  if (_auth === undefined) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    _auth = url && key ? createClient(url, key, authOpts) : null;
  }
  return _auth;
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (_admin === undefined) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    _admin = url && key ? createClient(url, key, authOpts) : null;
  }
  return _admin;
}

export function requireSupabaseAdmin(): SupabaseClient {
  const client = getSupabaseAdmin();
  if (!client) {
    throw new Error(
      "supabaseAdmin not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in artifacts/api-server/.env.",
    );
  }
  return client;
}
