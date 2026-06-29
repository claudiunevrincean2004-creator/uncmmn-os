-- ============================================================================
-- NATHAN OS — Type property for Filming Sessions
-- Adds a select column to studio_sessions distinguishing "Scripted" sessions
-- from "Raw talk" sessions. New sessions default to 'scripted'; the UI
-- normalizes the value to its canonical "Scripted" / "Raw talk" pill label.
-- Run AFTER schema.sql. Safe to re-run (idempotent).
-- ============================================================================

alter table public.studio_sessions add column if not exists type text default 'scripted';
