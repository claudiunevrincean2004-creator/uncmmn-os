-- ============================================================================
-- NATHAN OS — Comment authors (+ comment access hardening)
-- Records who left each Studio comment so the UI can show the author and let a
-- user edit their own comments (admins can still delete any). Plain uuid column
-- (matching the loose, FK-free style of item_id) holding the author's profile /
-- auth user id. Existing rows keep a null author (shown without an author).
--
-- ALSO recreates the studio_comments RLS policy without a role restriction so it
-- applies to every role (anon AND authenticated) — mirroring studio_quick_links
-- / studio_dropdown_options. The prior policy was scoped `to anon`; if the app
-- ever issues comment requests as the authenticated role, that scoping would
-- block insert/select. `using (true) with check (true)` keeps it fully open like
-- the other Studio tables.
-- Run AFTER schema.sql. Safe to re-run (idempotent).
-- ============================================================================

alter table public.studio_comments add column if not exists author_id uuid;

alter table public.studio_comments enable row level security;
drop policy if exists "anon_all_studio_comments" on public.studio_comments;
drop policy if exists "all_studio_comments" on public.studio_comments;
create policy "all_studio_comments" on public.studio_comments
  for all using (true) with check (true);
