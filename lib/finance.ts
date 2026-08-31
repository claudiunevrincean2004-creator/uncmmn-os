// Finance tab — shared option lists, colour maps and small helpers.
//
// Deliberately narrow: the Finance tables are admin-only (RLS + route gate), and
// their option sets are FIXED in code rather than admin-managed in
// studio_dropdown_options. A payment status is part of a money workflow, not a
// board someone re-labels — so there is no "+ Add new…" anywhere in this tab.
//
// Stored values are snake_case ('ready_to_pay'); the *_LABELS maps are the only
// place they become human-readable, so a pill in the table and the same pill in
// the detail panel can never drift apart.

import { FinancePerson, FinancePayment } from './types';

// ── Payment type ────────────────────────────────────────────────────────────
export const PAYMENT_TYPES = ['trial', 'retainer', 'one_off'];

export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  trial: 'Trial',
  retainer: 'Retainer',
  one_off: 'One-off',
};

export const PAYMENT_TYPE_COLORS: Record<string, string> = {
  trial: '#8b5cf6',     // purple
  retainer: '#3b82f6',  // blue
  one_off: '#14b8a6',   // teal
};

// ── Payment status ──────────────────────────────────────────────────────────
// Pipeline order, so an 'order' sort reads as the workflow: money is owed, then
// cleared for release, then out the door. Colours mirror the Video Review status
// palette (neutral → yellow "needs a human" → green "done").
export const PAYMENT_STATUSES = ['pending', 'ready_to_pay', 'paid'];

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  ready_to_pay: 'Ready to Pay',
  paid: 'Paid',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: '#6b7280',       // gray
  ready_to_pay: '#eab308',  // yellow — the one status awaiting action
  paid: '#10b981',          // green
};

// ── Person status ───────────────────────────────────────────────────────────
export const PERSON_STATUSES = ['active', 'inactive'];

export const PERSON_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
};

export const PERSON_STATUS_COLORS: Record<string, string> = {
  active: '#10b981',
  inactive: '#6b7280',
};

/** Display name for a payment's person_id. Null when it maps to no one. */
export function personName(personId: string | null | undefined, people: FinancePerson[]): string | null {
  if (!personId) return null;
  const p = people.find(x => x.id === personId);
  return p ? (p.name || 'Unnamed') : null;
}

/** The person row behind a payment, or undefined. */
export function personFor(personId: string | null | undefined, people: FinancePerson[]): FinancePerson | undefined {
  return personId ? people.find(x => x.id === personId) : undefined;
}

/** Current month as "YYYY-MM", in the viewer's local time (matches the Dashboard). */
export function currentMonthPrefix(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Reporting period ────────────────────────────────────────────────────────
// One picker scopes the whole tab: the stat cards and the payments table read
// the SAME scoped list, so a card and the rows beneath it can never disagree.
//
// The labels and the maths are defined together here on purpose. "Last month"
// is the previous COMPLETE calendar month — not a trailing 30 days — and a
// rolling "Last N months" is the trailing N calendar months INCLUDING the
// current one, so "Last 3 months" in August means Jun 1 → Aug 31.

export type PeriodKey = 'this_month' | 'last_month' | 'last_3' | 'last_6' | 'last_12' | 'all';

export const DEFAULT_PERIOD: PeriodKey = 'this_month';

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_3', label: 'Last 3 months' },
  { key: 'last_6', label: 'Last 6 months' },
  { key: 'last_12', label: 'Last 12 months' },
  { key: 'all', label: 'All time' },
];

export interface DateRange { from: string; to: string }

export function periodLabel(key: PeriodKey): string {
  return PERIOD_OPTIONS.find(o => o.key === key)?.label ?? PERIOD_OPTIONS[0].label;
}

// Local yyyy-mm-dd. Deliberately not toISOString(), which shifts to UTC and can
// land a boundary date in the wrong month for anyone west of Greenwich.
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Inclusive [from, to] calendar range for a period, or null for All time.
 *
 * `new Date(y, m, 0)` is day zero of month m — i.e. the last day of month m-1 —
 * which is how each range lands on a real month end without a leap-year table.
 */
export function periodRange(key: PeriodKey, now: Date = new Date()): DateRange | null {
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = (monthsBack: number) => ymd(new Date(y, m - monthsBack, 1));
  const endOfThisMonth = ymd(new Date(y, m + 1, 0));
  switch (key) {
    case 'all':
      return null;
    case 'last_month':
      // The previous complete calendar month, start to end.
      return { from: start(1), to: ymd(new Date(y, m, 0)) };
    case 'last_3':
      return { from: start(2), to: endOfThisMonth };   // trailing 3 incl. current
    case 'last_6':
      return { from: start(5), to: endOfThisMonth };   // trailing 6 incl. current
    case 'last_12':
      return { from: start(11), to: endOfThisMonth };  // trailing 12 incl. current
    case 'this_month':
    default:
      // `default` also catches a stale key persisted by an older build, so a
      // corrupt localStorage value degrades to the default rather than to
      // undefined (which would silently scope everything to nothing).
      return { from: start(0), to: endOfThisMonth };
  }
}

/** The resolved window in words — "Aug 2026", or "Sep 2025 – Aug 2026". */
export function periodRangeLabel(key: PeriodKey, now: Date = new Date()): string {
  const r = periodRange(key, now);
  if (!r) return 'all payments on record';
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('default', { month: 'short', year: 'numeric' });
  const a = fmt(r.from);
  const b = fmt(r.to);
  return a === b ? a : `${a} – ${b}`;
}

/**
 * The date a payment is filed under: when the money actually moved for a paid
 * one, when it falls due for everything else. One rule, applied once — which is
 * what keeps "Paid · Last month" and "Outstanding · Last month" coherent on the
 * same row of cards.
 */
export function anchorDate(p: FinancePayment): string | null {
  const d = p.status === 'paid' ? p.paid_date : p.due_date;
  return d ? d.slice(0, 10) : null;
}

/**
 * Is this payment inside the period?
 *
 * An UNPAID payment with no due date is owed now and merely unscheduled, so it
 * stays in view in every period rather than falling into a gap between windows
 * and quietly vanishing from what you're owed. A PAID payment with no paid_date
 * has no anchor at all and only appears under All time — marking something paid
 * in the UI always stamps that date, so this only affects hand-edited rows.
 */
export function inPeriod(p: FinancePayment, range: DateRange | null): boolean {
  if (!range) return true;
  const d = anchorDate(p);
  if (!d) return p.status !== 'paid';
  return d >= range.from && d <= range.to;
}
