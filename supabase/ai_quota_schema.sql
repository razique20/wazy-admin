-- =====================================================================
-- Wazy — AI quota usage (Track 1 freemium)
--
-- Run ONCE against the production Supabase project BEFORE using the
-- Admin Console "AI Usage" section:
--   Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Contract with the Flutter app (do not change):
--   feature_name: 'groq_ai_summary' | 'groq_ai_budget_plan'
--   usage_month:  'YYYY-MM' (UTC month the call happened in)
--   One row per (user_id, feature_name, usage_month); used_count is
--   incremented by the app before each AI call.
-- =====================================================================

create table if not exists public.ai_quota_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feature_name text not null
    constraint ai_quota_usage_feature_check
    check (feature_name in ('groq_ai_summary', 'groq_ai_budget_plan')),
  usage_month text not null
    constraint ai_quota_usage_month_check
    check (usage_month ~ '^[0-9]{4}-[0-9]{2}$'),
  used_count int not null default 0,
  updated_at timestamptz not null default now(),
  constraint ai_quota_usage_unique unique (user_id, feature_name, usage_month)
);

alter table public.ai_quota_usage enable row level security;

-- A signed-in user may read their own counters (the app shows quota left).
drop policy if exists "users can read own ai quota" on public.ai_quota_usage;
create policy "users can read own ai quota"
  on public.ai_quota_usage
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Keep updated_at honest on any write.
create or replace function public.ai_quota_usage_touch()
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

drop trigger if exists ai_quota_usage_touch_trigger on public.ai_quota_usage;
create trigger ai_quota_usage_touch_trigger
  before update on public.ai_quota_usage
  for each row execute function public.ai_quota_usage_touch();
