-- =====================================================================
-- Wazy — Subscription tiers (Track 1 freemium)
--
-- Run ONCE against the production Supabase project BEFORE using the
-- Admin Console "Subscriptions" section:
--   Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Contract with the Flutter app (do not change):
--   client.from('user_tiers').select('tier').eq('user_id', userId).maybeSingle()
--   Valid values: 'free' | 'plus' | 'business' (lowercase strings).
--   A missing row falls back to Free in the app.
--
-- Duration feature: user_tiers.expires_at (nullable timestamptz) records when
-- an admin-granted plan lapses; null = no expiry. The console resolves an
-- expired grant to Free when listing — the Flutter app needs no changes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Migration for projects that already ran an older version of this file
--    (no-op when the columns already exist). Safe to re-run.
-- ---------------------------------------------------------------------
alter table public.user_tiers add column if not exists expires_at timestamptz;
alter table public.user_tier_audit add column if not exists expires_at timestamptz;

-- ---------------------------------------------------------------------
-- 1) public.user_tiers — one row per user (PK user_id)
-- ---------------------------------------------------------------------
create table if not exists public.user_tiers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'free'
    constraint user_tiers_tier_check check (tier in ('free', 'plus', 'business')),
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_tiers enable row level security;

-- RLS: the ONLY policy on user_tiers — a signed-in user may read their own
-- row (including expires_at). Writes stay service-role-only: never add
-- INSERT/UPDATE/DELETE policies.
drop policy if exists "users can read own tier" on public.user_tiers;
create policy "users can read own tier"
  on public.user_tiers
  for select
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 2) public.user_tier_audit — immutable tier-change history
--    Service-role only: RLS enabled, no policies at all.
-- ---------------------------------------------------------------------
create table if not exists public.user_tier_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  old_tier text,
  new_tier text not null,
  expires_at timestamptz,
  changed_by text,
  note text,
  created_at timestamptz not null default now()
);

alter table public.user_tier_audit enable row level security;

-- No policies: anon/authenticated clients can neither read nor write.
-- The Admin Console appends rows with the service role key.

-- ---------------------------------------------------------------------
-- 3) Trigger: block tier changes that don't go through the service role,
--    and stamp updated_at on legitimate service-role writes.
-- ---------------------------------------------------------------------
create or replace function public.user_tiers_block_anon_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('role') <> 'service_role' then
    raise exception 'user_tiers is service-role write only'
      using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_tiers_guard on public.user_tiers;
create trigger user_tiers_guard
  before insert or update on public.user_tiers
  for each row execute function public.user_tiers_block_anon_writes();
