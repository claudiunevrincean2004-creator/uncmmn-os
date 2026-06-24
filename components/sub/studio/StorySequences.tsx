'use client';
import { Fragment, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioSequence, StudioComment, StudioActivity, StudioDropdownOption } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import {
  SEQUENCE_STATUSES, SEQUENCE_STATUS_COLORS,
  isOverdue, logActivity, mergeOptions, inDateRange,
} from '@/lib/studio';
import { InlineText, EditPillSelect, MiniSelect, UrlCell, InlineDate } from './cells';
import ItemPanel, { FieldDef } from './ItemPanel';

const DONE = ['Posted'];

interface Props {
  sequences: StudioSequence[];
  comments: StudioComment[];
  activity: StudioActivity[];
  dropdownOptions: StudioDropdownOption[];
  onReload: () => void;
}

export default function StorySequences({ sequences, comments, activity, dropdownOptions, onReload }: Props) {
  const [fStatus, setFStatus] = usePersistedState<string>('studio_s_status', 'All');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('studio_s_sortdir', 'asc');
  const [dateFrom, setDateFrom] = usePersistedState<string>('studio_s_from', '');
  const [dateTo, setDateTo] = usePersistedState<string>('studio_s_to', '');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const custom = (field: string) => dropdownOptions.filter(o => o.field === field).map(o => o.value);
  const statusOpts = mergeOptions(SEQUENCE_STATUSES, custom('sequence_status'));

  async function addOption(field: string, value: string) {
    if (!dropdownOptions.some(o => o.field === field && o.value.toLowerCase() === value.toLowerCase())) {
      await supabase.from('studio_dropdown_options').insert([{ field, value }]);
    }
    onReload();
  }

  async function patch(id: string, p: Partial<StudioSequence>) {
    await supabase.from('studio_sequences').update(p).eq('id', id);
    onReload();
  }

  async function changeStatus(s: StudioSequence, status: string) {
    if (status === s.status) return;
    await logActivity('sequence', s.id, 'Status changed', s.status, status);
    await patch(s.id, { status });
  }

  async function addSequence() {
    await supabase.from('studio_sequences').insert([{ title: 'Untitled Sequence', status: 'Draft' }]);
    onReload();
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

  const fields: FieldDef[] = useMemo(() => [
    { key: 'title', label: 'Title / Desc', type: 'textarea', placeholder: 'Title / description' },
    { key: 'status', label: 'Status', type: 'pill', field: 'sequence_status', options: statusOpts, colors: SEQUENCE_STATUS_COLORS },
    { key: 'final_url', label: 'Final Product', type: 'url' },
    { key: 'scheduled_date', label: 'Scheduled', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Add notes…' },
  ], [statusOpts]);

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
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{filtered.length} {filtered.length === 1 ? 'sequence' : 'sequences'}</span>
          <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', marginLeft: 'auto' }} onClick={addSequence}>+ Add Sequence</button>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>No sequences match. Add a sequence or adjust filters.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Title / Description</th>
                  <th>Status</th>
                  <th>Final</th>
                  <th>Scheduled</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const overdue = isOverdue(s.scheduled_date, s.status, DONE);
                  return (
                    <Fragment key={s.id}>
                      <tr style={overdue ? { background: 'rgba(239,68,68,0.06)', boxShadow: 'inset 3px 0 0 #ef4444' } : (selectedId === s.id ? { background: 'var(--surface-2)' } : undefined)}>
                        <td style={{ minWidth: 200 }}>
                          <button onClick={() => setSelectedId(s.id)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 12, textAlign: 'left', padding: '4px 0', fontFamily: 'inherit', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="Open details">{s.title}</button>
                        </td>
                        <td><EditPillSelect field="sequence_status" value={s.status} options={statusOpts} colors={SEQUENCE_STATUS_COLORS} onChange={st => changeStatus(s, st)} onAddOption={addOption} /></td>
                        <td><UrlCell value={s.final_url} onCommit={u => patch(s.id, { final_url: u })} /></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <InlineDate value={s.scheduled_date} onCommit={d => patch(s.id, { scheduled_date: d || undefined })} highlight={overdue} />
                            {overdue && <span style={{ color: '#ef4444', fontSize: 9, fontWeight: 700 }}>OVERDUE</span>}
                          </div>
                        </td>
                        <td>
                          <button onClick={() => setExpanded(e => (e === s.id ? null : s.id))} className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px', color: s.notes ? 'var(--accent)' : 'var(--text-faint)' }} title="Expand notes">
                            {s.notes ? '📝' : '+'} {expanded === s.id ? '▲' : '▾'}
                          </button>
                        </td>
                        <td><button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteSequence(s.id)}>✕</button></td>
                      </tr>
                      {expanded === s.id && (
                        <tr>
                          <td colSpan={6} style={{ background: 'var(--surface-2)' }}>
                            <div style={{ padding: '4px 2px' }}>
                              <div className="form-label" style={{ marginBottom: 4 }}>Notes</div>
                              <InlineText value={s.notes} onCommit={n => patch(s.id, { notes: n })} placeholder="Add notes…" multiline style={{ width: '100%' }} />
                            </div>
                          </td>
                        </tr>
                      )}
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
          onReload={onReload}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
