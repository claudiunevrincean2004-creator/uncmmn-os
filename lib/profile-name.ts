import { Profile } from './types';

// Preferred display for a user: explicit display_name, else the capitalized
// email prefix (e.g. "jane.doe@x.com" → "Jane.doe"), else a short id fallback.
// Single source of truth shared by the sidebar, account panel, assignee picker
// and comment authors.
export function profileName(p: Profile): string {
  if (p.display_name && p.display_name.trim()) return p.display_name.trim();
  if (p.email) {
    const prefix = p.email.split('@')[0];
    if (prefix) return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }
  return `User ${p.id.slice(0, 6)}`;
}
