-- ============================================================================
-- UNCMMN OS — "Assigned To" becomes a real user reference
-- Adds assigned_to_user_id (uuid → profiles.id) to studio_videos and
-- studio_ad_creatives, keeping the legacy text `assigned_to` column intact as a
-- migration fallback. Non-destructive: nothing is dropped or overwritten.
--
-- NOTE on the backfill: the old picker already stored the profile id (a uuid) in
-- the text column for most rows, while older/legacy rows may hold a display name
-- or email. The backfill therefore matches on id OR display_name OR email so
-- existing assignments carry over correctly. Run the steps in order.
-- Safe to re-run (idempotent).
-- ============================================================================

-- 1) New reference columns (FK clears the assignment if the user is deleted).
alter table public.studio_videos
  add column if not exists assigned_to_user_id uuid references public.profiles(id) on delete set null;

alter table public.studio_ad_creatives
  add column if not exists assigned_to_user_id uuid references public.profiles(id) on delete set null;

-- 2) Backfill from the existing text value (only where not already set).
update public.studio_videos v
   set assigned_to_user_id = p.id
  from public.profiles p
 where v.assigned_to_user_id is null
   and v.assigned_to is not null
   and btrim(v.assigned_to) <> ''
   and (
     v.assigned_to = p.id::text       -- picker already stored the profile id
     or v.assigned_to = p.display_name -- legacy free-text display name (exact)
     or v.assigned_to = p.email        -- legacy free-text email
   );

update public.studio_ad_creatives a
   set assigned_to_user_id = p.id
  from public.profiles p
 where a.assigned_to_user_id is null
   and a.assigned_to is not null
   and btrim(a.assigned_to) <> ''
   and (
     a.assigned_to = p.id::text
     or a.assigned_to = p.display_name
     or a.assigned_to = p.email
   );

-- 3) Unmatched rows — a non-empty text assignee that resolved to no profile.
--    Review and fix these manually (their text value is left untouched).
select 'studio_videos' as table_name, v.id, v.assigned_to as unmatched_text
  from public.studio_videos v
 where v.assigned_to is not null
   and btrim(v.assigned_to) <> ''
   and v.assigned_to_user_id is null
union all
select 'studio_ad_creatives' as table_name, a.id, a.assigned_to as unmatched_text
  from public.studio_ad_creatives a
 where a.assigned_to is not null
   and btrim(a.assigned_to) <> ''
   and a.assigned_to_user_id is null;
