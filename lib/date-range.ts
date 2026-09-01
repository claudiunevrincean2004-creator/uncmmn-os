// ============================================================================
// Date ranges — the one place a "period" becomes a pair of dates.
//
// Every date filter in the app (Studio tables, Clip Library, Trial Reels,
// Finance) speaks the same currency: an inclusive [from, to] pair of local
// yyyy-mm-dd strings, where '' means "open on that side". This module turns the
// named periods into that pair and back into words again, so a label and the
// range it describes cannot drift apart — they are computed from each other.
//
// Local dates throughout, never toISOString(): UTC conversion shifts a boundary
// date into the wrong month for anyone west of Greenwich, which is exactly the
// bug a month-precise filter must not have.
// ============================================================================

/** Inclusive bounds. '' on either side means unbounded there. */
export interface DateRange { from: string; to: string }

export const ALL_TIME: DateRange = { from: '', to: '' };

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseISO(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
/** Day zero of the NEXT month is the last day of this one — no leap-year table. */
export function endOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

// ── Named periods ───────────────────────────────────────────────────────────
// "Last month" is the previous COMPLETE calendar month, not a trailing 30 days.
// "Last N months" is the trailing N calendar months INCLUDING the current one,
// so in September "Last 3 months" means Jul 1 → Sep 30.

export type PresetKey = 'this_month' | 'last_month' | 'last_3' | 'last_6' | 'last_12' | 'all';

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_3', label: 'Last 3 months' },
  { key: 'last_6', label: 'Last 6 months' },
  { key: 'last_12', label: 'Last 12 months' },
  { key: 'all', label: 'All time' },
];

export function presetRange(key: PresetKey, now: Date = new Date()): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = (monthsBack: number) => ymd(new Date(y, m - monthsBack, 1));
  const endOfThisMonth = ymd(new Date(y, m + 1, 0));
  switch (key) {
    case 'all': return ALL_TIME;
    case 'last_month': return { from: start(1), to: ymd(new Date(y, m, 0)) };
    case 'last_3': return { from: start(2), to: endOfThisMonth };
    case 'last_6': return { from: start(5), to: endOfThisMonth };
    case 'last_12': return { from: start(11), to: endOfThisMonth };
    case 'this_month':
    default: return { from: start(0), to: endOfThisMonth };
  }
}

// ── Specific calendar months ────────────────────────────────────────────────
// Keyed 'YYYY-MM'. A month option means that month START TO END — never a
// trailing window anchored on today.

export function monthRange(key: string): DateRange {
  const [y, m] = key.split('-').map(Number);
  return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_FULL[m - 1]} ${y}`;
}

/**
 * The months actually represented in a column's values, newest first.
 *
 * Derived from the data rather than hardcoded, so the list stays correct as time
 * passes and never offers a month with nothing in it. Capped — anything older
 * than the cap is still reachable through the custom range.
 */
export function monthsFromData(dates: (string | null | undefined)[], cap = 18): string[] {
  const seen = new Set<string>();
  for (const d of dates) {
    if (!d) continue;
    const key = d.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(key)) seen.add(key);
  }
  return Array.from(seen).sort().reverse().slice(0, cap);
}

// ── Words ───────────────────────────────────────────────────────────────────

function sameRange(a: DateRange, b: DateRange): boolean {
  return a.from === b.from && a.to === b.to;
}

/** Is this pair exactly one whole calendar month? Returns its key, or null. */
export function wholeMonthKey(from: string, to: string): string | null {
  if (!from || !to) return null;
  const key = from.slice(0, 7);
  return sameRange(monthRange(key), { from, to }) ? key : null;
}

/**
 * The range as it reads on a trigger or a chip — "All time", "Last month",
 * "July 2026", "12 Jun – 4 Jul".
 *
 * Named periods win over the month name (a range that is both "Last month" and
 * "August 2026" reads better as the former), and a whole month wins over the
 * day-span form.
 */
export function describeRange(from: string, to: string, now: Date = new Date()): string {
  if (!from && !to) return 'All time';

  const here = { from, to };
  for (const p of PRESETS) {
    if (p.key === 'all') continue;
    if (sameRange(presetRange(p.key, now), here)) return p.label;
  }

  const month = wholeMonthKey(from, to);
  if (month) return monthLabel(month);

  const fd = parseISO(from);
  const td = parseISO(to);
  const thisYear = now.getFullYear();
  // Years appear only when they carry information — a cross-year span, or a
  // date outside the current year.
  const needsYear =
    (fd ? fd.getFullYear() !== thisYear : false) ||
    (td ? td.getFullYear() !== thisYear : false);
  const one = (d: Date) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${needsYear ? ` ${d.getFullYear()}` : ''}`;
  if (fd && td) return `${one(fd)} – ${one(td)}`;
  if (fd) return `From ${one(fd)}`;
  if (td) return `Until ${one(td)}`;
  return 'All time';
}

/** Which option is currently selected, for ticking the menu. */
export function activeSelection(from: string, to: string, now: Date = new Date()):
  { kind: 'preset'; key: PresetKey } | { kind: 'month'; key: string } | { kind: 'custom' } {
  if (!from && !to) return { kind: 'preset', key: 'all' };
  const here = { from, to };
  for (const p of PRESETS) {
    if (p.key === 'all') continue;
    if (sameRange(presetRange(p.key, now), here)) return { kind: 'preset', key: p.key };
  }
  const month = wholeMonthKey(from, to);
  if (month) return { kind: 'month', key: month };
  return { kind: 'custom' };
}

/** Inclusive membership test. An empty bound is open on that side. */
export function inRange(value: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const v = value.slice(0, 10);
  if (from && v < from) return false;
  if (to && v > to) return false;
  return true;
}
