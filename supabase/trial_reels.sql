-- ============================================================================
-- UNCMMN OS — Trial Reels (production department for recreating high
-- follower-conversion Instagram reels from scratch).
--
-- Two tables:
--   trial_reel_source     — the backlog library, imported (upserted) from CSV
--   trial_reel_production  — one row per recreated reel in production
--
-- Both use the "Allow all for anon" RLS pattern (same as clipper_* tables).
-- Safe to re-run (idempotent). Run in the Supabase SQL Editor.
-- ============================================================================

-- 1) trial_reel_source — the backlog library. posted_url is the UNIQUE upsert key
--    used by the CSV importer. eligible / times_recreated / last_assigned_at are
--    SYSTEM fields owned by the app (the round-robin queue engine) and are never
--    overwritten by a CSV re-import.
create table if not exists public.trial_reel_source (
  id uuid primary key default gen_random_uuid(),
  posted_url text unique,            -- Instagram reel link — the upsert key
  description text,
  drive_url text,
  posted_date date,
  views bigint,
  follows bigint,
  follows_per_1k numeric,
  contains_talking boolean,
  full_version_file text,            -- name of the full source video
  "timestamp" text,                  -- exact moment, e.g. "00:05 - 05:21"
  snippet_download_link text,
  clip_brief text,                   -- app-authored editor instructions (NOT from CSV; never overwritten on re-import)
  final_product text,                -- link to the finished original video (CSV column "Final product")
  eligible boolean default true,     -- admin can exclude a video from ever being queued
  times_recreated int default 0,
  last_assigned_at timestamptz,      -- null = never assigned; drives round-robin
  created_at timestamptz default now()
);

-- Raw-file fields (idempotent — backfills existing installs whose table predates
-- these columns). Editors use them to find the source material without hunting.
alter table public.trial_reel_source add column if not exists full_version_file text;
alter table public.trial_reel_source add column if not exists "timestamp" text;
alter table public.trial_reel_source add column if not exists snippet_download_link text;

-- Editor brief + finished-original link (idempotent backfill). clip_brief is
-- authored inside the queue modal (never comes from CSV, so the importer never
-- clears it); final_product maps from the CSV column "Final product".
alter table public.trial_reel_source add column if not exists clip_brief text;
alter table public.trial_reel_source add column if not exists final_product text;

-- Ensure the UNIQUE constraint on posted_url exists even if the table predates it
-- (needed as the ON CONFLICT target for the CSV upsert).
create unique index if not exists trial_reel_source_posted_url_key
  on public.trial_reel_source (posted_url);

alter table public.trial_reel_source enable row level security;
drop policy if exists "Allow all for anon" on public.trial_reel_source;
create policy "Allow all for anon" on public.trial_reel_source for all using (true) with check (true);

-- 2) trial_reel_production — one row per recreated reel in production.
--    Status flow: Assigned → Editing → In Review → Revisions Needed → Posted
--    (free text; the option list lives in lib/trial-reels.ts, not a DB enum).
create table if not exists public.trial_reel_production (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.trial_reel_source(id) on delete set null,
  assigned_to_user_id uuid references public.profiles(id) on delete set null,
  status text default 'Assigned',
  final_url text,                    -- the new recreated reel, filled by the editor
  queued_date date,
  created_at timestamptz default now()
);
alter table public.trial_reel_production enable row level security;
drop policy if exists "Allow all for anon" on public.trial_reel_production;
create policy "Allow all for anon" on public.trial_reel_production for all using (true) with check (true);

-- Refresh PostgREST's schema cache so writes to the new tables/columns don't fail
-- with PGRST205/PGRST204 until the next automatic reload.
notify pgrst, 'reload schema';
