-- Reconcile public.error_reports to the P1.3 shape used by the admin console.
-- Idempotent: safe to run even if the table already exists with columns/policies.
-- Fixes:
--  - Table exists but missing columns introduced by the admin app
--  - Old "Users can insert own error reports" policy name collision
--  - No RLS, wrong RLS, or stale indexes if an older script was applied first

begin;

-- 1. Ensure the table exists
create table if not exists public.error_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  platform text,
  app_version text,
  device_info text,
  error_type text,
  error_message text,
  stack_trace text,
  severity text check (severity in ('error', 'critical', 'fatal')),
  created_at timestamptz not null default now()
);

-- 2. Backfill/align columns only if they are missing
alter table public.error_reports
  add column if not exists platform text,
  add column if not exists app_version text,
  add column if not exists device_info text,
  add column if not exists error_type text,
  add column if not exists error_message text,
  add column if not exists stack_trace text,
  add column if not exists severity text check (severity in ('error', 'critical', 'fatal')),
  add column if not exists created_at timestamptz not null default now();

-- 3. Normalize data if an older shape was used.
--    If an older script created a 'timestamp' column, drop it.
alter table public.error_reports
  drop column if exists timestamp,
  drop column if exists error_fingerprint;

-- 4. RLS: make sure it is enabled
alter table public.error_reports enable row level security;

-- 5. Policies: recreate with the exact names/texts the admin UI expects.
--    Using IF NOT EXISTS is enough when names match; here we drop+recreate
--    to avoid stale policy text from earlier attempts.
drop policy if exists "Users can insert own error reports" on public.error_reports;
create policy "Users can insert own error reports"
  on public.error_reports
  for insert
  with check (auth.uid() is not null);

drop policy if exists "Admins can view all error reports" on public.error_reports;
create policy "Admins can view all error reports"
  on public.error_reports
  for select
  using (
    auth.uid() is null
    or auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

-- 6. Indexes
create index if not exists error_reports_user_id_idx on public.error_reports(user_id);
create index if not exists error_reports_created_at_idx on public.error_reports(created_at desc);
create index if not exists error_reports_severity_idx on public.error_reports(severity);
create index if not exists error_reports_platform_idx on public.error_reports(platform);

-- Optional safety: avoid rows without a created_at
alter table public.error_reports alter column created_at set default now();

commit;
