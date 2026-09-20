import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";
import { expiryForDuration, isTier, isTierDuration, isUserId } from "@/lib/tiers";
import type { TierDuration, UserTier } from "@/lib/types";

export const dynamic = "force-dynamic";

interface SetTierRequest {
  userId?: unknown;
  tier?: unknown;
  /** Optional plan length: "none" (default) | "1m" | "3m" | "1y". */
  duration?: unknown;
  note?: unknown;
}

interface SetTierResponse {
  ok: boolean;
  userId?: string;
  tier?: UserTier;
  previousTier?: UserTier | null;
  /** ISO timestamp when the granted plan lapses back to Free; null = no expiry. */
  expiresAt?: string | null;
  auditWritten?: boolean;
  error?: string;
}

/**
 * POST /api/user-tiers/set
 * Grants a subscription tier to a user. All writes happen here, server-side,
 * with the SUPABASE_SERVICE_ROLE_KEY — the anon key can never change a tier.
 *
 * - Validates `userId` (UUID), `tier` (`free` | `plus` | `business`) and the
 *   optional `duration` (`none` | `1m` | `3m` | `1y`) server-side.
 * - Duration is turned into an absolute `expires_at` timestamp server-side,
 *   stored on the `user_tiers` row and mirrored into the audit row.
 * - Upserts into `public.user_tiers` (one row per user, PK `user_id`) — never
 *   inserts duplicates.
 * - Best-effort audit row in `public.user_tier_audit` when that table exists.
 */
export async function POST(request: Request) {
  if (!hasServiceRoleKey()) {
    return NextResponse.json<SetTierResponse>(
      {
        ok: false,
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not configured — tier changes are disabled. Add it to .env.local and restart.",
      },
      { status: 503 },
    );
  }

  let payload: SetTierRequest;
  try {
    payload = (await request.json()) as SetTierRequest;
  } catch {
    return NextResponse.json<SetTierResponse>({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // Strict server-side validation against the Flutter app contract.
  if (!isUserId(payload.userId)) {
    return NextResponse.json<SetTierResponse>(
      { ok: false, error: "userId must be a valid auth.users UUID" },
      { status: 400 },
    );
  }
  if (!isTier(payload.tier)) {
    return NextResponse.json<SetTierResponse>(
      { ok: false, error: "tier must be one of: free, plus, business" },
      { status: 400 },
    );
  }
  const userId = payload.userId.trim().toLowerCase();
  const tier = payload.tier;
  // Defaults to "none" (no expiry) — same behavior as before durations existed.
  const duration: TierDuration = isTierDuration(payload.duration) ? payload.duration : "none";
  const expiresAt = expiryForDuration(duration);
  const note = typeof payload.note === "string" && payload.note.trim() !== "" ? payload.note.trim().slice(0, 500) : null;

  const admin = createServiceRoleClient();

  try {
    // 1) Read the current row (if any) for the audit trail.
    const { data: existing, error: readError } = await admin
      .from("user_tiers")
      .select("user_id, tier")
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    const previousTier = isTier(existing?.tier) ? existing!.tier : null;

    // 2) Upsert — one row per user, never a duplicate insert. Granting Free
    //    clears any lingering expiry so the row is a clean, permanent Free.
    const { error: upsertError } = await admin.from("user_tiers").upsert(
      { user_id: userId, tier, expires_at: expiresAt },
      { onConflict: "user_id" },
    );
    if (upsertError) throw new Error(upsertError.message);

    // 3) Best-effort audit row (skip silently if the table doesn't exist yet).
    let auditWritten = false;
    const { error: auditError } = await admin.from("user_tier_audit").insert({
      user_id: userId,
      old_tier: previousTier,
      new_tier: tier,
      expires_at: expiresAt,
      changed_by: "admin-console",
      note,
    });
    auditWritten = !auditError;
    if (auditError) {
      console.warn(
        `[user-tiers] audit row not written for ${userId} (${previousTier ?? "none"} -> ${tier}): ${auditError.message}`,
      );
    }

    return NextResponse.json<SetTierResponse>({
      ok: true,
      userId,
      tier,
      previousTier,
      expiresAt,
      auditWritten,
    });
  } catch (err) {
    return NextResponse.json<SetTierResponse>(
      { ok: false, error: err instanceof Error ? err.message : "Failed to set tier" },
      { status: 500 },
    );
  }
}
