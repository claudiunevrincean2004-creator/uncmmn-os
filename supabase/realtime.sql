-- ============================================================================
-- UNCMMN OS — Realtime live sync (postgres_changes)
--
-- Supabase only streams changes for tables that are MEMBERS OF the
-- `supabase_realtime` publication. A table that isn't a member emits nothing at
-- all — no error, no warning, just silence — so the board looks like it simply
-- "doesn't sync". This file makes every table the app subscribes to a member.
--
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent): step 2 skips
-- tables that are already members instead of erroring on them.
--
-- Client side: lib/use-realtime.ts (one shared channel, bound in app/page.tsx)
-- and the comment_reactions channel in components/sub/studio/ItemPanel.tsx.
-- ============================================================================


-- 1) WHAT IS LIVE RIGHT NOW --------------------------------------------------
-- Everything currently published (run this before and after step 2 to see the
-- difference):
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by schemaname, tablename;

-- Just the ones this app needs that are still MISSING — an empty result means
-- live sync is fully wired:
select t.tablename as missing_from_supabase_realtime
from unnest(array[
  'studio_videos', 'studio_ad_creatives', 'studio_sequences', 'studio_sessions',
  'trial_reel_source', 'trial_reel_production',
  'clipper_accounts', 'clipper_content',
  'clip_source', 'clip_snippet',
  'studio_comments', 'studio_activity', 'comment_reads', 'comment_reactions',
  'studio_quick_links', 'studio_dropdown_options',
  'custom_properties', 'custom_property_options', 'profiles'
]) as t(tablename)
where not exists (
  select 1 from pg_publication_tables p
  where p.pubname = 'supabase_realtime'
    and p.schemaname = 'public'
    and p.tablename = t.tablename
);


-- 2) ADD THE MISSING TABLES --------------------------------------------------
-- `alter publication … add table` ERRORS if the table is already a member, so
-- each one is guarded. Missing tables (a migration you haven't run yet) are
-- skipped rather than failing the whole script.
do $$
declare
  t text;
begin
  -- The publication normally already exists on a Supabase project; create it
  -- empty if someone dropped it, so the adds below have somewhere to land.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    -- Studio boards
    'studio_videos',            -- Video Review
    'studio_ad_creatives',      -- Ad Creative
    'studio_sequences',         -- Story Sequences
    'studio_sessions',          -- Filming Sessions
    -- Trial Reels
    'trial_reel_source',        -- source library
    'trial_reel_production',    -- production board
    -- Clippers
    'clipper_accounts',
    'clipper_content',
    -- Clip Library
    'clip_source',
    'clip_snippet',
    -- Comments, activity & inbox
    'studio_comments',          -- comments, replies, inbox badge, unread banner
    'studio_activity',          -- side-panel activity log
    'comment_reads',            -- per-user read state (syncs your own tabs)
    'comment_reactions',        -- emoji reactions
    -- Board scaffolding (options, quick links, display names)
    'studio_quick_links',
    'studio_dropdown_options',
    'custom_properties',
    'custom_property_options',
    'profiles'
  ] loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relkind = 'r'
    ) then
      raise notice 'skipping %: table does not exist (run its migration first)', t;
      continue;
    end if;

    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      raise notice 'skipping %: already in supabase_realtime', t;
      continue;
    end if;

    execute format('alter publication supabase_realtime add table public.%I;', t);
    raise notice 'added % to supabase_realtime', t;
  end loop;
end $$;


-- 3) NOTES -------------------------------------------------------------------
-- REPLICA IDENTITY: left at the default on purpose. On DELETE, Postgres sends
-- only the replica identity (the primary key) as the old row — and the primary
-- key is exactly what the client matches on to drop the row from its list, so
-- there is no need to pay for `replica identity full` on any of these tables.
--
-- RLS: Realtime re-checks each subscriber's SELECT policy per change, so a user
-- only receives rows they could have read anyway. The policies in auth_setup.sql
-- and friends already grant that to `authenticated`, so nothing changes here.
--
-- The equivalent plain statements, if you would rather run them one at a time
-- (each errors if the table is already a member — that error is harmless):
--
--   alter publication supabase_realtime add table studio_videos;
--   alter publication supabase_realtime add table studio_ad_creatives;
--   alter publication supabase_realtime add table studio_sequences;
--   alter publication supabase_realtime add table studio_sessions;
--   alter publication supabase_realtime add table trial_reel_source;
--   alter publication supabase_realtime add table trial_reel_production;
--   alter publication supabase_realtime add table clipper_accounts;
--   alter publication supabase_realtime add table clipper_content;
--   alter publication supabase_realtime add table clip_source;
--   alter publication supabase_realtime add table clip_snippet;
--   alter publication supabase_realtime add table studio_comments;
--   alter publication supabase_realtime add table studio_activity;
--   alter publication supabase_realtime add table comment_reads;
--   alter publication supabase_realtime add table comment_reactions;
--   alter publication supabase_realtime add table studio_quick_links;
--   alter publication supabase_realtime add table studio_dropdown_options;
--   alter publication supabase_realtime add table custom_properties;
--   alter publication supabase_realtime add table custom_property_options;
--   alter publication supabase_realtime add table profiles;
