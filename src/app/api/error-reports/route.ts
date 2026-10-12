import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";
import type { ErrorReport } from "@/lib/types";

export const dynamic = "force-dynamic";


export async function GET(request: Request) {
  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      {
        ok: false,
        error: "SUPABASE_SERVICE_ROLE_KEY is not configured - error reports unavailable.",
      },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "100", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
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

    const reports = (rowsResult.data ?? []) as ErrorReport[];

    return NextResponse.json(
      {
        ok: true,
        reports,
        total,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to fetch error reports",
      },
      { status: 500 }
    );
  }
}
