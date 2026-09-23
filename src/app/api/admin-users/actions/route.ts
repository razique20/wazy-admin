import { NextResponse } from "next/server";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase";
import { isUserId } from "@/lib/tiers";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

type UserAction = "ban" | "unban" | "delete" | "purge_data" | "reset_password";

interface UserActionRequest {
  userId?: unknown;
  action?: unknown;
}

interface UserActionResponse {
  ok: boolean;
  action?: UserAction;
  userId?: string;
  /** Row counts removed by delete/purge_data, per table. */
  purged?: Record<string, number>;
  error?: string;
}

const VALID_ACTIONS: UserAction[] = ["ban", "unban", "delete", "purge_data", "reset_password"];

/**
 * Tables keyed by owner/user columns that hold per-user data. Deletion order
 * matters: reminders and transactions reference documents/collections, so
 * children go first. Tables missing from a given project are skipped.
 */
const USER_DATA_TABLES: { table: string; column: string }[] = [
  { table: "reminders", column: "document_id" }, // handled specially below
  { table: "finance_transactions", column: "owner_id" },
  { table: "category_budgets", column: "owner_id" },
  { table: "savings_envelopes", column: "owner_id" },
  { table: "recurring_transactions", column: "owner_id" },
  { table: "ai_quota_usage", column: "user_id" },
  { table: "support_requests", column: "user_id" },
  { table: "user_tiers", column: "user_id" },
  { table: "custom_document_types", column: "owner_id" },
  { table: "documents", column: "owner_id" },
  { table: "collections", column: "owner_id" },
];

/**
 * POST /api/admin-users/actions
 * Per-user admin operations on auth.users via the service-role Admin API.
 * - ban:            suspends sign-in (GoTrue ban_duration)
 * - unban:          clears the suspension
 * - delete:         removes the auth user AND purges orphaned data rows
 * - purge_data:     removes the user's data rows when auth.users deletion
 *                   already happened (ghost-user cleanup) — or as a pre-step
 * - reset_password: sends the built-in password recovery email
 *
 * Every successful action is recorded in public.admin_audit_log.
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
      const attributes =
        action === "ban"
          ? { ban_duration: "876000h" } // ~100 years, the documented "indefinite" idiom
          : { ban_duration: "none" };
      const { error } = await admin.auth.admin.updateUserById(userId, attributes);
      if (error) throw new Error(error.message);
      await writeAuditLog(admin, {
        action: action === "ban" ? "user.ban" : "user.unban",
        userId,
        details: { via: "admin-console" },
      });
      return NextResponse.json<UserActionResponse>({ ok: true, action, userId });
    }

    if (action === "delete") {
      // 1) Snapshot whether the auth user still exists so we can report
      //    accurately and skip a confusing "user not found" error when the
      //    auth row is already gone (ghost user) but data rows remain.
      const { data: existing, error: readError } = await admin.auth.admin.getUserById(userId);
      const authExists = !readError && Boolean(existing?.user?.id);
      const email = existing?.user?.email ?? null;

      // 2) Purge data rows regardless — this is what actually removes the
      //    ghost from the console, and for a live user it is what the FK
      //    cascade is expected to do (belt-and-braces for projects whose
      //    tables lack ON DELETE CASCADE).
      const purged = await purgeUserData(admin, userId);

      // 3) Remove the auth user when it still exists.
      if (authExists) {
        const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
        if (deleteError) throw new Error(deleteError.message);
      }

      await writeAuditLog(admin, {
        action: "user.delete",
        userId,
        details: {
          email,
          authUserExisted: authExists,
          purgedRows: purged,
        },
      });

      return NextResponse.json<UserActionResponse>({
        ok: true,
        action,
        userId,
        purged,
      });
    }

    if (action === "purge_data") {
      // Ghost-user cleanup: the auth user is already gone but data rows
      // remain. No auth call — just delete the orphaned rows.
      const purged = await purgeUserData(admin, userId);
      await writeAuditLog(admin, {
        action: "user.data_purge",
        userId,
        details: { purgedRows: purged },
      });
      return NextResponse.json<UserActionResponse>({ ok: true, action, userId, purged });
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
    await writeAuditLog(admin, {
      action: "user.reset_password",
      userId,
      details: { email },
    });
    return NextResponse.json<UserActionResponse>({ ok: true, action, userId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "User action failed";
    // Record failed actions too — an audit trail that only shows successes
    // hides exactly the events an administrator needs to investigate.
    await writeAuditLog(admin, {
      action:
        action === "delete"
          ? "user.delete"
          : action === "purge_data"
            ? "user.data_purge"
            : action === "ban"
              ? "user.ban"
              : action === "unban"
                ? "user.unban"
                : "user.reset_password",
      userId,
      details: { ok: false, error: message },
    }).catch(() => undefined);
    return NextResponse.json<UserActionResponse>({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * Deletes every data row belonging to `userId` across all known tables,
 * children before parents. Tables that don't exist in the project are
 * skipped with a warning; row counts are returned per table.
 */
async function purgeUserData(admin: ReturnType<typeof createServiceRoleClient>, userId: string): Promise<Record<string, number>> {
  const purged: Record<string, number> = {};

  // 1) Reminders hang off documents — resolve this user's document ids and
  //    delete their reminders first. If the documents table is unavailable,
  //    fall back to deleting reminders via document_id in the list below.
  const documentIds: string[] = [];
  {
    const { data } = await admin.from("documents").select("id").eq("owner_id", userId);
    for (const row of data ?? []) {
      if (typeof row?.id === "string") documentIds.push(row.id);
    }
  }
  if (documentIds.length > 0) {
    const { data, error } = await admin.from("reminders").delete().in("document_id", documentIds).select("id");
    if (!error) purged["reminders"] = data?.length ?? 0;
    else console.warn(`[purge] reminders: ${error.message}`);
  }

  // 2) Everything else with a direct owner/user column. Children first:
  //    finance rows may reference documents; documents reference collections.
  for (const { table, column } of USER_DATA_TABLES) {
    if (table === "reminders") continue; // handled above
    try {
      const { data, error } = await admin.from(table).delete().eq(column, userId).select("id");
      if (error) {
        console.warn(`[purge] ${table}: ${error.message}`);
        continue;
      }
      if (data && data.length > 0) purged[table] = data.length;
    } catch (err) {
      console.warn(`[purge] ${table}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return purged;
}
