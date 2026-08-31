'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { FinancePerson, FinancePayment, Profile } from '@/lib/types';
import { formatUSD } from '@/lib/utils';
import { PERSON_STATUSES, PERSON_STATUS_LABELS, PERSON_STATUS_COLORS } from '@/lib/finance';

import { EditPillSelect, InlineText, UrlCell } from '../studio/cells';
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
  payment_link: string;
  status: string;
  profile_id: string;
  notes: string;
}
const EMPTY_DRAFT: PersonDraft = {
  name: '',
  role: '',
  payment_link: '',
  status: 'active',
  profile_id: '',
  notes: '',
};

interface Props {
  people: FinancePerson[];
  /** Read-only here — used for each person's outstanding total and to block a
   *  delete that would orphan payments. */
  payments: FinancePayment[];
  /** OS logins, for the optional profile link. Plenty of people we pay have none. */
  profiles: Profile[];
  onReload: () => void;
}

export default function PeopleManager({ people, payments, profiles, onReload }: Props) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<PersonDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);

  // Per-person unpaid total and payment count, so the roster says who is owed
  // what without opening anything.
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

  async function patch(id: string, p: Partial<FinancePerson>) {
    const { error } = await supabase.from('finance_people').update(p).eq('id', id);
    if (error) {
      console.error('[Finance] failed to update person', { id, patch: p, error });
      alert(`Couldn't save changes: ${error.message}`);
    }
    onReload();
  }

  async function createPerson() {
    if (creating) return;
    const name = draft.name.trim();
    if (!name) { alert('A name is required.'); return; }
    setCreating(true);
    const row = {
      name,
      role: draft.role.trim() || null,
      payment_link: draft.payment_link.trim() || null,
      status: draft.status || 'active',
      profile_id: draft.profile_id || null,
      notes: draft.notes.trim() || null,
    };
    const { error } = await supabase.from('finance_people').insert([row]);
    setCreating(false);
    if (error) {
      console.error('[Finance] failed to create person', { row, error });
      alert(`Couldn't add person: ${error.message}`);
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
    const t = totals[id];
    if (t && t.count > 0) {
      alert(`This person has ${t.count} payment${t.count === 1 ? '' : 's'} on record, so they can't be deleted — that history would be lost. Set their status to Inactive instead.`);
      return;
    }
    const { error } = await supabase.from('finance_people').delete().eq('id', id);
    if (error) { alert(`Couldn't delete person: ${error.message}`); return; }
    if (selectedId === id) setSelectedId(null);
    onReload();
  }

  // The row button asks first; the panel's Delete already has ConfirmDelete's
  // own two-step, so it calls deletePerson directly.
  function confirmDeletePerson(id: string) {
    if (!confirm('Delete this person?')) return;
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

  const fields: FieldDef[] = useMemo(() => [
    { key: 'name', label: 'Name', type: 'text', placeholder: 'Full name' },
    { key: 'role', label: 'Role', type: 'text', placeholder: 'Editor, Clipper, Designer…' },
    { key: 'payment_link', label: 'Payment Link', type: 'url' },
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
                    <th>Payment Link</th>
                    <th>Status</th>
                    <th className="st-center">Outstanding</th>
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
                        <td><UrlCell value={p.payment_link || undefined} onCommit={u => patch(p.id, { payment_link: u || null })} /></td>
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
                            title={t ? `${t.count} payment${t.count === 1 ? '' : 's'} on record` : 'No payments yet'}
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
              <DraftField label="Payment Link">
                <input className="form-input" value={draft.payment_link} onChange={e => setDraft(d => ({ ...d, payment_link: e.target.value }))} placeholder="https://wise.com/pay/…" style={{ width: '100%', fontSize: 12 }} />
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
              Payment links only — never bank details. An OS account is optional; plenty of people paid here have no login.
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

function DraftField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'start' }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, paddingTop: 6 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}
