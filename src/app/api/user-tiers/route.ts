import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";
import { isExpired, resolveTier } from "@/lib/tiers";

export const dynamic = "force-dynamic";

export interface UserTiersResponse {
  tiers: Record<string, string>;
  /** userId -> ISO expiry timestamp of the granted plan (absent = no expiry). */
  expiries: Record<string, string>;
  source: "service_role" | "unconfigured" | "error";
  message?: string;
}

/**
 * GET /api/user-tiers
 * Returns `{ userId -> raw tier string }` (plus `{ userId -> expiry ISO }` for
 * time-limited grants) for every row in `public.user_tiers`. Rows whose expiry
 * has passed resolve to Free, matching what the app should honor. Uses the
 * service role key server-side only; the anon key can read a user's own tier but
 * cannot enumerate others, so without the service key the console degrades to
 * treating everyone as Free.
 */
export async function GET() {
  if (!hasServiceRoleKey()) {
    const body: UserTiersResponse = {
      tiers: {},
      expiries: {},
      source: "unconfigured",
      message:
        "SUPABASE_SERVICE_ROLE_KEY is not set — tier rows in public.user_tiers cannot be read; everyone shows as Free until it is configured.",
    };
    return NextResponse.json(body);
  }

  try {
    const admin = createServiceRoleClient();
    const tiers: Record<string, string> = {};
    const expiries: Record<string, string> = {};
    let from = 0;
    const pageSize = 1000;
    // Page through user_tiers (rare, but stay correct for large user bases).
    for (let page = 0; page < 100; page += 1) {
      const { data, error } = await admin
        .from("user_tiers")
        .select("user_id, tier, expires_at")
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        if (isExpired(row.expires_at)) continue; // expired grant → absent from the map → Free in the UI
        tiers[row.user_id] = resolveTier(row);
        if (row.expires_at) expiries[row.user_id] = row.expires_at;
      }
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }

    const body: UserTiersResponse = { tiers, expiries, source: "service_role" };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const body: UserTiersResponse = {
      tiers: {},
      expiries: {},
      source: "error",
      message: err instanceof Error ? err.message : "Failed to read user_tiers",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
