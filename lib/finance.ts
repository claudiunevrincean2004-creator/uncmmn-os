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
import type { DateRange } from './date-range';

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
// The picker itself is the shared DateRangePicker every other tab uses, and the
// ranges come from lib/date-range.ts — so "Last month" means the same window
// here as it does on Video Review, and a specific month means that calendar
// month start to end. What stays Finance's own is the ANCHORING below: which
// date each payment is filed under before the range is applied.

export type { DateRange } from './date-range';

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

/**
 * Is this payment PAID inside the period, strictly by paid_date?
 *
 * This is the Paid card's one rule, and it deliberately has no due_date
 * fallback: a payment due 2026-08-01 that nobody has stamped with a paid date
 * is not September's paid money — it isn't any month's paid money. It has no
 * settlement date on record, so it is counted nowhere (see missingPaidDate,
 * which is how those rows get surfaced rather than silently dropped) — not even
 * under All time, where `range` is null and every other rule waves rows through.
 */
export function isPaidIn(p: FinancePayment, range: DateRange | null): boolean {
  if (p.status !== 'paid') return false;
  const d = p.paid_date ? p.paid_date.slice(0, 10) : null;
  if (!d) return false;
  if (!range) return true;
  return d >= range.from && d <= range.to;
}

/**
 * A row marked paid with nothing in paid_date — the one shape isPaidIn refuses
 * to count. Period-independent on purpose: a row with no date belongs to no
 * window, so scoping the warning to the picker would hide the very rows it
 * exists to get fixed.
 */
export function missingPaidDate(p: FinancePayment): boolean {
  return p.status === 'paid' && !p.paid_date;
}
