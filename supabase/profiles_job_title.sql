-- ============================================================================
-- Content OS — Job title (self-service)
-- Adds a free-text job title to profiles (e.g. "Media Buyer", "Editor") and a
-- self-service setter mirroring set_my_display_name: any authenticated user can
-- set their OWN job title without widening the admin-only profiles UPDATE policy.
-- The function is SECURITY DEFINER but only writes the job_title column of the
-- caller's own row (id = auth.uid()) — it cannot touch role or any other user,
-- so auth/role logic is unaffected.
-- Run AFTER auth_setup.sql / builtin_options_and_assignees.sql. Safe to re-run.
-- ============================================================================

alter table public.profiles add column if not exists job_title text;

create or replace function public.set_my_job_title(new_title text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set job_title = nullif(btrim(new_title), '')
   where id = auth.uid();
$$;

revoke all on function public.set_my_job_title(text) from public;
grant execute on function public.set_my_job_title(text) to authenticated;
