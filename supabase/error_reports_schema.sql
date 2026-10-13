-- ============================================================
-- Finavig — Error Reports Schema
-- Run this script in Supabase Dashboard → SQL Editor → New query
-- ============================================================

CREATE TABLE IF NOT EXISTS public.error_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  context TEXT NOT NULL,                     -- 'flutter' | 'platform' | 'zone'
  stack_head TEXT,                           -- first 6 frames
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  admin_notes TEXT,
  error_fingerprint TEXT
);

CREATE INDEX IF NOT EXISTS idx_error_reports_timestamp ON public.error_reports(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_reports_user_id ON public.error_reports(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_error_reports_user_fingerprint ON public.error_reports(user_id, error_fingerprint)
  WHERE error_fingerprint IS NOT NULL;

ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own error reports"
  ON public.error_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users can insert own error reports"
  ON public.error_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own error reports"
  ON public.error_reports FOR UPDATE
  USING (auth.uid() = user_id);
