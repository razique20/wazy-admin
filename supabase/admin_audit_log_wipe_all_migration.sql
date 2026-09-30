-- =====================================================================
-- Migration: allow the `data.wipe_all` audit action
--
-- Run ONCE in each Supabase project (Dashboard → SQL Editor → paste → Run),
-- ideally BEFORE using the Admin Console's "Danger Zone → Wipe all data"
-- button. Without it, a full wipe still executes but its audit entry is
-- silently skipped (the CHECK constraint rejects 'data.wipe_all').
--
-- STANDALONE: if the admin_audit_log table does not exist in this project
-- yet (error 42P01: relation "public.admin_audit_log" does not exist),
-- this script creates it first with the full action list — no need to run
-- admin_audit_log_schema.sql separately.
--
-- Safe to re-run. Keeps existing rows; only creates what is missing and
-- widens the allowed values.
-- =====================================================================

-- 0) Create the table when this project never had it (mirrors
--    admin_audit_log_schema.sql exactly).
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  action text not null,
  user_id uuid references auth.users (id) on delete set null,
  target_table text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  performed_by text not null default 'admin-console',
  performed_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

create index if not exists admin_audit_log_performed_at_idx
  on public.admin_audit_log (performed_at desc);

create index if not exists admin_audit_log_user_id_idx
  on public.admin_audit_log (user_id) where user_id is not null;

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
