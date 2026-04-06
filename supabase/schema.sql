-- UNCMMN OS – Supabase Schema
-- Run this in your Supabase SQL editor

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  niche text,
  retainer numeric default 0,
  cost numeric default 0,
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

create table if not exists hooks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  text text not null,
  category text default 'Uncategorized',
  rating integer default 3,
  created_at timestamptz default now()
);

create table if not exists formats (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  platform text,
  avg_views numeric default 0,
  avg_eng numeric default 0,
  notes text,
  created_at timestamptz default now()
);

create table if not exists pillars (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  description text,
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

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cost numeric default 0,
  category text,
  created_at timestamptz default now()
);

-- Monthly revenue overrides per client
create table if not exists monthly_revenue (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  month text not null,  -- YYYY-MM
  amount numeric default 0,
  created_at timestamptz default now()
);

-- Monthly operational expenses
create table if not exists monthly_expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cost numeric default 0,
  category text,
  month text not null,  -- YYYY-MM
  created_at timestamptz default now()
);

-- Per-client expenses (video editor, project manager, ads, tools, etc.)
create table if not exists client_expenses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  amount numeric default 0,
  category text,
  month text not null,  -- YYYY-MM
  created_at timestamptz default now()
);

-- Client-month exclusions (hide a client from a specific month's financials)
create table if not exists client_month_exclusions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  month text not null,  -- YYYY-MM
  created_at timestamptz default now(),
  unique(client_id, month)
);

-- Add new columns to clients (safe with if not exists via DO block)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='clients' and column_name='status') then
    alter table clients add column status text default 'Active';
  end if;
  if not exists (select 1 from information_schema.columns where table_name='clients' and column_name='renewal_date') then
    alter table clients add column renewal_date date;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='clients' and column_name='notes') then
    alter table clients add column notes text;
  end if;
end $$;

-- Disable RLS for simplicity (enable and add policies for production)
alter table clients disable row level security;
alter table posts disable row level security;
alter table goals disable row level security;
alter table hooks disable row level security;
alter table formats disable row level security;
alter table pillars disable row level security;
alter table drive_folders disable row level security;
alter table expenses disable row level security;
alter table monthly_revenue disable row level security;
alter table monthly_expenses disable row level security;
alter table client_expenses disable row level security;
alter table client_month_exclusions disable row level security;
