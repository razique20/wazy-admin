import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export interface TierAuditResponse {
  rows: {
    id: number | string;
    user_id: string;
    old_tier: string | null;
    new_tier: string;
    expires_at: string | null;
    changed_by: string | null;
    note: string | null;
    created_at: string;
  }[];
  source: "service_role" | "unconfigured" | "error";
  message?: string;
}

/**
 * GET /api/tier-audit
 * Returns the most recent tier-change history rows from
 * `public.user_tier_audit` (service-role only — the table has no policies).
 * Degrades to an empty list with `unconfigured` when the key is missing, and
 * to an empty list with `error` when the table doesn't exist yet.
 */
export async function GET() {
  if (!hasServiceRoleKey()) {
    const body: TierAuditResponse = {
      rows: [],
      source: "unconfigured",
      message:
        "SUPABASE_SERVICE_ROLE_KEY is not set — the tier audit trail (public.user_tier_audit) cannot be read.",
    };
    return NextResponse.json(body);
  }

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("user_tier_audit")
      .select("id, user_id, old_tier, new_tier, expires_at, changed_by, note, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const body: TierAuditResponse = { rows: data ?? [], source: "service_role" };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const body: TierAuditResponse = {
      rows: [],
      source: "error",
      message: err instanceof Error ? err.message : "Failed to read user_tier_audit",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
