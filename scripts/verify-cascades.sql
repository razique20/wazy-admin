-- Verification for the cascade alignment (run via scripts/run-sql.ts).
-- confdeltype: c = CASCADE, n = SET NULL, a = NO ACTION, r = RESTRICT
select conrelid::regclass::text as table_name,
       att.attname as column_name,
       conname,
       confdeltype as delete_rule
from pg_constraint c
join pg_attribute att on att.attrelid = c.conrelid and att.attnum = any(c.conkey)
where c.confrelid = 'auth.users'::regclass
  and c.contype = 'f'
order by 1;

-- Orphan check: every per-user table must have zero rows whose owner is
-- missing from auth.users (the report block in the migration asserts this
-- too; this re-check runs against the live primary connection).
select 'collections' as t, count(*) as orphans from public.collections c where not exists (select 1 from auth.users u where u.id = c.owner_id)
union all select 'documents', count(*) from public.documents d where not exists (select 1 from auth.users u where u.id = d.owner_id)
union all select 'finance_transactions', count(*) from public.finance_transactions f where not exists (select 1 from auth.users u where u.id = f.owner_id)
union all select 'reminders', count(*) from public.reminders r where not exists (select 1 from public.documents dd join auth.users u on u.id = dd.owner_id where dd.id = r.document_id);
