# Supabase Schemas — Admin Console

## Source of truth

**The mobile application's schemas in `~/Desktop/finavig/supabase/` define the
database.** The admin console reads and administers the same tables — it owns
no independent schema. When adding or changing schema here, always cross-check
the mobile schemas first; the Flutter app's reads/writes (its
`entitlement_service.dart`, signup flow, AI quota contract, etc.) are the
contract we must not break.

The mobile schemas are mirrored into this directory (see "Mirrored files")
so the admin repo is self-contained for deployments and review, but they are
**copies**. If a schema changes on the mobile side, copy it here again rather
than editing the copy in place — divergent edits break the app contract.

## Mirrored from the mobile app (do not edit independently)

| File | Purpose |
| --- | --- |
| `schema.sql` | Core tables: `collections`, `documents`, `reminders`, `custom_document_types` (all `owner_id … ON DELETE CASCADE`) |
| `finance_schema.sql` | `finance_transactions`, `category_budgets`, `savings_envelopes`, `recurring_transactions` |
| `delete_account_function.sql` | `delete_own_account()` — Play-Store-compliant self-service deletion via cascades |
| `gcc_migration.sql` | `collections.country_code` column |
| `migrate_companies_to_collections.sql` | One-off legacy rename migration |
| `migrate_documents_local_only_fields.sql` | One-off local-only → DB columns migration |
| `user_dob_schema.sql` | `user_tiers.date_of_birth` + signup sync trigger |
| `ai_quota_schema.sql` | `ai_quota_usage` freemium quotas |
| `app_version_schema.sql` | `app_versions` force-update control |
| `support_requests_schema.sql` | Support tickets |
| `user_tiers_schema.sql` | Subscription tiers + audit |

## Admin-only additions (console infrastructure, no mobile dependency)

| File | Purpose |
| --- | --- |
| `admin_audit_log_schema.sql` | Console audit trail (service-role only, no RLS policies) |
| `admin_audit_log_wipe_all_migration.sql` | Widens the audit CHECK for `data.wipe_all`; creates the table if missing |
| `user_data_cascade_schema.sql` | One-off: purge ghost rows + upgrade all FKs to `ON DELETE CASCADE` (aligns an older live DB with the mobile schemas) |

## Known semantic conflicts to resolve

1. **`support_requests.user_id` delete behavior** — mobile schema says
   `ON DELETE CASCADE` (tickets die with the account); the admin console's
   purge + UI copy assume `ON DELETE SET NULL` (tickets survive, anonymized).
   The live database decides which applies. Before relying on either
   behavior, check:
   ```sql
   select confdeltype from pg_constraint
   where conname like 'support_requests_user_id%'
     and conrelid = 'public.support_requests'::regclass;
   ```
   `c` = cascade (mobile wins; console purge of support_requests is a no-op),
   `n` = set null (console behavior wins). Align the two sides deliberately —
   don't leave the schema and the console disagreeing.

2. **`app_versions` constraints** — the admin copy is stricter (not-null
   `latest_version`, unique platform). Harmless: stricter CHECKs accept the
   app's writes; do not weaken the mobile side to match the console.

## Rules for future schema work

- New table with per-user rows → add it to `APP_DATA_TABLES` in
  `src/lib/purge.ts` (children first) so wipes and purges cover it, and give
  it an `owner_id`/`user_id` FK to `auth.users` with `ON DELETE CASCADE`
  (matching the mobile model).
- Never introduce email-keyed references — identity is always the auth
  `user id` (see the earlier ghost-user saga).
- Run order for a fresh project: `schema.sql` → `finance_schema.sql` →
  feature schemas → `admin_audit_log_schema.sql` →
  `admin_audit_log_wipe_all_migration.sql`.
