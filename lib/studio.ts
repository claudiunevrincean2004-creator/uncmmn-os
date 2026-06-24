// Studio tab — shared option lists, color maps and helpers

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
  'Approved',
  'Posted',
];

export const VIDEO_STATUS_COLORS: Record<string, string> = {
  'Scripting': '#6b7280',          // gray
  'Recording': '#3b82f6',          // blue
  'Raw Footage Ready': '#eab308',  // yellow
  'Editing': '#f59e0b',            // orange
  'In Review': '#8b5cf6',          // purple
  'Revision Requested': '#ef4444', // red
  'Approved': '#10b981',           // green
  'Posted': '#14b8a6',             // teal
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

// Structured status-change log (placeholder for future Slack integration)
export function logStatusChange(entity: string, id: string, from: string, to: string): void {
  // eslint-disable-next-line no-console
  console.log(`[studio] ${entity} ${id} status: "${from}" → "${to}" @ ${new Date().toISOString()}`);
}
