'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { TrialReelSource, TrialReelProduction, StudioComment, StudioActivity, Profile } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { logActivity } from '@/lib/studio';
import { TRIAL_REEL_STATUSES, TRIAL_REEL_STATUS_COLORS, TRIAL_REEL_NOTIFY_STATUSES, TRIAL_REEL_REVISIONS_STATUS } from '@/lib/trial-reels';
import { EditPillSelect, UrlCell, MiniSelect, isHttpUrl } from '../studio/cells';
import { UserPicker, resolveAssignee, slackMentionByAssignee } from '../studio/UserPicker';
import FilterField from '../studio/FilterField';
import ItemPanel, { FieldDef } from '../studio/ItemPanel';

interface Props {
  productions: TrialReelProduction[];
  sources: TrialReelSource[];
  comments: StudioComment[];
  activity: StudioActivity[];
  profiles: Profile[];
  isAdmin: boolean;
  currentUserId: string | null;
  openItemId?: string;
  onOpened?: () => void;
  onReload: () => void;
}

export default function ProductionBoard({ productions, sources, comments, activity, profiles, isAdmin, currentUserId, openItemId, onOpened, onReload }: Props) {
  const [fStatus, setFStatus] = usePersistedState<string>('trialreel_p_status', 'All');
  const [fAssigned, setFAssigned] = usePersistedState<string>('trialreel_p_assigned', 'All');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => { if (openItemId) { setSelectedId(openItemId); onOpened?.(); } }, [openItemId, onOpened]);

  const sourceById = useMemo(() => {
    const m = new Map<string, TrialReelSource>();
    sources.forEach(s => m.set(s.id, s));
    return m;
  }, [sources]);

  // Editors see ONLY reels assigned to them (Video-Review-style gating); admins
  // see the whole board.
  const scoped = useMemo(
    () => (isAdmin ? productions : productions.filter(p => p.assigned_to_user_id && p.assigned_to_user_id === currentUserId)),
    [productions, isAdmin, currentUserId],
  );

  // Absolute deep link to a reel's detail — same shape the Slack pings use.
  function reelUrl(id: string): string {
    return typeof window !== 'undefined' ? `${window.location.origin}/trialreel/${id}` : '';
  }

  function notifyInReview(payload: { itemUrl: string; description: string; sourceUrl: string }) {
    fetch('/api/trialreels-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'in_review', ...payload }),
    }).catch(err => console.warn('[ProductionBoard] /api/trialreels-notify call failed', err));
  }

  // Revisions Needed → ping the assigned editor (mention resolved the same way as
  // the queue digest: assigned_to_user_id → profile → slack_user_id).
  function notifyRevisions(payload: { editorMention: string; itemUrl: string; description: string; sourceUrl: string }) {
    fetch('/api/trialreels-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'revisions_needed', ...payload }),
    }).catch(err => console.warn('[ProductionBoard] /api/trialreels-notify call failed', err));
  }

  async function patch(id: string, p: Partial<TrialReelProduction>) {
    await supabase.from('trial_reel_production').update(p).eq('id', id);
    onReload();
  }

  async function changeStatus(row: TrialReelProduction, status: string) {
    if (status === row.status) return;
    await logActivity('trialreel', row.id, 'Status changed', row.status, status);
    const src = row.source_id ? sourceById.get(row.source_id) : undefined;
    // Fire the reviewer ping only on the In Review transition (single status path).
    if (TRIAL_REEL_NOTIFY_STATUSES.includes(status)) {
      notifyInReview({ itemUrl: reelUrl(row.id), description: src?.description || '', sourceUrl: src?.posted_url || '' });
    }
    // Revisions Needed → ping the assigned editor for this reel.
    if (status === TRIAL_REEL_REVISIONS_STATUS) {
      notifyRevisions({
        editorMention: slackMentionByAssignee(row.assigned_to_user_id, profiles),
        itemUrl: reelUrl(row.id),
        description: src?.description || '',
        sourceUrl: src?.posted_url || '',
      });
    }
    await patch(row.id, { status });
  }

  async function deleteRow(id: string) {
    if (!confirm('Remove this reel from the production board?')) return;
    await supabase.from('trial_reel_production').delete().eq('id', id);
    if (selectedId === id) setSelectedId(null);
    onReload();
  }

  const present = (vals: (string | undefined)[]) => ['All', ...Array.from(new Set(vals.filter(Boolean) as string[]))];
  // Status filter always lists the FULL defined flow (Assigned → … → Posted),
  // unioned with any stray statuses present so none become unreachable.
  const statusPresent = ['All', ...Array.from(new Set([...TRIAL_REEL_STATUSES, ...scoped.map(p => p.status).filter(Boolean) as string[]]))];
  const assignedPresent = present(scoped.map(p => resolveAssignee(p.assigned_to_user_id, profiles) || undefined));

  const filtered = useMemo(() => {
    let r = scoped;
    if (fStatus !== 'All') r = r.filter(p => p.status === fStatus);
    if (isAdmin && fAssigned !== 'All') r = r.filter(p => (resolveAssignee(p.assigned_to_user_id, profiles) || '') === fAssigned);
    return [...r].sort((a, b) => (b.queued_date || b.created_at || '').localeCompare(a.queued_date || a.created_at || ''));
  }, [scoped, fStatus, fAssigned, isAdmin, profiles]);

  const selected = selectedId ? scoped.find(p => p.id === selectedId) : null;
  const selectedSource = selected?.source_id ? sourceById.get(selected.source_id) : undefined;

  const fields: FieldDef[] = useMemo(() => {
    const base: FieldDef[] = [
      { key: 'source_description', label: 'Description', type: 'readonly' },
      { key: 'full_version_file', label: 'Full Version File', type: 'readonly-maybe-url' },
      { key: 'source_timestamp', label: 'Timestamp', type: 'readonly' },
      { key: 'snippet_download_link', label: 'Snippet Download', type: 'readonly-url' },
      { key: 'posted_url', label: 'Original Reel · reference', type: 'readonly-url' },
      { key: 'drive_url', label: 'Drive · reference', type: 'readonly-url' },
    ];
    base.push(isAdmin
      ? { key: 'assigned_to_user_id', label: 'Assigned Editor', type: 'user' }
      : { key: 'assigned_name', label: 'Assigned Editor', type: 'readonly' });
    base.push(
      { key: 'status', label: 'Status', type: 'pill', options: TRIAL_REEL_STATUSES, colors: TRIAL_REEL_STATUS_COLORS },
      { key: 'final_url', label: 'Recreated Reel · final', type: 'url' },
      { key: 'queued_date', label: 'Queued', type: 'readonly' },
    );
    return base;
  }, [isAdmin]);

  const panelValues = selected ? {
    ...selected,
    source_description: selectedSource?.description || '',
    full_version_file: selectedSource?.full_version_file || '',
    source_timestamp: selectedSource?.timestamp || '',
    snippet_download_link: selectedSource?.snippet_download_link || '',
    posted_url: selectedSource?.posted_url || '',
    drive_url: selectedSource?.drive_url || '',
    assigned_name: resolveAssignee(selected.assigned_to_user_id, profiles) || 'Unassigned',
  } : {};

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <FilterField label="Status"><MiniSelect value={fStatus} options={statusPresent} onChange={setFStatus} /></FilterField>
          {isAdmin && <FilterField label="Assigned to"><MiniSelect value={fAssigned} options={assignedPresent} onChange={setFAssigned} /></FilterField>}
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>
            {fStatus !== 'All'
              ? `No trial reels with status “${fStatus}”.`
              : isAdmin ? 'No reels in production yet. Generate today’s queue from the Source Library.' : 'No trial reels assigned to you yet.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>Description</th>
                  <th>Reference</th>
                  <th>Assigned</th>
                  <th>Status</th>
                  <th>Final</th>
                  <th>Open</th>
                  {isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const src = p.source_id ? sourceById.get(p.source_id) : undefined;
                  const desc = src?.description || '(source removed)';
                  return (
                    <Fragment key={p.id}>
                      <tr style={selectedId === p.id ? { background: 'var(--surface-2)' } : undefined}>
                        <td style={{ minWidth: 220 }}>
                          <button onClick={() => setSelectedId(p.id)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 12, textAlign: 'left', padding: '4px 0', fontFamily: 'inherit', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="Open details">{desc}</button>
                          {(src?.full_version_file || src?.timestamp) && (
                            <div style={{ fontSize: 10, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={[src?.full_version_file, src?.timestamp].filter(Boolean).join(' · ')}>
                              {src?.full_version_file && (isHttpUrl(src.full_version_file)
                                ? <a href={src.full_version_file} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }} title={src.full_version_file}>Full version ↗</a>
                                : <span>{src.full_version_file}</span>)}
                              {src?.full_version_file && src?.timestamp ? ' · ' : ''}
                              {src?.timestamp && <span>{src.timestamp}</span>}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {src?.posted_url ? <a href={src.posted_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 11, textDecoration: 'none', whiteSpace: 'nowrap' }} title="Original reel (reference)">Reel ↗</a> : <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</span>}
                            {src?.snippet_download_link ? <a href={src.snippet_download_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 11, textDecoration: 'none', whiteSpace: 'nowrap' }} title="Snippet download">Snippet ↗</a> : null}
                            {src?.drive_url ? <a href={src.drive_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 11, textDecoration: 'none', whiteSpace: 'nowrap' }} title="Drive (reference)">Drive ↗</a> : null}
                          </div>
                        </td>
                        <td>
                          {isAdmin
                            ? <UserPicker value={p.assigned_to_user_id ?? undefined} profiles={profiles} onChange={uid => patch(p.id, { assigned_to_user_id: uid || null })} />
                            : <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{resolveAssignee(p.assigned_to_user_id, profiles) || 'Unassigned'}</span>}
                        </td>
                        <td><EditPillSelect field="trialreel_status" value={p.status} options={TRIAL_REEL_STATUSES} colors={TRIAL_REEL_STATUS_COLORS} onChange={s => changeStatus(p, s)} allowAdd={false} /></td>
                        <td><UrlCell value={p.final_url ?? undefined} onCommit={u => patch(p.id, { final_url: u || null })} /></td>
                        <td>
                          <a href={reelUrl(p.id)} style={{ color: 'var(--text-faint)', fontSize: 12, textDecoration: 'none' }} title="Open this reel's detail (deep link)">↗ OS</a>
                        </td>
                        {isAdmin && <td><button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteRow(p.id)}>✕</button></td>}
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
          itemType="trialreel"
          itemId={selected.id}
          title={selectedSource?.description || 'Trial Reel'}
          fields={fields}
          values={panelValues}
          onChangeField={(key, value) => {
            if (key === 'status') changeStatus(selected, value);
            else if (key === 'assigned_to_user_id') patch(selected.id, { assigned_to_user_id: value || null });
            else if (key === 'final_url') patch(selected.id, { final_url: value || null });
          }}
          onAddOption={() => {}}
          comments={comments}
          activity={activity}
          profiles={profiles}
          isAdmin={isAdmin}
          onReload={onReload}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
