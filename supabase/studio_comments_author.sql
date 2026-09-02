-- ============================================================================
-- Content OS — Comment authors (+ comment access hardening)
-- Records who left each Studio comment so the UI can show the author and let a
-- user edit their own comments (admins can still delete any). Plain uuid column
-- (matching the loose, FK-free style of item_id) holding the author's profile /
-- auth user id. Existing rows keep a null author (shown without an author).
--
-- ALSO recreates the studio_comments RLS policy scoped `to authenticated`.
--
-- History worth keeping, because the first fix here was the wrong one: the
-- original policy was scoped `to anon`, which blocked comment insert/select once
-- the app started issuing requests as the authenticated role. That was corrected
-- by dropping the role restriction entirely — but a policy with no `to` clause
-- defaults to TO PUBLIC, and PUBLIC includes anon, so the table stayed open to
-- the logged-out world. `to authenticated` is the actual fix: it is the role the
-- app really uses, and it is the only role that should reach this table.
-- middleware.ts redirects every route except /login, so nothing here is ever
-- served to an anonymous visitor.
--
-- Run AFTER schema.sql. Safe to re-run (idempotent).
-- ============================================================================

alter table public.studio_comments add column if not exists author_id uuid;

-- Any authenticated user. `to authenticated` is the fix: the previous policy
-- omitted the `to` clause, which defaults to TO PUBLIC and so included anon.
alter table public.studio_comments enable row level security;
drop policy if exists "anon_all_studio_comments" on public.studio_comments;
drop policy if exists "all_studio_comments" on public.studio_comments;
drop policy if exists "auth_all_studio_comments" on public.studio_comments;
create policy "auth_all_studio_comments" on public.studio_comments
  for all to authenticated using (true) with check (true);
