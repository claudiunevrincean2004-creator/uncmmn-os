-- ============================================================================
-- Content OS — Clippers (Phase 1: data model + admin management view)
-- Adds the 'clipper' role tier, clipper-specific profile fields, and the two
-- clipper tables. Existing admin/editor users are unaffected.
-- Run AFTER auth_setup.sql. Safe to re-run (idempotent).
-- ============================================================================

-- 1) Extend the role system to include 'clipper'. auth_setup.sql defines an
--    inline CHECK (role in ('admin','editor')) named profiles_role_check — drop
--    and recreate it so 'clipper' is allowed.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'editor', 'clipper'));

-- Clipper-specific profile fields (ignored for admin/editor).
alter table public.profiles add column if not exists clipper_status text default 'active';
alter table public.profiles add column if not exists joined_at timestamptz default now();

-- 2) clipper_accounts — one row per social account a clipper runs.
create table if not exists public.clipper_accounts (
  id uuid primary key default gen_random_uuid(),
  clipper_id uuid references public.profiles(id) on delete cascade,
  platform text,                       -- 'tiktok' | 'instagram' | 'youtube'
  handle text,
  account_url text,
  status text default 'active',        -- 'active' | 'inactive'
  created_at timestamptz default now()
);
-- Admin full access + a clipper reading their OWN rows (Phase 2 portal).
-- Previously "Allow all for anon" with no `to` clause — TO PUBLIC, so the anon
-- key could read every clipper's accounts.
alter table public.clipper_accounts enable row level security;
drop policy if exists "Allow all for anon" on public.clipper_accounts;
drop policy if exists "admin_all_clipper_accounts" on public.clipper_accounts;
drop policy if exists "clipper_own_clipper_accounts" on public.clipper_accounts;
create policy "admin_all_clipper_accounts" on public.clipper_accounts
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "clipper_own_clipper_accounts" on public.clipper_accounts
  for select to authenticated using (clipper_id = auth.uid());

-- 3) clipper_content — one row per video/post. views/likes/posted_at/
--    platform_post_id are automation-ready (platform APIs fill them later).
create table if not exists public.clipper_content (
  id uuid primary key default gen_random_uuid(),
  clipper_id uuid references public.profiles(id) on delete cascade,
  account_id uuid references public.clipper_accounts(id) on delete set null,
  platform text,
  content_url text,
  title text,
  views bigint default 0,
  likes bigint default 0,
  posted_at timestamptz,
  platform_post_id text,
  created_at timestamptz default now()
);
-- Same shape as clipper_accounts. The admin Dashboard also reads this table for
-- its stats, which the admin policy covers.
alter table public.clipper_content enable row level security;
drop policy if exists "Allow all for anon" on public.clipper_content;
drop policy if exists "admin_all_clipper_content" on public.clipper_content;
drop policy if exists "clipper_own_clipper_content" on public.clipper_content;
create policy "admin_all_clipper_content" on public.clipper_content
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "clipper_own_clipper_content" on public.clipper_content
  for select to authenticated using (clipper_id = auth.uid());
