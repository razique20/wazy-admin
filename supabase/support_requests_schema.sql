-- P1.4: Feature Request Popularity Tracking
-- Add feature_name column so admin can see WHICH feature is requested.

alter table public.support_requests
  add column if not exists feature_name text;

-- Index for popularity queries
create index if not exists support_requests_feature_name_idx
  on public.support_requests(feature_name)
  where feature_name is not null;
