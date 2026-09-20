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
-- expired grant to Free when listing, and the Flutter app reads expires_at
-- (falling back to plan_ends_at) and downgrades locally once it passes.
-- Section 4 snaps the DB row itself back to Free so all three stay in sync.
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

-- ---------------------------------------------------------------------
-- 4) Auto-expire: a paid tier whose expires_at has passed snaps back to
--    Free on the next write to the row (admin renewal, or any admin save).
--    The console list and the app also treat expired grants as Free at
--    read time; this trigger keeps the stored row itself honest so the
--    three never drift apart.
--
--    Only expires_at is handled here. Grants made through the Flutter
--    schema's plan_ends_at column are covered by its own
--    user_tiers_auto_expire trigger when that schema is installed too.
-- ---------------------------------------------------------------------
create or replace function public.expire_finished_tier_grants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tier <> 'free' and new.expires_at is not null
     and new.expires_at <= now() then
    insert into public.user_tier_audit (user_id, old_tier, new_tier, expires_at, changed_by, note)
    values (new.user_id, new.tier, 'free', null,
            'system', 'auto-expired: grant ended ' || new.expires_at::text);
    new.tier := 'free';
    new.expires_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists user_tiers_auto_expire_grants on public.user_tiers;
create trigger user_tiers_auto_expire_grants
  before insert or update on public.user_tiers
  for each row execute function public.expire_finished_tier_grants();
