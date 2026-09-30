-- =====================================================================
-- Migration: allow the `data.wipe_all` audit action
--
-- Run ONCE in each Supabase project (Dashboard → SQL Editor → paste → Run),
-- ideally BEFORE using the Admin Console's "Danger Zone → Wipe all data"
-- button. Without it, a full wipe still executes but its audit entry is
-- silently skipped (the CHECK constraint rejects 'data.wipe_all').
--
-- Safe to re-run. Keeps existing rows; only widens the allowed values.
-- =====================================================================

-- 1) Drop the old CHECK (no-op with IF EXISTS when the constraint is absent).
alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_action_check;

-- 2) Re-add it with the full action list (mirrors src/lib/audit.ts).
alter table public.admin_audit_log
  add constraint admin_audit_log_action_check
  check (action in (
    'user.ban', 'user.unban', 'user.delete', 'user.reset_password',
    'tier.grant', 'quota.reset', 'version.publish',
    'reminder.mark_sent', 'reminder.cleanup',
    'row.insert', 'row.update', 'row.delete',
    'user.data_purge', 'data.wipe_all'
  ));

-- 3) Verify: should print the new constraint definition.
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.admin_audit_log'::regclass
  and conname = 'admin_audit_log_action_check';
