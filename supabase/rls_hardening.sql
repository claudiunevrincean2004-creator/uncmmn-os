-- ============================================================================
-- Content OS — RLS hardening
--
-- WHY THIS FILE EXISTS
-- Fifteen tables were reachable with nothing but the NEXT_PUBLIC anon key. Two
-- separate causes, both of which had to be fixed in the repo as well as in the
-- live database (see supabase/schema.sql and lib/setup-db.ts):
--
--   1. RLS DISABLED OUTRIGHT on the legacy tables — clients, posts,
--      drive_folders, subscriber_snapshots, research_items. (`goals` and
--      `revenue_entries` were on this list too; both were dropped in the phase 1
--      cleanup, and every array below dropped with them.)
--      `alter table ... disable row level security` beats every policy: the
--      correct policies in auth_setup.sql were being written and then bypassed.
--
--   2. POLICIES CREATED WITHOUT A `to` CLAUSE. In Postgres a policy with no
--      `to` role defaults to TO PUBLIC, and PUBLIC includes Supabase's `anon`
--      role. Every "Allow all for anon" policy in this repo is of that shape, so
--      `using (true)` handed the table to the logged-out world:
--        clip_source, clip_snippet, clipper_accounts, clipper_content,
--        comment_reads, comment_reactions, trial_reel_source,
--        trial_reel_production, studio_comments, studio_quick_links,
--        studio_dropdown_options.
--
-- THE ACCESS MODEL THIS FILE ENFORCES mirrors lib/auth-config.ts, which is the
-- app's own gate — EDITOR_ALLOWED = ['studio', 'drive', 'trialreels']:
--
--   admin-only          tables behind an admin-only tab (Content, Research,
--                       Dashboard, Clip Library, Clippers)
--   authenticated       tables behind a tab editors can reach (Studio, Assets,
--                       Trial Reels)
--   own-row-only        per-user state (comment_reads, comment_reactions writes)
--
-- Nothing in this app is served to a logged-out visitor: middleware.ts redirects
-- every route except /login to /login. So NO table needs anon access, and this
-- file also revokes anon's table grants as a second layer under RLS.
--
-- DEPENDS ON public.is_admin() from auth_setup.sql — run that first.
-- Safe to re-run (idempotent). Run in the Supabase SQL Editor.
-- ============================================================================

-- 0) PRECONDITION ------------------------------------------------------------
-- Fail loudly and early rather than creating half a policy set that silently
-- locks admins out of their own data.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
  ) then
    raise exception
      'public.is_admin() is missing — run supabase/auth_setup.sql first, then re-run this file.';
  end if;
end $$;


-- 1) WIPE EVERY EXISTING POLICY ON THE AFFECTED TABLES ----------------------
-- Deliberately a clean sweep rather than a list of `drop policy if exists` by
-- name. Postgres ORs permissive policies together, so ONE surviving
-- `using (true)` TO PUBLIC policy re-opens the table no matter what else is
-- added beside it. The old names are inconsistent across this repo ("Allow all
-- for anon", "anon_all_*", "all_studio_comments", "all_comment_reads",
-- "auth_all_*"), and a rename in a future migration would slip past a
-- name-by-name drop. Dropping whatever is actually there is the only version of
-- this that cannot leave a hole behind.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        -- legacy tables
        'clients', 'posts', 'drive_folders',
        'subscriber_snapshots', 'research_items',
        -- TO PUBLIC offenders
        'clip_source', 'clip_snippet',
        'clipper_accounts', 'clipper_content',
        'comment_reads', 'comment_reactions',
        'trial_reel_source', 'trial_reel_production',
        'studio_comments', 'studio_quick_links', 'studio_dropdown_options'
      )
  loop
    execute format('drop policy %I on public.%I;', r.policyname, r.tablename);
    raise notice 'dropped policy % on %', r.policyname, r.tablename;
  end loop;
end $$;


-- 2) ENABLE RLS EVERYWHERE ---------------------------------------------------
-- Plain `enable`, deliberately NOT `force`. `force row level security` would
-- apply these policies to the table owner as well — and the Supabase SQL editor
-- runs as that owner, where auth.uid() is null and public.is_admin() is
-- therefore false. Forcing would lock you out of your own data in the dashboard
-- for every admin-only table below. The owner and service_role bypassing RLS is
-- correct: neither is reachable with the anon key, which is the actual threat
-- here.
do $$
declare t text;
begin
  foreach t in array array[
    'clients', 'posts', 'drive_folders',
    'subscriber_snapshots', 'research_items',
    'clip_source', 'clip_snippet',
    'clipper_accounts', 'clipper_content',
    'comment_reads', 'comment_reactions',
    'trial_reel_source', 'trial_reel_production',
    'studio_comments', 'studio_quick_links', 'studio_dropdown_options'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;


-- 3) ADMIN-ONLY TABLES -------------------------------------------------------
-- Each of these sits behind a tab that lib/auth-config.ts already refuses to
-- render for an editor or clipper, so an admin-only policy changes nothing an
-- editor can currently see — it just stops the anon key reaching around the UI.
--
--   posts, subscriber_snapshots  → Content tab + Dashboard (admin-only tabs)
--   research_items               → Research tab (admin-only)
--   clip_source, clip_snippet    → Clip Library tab (admin-only); also the CSV
--                                  importer in lib/clip-library.ts
--   goals, revenue_entries       → DROPPED in the phase 1 cleanup. Both were
--                                  orphaned (no .from() call anywhere in the
--                                  app); see the note at the bottom of this file.
do $$
declare t text;
begin
  foreach t in array array[
    'posts', 'research_items', 'subscriber_snapshots',
    'clip_source', 'clip_snippet'
  ] loop
    execute format(
      'create policy "admin_all_%s" on public.%I for all to authenticated
         using (public.is_admin()) with check (public.is_admin());',
      t, t
    );
  end loop;
end $$;


-- 4) clients — authenticated READ, admin WRITE -------------------------------
-- app/page.tsx:244 reads the client row on every login (editors included) to
-- bootstrap the page, so the read cannot be admin-only.
--
-- ⚠ app/page.tsx:278 INSERTS a client ("auto-provision") when the table is
--   empty. Under this policy that insert succeeds for an admin and fails
--   silently for an editor. The live table has 6 rows so the branch is dead
--   today; it would only bite on a fresh database whose first login is an
--   editor's.
create policy "clients_select_auth" on public.clients
  for select to authenticated using (true);
create policy "clients_write_admin" on public.clients
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- 5) EDITOR-REACHABLE TABLES — any authenticated user ------------------------
-- These back tabs in EDITOR_ALLOWED, so they must stay open to every logged-in
-- user. The fix here is only the `to authenticated` clause that was missing:
-- same access for real users, no access for anon.
--
--   drive_folders            → Assets tab (DriveTab / DriveModal)
--   trial_reel_production    → Trial Reels production board; editors update
--                              status and final_url on their own assignments
--   studio_comments          → comment threads on every Studio item
--   studio_quick_links,
--   studio_dropdown_options  → board scaffolding every Studio view reads
do $$
declare t text;
begin
  foreach t in array array[
    'drive_folders', 'trial_reel_production',
    'studio_comments', 'studio_quick_links', 'studio_dropdown_options'
  ] loop
    execute format(
      'create policy "auth_all_%s" on public.%I for all to authenticated
         using (true) with check (true);',
      t, t
    );
  end loop;
end $$;


-- 6) trial_reel_source — authenticated READ, admin WRITE ---------------------
-- The Trial Reels tab is editor-reachable, and the production board joins the
-- source row to show each reel's brief and original URL — so editors must read
-- it. The source library, CSV import and queue generation are admin-only
-- surfaces inside that tab (lib/auth-config.ts), so writes stay admin-only.
create policy "trial_reel_source_select_auth" on public.trial_reel_source
  for select to authenticated using (true);
create policy "trial_reel_source_write_admin" on public.trial_reel_source
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- 7) clipper_accounts / clipper_content — admin, plus a clipper's own rows ---
-- The Clippers tab is admin-only and currently hidden from the nav; the admin
-- Dashboard also reads clipper_content for its stats. The second policy is what
-- the Phase 2 clipper portal will need — a clipper reading THEIR OWN rows and
-- nothing else. It grants a clipper strictly less than they have today (today:
-- everything, via anon) and keeps the Phase 2 work from re-opening this table.
do $$
declare t text;
begin
  foreach t in array array['clipper_accounts', 'clipper_content'] loop
    execute format(
      'create policy "admin_all_%s" on public.%I for all to authenticated
         using (public.is_admin()) with check (public.is_admin());',
      t, t
    );
    execute format(
      'create policy "clipper_own_%s" on public.%I for select to authenticated
         using (clipper_id = auth.uid());',
      t, t
    );
  end loop;
end $$;


-- 8) comment_reads — strictly own-row ----------------------------------------
-- Per-user read state. Every access in the app is already scoped to the signed-
-- in user: the select filters .eq('user_id', uid) (app/page.tsx:318), the upsert
-- writes user_id: currentUserId (app/page.tsx:340), and the realtime binding
-- subscribes with filter user_id=eq.<uid> (app/page.tsx:395). So restricting the
-- policy to auth.uid() matches what the client already asks for — and stops one
-- user enumerating whose comments everybody else has read.
--
-- `for all` covers the upsert's INSERT and UPDATE and the select in one policy.
create policy "comment_reads_own" on public.comment_reads
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- 9) comment_reactions — read all, write only your own -----------------------
-- Reads must stay wide: the reaction pills show everyone's reactions and count
-- them ("✅ 3"), and ItemPanel subscribes to all changes on the table. Writes are
-- narrowed to the acting user, which is all the app ever does — toggleReaction
-- inserts { user_id: currentUserId } and deletes .eq('user_id', currentUserId)
-- (ItemPanel.tsx:331-343). Split into three policies because SELECT and the
-- write verbs need different predicates.
create policy "comment_reactions_select_auth" on public.comment_reactions
  for select to authenticated using (true);
create policy "comment_reactions_insert_own" on public.comment_reactions
  for insert to authenticated with check (user_id = auth.uid());
create policy "comment_reactions_delete_own" on public.comment_reactions
  for delete to authenticated using (user_id = auth.uid());


-- 10) REVOKE anon's TABLE GRANTS --------------------------------------------
-- Defence in depth beneath RLS. Supabase grants `anon` broad table privileges by
-- default and relies entirely on RLS to hold the line; that is exactly the
-- single point of failure that produced this incident. middleware.ts redirects
-- every route except /login, so nothing in this app is served to a logged-out
-- visitor and anon needs no table access at all.
--
-- To undo for one table (e.g. if a genuinely public page is added later):
--   grant select on public.<table> to anon;
do $$
declare t text;
begin
  foreach t in array array[
    'clients', 'posts', 'drive_folders',
    'subscriber_snapshots', 'research_items',
    'clip_source', 'clip_snippet',
    'clipper_accounts', 'clipper_content',
    'comment_reads', 'comment_reactions',
    'trial_reel_source', 'trial_reel_production',
    'studio_comments', 'studio_quick_links', 'studio_dropdown_options',
    -- already RLS-correct, but anon has no business here either
    'studio_videos', 'studio_sequences', 'studio_sessions',
    'studio_ad_creatives', 'studio_activity',
    'custom_properties', 'custom_property_options',
    'finance_people', 'finance_payments', 'profiles'
  ] loop
    execute format('revoke all on public.%I from anon;', t);
  end loop;
end $$;


-- 11) Refresh PostgREST so the new policies apply to the next request --------
notify pgrst, 'reload schema';


-- ============================================================================
-- VERIFY — run these after the file completes.
--
-- (a) No policy anywhere still applies to anon or PUBLIC. Expect ZERO rows:
--
--   select tablename, policyname, roles, cmd
--   from pg_policies
--   where schemaname = 'public'
--     and ('anon' = any(roles) or '0' = any(roles::text[]) or roles is null)
--   order by tablename;
--
-- (b) No table still has RLS switched off. Expect ZERO rows:
--
--   select c.relname
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
--   order by 1;
--
-- (c) The end-to-end check that actually matters — from a shell, with the anon
--     key, every one of these must come back with 0 rows (previously: 6, 557,
--     1, 216, 8, 854, 3, 2, 483, 5):
--
--   source .env.local
--   for t in clients posts subscriber_snapshots research_items \
--            clip_snippet clipper_accounts clipper_content \
--            comment_reads comment_reactions; do
--     printf '%-24s ' "$t"
--     curl -s -o /dev/null -w '%{http_code} ' \
--       -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
--       -H "Prefer: count=exact" -H "Range: 0-0" -D - \
--       "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/$t?select=id" 2>/dev/null
--     echo
--   done
--
--   A 401 is the ideal result (step 10 revoked the grant). A 200 with
--   content-range */0 is also fine — RLS filtering everything out. A 200 with a
--   non-zero count means this file did not take.
-- ============================================================================

-- ============================================================================
-- ORPHANED TABLES — DROPPED (phase 1 cleanup)
--
--   goals            1 row,  no .from('goals') anywhere in app/, components/ or
--                    lib/ except the DDL generator in lib/setup-db.ts
--   revenue_entries  0 rows, same
--
-- Both are gone. They were removed from requiredTables and getMigrationSQL() in
-- lib/setup-db.ts first (otherwise checkSchema() shows a "Database setup
-- required" banner the moment they vanish), then:
--
--   drop table if exists public.goals;
--   drop table if exists public.revenue_entries;
--
-- Every array in this file that named them was pruned at the same time — an
-- `alter table public.goals ...` against a dropped table aborts the whole
-- script, and this file is meant to stay re-runnable.
-- ============================================================================
