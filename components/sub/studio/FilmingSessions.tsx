'use client';
import { useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioSession } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { SESSION_STATUSES, SESSION_STATUS_COLORS, todayISO, logStatusChange } from '@/lib/studio';
import { InlineText, PillSelect, MiniSelect, UrlCell, InlineDate, InlineNumber } from './cells';

interface Props {
  sessions: StudioSession[];
  onReload: () => void;
}

export default function FilmingSessions({ sessions, onReload }: Props) {
  const [fStatus, setFStatus] = usePersistedState<string>('studio_f_status', 'All');

  async function patch(id: string, p: Partial<StudioSession>) {
    await supabase.from('studio_sessions').update(p).eq('id', id);
    onReload();
  }

  async function changeStatus(s: StudioSession, status: string) {
    logStatusChange('session', s.id, s.status, status);
    await patch(s.id, { status });
  }

  async function addSession() {
    await supabase.from('studio_sessions').insert([{ name: 'Untitled Session', status: 'Planned', videos_planned: 0, videos_filmed: 0 }]);
    onReload();
  }

  async function deleteSession(id: string) {
    if (!confirm('Delete this session?')) return;
    await supabase.from('studio_sessions').delete().eq('id', id);
    onReload();
  }

  const today = todayISO();

  const filtered = useMemo(() => {
    let r = sessions;
    if (fStatus !== 'All') r = r.filter(s => s.status === fStatus);
    // Upcoming (today or future, or no date) sorted ascending; past sorted descending below.
    const upcoming = r.filter(s => !s.date || s.date.slice(0, 10) >= today)
      .sort((a, b) => (a.date ? a.date.slice(0, 10) : '9999').localeCompare(b.date ? b.date.slice(0, 10) : '9999'));
    const past = r.filter(s => s.date && s.date.slice(0, 10) < today)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return [...upcoming, ...past];
  }, [sessions, fStatus, today]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <MiniSelect value={fStatus} options={['All', ...SESSION_STATUSES]} onChange={setFStatus} />
        <span style={{ fontSize: 11, color: '#555' }}>{filtered.length} {filtered.length === 1 ? 'session' : 'sessions'}</span>
        <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', marginLeft: 'auto' }} onClick={addSession}>
          + Add Session
        </button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#333', padding: '40px 0', fontSize: 12 }}>
          No sessions match. Add a session or adjust filters.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Session / Description</th>
                <th>Script</th>
                <th>Date</th>
                <th>Location</th>
                <th>Status</th>
                <th>To Film</th>
                <th>Filmed</th>
                <th style={{ minWidth: 120 }}>Completion</th>
                <th style={{ minWidth: 160 }}>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const planned = s.videos_planned || 0;
                const filmed = s.videos_filmed || 0;
                const pct = planned > 0 ? Math.min(100, Math.round((filmed / planned) * 100)) : 0;
                const isPast = s.date && s.date.slice(0, 10) < today;
                return (
                  <tr key={s.id} style={isPast ? { opacity: 0.6 } : undefined}>
                    <td style={{ minWidth: 200 }}>
                      <InlineText value={s.name} onCommit={n => patch(s.id, { name: n || 'Untitled Session' })} placeholder="Session name / description" style={{ width: '100%' }} />
                    </td>
                    <td><UrlCell value={s.script_url} onCommit={u => patch(s.id, { script_url: u })} /></td>
                    <td><InlineDate value={s.date} onCommit={d => patch(s.id, { date: d || undefined })} /></td>
                    <td>
                      <InlineText value={s.location} onCommit={l => patch(s.id, { location: l })} placeholder="optional" style={{ width: 120 }} />
                    </td>
                    <td>
                      <PillSelect value={s.status} options={SESSION_STATUSES} colors={SESSION_STATUS_COLORS} onChange={st => changeStatus(s, st)} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <InlineNumber value={planned} onCommit={n => patch(s.id, { videos_planned: n })} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <InlineNumber value={filmed} onCommit={n => patch(s.id, { videos_filmed: n })} />
                    </td>
                    <td style={{ minWidth: 120 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="progress-bar" style={{ flex: 1, minWidth: 60 }}>
                          <div className={`progress-bar-fill${pct >= 100 ? ' complete' : ''}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span style={{ fontSize: 10, color: '#666', width: 30, textAlign: 'right' }}>{pct}%</span>
                      </div>
                    </td>
                    <td style={{ minWidth: 160 }}>
                      <InlineText value={s.notes} onCommit={n => patch(s.id, { notes: n })} placeholder="Notes…" style={{ width: '100%' }} />
                    </td>
                    <td>
                      <button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteSession(s.id)}>✕</button>
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
