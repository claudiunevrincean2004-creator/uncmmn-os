'use client';
import { Fragment, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioVideo } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import {
  VIDEO_FORMATS, VIDEO_STATUSES, VIDEO_STATUS_COLORS,
  PRIORITIES, PRIORITY_COLORS, TEAM,
  isOverdue, logStatusChange,
} from '@/lib/studio';
import { InlineText, PillSelect, MiniSelect, UrlCell, InlineDate } from './cells';

const DONE = ['Approved', 'Posted'];

interface Props {
  videos: StudioVideo[];
  onReload: () => void;
}

export default function VideoReview({ videos, onReload }: Props) {
  const [fStatus, setFStatus] = usePersistedState<string>('studio_v_status', 'All');
  const [fAssigned, setFAssigned] = usePersistedState<string>('studio_v_assigned', 'All');
  const [fFormat, setFFormat] = usePersistedState<string>('studio_v_format', 'All');
  const [fPriority, setFPriority] = usePersistedState<string>('studio_v_priority', 'All');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('studio_v_sortdir', 'asc');
  const [expanded, setExpanded] = useState<string | null>(null);

  async function patch(id: string, p: Partial<StudioVideo>) {
    await supabase.from('studio_videos').update(p).eq('id', id);
    onReload();
  }

  async function changeStatus(v: StudioVideo, status: string) {
    const p: Partial<StudioVideo> = { status };
    if (status === 'Revision Requested' && v.status !== 'Revision Requested') {
      p.revision_count = (v.revision_count || 0) + 1;
    }
    logStatusChange('video', v.id, v.status, status);
    await patch(v.id, p);
  }

  async function addVideo() {
    await supabase.from('studio_videos').insert([{ title: 'Untitled Video', status: 'Scripting', priority: 'Normal' }]);
    onReload();
  }

  async function deleteVideo(id: string) {
    if (!confirm('Delete this video?')) return;
    await supabase.from('studio_videos').delete().eq('id', id);
    onReload();
  }

  const assignedOptions = useMemo(
    () => ['All', ...Array.from(new Set([...TEAM, ...videos.map(v => v.assigned_to).filter(Boolean) as string[]]))],
    [videos]
  );

  const filtered = useMemo(() => {
    let r = videos;
    if (fStatus !== 'All') r = r.filter(v => v.status === fStatus);
    if (fAssigned !== 'All') r = r.filter(v => (v.assigned_to || '') === fAssigned);
    if (fFormat !== 'All') r = r.filter(v => (v.format || '') === fFormat);
    if (fPriority !== 'All') r = r.filter(v => (v.priority || 'Normal') === fPriority);
    return [...r].sort((a, b) => {
      // nulls (no deadline) always last
      const ad = a.deadline ? a.deadline.slice(0, 10) : '';
      const bd = b.deadline ? b.deadline.slice(0, 10) : '';
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return sortDir === 'asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
    });
  }, [videos, fStatus, fAssigned, fFormat, fPriority, sortDir]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <MiniSelect value={fStatus} options={['All', ...VIDEO_STATUSES]} onChange={setFStatus} />
        <MiniSelect value={fAssigned} options={assignedOptions} onChange={setFAssigned} />
        <MiniSelect value={fFormat} options={['All', ...VIDEO_FORMATS]} onChange={setFFormat} />
        <MiniSelect value={fPriority} options={['All', ...PRIORITIES]} onChange={setFPriority} />
        <button
          className="btn-ghost"
          style={{ fontSize: 11, padding: '4px 10px' }}
          onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
          title="Sort by deadline"
        >
          Deadline {sortDir === 'asc' ? '↑' : '↓'}
        </button>
        <span style={{ fontSize: 11, color: '#555' }}>{filtered.length} {filtered.length === 1 ? 'video' : 'videos'}</span>
        <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', marginLeft: 'auto' }} onClick={addVideo}>
          + Add Video
        </button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#333', padding: '40px 0', fontSize: 12 }}>
          No videos match. Add a video or adjust filters.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Title / Description</th>
                <th>Format</th>
                <th>Assigned To</th>
                <th>Status</th>
                <th>Brief</th>
                <th>Raw Files</th>
                <th>Final</th>
                <th>Deadline</th>
                <th>Priority</th>
                <th>Rev.</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => {
                const overdue = isOverdue(v.deadline, v.status, DONE);
                return (
                  <Fragment key={v.id}>
                    <tr style={overdue ? { background: 'rgba(239,68,68,0.06)', boxShadow: 'inset 3px 0 0 #ef4444' } : undefined}>
                      <td style={{ minWidth: 200 }}>
                        <InlineText value={v.title} onCommit={t => patch(v.id, { title: t || 'Untitled Video' })} placeholder="Title / description" style={{ width: '100%' }} />
                      </td>
                      <td>
                        <MiniSelect value={v.format} options={VIDEO_FORMATS} onChange={f => patch(v.id, { format: f })} placeholder="—" />
                      </td>
                      <td>
                        <MiniSelect value={v.assigned_to} options={TEAM} onChange={a => patch(v.id, { assigned_to: a })} placeholder="—" />
                      </td>
                      <td>
                        <PillSelect value={v.status} options={VIDEO_STATUSES} colors={VIDEO_STATUS_COLORS} onChange={s => changeStatus(v, s)} />
                      </td>
                      <td><UrlCell value={v.brief_url} onCommit={u => patch(v.id, { brief_url: u })} /></td>
                      <td><UrlCell value={v.raw_files_url} onCommit={u => patch(v.id, { raw_files_url: u })} /></td>
                      <td><UrlCell value={v.final_url} onCommit={u => patch(v.id, { final_url: u })} /></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <InlineDate value={v.deadline} onCommit={d => patch(v.id, { deadline: d || undefined })} highlight={overdue} />
                          {overdue && <span style={{ color: '#ef4444', fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap' }}>OVERDUE</span>}
                        </div>
                      </td>
                      <td>
                        <PillSelect value={v.priority || 'Normal'} options={PRIORITIES} colors={PRIORITY_COLORS} onChange={p => patch(v.id, { priority: p })} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {v.revision_count > 0
                          ? <span className="badge" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }} title={`${v.revision_count} revision round(s)`}>{v.revision_count}</span>
                          : <span style={{ color: '#333' }}>0</span>}
                      </td>
                      <td>
                        <button
                          onClick={() => setExpanded(e => (e === v.id ? null : v.id))}
                          className="btn-ghost"
                          style={{ fontSize: 10, padding: '3px 8px', color: v.notes ? '#a5b4fc' : '#555' }}
                          title="Expand notes"
                        >
                          {v.notes ? '📝' : '+'} {expanded === v.id ? '▲' : '▾'}
                        </button>
                      </td>
                      <td>
                        <button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteVideo(v.id)}>✕</button>
                      </td>
                    </tr>
                    {expanded === v.id && (
                      <tr>
                        <td colSpan={12} style={{ background: '#0b0b0b' }}>
                          <div style={{ padding: '4px 2px' }}>
                            <div className="form-label" style={{ marginBottom: 4 }}>Notes</div>
                            <InlineText value={v.notes} onCommit={n => patch(v.id, { notes: n })} placeholder="Add notes…" multiline style={{ width: '100%' }} />
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
  );
}
