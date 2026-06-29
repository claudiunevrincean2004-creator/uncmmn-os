-- ============================================================================
-- NATHAN OS — Type property for Filming Sessions
-- Adds an admin-editable select "Type" to Filming Sessions, stored the same way
-- as Status: the chosen value lives in studio_sessions.type, while the options
-- (label + color + order) live in studio_dropdown_options under the
-- 'session_type' field, managed via the existing FieldOptionsManager.
-- Run AFTER schema.sql (and ideally builtin_options_and_assignees.sql).
-- Safe to re-run (idempotent).
-- ============================================================================

-- 1) Per-row stored value
alter table public.studio_sessions add column if not exists type text default 'Scripted';

-- 2) Ensure the editable-options metadata exists (no-op if already added by
--    builtin_options_and_assignees.sql) so the seed below is valid standalone.
alter table public.studio_dropdown_options add column if not exists color text;
alter table public.studio_dropdown_options add column if not exists position int not null default 0;
create unique index if not exists studio_dropdown_options_field_value_key
  on public.studio_dropdown_options (field, value);

-- 3) Seed two starter options so the select isn't empty; admins can then
--    add/rename/remove/reorder and recolor them at will.
insert into public.studio_dropdown_options (field, value, color, position) values
  ('session_type', 'Scripted', '#8b5cf6', 0),
  ('session_type', 'Raw talk', '#14b8a6', 1)
on conflict (field, value) do nothing;

-- 4) Refresh PostgREST's schema cache so writes to studio_sessions.type take
--    effect immediately (otherwise updates fail with PGRST204 "column not found
--    in schema cache" until the cache reloads — which looks like the Type cell
--    reverting instead of saving).
notify pgrst, 'reload schema';
