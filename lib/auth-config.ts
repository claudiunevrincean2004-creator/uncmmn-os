import { MainPage } from '@/lib/types';

export type Role = 'admin' | 'editor';

// This app is a single-route SPA: "tabs" are client-side views under `/`, keyed by MainPage,
// not distinct URL routes. The Studio tab key is 'studio' and the Assets tab (formerly "Drive")
// keeps the internal key 'drive'. So the editor's allowed surfaces are these two tab keys.
export const EDITOR_ALLOWED: MainPage[] = ['studio', 'drive'];

export function canAccess(role: Role, page: MainPage): boolean {
  return role === 'admin' || EDITOR_ALLOWED.includes(page);
}

// Where each role lands right after signing in.
export const LANDING_PAGE: Record<Role, MainPage> = {
  admin: 'dashboard',
  editor: 'studio',
};
