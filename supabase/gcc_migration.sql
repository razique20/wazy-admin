-- Migration script to add country_code to public.collections
-- Run this in Supabase Dashboard -> SQL Editor

alter table public.collections
  add column if not exists country_code text not null default 'AE';

comment on column public.collections.country_code is 'GCC country ISO 2-letter code (AE, SA, KW, QA, BH, OM)';
