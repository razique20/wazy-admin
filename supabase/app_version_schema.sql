-- =====================================================================
-- Wazy — App version & force update control
--
-- Run ONCE against the production Supabase project BEFORE using the
-- Admin Console "System → App Version" tab:
--   Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Contract with the Flutter app (do not change):
--   The app reads the row for its platform, falling back to 'all'.
--   min_required_version + is_force_update = true blocks the app until
--   the user upgrades; latest_version + release_notes drive the soft
--   "new version available" prompt. RLS: public read, service-role write.
-- =====================================================================

create table if not exists public.app_versions (
  id uuid primary key default gen_random_uuid(),
  platform text not null unique
    constraint app_versions_platform_check
    check (platform in ('all', 'ios', 'android', 'web')),
  min_required_version text,
  latest_version text not null,
  is_force_update boolean not null default false,
  download_url text,
  release_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The app reads version config before sign-in, so read access is public.
alter table public.app_versions enable row level security;

drop policy if exists "app version config is publicly readable" on public.app_versions;
create policy "app version config is publicly readable"
  on public.app_versions
  for select
  to anon, authenticated
  using (true);

-- Keep updated_at honest on any write.
create or replace function public.app_versions_touch()
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

drop trigger if exists app_versions_touch_trigger on public.app_versions;
create trigger app_versions_touch_trigger
  before update on public.app_versions
  for each row execute function public.app_versions_touch();
