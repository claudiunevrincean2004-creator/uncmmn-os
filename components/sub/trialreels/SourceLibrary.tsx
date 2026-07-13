'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { TrialReelSource, Profile } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { todayISO, formatActivityTime, inDateRange } from '@/lib/studio';
import { fn } from '@/lib/utils';
import {
  parseSourceCSV, importSourceRows, buildQueueCandidates, fmtRatio,
  DEFAULT_RATIO_FLOOR, DEFAULT_QUEUE_COUNT,
} from '@/lib/trial-reels';
import { UrlCell, InlineText, MaybeUrlCell, isHttpUrl, shortUrl } from '../studio/cells';
import DateRangePicker from '../studio/DateRangePicker';
import FilterField from '../studio/FilterField';
import { UserPicker, slackMentionByAssignee, resolveAssignee } from '../studio/UserPicker';
import { DETAIL_LABEL_STYLE, DetailField, DetailLink } from './detail';

interface Props {
  sources: TrialReelSource[];
  profiles: Profile[];
  onReload: () => void;
  showToast: (msg: string) => void;
  onQueued: () => void; // jump to the Production Board after a queue is confirmed
}

type SortKey = 'description' | 'views' | 'follows' | 'follows_per_1k' | 'times_recreated' | 'last_assigned_at' | 'posted_date';

// Inline decimal/integer editor that commits on blur (null when cleared).
function NumCell({ value, onCommit, width = 78 }: { value: number | null | undefined; onCommit: (v: number | null) => void; width?: number }) {
  const [v, setV] = useState(value == null ? '' : String(value));
  useEffect(() => { setV(value == null ? '' : String(value)); }, [value]);
  return (
    <input
      className="form-input"
      type="number"
      step="any"
      style={{ width, padding: '4px 6px', fontSize: 11, textAlign: 'right' }}
      value={v}
      onChange={e => setV(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      onBlur={() => {
        const next = v.trim() === '' ? null : Number(v);
        if (next != null && isNaN(next)) return;
        if (next !== (value ?? null)) onCommit(next);
      }}
    />
  );
}

export default function SourceLibrary({ sources, profiles, onReload, showToast, onQueued }: Props) {
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = usePersistedState<string>('trialreel_src_from', '');
  const [dateTo, setDateTo] = usePersistedState<string>('trialreel_src_to', '');
  const [sortKey, setSortKey] = usePersistedState<SortKey>('trialreel_sortkey', 'follows_per_1k');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('trialreel_sortdir', 'desc');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Generate-queue state
  const [genOpen, setGenOpen] = useState(false);
  const [floor, setFloor] = usePersistedState<number>('trialreel_floor', DEFAULT_RATIO_FLOOR);
  const [count, setCount] = usePersistedState<number>('trialreel_count', DEFAULT_QUEUE_COUNT);
  const [editorId, setEditorId] = useState('');
  const [proposedIds, setProposedIds] = useState<string[]>([]);
  const [addQuery, setAddQuery] = useState('');
  const [generating, setGenerating] = useState(false);
  // Which proposed row is expanded (accordion — one at a time), and a local buffer
  // of clip-brief edits keyed by source id. The buffer is the source of truth while
  // the modal is open so collapsing/expanding never drops an edit; it also survives
  // a Regenerate. Persisted to trial_reel_source.clip_brief on blur.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [briefs, setBriefs] = useState<Record<string, string>>({});

  async function patch(id: string, p: Partial<TrialReelSource>) {
    await supabase.from('trial_reel_source').update(p).eq('id', id);
    onReload();
  }

  async function deleteRow(id: string) {
    if (!confirm('Delete this source reel from the library?')) return;
    await supabase.from('trial_reel_source').delete().eq('id', id);
    onReload();
  }

  // Wipe the ENTIRE source library for a clean re-import. Deletes only
  // trial_reel_source — trial_reel_production rows (existing assignments) are left
  // untouched. Guarded behind the are-you-sure modal below. The `.neq(id, …)`
  // filter matches every real row (PostgREST requires a filter on DELETE).
  async function clearLibrary() {
    if (clearing) return;
    setClearing(true);
    const { error } = await supabase
      .from('trial_reel_source')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    setClearing(false);
    if (error) {
      console.error('[SourceLibrary] failed to clear library', error);
      alert(`Couldn't clear library: ${error.message}`);
      return;
    }
    setClearOpen(false);
    showToast('Source library cleared');
    onReload();
  }

  // ── CSV import ─────────────────────────────────────────────────────────────
  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await runImport(file);
    if (fileRef.current) fileRef.current.value = ''; // allow re-importing the same file
  }

  async function runImport(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseSourceCSV(text);
      if (!parsed.headersFound) {
        alert('Could not find a "Link to posted video" column. Expected columns: Date, Description, Google Drive Link, Link to posted video, Views, Follows, Follows/ 1k views, Contains talking?');
        return;
      }
      if (parsed.rows.length === 0) {
        showToast('No rows with a posted link found in that CSV.');
        return;
      }
      const { inserted, updated } = await importSourceRows(parsed.rows);
      const extra = parsed.skipped ? `, ${parsed.skipped} skipped (no link)` : '';
      showToast(`Imported: ${inserted} new, ${updated} updated${extra}`);
      onReload();
    } catch (err) {
      console.error('[SourceLibrary] CSV import failed', err);
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  }

  // ── Generate queue ─────────────────────────────────────────────────────────
  const candidates = useMemo(() => buildQueueCandidates(sources, floor), [sources, floor]);

  function openGenerate() {
    const initial = buildQueueCandidates(sources, floor).slice(0, count).map(s => s.id);
    setProposedIds(initial);
    setEditorId('');
    setAddQuery('');
    setExpandedId(null);
    setBriefs({});
    setGenOpen(true);
  }

  // Clip-brief buffer: read from the local edit if present, else the stored value.
  function briefValue(s: TrialReelSource): string {
    return s.id in briefs ? briefs[s.id] : (s.clip_brief || '');
  }
  function onBriefChange(id: string, v: string) {
    setBriefs(b => ({ ...b, [id]: v }));
  }
  // Persist a single row's brief (no onReload — avoids re-rendering the modal and
  // collapsing the accordion mid-edit; the local buffer keeps the UI correct).
  async function saveBrief(id: string) {
    if (!(id in briefs)) return;
    const v = briefs[id];
    const src = sources.find(s => s.id === id);
    if ((src?.clip_brief || '') === v) return; // unchanged
    const { error } = await supabase.from('trial_reel_source').update({ clip_brief: v || null }).eq('id', id);
    if (error) console.warn('[SourceLibrary] failed to save clip brief', error);
  }

  function regenerate() {
    setProposedIds(buildQueueCandidates(sources, floor).slice(0, count).map(s => s.id));
  }

  const proposed = useMemo(
    () => proposedIds.map(id => sources.find(s => s.id === id)).filter(Boolean) as TrialReelSource[],
    [proposedIds, sources],
  );
  // Bench = eligible candidates not already proposed (for swap/add).
  const bench = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    return candidates
      .filter(s => !proposedIds.includes(s.id))
      .filter(s => !q || (s.description || '').toLowerCase().includes(q) || (s.posted_url || '').toLowerCase().includes(q));
  }, [candidates, proposedIds, addQuery]);

  function removeProposed(id: string) { setProposedIds(ids => ids.filter(x => x !== id)); }
  function addProposed(id: string) { setProposedIds(ids => (ids.includes(id) ? ids : [...ids, id])); setAddQuery(''); }

  function notifyDigest(n: number, uid: string) {
    if (typeof window === 'undefined') return;
    const editorMention = slackMentionByAssignee(uid, profiles);
    const boardUrl = `${window.location.origin}/?view=trialreels`;
    fetch('/api/trialreels-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'queue_digest', editorMention, count: n, boardUrl }),
    }).catch(err => console.warn('[SourceLibrary] /api/trialreels-notify call failed', err));
  }

  async function confirmQueue() {
    if (generating) return;
    if (proposed.length === 0) { alert('Add at least one reel to the queue.'); return; }
    if (!editorId) { alert('Choose an editor to assign the batch to.'); return; }
    setGenerating(true);
    // Flush any clip-brief edits still buffered (e.g. Confirm clicked before a
    // textarea blur fired) so the brief is on the source before rows are created.
    await Promise.all(proposed.map(s => saveBrief(s.id)));
    const today = todayISO();
    const nowIso = new Date().toISOString();
    // Seed each production row's clip_brief from the source brief authored here, so
    // the per-assignment brief starts from what the admin wrote (then diverges as it
    // is edited on the board).
    const rows = proposed.map(s => ({ source_id: s.id, assigned_to_user_id: editorId, status: 'Assigned', queued_date: today, clip_brief: briefValue(s) || null }));
    const { error } = await supabase.from('trial_reel_production').insert(rows);
    if (error) {
      setGenerating(false);
      console.error('[SourceLibrary] failed to create production rows', error);
      alert(`Couldn't create the queue: ${error.message}`);
      return;
    }
    // Round-robin bookkeeping: stamp last_assigned_at=now and bump times_recreated
    // so these reels sink to the back of the rotation next time.
    await Promise.all(proposed.map(s => supabase.from('trial_reel_source')
      .update({ last_assigned_at: nowIso, times_recreated: (s.times_recreated || 0) + 1 })
      .eq('id', s.id)));
    // ONE digest ping for the whole batch.
    notifyDigest(proposed.length, editorId);
    const editorName = resolveAssignee(editorId, profiles) || 'unassigned';
    setGenerating(false);
    setGenOpen(false);
    showToast(`Queued ${proposed.length} reels → ${editorName}`);
    onReload();
    onQueued();
  }

  // ── Table ──────────────────────────────────────────────────────────────────
  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'description' ? 'asc' : 'desc'); }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = sources;
    if (q) r = r.filter(s => (s.description || '').toLowerCase().includes(q) || (s.posted_url || '').toLowerCase().includes(q));
    if (dateFrom || dateTo) r = r.filter(s => inDateRange(s.posted_date ?? undefined, dateFrom, dateTo));
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...r].sort((a, b) => {
      if (sortKey === 'description') return dir * (a.description || '').localeCompare(b.description || '');
      if (sortKey === 'last_assigned_at' || sortKey === 'posted_date') {
        const av = a[sortKey] || ''; const bv = b[sortKey] || '';
        return dir * av.localeCompare(bv);
      }
      const av = (a[sortKey] as number) ?? -Infinity;
      const bv = (b[sortKey] as number) ?? -Infinity;
      return dir * (av - bv);
    });
  }, [sources, search, sortKey, sortDir, dateFrom, dateTo]);

  const arrow = (k: SortKey) => (k === sortKey ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');
  const th = (k: SortKey, label: string, extra?: React.CSSProperties): React.ReactElement => (
    <th onClick={() => toggleSort(k)} style={{ cursor: 'pointer', userSelect: 'none', ...extra }}>{label}{arrow(k)}</th>
  );

  const eligibleCount = sources.filter(s => s.eligible).length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          className="form-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search description or link…"
          style={{ fontSize: 12, padding: '6px 10px', width: 260 }}
        />
        <FilterField label="Posted"><DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} /></FilterField>
        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{sources.length} in library · {eligibleCount} eligible</div>
        <div style={{ flex: 1 }} />
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onFilePicked} />
        <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 12px' }} onClick={() => fileRef.current?.click()} disabled={importing}>
          {importing ? 'Importing…' : '⬆ Import CSV'}
        </button>
        <button className="btn-primary" style={{ fontSize: 11, padding: '6px 12px' }} onClick={openGenerate}>🎬 Generate today’s queue</button>
        {sources.length > 0 && (
          <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 12px', color: '#ef4444' }} onClick={() => setClearOpen(true)} title="Delete every source reel (production assignments are kept)">🗑 Clear Library</button>
        )}
      </div>

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>
          No source reels yet. Click “Import CSV” to load the backlog.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                {th('description', 'Description', { minWidth: 220 })}
                <th>Posted</th>
                {th('views', 'Views')}
                {th('follows', 'Follows')}
                {th('follows_per_1k', 'Follows/1k')}
                <th>Full Version</th>
                <th>Timestamp</th>
                <th>Snippet</th>
                <th>Original edit</th>
                <th>Eligible</th>
                {th('times_recreated', 'Recreated')}
                {th('last_assigned_at', 'Last Assigned')}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id} style={s.eligible ? undefined : { opacity: 0.55 }}>
                  <td style={{ minWidth: 220, maxWidth: 320 }}>
                    <span style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.description || ''}>{s.description || '—'}</span>
                  </td>
                  <td><UrlCell value={s.posted_url ?? undefined} onCommit={u => patch(s.id, { posted_url: u || null })} /></td>
                  <td style={{ textAlign: 'right' }}><span style={{ fontSize: 12 }} title={String(s.views ?? '')}>{s.views != null ? fn(s.views) : '—'}</span></td>
                  <td style={{ textAlign: 'right' }}><span style={{ fontSize: 12 }} title={String(s.follows ?? '')}>{s.follows != null ? fn(s.follows) : '—'}</span></td>
                  <td style={{ textAlign: 'right' }}><NumCell value={s.follows_per_1k} onCommit={v => patch(s.id, { follows_per_1k: v })} width={72} /></td>
                  <td><MaybeUrlCell value={s.full_version_file ?? undefined} onCommit={v => patch(s.id, { full_version_file: v || null })} /></td>
                  <td><InlineText value={s.timestamp ?? undefined} onCommit={v => patch(s.id, { timestamp: v || null })} placeholder="—" style={{ width: 110 }} /></td>
                  <td><UrlCell value={s.snippet_download_link ?? undefined} onCommit={u => patch(s.id, { snippet_download_link: u || null })} /></td>
                  <td><MaybeUrlCell value={s.final_product ?? undefined} onCommit={v => patch(s.id, { final_product: v || null })} /></td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="btn-ghost"
                      onClick={() => patch(s.id, { eligible: !s.eligible })}
                      title={s.eligible ? 'Eligible for queueing — click to exclude' : 'Excluded — click to include'}
                      style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                        background: s.eligible ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.15)',
                        color: s.eligible ? '#10b981' : '#6b7280',
                        border: `0.5px solid ${s.eligible ? 'rgba(16,185,129,0.35)' : 'rgba(107,114,128,0.35)'}`,
                      }}
                    >
                      {s.eligible ? 'Eligible' : 'Excluded'}
                    </button>
                  </td>
                  <td style={{ textAlign: 'center' }}><span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.times_recreated ?? 0}</span></td>
                  <td><span style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{s.last_assigned_at ? formatActivityTime(s.last_assigned_at) : 'never'}</span></td>
                  <td><button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteRow(s.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {genOpen && (
        <div className="modal-overlay" onClick={() => setGenOpen(false)}>
          <div className="modal-box" style={{ width: 640, maxHeight: '86vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>Generate today’s queue</div>
              <button onClick={() => setGenOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Min Follows/1k</label>
                <input className="form-input" type="number" step="0.1" min={0} value={floor} onChange={e => setFloor(Number(e.target.value) || 0)} style={{ width: 110, fontSize: 12, padding: '5px 8px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Count</label>
                <input className="form-input" type="number" min={1} value={count} onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: 90, fontSize: 12, padding: '5px 8px' }} />
              </div>
              <button className="btn-ghost" style={{ fontSize: 11, padding: '7px 12px' }} onClick={regenerate}>↻ Regenerate</button>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Assign to editor</label>
                <UserPicker value={editorId} profiles={profiles} onChange={setEditorId} />
              </div>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
              {proposed.length} proposed · round-robin (longest-since-assigned first){candidates.length < count ? ` · only ${candidates.length} clear the floor` : ''}
            </div>

            {/* Proposed list */}
            <div style={{ overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: 8, marginBottom: 10 }}>
              {proposed.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>No eligible reels clear the floor. Lower the ratio or import more.</div>
              ) : proposed.map((s, i) => {
                const open = expandedId === s.id;
                return (
                  <div key={s.id} style={{ borderTop: i === 0 ? undefined : '0.5px solid var(--border)', background: open ? 'var(--surface-2)' : undefined }}>
                    {/* Summary row — click anywhere to expand/collapse (accordion) */}
                    <div
                      onClick={() => setExpandedId(open ? null : s.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer' }}
                      title={open ? 'Collapse' : 'Expand for details & clip brief'}
                    >
                      <span style={{ fontSize: 10, color: 'var(--text-faint)', width: 10, transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)', width: 18, textAlign: 'right' }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.description || ''}>
                          {s.description || s.posted_url || '(untitled)'}
                          {briefValue(s).trim() && <span style={{ marginLeft: 6, color: 'var(--accent)', fontSize: 10 }} title="Has a clip brief">✎</span>}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                          {fmtRatio(s.follows_per_1k)} f/1k · {s.views != null ? fn(s.views) : '—'} views · last {s.last_assigned_at ? formatActivityTime(s.last_assigned_at) : 'never'}
                        </div>
                      </div>
                      <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: '#ef4444' }} onClick={e => { e.stopPropagation(); removeProposed(s.id); }} title="Remove from queue">Remove</button>
                    </div>

                    {/* Expanded detail — organized into groups with breathing room:
                        Description → Clip Brief (link) → Reference links → Timestamp → Stats */}
                    {open && (
                      <div onClick={e => e.stopPropagation()} style={{ padding: '6px 16px 20px 40px', display: 'flex', flexDirection: 'column', gap: 22 }}>
                        <DetailField label="Description">
                          <span style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{s.description || '—'}</span>
                        </DetailField>

                        {/* Clip Brief — a link to the Google Doc. Editable inline; renders as a
                            clickable truncated link once a URL is saved. */}
                        <DetailField label="Clip Brief · Google Doc">
                          <input
                            className="form-input"
                            value={briefValue(s)}
                            onChange={e => onBriefChange(s.id, e.target.value)}
                            onBlur={() => saveBrief(s.id)}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            placeholder="Paste the Google Doc URL with the editor instructions…"
                            style={{ width: '100%', fontSize: 12, padding: '8px 10px' }}
                          />
                          {isHttpUrl(briefValue(s)) && (
                            <a href={briefValue(s)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }} title={briefValue(s)}>↗ {shortUrl(briefValue(s), 48)}</a>
                          )}
                        </DetailField>

                        {/* Reference links — each on its own line, generous spacing. */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ ...DETAIL_LABEL_STYLE, color: 'var(--text-dim)', marginBottom: 4 }}>Reference links</span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <DetailLink label="Original posted reel" value={s.posted_url} />
                            <DetailLink label="Original edit" value={s.final_product} />
                            <DetailLink label="Snippet download" value={s.snippet_download_link} />
                            <DetailLink label="Full version file" value={s.full_version_file} />
                          </div>
                        </div>

                        <DetailField label="Timestamp" inline><span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.timestamp || '—'}</span></DetailField>

                        {/* Stats row */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 32px' }}>
                          <DetailField label="Views" inline><span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.views != null ? fn(s.views) : '—'}</span></DetailField>
                          <DetailField label="Follows" inline><span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.follows != null ? fn(s.follows) : '—'}</span></DetailField>
                          <DetailField label="Follows/1k" inline><span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{fmtRatio(s.follows_per_1k)}</span></DetailField>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Swap-in / add from the bench */}
            <div style={{ marginBottom: 4 }}>
              <input className="form-input" value={addQuery} onChange={e => setAddQuery(e.target.value)} placeholder="Search the library to swap in a reel…" style={{ fontSize: 12, padding: '6px 10px', width: '100%' }} />
              {addQuery.trim() && (
                <div style={{ maxHeight: 160, overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: 8, marginTop: 6 }}>
                  {bench.length === 0 ? (
                    <div style={{ padding: 12, fontSize: 11, color: 'var(--text-faint)' }}>No other eligible reels match.</div>
                  ) : bench.slice(0, 20).map((s, i) => (
                    <button key={s.id} onClick={() => addProposed(s.id)} className="nav-item" style={{ width: '100%', justifyContent: 'space-between', borderTop: i === 0 ? undefined : '0.5px solid var(--border)', borderRadius: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{s.description || s.posted_url}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0, marginLeft: 8 }}>{fmtRatio(s.follows_per_1k)} · +</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }} onClick={() => setGenOpen(false)}>Cancel</button>
              <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={confirmQueue} disabled={generating || proposed.length === 0 || !editorId}>
                {generating ? 'Queuing…' : `Confirm & assign ${proposed.length}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {clearOpen && (
        <div className="modal-overlay" onClick={() => !clearing && setClearOpen(false)}>
          <div className="modal-box" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
            <div className="font-head" style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>Clear the source library?</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 18 }}>
              This permanently deletes <strong style={{ color: 'var(--text)' }}>all {sources.length} source reel{sources.length === 1 ? '' : 's'}</strong> from the library so you can re-import a clean file.
              <br /><br />
              Reels already in production (the Production Board and existing editor assignments) are <strong style={{ color: 'var(--text)' }}>not</strong> affected. This can’t be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }} onClick={() => setClearOpen(false)} disabled={clearing}>Cancel</button>
              <button className="btn-danger" style={{ fontSize: 12, padding: '8px 14px' }} onClick={clearLibrary} disabled={clearing}>
                {clearing ? 'Clearing…' : `Delete all ${sources.length}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
