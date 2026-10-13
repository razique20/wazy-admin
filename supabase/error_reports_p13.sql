-- P1.3 Error & Crash Reporting — run in Supabase Dashboard → SQL Editor
-- Idempotent. Use this instead of older error_reports scripts that still
-- referenced a 'timestamp' column or fingerprint columns.

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

alter table public.error_reports enable row level security;

-- Authenticated users can insert their own reports (anon/client)
create policy "authenticated users can insert own error reports"
  on public.error_reports
  for insert
  with check (auth.uid() is not null);

-- Admin users (service role or app metadata role) can read all reports
create policy "admins can read all error reports"
  on public.error_reports
  for select
  using (
    auth.uid() is null
    or auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

-- No update/delete policies (reports are immutable once created)

create index if not exists error_reports_user_id_idx on public.error_reports(user_id);
create index if not exists error_reports_created_at_idx on public.error_reports(created_at desc);
create index if not exists error_reports_severity_idx on public.error_reports(severity);
create index if not exists error_reports_platform_idx on public.error_reports(platform);

-- P1.3b: Server-side deduplication fallback — unique constraint on fingerprint
-- Avoids duplicate rows when two devices or flush cycles race.
create unique index if not exists error_reports_fingerprint_unique
  on public.error_reports(user_id, error_fingerprint)
  where error_fingerprint is not null;
