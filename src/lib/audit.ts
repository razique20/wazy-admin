import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Valid action values for public.admin_audit_log (see
 * supabase/admin_audit_log_schema.sql). Keep in sync with the CHECK there.
 */
export const AUDIT_ACTIONS = [
  "user.ban",
  "user.unban",
  "user.delete",
  "user.reset_password",
  "tier.grant",
  "quota.reset",
  "version.publish",
  "reminder.mark_sent",
  "reminder.cleanup",
  "row.insert",
  "row.update",
  "row.delete",
  "user.data_purge",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === "string" && (AUDIT_ACTIONS as readonly string[]).includes(value);
}

export interface AuditEntry {
  action: AuditAction;
  /** Affected auth user, when the action targets one. */
  userId?: string | null;
  /** Table the action touched, for row-level actions. */
  targetTable?: string | null;
  /** Row id (or synthetic id) the action touched. */
  targetId?: string | null;
  /** Structured details: emails, old/new values, counts, error text… */
  details?: Record<string, unknown>;
  /** Identity of the admin/actor shown in the log viewer. */
  performedBy?: string;
}

/**
 * Appends an entry to public.admin_audit_log. Best-effort by design: a
 * missing table or a failed insert logs a server warning but NEVER breaks
 * the admin action that triggered it. Always await it inside the route's
 * try-block if the entry should be part of the same failure domain.
 */
export async function writeAuditLog(
  client: SupabaseClient,
  entry: AuditEntry,
): Promise<boolean> {
  try {
    const { error } = await client.from("admin_audit_log").insert({
      action: entry.action,
      user_id: entry.userId ?? null,
      target_table: entry.targetTable ?? null,
      target_id: entry.targetId ?? null,
      details: entry.details ?? {},
      performed_by: entry.performedBy ?? "admin-console",
    });
    if (error) {
      console.warn(`[audit] entry not written (${entry.action}): ${error.message}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      `[audit] entry not written (${entry.action}): ${err instanceof Error ? err.message : "unknown error"}`,
    );
    return false;
  }
}
