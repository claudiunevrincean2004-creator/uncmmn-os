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
create table if not exists studio_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  format text,
  assigned_to text,
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
  script_url text,
  date date,
  location text,
  status text default 'Planned',
  videos_planned integer default 0,
  videos_filmed integer default 0,
  notes text,
  created_at timestamptz default now()
);

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
