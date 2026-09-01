'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { FinancePayment, FinancePerson } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { usePagedRows } from '@/lib/use-paged-rows';
import { formatUSD, parseUSD } from '@/lib/utils';
import { SortOption, SortDir, sortRows } from '@/lib/sort';
import { inDateRange, isOverdue, todayISO } from '@/lib/studio';
import {
  PAYMENT_TYPES, PAYMENT_TYPE_LABELS, PAYMENT_TYPE_COLORS,
  PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
  personFor, personName,
} from '@/lib/finance';

// Everything below the surface is borrowed wholesale from Video Review — the
// same toolbar, the same collapsed Filter/Sort popovers, the same table shell,
// the same widened detail panel. Nothing here is a parallel implementation.
import { EditPillSelect, InlineDate, InlineMoney, UrlCell, openDatePicker } from '../studio/cells';
import TableToolbar, { rowAccent, openOnRowClick, TitleCell } from '../studio/table-ui';
import { FilterMenu, FilterChips, SortMenu, type FilterDef } from '../studio/FilterMenu';
import ItemPanel, { FieldDef } from '../studio/ItemPanel';
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

interface Props {
  /** ALREADY scoped to the tab's period by FinanceTab — this component filters
   *  and sorts what it's given and never re-applies the period itself, so the
   *  stat cards above and these rows are always the same set of payments. */
  payments: FinancePayment[];
  people: FinancePerson[];
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
  onReload: () => void;
}

export default function PaymentsTable({ payments, people, focus, periodName, onManagePeople, onReload }: Props) {
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
  const [creating, setCreating] = useState(false);

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

  // Moving a payment to Paid stamps today's date when there isn't one yet (and
  // clearing Paid drops it), so "Paid this month" is never wrong just because
  // someone forgot the second field.
  async function changeStatus(row: FinancePayment, status: string) {
    if (status === row.status) return;
    const p: Partial<FinancePayment> = { status };
    if (status === 'paid' && !row.paid_date) p.paid_date = todayISO();
    if (status !== 'paid' && row.paid_date) p.paid_date = null;
    await patch(row.id, p);
  }

  async function createPayment() {
    if (creating) return;
    setCreating(true);
    const row = {
      person_id: draft.person_id || null,
      type: draft.type || null,
      amount: parseUSD(draft.amount) ?? 0,
      status: draft.status || 'pending',
      due_date: draft.due_date || null,
      // Only ever written for a paid row — the field isn't even shown otherwise,
      // and a paid_date on a pending payment would be counted by nothing and
      // read as a contradiction.
      paid_date: draft.status === 'paid' ? (draft.paid_date || todayISO()) : null,
      invoice_url: draft.invoice_url.trim() || null,
      description: draft.description.trim() || null,
      // Currency stays at its 'USD' default — everything here is USD and no UI
      // reads the column.
    };
    const { error } = await supabase.from('finance_payments').insert([row]);
    setCreating(false);
    if (error) {
      console.error('[Finance] failed to create payment', { row, error });
      alert(`Couldn't create payment: ${error.message}`);
      return;
    }
    closeAdd();
    onReload();
  }

  function closeAdd() {
    setAddOpen(false);
    setDraft(EMPTY_DRAFT);
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
    // itself stays fully editable so a payment made weeks ago can be backdated.
    { key: 'paid_date', label: 'Paid Date', type: 'date', visibleIf: v => v.status === 'paid' },
    { key: 'invoice_url', label: 'Invoice', type: 'url' },
    { key: 'description', label: 'Description', type: 'textarea', placeholder: 'What this payment covers' },
    { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Internal notes' },
    // Read-only: the payment link lives on the PERSON, never on the payment.
    { key: 'person_payment_link', label: 'Pay Via', type: 'readonly-url-short' },
    { key: 'person_role', label: 'Role', type: 'readonly' },
  ], [assignable]);

  // The row plus the two person-derived, read-only rows above. Never written
  // back — the panel only calls onChangeField for editable fields.
  const panelValues = useMemo(() => (selected ? {
    ...selected,
    person_payment_link: selectedPerson?.payment_link ?? '',
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
                              <InlineDate display="text" value={p.paid_date || undefined} onCommit={d => patch(p.id, { paid_date: d || null })} />
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

      {addOpen && (
        <div className="modal-overlay" onClick={closeAdd}>
          <div className="modal-box" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>New Payment</div>
              <button onClick={closeAdd} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <DraftField label="Person">
                <select
                  className="form-input"
                  style={{ width: '100%', fontSize: 12 }}
                  value={draft.person_id}
                  onChange={e => setDraft(d => ({ ...d, person_id: e.target.value }))}
                >
                  <option value="">—</option>
                  {assignable.map(p => <option key={p.id} value={p.id}>{p.name || 'Unnamed'}</option>)}
                </select>
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
                <EditPillSelect field="finance_payment_status" value={draft.status} options={PAYMENT_STATUSES} colors={PAYMENT_STATUS_COLORS} labels={PAYMENT_STATUS_LABELS} onChange={s => setDraft(d => ({ ...d, status: s, paid_date: paidDateForStatus(s, d.paid_date) }))} allowAdd={false} />
              </DraftField>
              <DraftField label="Due Date">
                <input className="form-input" type="date" value={draft.due_date} onChange={e => setDraft(d => ({ ...d, due_date: e.target.value }))} onClick={openDatePicker} style={{ width: 160, fontSize: 12 }} />
              </DraftField>
              {/* Revealed by Status alone — see paidDateForStatus. Prefilled with
                  today because that's right most of the time, and left editable
                  because when it isn't, the whole point is to backdate it. */}
              {draft.status === 'paid' && (
                <DraftField label="Paid Date">
                  <input className="form-input" type="date" value={draft.paid_date} onChange={e => setDraft(d => ({ ...d, paid_date: e.target.value }))} onClick={openDatePicker} style={{ width: 160, fontSize: 12 }} />
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 5, lineHeight: 1.4 }}>
                    Which month this lands in on the Paid card. Backdate it if the money moved earlier.
                  </div>
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

// Label + control row for the Add form, matching the detail panel's layout —
// the same shape Video Review's New Video modal uses.
function DraftField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'start' }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, paddingTop: 6 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}
