-- ============================================================================
-- Content OS — Threaded replies on comments (single-level threading)
--
-- Adds studio_comments.parent_comment_id, a nullable self-reference:
--
--   * NULL              → a top-level comment (everything that exists today).
--   * <a comment's id>  → a reply, shown nested under that comment.
--
-- SINGLE-LEVEL BY DESIGN. Replies attach to a TOP-LEVEL comment only; replying
-- to a reply attaches to that reply's parent, so a thread is never deeper than
-- two rows. The UI already does this, and the trigger below enforces it at the
-- DB level so an import/script/psql session can't create a deeper chain that the
-- UI would then be unable to render.
--
-- DELETE SEMANTICS: `on delete cascade`. Deleting a top-level comment deletes its
-- replies with it — no "[deleted]" tombstones. Reactions (comment_reactions) and
-- read state (comment_reads) already cascade off studio_comments.id, so removing
-- a thread cleans up every row it owns in one statement, and the Inbox can never
-- list a reply whose parent is gone.
--
-- Replies are ordinary studio_comments rows: same item_type/item_id as their
-- parent, so they carry mentions, reactions, edit/delete and inbox unread state
-- with no extra plumbing.
--
-- Run AFTER schema.sql, studio_comments_author.sql and comment_inbox.sql.
-- Safe to re-run (idempotent).
-- ============================================================================

-- 1. The self-reference -------------------------------------------------------
alter table public.studio_comments
  add column if not exists parent_comment_id uuid
    references public.studio_comments(id) on delete cascade;

-- Hot path: "give me the replies for the comments in this panel."
create index if not exists studio_comments_parent_idx
  on public.studio_comments (parent_comment_id);

-- 2. Enforce single-level threading -------------------------------------------
-- Normalises rather than rejects: pointing a reply at another reply silently
-- re-points it at that reply's top-level parent (the same collapse the UI does),
-- and a row can never be its own parent.
create or replace function public.studio_comments_flatten_thread()
returns trigger
language plpgsql
as $$
begin
  if new.parent_comment_id is not null then
    if new.parent_comment_id = new.id then
      -- Self-parenting would render as a thread that contains itself.
      new.parent_comment_id := null;
    else
      select coalesce(p.parent_comment_id, p.id)
        into new.parent_comment_id
        from public.studio_comments p
       where p.id = new.parent_comment_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists studio_comments_flatten_thread_trg on public.studio_comments;
create trigger studio_comments_flatten_thread_trg
  before insert or update of parent_comment_id on public.studio_comments
  for each row execute function public.studio_comments_flatten_thread();

-- 3. Flatten anything that predates the trigger -------------------------------
-- No-op on a fresh install; only matters if replies were written by hand before
-- the trigger existed.
update public.studio_comments c
   set parent_comment_id = p.parent_comment_id
  from public.studio_comments p
 where c.parent_comment_id = p.id
   and p.parent_comment_id is not null;

-- Refresh PostgREST's schema cache so writes to the new column don't fail with
-- PGRST204 ("column not found in schema cache") until the next reload.
notify pgrst, 'reload schema';
