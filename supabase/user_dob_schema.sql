-- ============================================================
-- Store the user's date of birth (fintech-readiness: KYC, age gate)
-- ============================================================
-- Signup now collects DOB in-app. It is stored as user_metadata on the
-- auth user (no service_role needed) and mirrored into a proper date
-- column here so SQL/KYC flows can query it directly.
--
-- Run once in the Supabase SQL editor.

-- 1. Column on user_tiers (the per-user profile table).
alter table public.user_tiers
  add column if not exists date_of_birth date;

comment on column public.user_tiers.date_of_birth is
  'Self-reported date of birth captured at signup (fintech KYC / age-gate readiness).';

-- 2. RLS: user_tiers already has per-owner policies (user_id = auth.uid()).
--    No new policies needed — DOB rides on the same scoping.

-- 3. Backfill / sync trigger: whenever a new auth user appears, copy
--    date_of_birth from raw_user_meta_data if present. Keeps the column
--    populated for users created after this migration without app changes.
create or replace function public.sync_user_dob()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_tiers (user_id, date_of_birth)
  values (new.id, nullif(new.raw_user_meta_data->>'date_of_birth', '')::date)
  on conflict (user_id) do update
    set date_of_birth = coalesce(
      nullif(new.raw_user_meta_data->>'date_of_birth', '')::date,
      public.user_tiers.date_of_birth
    );
  return new;
end;
$$;

-- The on_auth_user_created trigger already exists (handle_new_user).
-- Add a second trigger on the same event for the DOB sync.
--
-- IMPORTANT: the DOB mirror is best-effort. Any error here would abort the
-- auth.users insert itself (Supabase surfaces that to the app as
-- "Database error saving new user" and signup fails), so the function
-- swallows exceptions and logs a warning instead.
create or replace function public.sync_user_dob()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  begin
    insert into public.user_tiers (user_id, date_of_birth)
    values (new.id, nullif(new.raw_user_meta_data->>'date_of_birth', '')::date)
    on conflict (user_id) do update
      set date_of_birth = coalesce(
        nullif(new.raw_user_meta_data->>'date_of_birth', '')::date,
        public.user_tiers.date_of_birth
      );
  exception when others then
    -- Never block signup because of the DOB mirror.
    raise warning 'sync_user_dob failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_dob on auth.users;
create trigger on_auth_user_created_dob
  after insert on auth.users
  for each row execute function public.sync_user_dob();
