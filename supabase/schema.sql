-- ============================================================
-- Finavig — Supabase schema (collections model)
-- Run this whole file in Supabase Dashboard → SQL Editor → New query.
--
-- TWO OPTIONS:
--   * Fresh project (no data): run this file as-is.
--   * Existing project with data: run
--     supabase/migrate_companies_to_collections.sql instead — it renames
--     the old companies table and preserves your data.
--
-- Model: this is a personal app. Every user owns exactly one built-in
-- "Personal" collection (their own documents: Emirates ID, visa, vehicle,
-- insurance, subscriptions...) and may create any number of company
-- collections to keep business documents separate.
--
-- Safe to re-run: every statement is idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------

-- Document collections: one Personal per user + any number of company
-- collections owned by the same user.
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  country_code text not null default 'AE',
  is_personal boolean not null default false,
  created_at timestamptz not null default now()
);

-- Exactly one personal collection per owner.
create unique index if not exists collections_one_personal_per_owner
  on public.collections(owner_id) where is_personal;

create index if not exists idx_collections_owner
  on public.collections(owner_id);

-- Expiry-tracked documents, each inside exactly one collection.
-- doc_type holds a built-in key (e.g. 'tradeLicence') or a user-defined
-- 'custom-<uuid>' key referencing custom_document_types.
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  doc_type text not null,
  display_name text not null,
  expires_at date not null,
  reminder_days int not null default 30,
  status text not null default 'active'
    check (status in ('active','renewed','expired','archived')),
  assigned_to text,
  renewal_fee numeric(10,2),
  notes text,
  file_name text,
  file_path text,
  file_size bigint,
  -- Issuing authority + jurisdiction as entered in the upload form
  -- (e.g. 'Dubai Municipality (Dubai)'). Nullable: rows created before
  -- this column existed have no location stored.
  location text,
  -- JSON array of historical renewal events (RenewalRecord.toJson() shape:
  -- id, renewedAt, previousExpiryDate, newExpiryDate, fee, renewedBy, note).
  -- Stored as jsonb so records can be queried/validated server-side.
  renewal_history jsonb,
  -- User-defined reminder offsets in days (e.g. '{90,60,30,7}'), replacing
  -- the default escalation ladder for this document. Empty/NULL = default.
  custom_reminder_days int[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Existing installs: relax the legacy 13-value CHECK so custom type keys
-- can be stored. Idempotent — the constraint may not exist.
alter table public.documents
  drop constraint if exists documents_doc_type_check;

-- Existing installs: add the location + renewal_history +
-- custom_reminder_days columns that were previously local-only. Idempotent.
alter table public.documents add column if not exists location text;
alter table public.documents add column if not exists renewal_history jsonb;
alter table public.documents add column if not exists custom_reminder_days int[];

create index if not exists idx_documents_collection
  on public.documents(collection_id);
create index if not exists idx_documents_collection_expiry
  on public.documents(collection_id, expires_at);
create index if not exists idx_documents_owner
  on public.documents(owner_id);

-- Reminders / notification log.
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  remind_at date not null,
  channel text not null default 'push' check (channel in ('push','email','whatsapp')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_reminders_document on public.reminders(document_id);

-- User-defined document types beyond the 13 built-ins. Referenced from
-- documents.doc_type as 'custom-<id>'.
create table if not exists public.custom_document_types (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  renewal_authority text,
  renewal_days int not null default 365 check (renewal_days > 0),
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create index if not exists idx_custom_document_types_owner
  on public.custom_document_types(owner_id);

-- ------------------------------------------------------------
-- 2. updated_at auto-touch on documents
-- ------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 3. Row Level Security
-- ------------------------------------------------------------

alter table public.collections enable row level security;
alter table public.documents enable row level security;
alter table public.reminders enable row level security;
alter table public.custom_document_types enable row level security;

-- Collections: full access to own rows.
drop policy if exists "own collection select" on public.collections;
create policy "own collection select" on public.collections
  for select using (auth.uid() = owner_id);

drop policy if exists "own collection insert" on public.collections;
create policy "own collection insert" on public.collections
  for insert with check (auth.uid() = owner_id);

drop policy if exists "own collection update" on public.collections;
create policy "own collection update" on public.collections
  for update using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "own collection delete" on public.collections;
create policy "own collection delete" on public.collections
  for delete using (auth.uid() = owner_id);

-- Documents: full access to own rows.
drop policy if exists "own documents select" on public.documents;
create policy "own documents select" on public.documents
  for select using (auth.uid() = owner_id);

drop policy if exists "own documents insert" on public.documents;
create policy "own documents insert" on public.documents
  for insert with check (auth.uid() = owner_id);

drop policy if exists "own documents update" on public.documents;
create policy "own documents update" on public.documents
  for update using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "own documents delete" on public.documents;
create policy "own documents delete" on public.documents
  for delete using (auth.uid() = owner_id);

-- Custom document types: full access to own rows.
drop policy if exists "own custom types select" on public.custom_document_types;
create policy "own custom types select" on public.custom_document_types
  for select using (auth.uid() = owner_id);

drop policy if exists "own custom types insert" on public.custom_document_types;
create policy "own custom types insert" on public.custom_document_types
  for insert with check (auth.uid() = owner_id);

drop policy if exists "own custom types update" on public.custom_document_types;
create policy "own custom types update" on public.custom_document_types
  for update using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "own custom types delete" on public.custom_document_types;
create policy "own custom types delete" on public.custom_document_types
  for delete using (auth.uid() = owner_id);

-- Reminders: access via the parent document's owner.
drop policy if exists "own reminders select" on public.reminders;
create policy "own reminders select" on public.reminders
  for select using (
    exists (
      select 1 from public.documents d
      where d.id = reminders.document_id
        and d.owner_id = auth.uid()
    )
  );

drop policy if exists "own reminders insert" on public.reminders;
create policy "own reminders insert" on public.reminders
  for insert with check (
    exists (
      select 1 from public.documents d
      where d.id = reminders.document_id
        and d.owner_id = auth.uid()
    )
  );

drop policy if exists "own reminders update" on public.reminders;
create policy "own reminders update" on public.reminders
  for update using (
    exists (
      select 1 from public.documents d
      where d.id = reminders.document_id
        and d.owner_id = auth.uid()
    )
  );

drop policy if exists "own reminders delete" on public.reminders;
create policy "own reminders delete" on public.reminders
  for delete using (
    exists (
      select 1 from public.documents d
      where d.id = reminders.document_id
        and d.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 4. Auto-create the Personal collection for every new user
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.collections (owner_id, name, is_personal)
  values (new.id, 'Personal', true)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 5. Daily reminder scan (pg_cron)
-- ------------------------------------------------------------
-- Creates pending reminder rows for documents approaching expiry.
-- The Edge Function / FCM push (Phase 3) will pick these up.

create or replace function public.create_due_reminders()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.reminders (document_id, remind_at, channel)
  select
    d.id,
    (d.expires_at - make_interval(days => d.reminder_days))::date,
    'push'
  from public.documents d
  where d.status = 'active'
    and (d.expires_at - current_date) <= d.reminder_days
    and (d.expires_at - current_date) >= 0
    and not exists (
      select 1 from public.reminders r
      where r.document_id = d.id
        and r.channel = 'push'
    );
end;
$$;

-- Schedule daily at 06:00 UTC (10:00 GST). Requires pg_cron extension.
select cron.unschedule('daily-reminder-scan')
where exists (select 1 from cron.job where jobname = 'daily-reminder-scan');

select cron.schedule(
  'daily-reminder-scan',
  '0 6 * * *',
  $$select public.create_due_reminders()$$
);
