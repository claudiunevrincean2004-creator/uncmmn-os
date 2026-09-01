'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { FinancePayment, FinancePerson, Profile } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { usePagedRows } from '@/lib/use-paged-rows';
import { formatUSD, parseUSD } from '@/lib/utils';
import { SortOption, SortDir, sortRows } from '@/lib/sort';
import { inDateRange, isOverdue, todayISO } from '@/lib/studio';
import { financeApproverMention } from '@/lib/team-slack';
import {
  PAYMENT_TYPES, PAYMENT_TYPE_LABELS, PAYMENT_TYPE_COLORS,
  PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
  personFor, personName, paymentDetails, PAYMENT_METHOD_COLORS,
} from '@/lib/finance';
import CopyValue from './CopyValue';

// Everything below the surface is borrowed wholesale from Video Review — the
// same toolbar, the same collapsed Filter/Sort popovers, the same table shell,
// the same widened detail panel. Nothing here is a parallel implementation.
import { EditPillSelect, InlineDate, InlineMoney, UrlCell, openDatePicker } from '../studio/cells';
import TableToolbar, { rowAccent, openOnRowClick, TitleCell } from '../studio/table-ui';
import { FilterMenu, FilterChips, SortMenu, type FilterDef } from '../studio/FilterMenu';
import ItemPanel, { FieldDef } from '../studio/ItemPanel';
import Dropdown from '../studio/Dropdown';
import LoadMore from '../studio/LoadMore';

// A paid payment is "done" — it can't be overdue, exactly the way a Posted video
// can't be. Everything else with a past due date carries the red rail.
const DONE = ['paid'];

const DEFAULT_SORT_KEY = 'due_date';
const DEFAULT_SORT_DIR: SortDir = 'asc';

interface PaymentDraft {
  person_id: string;
  type: string;
  amount: string;
  status: string;
  due_date: string;
  paid_date: string;
  invoice_url: string;
  description: string;
}
const EMPTY_DRAFT: PaymentDraft = {
  person_id: '',
  type: 'one_off',
  amount: '',
  status: 'pending',
  due_date: '',
  paid_date: '',
  invoice_url: '',
  description: '',
};

// The one rule for paid_date, shared by the Add form and the detail panel:
// picking Paid reveals the field prefilled with today (a guess you can overwrite
// to backdate a payment actually made weeks ago), and moving off Paid clears it
// rather than leaving yesterday's stale date on a pending row.
function paidDateForStatus(status: string, current: string): string {
  if (status !== 'paid') return '';
  return current || todayISO();
}

// ── The invariant this tab defends ──────────────────────────────────────────
// A paid payment MUST carry a paid date. Without one the row is anchored to no
// month, so every dated period filters it out — which is how two such rows once
// became invisible in the UI and therefore impossible to delete from it.
//
// Enforced in all three places a paid_date can be written (the Add form, the
// detail panel and the table's own cell) and, so it cannot be bypassed at all,
// by a CHECK constraint on finance_payments — see supabase/finance.sql.
const PAID_NEEDS_DATE =
  'A paid payment needs a paid date — it decides which month the money lands in.';

/** The message to show, or null when the pair is legal. */
function paidDateError(status: string, paidDate: string | null | undefined): string | null {
  return status === 'paid' && !paidDate ? PAID_NEEDS_DATE : null;
}

interface Props {
  /** ALREADY scoped to the tab's period by FinanceTab — this component filters
   *  and sorts what it's given and never re-applies the period itself, so the
   *  stat cards above and these rows are always the same set of payments. */
  payments: FinancePayment[];
  people: FinancePerson[];
  /** OS logins — the Ready-to-Pay ping resolves its @-mention from these. */
  profiles: Profile[];
  /**
   * Set when the parent has swapped the period's rows for one specific problem
   * set (today: paid payments with no paid_date, from the Paid card's warning).
   * While it's set the table shows a banner and SUSPENDS its own saved filters —
   * a persisted "Status: Pending" would otherwise hide every row the user just
   * asked to see. Search and sort still apply; both are transient, not saved.
   */
  focus?: { label: string; hint: string; onClear: () => void } | null;
  /** The active period, for the empty state ("No payments in This month"). */
  periodName: string;
  /** Jump to the People view — offered from the empty state when nobody exists yet. */
  onManagePeople: () => void;
  /** Open one person's record — the Pay Via section's "Edit on <name>" link. */
  onOpenPerson: (personId: string) => void;
  /** Open this payment on arrival (from a person's history list). One-shot. */
  openPaymentId?: string | null;
  /** Apply this person NAME to the person filter once, then clear it. */
  personFilter?: string | null;
  /** Drop the saved filters for this one arrival, so a deep-linked payment is
   *  actually on screen behind its panel rather than hidden by a stale filter. */
  resetFilters?: boolean;
  onNavConsumed?: () => void;
  onReload: () => void;
}

export default function PaymentsTable({ payments, people, profiles, focus, periodName, onManagePeople, onOpenPerson, openPaymentId, personFilter, resetFilters, onNavConsumed, onReload }: Props) {
  const [fPerson, setFPerson] = usePersistedState<string>('finance_p_person', 'All');
  const [fType, setFType] = usePersistedState<string>('finance_p_type', 'All');
  const [fStatus, setFStatus] = usePersistedState<string>('finance_p_status', 'All');
  const [dateFrom, setDateFrom] = usePersistedState<string>('finance_p_from', '');
  const [dateTo, setDateTo] = usePersistedState<string>('finance_p_to', '');
  const [sortKey, setSortKey] = usePersistedState<string>('finance_p_sortkey', DEFAULT_SORT_KEY);
  const [sortDir, setSortDir] = usePersistedState<SortDir>('finance_p_sortdir', DEFAULT_SORT_DIR);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<PaymentDraft>(EMPTY_DRAFT);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Quiet, non-blocking feedback — the same .idea-toast the Research and Clip
  // Library tabs use. A Slack failure never gets an alert(), because the payment
  // itself saved fine and a modal would imply otherwise.
  const [toast, setToast] = useState<{ msg: string; isError: boolean } | null>(null);
  const [resending, setResending] = useState(false);

  // Arriving from a person's panel: open one payment, and/or narrow to that
  // person. One-shot, cleared through onNavConsumed so a later visit to the tab
  // doesn't re-apply it.
  useEffect(() => {
    if (!openPaymentId && !personFilter && !resetFilters) return;
    if (resetFilters) {
      setFPerson('All');
      setFType('All');
      setFStatus('All');
      setDateFrom('');
      setDateTo('');
      setSearch('');
    }
    if (openPaymentId) setSelectedId(openPaymentId);
    // Applied after the reset above, so a person jump still narrows to them.
    if (personFilter) setFPerson(personFilter);
    onNavConsumed?.();
  }, [openPaymentId, personFilter, resetFilters, onNavConsumed,
      setFPerson, setFType, setFStatus, setDateFrom, setDateTo]);

  function showToast(msg: string, isError = false) {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), isError ? 5000 : 2200);
  }

  // Person id → name, and the reverse. Filtering is by NAME (what the user reads
  // in the popover); the rows themselves store person_id.
  const nameOf = useMemo(() => {
    const m: Record<string, string> = {};
    people.forEach(p => { m[p.id] = p.name || 'Unnamed'; });
    return m;
  }, [people]);
  // People available to assign: active ones, plus anyone already referenced by a
  // payment, so deactivating someone never orphans their existing rows.
  const referenced = useMemo(() => new Set(payments.map(p => p.person_id).filter(Boolean) as string[]), [payments]);
  const assignable = useMemo(
    () => people.filter(p => (p.status ?? 'active') !== 'inactive' || referenced.has(p.id)),
    [people, referenced],
  );

  async function patch(id: string, p: Partial<FinancePayment>) {
    const { error } = await supabase.from('finance_payments').update(p).eq('id', id);
    if (error) {
      // Same loud-failure policy as the Studio tables: a silent revert reads as
      // "editing doesn't work". The usual causes are a missing column, a stale
      // PostgREST schema cache (run supabase/finance.sql, including
      // `notify pgrst, 'reload schema';`) or an RLS denial on a non-admin session.
      console.error('[Finance] failed to update payment', { id, patch: p, error });
      alert(`Couldn't save changes: ${error.message}`);
    }
    onReload();
  }

  /**
   * Ping the finance channel that a payment is ready to settle.
   *
   * Called AFTER the status write has already landed, and it never throws: a
   * missing webhook or an unreachable Slack must not make a saved payment look
   * unsaved. Failure is a toast and a console line, nothing more.
   *
   * `notified_at` is stamped only on a true success, so a failed ping stays
   * re-sendable — and a payment that has already been announced is never
   * announced twice, no matter how many times its status moves.
   */
  async function notifyReadyToPay(row: FinancePayment): Promise<boolean> {
    const person = personFor(row.person_id, people);
    try {
      const res = await fetch('/api/finance-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'ready_to_pay',
          // Resolved here from profiles.slack_user_id, the same way every
          // editor ping is built — the route does no database access.
          mention: financeApproverMention(profiles),
          personName: person?.name ?? '',
          amount: formatUSD(row.amount),
          type: row.type ? (PAYMENT_TYPE_LABELS[row.type] ?? row.type) : '',
          dueDate: row.due_date ?? '',
          description: row.description ?? '',
          invoiceUrl: row.invoice_url ?? '',
          // Opens THIS payment: the tab deep-link handler in app/page.tsx takes
          // an optional payment id and hands it to FinanceTab, which widens the
          // period to All time so the row is reachable whatever the picker was
          // left on. Still no per-item route — same ?view= mechanism.
          osUrl: typeof window !== 'undefined'
            ? `${window.location.origin}/?view=finance&payment=${encodeURIComponent(row.id)}`
            : '',
          // NOTE: person.payment_link is deliberately NOT sent. See the route.
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok !== true) {
        console.warn('[Finance] ready-to-pay ping not delivered', body);
        return false;
      }
    } catch (err) {
      console.warn('[Finance] ready-to-pay ping failed', err);
      return false;
    }
    // Delivered — record it so nothing re-announces this payment.
    const { error } = await supabase
      .from('finance_payments')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) console.error('[Finance] failed to stamp notified_at', error);
    return true;
  }

  /** Fire the ping if this payment has never been announced. */
  async function maybeNotify(row: FinancePayment) {
    if (row.notified_at) return;
    const ok = await notifyReadyToPay(row);
    showToast(
      ok ? 'Slack notified' : "Payment saved — Slack notification didn't send",
      !ok,
    );
    onReload();
  }

  // Moving a payment to Paid stamps today's date when there isn't one yet (and
  // clearing Paid drops it), so "Paid this month" is never wrong just because
  // someone forgot the second field.
  async function changeStatus(row: FinancePayment, status: string) {
    if (status === row.status) return;
    const p: Partial<FinancePayment> = { status };
    if (status === 'paid' && !row.paid_date) p.paid_date = todayISO();
    if (status !== 'paid' && row.paid_date) p.paid_date = null;
    await patch(row.id, p);
    // Every status change in this tab comes through here — the table's pill and
    // the detail panel's both call it — so the ping can't be bypassed by
    // choosing where to make the edit.
    if (status === 'ready_to_pay') await maybeNotify({ ...row, ...p });
  }

  async function createPayment() {
    if (creating) return;
    // Blocked, not quietly defaulted: silently stamping today is how a payment
    // made in August gets filed under September in the first place.
    const invalid = paidDateError(draft.status, draft.paid_date);
    if (invalid) { setDraftError(invalid); return; }
    setDraftError(null);
    setCreating(true);
    const row = {
      person_id: draft.person_id || null,
      type: draft.type || null,
      amount: parseUSD(draft.amount) ?? 0,
      status: draft.status || 'pending',
      due_date: draft.due_date || null,
      // Only ever written for a paid row — the field isn't even shown otherwise,
      // and a paid_date on a pending payment would be counted by nothing and
      // read as a contradiction. Guaranteed non-empty for a paid row by the
      // check above.
      paid_date: draft.status === 'paid' ? draft.paid_date : null,
      invoice_url: draft.invoice_url.trim() || null,
      description: draft.description.trim() || null,
      // Currency stays at its 'USD' default — everything here is USD and no UI
      // reads the column.
    };
    const { data: created, error } = await supabase.from('finance_payments').insert([row]).select().single();
    setCreating(false);
    if (error) {
      console.error('[Finance] failed to create payment', { row, error });
      alert(`Couldn't create payment: ${error.message}`);
      return;
    }
    closeAdd();
    // Created straight at Ready to Pay → announce it once, the same way
    // changeStatus would have. A payment created as Pending says nothing.
    if (created && row.status === 'ready_to_pay') await maybeNotify(created as FinancePayment);
    onReload();
  }

  /**
   * Manual re-announce. The only thing that clears notified_at — moving a
   * payment off ready_to_pay and back deliberately does not, so a status
   * ping-pong can never spam the channel.
   */
  async function resendNotification(row: FinancePayment) {
    if (resending) return;
    setResending(true);
    const { error } = await supabase
      .from('finance_payments')
      .update({ notified_at: null })
      .eq('id', row.id);
    if (error) {
      setResending(false);
      showToast(`Couldn't reset the notification: ${error.message}`, true);
      return;
    }
    const ok = await notifyReadyToPay({ ...row, notified_at: null });
    setResending(false);
    showToast(ok ? 'Slack notified' : "Couldn't reach Slack — try again", !ok);
    onReload();
  }

  function closeAdd() {
    setAddOpen(false);
    setDraft(EMPTY_DRAFT);
    setDraftError(null);
  }

  async function deletePayment(id: string) {
    const { error } = await supabase.from('finance_payments').delete().eq('id', id);
    if (error) { alert(`Couldn't delete payment: ${error.message}`); return; }
    if (selectedId === id) setSelectedId(null);
    onReload();
  }

  // The table's row button asks first; the panel's Delete does NOT go through
  // here, because ItemPanel already wraps it in ConfirmDelete's own two-step.
  function confirmDeletePayment(id: string) {
    if (!confirm('Delete this payment?')) return;
    deletePayment(id);
  }

  // ── Filters ────────────────────────────────────────────────────────────────
  // The Person list offers everyone who actually has a payment (an unfiltered
  // roster would offer dead ends); Type and Status always offer their full
  // defined sets, unioned with any stray value already on a row.
  const personPresent = useMemo(
    () => ['All', ...Array.from(new Set(payments.map(p => nameOf[p.person_id || ''] || '').filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [payments, nameOf],
  );
  const typePresent = useMemo(
    () => ['All', ...Array.from(new Set([...PAYMENT_TYPES, ...payments.map(p => p.type).filter(Boolean) as string[]]))],
    [payments],
  );
  const statusPresent = useMemo(
    () => ['All', ...Array.from(new Set([...PAYMENT_STATUSES, ...payments.map(p => p.status).filter(Boolean) as string[]]))],
    [payments],
  );

  // The SAME FilterDef shape Video Review passes — each entry is a view onto the
  // state this component already owns, not a second copy of it.
  const filterDefs: FilterDef[] = useMemo(() => [
    { kind: 'select', key: 'person', label: 'Person', value: fPerson, options: personPresent, anyLabel: 'Anyone', onChange: setFPerson },
    { kind: 'select', key: 'type', label: 'Type', value: fType, options: typePresent, anyLabel: 'Any type', optionLabels: PAYMENT_TYPE_LABELS, onChange: setFType },
    { kind: 'select', key: 'status', label: 'Status', value: fStatus, options: statusPresent, anyLabel: 'Any status', optionLabels: PAYMENT_STATUS_LABELS, onChange: setFStatus },
    { kind: 'date', key: 'due_date', label: 'Due Date', from: dateFrom, to: dateTo, onChange: (f, t) => { setDateFrom(f); setDateTo(t); } },
  ], [fPerson, fType, fStatus, dateFrom, dateTo, personPresent, typePresent, statusPresent, setFPerson, setFType, setFStatus, setDateFrom, setDateTo]);

  // Sortable by due date and amount, as specified. Nothing else is offered —
  // sortRows sinks blanks to the bottom in both directions, so an undated
  // payment reads as "unscheduled" rather than "earliest".
  const sortOptions: SortOption<FinancePayment>[] = useMemo(() => [
    { key: 'due_date', label: 'Due Date', kind: 'date', value: p => p.due_date },
    { key: 'amount', label: 'Amount', kind: 'number', value: p => p.amount },
  ], []);

  const filtered = useMemo(() => {
    let r = payments;
    const q = search.trim().toLowerCase();
    if (q) {
      r = r.filter(p =>
        (nameOf[p.person_id || ''] || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q));
    }
    // A focused set is already the exact answer to a question the user just
    // asked, so the saved filters sit this one out — see the `focus` prop.
    if (focus) return sortRows(r, sortOptions, sortKey, sortDir);
    if (fPerson !== 'All') r = r.filter(p => (nameOf[p.person_id || ''] || '') === fPerson);
    if (fType !== 'All') r = r.filter(p => (p.type || '') === fType);
    // A row with no status renders as Pending (see the pill below), so it has to
    // FILTER as Pending too — otherwise it hides from every status filter.
    if (fStatus !== 'All') r = r.filter(p => (p.status || 'pending') === fStatus);
    if (dateFrom || dateTo) r = r.filter(p => inDateRange(p.due_date || undefined, dateFrom, dateTo));
    return sortRows(r, sortOptions, sortKey, sortDir);
  }, [payments, search, focus, fPerson, fType, fStatus, dateFrom, dateTo, sortKey, sortDir, nameOf, sortOptions]);

  const { visible, hasMore, remaining, loadMore } = usePagedRows(
    filtered,
    [search, focus ? 'focus' : '', fPerson, fType, fStatus, dateFrom, dateTo, sortKey, sortDir].join('|'),
  );

  const selected = selectedId ? payments.find(p => p.id === selectedId) ?? null : null;
  const selectedPerson = selected ? personFor(selected.person_id, people) : undefined;

  // Panel fields. Person is a plain select over person ids with the names as
  // display labels — payment details deliberately are NOT editable here: they
  // belong to the person, and the read-only row below links straight to theirs.
  const fields: FieldDef[] = useMemo(() => [
    {
      key: 'person_id',
      label: 'Person',
      type: 'select',
      options: assignable.map(p => p.id),
      optionLabels: Object.fromEntries(assignable.map(p => [p.id, p.name || 'Unnamed'])),
    },
    { key: 'type', label: 'Type', type: 'pill', field: 'finance_payment_type', options: PAYMENT_TYPES, colors: PAYMENT_TYPE_COLORS, optionLabels: PAYMENT_TYPE_LABELS, allowAdd: false, allowEmpty: true },
    { key: 'amount', label: 'Amount', type: 'money' },
    { key: 'status', label: 'Status', type: 'pill', field: 'finance_payment_status', options: PAYMENT_STATUSES, colors: PAYMENT_STATUS_COLORS, optionLabels: PAYMENT_STATUS_LABELS, allowAdd: false },
    { key: 'due_date', label: 'Due Date', type: 'date' },
    // Meaningless on anything but a paid row, so it isn't shown on one. Status
    // is what reveals it (and prefills today, via changeStatus) — the field
    // itself stays fully editable so a payment made weeks ago can be backdated,
    // but it cannot be emptied while the row is paid.
    {
      key: 'paid_date', label: 'Paid Date', type: 'date',
      visibleIf: v => v.status === 'paid',
      validate: (value, v) => paidDateError(v.status, value),
    },
    { key: 'invoice_url', label: 'Invoice', type: 'url' },
    { key: 'description', label: 'Description', type: 'textarea', placeholder: 'What this payment covers' },
    { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Internal notes' },
    // Read-only ON PURPOSE: payment details belong to the person, not to each
    // payment, so editing them here would let two payments to the same person
    // disagree about where the money goes. The link below says where they ARE
    // edited, so read-only doesn't read as broken.
    {
      key: 'pay_via', label: 'Pay Via', type: 'custom',
      render: () => <PayVia person={selectedPerson} onEdit={onOpenPerson} />,
    },
    { key: 'person_role', label: 'Role', type: 'readonly' },
  ], [assignable, selectedPerson, onOpenPerson]);

  // The row plus the two person-derived, read-only rows above. Never written
  // back — the panel only calls onChangeField for editable fields.
  const panelValues = useMemo(() => (selected ? {
    ...selected,
    person_role: selectedPerson?.role ?? '',
  } : {}), [selected, selectedPerson]);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search payments…"
          count={filtered.length}
          countNoun="payment"
          actionLabel="Add Payment"
          onAction={() => { setDraft({ ...EMPTY_DRAFT, person_id: assignable[0]?.id ?? '' }); setAddOpen(true); }}
        >
          <FilterMenu defs={filterDefs} noun="payments" />
          <SortMenu options={sortOptions} sortKey={sortKey} sortDir={sortDir} onKeyChange={setSortKey} onDirChange={setSortDir} defaultKey={DEFAULT_SORT_KEY} defaultDir={DEFAULT_SORT_DIR} />
          <FilterChips defs={filterDefs} />
        </TableToolbar>

        {focus && (
          <div className="table-notice">
            <span className="table-notice-icon" aria-hidden="true">⚠</span>
            <div className="table-notice-body">
              <div className="table-notice-label">{focus.label}</div>
              <div className="table-notice-hint">{focus.hint}</div>
            </div>
            <button type="button" className="table-notice-clear" onClick={focus.onClear}>
              Back to {periodName.toLowerCase()}
            </button>
          </div>
        )}

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>
            {people.length === 0 ? (
              <>
                No one to pay yet.{' '}
                <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 12px', marginLeft: 6 }} onClick={onManagePeople}>Add a person first</button>
              </>
            ) : focus
              ? 'Nothing matches your search in this list. Clear it to see the rest.'
              : `No payments in ${periodName}. Widen the period, adjust filters, or add a payment.`}
          </div>
        ) : (
          <>
            <div className="studio-panel">
              <div className="studio-scroll">
                <table className="studio-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 200 }}>Person</th>
                      <th>Type</th>
                      <th className="st-center">Amount</th>
                      <th className="st-center">Due Date</th>
                      <th className="st-center">Paid Date</th>
                      <th>Status</th>
                      <th>Invoice</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(p => {
                      const status = p.status || 'pending';
                      const overdue = isOverdue(p.due_date || undefined, status, DONE);
                      return (
                        // Rail carries the status colour, or --neg when the due
                        // date has passed — the same precedence Video Review uses.
                        <tr
                          key={p.id}
                          className={selectedId === p.id ? 'is-selected' : undefined}
                          style={{ ...rowAccent(overdue ? 'var(--neg)' : PAYMENT_STATUS_COLORS[status]), cursor: 'pointer' }}
                          onClick={openOnRowClick(() => setSelectedId(p.id))}
                        >
                          <td style={{ minWidth: 200 }}>
                            <TitleCell
                              title={personName(p.person_id, people) ?? 'Unassigned'}
                              onOpen={() => setSelectedId(p.id)}
                            />
                          </td>
                          <td>
                            <EditPillSelect
                              size="md"
                              field="finance_payment_type"
                              value={p.type || ''}
                              options={PAYMENT_TYPES}
                              colors={PAYMENT_TYPE_COLORS}
                              labels={PAYMENT_TYPE_LABELS}
                              onChange={t => patch(p.id, { type: t || null })}
                              allowAdd={false}
                              allowEmpty
                            />
                          </td>
                          <td className="st-center">
                            <InlineMoney value={p.amount} onCommit={v => patch(p.id, { amount: v })} />
                          </td>
                          <td className="st-center">
                            <div className="st-datecell">
                              <InlineDate display="chip" value={p.due_date || undefined} onCommit={d => patch(p.id, { due_date: d || null })} highlight={overdue} />
                              {overdue && <span className="st-overdue">OVERDUE</span>}
                            </div>
                          </td>
                          <td className="st-center">
                            {/* Only a paid row can carry one, so only a paid row
                                offers the picker; everything else rests as a
                                plain dash rather than an editable blank that
                                writes a date the stat cards would never read. */}
                            {status === 'paid' ? (
                              <InlineDate
                                display="text"
                                value={p.paid_date || undefined}
                                // Editable, but never clearable while the row is
                                // paid. onReload() re-reads so the cell snaps
                                // back to the stored date rather than sitting
                                // there looking empty after a refused edit.
                                onCommit={d => {
                                  if (!d) { alert(PAID_NEEDS_DATE); onReload(); return; }
                                  patch(p.id, { paid_date: d });
                                }}
                              />
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>—</span>
                            )}
                          </td>
                          <td>
                            <EditPillSelect
                              size="md"
                              field="finance_payment_status"
                              value={status}
                              options={PAYMENT_STATUSES}
                              colors={PAYMENT_STATUS_COLORS}
                              labels={PAYMENT_STATUS_LABELS}
                              onChange={s => changeStatus(p, s)}
                              allowAdd={false}
                            />
                          </td>
                          <td><UrlCell value={p.invoice_url || undefined} onCommit={u => patch(p.id, { invoice_url: u || null })} /></td>
                          <td>
                            <button
                              className="btn-danger row-action"
                              style={{ padding: '2px 6px' }}
                              onClick={() => confirmDeletePayment(p.id)}
                              title="Delete payment"
                              aria-label="Delete payment"
                            >✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {hasMore && <LoadMore remaining={remaining} onClick={loadMore} />}
          </>
        )}
      </div>

      {selected && (
        <ItemPanel
          itemType="finance_payment"
          itemId={selected.id}
          title={`${personName(selected.person_id, people) ?? 'Unassigned'} · ${formatUSD(selected.amount)}`}
          fields={fields}
          values={panelValues}
          footer={
            <div className="panel-notify">
              <div className="panel-notify-state">
                {selected.notified_at
                  ? `Slack notified ${new Date(selected.notified_at).toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : 'Not announced in Slack yet'}
              </div>
              <button
                type="button"
                className="btn-ghost panel-notify-btn"
                disabled={resending}
                onClick={() => resendNotification(selected)}
                title="Clear the notification stamp and send the Ready to Pay ping again"
              >
                {resending ? 'Sending…' : 'Resend notification'}
              </button>
            </div>
          }
          onChangeField={(key, value) => {
            if (key === 'status') changeStatus(selected, value);
            else if (key === 'person_id') patch(selected.id, { person_id: value || null });
            else if (key === 'amount') patch(selected.id, { amount: Number(value) || 0 });
            // InlineDate hands back undefined when cleared, textareas hand back
            // ''. Both must reach Postgres as an explicit null — an undefined
            // value would be dropped from the JSON body, making the write a no-op.
            else patch(selected.id, { [key]: value === '' || value === undefined ? null : value });
          }}
          onAddOption={() => { /* Finance option sets are fixed in code — see lib/finance.ts */ }}
          // No comment thread and no activity log: both live in tables every
          // authenticated user can read, and a payment discussion must not.
          showComments={false}
          onDelete={() => { deletePayment(selected.id); }}
          onReload={onReload}
          onClose={() => setSelectedId(null)}
        />
      )}

      {toast && (
        <div className={toast.isError ? 'idea-toast is-error' : 'idea-toast'} role="status">{toast.msg}</div>
      )}

      {addOpen && (
        <div className="modal-overlay" onClick={closeAdd}>
          {/* is-tall: the field stack scrolls, the title and the Cancel/Create
              row stay pinned — the form is long enough to outgrow a laptop
              viewport once Paid Date is showing. */}
          <div className="modal-box is-tall" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>New Payment</div>
              <button onClick={closeAdd} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            <div className="modal-body modal-form">
              <DraftField label="Person">
                <Dropdown
                  variant="input"
                  width="100%"
                  value={draft.person_id}
                  options={[
                    { value: '', label: '—' },
                    ...assignable.map(p => ({ value: p.id, label: p.name || 'Unnamed' })),
                  ]}
                  onChange={v => setDraft(d => ({ ...d, person_id: v }))}
                  ariaLabel="Person"
                />
              </DraftField>
              <DraftField label="Type">
                <EditPillSelect field="finance_payment_type" value={draft.type} options={PAYMENT_TYPES} colors={PAYMENT_TYPE_COLORS} labels={PAYMENT_TYPE_LABELS} onChange={t => setDraft(d => ({ ...d, type: t }))} allowAdd={false} allowEmpty />
              </DraftField>
              <DraftField label="Amount (USD)">
                <input
                  className="form-input"
                  inputMode="decimal"
                  value={draft.amount}
                  onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))}
                  placeholder="0.00"
                  style={{ width: 140, fontSize: 12 }}
                />
              </DraftField>
              <DraftField label="Status">
                <EditPillSelect field="finance_payment_status" value={draft.status} options={PAYMENT_STATUSES} colors={PAYMENT_STATUS_COLORS} labels={PAYMENT_STATUS_LABELS} onChange={s => { setDraft(d => ({ ...d, status: s, paid_date: paidDateForStatus(s, d.paid_date) })); setDraftError(null); }} allowAdd={false} />
              </DraftField>
              <DraftField label="Due Date">
                <input className="form-input" type="date" value={draft.due_date} onChange={e => setDraft(d => ({ ...d, due_date: e.target.value }))} onClick={openDatePicker} style={{ width: 160, fontSize: 12 }} />
              </DraftField>
              {/* Revealed by Status alone — see paidDateForStatus. Prefilled with
                  today because that's right most of the time, and left editable
                  because when it isn't, the whole point is to backdate it. */}
              {draft.status === 'paid' && (
                <DraftField label="Paid Date">
                  <input
                    className={`form-input${draftError ? ' is-invalid' : ''}`}
                    type="date"
                    required
                    aria-invalid={draftError ? true : undefined}
                    aria-describedby={draftError ? 'paid-date-error' : undefined}
                    value={draft.paid_date}
                    onChange={e => { setDraft(d => ({ ...d, paid_date: e.target.value })); setDraftError(null); }}
                    onClick={openDatePicker}
                    style={{ width: 160, fontSize: 12 }}
                  />
                  {draftError ? (
                    <div id="paid-date-error" className="form-error" role="alert">{draftError}</div>
                  ) : (
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 5, lineHeight: 1.4 }}>
                      Required. Decides which month this lands in on the Paid card — backdate it if the money moved earlier.
                    </div>
                  )}
                </DraftField>
              )}
              <DraftField label="Invoice">
                <input className="form-input" value={draft.invoice_url} onChange={e => setDraft(d => ({ ...d, invoice_url: e.target.value }))} placeholder="https://…" style={{ width: '100%', fontSize: 12 }} />
              </DraftField>
              <DraftField label="Description">
                <textarea className="form-input" value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="What this payment covers" rows={2} style={{ resize: 'vertical', fontSize: 12, lineHeight: 1.4, width: '100%' }} />
              </DraftField>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }} onClick={closeAdd}>Cancel</button>
              <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={createPayment} disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * How to actually pay this payment's person — the row Maciek works from.
 *
 * Reads through paymentDetails(), the same resolution the People table's Payment
 * column uses, so the roster and this panel can never describe someone's method
 * differently. Read-only here by design; the "Edit on <name>" link is what keeps
 * that from reading as a dead end.
 *
 * SECURITY: this is the only place bank details render outside the person
 * record, and both sit behind the admin-only Finance tab and its RLS policy.
 * Nothing here is exported, logged, or sent to Slack.
 */
function PayVia({
  person,
  onEdit,
}: {
  person: FinancePerson | undefined;
  onEdit: (personId: string) => void;
}) {
  if (!person) {
    return <span className="pay-via-empty">No person assigned to this payment yet.</span>;
  }
  const d = paymentDetails(person);
  return (
    <div className="pay-via">
      <div className="pay-via-head">
        <span className="pay-chip" style={{ '--pay-color': d.color } as React.CSSProperties}>{d.methodLabel}</span>
        {d.hasDetails && <CopyValue value={d.value} label="Copy" what={`${d.methodLabel.toLowerCase()} for ${person.name || 'this person'}`} />}
      </div>

      {d.hasDetails ? (
        d.method === 'link'
          ? <a className="pay-via-link" href={d.value} target="_blank" rel="noopener noreferrer">{d.value}</a>
          // Bank blocks are multi-line by nature (holder, IBAN, SWIFT) — shown
          // as written, in a monospaced block so an IBAN can be read digit by
          // digit rather than as a wrapped sentence.
          : <div className="pay-via-block">{d.value}</div>
      ) : (
        <div className="pay-via-missing">
          No payment details on file — add them on the person record.
        </div>
      )}

      {d.notes && d.method !== 'other' && <div className="pay-via-notes">{d.notes}</div>}

      <button type="button" className="pay-via-edit" onClick={() => onEdit(person.id)}>
        Edit on {person.name || 'this person'} →
      </button>
    </div>
  );
}

// Label + control row for the Add form, matching the detail panel's layout —
// the same shape Video Review's New Video modal uses. The grid lives in
// .modal-field now (same 120px label column, more room between rows), so the
// spacing is one place rather than a number repeated down the form.
function DraftField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="modal-field">
      <div className="modal-field-label">{label}</div>
      <div>{children}</div>
    </div>
  );
}
