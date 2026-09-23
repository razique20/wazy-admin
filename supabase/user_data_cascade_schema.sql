-- =====================================================================
-- Wazy — Orphan cleanup + cascade deletes for user data tables
--
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every step is guarded and idempotent.
--
-- Why this file exists
-- --------------------
-- The app data tables (collections, documents, finance_*, …) had no
-- foreign keys to auth.users. Deleting a user — from the Supabase
-- Dashboard or the Admin Console — removed the auth row but left every
-- data row behind. The Admin Console then flagged that owner as
-- "orphaned / Unknown user" forever, because data rows only store the
-- owner UUID, never the email, so a re-registered user (new UUID) can
-- never re-claim them.
--
-- What it does
-- ------------
--   1) ONE-OFF CLEANUP — deletes data rows whose owner no longer exists
--      in auth.users (the ghost/orphaned rows already created).
--   2) PREVENTION — adds `on delete cascade` foreign keys to auth.users
--      so every future user delete removes their data rows
--      automatically. Existing non-cascade FKs to auth.users are
--      upgraded in place. Indexes are created for fast cascades.
--   3) REPORT — warns if any unattributable rows remain (expect silence).
--
-- Notes
-- -----
-- * The reminders table has no owner column — its owner lives on the
--   document — so reminders are cleaned/checked via their document.
-- * support_requests.user_id is `on delete set null` BY DESIGN (tickets
--   survive their author); only truly dangling rows are cleaned.
-- * This cleanup is direct SQL, so it is NOT recorded in
--   public.admin_audit_log (the console only logs console-driven
--   actions). If you want an audit entry, note the run in your ops log.
-- * After running, the "orphaned / Unknown user" entry disappears from
--   the Admin Console Users page on the next refresh.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ONE-OFF CLEANUP — remove rows owned by users missing from auth.users
--    (children first: reminders hang off documents, and documents of
--    orphaned owners are themselves deleted below)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  col text;
  deleted bigint;
begin
  -- 1a) Reminders: keep only those whose document exists AND whose
  --     document owner still has an auth account.
  if to_regclass('public.reminders') is not null
     and to_regclass('public.documents') is not null then
    delete from public.reminders r
    where not exists (
      select 1
      from public.documents d
      join auth.users u on u.id = d.owner_id
      where d.id = r.document_id
    );
    get diagnostics deleted = row_count;
    raise notice 'cleanup reminders: % row(s) removed', deleted;
  end if;

  -- 1b) Everything with a direct owner/user column. NULL owner rows are
  --     unattributable and are deliberately left alone.
  for t, col in
    select tbl, col from (values
      ('collections', 'owner_id'),
      ('documents', 'owner_id'),
      ('finance_transactions', 'owner_id'),
      ('category_budgets', 'owner_id'),
      ('savings_envelopes', 'owner_id'),
      ('recurring_transactions', 'owner_id'),
      ('custom_document_types', 'owner_id'),
      ('user_tiers', 'user_id'),
      ('user_tier_audit', 'user_id'),
      ('ai_quota_usage', 'user_id'),
      ('support_requests', 'user_id')
    ) as v(tbl, col)
  loop
    if to_regclass(format('public.%I', t)) is null
       or not exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = t and column_name = col
       ) then
      raise notice 'cleanup %: skipped (table or column missing)', t;
      continue;
    end if;

    execute format(
      'delete from public.%I where %I is not null and not exists (select 1 from auth.users u where u.id = %I)',
      t, col, col
    );
    get diagnostics deleted = row_count;
    raise notice 'cleanup %: % row(s) removed', t, deleted;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2) PREVENTION — on delete cascade FKs to auth.users on every owner
--    column, so deleting a user (Dashboard OR console) cleans up
--    automatically. Existing FKs to auth.users are upgraded to cascade.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  fk_name text;
  fk_del char;
  has_col boolean;
begin
  for t in
    select unnest(array[
      'collections',
      'documents',
      'finance_transactions',
      'category_budgets',
      'savings_envelopes',
      'recurring_transactions',
      'custom_document_types'
    ])
  loop
    fk_name := null;
    fk_del := null;

    if to_regclass(format('public.%I', t)) is null then
      raise notice 'fk %: skipped (table missing)', t;
      continue;
    end if;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'owner_id'
    ) into has_col;
    if not has_col then
      raise notice 'fk %: skipped (owner_id column missing)', t;
      continue;
    end if;

    select c.conname, c.confdeltype into fk_name, fk_del
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attname = 'owner_id'
     and a.attnum = any(c.conkey)
    where c.conrelid = format('public.%I', t)::regclass
      and c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
    limit 1;

    if fk_name is not null and fk_del = 'c' then
      raise notice 'fk %: already on delete cascade', t;
    elsif fk_name is not null then
      begin
        execute format('alter table public.%I drop constraint %I', t, fk_name);
        execute format(
          'alter table public.%I add constraint %I foreign key (owner_id) references auth.users (id) on delete cascade',
          t, t || '_owner_id_fkey'
        );
        raise notice 'fk %: upgraded to on delete cascade', t;
      exception when others then
        raise warning 'fk %: could not upgrade existing constraint (%)', t, sqlerrm;
      end;
    else
      begin
        execute format(
          'alter table public.%I add constraint %I foreign key (owner_id) references auth.users (id) on delete cascade',
          t, t || '_owner_id_fkey'
        );
        raise notice 'fk %: added with on delete cascade', t;
      exception when others then
        raise warning 'fk %: could not add constraint (%)', t, sqlerrm;
      end;
    end if;

    -- Index the FK column so cascade deletes stay fast.
    execute format('create index if not exists %I on public.%I (owner_id)', t || '_owner_id_idx', t);
  end loop;

  -- Reminders hang off documents: cascade document deletes into them.
  if to_regclass('public.reminders') is not null and to_regclass('public.documents') is not null then
    select c.conname, c.confdeltype into fk_name, fk_del
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attname = 'document_id'
     and a.attnum = any(c.conkey)
    where c.conrelid = 'public.reminders'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.documents'::regclass
    limit 1;

    if fk_name is null then
      begin
        execute format(
          'alter table public.%I add constraint %I foreign key (document_id) references public.documents (id) on delete cascade',
          'reminders', 'reminders_document_id_fkey'
        );
        raise notice 'fk reminders: added document cascade';
      exception when others then
        raise warning 'fk reminders: could not add constraint (%)', sqlerrm;
      end;
    end if;
    execute 'create index if not exists reminders_document_id_idx on public.reminders (document_id)';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3) REPORT — warn on anything still unattributable (expect silence).
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  col text;
  orphans bigint;
begin
  if to_regclass('public.reminders') is not null
     and to_regclass('public.documents') is not null then
    select count(*) into orphans
    from public.reminders r
    where not exists (
      select 1
      from public.documents d
      join auth.users u on u.id = d.owner_id
      where d.id = r.document_id
    );
    if orphans > 0 then
      raise warning 'report: % orphaned reminder row(s) remain', orphans;
    end if;
  end if;

  for t, col in
    select tbl, col from (values
      ('collections', 'owner_id'),
      ('documents', 'owner_id'),
      ('finance_transactions', 'owner_id'),
      ('category_budgets', 'owner_id'),
      ('savings_envelopes', 'owner_id'),
      ('recurring_transactions', 'owner_id'),
      ('custom_document_types', 'owner_id'),
      ('user_tiers', 'user_id'),
      ('user_tier_audit', 'user_id'),
      ('ai_quota_usage', 'user_id'),
      ('support_requests', 'user_id')
    ) as v(tbl, col)
  loop
    if to_regclass(format('public.%I', t)) is not null and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = col
    ) then
      execute format(
        'select count(*) from public.%I where %I is not null and not exists (select 1 from auth.users u where u.id = %I)',
        t, col, col
      ) into orphans;
      if orphans > 0 then
        raise warning 'report: % has % orphaned % row(s)', t, orphans, col;
      end if;
    end if;
  end loop;

  raise notice 'report done: no warnings above means every data row has a live auth.users owner';
end $$;
