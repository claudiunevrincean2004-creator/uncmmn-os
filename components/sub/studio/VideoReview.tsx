'use client';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioVideo, StudioComment, StudioActivity, StudioQuickLink, StudioDropdownOption, Profile } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { usePagedRows } from '@/lib/use-paged-rows';
import LoadMore from './LoadMore';
import FilterField from './FilterField';
import {
  VIDEO_FORMATS, VIDEO_STATUSES, VIDEO_STATUS_COLORS,
  PRIORITIES, PRIORITY_COLORS,
  isOverdue, logActivity, todayISO, mergeOptions, inDateRange,
  getFieldOptions, colorMap, buildAddOptionRows,
} from '@/lib/studio';
import { EditPillSelect, MiniSelect, UrlCell, InlineDate } from './cells';
import ItemPanel, { FieldDef } from './ItemPanel';
import QuickLinks from './QuickLinks';
import { UserPicker, resolveAssignee, buildPipelineMentions } from './UserPicker';
import FieldOptionsManager from './FieldOptionsManager';

const DONE = ['Posted'];

// Video status transitions that ping #main-ig-updates (see /api/video-notify).
// Briefing / Editing / Ready to Post / Posted are intentionally silent.
const VIDEO_NOTIFY_STATUSES = ['Ready to Edit', 'In Review', 'Revisions Needed'];

// In-code fallback options per built-in select field, so adding an option can
// backfill them as rows instead of dropping them (see buildAddOptionRows).
const FIELD_FALLBACKS: Record<string, { values: string[]; colors?: Record<string, string> }> = {
  video_status: { values: VIDEO_STATUSES, colors: VIDEO_STATUS_COLORS },
  video_format: { values: VIDEO_FORMATS },
  video_priority: { values: PRIORITIES, colors: PRIORITY_COLORS },
};

// Draft for the "Add Video" form. The row is only written to the database when
// the user clicks Create; closing/cancelling resets back to this.
interface VideoDraft {
  title: string;
  format: string;
  assigned_to_user_id: string;
  status: string;
  priority: string;
  brief_url: string;
  raw_files_url: string;
  final_url: string;
  deadline: string;
}
const EMPTY_DRAFT: VideoDraft = {
  title: '',
  format: '',
  assigned_to_user_id: '',
  status: 'Briefing',
  priority: 'Normal',
  brief_url: '',
  raw_files_url: '',
  final_url: '',
  deadline: '',
};

interface Props {
  videos: StudioVideo[];
  comments: StudioComment[];
  activity: StudioActivity[];
  quickLinks: StudioQuickLink[];
  dropdownOptions: StudioDropdownOption[];
  profiles: Profile[];
  isAdmin: boolean;
  openItemId?: string;
  onReload: () => void;
  showToast: (msg: string) => void;
}

export default function VideoReview({ videos, comments, activity, quickLinks, dropdownOptions, profiles, isAdmin, openItemId, onReload, showToast }: Props) {
  const [fStatus, setFStatus] = usePersistedState<string>('studio_v_status', 'All');
  const [fAssigned, setFAssigned] = usePersistedState<string>('studio_v_assigned', 'All');
  const [fFormat, setFFormat] = usePersistedState<string>('studio_v_format', 'All');
  const [fPriority, setFPriority] = usePersistedState<string>('studio_v_priority', 'All');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('studio_v_sortdir', 'asc');
  const [dateFrom, setDateFrom] = usePersistedState<string>('studio_v_from', '');
  const [dateTo, setDateTo] = usePersistedState<string>('studio_v_to', '');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [optsField, setOptsField] = useState<{ field: string; title: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<VideoDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [adBusy, setAdBusy] = useState<string | null>(null);

  // Open a row's panel when arriving via a deep link (Slack "Open in UNCMMN OS").
  useEffect(() => { if (openItemId) setSelectedId(openItemId); }, [openItemId]);

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
    if (status === 'Revisions Needed' && v.status !== 'Revisions Needed') {
      p.revision_count = (v.revision_count || 0) + 1;
    }
    await logActivity('video', v.id, 'Status changed', v.status, status);
    // Fire the #main-ig-updates ping for notify transitions. Only here (the single
    // status-change path) — generic patch() never pings — so no double-fire.
    if (VIDEO_NOTIFY_STATUSES.includes(status)) {
      notifyVideo({
        status,
        title: v.title || '',
        itemUrl: videoUrl(v.id),
        briefLink: v.brief_url || '',
        rawFilesLink: v.raw_files_url || '',
        finalLink: v.final_url || '',
        ...buildPipelineMentions(v.assigned_to_user_id, profiles),
      });
    }
    await patch(v.id, p);
  }

  // Absolute URL to a video's own page (deep link into the side panel). Empty when
  // there's no window (SSR) — the server then falls back to a plain bold title.
  function videoUrl(id: string): string {
    return typeof window !== 'undefined' ? `${window.location.origin}/studio/video/${id}` : '';
  }

  // Fire-and-forget POST to the #main-ig-updates notify route (server holds the
  // Slack webhook URL, skips silently if unset). Never blocks the UI or throws.
  function notifyVideo(payload: { status: string; title: string; itemUrl: string; briefLink: string; rawFilesLink: string; finalLink: string; editorMention: string }) {
    fetch('/api/video-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(err => console.warn('[VideoReview] /api/video-notify call failed', err));
  }

  // Fire-and-forget POST to the Ad Creative pipeline notify (server holds the
  // Slack webhook URL, skips silently if unset). Never blocks the UI or throws.
  function notifyAdPipeline(payload: { status: string; creativeId: string; itemUrl: string; sourceLink: string; finalLink: string; editorMention: string }) {
    fetch('/api/ads-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(err => console.warn('[VideoReview] /api/ads-notify call failed', err));
  }

  // "Ad Creative Needed": spawn a new Ad Creative row from this video to kick off
  // the ad lifecycle. Pre-fills the creative id (video title + " — Ad"), the
  // source link (the video's Final Product link), and the assigned editor; starts
  // it at "Ad Creative Needed", which pings the editor in #ad-creative-pipeline.
  async function createAdCreative(v: StudioVideo) {
    if (adBusy) return;
    setAdBusy(v.id);
    const creativeId = `${(v.title || 'Untitled').trim()} — Ad`;
    const editorName = resolveAssignee(v.assigned_to_user_id, profiles) || '';
    const mentions = buildPipelineMentions(v.assigned_to_user_id, profiles);
    const sourceLink = v.final_url || '';
    const row = {
      creative_id: creativeId,
      source_video_url: sourceLink || null,
      // Carry the user REFERENCE (not the legacy text) onto the new ad creative.
      assigned_to_user_id: v.assigned_to_user_id || null,
      date_added: todayISO(),
      ad_format: 'Video',
      status: 'Ad Creative Needed',
    };
    const { data: created, error } = await supabase.from('studio_ad_creatives').insert([row]).select().single();
    setAdBusy(null);
    if (error) {
      console.error('[VideoReview] failed to create ad creative', { row, error });
      alert(`Couldn't create ad creative: ${error.message}`);
      return;
    }
    const adUrl = created?.id && typeof window !== 'undefined' ? `${window.location.origin}/studio/ad-creative/${created.id}` : '';
    notifyAdPipeline({ status: 'Ad Creative Needed', creativeId, itemUrl: adUrl, sourceLink, finalLink: '', ...mentions });
    showToast(`Ad creative created for ${creativeId} → assigned to ${editorName || 'unassigned'}`);
    onReload();
  }

  async function createVideo() {
    if (creating) return;
    setCreating(true);
    const row = {
      title: draft.title.trim() || 'Untitled Video',
      format: draft.format || null,
      assigned_to_user_id: draft.assigned_to_user_id || null,
      status: draft.status || 'Briefing',
      priority: draft.priority || 'Normal',
      brief_url: draft.brief_url.trim() || null,
      raw_files_url: draft.raw_files_url.trim() || null,
      final_url: draft.final_url.trim() || null,
      deadline: draft.deadline || null,
    };
    const { data: created, error } = await supabase.from('studio_videos').insert([row]).select().single();
    setCreating(false);
    if (error) {
      console.error('[VideoReview] failed to create video', { row, error });
      alert(`Couldn't create video: ${error.message}`);
      return;
    }
    // A video created directly at a pinging status fires that ping once on
    // creation (changeStatus only fires on edits to existing rows). This is the
    // only insert-time fire, so it can't double-fire with changeStatus/patch.
    if (VIDEO_NOTIFY_STATUSES.includes(row.status)) {
      notifyVideo({
        status: row.status,
        title: row.title,
        itemUrl: created?.id ? videoUrl(created.id) : '',
        briefLink: row.brief_url ?? '',
        rawFilesLink: row.raw_files_url ?? '',
        finalLink: row.final_url ?? '',
        ...buildPipelineMentions(row.assigned_to_user_id, profiles),
      });
    }
    closeAdd();
    onReload();
  }

  function closeAdd() {
    setAddOpen(false);
    setDraft(EMPTY_DRAFT);
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
  const assignedPresent = present(videos.map(v => resolveAssignee(v.assigned_to_user_id, profiles) || undefined));
  const formatPresent = present(videos.map(v => v.format));
  const priorityPresent = present(videos.map(v => v.priority || 'Normal'));

  const filtered = useMemo(() => {
    let r = videos;
    if (fStatus !== 'All') r = r.filter(v => v.status === fStatus);
    if (fAssigned !== 'All') r = r.filter(v => (resolveAssignee(v.assigned_to_user_id, profiles) || '') === fAssigned);
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

  // "Load more" pagination — resets to the first page when filters/sort change,
  // not on data refresh (so editing a cell doesn't collapse the list).
  const { visible, hasMore, remaining, loadMore } = usePagedRows(
    filtered,
    [fStatus, fAssigned, fFormat, fPriority, sortDir, dateFrom, dateTo].join('|'),
  );

  const fields: FieldDef[] = useMemo(() => [
    { key: 'title', label: 'Title / Desc', type: 'textarea', placeholder: 'Title / description' },
    { key: 'format', label: 'Format', type: 'pill', field: 'video_format', options: formatValues, colors: formatColors, allowAdd: isAdmin, allowEmpty: true },
    { key: 'assigned_to_user_id', label: 'Assigned To', type: 'user' },
    { key: 'status', label: 'Status', type: 'pill', field: 'video_status', options: statusValues, colors: statusColors, allowAdd: isAdmin },
    { key: 'priority', label: 'Priority', type: 'pill', field: 'video_priority', options: priorityOpts, colors: PRIORITY_COLORS, allowAdd: isAdmin },
    { key: 'brief_url', label: 'Brief', type: 'url' },
    { key: 'raw_files_url', label: 'Raw Files', type: 'url' },
    { key: 'final_url', label: 'Final Product', type: 'url' },
    { key: 'deadline', label: 'Deadline', type: 'date' },
    { key: 'revision_count', label: 'Revisions', type: 'readonly' },
  ], [formatValues, formatColors, statusValues, statusColors, priorityOpts, isAdmin]);

  const selected = selectedId ? videos.find(v => v.id === selectedId) : null;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <QuickLinks context="video-review" links={quickLinks} onReload={onReload} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            <FilterField label="Status"><MiniSelect value={fStatus} options={statusPresent} onChange={setFStatus} /></FilterField>
            <FilterField label="Assigned to"><MiniSelect value={fAssigned} options={assignedPresent} onChange={setFAssigned} /></FilterField>
            <FilterField label="Format"><MiniSelect value={fFormat} options={formatPresent} onChange={setFFormat} /></FilterField>
            <FilterField label="Priority"><MiniSelect value={fPriority} options={priorityPresent} onChange={setFPriority} /></FilterField>
            <FilterField label="Sort">
              <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))} title="Sort by deadline">
                Deadline {sortDir === 'asc' ? '↑ Oldest' : '↓ Newest'}
              </button>
            </FilterField>
            <FilterField label="From">
              <input className="form-input" type="date" style={{ width: 130, padding: '4px 7px', fontSize: 11 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </FilterField>
            <FilterField label="To">
              <input className="form-input" type="date" style={{ width: 130, padding: '4px 7px', fontSize: 11 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </FilterField>
            {(dateFrom || dateTo) && <button className="btn-ghost" style={{ fontSize: 10, padding: '4px 8px' }} onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear dates</button>}
          </div>
          <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }} onClick={() => { setDraft(EMPTY_DRAFT); setAddOpen(true); }}>+ Add Video</button>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>No videos match. Add a video or adjust filters.</div>
        ) : (
          <>
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
                  <th>Ad Creative</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(v => {
                  const overdue = isOverdue(v.deadline, v.status, DONE);
                  return (
                    <Fragment key={v.id}>
                      <tr style={overdue ? { background: 'rgba(239,68,68,0.06)', boxShadow: 'inset 3px 0 0 #ef4444' } : (selectedId === v.id ? { background: 'var(--surface-2)' } : undefined)}>
                        <td style={{ minWidth: 180 }}>
                          <button onClick={() => setSelectedId(v.id)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 12, textAlign: 'left', padding: '4px 0', fontFamily: 'inherit', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="Open details">{v.title}</button>
                        </td>
                        <td><EditPillSelect field="video_format" value={v.format || ''} options={formatValues} colors={formatColors} onChange={f => patch(v.id, { format: f })} onAddOption={addOption} allowAdd={isAdmin} allowEmpty /></td>
                        <td><UserPicker value={v.assigned_to_user_id ?? undefined} profiles={profiles} onChange={uid => patch(v.id, { assigned_to_user_id: uid || null })} /></td>
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
                          <button
                            className="btn-ghost"
                            style={{ fontSize: 11, padding: '4px 10px', color: 'var(--accent)', whiteSpace: 'nowrap' }}
                            onClick={() => createAdCreative(v)}
                            disabled={adBusy === v.id}
                            title="Create an Ad Creative from this video and start the ad lifecycle"
                          >
                            {adBusy === v.id ? '…' : '🎬 Ad Creative Needed'}
                          </button>
                        </td>
                        <td><button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteVideo(v.id)}>✕</button></td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hasMore && <LoadMore remaining={remaining} onClick={loadMore} />}
          </>
        )}
      </div>

      {selected && (
        <ItemPanel
          itemType="video"
          itemId={selected.id}
          title={selected.title}
          fields={fields}
          values={selected}
          onChangeField={(key, value) => {
            if (key === 'status') changeStatus(selected, value);
            else if (key === 'assigned_to_user_id') patch(selected.id, { assigned_to_user_id: value || null });
            else patch(selected.id, { [key]: value });
          }}
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
              <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>New Video</div>
              <button onClick={closeAdd} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <DraftField label="Title / Desc">
                <textarea className="form-input" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="Title / description" rows={2} style={{ resize: 'vertical', fontSize: 12, lineHeight: 1.4, width: '100%' }} />
              </DraftField>
              <DraftField label="Format">
                <EditPillSelect field="video_format" value={draft.format} options={formatValues} colors={formatColors} onChange={f => setDraft(d => ({ ...d, format: f }))} onAddOption={addOption} allowAdd={isAdmin} allowEmpty />
              </DraftField>
              <DraftField label="Assigned To">
                <UserPicker value={draft.assigned_to_user_id} profiles={profiles} onChange={uid => setDraft(d => ({ ...d, assigned_to_user_id: uid }))} />
              </DraftField>
              <DraftField label="Status">
                <EditPillSelect field="video_status" value={draft.status} options={statusValues} colors={statusColors} onChange={s => setDraft(d => ({ ...d, status: s }))} onAddOption={addOption} allowAdd={isAdmin} />
              </DraftField>
              <DraftField label="Priority">
                <EditPillSelect field="video_priority" value={draft.priority} options={priorityOpts} colors={PRIORITY_COLORS} onChange={p => setDraft(d => ({ ...d, priority: p }))} onAddOption={addOption} allowAdd={isAdmin} />
              </DraftField>
              <DraftField label="Brief">
                <input className="form-input" value={draft.brief_url} onChange={e => setDraft(d => ({ ...d, brief_url: e.target.value }))} placeholder="https://…" style={{ width: '100%', fontSize: 12 }} />
              </DraftField>
              <DraftField label="Raw Files">
                <input className="form-input" value={draft.raw_files_url} onChange={e => setDraft(d => ({ ...d, raw_files_url: e.target.value }))} placeholder="https://…" style={{ width: '100%', fontSize: 12 }} />
              </DraftField>
              <DraftField label="Final Product">
                <input className="form-input" value={draft.final_url} onChange={e => setDraft(d => ({ ...d, final_url: e.target.value }))} placeholder="https://…" style={{ width: '100%', fontSize: 12 }} />
              </DraftField>
              <DraftField label="Deadline">
                <input className="form-input" type="date" value={draft.deadline} onChange={e => setDraft(d => ({ ...d, deadline: e.target.value }))} style={{ width: 160, fontSize: 12 }} />
              </DraftField>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }} onClick={closeAdd}>Cancel</button>
              <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={createVideo} disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {optsField && (
        <FieldOptionsManager field={optsField.field} title={optsField.title} options={dropdownOptions} onClose={() => setOptsField(null)} onReload={onReload} />
      )}
    </div>
  );
}

// Label + control row for the Add Video form, matching the detail panel layout.
function DraftField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'start' }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, paddingTop: 6 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}
