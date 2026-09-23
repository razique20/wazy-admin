import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";
import { isUserId } from "@/lib/tiers";

export const dynamic = "force-dynamic";

type UserAction = "ban" | "unban" | "delete" | "reset_password";

interface UserActionRequest {
  userId?: unknown;
  action?: unknown;
}

interface UserActionResponse {
  ok: boolean;
  action?: UserAction;
  userId?: string;
  error?: string;
}

const VALID_ACTIONS: UserAction[] = ["ban", "unban", "delete", "reset_password"];

/**
 * POST /api/admin-users/actions
 * Per-user admin operations on auth.users via the service-role Admin API.
 * - ban:          sets banned_until far in the future (suspends sign-in)
 * - unban:        clears banned_until
 * - delete:       permanently removes the user (cascades via FKs)
 * - reset_password: sends the built-in password recovery email
 */
export async function POST(request: Request) {
  if (!hasServiceRoleKey()) {
    return NextResponse.json<UserActionResponse>(
      {
        ok: false,
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not configured — user management actions are disabled. Add it to .env.local and restart.",
      },
      { status: 503 },
    );
  }

  let body: UserActionRequest;
  try {
    body = (await request.json()) as UserActionRequest;
  } catch {
    return NextResponse.json<UserActionResponse>({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? (body.action as UserAction) : null;
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json<UserActionResponse>(
      { ok: false, error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 },
    );
  }
  if (!isUserId(body.userId)) {
    return NextResponse.json<UserActionResponse>(
      { ok: false, error: "userId must be a valid auth.users UUID" },
      { status: 400 },
    );
  }
  const userId = body.userId.trim().toLowerCase();
  const admin = createServiceRoleClient();

  try {
    if (action === "ban" || action === "unban") {
      // GoTrue needs a concrete duration to ban; ~100 years reads as
      // "indefinite" in the dashboard and is trivially in the future.
      const attributes =
        action === "ban"
          ? { ban_duration: "876000h" } // ~100 years, the documented "indefinite" idiom
          : { ban_duration: "none" };
      const { error } = await admin.auth.admin.updateUserById(userId, attributes);
      if (error) throw new Error(error.message);
      return NextResponse.json<UserActionResponse>({ ok: true, action, userId });
    }

    if (action === "delete") {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
      return NextResponse.json<UserActionResponse>({ ok: true, action, userId });
    }

    // reset_password — find the email first; generateLink requires it.
    const { data: found, error: readError } = await admin.auth.admin.getUserById(userId);
    if (readError) throw new Error(readError.message);
    const email = found.user?.email;
    if (!email) {
      return NextResponse.json<UserActionResponse>(
        { ok: false, error: "User has no email address — cannot send a reset link." },
        { status: 400 },
      );
    }
    const { error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (linkError) throw new Error(linkError.message);
    return NextResponse.json<UserActionResponse>({ ok: true, action, userId });
  } catch (err) {
    return NextResponse.json<UserActionResponse>(
      { ok: false, error: err instanceof Error ? err.message : "User action failed" },
      { status: 500 },
    );
  }
}
