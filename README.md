# Content OS

An internal content-operations dashboard: a single-page app for planning, producing, reviewing and paying for short-form video work. Everything lives behind a login — there are no public pages.

Built with Next.js 14 (App Router), React 18, TypeScript, Tailwind, and Supabase (Postgres + Auth + Realtime). Deployed on Vercel.

---

## Quick start

Requires Node 18.17+ (Next 14). Developed against Node 24.

```bash
npm install
cp .env.local.example .env.local   # then fill in the values below
npm run dev                        # http://localhost:3000
```

| Script | Does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm start` | Serve a production build |
| `npm run lint` | ESLint via `eslint-config-next` |

---

## Environment variables

All eight live in `.env.local`, which is **git-ignored** — never commit it. `.env.local.example` is the tracked template.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key |
| `SLACK_MAINIGUPDATES_WEBHOOK_URL` | no | Video Review status pings |
| `SLACK_ADS_WEBHOOK_URL` | no | Ad Creative pings (new + iteration requests) |
| `SLACK_FILMING_WEBHOOK_URL` | no | Filming Session transitions |
| `SLACK_STORY_WEBHOOK_URL` | no | Story Sequence transitions |
| `SLACK_FINANCE_WEBHOOK_URL` | no | Private finance channel, on "Ready to Pay" |
| `SLACK_TRIALREELS_WEBHOOK_URL` | no | Trial Reels queue digest + In Review pings |

The two `NEXT_PUBLIC_` values are exposed to the browser by design — that is what the Supabase JS client uses, and Row Level Security is what protects the data behind them (see [Security](#security)).

Every `SLACK_*` webhook is **server-only** — deliberately no `NEXT_PUBLIC_` prefix, so a webhook URL never reaches the client bundle. Each notify route skips silently when its webhook is unset, so Slack is entirely optional in development.

---

## Database setup

Run the SQL files in `supabase/` through the Supabase SQL editor, **in this order**. Every file is idempotent and safe to re-run.

```
 1. schema.sql                        base tables
 2. auth_setup.sql                    profiles, roles, public.is_admin(), RLS
 3. custom_properties.sql
 4. builtin_options_and_assignees.sql needs 1–3
 5. studio_comments_author.sql
 6. comment_inbox.sql                 needs 5
 7. comment_threads.sql               needs 5, 6
 8. comment_reactions.sql             needs 5
 9. clippers.sql
10. clip_library.sql
11. trial_reels.sql
12. finance.sql
13. admin_delete_user.sql
14. profiles_display_name.sql, profiles_self_display_name.sql, profiles_job_title.sql
15. studio_videos_account.sql, studio_videos_tiktok_final.sql,
    studio_sessions_footage.sql, studio_sessions_type.sql,
    studio_ad_creatives_final_link.sql, studio_assigned_to_user_id.sql
16. realtime.sql                      publication membership for live sync
17. rls_hardening.sql                 RUN LAST
```

Files 9–13 and 17 call `public.is_admin()`, which `auth_setup.sql` defines — running them first will fail with a clear error.

### Bootstrap the first admin

New signups get the `editor` role from a trigger. Promote yourself once, by hand:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

### If the app shows "Database setup required"

`lib/setup-db.ts` probes for missing tables and columns on load and generates the SQL to add them. That banner means a migration above hasn't been run. Note that the generated SQL is a fallback — the files in `supabase/` are the source of truth.

---

## Roles and access

Three tiers, defined in `lib/auth-config.ts` and enforced twice — once in the UI (`Sidebar` filters the nav; `app/page.tsx` gates each tab) and once at the database via RLS policies.

| Role | Reaches |
|---|---|
| `admin` | Everything, including the admin-only Content, Research, Dashboard, Clip Library, Clippers and Finance tabs |
| `editor` | Studio, Assets, Trial Reels (`EDITOR_ALLOWED`) |
| `clipper` | Nothing yet — a placeholder screen. Their portal is Phase 2 |

`middleware.ts` is the outer gate: any unauthenticated request to any route is redirected to `/login`.

---

## Layout

```
app/
  page.tsx              the whole SPA — tabs are client-side views, not routes
  layout.tsx            metadata, fonts, pre-paint theme script
  login/                the only unauthenticated page
  api/*-notify/         server-only Slack webhook routes
  studio/…/[id]/        thin deep-link routes that redirect into the SPA
components/
  sub/                  one file per tab
  sub/studio/           board, table, side panel, filters, comments
lib/
  auth-config.ts        roles and per-tab access
  use-realtime.ts       one shared Supabase channel, bound in page.tsx
  setup-db.ts           schema probe + migration SQL generator
supabase/               all SQL migrations
```

Tabs are client-side views keyed by `MainPage`, not distinct URLs. The `/studio/video/[id]`-style routes exist only so Slack pings can deep-link a single row; they redirect to `/?item=…` and the SPA opens the matching panel.

---

## Realtime

`lib/use-realtime.ts` opens one shared channel carrying `postgres_changes` for every table the page binds. Two things to know:

- A table emits nothing unless it is a member of the `supabase_realtime` publication — no error, just silence. `realtime.sql` handles membership.
- Realtime re-checks each subscriber's SELECT policy per change, so RLS holds on the wire: a non-admin session receives nothing from an admin-only table.

Channel *names* are per-client subscription topics (and `nextChannelName` makes each mount's name unique). Nothing uses Broadcast or Presence, so no cross-client coordination depends on them.

---

## Security

Read `supabase/rls_hardening.sql` before changing any policy — its header documents two failure modes this codebase has already hit:

1. **`alter table … disable row level security` beats every policy.** Correct policies were being written by one migration and disabled by another.
2. **A policy with no `to` clause defaults to `TO PUBLIC`, which includes Supabase's `anon` role.** `create policy … using (true)` without `to authenticated` hands the table to the logged-out world.

Every policy in this repo is scoped `to authenticated` or stricter. Nothing here is served anonymously, so no table needs `anon` access.

Payment details (`finance_people.bank_details`, `payment_link`) are admin-only at the RLS layer, rendered only in the Finance tab, and never sent to Slack — the finance webhook carries a summary and a link only.
