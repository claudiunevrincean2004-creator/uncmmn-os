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

import { FinancePerson } from './types';

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
