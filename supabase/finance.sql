-- ============================================================================
-- UNCMMN OS — Finance (admin-only): payments to editors & short-form contributors
--
-- Run this in the Supabase SQL Editor, AFTER auth_setup.sql (it defines the
-- public.is_admin() helper these policies depend on) and after profiles exists.
-- Safe to re-run (idempotent).
--
-- ACCESS: these two tables are ADMIN-ONLY at the RLS layer — `using
-- (public.is_admin())`, NOT `to authenticated`. That is deliberately STRICTER
-- than the studio_* tables in auth_setup.sql: editors and clippers have real
-- logins, so an authenticated-wide policy would show every contributor
-- everyone else's pay. The UI is gated by the same profiles.role check the
-- Clippers tab uses (lib/auth-config.ts → Sidebar + app/page.tsx); this file is
-- the second, authoritative half of that gate.
--
-- SHAPE: payment details live ONCE, on finance_people. A payment row references
-- its person and never carries a copy of the link.
-- ============================================================================

-- 1) finance_people — one row per person who gets paid ----------------------
create table if not exists public.finance_people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,                       -- free text: 'Editor', 'Clipper', 'Designer'…
  payment_link text,               -- their Wise/PayPal/Revolut link — NEVER bank details
  notes text,
  status text default 'active',    -- 'active' | 'inactive'
  -- Optional link to an OS login. Plenty of people paid here have no account,
  -- so this is never required — and it is never consulted for access control,
  -- which is profiles.role's job alone.
  profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- Idempotent top-ups for an install that predates a column.
alter table public.finance_people add column if not exists role text;
alter table public.finance_people add column if not exists payment_link text;
alter table public.finance_people add column if not exists notes text;
alter table public.finance_people add column if not exists status text default 'active';
alter table public.finance_people add column if not exists profile_id uuid references public.profiles(id) on delete set null;

alter table public.finance_people enable row level security;
drop policy if exists "finance_people_admin_all" on public.finance_people;
create policy "finance_people_admin_all" on public.finance_people
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- 2) finance_payments — one row per payment owed -----------------------------
create table if not exists public.finance_payments (
  id uuid primary key default gen_random_uuid(),
  -- `on delete restrict`, not cascade: deleting someone must never silently
  -- erase the record of what they were paid. The UI blocks the delete and tells
  -- the admin to mark them inactive instead.
  person_id uuid references public.finance_people(id) on delete restrict,
  type text,                       -- 'trial' | 'retainer' | 'one_off'
  amount numeric not null,
  -- Kept at its 'USD' default on purpose. Everything in this tab is USD and no
  -- UI reads or writes this column; it exists so multi-currency stays possible
  -- later without a migration.
  currency text default 'USD',
  status text,                     -- 'pending' | 'ready_to_pay' | 'paid'
  due_date date,
  paid_date date,
  invoice_url text,                -- link to an invoice or payment request
  description text,
  notes text,
  created_at timestamptz default now()
);

alter table public.finance_payments add column if not exists currency text default 'USD';
alter table public.finance_payments add column if not exists paid_date date;
alter table public.finance_payments add column if not exists invoice_url text;
alter table public.finance_payments add column if not exists description text;
alter table public.finance_payments add column if not exists notes text;
-- Slack ping bookkeeping: set the first time a payment reaches Ready to Pay and
-- the #finance ping actually delivers. Null means "never pinged". Flipping a
-- payment away from ready_to_pay and back deliberately does NOT clear this — a
-- re-send is a manual act (the Resend button in the payment panel).
alter table public.finance_payments add column if not exists notified_at timestamptz;

-- INVARIANT: a paid payment must say WHEN it was paid ------------------------
-- A null paid_date anchors the row to no month, so every dated period in the UI
-- filters it out — which is how such a row becomes invisible in the tab, and
-- therefore impossible to delete from it. The UI blocks this in all three
-- places a paid_date can be written; this is the half that cannot be bypassed.
--
-- `is distinct from` rather than `<> 'paid'` so a NULL status is judged
-- explicitly (not paid → passes) instead of leaning on a NULL check result
-- being treated as satisfied.
--
-- ⚠ CLEAN UP FIRST. This statement FAILS while any violating row remains:
--     select id, amount, status, due_date, paid_date
--     from public.finance_payments
--     where status = 'paid' and paid_date is null;
--   Give each one a real date, or drop them back to 'pending'. See the block at
--   the bottom of this file.
alter table public.finance_payments
  drop constraint if exists finance_payments_paid_needs_date;
alter table public.finance_payments
  add constraint finance_payments_paid_needs_date
  check (status is distinct from 'paid' or paid_date is not null);

-- The three columns the tab filters and sorts on.
create index if not exists finance_payments_person_idx on public.finance_payments (person_id);
create index if not exists finance_payments_status_idx on public.finance_payments (status);
create index if not exists finance_payments_due_date_idx on public.finance_payments (due_date);

alter table public.finance_payments enable row level security;
drop policy if exists "finance_payments_admin_all" on public.finance_payments;
create policy "finance_payments_admin_all" on public.finance_payments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- 3) LIVE SYNC ---------------------------------------------------------------
-- Both tables join the realtime publication so an edit in one admin's tab shows
-- up in another's. Realtime re-checks each subscriber's SELECT policy per
-- change, so the admin-only policies above still hold on the wire: a non-admin
-- session receives nothing. Guarded, because `add table` errors on a table that
-- is already a member.
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array['finance_people', 'finance_payments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
      raise notice 'added % to supabase_realtime', t;
    else
      raise notice 'skipping %: already in supabase_realtime', t;
    end if;
  end loop;
end $$;


-- 4) Refresh PostgREST's schema cache so writes to the new tables don't fail
--    with PGRST205/PGRST204 until the next reload.
notify pgrst, 'reload schema';


-- ============================================================================
-- VERIFY — both rows should say admin-only, and neither should be readable by a
-- plain authenticated (non-admin) session:
--
--   select tablename, policyname, qual
--   from pg_policies
--   where schemaname = 'public' and tablename in ('finance_people','finance_payments');
--
-- And the paid-date invariant is in place:
--
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.finance_payments'::regclass
--     and conname = 'finance_payments_paid_needs_date';
-- ============================================================================

-- ============================================================================
-- CLEANUP — only needed once, BEFORE the constraint above will apply. Pick the
-- one that matches what actually happened; do NOT run both.
--
--   -- 1. The money really did move, on the due date:
--   update public.finance_payments
--   set paid_date = due_date
--   where status = 'paid' and paid_date is null and due_date is not null;
--
--   -- 2. It was never actually paid — send it back to the pipeline:
--   update public.finance_payments
--   set status = 'pending'
--   where status = 'paid' and paid_date is null;
--
--   -- 3. The rows are junk (the two invisible test rows). Delete them:
--   delete from public.finance_payments
--   where status = 'paid' and paid_date is null;
-- ============================================================================
