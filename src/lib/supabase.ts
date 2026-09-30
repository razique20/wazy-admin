import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare global {
  interface Window {
    __wazySupabase?: SupabaseClient;
  }
}

/**
 * ⚠️ FALLBACK PROJECT — used only when NEXT_PUBLIC_SUPABASE_URL is not set.
 *
 * Pointing different deployments at different Supabase projects makes deleted
 * users "reappear" and data look inconsistent between local and production
 * (each console then shows a different auth id for the same email). Always set
 * the env vars per environment; the UI shows the active project ref in the
 * sidebar so drift is visible at a glance.
 */
export const DEFAULT_SUPABASE_URL = "https://jxyzmnaqukxvrcwolkil.supabase.co";
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_GgyDJs0On_xdoFr4QLxlWA_wyRlktjf";

/** True when the configured URL is the hardcoded fallback, not an env var. */
export const isUsingDefaultProjectUrl = !process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Extracts the project ref from a Supabase URL (the `{ref}.supabase.co` host
 * segment). Returns null for empty/invalid input. Pure so it is unit-testable.
 */
export function supabaseProjectRef(url?: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const m = host.match(/^([a-z0-9]{20})\.(supabase\.(co|in|net)|supabase\.red)$/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

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
