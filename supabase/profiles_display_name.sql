-- ============================================================================
-- NATHAN OS — Display name for profiles
-- Adds a free-text display name used wherever a user's name is shown (assignee
-- picker, comment authors). When empty, the UI falls back to the capitalized
-- email prefix. Run AFTER schema.sql / auth_setup.sql. Safe to re-run.
-- ============================================================================

alter table public.profiles add column if not exists display_name text;
