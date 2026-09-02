-- ============================================================================
-- Content OS — Self-service display name
-- Lets ANY authenticated user set their OWN display name (first-login prompt +
-- account panel) without widening the profiles UPDATE policy, which stays
-- admin-only. The function is SECURITY DEFINER but only ever writes the
-- display_name column of the caller's own row (id = auth.uid()) — it cannot
-- touch role or any other user, so auth/role logic is unaffected.
-- Run AFTER auth_setup.sql / builtin_options_and_assignees.sql. Safe to re-run.
-- ============================================================================

create or replace function public.set_my_display_name(new_name text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set display_name = nullif(btrim(new_name), '')
   where id = auth.uid();
$$;

revoke all on function public.set_my_display_name(text) from public;
grant execute on function public.set_my_display_name(text) to authenticated;
