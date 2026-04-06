import { supabase } from './supabase';

/**
 * Checks which tables exist and returns missing ones.
 * Call this on app load to detect schema issues early.
 */
export async function checkSchema(): Promise<{ missing: string[]; clientColumnsMissing: string[] }> {
  const requiredTables = [
    'clients', 'posts', 'goals', 'hooks', 'formats', 'pillars',
    'drive_folders', 'expenses', 'monthly_revenue', 'monthly_expenses', 'client_expenses', 'client_month_exclusions',
  ];

  const missing: string[] = [];
  for (const table of requiredTables) {
    const { error } = await supabase.from(table).select('id').limit(0);
    if (error && error.code === 'PGRST205') {
      missing.push(table);
    }
  }

  // Check if clients table has the new columns
  const clientColumnsMissing: string[] = [];
  if (!missing.includes('clients')) {
    const { data } = await supabase.from('clients').select('*').limit(1);
    if (data && data.length > 0) {
      const cols = Object.keys(data[0]);
      if (!cols.includes('status')) clientColumnsMissing.push('status');
      if (!cols.includes('renewal_date')) clientColumnsMissing.push('renewal_date');
      if (!cols.includes('notes')) clientColumnsMissing.push('notes');
      if (!cols.includes('start_date')) clientColumnsMissing.push('start_date');
    }
  }

  return { missing, clientColumnsMissing };
}

/**
 * Returns the SQL needed to fix the schema.
 */
export function getMigrationSQL(missing: string[], clientColumnsMissing: string[]): string {
  const parts: string[] = [];

  if (missing.includes('monthly_revenue')) {
    parts.push(`create table if not exists monthly_revenue (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  month text not null,
  amount numeric default 0,
  created_at timestamptz default now()
);
alter table monthly_revenue disable row level security;`);
  }

  if (missing.includes('monthly_expenses')) {
    parts.push(`create table if not exists monthly_expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cost numeric default 0,
  category text,
  month text not null,
  created_at timestamptz default now()
);
alter table monthly_expenses disable row level security;`);
  }

  if (missing.includes('client_expenses')) {
    parts.push(`create table if not exists client_expenses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  amount numeric default 0,
  category text,
  month text not null,
  created_at timestamptz default now()
);
alter table client_expenses disable row level security;`);
  }

  if (missing.includes('client_month_exclusions')) {
    parts.push(`create table if not exists client_month_exclusions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  month text not null,
  created_at timestamptz default now(),
  unique(client_id, month)
);
alter table client_month_exclusions disable row level security;`);
  }

  if (clientColumnsMissing.includes('status')) {
    parts.push(`alter table clients add column if not exists status text default 'Active';`);
  }
  if (clientColumnsMissing.includes('renewal_date')) {
    parts.push(`alter table clients add column if not exists renewal_date date;`);
  }
  if (clientColumnsMissing.includes('notes')) {
    parts.push(`alter table clients add column if not exists notes text;`);
  }
  if (clientColumnsMissing.includes('start_date')) {
    parts.push(`alter table clients add column if not exists start_date date;`);
  }

  return parts.join('\n\n');
}
