-- ============================================================================
-- Content OS — Account property for Video Review
--
-- A plain nullable text column naming which account a video belongs to
-- ('Nathan', 'Eden'). Deliberately NOT a foreign key to clients: the accounts
-- are a short fixed list owned by the app (lib/studio.ts → ACCOUNTS), not
-- customer records, so a text value keeps the column readable and free of
-- cascade/restrict semantics.
--
-- Every existing video is Nathan's, so the backfill assigns them all and the
-- script ABORTS rather than half-applying if any row is left null.
--
-- Run AFTER schema.sql. Safe to re-run (idempotent): the column add is
-- `if not exists` and the backfill only touches rows where account is null.
-- Run the whole file at once in the Supabase SQL editor.
-- ============================================================================

begin;

-- 1) The column.
alter table public.studio_videos add column if not exists account text;

-- Video Review filters on this, so index it.
create index if not exists studio_videos_account_idx on public.studio_videos (account);

-- 2) Backfill every existing video to Nathan, with before/after counts.
do $$
declare
  v_before      bigint;
  v_null_before bigint;
  v_updated     bigint;
  v_after       bigint;
  v_null_after  bigint;
begin
  select count(*), count(*) filter (where account is null)
    into v_before, v_null_before
  from public.studio_videos;

  raise notice 'BEFORE: % videos total, % with an account, % null',
    v_before, v_before - v_null_before, v_null_before;

  update public.studio_videos
     set account = 'Nathan'
   where account is null;
  get diagnostics v_updated = row_count;

  select count(*), count(*) filter (where account is null)
    into v_after, v_null_after
  from public.studio_videos;

  raise notice 'UPDATED: % rows set to Nathan', v_updated;
  raise notice 'AFTER: % videos total, % with an account, % null',
    v_after, v_after - v_null_after, v_null_after;

  -- The hard requirement: zero videos left without an account.
  if v_null_after <> 0 then
    raise exception 'Backfill incomplete — % videos still have a null account.', v_null_after;
  end if;

  if v_after <> v_before then
    raise exception 'Row count changed during backfill (% -> %). Aborting.', v_before, v_after;
  end if;
end $$;

-- 3) Refresh PostgREST's schema cache so studio_videos.account is writable
-- immediately — without this, saving the Account dropdown fails with PGRST204
-- ("column not found in schema cache") and the field just snaps back.
notify pgrst, 'reload schema';

commit;

-- ---------------------------------------------------------------------------
-- 4) Verification — run after the script. Expect null_account = 0.
-- ---------------------------------------------------------------------------
-- select
--   (select count(*) from public.studio_videos)                        as videos_total,
--   (select count(*) from public.studio_videos where account is null)  as null_account;
--
-- select coalesce(account, '(null)') as account, count(*) as videos
--   from public.studio_videos
--  group by 1
--  order by 2 desc;
