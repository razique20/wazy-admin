import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not configured" },
      { status: 503 }
    );
  }

  try {
    const client = createServiceRoleClient();

    // Feature popularity is computed server-side in TypeScript.
    // Do not depend on a DB RPC that may not exist in every Supabase project.
    const features = await client
      .from("support_requests")
      .select("id, feature_name, created_at")
      .eq("request_type", "feature_request")
      .neq("feature_name", null);

    if (features.error) {
      return NextResponse.json(
        { ok: false, error: features.error.message },
        { status: 500 }
      );
    }

    const counts: Record<
      string,
      { feature_name: string; request_count: number; first_requested: string; last_requested: string }
    > = {};

    const data = features.data ?? [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i] as { feature_name: string | null; created_at: string | null } | null;
      if (!row) continue;
      const fn = typeof row.feature_name === "string" ? row.feature_name.trim() : null;
      if (!fn) continue;

      if (!counts[fn]) {
        counts[fn] = {
          feature_name: fn,
          request_count: 0,
          first_requested: row.created_at ?? "",
          last_requested: row.created_at ?? "",
        };
      }

      counts[fn].request_count++;
      if (row.created_at && row.created_at < counts[fn].first_requested) {
        counts[fn].first_requested = row.created_at;
      }
      if (row.created_at && row.created_at > counts[fn].last_requested) {
        counts[fn].last_requested = row.created_at;
      }
    }

    const ranked: Array<{ feature_name: string; request_count: number; first_requested: string; last_requested: string }> = Object.values(counts);
    ranked.sort((a, b) => b.request_count - a.request_count);
    const total = ranked.reduce((sum, f) => sum + f.request_count, 0);

    return NextResponse.json({ ok: true, features: ranked, total });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to fetch feature popularity" },
      { status: 500 }
    );
  }
}
