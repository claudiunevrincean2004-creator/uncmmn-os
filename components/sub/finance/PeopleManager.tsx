'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDialogs } from '@/components/DialogProvider';
import { supabase } from '@/lib/supabase';
import { FinancePerson, FinancePayment, Profile } from '@/lib/types';
import { formatUSD } from '@/lib/utils';
import {
  PERSON_STATUSES, PERSON_STATUS_LABELS, PERSON_STATUS_COLORS,
  PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PAYMENT_METHOD_COLORS, PAYMENT_METHOD_SHORT,
  DEFAULT_PAYMENT_METHOD, paymentDetails,
  PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, PAYMENT_TYPE_LABELS, anchorDate,
} from '@/lib/finance';
import CopyValue from './CopyValue';

import { EditPillSelect, InlineText } from '../studio/cells';
import TableToolbar, { rowAccent, openOnRowClick, TitleCell } from '../studio/table-ui';
import ItemPanel, { FieldDef } from '../studio/ItemPanel';
import { UserPicker } from '../studio/UserPicker';

// The roster behind the Payments table. Payment details (the Wise/PayPal/Revolut
// link) live HERE, once per person — a payment row references its person and
// never carries a copy.
//
// Same table shell, same toolbar, same widened detail panel as everywhere else;
// no Filter/Sort popovers, because a roster this size is a search box's job.

interface PersonDraft {
  name: string;
  role: string;
  payment_method: string;
  payment_link: string;
  bank_details: string;
  payment_notes: string;
  status: string;
  profile_id: string;
  notes: string;
}
const EMPTY_DRAFT: PersonDraft = {
  name: '',
  role: '',
  // Most contributors can't generate a payment link, so the form opens on the
  // common case rather than on the exception.
  payment_method: DEFAULT_PAYMENT_METHOD,
  payment_link: '',
  bank_details: '',
  payment_notes: '',
  status: 'active',
  profile_id: '',
  notes: '',
};

interface Props {
  people: FinancePerson[];
  /** Scoped to the tab's period — drives the Outstanding column, so the roster
   *  agrees with the stat cards above it. */
  payments: FinancePayment[];
  /** EVERY payment, period ignored. The delete guard must use this: person_id is
   *  `on delete restrict`, so judging by the current window alone would offer a
   *  delete for someone whose history simply sits outside it, and the database
   *  would then refuse the write. */
  allPayments: FinancePayment[];
  /** The active period, to label the Outstanding column honestly. */
  periodName: string;
  /** OS logins, for the optional profile link. Plenty of people we pay have none. */
  profiles: Profile[];
  /** Open this person's panel on arrival — set when a payment's Pay Via section
   *  sends the user here to edit the details. One-shot; cleared via onOpened. */
  openPersonId?: string | null;
  onOpened?: () => void;
  /** Jump to a single payment (from the person's history list). */
  onOpenPayment: (paymentId: string) => void;
  /** Jump to the Payments table, filtered to this person by name. */
  onViewPayments: (personName: string) => void;
  onReload: () => void;
}

export default function PeopleManager({ people, payments, allPayments, periodName, profiles, openPersonId, onOpened, onOpenPayment, onViewPayments, onReload }: Props) {
  const { toastError, confirm: askConfirm } = useDialogs();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<PersonDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);

  // Arriving from a payment's "Edit on <name>" link. Same one-shot idiom the
  // Studio tables use for Slack deep links.
  useEffect(() => { if (openPersonId) { setSelectedId(openPersonId); onOpened?.(); } }, [openPersonId, onOpened]);

  // Per-person unpaid total for the active period, so the roster says who is
  // owed what without opening anything.
  const totals = useMemo(() => {
    const m: Record<string, { outstanding: number; count: number }> = {};
    payments.forEach(p => {
      if (!p.person_id) return;
      const t = m[p.person_id] ?? (m[p.person_id] = { outstanding: 0, count: 0 });
      t.count++;
      if (p.status !== 'paid') t.outstanding += Number(p.amount) || 0;
    });
    return m;
  }, [payments]);

  // Payments per person across ALL time — what the delete guard reads.
  const everCount = useMemo(() => {
    const m: Record<string, number> = {};
    allPayments.forEach(p => { if (p.person_id) m[p.person_id] = (m[p.person_id] || 0) + 1; });
    return m;
  }, [allPayments]);

  async function patch(id: string, p: Partial<FinancePerson>) {
    const { error } = await supabase.from('finance_people').update(p).eq('id', id);
    if (error) {
      // Log which FIELDS failed, never their values — a patch here can carry
      // bank details, and a console line is a view like any other.
      console.error('[Finance] failed to update person', { id, fields: Object.keys(p), error });
      toastError(`Couldn't save changes: ${error.message}`);
    }
    onReload();
  }

  async function createPerson() {
    if (creating) return;
    const name = draft.name.trim();
    if (!name) { toastError('A name is required.'); return; }
    setCreating(true);
    const row = {
      name,
      role: draft.role.trim() || null,
      payment_method: draft.payment_method || DEFAULT_PAYMENT_METHOD,
      // Only the field the chosen method actually uses is written. Switching
      // method in the form and back must not quietly persist the other one.
      payment_link: draft.payment_method === 'link' ? (draft.payment_link.trim() || null) : null,
      bank_details: draft.payment_method === 'bank' ? (draft.bank_details.trim() || null) : null,
      payment_notes: draft.payment_notes.trim() || null,
      status: draft.status || 'active',
      profile_id: draft.profile_id || null,
      notes: draft.notes.trim() || null,
    };
    const { error } = await supabase.from('finance_people').insert([row]);
    setCreating(false);
    if (error) {
      // Fields, never values: `row` carries bank details, and a console line is
      // a view like any other. Same rule as patch() above.
      console.error('[Finance] failed to create person', { fields: Object.keys(row), error });
      toastError(`Couldn't add person: ${error.message}`);
      return;
    }
    closeAdd();
    onReload();
  }

  function closeAdd() {
    setAddOpen(false);
    setDraft(EMPTY_DRAFT);
  }

  // finance_payments.person_id is `on delete restrict`, so the database refuses
  // to drop someone who still has payment history. Catch that here and say so in
  // plain words, then point at the alternative — mark them Inactive.
  async function deletePerson(id: string) {
    const n = everCount[id] || 0;
    if (n > 0) {
      toastError(`This person has ${n} payment${n === 1 ? '' : 's'} on record, so they can't be deleted — that history would be lost. Set their status to Inactive instead.`);
      return;
    }
    const { error } = await supabase.from('finance_people').delete().eq('id', id);
    if (error) { toastError(`Couldn't delete person: ${error.message}`); return; }
    if (selectedId === id) setSelectedId(null);
    onReload();
  }

  // The row button asks first; the panel's Delete already has ConfirmDelete's
  // own two-step, so it calls deletePerson directly.
  async function confirmDeletePerson(id: string) {
    if (!(await askConfirm('Delete this person?'))) return;
    deletePerson(id);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? people.filter(p => (p.name || '').toLowerCase().includes(q) || (p.role || '').toLowerCase().includes(q))
      : people;
    // Active first, then alphabetically — the roster's own natural order.
    return [...rows].sort((a, b) => {
      const aa = (a.status ?? 'active') === 'inactive' ? 1 : 0;
      const bb = (b.status ?? 'active') === 'inactive' ? 1 : 0;
      return aa - bb || (a.name || '').localeCompare(b.name || '');
    });
  }, [people, search]);

  const selected = selectedId ? people.find(p => p.id === selectedId) ?? null : null;

  // This person's FULL history, newest first — deliberately from allPayments,
  // not the period-scoped list, because a person's record is their whole record.
  // No refetch: these rows are already in state, so this is a filter.
  const history = useMemo(() => {
    if (!selected) return [];
    return allPayments
      .filter(p => p.person_id === selected.id)
      // anchorDate is the tab's one filing rule — paid_date once paid, due_date
      // before that — so this list orders the same way the cards count.
      .sort((a, b) => (anchorDate(b) || '').localeCompare(anchorDate(a) || ''));
  }, [allPayments, selected]);

  const fields: FieldDef[] = useMemo(() => [
    { key: 'name', label: 'Name', type: 'text', placeholder: 'Full name' },
    { key: 'role', label: 'Role', type: 'text', placeholder: 'Editor, Clipper, Designer…' },
    {
      key: 'payment_method', label: 'Pay By', type: 'pill', field: 'finance_payment_method',
      options: PAYMENT_METHODS, colors: PAYMENT_METHOD_COLORS, optionLabels: PAYMENT_METHOD_LABELS,
      allowAdd: false,
    },
    // Each detail field shows only for the method that uses it — an IBAN box on
    // someone paid by link is noise, and a link box on someone paid by transfer
    // is a dead end. Notes always show: currency and reference apply either way.
    {
      key: 'payment_link', label: 'Payment Link', type: 'url',
      visibleIf: v => (v.payment_method || DEFAULT_PAYMENT_METHOD) === 'link',
    },
    {
      key: 'bank_details', label: 'Bank Details', type: 'textarea',
      placeholder: 'Account holder, IBAN / account number, SWIFT…',
      visibleIf: v => (v.payment_method || DEFAULT_PAYMENT_METHOD) === 'bank',
    },
    { key: 'payment_notes', label: 'Payment Notes', type: 'textarea', placeholder: 'Preferred currency, required reference…' },
    { key: 'status', label: 'Status', type: 'pill', field: 'finance_person_status', options: PERSON_STATUSES, colors: PERSON_STATUS_COLORS, optionLabels: PERSON_STATUS_LABELS, allowAdd: false },
    // Optional: many people we pay have no OS login at all, so this is never
    // required and is never consulted for access.
    { key: 'profile_id', label: 'OS Account', type: 'user' },
    { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Internal notes' },
  ], []);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search people…"
          count={filtered.length}
          countNoun="person"
          countPlural="people"
          actionLabel="Add Person"
          onAction={() => { setDraft(EMPTY_DRAFT); setAddOpen(true); }}
        />

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>
            {people.length === 0 ? 'No one here yet. Add the first person you pay.' : 'No one matches that search.'}
          </div>
        ) : (
          <div className="studio-panel">
            <div className="studio-scroll">
              <table className="studio-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 200 }}>Name</th>
                    <th>Role</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th className="st-center" title={`Unpaid total in ${periodName}`}>Outstanding</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const status = p.status ?? 'active';
                    const t = totals[p.id];
                    return (
                      <tr
                        key={p.id}
                        className={selectedId === p.id ? 'is-selected' : undefined}
                        style={{ ...rowAccent(PERSON_STATUS_COLORS[status]), cursor: 'pointer' }}
                        onClick={openOnRowClick(() => setSelectedId(p.id))}
                      >
                        <td style={{ minWidth: 200 }}>
                          <TitleCell title={p.name || 'Unnamed'} onOpen={() => setSelectedId(p.id)} />
                        </td>
                        <td>
                          <InlineText value={p.role || ''} onCommit={v => patch(p.id, { role: v || null })} placeholder="—" style={{ width: 150 }} />
                        </td>
                        <td>{/* Method at a glance plus one-click copy of the
                              underlying value — the details themselves stay in
                              the panel rather than sitting in a scannable
                              column. */}
                          {(() => {
                            const d = paymentDetails(p);
                            return (
                              <div className="pay-cell">
                                <span className="pay-chip" style={{ '--pay-color': d.color } as React.CSSProperties}>
                                  {PAYMENT_METHOD_SHORT[d.method] ?? d.method}
                                </span>
                                {d.hasDetails
                                  ? <CopyValue value={d.value} variant="icon" what={`${d.methodLabel.toLowerCase()} for ${p.name || 'this person'}`} />
                                  : <span className="pay-missing" title="No payment details on file">Not set</span>}
                              </div>
                            );
                          })()}
                        </td>
                        <td>
                          <EditPillSelect
                            size="md"
                            field="finance_person_status"
                            value={status}
                            options={PERSON_STATUSES}
                            colors={PERSON_STATUS_COLORS}
                            labels={PERSON_STATUS_LABELS}
                            onChange={s => patch(p.id, { status: s })}
                            allowAdd={false}
                          />
                        </td>
                        <td className="st-center">
                          <span
                            style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: t && t.outstanding > 0 ? 'var(--text)' : 'var(--text-faint)' }}
                            title={t ? `${t.count} payment${t.count === 1 ? '' : 's'} in ${periodName}` : `No payments in ${periodName}`}
                          >
                            {formatUSD(t?.outstanding ?? 0)}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn-danger row-action"
                            style={{ padding: '2px 6px' }}
                            onClick={() => confirmDeletePerson(p.id)}
                            title="Delete person"
                            aria-label="Delete person"
                          >✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <ItemPanel
          itemType="finance_person"
          itemId={selected.id}
          title={selected.name || 'Unnamed'}
          fields={fields}
          values={selected}
          footer={
            <PaymentHistory
              rows={history}
              onOpen={onOpenPayment}
              onViewAll={() => onViewPayments(selected.name || '')}
            />
          }
          // Blank ('' from a text field) and undefined (a cleared date) both have
          // to reach Postgres as an explicit null — an undefined value would be
          // dropped from the JSON body, making the write a silent no-op.
          onChangeField={(key, value) => patch(selected.id, { [key]: value === '' || value === undefined ? null : value })}
          onAddOption={() => { /* Finance option sets are fixed in code — see lib/finance.ts */ }}
          showComments={false}
          profiles={profiles}
          onDelete={() => { deletePerson(selected.id); }}
          onReload={onReload}
          onClose={() => setSelectedId(null)}
        />
      )}

      {addOpen && (
        <div className="modal-overlay" onClick={closeAdd}>
          <div className="modal-box" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>New Person</div>
              <button onClick={closeAdd} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <DraftField label="Name">
                <input className="form-input" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Full name" style={{ width: '100%', fontSize: 12 }} />
              </DraftField>
              <DraftField label="Role">
                <input className="form-input" value={draft.role} onChange={e => setDraft(d => ({ ...d, role: e.target.value }))} placeholder="Editor, Clipper, Designer…" style={{ width: '100%', fontSize: 12 }} />
              </DraftField>
              <DraftField label="Pay By">
                <EditPillSelect field="finance_payment_method" value={draft.payment_method} options={PAYMENT_METHODS} colors={PAYMENT_METHOD_COLORS} labels={PAYMENT_METHOD_LABELS} onChange={m => setDraft(d => ({ ...d, payment_method: m }))} allowAdd={false} />
              </DraftField>
              {/* Only the field the chosen method uses — see createPerson, which
                  writes only that one. */}
              {draft.payment_method === 'link' && (
                <DraftField label="Payment Link">
                  <input className="form-input" value={draft.payment_link} onChange={e => setDraft(d => ({ ...d, payment_link: e.target.value }))} placeholder="https://wise.com/pay/…" style={{ width: '100%', fontSize: 12 }} />
                </DraftField>
              )}
              {draft.payment_method === 'bank' && (
                <DraftField label="Bank Details">
                  <textarea className="form-input" value={draft.bank_details} onChange={e => setDraft(d => ({ ...d, bank_details: e.target.value }))} placeholder={'Account holder\nIBAN / account number\nSWIFT / sort code'} rows={3} style={{ resize: 'vertical', fontSize: 12, lineHeight: 1.45, width: '100%' }} />
                </DraftField>
              )}
              <DraftField label="Payment Notes">
                <textarea className="form-input" value={draft.payment_notes} onChange={e => setDraft(d => ({ ...d, payment_notes: e.target.value }))} placeholder="Preferred currency, required reference…" rows={2} style={{ resize: 'vertical', fontSize: 12, lineHeight: 1.4, width: '100%' }} />
              </DraftField>
              <DraftField label="Status">
                <EditPillSelect field="finance_person_status" value={draft.status} options={PERSON_STATUSES} colors={PERSON_STATUS_COLORS} labels={PERSON_STATUS_LABELS} onChange={s => setDraft(d => ({ ...d, status: s }))} allowAdd={false} />
              </DraftField>
              <DraftField label="OS Account">
                <UserPicker value={draft.profile_id} profiles={profiles} onChange={uid => setDraft(d => ({ ...d, profile_id: uid }))} />
              </DraftField>
              <DraftField label="Notes">
                <textarea className="form-input" value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} placeholder="Internal notes" rows={2} style={{ resize: 'vertical', fontSize: 12, lineHeight: 1.4, width: '100%' }} />
              </DraftField>
            </div>

            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 12, lineHeight: 1.5 }}>
              Payment details live only in this admin-only tab — they are never exported and never sent to Slack. An OS account is optional; plenty of people paid here have no login.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }} onClick={closeAdd}>Cancel</button>
              <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={createPerson} disabled={creating}>{creating ? 'Adding…' : 'Add Person'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const HISTORY_LIMIT = 10;

/**
 * A person's payments, compact, inside their panel. A list — not a second
 * payments table — so it carries the four things you'd scan for and nothing
 * else. Deliberately NO totals: the roster's Outstanding column and the stat
 * cards are where figures live, and a third place to add money up is a third
 * place for it to disagree.
 */
function PaymentHistory({
  rows,
  onOpen,
  onViewAll,
}: {
  rows: FinancePayment[];
  onOpen: (paymentId: string) => void;
  onViewAll: () => void;
}) {
  const shown = rows.slice(0, HISTORY_LIMIT);
  return (
    <div className="pay-hist">
      <div className="pay-hist-head">
        Payments
        {rows.length > 0 && <span className="pay-hist-count">{rows.length}</span>}
      </div>

      {rows.length === 0 ? (
        <div className="pay-hist-empty">No payments yet</div>
      ) : (
        <>
          <div className="pay-hist-list">
            {shown.map(p => {
              const status = p.status || 'pending';
              const date = anchorDate(p);
              return (
                <button key={p.id} type="button" className="pay-hist-row" onClick={() => onOpen(p.id)}>
                  <span className="pay-hist-amount">{formatUSD(p.amount)}</span>
                  <span className="pay-hist-type">{p.type ? (PAYMENT_TYPE_LABELS[p.type] ?? p.type) : '—'}</span>
                  {/* Same colour map the payments table's status pill reads. */}
                  <span className="pay-hist-pill" style={{ '--pay-color': PAYMENT_STATUS_COLORS[status] } as React.CSSProperties}>
                    {PAYMENT_STATUS_LABELS[status] ?? status}
                  </span>
                  <span className="pay-hist-date" title={status === 'paid' ? 'Paid date' : 'Due date'}>
                    {date
                      ? new Date(`${date}T00:00:00`).toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </span>
                </button>
              );
            })}
          </div>
          {rows.length > HISTORY_LIMIT && (
            <button type="button" className="pay-hist-all" onClick={onViewAll}>
              View all {rows.length} in Payments →
            </button>
          )}
        </>
      )}
    </div>
  );
}

function DraftField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'start' }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, paddingTop: 6 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}
