-- ============================================================
-- Self-service account deletion (Play Store data-safety compliance)
-- ============================================================
-- The client SDK cannot delete auth users (needs service_role). Standard
-- pattern: a security definer function callable only by the authenticated
-- user themselves — it deletes auth.users row for auth.uid() and every
-- business table cascades (owner_id REFERENCES ... ON DELETE CASCADE).
--
-- Run once in the Supabase SQL editor.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- Must be called with a valid JWT from an authenticated user.
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Cascades: collections, documents, reminders, finance tables,
  -- ai_quota_usage, user_tiers, support_requests (owner_id FKs).
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

comment on function public.delete_own_account() is
  'Deletes the calling user''s auth row; all owner-scoped data is removed by ON DELETE CASCADE. Play Store account-deletion compliance.';
