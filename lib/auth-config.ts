import { MainPage } from '@/lib/types';

export type Role = 'admin' | 'editor' | 'clipper';

// This app is a single-route SPA: "tabs" are client-side views under `/`, keyed by MainPage,
// not distinct URL routes. The Studio tab key is 'studio' and the Assets tab (formerly "Drive")
// keeps the internal key 'drive'. So the editor's allowed surfaces are these two tab keys.
export const EDITOR_ALLOWED: MainPage[] = ['studio', 'drive'];

// Access tiers:
//  - admin   → every tab, including the admin-only Clippers management tab.
//  - editor  → only EDITOR_ALLOWED (Studio, Assets). Unchanged from before.
//  - clipper → most restricted: NO admin tabs at all (Phase 1). Their own portal
//              is Phase 2; for now a clipper sees a minimal placeholder, not the app.
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
