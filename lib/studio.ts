// Studio tab — shared option lists, color maps and helpers
import { supabase } from './supabase';

export const VIDEO_FORMATS = ['Short', 'Long Form', 'Reel', 'Story', 'Other'];

// Hardcoded team list (editable later). Used for "Assigned To".
export const TEAM = ['Unassigned', 'Nathan', 'Editor', 'Videographer', 'Scriptwriter', 'Thumbnail Designer'];

export const VIDEO_STATUSES = [
  'Scripting',
  'Recording',
  'Raw Footage Ready',
  'Editing',
  'In Review',
  'Revision Requested',
  'Ad Variation Needed',
  'Approved',
  'Posted',
];

export const VIDEO_STATUS_COLORS: Record<string, string> = {
  'Scripting': '#6b7280',           // gray
  'Recording': '#3b82f6',           // blue
  'Raw Footage Ready': '#eab308',   // yellow
  'Editing': '#f59e0b',             // orange
  'In Review': '#8b5cf6',           // purple
  'Revision Requested': '#ef4444',  // red
  'Ad Variation Needed': '#ec4899', // pink
  'Approved': '#10b981',            // green
  'Posted': '#14b8a6',              // teal
};

// Ad Creative pipeline
export const AD_FORMATS = ['Story Ad', 'Feed Ad', 'Spark Ad', 'Carousel', 'Other'];
export const CTA_TYPES = ['Shop Now', 'Learn More', 'Follow', 'DM Us', 'Link in Bio', 'Custom'];
export const AD_STATUSES = ['Pending', 'In Progress', 'In Review', 'Revision Requested', 'Approved', 'Live'];
export const AD_PLATFORMS = ['TikTok Ads', 'Meta Ads', 'YouTube Ads', 'Both'];

export const AD_STATUS_COLORS: Record<string, string> = {
  Pending: '#6b7280',                // gray
  'In Progress': '#f59e0b',          // orange
  'In Review': '#8b5cf6',            // purple
  'Revision Requested': '#ef4444',   // red
  Approved: '#10b981',               // green
  Live: '#14b8a6',                   // teal
};

export const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

export const PRIORITY_COLORS: Record<string, string> = {
  Low: '#6b7280',     // gray
  Normal: '#e5e7eb',  // white
  High: '#f59e0b',    // orange
  Urgent: '#ef4444',  // red
};

export const SEQUENCE_STATUSES = ['Draft', 'Ready for Review', 'Revision Requested', 'Approved', 'Posted'];

export const SEQUENCE_STATUS_COLORS: Record<string, string> = {
  Draft: '#6b7280',
  'Ready for Review': '#8b5cf6',
  'Revision Requested': '#ef4444',
  Approved: '#10b981',
  Posted: '#14b8a6',
};

export const SEQUENCE_PLATFORMS = ['Instagram', 'TikTok', 'YouTube'];

export const SESSION_STATUSES = ['Planned', 'Confirmed', 'Filming', 'Filmed', 'Cancelled'];

export const SESSION_STATUS_COLORS: Record<string, string> = {
  Planned: '#6b7280',
  Confirmed: '#3b82f6',
  Filming: '#f59e0b',
  Filmed: '#10b981',
  Cancelled: '#ef4444',
};

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Colored pill style (translucent background + solid text), matches dark theme badges
export function pillStyle(color: string): React.CSSProperties {
  return {
    background: hexToRgba(color, 0.15),
    color,
    border: `0.5px solid ${hexToRgba(color, 0.35)}`,
  };
}

// Today as a local yyyy-mm-dd string (string comparison is safe for ISO dates)
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Overdue = a date in the past and the item isn't in one of the "done" statuses
export function isOverdue(dateStr: string | undefined, status: string, doneStatuses: string[]): boolean {
  if (!dateStr) return false;
  if (doneStatuses.includes(status)) return false;
  return dateStr.slice(0, 10) < todayISO();
}

// Persist an entry to the studio_activity log (also handy for future Slack integration)
export async function logActivity(
  itemType: string,
  itemId: string,
  action: string,
  oldValue: string | null,
  newValue: string | null,
): Promise<void> {
  await supabase.from('studio_activity').insert([{
    item_type: itemType,
    item_id: itemId,
    action,
    old_value: oldValue,
    new_value: newValue,
  }]);
}

// Format an ISO timestamp like "Apr 25 at 3:45pm"
export function formatActivityTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleString('default', { month: 'short', day: 'numeric' });
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${date} at ${h}:${m}${ampm}`;
}
