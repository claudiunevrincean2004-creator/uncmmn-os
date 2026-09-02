-- ============================================================================
-- Content OS — Auth, profiles, roles & Row Level Security
-- Run this in the Supabase SQL Editor. Safe to re-run (idempotent).
-- Run AFTER schema.sql (it re-enables RLS on the data tables defined there).
-- ============================================================================

-- 1) PROFILES ----------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('admin', 'editor')),
  created_at timestamptz default now()
);

-- 2) ROLE HELPER -------------------------------------------------------------
-- SECURITY DEFINER so it can read profiles without tripping RLS (avoids recursion
-- when used inside profiles' own policies).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- 3) AUTO-CREATE A PROFILE ON SIGNUP ----------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'editor')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) PROFILES RLS ------------------------------------------------------------
alter table public.profiles enable row level security;

-- A user can read their own profile row (admins can read all).
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (auth.uid() = id or public.is_admin());

-- Only admins can change roles.
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- 5) DATA-LAYER ACCESS RULES
--    Editor  -> Studio tables + Assets (drive_folders) + read clients (bootstrap)
--    Admin   -> everything
-- ============================================================================

-- Helper note: studio_* tables previously had public "anon" policies — drop them
-- so the data is only reachable by an authenticated session.

-- 5a) Authenticated-any (Studio + Assets) full access -----------------------
do $$
declare t text;
begin
  foreach t in array array[
    'drive_folders',
    'studio_videos', 'studio_sequences', 'studio_sessions', 'studio_ad_creatives',
    'studio_comments', 'studio_activity', 'studio_quick_links', 'studio_dropdown_options'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "anon_all_%s" on public.%I;', t, t);
    execute format('drop policy if exists "Allow all for anon" on public.%I;', t);
    execute format('drop policy if exists "auth_all_%s" on public.%I;', t, t);
    execute format(
      'create policy "auth_all_%s" on public.%I for all to authenticated using (true) with check (true);',
      t, t
    );
  end loop;
end $$;

-- 5b) clients: any authenticated user may READ (the app needs the client row to
--     bootstrap), but only admins may write.
alter table public.clients enable row level security;
drop policy if exists "clients_select_auth" on public.clients;
create policy "clients_select_auth" on public.clients
  for select to authenticated using (true);
drop policy if exists "clients_write_admin" on public.clients;
create policy "clients_write_admin" on public.clients
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 5c) Admin-only tables (content analytics that editors must not see) --------
do $$
declare t text;
begin
  foreach t in array array[
    'posts', 'research_items', 'subscriber_snapshots'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "admin_all_%s" on public.%I;', t, t);
    execute format(
      'create policy "admin_all_%s" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin());',
      t, t
    );
  end loop;
end $$;

-- ============================================================================
-- 6) BOOTSTRAP THE FIRST ADMIN
--    Create the user first (Supabase Dashboard → Authentication → Add user,
--    or the Admin API). The trigger gives them role 'editor'; promote them:
--
--    update public.profiles set role = 'admin'
--    where id = (select id from auth.users where email = 'you@example.com');
-- ============================================================================
