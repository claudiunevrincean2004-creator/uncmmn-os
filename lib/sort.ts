// Shared table sorting. Every table declares which of its properties are sortable
// (a SortOption list); this module turns that declaration + a key/direction into
// an ordered array, so all seven tables behave identically.
//
// The interesting kind is 'order': statuses and priorities sort by their PIPELINE
// position (Briefing → Ready to Edit → … → Posted), never alphabetically, so a
// status-sorted board reads as the workflow it represents. The order list a table
// passes in is the same DB-backed, admin-ordered option list it already renders in
// its status pills, so re-ordering statuses in settings re-orders the sort too.

export type SortDir = 'asc' | 'desc';

// How to compare a property's values:
//   text   — case-insensitive alphabetical
//   date   — ISO date/timestamp, chronological
//   number — numeric
//   order  — position in a caller-supplied list (pipeline order)
export type SortKind = 'text' | 'date' | 'number' | 'order';

export interface SortOption<T> {
  key: string;
  label: string;
  kind: SortKind;
  value: (row: T) => string | number | null | undefined;
  // Required for kind 'order' — the ordered values (e.g. VIDEO_STATUSES).
  order?: string[];
}

// Direction labels read as what the sort DOES, not as "asc/desc" — matching the
// existing "Deadline ↑ Oldest" control the tables already use.
const DIR_LABELS: Record<SortKind, { asc: string; desc: string }> = {
  date: { asc: '↑ Oldest', desc: '↓ Newest' },
  text: { asc: '↑ A–Z', desc: '↓ Z–A' },
  number: { asc: '↑ Low–High', desc: '↓ High–Low' },
  order: { asc: '↑ First → Last', desc: '↓ Last → First' },
};

export function dirLabel(kind: SortKind, dir: SortDir): string {
  return DIR_LABELS[kind][dir];
}

// The option a persisted key points at, falling back to the first option when the
// key is stale (a property that was renamed/removed since the user last sorted).
export function resolveOption<T>(options: SortOption<T>[], key: string): SortOption<T> {
  return options.find(o => o.key === key) ?? options[0];
}

// Empty values (null/undefined/'') always sink to the bottom, in BOTH directions —
// a row with no deadline is "unscheduled", not "earliest". Unknown values for an
// 'order' sort (a status not in the list) rank after every known one but ahead of
// blanks, so they stay visible instead of being mistaken for empty.
function rank(opt: SortOption<any>, row: any): { empty: boolean; v: string | number } {
  const raw = opt.value(row);
  if (raw === null || raw === undefined || raw === '') return { empty: true, v: '' };
  if (opt.kind === 'order') {
    const list = opt.order || [];
    const i = list.indexOf(String(raw));
    return { empty: false, v: i < 0 ? list.length : i };
  }
  if (opt.kind === 'number') return { empty: false, v: Number(raw) || 0 };
  if (opt.kind === 'date') return { empty: false, v: String(raw).slice(0, 10) };
  return { empty: false, v: String(raw).toLowerCase() };
}

export function sortRows<T>(rows: T[], options: SortOption<T>[], key: string, dir: SortDir): T[] {
  const opt = resolveOption(options, key);
  if (!opt) return rows;
  return [...rows].sort((a, b) => {
    const ra = rank(opt, a);
    const rb = rank(opt, b);
    if (ra.empty && rb.empty) return 0;
    if (ra.empty) return 1;   // blanks last, regardless of direction
    if (rb.empty) return -1;
    let c: number;
    if (typeof ra.v === 'number' && typeof rb.v === 'number') c = ra.v - rb.v;
    else c = String(ra.v).localeCompare(String(rb.v));
    return dir === 'asc' ? c : -c;
  });
}
