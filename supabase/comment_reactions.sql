-- ============================================================================
-- UNCMMN OS — Comment reactions (emoji reactions on Studio comments)
--
-- One row per (comment, user, emoji): a person reacting to a comment with an
-- emoji. Anyone can react to their own or others' comments. The unique
-- (comment_id, user_id, emoji) constraint (the composite primary key) means one
-- person can't stack the same emoji twice on the same comment — a second add is
-- a no-op / the toggle removes it. A person CAN add different emojis to the same
-- comment (each is its own row), and many people can add the same emoji (each
-- counts once → the pill shows "✅ 3").
--
-- Plain uuid columns (no FK on user_id, matching the FK-free style of
-- studio_comments.author_id / item_id); comment_id cascades so reactions vanish
-- when their comment is deleted. RLS matches the loose "app enforces access, not
-- the DB" style already used by studio_comments / comment_reads.
--
-- Run AFTER schema.sql and studio_comments_author.sql. Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.comment_reactions (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.studio_comments(id) on delete cascade,
  user_id    uuid not null,
  emoji      text not null,
  created_at timestamptz not null default now(),
  -- One person, one emoji, one comment — can't double-add the same reaction.
  unique (comment_id, user_id, emoji)
);

-- Hot path: "give me every reaction on the comments in this panel."
create index if not exists comment_reactions_comment_idx
  on public.comment_reactions (comment_id);

-- RLS, open like the other comment tables (access is enforced in the app).
alter table public.comment_reactions enable row level security;
drop policy if exists "Allow all for anon" on public.comment_reactions;
create policy "Allow all for anon" on public.comment_reactions
  for all using (true) with check (true);

-- Refresh PostgREST's schema cache so the new table is queryable immediately.
notify pgrst, 'reload schema';
