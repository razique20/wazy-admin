import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not configured" },
      { status: 500 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10) || 50);
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);
  try {
    const client = createServiceRoleClient();

    const totalResult = await client
      .from("error_reports")
      .select("*", { count: "exact", head: true });

    const total = Number(totalResult.count ?? 0);

    const rowsResult = await client
      .from("error_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (rowsResult.error) {
      console.error("Error fetching error reports:", rowsResult.error);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch error reports" },
        { status: 500 }
      );
    }

    const reports = (rowsResult.data ?? []) as Array<{
      id: string;
      user_id: string | null;
      platform: string | null;
      app_version: string | null;
      device_info: string | null;
      error_type: string | null;
      error_message: string | null;
      stack_trace: string | null;
      severity: "error" | "critical" | "fatal" | null;
      created_at: string;
      fingerprint: string | null;
    }>;

    return NextResponse.json(
      {
        ok: true,
        reports,
        total,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Unexpected error in error-reports route:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
