import { supabase } from './supabase';

export async function checkSchema(): Promise<{ missing: string[]; postColumnsMissing: string[]; researchColumnsMissing: string[]; adColumnsMissing: string[]; dropdownColsMissing: boolean }> {
  const requiredTables = [
    'clients', 'posts', 'goals', 'drive_folders',
    'subscriber_snapshots', 'research_items', 'revenue_entries',
    'studio_videos', 'studio_sequences', 'studio_sessions',
    'studio_ad_creatives', 'studio_comments', 'studio_activity',
    'studio_quick_links', 'studio_dropdown_options',
    'custom_properties',
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

  // New columns added to the (already-existing) studio_ad_creatives table.
  // Probe each column directly so we detect them even when the table is empty.
  const adColumnsMissing: string[] = [];
  if (!missing.includes('studio_ad_creatives')) {
    for (const col of ['creative_id', 'date_added', 'angle', 'hook', 'buyer_feedback']) {
      const { error } = await supabase.from('studio_ad_creatives').select(col).limit(0);
      if (error && (error.code === '42703' || error.code === 'PGRST204' || /column/i.test(error.message))) {
        adColumnsMissing.push(col);
      }
    }
  }

  // Built-in Format/Status options become DB-backed: detect the `color` column.
  let dropdownColsMissing = false;
  if (!missing.includes('studio_dropdown_options')) {
    const { error } = await supabase.from('studio_dropdown_options').select('color').limit(0);
    if (error && (error.code === '42703' || error.code === 'PGRST204' || /column/i.test(error.message))) {
      dropdownColsMissing = true;
    }
  }

  return { missing, postColumnsMissing, researchColumnsMissing, adColumnsMissing, dropdownColsMissing };
}

export function getMigrationSQL(missing: string[], postColumnsMissing: string[] = [], researchColumnsMissing: string[] = [], adColumnsMissing: string[] = [], dropdownColsMissing = false): string {
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

  if (missing.includes('studio_videos')) {
    parts.push(`create table if not exists studio_videos (
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
alter table studio_videos enable row level security;
drop policy if exists "anon_all_studio_videos" on studio_videos;
create policy "anon_all_studio_videos" on studio_videos for all to anon using (true) with check (true);`);
  }

  if (missing.includes('studio_sequences')) {
    parts.push(`create table if not exists studio_sequences (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text default 'Draft',
  final_url text,
  scheduled_date date,
  platform text,
  notes text,
  created_at timestamptz default now()
);
alter table studio_sequences enable row level security;
drop policy if exists "anon_all_studio_sequences" on studio_sequences;
create policy "anon_all_studio_sequences" on studio_sequences for all to anon using (true) with check (true);`);
  }

  if (missing.includes('studio_sessions')) {
    parts.push(`create table if not exists studio_sessions (
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
alter table studio_sessions enable row level security;
drop policy if exists "anon_all_studio_sessions" on studio_sessions;
create policy "anon_all_studio_sessions" on studio_sessions for all to anon using (true) with check (true);`);
  }

  if (missing.includes('studio_ad_creatives')) {
    parts.push(`create table if not exists studio_ad_creatives (
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
  created_at timestamptz default now()
);
alter table studio_ad_creatives enable row level security;
drop policy if exists "anon_all_studio_ad_creatives" on studio_ad_creatives;
create policy "anon_all_studio_ad_creatives" on studio_ad_creatives for all to anon using (true) with check (true);`);
  }

  if (missing.includes('studio_comments')) {
    parts.push(`create table if not exists studio_comments (
  id uuid primary key default gen_random_uuid(),
  item_type text not null,
  item_id uuid not null,
  text text not null,
  created_at timestamptz default now()
);
alter table studio_comments enable row level security;
drop policy if exists "anon_all_studio_comments" on studio_comments;
create policy "anon_all_studio_comments" on studio_comments for all to anon using (true) with check (true);`);
  }

  if (missing.includes('studio_activity')) {
    parts.push(`create table if not exists studio_activity (
  id uuid primary key default gen_random_uuid(),
  item_type text not null,
  item_id uuid not null,
  action text,
  old_value text,
  new_value text,
  created_at timestamptz default now()
);
alter table studio_activity enable row level security;
drop policy if exists "anon_all_studio_activity" on studio_activity;
create policy "anon_all_studio_activity" on studio_activity for all to anon using (true) with check (true);`);
  }

  if (missing.includes('studio_quick_links')) {
    parts.push(`create table if not exists studio_quick_links (
  id uuid primary key default gen_random_uuid(),
  context text not null,
  label text,
  url text,
  created_at timestamptz default now()
);
alter table studio_quick_links enable row level security;
drop policy if exists "Allow all for anon" on studio_quick_links;
create policy "Allow all for anon" on studio_quick_links for all using (true) with check (true);`);
  }

  if (missing.includes('studio_dropdown_options')) {
    parts.push(`create table if not exists studio_dropdown_options (
  id uuid primary key default gen_random_uuid(),
  field text not null,
  value text not null,
  created_at timestamptz default now()
);
alter table studio_dropdown_options enable row level security;
drop policy if exists "Allow all for anon" on studio_dropdown_options;
create policy "Allow all for anon" on studio_dropdown_options for all using (true) with check (true);`);
  }

  // New columns on the existing studio_ad_creatives table
  if (adColumnsMissing.length > 0) {
    const colTypes: Record<string, string> = {
      creative_id: 'text',
      date_added: 'date default current_date',
      angle: 'text',
      hook: 'text',
      buyer_feedback: 'text',
    };
    parts.push(adColumnsMissing.map(c => `alter table studio_ad_creatives add column if not exists ${c} ${colTypes[c]};`).join('\n'));
  }

  if (researchColumnsMissing.includes('title')) {
    parts.push(`alter table research_items add column if not exists title text;
update research_items set title = coalesce(nullif(title, ''), left(coalesce(content, 'Untitled'), 80)) where title is null or title = '';`);
  }

  if (postColumnsMissing.includes('post_url')) {
    parts.push(`alter table posts add column if not exists post_url text;`);
  }

  if (missing.includes('custom_properties')) {
    parts.push(`-- Custom SELECT properties for Studio tables (requires public.is_admin() from auth_setup.sql)
create table if not exists custom_properties (
  id uuid primary key default gen_random_uuid(),
  table_key text not null,
  name text not null,
  position int not null default 0,
  created_at timestamptz default now()
);
create table if not exists custom_property_options (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references custom_properties(id) on delete cascade,
  label text not null,
  color text,
  position int not null default 0,
  created_at timestamptz default now()
);
alter table studio_sequences   add column if not exists custom_values jsonb not null default '{}'::jsonb;
alter table studio_sessions     add column if not exists custom_values jsonb not null default '{}'::jsonb;
alter table studio_ad_creatives add column if not exists custom_values jsonb not null default '{}'::jsonb;
alter table custom_properties enable row level security;
drop policy if exists "custom_properties_read" on custom_properties;
create policy "custom_properties_read" on custom_properties for select to authenticated using (true);
drop policy if exists "custom_properties_admin_write" on custom_properties;
create policy "custom_properties_admin_write" on custom_properties for all to authenticated using (public.is_admin()) with check (public.is_admin());
alter table custom_property_options enable row level security;
drop policy if exists "custom_property_options_read" on custom_property_options;
create policy "custom_property_options_read" on custom_property_options for select to authenticated using (true);
drop policy if exists "custom_property_options_admin_write" on custom_property_options;
create policy "custom_property_options_admin_write" on custom_property_options for all to authenticated using (public.is_admin()) with check (public.is_admin());`);
  }

  if (dropdownColsMissing) {
    parts.push(`-- Make built-in Format/Status options editable (color + ordering) and seed defaults
alter table studio_dropdown_options add column if not exists color text;
alter table studio_dropdown_options add column if not exists position int not null default 0;
create unique index if not exists studio_dropdown_options_field_value_key on studio_dropdown_options (field, value);
insert into studio_dropdown_options (field, value, color, position) values
  ('video_status','Scripting','#6b7280',0),('video_status','Recording','#3b82f6',1),('video_status','Raw Footage Ready','#eab308',2),('video_status','Editing','#f59e0b',3),('video_status','In Review','#8b5cf6',4),('video_status','Revision Requested','#ef4444',5),('video_status','Ad Variation Needed','#ec4899',6),('video_status','Approved','#10b981',7),('video_status','Posted','#14b8a6',8),
  ('video_format','Short',null,0),('video_format','Long Form',null,1),('video_format','Reel',null,2),('video_format','Story',null,3),('video_format','Other',null,4),
  ('sequence_status','Draft','#6b7280',0),('sequence_status','Ready for Review','#8b5cf6',1),('sequence_status','Revision Requested','#ef4444',2),('sequence_status','Approved','#10b981',3),('sequence_status','Posted','#14b8a6',4),
  ('session_status','Planned','#6b7280',0),('session_status','Confirmed','#3b82f6',1),('session_status','Filming','#f59e0b',2),('session_status','Filmed','#10b981',3),('session_status','Cancelled','#ef4444',4),
  ('ad_status','Live','#10b981',0),('ad_status','Paused','#eab308',1),('ad_status','Winner','#14b8a6',2),('ad_status','Killed','#ef4444',3),('ad_status','Revision Requested','#f59e0b',4),
  ('ad_format','Video',null,0),('ad_format','Static',null,1)
on conflict (field, value) do nothing;`);
  }

  return parts.join('\n\n');
}
