-- =====================================================================
-- Wazy — Support requests (Track 1 freemium)
--
-- Run ONCE against the production Supabase project BEFORE using the
-- Admin Console "Support" section:
--   Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Contract with the Flutter app (do not change):
--   request_type: 'tracking_option_request' | 'feature_request' |
--                 'bug_report' | 'support_request'
--   status:       'open' | 'in_progress' | 'resolved'
--   admin_notes:  admin response surfaced in the user's "My Requests" history.
-- =====================================================================

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  user_email text,
  request_type text not null
    constraint support_requests_type_check
    check (request_type in ('tracking_option_request', 'feature_request', 'bug_report', 'support_request')),
  title text not null,
  description text,
  status text not null default 'open'
    constraint support_requests_status_check
    check (status in ('open', 'in_progress', 'resolved')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.support_requests enable row level security;

-- Users may submit and read only their own tickets; admins write status/notes
-- with the service role key from the console.
drop policy if exists "users can insert own support requests" on public.support_requests;
create policy "users can insert own support requests"
  on public.support_requests
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users can read own support requests" on public.support_requests;
create policy "users can read own support requests"
  on public.support_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Keep updated_at honest on any service-role write.
create or replace function public.support_requests_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists support_requests_touch_trigger on public.support_requests;
create trigger support_requests_touch_trigger
  before update on public.support_requests
  for each row execute function public.support_requests_touch();
