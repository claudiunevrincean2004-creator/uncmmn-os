-- ============================================================================
-- Content OS — Custom SELECT properties for Studio tables
-- Adds admin-managed dropdown columns to the customizable Studio tables
-- (Story Sequences, Filming Sessions, Ad Creative — NOT Video Review).
-- Run AFTER schema.sql and auth_setup.sql (depends on public.is_admin()).
-- Safe to re-run (idempotent).
-- ============================================================================

-- 1) Column definitions ------------------------------------------------------
create table if not exists public.custom_properties (
  id uuid primary key default gen_random_uuid(),
  table_key text not null,          -- 'sequence' | 'session' | 'ad'
  name text not null,               -- column header
  position int not null default 0,  -- ordering among custom columns
  created_at timestamptz default now()
);

create table if not exists public.custom_property_options (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.custom_properties(id) on delete cascade,
  label text not null,
  color text,                       -- nullable hex for the option pill
  position int not null default 0,
  created_at timestamptz default now()
);

-- 2) Per-row selected values: property_id -> option_id, kept in a JSONB column
--    on each customizable table (does not touch the built-in columns).
alter table public.studio_sequences   add column if not exists custom_values jsonb not null default '{}'::jsonb;
alter table public.studio_sessions     add column if not exists custom_values jsonb not null default '{}'::jsonb;
alter table public.studio_ad_creatives add column if not exists custom_values jsonb not null default '{}'::jsonb;

-- 3) RLS (matches existing pattern): any authenticated user may READ the column
--    definitions; only admins may create/rename/remove/reorder them.
alter table public.custom_properties enable row level security;
drop policy if exists "custom_properties_read" on public.custom_properties;
create policy "custom_properties_read" on public.custom_properties
  for select to authenticated using (true);
drop policy if exists "custom_properties_admin_write" on public.custom_properties;
create policy "custom_properties_admin_write" on public.custom_properties
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.custom_property_options enable row level security;
drop policy if exists "custom_property_options_read" on public.custom_property_options;
create policy "custom_property_options_read" on public.custom_property_options
  for select to authenticated using (true);
drop policy if exists "custom_property_options_admin_write" on public.custom_property_options;
create policy "custom_property_options_admin_write" on public.custom_property_options
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Note: selecting/clearing a value writes only to the row's `custom_values`
-- JSONB on studio_sequences / studio_sessions / studio_ad_creatives, which are
-- already covered by their existing "auth_all_*" policies (any authenticated user).
