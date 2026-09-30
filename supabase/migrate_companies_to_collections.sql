-- ============================================================
-- MIGRATION: companies → collections (personal multi-collection model)
--
-- WHAT CHANGED
--   The app is now a personal app: every user gets a built-in
--   "Personal" collection for their own documents, plus any number
--   of company collections for business documents.
--
--   1. table  public.companies      → public.collections
--   2. column added                   collections.is_personal (bool)
--   3. column public.documents.company_id → public.documents.collection_id
--   4. backfill: one Personal collection created for every existing user
--   5. new-user trigger now creates the Personal collection
--   6. RLS policies renamed, indexes rebuilt with new names
--
-- DATA SAFETY
--   * Existing company rows and all documents are preserved. Your old
--     single "My Company" row becomes a company collection; its documents
--     stay inside it. A fresh empty "Personal" collection is added.
--   * Safe to re-run: every statement is idempotent.
--
-- RUN: Supabase Dashboard → SQL Editor → New query → paste whole file → Run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rename the table
-- ------------------------------------------------------------
alter table if exists public.companies rename to collections;

-- ------------------------------------------------------------
-- 2. is_personal flag (existing rows default to company collections)
-- ------------------------------------------------------------
alter table public.collections
  add column if not exists is_personal boolean not null default false;

-- Enforce exactly one personal collection per owner.
create unique index if not exists collections_one_personal_per_owner
  on public.collections(owner_id) where is_personal;

create index if not exists idx_collections_owner
  on public.collections(owner_id);

-- ------------------------------------------------------------
-- 3. documents.company_id → documents.collection_id
--    (indexes follow the column rename automatically; we rebuild them
--    with clear names below)
-- ------------------------------------------------------------
alter table public.documents
  rename column company_id to collection_id;

-- Rename the FK constraint to match (cosmetic).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'documents_company_id_fkey'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      rename constraint documents_company_id_fkey to documents_collection_id_fkey;
  end if;
end $$;

-- Rebuild indexes with new names.
drop index if exists public.idx_documents_company;
drop index if exists public.idx_documents_expiry;
create index if not exists idx_documents_collection
  on public.documents(collection_id);
create index if not exists idx_documents_collection_expiry
  on public.documents(collection_id, expires_at);

-- ------------------------------------------------------------
-- 4. Backfill: one Personal collection per existing user
--    (existing company rows are kept untouched as company collections)
-- ------------------------------------------------------------
insert into public.collections (owner_id, name, is_personal)
select u.id, 'Personal', true
from auth.users u
where not exists (
  select 1 from public.collections c
  where c.owner_id = u.id and c.is_personal
);

-- ------------------------------------------------------------
-- 5. RLS policies — renamed for clarity, same owner-only rules
-- ------------------------------------------------------------
drop policy if exists "own company select" on public.collections;
drop policy if exists "own company insert" on public.collections;
drop policy if exists "own company update" on public.collections;
drop policy if exists "own company delete" on public.collections;

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

alter table public.collections enable row level security;

-- ------------------------------------------------------------
-- 6. New-user trigger → create the Personal collection
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

-- ------------------------------------------------------------
-- 7. Optional cleanup — UNCOMMENT ONLY IF you don't need the old
--    company fields (trade licence number / emirate / logo).
--    This permanently deletes that data!
-- ------------------------------------------------------------
-- alter table public.collections
--   drop column if exists trade_license_no,
--   drop column if exists emirate,
--   drop column if exists logo_url;
