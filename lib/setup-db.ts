import { supabase } from './supabase';

export async function checkSchema(): Promise<{ missing: string[]; postColumnsMissing: string[]; researchColumnsMissing: string[] }> {
  const requiredTables = [
    'clients', 'posts', 'goals', 'drive_folders',
    'subscriber_snapshots', 'research_items', 'revenue_entries',
  ];

  const missing: string[] = [];
  for (const table of requiredTables) {
    const { error } = await supabase.from(table).select('id').limit(0);
    if (error && error.code === 'PGRST205') {
      missing.push(table);
    }
  }

  const postColumnsMissing: string[] = [];
  if (!missing.includes('posts')) {
    const { data } = await supabase.from('posts').select('*').limit(1);
    if (data && data.length > 0) {
      const cols = Object.keys(data[0]);
      if (!cols.includes('post_url')) postColumnsMissing.push('post_url');
    }
  }

  const researchColumnsMissing: string[] = [];
  if (!missing.includes('research_items')) {
    const { data } = await supabase.from('research_items').select('*').limit(1);
    if (data && data.length > 0) {
      const cols = Object.keys(data[0]);
      if (!cols.includes('title')) researchColumnsMissing.push('title');
    }
  }

  return { missing, postColumnsMissing, researchColumnsMissing };
}

export function getMigrationSQL(missing: string[], postColumnsMissing: string[] = [], researchColumnsMissing: string[] = []): string {
  const parts: string[] = [];

  if (missing.includes('clients')) {
    parts.push(`create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  niche text,
  platforms text[] default '{}',
  created_at timestamptz default now()
);
alter table clients disable row level security;`);
  }

  if (missing.includes('posts')) {
    parts.push(`create table if not exists posts (
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
alter table posts disable row level security;`);
  }

  if (missing.includes('goals')) {
    parts.push(`create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  current_val numeric default 0,
  target_val numeric default 0,
  platform text default 'All',
  created_at timestamptz default now()
);
alter table goals disable row level security;`);
  }

  if (missing.includes('drive_folders')) {
    parts.push(`create table if not exists drive_folders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  url text,
  category text,
  created_at timestamptz default now()
);
alter table drive_folders disable row level security;`);
  }

  if (missing.includes('subscriber_snapshots')) {
    parts.push(`create table if not exists subscriber_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  platform text not null,
  subscriber_count numeric default 0,
  date date not null,
  created_at timestamptz default now()
);
alter table subscriber_snapshots disable row level security;`);
  }

  if (missing.includes('research_items')) {
    parts.push(`create table if not exists research_items (
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
alter table research_items disable row level security;`);
  }

  if (missing.includes('revenue_entries')) {
    parts.push(`create table if not exists revenue_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  amount numeric default 0,
  source text,
  notes text,
  created_at timestamptz default now()
);
alter table revenue_entries disable row level security;`);
  }

  if (researchColumnsMissing.includes('title')) {
    parts.push(`alter table research_items add column if not exists title text;
update research_items set title = coalesce(nullif(title, ''), left(coalesce(content, 'Untitled'), 80)) where title is null or title = '';`);
  }

  if (postColumnsMissing.includes('post_url')) {
    parts.push(`alter table posts add column if not exists post_url text;`);
  }

  return parts.join('\n\n');
}
