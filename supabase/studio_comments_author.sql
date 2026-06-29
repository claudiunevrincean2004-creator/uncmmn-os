-- ============================================================================
-- NATHAN OS — Comment authors
-- Records who left each Studio comment so the UI can show the author and let a
-- user edit their own comments (admins can still delete any). Plain uuid column
-- (matching the loose, FK-free style of item_id) holding the author's profile /
-- auth user id. Existing rows keep a null author (shown without an author).
-- Run AFTER schema.sql. Safe to re-run (idempotent).
-- ============================================================================

alter table public.studio_comments add column if not exists author_id uuid;
