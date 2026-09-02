-- ============================================================================
-- Content OS — Final link for Ad Creatives
-- Adds a free-text column to studio_ad_creatives for pasting a Google Drive
-- link to the final product (shown as the "Final" column, mirroring the
-- "Final" link on Story Sequences and the footage link on Filming Sessions).
-- Run AFTER schema.sql. Safe to re-run (idempotent).
-- ============================================================================

alter table public.studio_ad_creatives add column if not exists final_link text;
