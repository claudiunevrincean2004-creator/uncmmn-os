'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioSequence, StudioComment, StudioActivity } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import {
  SEQUENCE_STATUSES, SEQUENCE_STATUS_COLORS, SEQUENCE_PLATFORMS,
  isOverdue, logActivity,
} from '@/lib/studio';
import { InlineText, PillSelect, MiniSelect, UrlCell, InlineDate } from './cells';
import ItemPanel, { FieldDef } from './ItemPanel';

const DONE = ['Posted'];

const FIELDS: FieldDef[] = [
  { key: 'title', label: 'Title / Desc', type: 'textarea', placeholder: 'Title / description' },
  { key: 'status', label: 'Status', type: 'pill', options: SEQUENCE_STATUSES, colors: SEQUENCE_STATUS_COLORS },
  { key: 'final_url', label: 'Final Product', type: 'url' },
  { key: 'scheduled_date', label: 'Scheduled', type: 'date' },
  { key: 'platform', label: 'Platform', type: 'select', options: SEQUENCE_PLATFORMS },
  { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Add notes…' },
];

interface Props {
  sequences: StudioSequence[];
  comments: StudioComment[];
  activity: StudioActivity[];
  onReload: () => void;
}

export default function StorySequences({ sequences, comments, activity, onReload }: Props) {
  const [fStatus, setFStatus] = usePersistedState<string>('studio_s_status', 'All');
  const [fPlatform, setFPlatform] = usePersistedState<string>('studio_s_platform', 'All');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const filtered = useMemo(() => {
    let r = sequences;
    if (fStatus !== 'All') r = r.filter(s => s.status === fStatus);
    if (fPlatform !== 'All') r = r.filter(s => (s.platform || '') === fPlatform);
    return [...r].sort((a, b) => {
      const ad = a.scheduled_date ? a.scheduled_date.slice(0, 10) : '';
      const bd = b.scheduled_date ? b.scheduled_date.slice(0, 10) : '';
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return ad.localeCompare(bd);
    });
  }, [sequences, fStatus, fPlatform]);

  const selected = selectedId ? sequences.find(s => s.id === selectedId) : null;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <MiniSelect value={fStatus} options={['All', ...SEQUENCE_STATUSES]} onChange={setFStatus} />
          <MiniSelect value={fPlatform} options={['All', ...SEQUENCE_PLATFORMS]} onChange={setFPlatform} />
          <span style={{ fontSize: 11, color: '#555' }}>{filtered.length} {filtered.length === 1 ? 'sequence' : 'sequences'}</span>
          <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', marginLeft: 'auto' }} onClick={addSequence}>
            + Add Sequence
          </button>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#333', padding: '40px 0', fontSize: 12 }}>
            No sequences match. Add a sequence or adjust filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Title / Description</th>
                  <th>Status</th>
                  <th>Final</th>
                  <th>Scheduled</th>
                  <th>Platform</th>
                  <th style={{ minWidth: 180 }}>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const overdue = isOverdue(s.scheduled_date, s.status, DONE);
                  return (
                    <tr key={s.id} style={overdue ? { background: 'rgba(239,68,68,0.06)', boxShadow: 'inset 3px 0 0 #ef4444' } : (selectedId === s.id ? { background: '#0f0f0f' } : undefined)}>
                      <td style={{ minWidth: 200 }}>
                        <button
                          onClick={() => setSelectedId(s.id)}
                          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, textAlign: 'left', padding: '4px 0', fontFamily: 'inherit', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title="Open details"
                        >{s.title}</button>
                      </td>
                      <td>
                        <PillSelect value={s.status} options={SEQUENCE_STATUSES} colors={SEQUENCE_STATUS_COLORS} onChange={st => changeStatus(s, st)} />
                      </td>
                      <td><UrlCell value={s.final_url} onCommit={u => patch(s.id, { final_url: u })} /></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <InlineDate value={s.scheduled_date} onCommit={d => patch(s.id, { scheduled_date: d || undefined })} highlight={overdue} />
                          {overdue && <span style={{ color: '#ef4444', fontSize: 9, fontWeight: 700 }}>OVERDUE</span>}
                        </div>
                      </td>
                      <td>
                        <MiniSelect value={s.platform} options={SEQUENCE_PLATFORMS} onChange={p => patch(s.id, { platform: p })} placeholder="—" />
                      </td>
                      <td style={{ minWidth: 180 }}>
                        <InlineText value={s.notes} onCommit={n => patch(s.id, { notes: n })} placeholder="Notes…" style={{ width: '100%' }} />
                      </td>
                      <td>
                        <button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteSequence(s.id)}>✕</button>
                      </td>
                    </tr>
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
          fields={FIELDS}
          values={selected}
          onChangeField={(key, value) => { if (key === 'status') changeStatus(selected, value); else patch(selected.id, { [key]: value }); }}
          comments={comments}
          activity={activity}
          onReload={onReload}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
