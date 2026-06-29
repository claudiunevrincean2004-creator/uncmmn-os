-- ============================================================================
-- NATHAN OS — Admin: remove a user
-- Lets an admin delete another user's auth account + profile in one call,
-- WITHOUT shipping a service-role key to the browser. SECURITY DEFINER runs as
-- the function owner (postgres), which can delete from auth.users; the profiles
-- row is removed automatically via profiles' ON DELETE CASCADE FK to auth.users.
--
-- Guards inside the function (not just the UI):
--   • caller must be an admin (public.is_admin())
--   • cannot delete your own account (prevents locking yourself out)
--
-- Does not change role-checking or tab-visibility logic — it only enforces them.
-- Run AFTER auth_setup.sql. Safe to re-run (idempotent).
-- ============================================================================

create or replace function public.admin_delete_user(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can remove users';
  end if;
  if target_id = auth.uid() then
    raise exception 'You cannot remove your own account';
  end if;
  -- Cascades to public.profiles via its ON DELETE CASCADE FK to auth.users.
  delete from auth.users where id = target_id;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;
