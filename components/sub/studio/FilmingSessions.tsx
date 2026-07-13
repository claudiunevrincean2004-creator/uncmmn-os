'use client';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioSession, StudioComment, StudioActivity, StudioDropdownOption, CustomProperty, CustomPropertyOption, Profile } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { usePagedRows } from '@/lib/use-paged-rows';
import LoadMore from './LoadMore';
import { SESSION_STATUSES, SESSION_STATUS_COLORS, SESSION_TYPES, SESSION_TYPE_COLORS, todayISO, logActivity, inDateRange, getFieldOptions, colorMap, buildAddOptionRows } from '@/lib/studio';
import { EditPillSelect, MiniSelect, UrlCell, InlineDate, InlineNumber } from './cells';
import ItemPanel, { FieldDef } from './ItemPanel';
import { sortProps, groupOptions, applyCustomFilters, CustomHeaderCells, CustomRowCells, CustomFilterControls, PropertyManagerModal, AddPropertyButton } from './CustomColumns';
import FieldOptionsManager from './FieldOptionsManager';
import FilterField from './FilterField';
import DateRangePicker from './DateRangePicker';

const TABLE_KEY = 'session';

// In-code fallback options per built-in select field, so adding an option can
// backfill them as rows instead of dropping them (see buildAddOptionRows).
const FIELD_FALLBACKS: Record<string, { values: string[]; colors?: Record<string, string> }> = {
  session_status: { values: SESSION_STATUSES, colors: SESSION_STATUS_COLORS },
  session_type: { values: SESSION_TYPES, colors: SESSION_TYPE_COLORS },
};

// Draft for the "Add Session" form. The session is only written to the database
// when the user clicks Create; closing/cancelling resets back to this.
interface SessionDraft {
  name: string;
  type: string;
  script_url: string;
  footage_link: string;
  date: string;
  status: string;
  videos_planned: number;
  videos_filmed: number;
}
const EMPTY_DRAFT: SessionDraft = {
  name: '',
  type: '',
  script_url: '',
  footage_link: '',
  date: '',
  status: 'Planned',
  videos_planned: 0,
  videos_filmed: 0,
};

interface Props {
  sessions: StudioSession[];
  comments: StudioComment[];
  activity: StudioActivity[];
  dropdownOptions: StudioDropdownOption[];
  properties: CustomProperty[];
  customOptions: CustomPropertyOption[];
  profiles: Profile[];
  isAdmin: boolean;
  openItemId?: string;
  onOpened?: () => void;
  onReload: () => void;
}

export default function FilmingSessions({ sessions, comments, activity, dropdownOptions, properties, customOptions, profiles, isAdmin, openItemId, onOpened, onReload }: Props) {
  const [fStatus, setFStatus] = usePersistedState<string>('studio_f_status', 'All');
  const [fType, setFType] = usePersistedState<string>('studio_f_type', 'All');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('studio_f_sortdir', 'asc');
  const [dateFrom, setDateFrom] = usePersistedState<string>('studio_f_from', '');
  const [dateTo, setDateTo] = usePersistedState<string>('studio_f_to', '');
  const [custFilters, setCustFilters] = usePersistedState<Record<string, string>>('studio_f_custfilters', {});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mgrOpen, setMgrOpen] = useState(false);
  const [optsField, setOptsField] = useState<{ field: string; title: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<SessionDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);

  // Open a row's panel when arriving via a deep link (Slack "Open in OS").
  useEffect(() => { if (openItemId) { setSelectedId(openItemId); onOpened?.(); } }, [openItemId, onOpened]);

  const cprops = useMemo(() => sortProps(properties, TABLE_KEY), [properties]);
  const optsByProp = useMemo(() => groupOptions(customOptions), [customOptions]);

  const statusFieldOpts = getFieldOptions(dropdownOptions, 'session_status', SESSION_STATUSES, SESSION_STATUS_COLORS);
  const statusValues = statusFieldOpts.map(o => o.value);
  const statusColors = colorMap(statusFieldOpts);

  const typeFieldOpts = getFieldOptions(dropdownOptions, 'session_type', SESSION_TYPES, SESSION_TYPE_COLORS);
  const typeValues = typeFieldOpts.map(o => o.value);
  const typeColors = colorMap(typeFieldOpts);

  async function addOption(field: string, value: string) {
    const fb = FIELD_FALLBACKS[field] ?? { values: [] };
    const rows = buildAddOptionRows(field, value, fb.values, fb.colors, dropdownOptions);
    if (rows.length) await supabase.from('studio_dropdown_options').insert(rows);
    onReload();
  }

  async function patch(id: string, p: Partial<StudioSession>) {
    // Detect status transitions from the pre-update row BEFORE writing. Doing it
    // here (rather than only in changeStatus) means the Slack notify fires no
    // matter which handler set the status — the inline Status pill, the detail
    // panel, or any future caller — and never on other status changes or on a
    // re-save while already in that status.
    const prev = sessions.find(x => x.id === id);
    const becomingReadyToFilm = p.status === 'Ready to Film' && prev?.status !== 'Ready to Film';
    const becomingFilmed = p.status === 'Filmed' && prev?.status !== 'Filmed';

    const { error } = await supabase.from('studio_sessions').update(p).eq('id', id);
    if (error) {
      // Surface write failures (e.g. a missing column or RLS denial) instead of
      // silently reverting the cell to its previous value on the next reload.
      console.error('[FilmingSessions] failed to update session', { id, patch: p, error });
      alert(`Couldn't save change: ${error.message}`);
    }
    onReload();

    const itemUrl = typeof window !== 'undefined' ? `${window.location.origin}/studio/filming/${id}` : '';
    // Prefer a value included in this same patch, else the current row value.
    if (!error && becomingReadyToFilm) {
      notifyFilming({
        status: 'Ready to Film',
        id,
        itemUrl,
        scriptUrl: (p.script_url ?? prev?.script_url) ?? '',
      });
    }
    if (!error && becomingFilmed) {
      notifyFilming({
        status: 'Filmed',
        id,
        name: prev?.name ?? '',
        itemUrl,
        type: (p.type ?? prev?.type) ?? '',
        footageLink: (p.footage_link ?? prev?.footage_link) ?? '',
      });
    }
  }

  async function changeStatus(s: StudioSession, status: string) {
    if (status === s.status) return;
    await logActivity('session', s.id, 'Status changed', s.status, status);
    // patch() detects the → "Filmed" transition and fires the Slack notify.
    await patch(s.id, { status });
  }

  // Fire-and-forget POST to the server route, which holds the Slack webhook URL,
  // picks the message from `status`, and skips silently if the URL is unset.
  // Never blocks the UI or throws.
  function notifyFilming(payload: { status: string; id: string; itemUrl: string; name?: string; type?: string; footageLink?: string; scriptUrl?: string }) {
    fetch('/api/filming-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(err => console.warn('[FilmingSessions] /api/filming-notify call failed', err));
  }

  async function createSession() {
    if (creating) return;
    setCreating(true);
    const row = {
      name: draft.name.trim() || 'Untitled Session',
      type: draft.type || null,
      script_url: draft.script_url.trim() || null,
      footage_link: draft.footage_link.trim() || null,
      date: draft.date || null,
      status: draft.status || 'Planned',
      videos_planned: draft.videos_planned || 0,
      videos_filmed: draft.videos_filmed || 0,
    };
    const { error } = await supabase.from('studio_sessions').insert([row]);
    setCreating(false);
    if (error) {
      console.error('[FilmingSessions] failed to create session', { row, error });
      alert(`Couldn't create session: ${error.message}`);
      return;
    }
    closeAdd();
    onReload();
  }

  function closeAdd() {
    setAddOpen(false);
    setDraft(EMPTY_DRAFT);
  }

  async function deleteSession(id: string) {
    if (!confirm('Delete this session?')) return;
    await supabase.from('studio_sessions').delete().eq('id', id);
    if (selectedId === id) setSelectedId(null);
    onReload();
  }

  const today = todayISO();
  const present = (vals: (string | undefined)[]) => ['All', ...Array.from(new Set(vals.filter(Boolean) as string[]))];
  // Status filter always lists the FULL defined status set, unioned with any stray
  // statuses present on rows. A no-match selection falls through to the empty state.
  const statusPresent = ['All', ...Array.from(new Set([...statusValues, ...sessions.map(s => s.status).filter(Boolean) as string[]]))];

  const filtered = useMemo(() => {
    let r = sessions;
    if (fStatus !== 'All') r = r.filter(s => s.status === fStatus);
    if (fType !== 'All') r = r.filter(s => s.type === fType);
    if (dateFrom || dateTo) r = r.filter(s => inDateRange(s.date, dateFrom, dateTo));
    return [...r].sort((a, b) => {
      const ad = a.date ? a.date.slice(0, 10) : '';
      const bd = b.date ? b.date.slice(0, 10) : '';
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return sortDir === 'asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
    });
  }, [sessions, fStatus, fType, sortDir, dateFrom, dateTo]);

  const rows = useMemo(() => applyCustomFilters(filtered, cprops, custFilters), [filtered, cprops, custFilters]);

  // "Load more" pagination — resets to the first page on filter/sort change only.
  const { visible, hasMore, remaining, loadMore } = usePagedRows(
    rows,
    [fStatus, fType, sortDir, dateFrom, dateTo, JSON.stringify(custFilters)].join('|'),
  );

  const fields: FieldDef[] = useMemo(() => [
    { key: 'name', label: 'Session / Desc', type: 'textarea', placeholder: 'Session name / description' },
    { key: 'type', label: 'Type', type: 'pill', field: 'session_type', options: typeValues, colors: typeColors, allowAdd: isAdmin },
    { key: 'script_url', label: 'Link to Script', type: 'url' },
    { key: 'footage_link', label: 'Footage', type: 'url' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'status', label: 'Status', type: 'pill', field: 'session_status', options: statusValues, colors: statusColors, allowAdd: isAdmin },
    { key: 'videos_planned', label: 'Videos to Film', type: 'number' },
    { key: 'videos_filmed', label: 'Videos Filmed', type: 'number' },
  ], [statusValues, statusColors, typeValues, typeColors, isAdmin]);

  const selected = selectedId ? sessions.find(s => s.id === selectedId) : null;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            <FilterField label="Status"><MiniSelect value={fStatus} options={statusPresent} onChange={setFStatus} /></FilterField>
            <FilterField label="Type"><MiniSelect value={fType} options={['All', ...typeValues]} onChange={setFType} /></FilterField>
            <FilterField label="Sort">
              <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))} title="Sort by date">
                Date {sortDir === 'asc' ? '↑ Oldest' : '↓ Newest'}
              </button>
            </FilterField>
            <FilterField label="Date"><DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} /></FilterField>
            <CustomFilterControls props={cprops} optionsByProp={optsByProp} filters={custFilters} setFilters={setCustFilters} />
          </div>
          <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }} onClick={() => { setDraft(EMPTY_DRAFT); setAddOpen(true); }}>+ Add Session</button>
        </div>

        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>No sessions match. Add a session or adjust filters.</div>
        ) : (
          <>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>Session / Description</th>
                  <th onClick={isAdmin ? () => setOptsField({ field: 'session_type', title: 'Type' }) : undefined} style={{ cursor: isAdmin ? 'pointer' : undefined, userSelect: 'none' }}>Type{isAdmin && <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>✎</span>}</th>
                  <th>Script</th>
                  <th>Footage</th>
                  <th>Date</th>
                  <th onClick={isAdmin ? () => setOptsField({ field: 'session_status', title: 'Status' }) : undefined} style={{ cursor: isAdmin ? 'pointer' : undefined, userSelect: 'none' }}>Status{isAdmin && <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>✎</span>}</th>
                  <th>To Film</th>
                  <th>Filmed</th>
                  <th style={{ minWidth: 120 }}>Completion</th>
                  <CustomHeaderCells props={cprops} isAdmin={isAdmin} onManage={() => setMgrOpen(true)} />
                  <th style={{ textAlign: 'right' }}>{isAdmin && <AddPropertyButton onClick={() => setMgrOpen(true)} />}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(s => {
                  const planned = s.videos_planned || 0;
                  const filmed = s.videos_filmed || 0;
                  const pct = planned > 0 ? Math.min(100, Math.round((filmed / planned) * 100)) : 0;
                  const isPast = s.date && s.date.slice(0, 10) < today;
                  return (
                    <Fragment key={s.id}>
                      <tr style={{ ...(isPast ? { opacity: 0.6 } : undefined), ...(selectedId === s.id ? { background: 'var(--surface-2)' } : undefined) }}>
                        <td style={{ minWidth: 180 }}>
                          <button onClick={() => setSelectedId(s.id)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 12, textAlign: 'left', padding: '4px 0', fontFamily: 'inherit', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="Open details">{s.name}</button>
                        </td>
                        <td><EditPillSelect field="session_type" value={s.type || ''} options={typeValues} colors={typeColors} onChange={t => patch(s.id, { type: t })} onAddOption={addOption} allowAdd={isAdmin} /></td>
                        <td><UrlCell value={s.script_url} onCommit={u => patch(s.id, { script_url: u })} /></td>
                        <td><UrlCell value={s.footage_link} onCommit={u => patch(s.id, { footage_link: u })} /></td>
                        <td><InlineDate value={s.date} onCommit={d => patch(s.id, { date: d || undefined })} /></td>
                        <td><EditPillSelect field="session_status" value={s.status} options={statusValues} colors={statusColors} onChange={st => changeStatus(s, st)} onAddOption={addOption} allowAdd={isAdmin} /></td>
                        <td style={{ textAlign: 'center' }}><InlineNumber value={planned} onCommit={n => patch(s.id, { videos_planned: n })} /></td>
                        <td style={{ textAlign: 'center' }}><InlineNumber value={filmed} onCommit={n => patch(s.id, { videos_filmed: n })} /></td>
                        <td style={{ minWidth: 120 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="progress-bar" style={{ flex: 1, minWidth: 60 }}>
                              <div className={`progress-bar-fill${pct >= 100 ? ' complete' : ''}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span style={{ fontSize: 10, color: 'var(--text-faint)', width: 30, textAlign: 'right' }}>{pct}%</span>
                          </div>
                        </td>
                        <CustomRowCells row={s} props={cprops} optionsByProp={optsByProp} onPatch={patch} />
                        <td><button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteSession(s.id)}>✕</button></td>
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
          itemType="session"
          itemId={selected.id}
          title={selected.name}
          fields={fields}
          values={selected}
          onChangeField={(key, value) => { if (key === 'status') changeStatus(selected, value); else patch(selected.id, { [key]: value }); }}
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
              <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>New Filming Session</div>
              <button onClick={closeAdd} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <DraftField label="Session / Desc">
                <textarea className="form-input" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Session name / description" rows={2} style={{ resize: 'vertical', fontSize: 12, lineHeight: 1.4, width: '100%' }} />
              </DraftField>
              <DraftField label="Type">
                <EditPillSelect field="session_type" value={draft.type} options={typeValues} colors={typeColors} onChange={t => setDraft(d => ({ ...d, type: t }))} onAddOption={addOption} allowAdd={isAdmin} allowEmpty />
              </DraftField>
              <DraftField label="Link to Script">
                <input className="form-input" value={draft.script_url} onChange={e => setDraft(d => ({ ...d, script_url: e.target.value }))} placeholder="https://…" style={{ width: '100%', fontSize: 12 }} />
              </DraftField>
              <DraftField label="Footage">
                <input className="form-input" value={draft.footage_link} onChange={e => setDraft(d => ({ ...d, footage_link: e.target.value }))} placeholder="https://…" style={{ width: '100%', fontSize: 12 }} />
              </DraftField>
              <DraftField label="Date">
                <input className="form-input" type="date" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} style={{ width: 160, fontSize: 12 }} />
              </DraftField>
              <DraftField label="Status">
                <EditPillSelect field="session_status" value={draft.status} options={statusValues} colors={statusColors} onChange={st => setDraft(d => ({ ...d, status: st }))} onAddOption={addOption} allowAdd={isAdmin} />
              </DraftField>
              <DraftField label="Videos to Film">
                <input className="form-input" type="number" min={0} value={draft.videos_planned} onChange={e => setDraft(d => ({ ...d, videos_planned: Math.max(0, Number(e.target.value) || 0) }))} style={{ width: 90, fontSize: 12 }} />
              </DraftField>
              <DraftField label="Videos Filmed">
                <input className="form-input" type="number" min={0} value={draft.videos_filmed} onChange={e => setDraft(d => ({ ...d, videos_filmed: Math.max(0, Number(e.target.value) || 0) }))} style={{ width: 90, fontSize: 12 }} />
              </DraftField>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }} onClick={closeAdd}>Cancel</button>
              <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={createSession} disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {mgrOpen && (
        <PropertyManagerModal tableKey={TABLE_KEY} properties={properties} options={customOptions} onClose={() => setMgrOpen(false)} onReload={onReload} />
      )}
      {optsField && (
        <FieldOptionsManager field={optsField.field} title={optsField.title} options={dropdownOptions} onClose={() => setOptsField(null)} onReload={onReload} />
      )}
    </div>
  );
}

// Label + control row for the Add Session form, matching the detail panel layout.
function DraftField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'start' }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, paddingTop: 6 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}
