import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";
import { computeAiAdoption, quotaMonthKey, computeUserQuotaStatus, computeAiUsage } from "@/lib/ai-quota";
import type { AiAdoptionMetrics } from "@/lib/ai-quota";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai-adoption?month=YYYY-MM
 * Returns AI feature adoption metrics:
 * - Adoption rate (% of active users using AI features)
 * - Per-feature breakdown (users, calls, adoption rate)
 * - Quota exhaustion list (users near/exceeding quota limits)
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY for reading auth.users and ai_quota_usage.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month");

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      {
        ok: false,
        error: "SUPABASE_SERVICE_ROLE_KEY is not configured - AI adoption metrics unavailable.",
      },
      { status: 503 }
    );
  }

  const month = monthParam ?? quotaMonthKey();

  try {
    const admin = createServiceRoleClient();

    // 1. Fetch AI quota usage for the month
    const { data: quotaData, error: quotaError } = await admin
      .from("ai_quota_usage")
      .select("user_id, feature_name, used_count, usage_month")
      .eq("usage_month", month);

    if (quotaError) {
      console.warn(`[ai-adoption] Failed to fetch quota usage: ${quotaError.message}`);
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to fetch AI quota data: ${quotaError.message}`,
        },
        { status: 500 }
      );
    }

    // 2. Fetch all auth users (for denominator)
    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });

    if (usersError) {
      console.warn(`[ai-adoption] Failed to fetch users: ${usersError.message}`);
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to fetch user list: ${usersError.message}`,
        },
        { status: 500 }
      );
    }

    // Paginate through all users (up to 1000)
    const allUsers = [...(usersData?.users ?? [])];
    let currentPage = 1;
    while (usersData?.users?.length === 50 && currentPage < 20) {
      currentPage++;
      const nextPage = await admin.auth.admin.listUsers({ page: currentPage, perPage: 50 });
      if (nextPage.data?.users) {
        allUsers.push(...nextPage.data.users);
      }
      if (nextPage.data?.users?.length < 50) break;
    }

    // Transform to our user format
    const users = allUsers.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      lastSignInAt: u.last_sign_in_at ?? null,
      createdAt: u.created_at ?? null,
    }));

    // 3. Compute adoption metrics
    const quotaRows = (quotaData ?? []) as Parameters<typeof computeAiAdoption>[0];
    const metrics = computeAiAdoption(quotaRows, users, month);

    // 4. Fetch tier info for accurate quota exhaustion
    const tiers: Record<string, string> = {};
    for (let i = 0; i < users.length; i += 50) {
      const batch = users.slice(i, i + 50);
      const { data: tierData } = await admin
        .from("user_tiers")
        .select("user_id, tier")
        .in("user_id", batch.map((u) => u.id));

      if (tierData) {
        for (const row of tierData) {
      const tier = typeof row.tier === "string" ? row.tier : "free";
      tiers[row.user_id] = tier;
    }
      }
    }

    // Recompute quota exhaustion with actual tiers
    const usageByUser = computeAiUsage(quotaRows, month);
    const exhaustionWithTiers: AiAdoptionMetrics["quotaExhaustion"] = [];

    for (const usage of usageByUser) {
      const tierRaw = tiers[usage.userId] ?? "free";
      const tier: "free" | "plus" | "business" = tierRaw === "plus" || tierRaw === "business" ? tierRaw : "free";
      const email = users.find((u) => u.id === usage.userId)?.email ?? null;
      const statusList = computeUserQuotaStatus(usage, tier);

      for (const s of statusList) {
        exhaustionWithTiers.push({
          userId: usage.userId,
          email,
          tier,
          feature: s.feature,
          used: s.used,
          limit: s.limit,
          percentUsed: s.percentUsed,
          status: s.status,
        });
      }
    }

    exhaustionWithTiers.sort((a, b) => b.percentUsed - a.percentUsed);

    return NextResponse.json(
      {
        ok: true,
        month,
        metrics: {
          ...metrics,
          quotaExhaustion: exhaustionWithTiers,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to compute AI adoption metrics",
      },
      { status: 500 }
    );
  }
}