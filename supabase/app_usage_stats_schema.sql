-- ============================================================
-- Finavig — App Usage Stats Schema
-- Run this script in Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Tracks app version adoption, active users, platform distribution
CREATE TABLE IF NOT EXISTS public.app_usage_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  app_version TEXT NOT NULL,
  last_app_open TIMESTAMPTZ,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_sessions INT NOT NULL DEFAULT 1
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_app_usage_stats_platform ON public.app_usage_stats(platform);
CREATE INDEX IF NOT EXISTS idx_app_usage_stats_app_version ON public.app_usage_stats(app_version);
CREATE INDEX IF NOT EXISTS idx_app_usage_stats_last_open ON public.app_usage_stats(last_app_open DESC);

-- Enable RLS
ALTER TABLE public.app_usage_stats ENABLE ROW LEVEL SECURITY;

-- Users can read their own stats
CREATE POLICY "users can read own usage stats"
  ON public.app_usage_stats FOR SELECT
  USING (auth.uid() = user_id);

-- Users can upsert their own stats (app updates on each launch)
CREATE POLICY "users can upsert own usage stats"
  ON public.app_usage_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own usage stats"
  ON public.app_usage_stats FOR UPDATE
  USING (auth.uid() = user_id);
