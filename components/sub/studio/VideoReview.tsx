'use client';
import { Fragment, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioVideo, StudioComment, StudioActivity, StudioQuickLink, StudioDropdownOption, Profile } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import {
  VIDEO_FORMATS, VIDEO_STATUSES, VIDEO_STATUS_COLORS,
  PRIORITIES, PRIORITY_COLORS,
  isOverdue, logActivity, todayISO, mergeOptions, inDateRange,
  getFieldOptions, colorMap, buildAddOptionRows,
} from '@/lib/studio';
import { InlineText, EditPillSelect, MiniSelect, UrlCell, InlineDate } from './cells';
import ItemPanel, { FieldDef } from './ItemPanel';
import QuickLinks from './QuickLinks';
import { UserPicker, resolveAssignee } from './UserPicker';
import FieldOptionsManager from './FieldOptionsManager';
import AssigneeSettings from './AssigneeSettings';

const DONE = ['Approved', 'Posted'];

// In-code fallback options per built-in select field, so adding an option can
// backfill them as rows instead of dropping them (see buildAddOptionRows).
const FIELD_FALLBACKS: Record<string, { values: string[]; colors?: Record<string, string> }> = {
  video_status: { values: VIDEO_STATUSES, colors: VIDEO_STATUS_COLORS },
  video_format: { values: VIDEO_FORMATS },
  video_priority: { values: PRIORITIES, colors: PRIORITY_COLORS },
};

interface Props {
  videos: StudioVideo[];
  comments: StudioComment[];
  activity: StudioActivity[];
  quickLinks: StudioQuickLink[];
  dropdownOptions: StudioDropdownOption[];
  profiles: Profile[];
  isAdmin: boolean;
  onReload: () => void;
  showToast: (msg: string) => void;
}

export default function VideoReview({ videos, comments, activity, quickLinks, dropdownOptions, profiles, isAdmin, onReload, showToast }: Props) {
  const [fStatus, setFStatus] = usePersistedState<string>('studio_v_status', 'All');
  const [fAssigned, setFAssigned] = usePersistedState<string>('studio_v_assigned', 'All');
  const [fFormat, setFFormat] = usePersistedState<string>('studio_v_format', 'All');
  const [fPriority, setFPriority] = usePersistedState<string>('studio_v_priority', 'All');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('studio_v_sortdir', 'asc');
  const [dateFrom, setDateFrom] = usePersistedState<string>('studio_v_from', '');
  const [dateTo, setDateTo] = usePersistedState<string>('studio_v_to', '');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [optsField, setOptsField] = useState<{ field: string; title: string } | null>(null);
  const [assigneeSettings, setAssigneeSettings] = useState(false);

  // Built-in Format & Status options are DB-backed (admin-managed) with defaults
  const statusFieldOpts = getFieldOptions(dropdownOptions, 'video_status', VIDEO_STATUSES, VIDEO_STATUS_COLORS);
  const formatFieldOpts = getFieldOptions(dropdownOptions, 'video_format', VIDEO_FORMATS);
  const statusValues = statusFieldOpts.map(o => o.value);
  const statusColors = colorMap(statusFieldOpts);
  const formatValues = formatFieldOpts.map(o => o.value);
  const formatColors = colorMap(formatFieldOpts);
  const priorityOpts = mergeOptions(PRIORITIES, dropdownOptions.filter(o => o.field === 'video_priority').map(o => o.value));

  async function addOption(field: string, value: string) {
    const fb = FIELD_FALLBACKS[field] ?? { values: [] };
    const rows = buildAddOptionRows(field, value, fb.values, fb.colors, dropdownOptions);
    if (rows.length) await supabase.from('studio_dropdown_options').insert(rows);
    onReload();
  }

  async function patch(id: string, p: Partial<StudioVideo>) {
    await supabase.from('studio_videos').update(p).eq('id', id);
    onReload();
  }

  async function changeStatus(v: StudioVideo, status: string) {
    if (status === v.status) return;
    const p: Partial<StudioVideo> = { status };
    if (status === 'Revision Requested' && v.status !== 'Revision Requested') {
      p.revision_count = (v.revision_count || 0) + 1;
    }
    await logActivity('video', v.id, 'Status changed', v.status, status);
    // Automation: spawn an Ad Creative entry when a video needs an ad variation
    if (status === 'Ad Variation Needed') {
      await supabase.from('studio_ad_creatives').insert([{
        creative_id: v.title,
        source_video_url: v.final_url || null,
        date_added: todayISO(),
        ad_format: 'Video',
        status: 'Paused',
      }]);
      showToast(`Ad variation created for ${v.title}`);
    }
    await patch(v.id, p);
  }

  async function addVideo() {
    await supabase.from('studio_videos').insert([{ title: 'Untitled Video', status: 'Scripting', priority: 'Normal' }]);
    onReload();
  }

  async function deleteVideo(id: string) {
    if (!confirm('Delete this video?')) return;
    await supabase.from('studio_videos').delete().eq('id', id);
    if (selectedId === id) setSelectedId(null);
    onReload();
  }

  // Filter dropdowns only offer values actually present in the data
  const present = (vals: (string | undefined)[]) => ['All', ...Array.from(new Set(vals.filter(Boolean) as string[]))];
  const statusPresent = present(videos.map(v => v.status));
  const assignedPresent = present(videos.map(v => resolveAssignee(v.assigned_to, profiles) || undefined));
  const formatPresent = present(videos.map(v => v.format));
  const priorityPresent = present(videos.map(v => v.priority || 'Normal'));

  const filtered = useMemo(() => {
    let r = videos;
    if (fStatus !== 'All') r = r.filter(v => v.status === fStatus);
    if (fAssigned !== 'All') r = r.filter(v => (resolveAssignee(v.assigned_to, profiles) || '') === fAssigned);
    if (fFormat !== 'All') r = r.filter(v => (v.format || '') === fFormat);
    if (fPriority !== 'All') r = r.filter(v => (v.priority || 'Normal') === fPriority);
    if (dateFrom || dateTo) r = r.filter(v => inDateRange(v.deadline, dateFrom, dateTo));
    return [...r].sort((a, b) => {
      const ad = a.deadline ? a.deadline.slice(0, 10) : '';
      const bd = b.deadline ? b.deadline.slice(0, 10) : '';
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return sortDir === 'asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
    });
  }, [videos, fStatus, fAssigned, fFormat, fPriority, sortDir, dateFrom, dateTo, profiles]);

  const fields: FieldDef[] = useMemo(() => [
    { key: 'title', label: 'Title / Desc', type: 'textarea', placeholder: 'Title / description' },
    { key: 'format', label: 'Format', type: 'pill', field: 'video_format', options: formatValues, colors: formatColors, allowAdd: isAdmin, allowEmpty: true },
    { key: 'assigned_to', label: 'Assigned To', type: 'user' },
    { key: 'status', label: 'Status', type: 'pill', field: 'video_status', options: statusValues, colors: statusColors, allowAdd: isAdmin },
    { key: 'priority', label: 'Priority', type: 'pill', field: 'video_priority', options: priorityOpts, colors: PRIORITY_COLORS, allowAdd: isAdmin },
    { key: 'brief_url', label: 'Brief', type: 'url' },
    { key: 'raw_files_url', label: 'Raw Files', type: 'url' },
    { key: 'final_url', label: 'Final Product', type: 'url' },
    { key: 'deadline', label: 'Deadline', type: 'date' },
    { key: 'revision_count', label: 'Revisions', type: 'readonly' },
    { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Add notes…' },
  ], [formatValues, formatColors, statusValues, statusColors, priorityOpts, isAdmin]);

  const selected = selectedId ? videos.find(v => v.id === selectedId) : null;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <QuickLinks context="video-review" links={quickLinks} onReload={onReload} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <MiniSelect value={fStatus} options={statusPresent} onChange={setFStatus} />
          <MiniSelect value={fAssigned} options={assignedPresent} onChange={setFAssigned} />
          <MiniSelect value={fFormat} options={formatPresent} onChange={setFFormat} />
          <MiniSelect value={fPriority} options={priorityPresent} onChange={setFPriority} />
          <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))} title="Sort by deadline">
            Deadline {sortDir === 'asc' ? '↑ oldest' : '↓ newest'}
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>From</span>
          <input className="form-input" type="date" style={{ width: 130, padding: '4px 7px', fontSize: 11 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>To</span>
          <input className="form-input" type="date" style={{ width: 130, padding: '4px 7px', fontSize: 11 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && <button className="btn-ghost" style={{ fontSize: 10, padding: '4px 8px' }} onClick={() => { setDateFrom(''); setDateTo(''); }}>clear</button>}
          {isAdmin && <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setAssigneeSettings(true)}>Assignees</button>}
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{filtered.length} {filtered.length === 1 ? 'video' : 'videos'}</span>
          <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', marginLeft: 'auto' }} onClick={addVideo}>+ Add Video</button>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>No videos match. Add a video or adjust filters.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>Title / Description</th>
                  <th onClick={isAdmin ? () => setOptsField({ field: 'video_format', title: 'Format' }) : undefined} style={{ cursor: isAdmin ? 'pointer' : undefined, userSelect: 'none' }}>Format{isAdmin && <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>✎</span>}</th>
                  <th>Assigned To</th>
                  <th onClick={isAdmin ? () => setOptsField({ field: 'video_status', title: 'Status' }) : undefined} style={{ cursor: isAdmin ? 'pointer' : undefined, userSelect: 'none' }}>Status{isAdmin && <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>✎</span>}</th>
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
                      <tr style={overdue ? { background: 'rgba(239,68,68,0.06)', boxShadow: 'inset 3px 0 0 #ef4444' } : (selectedId === v.id ? { background: 'var(--surface-2)' } : undefined)}>
                        <td style={{ minWidth: 180 }}>
                          <button onClick={() => setSelectedId(v.id)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 12, textAlign: 'left', padding: '4px 0', fontFamily: 'inherit', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="Open details">{v.title}</button>
                        </td>
                        <td><EditPillSelect field="video_format" value={v.format || ''} options={formatValues} colors={formatColors} onChange={f => patch(v.id, { format: f })} onAddOption={addOption} allowAdd={isAdmin} allowEmpty /></td>
                        <td><UserPicker value={v.assigned_to} profiles={profiles} onChange={uid => patch(v.id, { assigned_to: uid })} /></td>
                        <td><EditPillSelect field="video_status" value={v.status} options={statusValues} colors={statusColors} onChange={s => changeStatus(v, s)} onAddOption={addOption} allowAdd={isAdmin} /></td>
                        <td><UrlCell value={v.brief_url} onCommit={u => patch(v.id, { brief_url: u })} /></td>
                        <td><UrlCell value={v.raw_files_url} onCommit={u => patch(v.id, { raw_files_url: u })} /></td>
                        <td><UrlCell value={v.final_url} onCommit={u => patch(v.id, { final_url: u })} /></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <InlineDate value={v.deadline} onCommit={d => patch(v.id, { deadline: d || undefined })} highlight={overdue} />
                            {overdue && <span style={{ color: '#ef4444', fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap' }}>OVERDUE</span>}
                          </div>
                        </td>
                        <td><EditPillSelect field="video_priority" value={v.priority || 'Normal'} options={priorityOpts} colors={PRIORITY_COLORS} onChange={p => patch(v.id, { priority: p })} onAddOption={addOption} allowAdd={isAdmin} /></td>
                        <td style={{ textAlign: 'center' }}>
                          {v.revision_count > 0
                            ? <span className="badge" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }} title={`${v.revision_count} revision round(s)`}>{v.revision_count}</span>
                            : <span style={{ color: 'var(--text-faint)' }}>0</span>}
                        </td>
                        <td>
                          <button onClick={() => setExpanded(e => (e === v.id ? null : v.id))} className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px', color: v.notes ? 'var(--accent)' : 'var(--text-faint)' }} title="Expand notes">
                            {v.notes ? '📝' : '+'} {expanded === v.id ? '▲' : '▾'}
                          </button>
                        </td>
                        <td><button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteVideo(v.id)}>✕</button></td>
                      </tr>
                      {expanded === v.id && (
                        <tr>
                          <td colSpan={12} style={{ background: 'var(--surface-2)' }}>
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

      {selected && (
        <ItemPanel
          itemType="video"
          itemId={selected.id}
          title={selected.title}
          fields={fields}
          values={selected}
          onChangeField={(key, value) => { if (key === 'status') changeStatus(selected, value); else patch(selected.id, { [key]: value }); }}
          onAddOption={addOption}
          comments={comments}
          activity={activity}
          profiles={profiles}
          onReload={onReload}
          onClose={() => setSelectedId(null)}
        />
      )}

      {optsField && (
        <FieldOptionsManager field={optsField.field} title={optsField.title} options={dropdownOptions} onClose={() => setOptsField(null)} onReload={onReload} />
      )}
      {assigneeSettings && (
        <AssigneeSettings profiles={profiles} onClose={() => setAssigneeSettings(false)} onReload={onReload} />
      )}
    </div>
  );
}
