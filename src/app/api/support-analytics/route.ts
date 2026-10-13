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

    // Group feature requests by feature_name
    const result = await client
      .rpc("feature_request_popularity", { limit: 50 });

    if (result === null || result === undefined) {
      // Fallback: compute in JS if RPC doesn't exist
      const rows = await client
        .from("support_requests")
        .select("feature_name, created_at")
        .eq("request_type", "feature_request")
        .neq("feature_name", null);

      if (rows.error) {
        return NextResponse.json(
          { ok: false, error: rows.error.message },
          { status: 500 }
        );
      }

      const counts: Record<string, { feature: string; count: number; firstRequested: string; lastRequested: string }> = {};
      for (const row of rows.data || []) {
        const fn = row.feature_name;
        if (!fn) continue;
        if (!counts[fn]) {
          counts[fn] = { feature: fn, count: 0, firstRequested: row.created_at, lastRequested: row.created_at };
        }
        counts[fn].count++;
        if (row.created_at < counts[fn].firstRequested) counts[fn].firstRequested = row.created_at;
        if (row.created_at > counts[fn].lastRequested) counts[fn].lastRequested = row.created_at;
      }

      const features = Object.values(counts).sort((a, b) => b.count - a.count);
      const total = features.reduce((sum, f) => sum + f.count, 0);

      return NextResponse.json({ ok: true, features, total });
    }

    // RPC returned data
    const rpcFeatures = result as unknown as Array<{ feature_name: string; request_count: number; first_requested: string; last_requested: string }>;
    const features = rpcFeatures
      .filter(f => f.feature_name)
      .sort((a, b) => (b.request_count) - (a.request_count));

    const total = features.reduce((sum, f) => sum + f.request_count, 0);

    return NextResponse.json({ ok: true, features, total });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to fetch feature popularity" },
      { status: 500 }
    );
  }
}
