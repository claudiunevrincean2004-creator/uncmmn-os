-- ============================================================================
-- Content OS — TikTok final link for Video Review
-- The TikTok cut ships with a different CTA from the Instagram one, so a video
-- carries two finals. studio_videos.final_url stays the Instagram version (it
-- keeps its main-table column and feeds the Slack pings unchanged); this new
-- column holds the TikTok version and is edited in the side panel only.
-- Run AFTER schema.sql. Safe to re-run (idempotent).
-- ============================================================================

alter table public.studio_videos add column if not exists tiktok_final_url text;

-- Refresh PostgREST's schema cache so writes to studio_videos.tiktok_final_url
-- take effect immediately (otherwise updates fail with PGRST204 "column not
-- found in schema cache" until the cache reloads — which looks like the field
-- reverting instead of saving).
notify pgrst, 'reload schema';
