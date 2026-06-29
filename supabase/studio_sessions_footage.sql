-- ============================================================================
-- NATHAN OS — Footage link for Filming Sessions
-- Adds a free-text column to studio_sessions for pasting a Google Drive link
-- to the raw footage filmed during a session.
-- Run AFTER schema.sql. Safe to re-run (idempotent).
-- ============================================================================

alter table public.studio_sessions add column if not exists footage_link text;
