-- ============================================================================
-- PHASE 1 CLEANUP
--
-- Run these four steps IN ORDER, in the Supabase SQL editor. Each is a single
-- transaction; every destructive one aborts loudly rather than doing half a job.
--
--   1. Drop 13 dead columns from clients
--   2. Delete the 5 duplicate client rows (guarded)
--   3. Drop the orphaned goals + revenue_entries tables
--   4. Top up the posts platform-id columns
--
-- Code prerequisites, already merged:
--   - app/page.tsx no longer inserts a client when the clients query FAILS
--     (a failed query returns [], which is what created the 5 duplicates).
--   - lib/setup-db.ts no longer lists goals / revenue_entries in requiredTables
--     or getMigrationSQL(), so step 3 cannot trigger a "Database setup required"
--     banner.
--   - lib/types.ts no longer declares RevenueEntry.
-- ============================================================================


-- ============================================================================
-- STEP 1 — DROP THE 13 DEAD COLUMNS FROM clients
--
-- Leftovers from an abandoned agency/CRM model. None appear in the Client type
-- in lib/types.ts, and none are read or written anywhere in app/, components/
-- or lib/. `if exists` so this is re-runnable.
-- ============================================================================
alter table public.clients
  drop column if exists retainer,
  drop column if exists cost,
  drop column if exists billing_type,
  drop column if exists client_type,
  drop column if exists payment_status,
  drop column if exists project_status,
  drop column if exists project_description,
  drop column if exists renewal_date,
  drop column if exists start_date,
  drop column if exists inactive_date,
  drop column if exists deadline,
  drop column if exists status,
  drop column if exists notes;

-- Verify: should return exactly id, name, niche, platforms, created_at.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'clients'
order by ordinal_position;


-- ============================================================================
-- STEP 2 — DELETE THE 5 DUPLICATE CLIENT ROWS
--
-- Keep 0418e87c… (created 2026-04-03). The other five were auto-provisioned by
-- the app.page.tsx bug, one per transient query failure.
--
-- THE GUARD MATTERS: every client_id FK below is `on delete cascade`, so a
-- plain DELETE on a duplicate that turned out to own rows would silently take
-- posts / research items / drive folders / snapshots with it. This block
-- discovers the referencing tables from pg_constraint rather than a hard-coded
-- list, so a table added since this was written cannot be missed — it covers
-- posts, research_items, drive_folders, subscriber_snapshots and goals today.
-- Any non-zero count aborts the transaction and deletes nothing.
--
-- Run STEP 2 BEFORE STEP 3: goals must still exist for the guard to check it.
-- ============================================================================
do $$
declare
  keep_id uuid;
  n       bigint;
  cnt     bigint;
  r       record;
  blocked text := '';
begin
  -- 2a) Resolve the keeper. Exactly one row may match the prefix.
  select count(*) into n from public.clients where id::text like '0418e87c%';
  if n <> 1 then
    raise exception
      'Expected exactly 1 client with id prefix 0418e87c, found %. Nothing deleted.', n;
  end if;
  select id into keep_id from public.clients where id::text like '0418e87c%';

  -- 2b) Confirm the table is in the state this script was written for.
  select count(*) into n from public.clients;
  if n <> 6 then
    raise exception
      'Expected 6 client rows (1 keeper + 5 duplicates), found %. Nothing deleted.', n;
  end if;

  -- 2c) Guard: nothing anywhere may reference a row we are about to delete.
  for r in
    select con.conrelid::regclass::text as child_table,
           att.attname                  as child_column
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum   = con.conkey[1]
    where con.contype  = 'f'
      and con.confrelid = 'public.clients'::regclass
      and array_length(con.conkey, 1) = 1
    order by 1
  loop
    execute format(
      'select count(*) from %s where %I is not null and %I <> $1',
      r.child_table, r.child_column, r.child_column
    ) into cnt using keep_id;

    if cnt > 0 then
      blocked := blocked
        || format('  %s.%s: %s row(s)%s', r.child_table, r.child_column, cnt, chr(10));
    end if;
  end loop;

  if blocked <> '' then
    raise exception E'ABORTED — rows still reference a client marked for deletion:\n%', blocked;
  end if;

  -- 2d) Safe to delete.
  delete from public.clients where id <> keep_id;

  select count(*) into n from public.clients;
  if n <> 1 then
    raise exception 'Post-delete check failed: % client rows remain.', n;
  end if;

  raise notice 'Kept client %. 5 duplicates deleted.', keep_id;
end $$;

-- Verify: one row, created 2026-04-03.
select id, name, created_at from public.clients;


-- ============================================================================
-- STEP 3 — DROP THE ORPHANED TABLES
--
-- goals (1 row) and revenue_entries (0 rows): no .from() call anywhere in the
-- app. `restrict`, not `cascade` — if something turns out to depend on either,
-- this must fail rather than take the dependent with it.
-- ============================================================================
drop table if exists public.goals restrict;
drop table if exists public.revenue_entries restrict;


-- ============================================================================
-- STEP 4 — posts PLATFORM-ID COLUMNS
--
-- Production already carries these (written by the external analytics Apps
-- Script); supabase/schema.sql did not. No-ops on the live database — here so
-- a fresh install from the repo lands in the same shape.
-- ============================================================================
alter table public.posts add column if not exists tiktok_id text;
alter table public.posts add column if not exists youtube_id text;
alter table public.posts add column if not exists instagram_id text;


-- ============================================================================
-- FINAL VERIFICATION — all three should come back clean.
-- ============================================================================
-- (a) clients has exactly 5 columns and 1 row:
select (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'clients')  as client_columns,  -- 5
       (select count(*) from public.clients)                        as client_rows;    -- 1

-- (b) goals / revenue_entries are gone:
select to_regclass('public.goals')           as goals,            -- null
       to_regclass('public.revenue_entries') as revenue_entries;  -- null

-- (c) nothing was orphaned or cascaded away — every client_id points at the
--     surviving client:
select 'posts' as t, count(*) from public.posts
  where client_id is not null and client_id not in (select id from public.clients)
union all select 'research_items', count(*) from public.research_items
  where client_id is not null and client_id not in (select id from public.clients)
union all select 'drive_folders', count(*) from public.drive_folders
  where client_id is not null and client_id not in (select id from public.clients)
union all select 'subscriber_snapshots', count(*) from public.subscriber_snapshots
  where client_id is not null and client_id not in (select id from public.clients);
