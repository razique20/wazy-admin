import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export interface AdminAuditRow {
  id: number | string;
  action: string;
  user_id: string | null;
  target_table: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  performed_by: string;
  performed_at: string;
}

export interface AdminAuditResponse {
  rows: AdminAuditRow[];
  source: "service_role" | "unconfigured" | "error";
  message?: string;
}

/**
 * GET /api/admin-audit?userId=<uuid>&limit=200
 * Returns the most recent admin actions from public.admin_audit_log
 * (service-role only — the table has no RLS policies on purpose).
 */
export async function GET(request: Request) {
  if (!hasServiceRoleKey()) {
    const body: AdminAuditResponse = {
      rows: [],
      source: "unconfigured",
      message:
        "SUPABASE_SERVICE_ROLE_KEY is not set — the admin audit log (public.admin_audit_log) cannot be read.",
    };
    return NextResponse.json(body);
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const limitParam = Number(url.searchParams.get("limit") ?? "200");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 500) : 200;

  try {
    const admin = createServiceRoleClient();
    let query = admin
      .from("admin_audit_log")
      .select("id, action, user_id, target_table, target_id, details, performed_by, performed_at")
      .order("performed_at", { ascending: false })
      .limit(limit);
    if (userId) query = query.eq("user_id", userId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const body: AdminAuditResponse = { rows: (data ?? []) as AdminAuditRow[], source: "service_role" };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const body: AdminAuditResponse = {
      rows: [],
      source: "error",
      message: err instanceof Error ? err.message : "Failed to read admin audit log",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
