'use client';
import { useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioSequence } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import {
  SEQUENCE_STATUSES, SEQUENCE_STATUS_COLORS, SEQUENCE_PLATFORMS,
  isOverdue, logStatusChange,
} from '@/lib/studio';
import { InlineText, PillSelect, MiniSelect, UrlCell, InlineDate } from './cells';

const DONE = ['Posted'];

interface Props {
  sequences: StudioSequence[];
  onReload: () => void;
}

export default function StorySequences({ sequences, onReload }: Props) {
  const [fStatus, setFStatus] = usePersistedState<string>('studio_s_status', 'All');
  const [fPlatform, setFPlatform] = usePersistedState<string>('studio_s_platform', 'All');

  async function patch(id: string, p: Partial<StudioSequence>) {
    await supabase.from('studio_sequences').update(p).eq('id', id);
    onReload();
  }

  async function changeStatus(s: StudioSequence, status: string) {
    logStatusChange('sequence', s.id, s.status, status);
    await patch(s.id, { status });
  }

  async function addSequence() {
    await supabase.from('studio_sequences').insert([{ title: 'Untitled Sequence', status: 'Draft' }]);
    onReload();
  }

  async function deleteSequence(id: string) {
    if (!confirm('Delete this sequence?')) return;
    await supabase.from('studio_sequences').delete().eq('id', id);
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

  return (
    <div>
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
                <th style={{ minWidth: 220 }}>Title / Description</th>
                <th>Status</th>
                <th>Final</th>
                <th>Scheduled</th>
                <th>Platform</th>
                <th style={{ minWidth: 200 }}>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const overdue = isOverdue(s.scheduled_date, s.status, DONE);
                return (
                  <tr key={s.id} style={overdue ? { background: 'rgba(239,68,68,0.06)', boxShadow: 'inset 3px 0 0 #ef4444' } : undefined}>
                    <td style={{ minWidth: 220 }}>
                      <InlineText value={s.title} onCommit={t => patch(s.id, { title: t || 'Untitled Sequence' })} placeholder="Title / description" style={{ width: '100%' }} />
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
                    <td style={{ minWidth: 200 }}>
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
  );
}
