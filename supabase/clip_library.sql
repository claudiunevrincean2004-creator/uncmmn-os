-- ============================================================================
-- Content OS — Clip Library (Pass 1: library + import + browse).
--
-- Two tables:
--   clip_source   — the long-form pieces (the "Overview" sheet)
--   clip_snippet  — every clip carved from them (the "Snippet database" sheet)
--
-- Both are ADMIN-ONLY at the RLS layer, matching the Clip Library tab's
-- admin-only gate in lib/auth-config.ts. They previously used the "Allow all
-- for anon" pattern, which omitted the `to` clause and so defaulted to TO
-- PUBLIC — that is what exposed 854 clip rows to the anon key.
-- Run AFTER auth_setup.sql — the policies below call public.is_admin(), which
-- that file defines. Safe to re-run (idempotent). Run in the Supabase SQL Editor.
-- ============================================================================

-- 1) clip_source — one row per long-form piece. name is the UNIQUE upsert key
--    used by the Overview CSV importer.
create table if not exists public.clip_source (
  id uuid primary key default gen_random_uuid(),
  name text unique,                  -- e.g. "Questions w/ Eden - 5 January - 2024"
  raw_full_version text,             -- RAW full version file (may be "-"/empty → null)
  date_added date,
  format text,                       -- e.g. Podcast, Q&A, Raw Talk
  created_at timestamptz default now()
);
create unique index if not exists clip_source_name_key on public.clip_source (name);
-- Date + format (idempotent — backfills installs whose tables predate them).
alter table public.clip_source add column if not exists date_added date;
alter table public.clip_source add column if not exists format text;
-- ADMIN-ONLY. The Clip Library tab is absent from EDITOR_ALLOWED in
-- lib/auth-config.ts, so no editor can reach this data through the UI; the
-- policy now says the same thing. Previously "Allow all for anon" with no `to`
-- clause — which defaults to TO PUBLIC and therefore included anon.
alter table public.clip_source enable row level security;
drop policy if exists "Allow all for anon" on public.clip_source;
drop policy if exists "admin_all_clip_source" on public.clip_source;
create policy "admin_all_clip_source" on public.clip_source
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 2) clip_snippet — one row per clip. source_name is the raw section-header name
--    from the sheet; source_id is the best-effort FK link to clip_source by name.
create table if not exists public.clip_snippet (
  id uuid primary key default gen_random_uuid(),
  source_name text,
  source_id uuid references public.clip_source(id) on delete set null,
  description text,
  full_version_file text,
  "timestamp" text,
  snippet_download_link text,
  date_added date,
  format text,                       -- e.g. Podcast, Q&A, Raw Talk
  created_at timestamptz default now()
);
alter table public.clip_snippet add column if not exists date_added date;
alter table public.clip_snippet add column if not exists format text;
-- ADMIN-ONLY, same reasoning as clip_source above. This is the table that was
-- leaking hardest: 854 clip rows, each with its download link, readable by
-- anyone holding the anon key.
alter table public.clip_snippet enable row level security;
drop policy if exists "Allow all for anon" on public.clip_snippet;
drop policy if exists "admin_all_clip_snippet" on public.clip_snippet;
create policy "admin_all_clip_snippet" on public.clip_snippet
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Refresh PostgREST's schema cache so writes to the new tables don't fail with
-- PGRST205/PGRST204 until the next automatic reload.
notify pgrst, 'reload schema';
