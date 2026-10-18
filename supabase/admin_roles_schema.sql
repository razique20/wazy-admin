-- =====================================================================
-- finavig — Admin Roles & Two-Tier Access Control (Super Admin / Admin)
--
-- Run in Supabase SQL Editor:
--   Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Purpose:
-- Manages administrative privileges linked to auth.users.
-- Roles:
--   - 'super_admin': full platform management, manage other admins,
--                    data wipes, audit logs, system configurations.
--   - 'admin': day-to-day operations (manage users, subscriptions,
--              support tickets, finance, AI quotas, documents).
-- =====================================================================

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'admin'
    constraint admin_roles_role_check
    check (role in ('super_admin', 'admin')),
  display_name text,
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_roles_user_id_key unique (user_id)
);

-- Enable RLS
alter table public.admin_roles enable row level security;

-- Policies:
-- Service role key (used by Admin Console backend API) has full bypass.
-- Authenticated users can read their own admin role record.
create policy "Admins can view their own role"
  on public.admin_roles
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Indexes for fast lookup
create index if not exists admin_roles_user_id_idx on public.admin_roles (user_id);
create index if not exists admin_roles_role_idx on public.admin_roles (role);
create index if not exists admin_roles_email_idx on public.admin_roles (lower(email));

-- Auto-update updated_at timestamp
create or replace function public.set_admin_roles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_admin_roles_updated_at_trigger on public.admin_roles;
create trigger set_admin_roles_updated_at_trigger
  before update on public.admin_roles
  for each row execute function public.set_admin_roles_updated_at();

-- Update admin_audit_log constraint to allow admin management actions if exists
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'admin_audit_log_action_check'
  ) then
    alter table public.admin_audit_log
      drop constraint admin_audit_log_action_check;

    alter table public.admin_audit_log
      add constraint admin_audit_log_action_check
      check (action in (
        'user.ban', 'user.unban', 'user.delete', 'user.reset_password',
        'tier.grant', 'quota.reset', 'version.publish',
        'reminder.mark_sent', 'reminder.cleanup',
        'row.insert', 'row.update', 'row.delete',
        'user.data_purge', 'data.wipe_all',
        'admin.grant', 'admin.revoke', 'admin.update_role', 'admin.toggle_status'
      ));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Bootstrap Helper (Run this once to designate your first Super Admin):
-- Replace 'your-email@example.com' with the email of the admin account:
--
-- insert into public.admin_roles (user_id, email, role, display_name)
-- select id, email, 'super_admin', 'Initial Super Admin'
-- from auth.users
-- where email = 'your-email@example.com'
-- on conflict (user_id) do update
-- set role = 'super_admin', is_active = true;
-- ---------------------------------------------------------------------
