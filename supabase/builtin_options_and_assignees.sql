-- ============================================================================
-- NATHAN OS — Editable built-in Format/Status options + assignable users
-- Run AFTER schema.sql, auth_setup.sql, custom_properties.sql.
-- Safe to re-run (idempotent).
-- ============================================================================

-- ── CHANGE 1: built-in Format & Status options become DB-backed & editable ──
-- Reuses studio_dropdown_options (already backs these fields) + adds color/order.
alter table public.studio_dropdown_options add column if not exists color text;
alter table public.studio_dropdown_options add column if not exists position int not null default 0;
create unique index if not exists studio_dropdown_options_field_value_key
  on public.studio_dropdown_options (field, value);

-- Seed the current built-in defaults so admins can rename/recolor/reorder/remove.
insert into public.studio_dropdown_options (field, value, color, position) values
  ('video_status', 'Scripting', '#6b7280', 0),
  ('video_status', 'Recording', '#3b82f6', 1),
  ('video_status', 'Raw Footage Ready', '#eab308', 2),
  ('video_status', 'Editing', '#f59e0b', 3),
  ('video_status', 'In Review', '#8b5cf6', 4),
  ('video_status', 'Revision Requested', '#ef4444', 5),
  ('video_status', 'Ad Variation Needed', '#ec4899', 6),
  ('video_status', 'Approved', '#10b981', 7),
  ('video_status', 'Posted', '#14b8a6', 8),
  ('video_format', 'Short', null, 0),
  ('video_format', 'Long Form', null, 1),
  ('video_format', 'Reel', null, 2),
  ('video_format', 'Story', null, 3),
  ('video_format', 'Other', null, 4),
  ('sequence_status', 'Draft', '#6b7280', 0),
  ('sequence_status', 'Ready for Review', '#8b5cf6', 1),
  ('sequence_status', 'Revision Requested', '#ef4444', 2),
  ('sequence_status', 'Approved', '#10b981', 3),
  ('sequence_status', 'Posted', '#14b8a6', 4),
  ('session_status', 'Planned', '#6b7280', 0),
  ('session_status', 'Confirmed', '#3b82f6', 1),
  ('session_status', 'Filming', '#f59e0b', 2),
  ('session_status', 'Filmed', '#10b981', 3),
  ('session_status', 'Cancelled', '#ef4444', 4),
  ('session_type', 'Scripted', '#8b5cf6', 0),
  ('session_type', 'Raw talk', '#14b8a6', 1),
  ('ad_status', 'Live', '#10b981', 0),
  ('ad_status', 'Paused', '#eab308', 1),
  ('ad_status', 'Winner', '#14b8a6', 2),
  ('ad_status', 'Killed', '#ef4444', 3),
  ('ad_status', 'Revision Requested', '#f59e0b', 4),
  ('ad_format', 'Video', null, 0),
  ('ad_format', 'Static', null, 1)
on conflict (field, value) do nothing;

-- ── CHANGE 2: assignable real-user picker ──────────────────────────────────
alter table public.profiles add column if not exists assignable boolean not null default true;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists display_name text;

-- Backfill identity from auth.users so the picker can show/search names & emails.
update public.profiles p set email = u.email
  from auth.users u where u.id = p.id and (p.email is null or p.email = '');
update public.profiles p set display_name = coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name')
  from auth.users u where u.id = p.id and p.display_name is null;

-- Keep identity in sync on new signups (profile still defaults to 'editor').
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, email, display_name)
  values (new.id, 'editor', new.email, coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name'))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- The assignee picker must list other users, so any authenticated user may READ
-- profiles. (Updates — incl. role and `assignable` — remain admin-only.)
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select to authenticated using (true);
