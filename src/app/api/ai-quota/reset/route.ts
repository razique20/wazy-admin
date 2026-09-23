import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface ResetRequest {
  userId?: unknown;
  /** Omit to reset every feature for the user's current month. */
  featureName?: unknown;
  /** Omit to reset the current month (`YYYY-MM`). */
  usageMonth?: unknown;
}

interface ResetResponse {
  ok: boolean;
  resetCount?: number;
  error?: string;
}

const VALID_FEATURES = new Set(["groq_ai_summary", "groq_ai_budget_plan"]);
const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * POST /api/ai-quota/reset
 * Resets AI quota counters. Scope:
 * - `userId` (required) limits the reset to one user.
 * - `featureName` (optional) limits it to one feature.
 * - `usageMonth` (optional, `YYYY-MM`) defaults to the current UTC month.
 * Also supports `allUsers: true` for the monthly bulk reset (no userId).
 */
export async function POST(request: Request) {
  if (!hasServiceRoleKey()) {
    return NextResponse.json<ResetResponse>(
      {
        ok: false,
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not configured — quota resets are disabled. Add it to .env.local and restart.",
      },
      { status: 503 },
    );
  }

  let body: ResetRequest & { allUsers?: unknown };
  try {
    body = (await request.json()) as ResetRequest & { allUsers?: unknown };
  } catch {
    return NextResponse.json<ResetResponse>({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.featureName !== undefined && !(typeof body.featureName === "string" && VALID_FEATURES.has(body.featureName))) {
    return NextResponse.json<ResetResponse>(
      { ok: false, error: "featureName must be groq_ai_summary or groq_ai_budget_plan" },
      { status: 400 },
    );
  }
  if (body.usageMonth !== undefined && !(typeof body.usageMonth === "string" && MONTH_RE.test(body.usageMonth))) {
    return NextResponse.json<ResetResponse>(
      { ok: false, error: "usageMonth must look like YYYY-MM" },
      { status: 400 },
    );
  }

  const month = typeof body.usageMonth === "string" ? body.usageMonth : monthKeyUtc();
  const admin = createServiceRoleClient();

  try {
    let query = admin.from("ai_quota_usage").update({ used_count: 0, updated_at: new Date().toISOString() });
    if (typeof body.userId === "string" && body.userId.trim() !== "") {
      query = query.eq("user_id", body.userId.trim());
    } else if (body.allUsers !== true) {
      return NextResponse.json<ResetResponse>(
        { ok: false, error: "Provide userId, or set allUsers: true for the monthly bulk reset." },
        { status: 400 },
      );
    }
    if (typeof body.featureName === "string") query = query.eq("feature_name", body.featureName);
    query = query.eq("usage_month", month);

    const { data, error } = await query.select("id");
    if (error) throw new Error(error.message);
    const resetCount = data?.length ?? 0;

    await writeAuditLog(admin, {
      action: "quota.reset",
      userId: typeof body.userId === "string" && body.userId.trim() !== "" ? body.userId.trim() : null,
      targetTable: "ai_quota_usage",
      details: { usageMonth: month, featureName: body.featureName ?? null, resetCount, allUsers: body.allUsers === true },
    });

    return NextResponse.json<ResetResponse>({ ok: true, resetCount });
  } catch (err) {
    return NextResponse.json<ResetResponse>(
      { ok: false, error: err instanceof Error ? err.message : "Quota reset failed" },
      { status: 500 },
    );
  }
}

function monthKeyUtc(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
