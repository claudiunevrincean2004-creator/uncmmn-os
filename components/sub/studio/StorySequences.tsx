'use client';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioSequence, StudioComment, StudioActivity, StudioDropdownOption, CustomProperty, CustomPropertyOption, Profile } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import {
  SEQUENCE_STATUSES, SEQUENCE_STATUS_COLORS,
  isOverdue, logActivity, inDateRange, getFieldOptions, colorMap, buildAddOptionRows,
} from '@/lib/studio';
import { EditPillSelect, MiniSelect, UrlCell, InlineDate } from './cells';
import ItemPanel, { FieldDef } from './ItemPanel';
import { sortProps, groupOptions, applyCustomFilters, CustomHeaderCells, CustomRowCells, CustomFilterControls, PropertyManagerModal } from './CustomColumns';
import FieldOptionsManager from './FieldOptionsManager';

const DONE = ['Posted'];
const TABLE_KEY = 'sequence';

// Statuses whose transition fires a Slack notification (see /api/story-notify).
const STORY_NOTIFY_STATUSES = ['Ready for Review', 'Approved', 'Revision Requested'];

// In-code fallback options per built-in select field, so adding an option can
// backfill them as rows instead of dropping them (see buildAddOptionRows).
const FIELD_FALLBACKS: Record<string, { values: string[]; colors?: Record<string, string> }> = {
  sequence_status: { values: SEQUENCE_STATUSES, colors: SEQUENCE_STATUS_COLORS },
};

// Draft for the "Add Sequence" form. The row is only written to the database
// when the user clicks Create; closing/cancelling resets back to this.
interface SequenceDraft {
  title: string;
  status: string;
  final_url: string;
  scheduled_date: string;
}
const EMPTY_DRAFT: SequenceDraft = {
  title: '',
  status: 'Draft',
  final_url: '',
  scheduled_date: '',
};

interface Props {
  sequences: StudioSequence[];
  comments: StudioComment[];
  activity: StudioActivity[];
  dropdownOptions: StudioDropdownOption[];
  properties: CustomProperty[];
  customOptions: CustomPropertyOption[];
  profiles: Profile[];
  isAdmin: boolean;
  onReload: () => void;
}

export default function StorySequences({ sequences, comments, activity, dropdownOptions, properties, customOptions, profiles, isAdmin, onReload }: Props) {
  const [fStatus, setFStatus] = usePersistedState<string>('studio_s_status', 'All');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('studio_s_sortdir', 'asc');
  const [dateFrom, setDateFrom] = usePersistedState<string>('studio_s_from', '');
  const [dateTo, setDateTo] = usePersistedState<string>('studio_s_to', '');
  const [custFilters, setCustFilters] = usePersistedState<Record<string, string>>('studio_s_custfilters', {});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mgrOpen, setMgrOpen] = useState(false);
  const [optsField, setOptsField] = useState<{ field: string; title: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<SequenceDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);

  const cprops = useMemo(() => sortProps(properties, TABLE_KEY), [properties]);
  const optsByProp = useMemo(() => groupOptions(customOptions), [customOptions]);

  const statusFieldOpts = getFieldOptions(dropdownOptions, 'sequence_status', SEQUENCE_STATUSES, SEQUENCE_STATUS_COLORS);
  const statusValues = statusFieldOpts.map(o => o.value);
  const statusColors = colorMap(statusFieldOpts);

  async function addOption(field: string, value: string) {
    const fb = FIELD_FALLBACKS[field] ?? { values: [] };
    const rows = buildAddOptionRows(field, value, fb.values, fb.colors, dropdownOptions);
    if (rows.length) await supabase.from('studio_dropdown_options').insert(rows);
    onReload();
  }

  async function patch(id: string, p: Partial<StudioSequence>) {
    // Detect a transition INTO a notify status from the pre-update row BEFORE
    // writing. Doing it here (rather than only in changeStatus) means the Slack
    // notify fires no matter which handler set the status — the inline Status
    // pill or the detail panel — and never on a re-save while already in it.
    const prev = sequences.find(x => x.id === id);
    const becoming = p.status && STORY_NOTIFY_STATUSES.includes(p.status) && prev?.status !== p.status ? p.status : null;

    const { error } = await supabase.from('studio_sequences').update(p).eq('id', id);
    if (error) {
      // Surface write failures instead of silently reverting on the next reload.
      console.error('[StorySequences] failed to update sequence', { id, patch: p, error });
      alert(`Couldn't save change: ${error.message}`);
    }
    onReload();

    if (!error && becoming) {
      notifyStatus({
        status: becoming,
        name: prev?.title ?? '',
        // Prefer a value included in this same patch, else the current row value.
        finalUrl: (p.final_url ?? prev?.final_url) ?? '',
      });
    }
  }

  async function changeStatus(s: StudioSequence, status: string) {
    if (status === s.status) return;
    await logActivity('sequence', s.id, 'Status changed', s.status, status);
    // patch() detects the transition into a notify status and fires the Slack notify.
    await patch(s.id, { status });
  }

  // Fire-and-forget POST to the server route, which holds the Slack webhook URL
  // and skips silently if it's unset. Never blocks the UI or throws.
  function notifyStatus(payload: { status: string; name: string; finalUrl: string }) {
    fetch('/api/story-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(err => console.warn('[StorySequences] /api/story-notify call failed', err));
  }

  async function createSequence() {
    if (creating) return;
    setCreating(true);
    const row = {
      title: draft.title.trim() || 'Untitled Sequence',
      status: draft.status || 'Draft',
      final_url: draft.final_url.trim() || null,
      scheduled_date: draft.scheduled_date || null,
    };
    const { error } = await supabase.from('studio_sequences').insert([row]);
    setCreating(false);
    if (error) {
      console.error('[StorySequences] failed to create sequence', { row, error });
      alert(`Couldn't create sequence: ${error.message}`);
      return;
    }
    closeAdd();
    onReload();
  }

  function closeAdd() {
    setAddOpen(false);
    setDraft(EMPTY_DRAFT);
  }

  async function deleteSequence(id: string) {
    if (!confirm('Delete this sequence?')) return;
    await supabase.from('studio_sequences').delete().eq('id', id);
    if (selectedId === id) setSelectedId(null);
    onReload();
  }

  const present = (vals: (string | undefined)[]) => ['All', ...Array.from(new Set(vals.filter(Boolean) as string[]))];
  const statusPresent = present(sequences.map(s => s.status));

  const filtered = useMemo(() => {
    let r = sequences;
    if (fStatus !== 'All') r = r.filter(s => s.status === fStatus);
    if (dateFrom || dateTo) r = r.filter(s => inDateRange(s.scheduled_date, dateFrom, dateTo));
    return [...r].sort((a, b) => {
      const ad = a.scheduled_date ? a.scheduled_date.slice(0, 10) : '';
      const bd = b.scheduled_date ? b.scheduled_date.slice(0, 10) : '';
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return sortDir === 'asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
    });
  }, [sequences, fStatus, sortDir, dateFrom, dateTo]);

  const rows = useMemo(() => applyCustomFilters(filtered, cprops, custFilters), [filtered, cprops, custFilters]);

  const fields: FieldDef[] = useMemo(() => [
    { key: 'title', label: 'Title / Desc', type: 'textarea', placeholder: 'Title / description' },
    { key: 'status', label: 'Status', type: 'pill', field: 'sequence_status', options: statusValues, colors: statusColors, allowAdd: isAdmin },
    { key: 'final_url', label: 'Final Product', type: 'url' },
    { key: 'scheduled_date', label: 'Scheduled', type: 'date' },
  ], [statusValues, statusColors, isAdmin]);

  const selected = selectedId ? sequences.find(s => s.id === selectedId) : null;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <MiniSelect value={fStatus} options={statusPresent} onChange={setFStatus} />
          <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))} title="Sort by scheduled date">
            Scheduled {sortDir === 'asc' ? '↑ oldest' : '↓ newest'}
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>From</span>
          <input className="form-input" type="date" style={{ width: 130, padding: '4px 7px', fontSize: 11 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>To</span>
          <input className="form-input" type="date" style={{ width: 130, padding: '4px 7px', fontSize: 11 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && <button className="btn-ghost" style={{ fontSize: 10, padding: '4px 8px' }} onClick={() => { setDateFrom(''); setDateTo(''); }}>clear</button>}
          <CustomFilterControls props={cprops} optionsByProp={optsByProp} filters={custFilters} setFilters={setCustFilters} />
          {isAdmin && <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setMgrOpen(true)}>+ Add property</button>}
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{rows.length} {rows.length === 1 ? 'sequence' : 'sequences'}</span>
          <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', marginLeft: 'auto' }} onClick={() => { setDraft(EMPTY_DRAFT); setAddOpen(true); }}>+ Add Sequence</button>
        </div>

        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>No sequences match. Add a sequence or adjust filters.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Title / Description</th>
                  <th onClick={isAdmin ? () => setOptsField({ field: 'sequence_status', title: 'Status' }) : undefined} style={{ cursor: isAdmin ? 'pointer' : undefined, userSelect: 'none' }}>Status{isAdmin && <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>✎</span>}</th>
                  <th>Final</th>
                  <th>Scheduled</th>
                  <CustomHeaderCells props={cprops} isAdmin={isAdmin} onManage={() => setMgrOpen(true)} />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(s => {
                  const overdue = isOverdue(s.scheduled_date, s.status, DONE);
                  return (
                    <Fragment key={s.id}>
                      <tr style={overdue ? { background: 'rgba(239,68,68,0.06)', boxShadow: 'inset 3px 0 0 #ef4444' } : (selectedId === s.id ? { background: 'var(--surface-2)' } : undefined)}>
                        <td style={{ minWidth: 200 }}>
                          <button onClick={() => setSelectedId(s.id)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 12, textAlign: 'left', padding: '4px 0', fontFamily: 'inherit', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="Open details">{s.title}</button>
                        </td>
                        <td><EditPillSelect field="sequence_status" value={s.status} options={statusValues} colors={statusColors} onChange={st => changeStatus(s, st)} onAddOption={addOption} allowAdd={isAdmin} /></td>
                        <td><UrlCell value={s.final_url} onCommit={u => patch(s.id, { final_url: u })} /></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <InlineDate value={s.scheduled_date} onCommit={d => patch(s.id, { scheduled_date: d || undefined })} highlight={overdue} />
                            {overdue && <span style={{ color: '#ef4444', fontSize: 9, fontWeight: 700 }}>OVERDUE</span>}
                          </div>
                        </td>
                        <CustomRowCells row={s} props={cprops} optionsByProp={optsByProp} onPatch={patch} />
                        <td><button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteSequence(s.id)}>✕</button></td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <ItemPanel
          itemType="sequence"
          itemId={selected.id}
          title={selected.title}
          fields={fields}
          values={selected}
          onChangeField={(key, value) => { if (key === 'status') changeStatus(selected, value); else patch(selected.id, { [key]: value }); }}
          onAddOption={addOption}
          comments={comments}
          activity={activity}
          profiles={profiles}
          isAdmin={isAdmin}
          onReload={onReload}
          onClose={() => setSelectedId(null)}
        />
      )}

      {addOpen && (
        <div className="modal-overlay" onClick={closeAdd}>
          <div className="modal-box" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>New Story Sequence</div>
              <button onClick={closeAdd} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <DraftField label="Title / Desc">
                <textarea className="form-input" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="Title / description" rows={2} style={{ resize: 'vertical', fontSize: 12, lineHeight: 1.4, width: '100%' }} />
              </DraftField>
              <DraftField label="Status">
                <EditPillSelect field="sequence_status" value={draft.status} options={statusValues} colors={statusColors} onChange={st => setDraft(d => ({ ...d, status: st }))} onAddOption={addOption} allowAdd={isAdmin} />
              </DraftField>
              <DraftField label="Final Product">
                <input className="form-input" value={draft.final_url} onChange={e => setDraft(d => ({ ...d, final_url: e.target.value }))} placeholder="https://…" style={{ width: '100%', fontSize: 12 }} />
              </DraftField>
              <DraftField label="Scheduled">
                <input className="form-input" type="date" value={draft.scheduled_date} onChange={e => setDraft(d => ({ ...d, scheduled_date: e.target.value }))} style={{ width: 160, fontSize: 12 }} />
              </DraftField>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }} onClick={closeAdd}>Cancel</button>
              <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={createSequence} disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {mgrOpen && (
        <PropertyManagerModal tableKey={TABLE_KEY} properties={properties} options={customOptions} onClose={() => setMgrOpen(false)} onReload={onReload} />
      )}
      {optsField && (
        <FieldOptionsManager field={optsField.field} title={optsField.title} options={dropdownOptions} onClose={() => setOptsField(null)} onReload={onReload} />
      )}
    </div>
  );
}

// Label + control row for the Add Sequence form, matching the detail panel layout.
function DraftField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'start' }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, paddingTop: 6 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}
