import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare global {
  interface Window {
    __wazySupabase?: SupabaseClient;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://jxyzmnaqukxvrcwolkil.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_GgyDJs0On_xdoFr4QLxlWA_wyRlktjf";

/**
 * Browser-side Supabase client (anon key). RLS applies — fine for the admin
 * console as long as the relevant tables are readable by the admin role.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Server-only Supabase client using the service role key. Bypasses RLS across
 * all users for full admin capabilities. Throws when used on the client or
 * when the key is not configured — callers should degrade gracefully to the
 * anon client in that case.
 */
export function createServiceRoleClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("createServiceRoleClient must only be called server-side");
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new SupabaseConfigError("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Returns true when a service-role key is configured for server-side admin work. */
export function hasServiceRoleKey(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}
