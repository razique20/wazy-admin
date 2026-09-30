-- ============================================================
-- MIGRATION: documents.location + documents.renewal_history
--
-- WHAT CHANGED
--   Two document fields were previously stored only on-device
--   (SharedPreferences) and never reached the database:
--
--     1. location        — issuing authority + jurisdiction exactly as
--                          entered in the upload form, e.g.
--                          'Dubai Municipality (Dubai)'
--     2. renewal_history — JSON array of renewal events (RenewalRecord:
--                          id, renewedAt, previousExpiryDate,
--                          newExpiryDate, fee, renewedBy, note)
--     3. custom_reminder_days — user-chosen reminder offsets in days
--                          (e.g. {90,60,30,7}), overriding the default
--                          escalation ladder per document
--
-- DATA SAFETY
--   * Additive only: nullable columns, no backfill needed, no existing
--     row can fail. After running this, the app uploads those fields on
--     the next save/sync.
--   * Safe to re-run: every statement is idempotent.
--
-- RUN: Supabase Dashboard → SQL Editor → New query → paste whole file → Run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. New columns
-- ------------------------------------------------------------
alter table public.documents add column if not exists location text;
alter table public.documents add column if not exists renewal_history jsonb;
alter table public.documents add column if not exists custom_reminder_days int[];

-- ------------------------------------------------------------
-- 2. Verification
-- ------------------------------------------------------------
-- After running, this should return all three new columns:
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public'
--     and table_name   = 'documents'
--     and column_name in ('location', 'renewal_history',
--                          'custom_reminder_days');
