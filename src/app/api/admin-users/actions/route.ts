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
 *
 * `pk` is the table's primary-key column used to count deleted rows:
 * user_tiers is keyed by user_id (no `id` column), everything else uses id.
 */
const USER_DATA_TABLES: { table: string; column: string; pk: string }[] = [
  { table: "reminders", column: "document_id", pk: "id" }, // handled specially below
  { table: "finance_transactions", column: "owner_id", pk: "id" },
  { table: "category_budgets", column: "owner_id", pk: "id" },
  { table: "savings_envelopes", column: "owner_id", pk: "id" },
  { table: "recurring_transactions", column: "owner_id", pk: "id" },
  { table: "ai_quota_usage", column: "user_id", pk: "id" },
  { table: "user_tier_audit", column: "user_id", pk: "id" },
  { table: "user_tiers", column: "user_id", pk: "user_id" },
  { table: "custom_document_types", column: "owner_id", pk: "id" },
  { table: "documents", column: "owner_id", pk: "id" },
  { table: "collections", column: "owner_id", pk: "id" },
];

/** Buckets that can hold user-uploaded document files (documents.file_path). */
const STORAGE_BUCKETS = ["documents", "document-files"] as const;

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
      const purged = await purgeUserData(admin, userId, email);

      // 3) Remove the auth user when it still exists.
      if (authExists) {
        const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
        if (deleteError) throw new Error(deleteError.message);
      }

      // user_id must stay null here: the auth row is already deleted and
      // admin_audit_log.user_id references auth.users — a non-null value
      // would violate the FK and the entry would silently never be written.
      await writeAuditLog(admin, {
        action: "user.delete",
        userId: null,
        details: {
          deletedUserId: userId,
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
      const purged = await purgeUserData(admin, userId, null);
      await writeAuditLog(admin, {
        action: "user.data_purge",
        userId: null,
        details: { purgedUserId: userId, purgedRows: purged },
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
 * Deletes every trace of `userId`: data rows across all known tables,
 * uploaded document files in storage, and the email address recorded in
 * this user's own audit rows (GDPR-style scrub). Children are deleted
 * before parents; tables/buckets that don't exist are skipped with a
 * warning; row counts are returned per table/bucket.
 */
async function purgeUserData(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  email: string | null,
): Promise<Record<string, number>> {
  const purged: Record<string, number> = {};

  // 1) Reminders hang off documents — resolve this user's document ids and
  //    delete their reminders first, and remember the storage paths of any
  //    uploaded files so they can be removed once the rows are gone.
  const documentIds: string[] = [];
  const storagePaths: string[] = [];
  {
    const { data } = await admin.from("documents").select("id, file_path").eq("owner_id", userId);
    for (const row of data ?? []) {
      if (typeof row?.id === "string") documentIds.push(row.id);
      if (typeof row?.file_path === "string" && row.file_path.trim() !== "") storagePaths.push(row.file_path);
    }
  }
  if (documentIds.length > 0) {
    const { data, error } = await admin.from("reminders").delete().in("document_id", documentIds).select("id");
    if (!error) purged["reminders"] = data?.length ?? 0;
    else console.warn(`[purge] reminders: ${error.message}`);
  }

  // 2) Detach cross-user references so nothing dangles after the purge:
  //    documents assigned to this user by another owner, and support
  //    tickets authored by this user (user_id is `on delete set null`
  //    by design — tickets survive, but the personal reference must go).
  try {
    const { data, error } = await admin
      .from("documents")
      .update({ assigned_to: null })
      .eq("assigned_to", userId)
      .select("id");
    if (!error) {
      if (data && data.length > 0) purged["documents.assigned_to_cleared"] = data.length;
    } else {
      console.warn(`[purge] documents.assigned_to: ${error.message}`);
    }
  } catch (err) {
    console.warn(`[purge] documents.assigned_to: ${err instanceof Error ? err.message : "unknown error"}`);
  }

  // 3) Everything else with a direct owner/user column. Children first:
  //    finance rows may reference documents; documents reference collections.
  for (const { table, column, pk } of USER_DATA_TABLES) {
    if (table === "reminders") continue; // handled above
    if (table === "support_requests") continue; // handled below (kept, author nulled)
    try {
      const { data, error } = await admin.from(table).delete().eq(column, userId).select(pk);
      if (error) {
        console.warn(`[purge] ${table}: ${error.message}`);
        continue;
      }
      if (data && data.length > 0) purged[table] = data.length;
    } catch (err) {
      console.warn(`[purge] ${table}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  // 4) Support tickets authored by this user: keep the ticket, drop the
  //    identity (mirrors the schema's `on delete set null` contract).
  {
    const { data, error } = await admin
      .from("support_requests")
      .update({ user_id: null, user_email: email })
      .eq("user_id", userId)
      .select("id");
    if (!error) {
      if (data && data.length > 0) purged["support_requests.anonymized"] = data.length;
    } else {
      console.warn(`[purge] support_requests: ${error.message}`);
    }
  }

  // 5) Uploaded document files — delete the user's storage objects from
  //    every known bucket so no file traces remain.
  if (storagePaths.length > 0) {
    for (const bucket of STORAGE_BUCKETS) {
      try {
        const { error } = await admin.storage.from(bucket).remove(storagePaths);
        if (!error) {
          purged[`storage:${bucket}`] = storagePaths.length;
          break; // paths removed — no need to try other buckets
        }
      } catch {
        // bucket missing in this project — try the next candidate
      }
    }
  }

  // 6) Scrub the user's email out of their own audit-log details so no
  //    PII survives the delete (rows reference user_id, which is nulled
  //    by the FK, but details JSONB keeps the email text forever).
  try {
    const { error } = await admin
      .from("admin_audit_log")
      .update({ details: { scrubbed: true }, user_id: null })
      .eq("user_id", userId);
    if (error) console.warn(`[purge] admin_audit_log scrub: ${error.message}`);
  } catch (err) {
    console.warn(`[purge] admin_audit_log scrub: ${err instanceof Error ? err.message : "unknown error"}`);
  }

  return purged;
}
