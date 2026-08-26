'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioVideo, StudioComment, StudioActivity, StudioQuickLink, StudioDropdownOption, Profile } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { usePagedRows } from '@/lib/use-paged-rows';
import LoadMore from './LoadMore';
import FilterField from './FilterField';
import {
  VIDEO_FORMATS, VIDEO_STATUSES, VIDEO_STATUS_COLORS,
  PRIORITIES, PRIORITY_COLORS,
  isOverdue, logActivity, mergeOptions, inDateRange,
  getFieldOptions, colorMap, buildAddOptionRows,
} from '@/lib/studio';
import { EditPillSelect, MiniSelect, UrlCell, InlineDate, openDatePicker } from './cells';
import TableToolbar, { rowAccent, openOnRowClick, TitleCell } from './table-ui';
import SortControl from './SortControl';
import { SortOption, SortDir, sortRows } from '@/lib/sort';
import ItemPanel, { FieldDef } from './ItemPanel';
import DateRangePicker from './DateRangePicker';
import QuickLinks from './QuickLinks';
import { UserPicker, resolveAssignee, buildPipelineMentions } from './UserPicker';
import FieldOptionsManager from './FieldOptionsManager';
import CopyLinkButton from '@/components/CopyLinkButton';
import { itemUrl } from '@/lib/item-link';

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
  onOpened?: () => void;
  onReload: () => void;
}

export default function VideoReview({ videos, comments, activity, quickLinks, dropdownOptions, profiles, isAdmin, openItemId, onOpened, onReload }: Props) {
  const [fStatus, setFStatus] = usePersistedState<string>('studio_v_status', 'All');
  const [fAssigned, setFAssigned] = usePersistedState<string>('studio_v_assigned', 'All');
  const [fFormat, setFFormat] = usePersistedState<string>('studio_v_format', 'All');
  const [fPriority, setFPriority] = usePersistedState<string>('studio_v_priority', 'All');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = usePersistedState<string>('studio_v_sortkey', 'deadline');
  const [sortDir, setSortDir] = usePersistedState<SortDir>('studio_v_sortdir', 'asc');
  const [dateFrom, setDateFrom] = usePersistedState<string>('studio_v_from', '');
  const [dateTo, setDateTo] = usePersistedState<string>('studio_v_to', '');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [optsField, setOptsField] = useState<{ field: string; title: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<VideoDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);

  // Open a row's panel when arriving via a deep link (Slack "Open in UNCMMN OS").
  // Signal onOpened so the parent clears the one-shot deep link (returning to this
  // tab later must not re-open the panel).
  useEffect(() => { if (openItemId) { setSelectedId(openItemId); onOpened?.(); } }, [openItemId, onOpened]);

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
    const { error } = await supabase.from('studio_videos').update(p).eq('id', id);
    if (error) {
      // Surface the failure instead of letting the field silently revert. When a
      // write targets a column Postgres/PostgREST doesn't know about, the update
      // errors, onReload() re-reads the old row, and the input snaps back to its
      // previous value — which reads as "editing doesn't work" with no clue why.
      // The usual culprit is a missing column or a stale PostgREST schema cache
      // (e.g. tiktok_final_url before studio_videos_tiktok_final.sql has been run
      // — run it, including `notify pgrst, 'reload schema';`).
      console.error('[VideoReview] failed to update video', { id, patch: p, error });
      alert(`Couldn't save changes: ${error.message}`);
    }
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
        itemUrl: itemUrl('video', v.id),
        briefLink: v.brief_url || '',
        rawFilesLink: v.raw_files_url || '',
        finalLink: v.final_url || '',
        deadline: v.deadline || '',
        ...buildPipelineMentions(v.assigned_to_user_id, profiles),
      });
    }
    await patch(v.id, p);
  }

  // Fire-and-forget POST to the #main-ig-updates notify route (server holds the
  // Slack webhook URL, skips silently if unset). Never blocks the UI or throws.
  function notifyVideo(payload: { status: string; title: string; itemUrl: string; briefLink: string; rawFilesLink: string; finalLink: string; deadline: string; editorMention: string }) {
    fetch('/api/video-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(err => console.warn('[VideoReview] /api/video-notify call failed', err));
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
        itemUrl: created?.id ? itemUrl('video', created.id) : '',
        briefLink: row.brief_url ?? '',
        rawFilesLink: row.raw_files_url ?? '',
        finalLink: row.final_url ?? '',
        deadline: row.deadline ?? '',
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
  // Status filter always lists the FULL defined status set (not just statuses
  // present in the current rows), unioned with any stray statuses on existing rows
  // so nothing becomes unreachable. Selecting a no-match status falls through to
  // the empty state below.
  const statusPresent = ['All', ...Array.from(new Set([...statusValues, ...videos.map(v => v.status).filter(Boolean) as string[]]))];
  const assignedPresent = present(videos.map(v => resolveAssignee(v.assigned_to_user_id, profiles) || undefined));
  const formatPresent = present(videos.map(v => v.format));
  const priorityPresent = present(videos.map(v => v.priority || 'Normal'));

  // Status/Priority sort by pipeline position (Briefing → … → Posted), taken from
  // the same admin-ordered option lists the pills render from.
  const sortOptions: SortOption<StudioVideo>[] = useMemo(() => [
    { key: 'deadline', label: 'Deadline', kind: 'date', value: v => v.deadline },
    { key: 'status', label: 'Status', kind: 'order', order: statusValues, value: v => v.status },
    { key: 'assigned', label: 'Assigned To', kind: 'text', value: v => resolveAssignee(v.assigned_to_user_id, profiles) },
    { key: 'title', label: 'Title / Description', kind: 'text', value: v => v.title },
    { key: 'created_at', label: 'Date Added', kind: 'date', value: v => v.created_at },
    { key: 'priority', label: 'Priority', kind: 'order', order: priorityOpts, value: v => v.priority || 'Normal' },
  ], [statusValues, priorityOpts, profiles]);

  const filtered = useMemo(() => {
    let r = videos;
    const q = search.trim().toLowerCase();
    if (q) r = r.filter(v => (v.title || '').toLowerCase().includes(q));
    if (fStatus !== 'All') r = r.filter(v => v.status === fStatus);
    if (fAssigned !== 'All') r = r.filter(v => (resolveAssignee(v.assigned_to_user_id, profiles) || '') === fAssigned);
    if (fFormat !== 'All') r = r.filter(v => (v.format || '') === fFormat);
    if (fPriority !== 'All') r = r.filter(v => (v.priority || 'Normal') === fPriority);
    if (dateFrom || dateTo) r = r.filter(v => inDateRange(v.deadline, dateFrom, dateTo));
    return sortRows(r, sortOptions, sortKey, sortDir);
  }, [videos, search, fStatus, fAssigned, fFormat, fPriority, sortKey, sortDir, dateFrom, dateTo, profiles, sortOptions]);

  // "Load more" pagination — resets to the first page when filters/sort change,
  // not on data refresh (so editing a cell doesn't collapse the list).
  const { visible, hasMore, remaining, loadMore } = usePagedRows(
    filtered,
    [search, fStatus, fAssigned, fFormat, fPriority, sortKey, sortDir, dateFrom, dateTo].join('|'),
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
    // The TikTok cut has a different CTA from the Instagram one above. Panel-only
    // by design — the main table keeps a single "Final" column — and deliberately
    // outside the status flow, so it never feeds a ping.
    { key: 'tiktok_final_url', label: 'TikTok Final', type: 'url' },
    { key: 'deadline', label: 'Deadline', type: 'date' },
    { key: 'revision_count', label: 'Revisions', type: 'readonly' },
  ], [formatValues, formatColors, statusValues, statusColors, priorityOpts, isAdmin]);

  const selected = selectedId ? videos.find(v => v.id === selectedId) : null;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <QuickLinks context="video-review" links={quickLinks} onReload={onReload} />

        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search videos…"
          count={filtered.length}
          countNoun="video"
          actionLabel="Add Video"
          onAction={() => { setDraft(EMPTY_DRAFT); setAddOpen(true); }}
        >
          <MiniSelect size="md" allLabel="All status" value={fStatus} options={statusPresent} onChange={setFStatus} />
          <MiniSelect size="md" allLabel="Everyone" value={fAssigned} options={assignedPresent} onChange={setFAssigned} />
          <MiniSelect size="md" allLabel="All formats" value={fFormat} options={formatPresent} onChange={setFFormat} />
          <MiniSelect size="md" allLabel="All priorities" value={fPriority} options={priorityPresent} onChange={setFPriority} />
          <SortControl options={sortOptions} sortKey={sortKey} sortDir={sortDir} onKeyChange={setSortKey} onDirChange={setSortDir} />
          <FilterField label="Date"><DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} /></FilterField>
        </TableToolbar>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>No videos match. Add a video or adjust filters.</div>
        ) : (
          <>
          <div className="studio-panel">
          <div className="studio-scroll">
            <table className="studio-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 240 }}>Title</th>
                  <th onClick={isAdmin ? () => setOptsField({ field: 'video_format', title: 'Format' }) : undefined} style={{ cursor: isAdmin ? 'pointer' : undefined, userSelect: 'none' }}>Format{isAdmin && <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>✎</span>}</th>
                  <th>Assigned</th>
                  <th onClick={isAdmin ? () => setOptsField({ field: 'video_status', title: 'Status' }) : undefined} style={{ cursor: isAdmin ? 'pointer' : undefined, userSelect: 'none' }}>Status{isAdmin && <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>✎</span>}</th>
                  <th>Brief</th>
                  <th>Raw Files</th>
                  <th>Final</th>
                  <th>Deadline</th>
                  <th>Revisions</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(v => {
                  const overdue = isOverdue(v.deadline, v.status, DONE);
                  return (
                    // The rail carries the row's status colour, or --neg when
                    // it's overdue — the urgent signal outranks the status one,
                    // and the status pill is right there either way.
                    <tr
                      key={v.id}
                      className={selectedId === v.id ? 'is-selected' : undefined}
                      style={{ ...rowAccent(overdue ? 'var(--neg)' : statusColors[v.status]), cursor: 'pointer' }}
                      onClick={openOnRowClick(() => setSelectedId(v.id))}
                    >
                      <td style={{ minWidth: 240 }}>
                        <TitleCell title={v.title} onOpen={() => setSelectedId(v.id)}>
                          <CopyLinkButton type="video" id={v.id} />
                        </TitleCell>
                      </td>
                      <td><EditPillSelect size="md" field="video_format" value={v.format || ''} options={formatValues} colors={formatColors} onChange={f => patch(v.id, { format: f })} onAddOption={addOption} allowAdd={isAdmin} allowEmpty /></td>
                      <td><UserPicker size="md" value={v.assigned_to_user_id ?? undefined} profiles={profiles} onChange={uid => patch(v.id, { assigned_to_user_id: uid || null })} /></td>
                      <td><EditPillSelect size="md" field="video_status" value={v.status} options={statusValues} colors={statusColors} onChange={s => changeStatus(v, s)} onAddOption={addOption} allowAdd={isAdmin} /></td>
                      <td><UrlCell value={v.brief_url} onCommit={u => patch(v.id, { brief_url: u })} /></td>
                      <td><UrlCell value={v.raw_files_url} onCommit={u => patch(v.id, { raw_files_url: u })} /></td>
                      <td><UrlCell value={v.final_url} onCommit={u => patch(v.id, { final_url: u })} /></td>
                      <td>
                        <div className="st-datecell">
                          <InlineDate display="chip" value={v.deadline} onCommit={d => patch(v.id, { deadline: d || undefined })} highlight={overdue} />
                          {overdue && <span className="st-overdue">OVERDUE</span>}
                        </div>
                      </td>
                      <td>
                        <span
                          className={v.revision_count > 0 ? 'st-rev' : 'st-rev is-zero'}
                          title={v.revision_count > 0 ? `${v.revision_count} revision round(s)` : 'No revisions'}
                        >
                          {v.revision_count || 0}
                        </span>
                      </td>
                      <td><button className="btn-danger row-action" style={{ padding: '2px 6px' }} onClick={() => deleteVideo(v.id)} title="Delete video" aria-label="Delete video">✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
          {hasMore && <LoadMore remaining={remaining} onClick={loadMore} />}
          </>
        )}
      </div>

      {selected && (
        <ItemPanel
          itemType="video"
          linkType="video"
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
                <input className="form-input" type="date" value={draft.deadline} onChange={e => setDraft(d => ({ ...d, deadline: e.target.value }))} onClick={openDatePicker} style={{ width: 160, fontSize: 12 }} />
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
