import { MainPage } from '@/lib/types';

export type Role = 'admin' | 'editor' | 'clipper';

// This app is a single-route SPA: "tabs" are client-side views under `/`, keyed by MainPage,
// not distinct URL routes. The Studio tab key is 'studio' and the Assets tab (formerly "Drive")
// keeps the internal key 'drive'. Trial Reels ('trialreels') is a production tab editors can
// reach, but the tab itself hides its admin-only management surfaces (source library, CSV
// import, queue generation) and shows an editor only the reels assigned to them.
export const EDITOR_ALLOWED: MainPage[] = ['studio', 'drive', 'trialreels'];

// Access tiers:
//  - admin   → every tab, including the admin-only Clippers and Finance tabs.
//  - editor  → only EDITOR_ALLOWED (Studio, Assets). Unchanged from before.
//  - clipper → most restricted: NO admin tabs at all (Phase 1). Their own portal
//              is Phase 2; for now a clipper sees a minimal placeholder, not the app.
//
// Finance ('finance') is admin-only by the SAME mechanism as Clippers: it is
// simply absent from EDITOR_ALLOWED, so this one function locks it out of the
// sidebar (Sidebar filters NAV through canAccess) and out of the route (page.tsx
// renders the tab behind `role === 'admin'` and bounces editors off it). There is
// no separate finance role and no second gating path — profiles.role is it.
// The tables are ALSO admin-only at the RLS layer (supabase/finance.sql), which
// is stricter than the studio_* tables: editors have logins, so "authenticated"
// would expose everyone's pay to everyone.
export function canAccess(role: Role, page: MainPage): boolean {
  if (role === 'admin') return true;
  if (role === 'editor') return EDITOR_ALLOWED.includes(page);
  return false; // clipper: nothing admin-facing yet
}

// Where each role lands right after signing in.
export const LANDING_PAGE: Record<Role, MainPage> = {
  admin: 'dashboard',
  editor: 'studio',
  clipper: 'dashboard', // unused — clippers get the placeholder, not a tab
};
