-- =====================================================================
-- Wazy — Admin audit log
--
-- Run ONCE against the production Supabase project BEFORE the Admin
-- Console can record admin actions:
--   Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Purpose: every admin action performed through the console (user
-- ban/unban/delete/password reset, tier grants, quota resets, version
-- publishing, reminder maintenance, row edits) is appended here so there
-- is a permanent, queryable record of who did what and when.
--
-- RLS: enabled with NO policies. Only the service role (the console's
-- server routes) can read or write this table — it is never exposed to
-- the anon/authenticated clients.
-- =====================================================================

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  -- Action identity
  action text not null
    constraint admin_audit_log_action_check
    check (action in (
      'user.ban', 'user.unban', 'user.delete', 'user.reset_password',
      'tier.grant', 'quota.reset', 'version.publish',
      'reminder.mark_sent', 'reminder.cleanup',
      'row.insert', 'row.update', 'row.delete',
      'user.data_purge'
    )),
  -- Optional scope
  user_id uuid references auth.users (id) on delete set null,
  target_table text,
  target_id text,
  -- Details
  details jsonb not null default '{}'::jsonb,
  -- Who / when / from where
  performed_by text not null default 'admin-console',
  performed_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

-- No policies: anon/authenticated clients can neither read nor write.
-- The Admin Console appends and reads rows with the service role key.

-- Helpful indexes for the console's audit viewer.
create index if not exists admin_audit_log_performed_at_idx
  on public.admin_audit_log (performed_at desc);

create index if not exists admin_audit_log_user_id_idx
  on public.admin_audit_log (user_id) where user_id is not null;
