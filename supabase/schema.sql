-- NATHAN OS — Supabase Schema
-- Run this in your Supabase SQL editor

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  niche text,
  platforms text[] default '{}',
  created_at timestamptz default now()
);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  title text not null,
  platform text,
  format text,
  pillar text,
  date date,
  views numeric default 0,
  likes numeric default 0,
  comments numeric default 0,
  shares numeric default 0,
  saves numeric default 0,
  follows numeric default 0,
  drive_link text,
  post_url text,
  created_at timestamptz default now()
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  current_val numeric default 0,
  target_val numeric default 0,
  platform text default 'All',
  created_at timestamptz default now()
);

create table if not exists drive_folders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  url text,
  category text,
  created_at timestamptz default now()
);

-- Subscriber snapshots (populated by external Google Apps Script every 12h)
create table if not exists subscriber_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  platform text not null,
  subscriber_count numeric default 0,
  date date not null,
  created_at timestamptz default now()
);

-- Research items: saved content references (Research tab)
create table if not exists research_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  title text not null,
  content text,
  note text,
  reason text,
  hot boolean default false,
  status text default 'unused',
  created_at timestamptz default now()
);

-- Revenue entries for profit share tracking
create table if not exists revenue_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  amount numeric default 0,
  source text,
  notes text,
  created_at timestamptz default now()
);

-- Studio — Video Review
-- `account` names which account the video is for ('Nathan', 'Eden'). The UI for
-- it was pulled, so nothing reads or writes this today — the column and its data
-- are kept deliberately (see supabase/studio_videos_account.sql) so the repo
-- still matches production.
create table if not exists studio_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  account text,
  format text,
  assigned_to text,
  assigned_to_user_id uuid,
  status text default 'Scripting',
  priority text default 'Normal',
  brief_url text,
  raw_files_url text,
  final_url text,
  deadline date,
  notes text,
  revision_count integer default 0,
  created_at timestamptz default now()
);

-- Studio — Story Sequences
create table if not exists studio_sequences (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text default 'Draft',
  final_url text,
  scheduled_date date,
  platform text,
  notes text,
  created_at timestamptz default now()
);

-- Studio — Filming Sessions
create table if not exists studio_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text default 'Scripted',
  script_url text,
  footage_link text,
  date date,
  location text,
  status text default 'Planned',
  videos_planned integer default 0,
  videos_filmed integer default 0,
  notes text,
  created_at timestamptz default now()
);
-- Migrate older installs of studio_sessions to the new columns
alter table studio_sessions add column if not exists footage_link text;
alter table studio_sessions add column if not exists type text default 'Scripted';

-- Studio — Ad Creative pipeline
create table if not exists studio_ad_creatives (
  id uuid primary key default gen_random_uuid(),
  creative_id text,
  date_added date default current_date,
  ad_format text,
  angle text,
  hook text,
  buyer_feedback text,
  status text default 'Paused',
  source_video_title text,
  source_video_url text,
  cta_type text,
  custom_cta text,
  creative_url text,
  platform text,
  deadline date,
  notes text,
  assigned_to text,
  assigned_to_user_id uuid,
  created_at timestamptz default now()
);
-- Migrate older installs of studio_ad_creatives to the new columns
alter table studio_ad_creatives add column if not exists creative_id text;
alter table studio_ad_creatives add column if not exists date_added date default current_date;
alter table studio_ad_creatives add column if not exists angle text;
alter table studio_ad_creatives add column if not exists hook text;
alter table studio_ad_creatives add column if not exists buyer_feedback text;

-- Studio — Quick links (editable per-context shortcut buttons)
create table if not exists studio_quick_links (
  id uuid primary key default gen_random_uuid(),
  context text not null,
  label text,
  url text,
  created_at timestamptz default now()
);

-- Studio — User-defined dropdown options (custom values per field)
create table if not exists studio_dropdown_options (
  id uuid primary key default gen_random_uuid(),
  field text not null,
  value text not null,
  created_at timestamptz default now()
);

-- Studio — Comments (Notion-style side panel)
create table if not exists studio_comments (
  id uuid primary key default gen_random_uuid(),
  item_type text not null,
  item_id uuid not null,
  text text not null,
  created_at timestamptz default now()
);

-- Studio — Activity log (status change history)
create table if not exists studio_activity (
  id uuid primary key default gen_random_uuid(),
  item_type text not null,
  item_id uuid not null,
  action text,
  old_value text,
  new_value text,
  created_at timestamptz default now()
);

-- Finance — payments to editors and other short-form contributors (ADMIN ONLY).
-- Payment details live on finance_people, once per person; a payment row
-- references its person and never carries a copy of the link.
create table if not exists finance_people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,                       -- free text: 'Editor', 'Clipper', 'Designer'…
  payment_link text,               -- their Wise/PayPal/Revolut link — NEVER bank details
  notes text,
  status text default 'active',    -- 'active' | 'inactive'
  -- Optional: plenty of people paid here have no OS login. Never required, and
  -- never consulted for access control.
  profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists finance_payments (
  id uuid primary key default gen_random_uuid(),
  -- restrict, not cascade: deleting someone must never silently erase what they
  -- were paid. Mark them inactive instead.
  person_id uuid references finance_people(id) on delete restrict,
  type text,                       -- 'trial' | 'retainer' | 'one_off'
  amount numeric not null,
  currency text default 'USD',     -- everything is USD; no UI reads this column
  status text,                     -- 'pending' | 'ready_to_pay' | 'paid'
  due_date date,
  paid_date date,
  invoice_url text,
  description text,
  notes text,
  -- Set when the "ready to pay" Slack ping delivers; null = never pinged. Guards
  -- against duplicate pings, and is only ever cleared by the panel's Resend.
  notified_at timestamptz,
  created_at timestamptz default now(),
  -- A paid payment must say WHEN it was paid: a null paid_date anchors the row
  -- to no month, so every dated period in the UI filters it out and the row
  -- becomes invisible — and undeletable from the tab.
  constraint finance_payments_paid_needs_date
    check (status is distinct from 'paid' or paid_date is not null)
);
-- Top-up for an install that predates the constraint. FAILS while any row has
-- status = 'paid' with a null paid_date — clean those up first; the recipes are
-- at the bottom of supabase/finance.sql.
alter table finance_payments
  drop constraint if exists finance_payments_paid_needs_date;
alter table finance_payments
  add constraint finance_payments_paid_needs_date
  check (status is distinct from 'paid' or paid_date is not null);
-- Top-up for an install that predates the Slack ping bookkeeping.
alter table finance_payments add column if not exists notified_at timestamptz;
create index if not exists finance_payments_person_idx on finance_payments (person_id);
create index if not exists finance_payments_status_idx on finance_payments (status);
create index if not exists finance_payments_due_date_idx on finance_payments (due_date);

-- Disable RLS for simplicity (enable and add policies for production)
alter table clients disable row level security;
alter table posts disable row level security;
alter table goals disable row level security;
alter table drive_folders disable row level security;
alter table subscriber_snapshots disable row level security;
alter table research_items disable row level security;
alter table revenue_entries disable row level security;

-- Studio tables: RLS enabled with anon access policies
alter table studio_videos enable row level security;
drop policy if exists "anon_all_studio_videos" on studio_videos;
create policy "anon_all_studio_videos" on studio_videos for all to anon using (true) with check (true);

alter table studio_sequences enable row level security;
drop policy if exists "anon_all_studio_sequences" on studio_sequences;
create policy "anon_all_studio_sequences" on studio_sequences for all to anon using (true) with check (true);

alter table studio_sessions enable row level security;
drop policy if exists "anon_all_studio_sessions" on studio_sessions;
create policy "anon_all_studio_sessions" on studio_sessions for all to anon using (true) with check (true);

alter table studio_ad_creatives enable row level security;
drop policy if exists "anon_all_studio_ad_creatives" on studio_ad_creatives;
create policy "anon_all_studio_ad_creatives" on studio_ad_creatives for all to anon using (true) with check (true);

alter table studio_comments enable row level security;
drop policy if exists "anon_all_studio_comments" on studio_comments;
create policy "anon_all_studio_comments" on studio_comments for all to anon using (true) with check (true);

alter table studio_activity enable row level security;
drop policy if exists "anon_all_studio_activity" on studio_activity;
create policy "anon_all_studio_activity" on studio_activity for all to anon using (true) with check (true);

alter table studio_quick_links enable row level security;
drop policy if exists "Allow all for anon" on studio_quick_links;
create policy "Allow all for anon" on studio_quick_links for all using (true) with check (true);

alter table studio_dropdown_options enable row level security;
drop policy if exists "Allow all for anon" on studio_dropdown_options;
create policy "Allow all for anon" on studio_dropdown_options for all using (true) with check (true);

-- Finance: ADMIN ONLY, deliberately stricter than the studio_* tables above.
-- Editors have logins, so a `to authenticated` policy would expose everyone's
-- pay to everyone. public.is_admin() comes from auth_setup.sql — run that first.
alter table finance_people enable row level security;
drop policy if exists "finance_people_admin_all" on finance_people;
create policy "finance_people_admin_all" on finance_people
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table finance_payments enable row level security;
drop policy if exists "finance_payments_admin_all" on finance_payments;
create policy "finance_payments_admin_all" on finance_payments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
