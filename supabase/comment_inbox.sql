-- ============================================================================
-- UNCMMN OS — Comment Inbox (mentions + per-user read state)
--
-- Adds the two things the sidebar Inbox needs on top of studio_comments:
--
--   1. studio_comments.mentions — the profile ids @-mentioned in a comment's
--      text. Re-derived from the body on every insert/edit (see lib/mentions.ts),
--      so it can never drift from what the comment actually says. Used to power
--      the Inbox's "Mentions" filter without re-parsing every comment client-side.
--
--   2. comment_reads — per-user read state, one row per (user, comment) the user
--      has seen. Presence of a row = read; absence = unread. A row-per-comment
--      (rather than a single last_seen_at per user) is what lets a comment posted
--      *before* your last visit still count as unread if you never opened the
--      Inbox on it, and lets "mark all read" be exact rather than a timestamp
--      race. The user's OWN comments are never counted as unread for them — that
--      is enforced in the query (author_id <> me), not here, so no rows are
--      written for self-authored comments.
--
-- Run AFTER schema.sql and studio_comments_author.sql. Safe to re-run (idempotent).
-- ============================================================================

-- 1. Mentions -----------------------------------------------------------------
alter table public.studio_comments
  add column if not exists mentions uuid[] not null default '{}';

-- "Which comments mention me?" — GIN makes the containment filter cheap once the
-- comment table grows past a few thousand rows.
create index if not exists studio_comments_mentions_idx
  on public.studio_comments using gin (mentions);

-- Newest-first is the Inbox's only sort order.
create index if not exists studio_comments_created_at_idx
  on public.studio_comments (created_at desc);

-- 2. Per-user read state ------------------------------------------------------
create table if not exists public.comment_reads (
  user_id    uuid not null,
  comment_id uuid not null references public.studio_comments(id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (user_id, comment_id)
);

-- The Inbox's hot path: every read row for the signed-in user.
create index if not exists comment_reads_user_idx
  on public.comment_reads (user_id);

-- RLS, matching the loose "app enforces access, not the DB" style already used by
-- studio_comments / studio_quick_links / studio_dropdown_options.
alter table public.comment_reads enable row level security;
drop policy if exists "all_comment_reads" on public.comment_reads;
create policy "all_comment_reads" on public.comment_reads
  for all using (true) with check (true);
