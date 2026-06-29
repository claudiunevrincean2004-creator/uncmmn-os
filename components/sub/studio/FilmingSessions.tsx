'use client';
import { Fragment, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioSession, StudioComment, StudioActivity, StudioDropdownOption, CustomProperty, CustomPropertyOption } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { SESSION_STATUSES, SESSION_STATUS_COLORS, SESSION_TYPES, SESSION_TYPE_COLORS, todayISO, logActivity, inDateRange, getFieldOptions, colorMap } from '@/lib/studio';
import { InlineText, EditPillSelect, MiniSelect, UrlCell, InlineDate, InlineNumber } from './cells';
import ItemPanel, { FieldDef } from './ItemPanel';
import { sortProps, groupOptions, applyCustomFilters, CustomHeaderCells, CustomRowCells, CustomFilterControls, PropertyManagerModal } from './CustomColumns';
import FieldOptionsManager from './FieldOptionsManager';

const TABLE_KEY = 'session';

interface Props {
  sessions: StudioSession[];
  comments: StudioComment[];
  activity: StudioActivity[];
  dropdownOptions: StudioDropdownOption[];
  properties: CustomProperty[];
  customOptions: CustomPropertyOption[];
  isAdmin: boolean;
  onReload: () => void;
}

export default function FilmingSessions({ sessions, comments, activity, dropdownOptions, properties, customOptions, isAdmin, onReload }: Props) {
  const [fStatus, setFStatus] = usePersistedState<string>('studio_f_status', 'All');
  const [fType, setFType] = usePersistedState<string>('studio_f_type', 'All');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('studio_f_sortdir', 'asc');
  const [dateFrom, setDateFrom] = usePersistedState<string>('studio_f_from', '');
  const [dateTo, setDateTo] = usePersistedState<string>('studio_f_to', '');
  const [custFilters, setCustFilters] = usePersistedState<Record<string, string>>('studio_f_custfilters', {});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mgrOpen, setMgrOpen] = useState(false);
  const [optsField, setOptsField] = useState<{ field: string; title: string } | null>(null);

  const cprops = useMemo(() => sortProps(properties, TABLE_KEY), [properties]);
  const optsByProp = useMemo(() => groupOptions(customOptions), [customOptions]);

  const statusFieldOpts = getFieldOptions(dropdownOptions, 'session_status', SESSION_STATUSES, SESSION_STATUS_COLORS);
  const statusValues = statusFieldOpts.map(o => o.value);
  const statusColors = colorMap(statusFieldOpts);

  const typeFieldOpts = getFieldOptions(dropdownOptions, 'session_type', SESSION_TYPES, SESSION_TYPE_COLORS);
  const typeValues = typeFieldOpts.map(o => o.value);
  const typeColors = colorMap(typeFieldOpts);

  async function addOption(field: string, value: string) {
    if (!dropdownOptions.some(o => o.field === field && o.value.toLowerCase() === value.toLowerCase())) {
      await supabase.from('studio_dropdown_options').insert([{ field, value }]);
    }
    onReload();
  }

  async function patch(id: string, p: Partial<StudioSession>) {
    await supabase.from('studio_sessions').update(p).eq('id', id);
    onReload();
  }

  async function changeStatus(s: StudioSession, status: string) {
    if (status === s.status) return;
    await logActivity('session', s.id, 'Status changed', s.status, status);
    await patch(s.id, { status });
  }

  async function addSession() {
    await supabase.from('studio_sessions').insert([{ name: 'Untitled Session', type: 'Scripted', status: 'Planned', videos_planned: 0, videos_filmed: 0 }]);
    onReload();
  }

  async function deleteSession(id: string) {
    if (!confirm('Delete this session?')) return;
    await supabase.from('studio_sessions').delete().eq('id', id);
    if (selectedId === id) setSelectedId(null);
    onReload();
  }

  const today = todayISO();
  const present = (vals: (string | undefined)[]) => ['All', ...Array.from(new Set(vals.filter(Boolean) as string[]))];
  const statusPresent = present(sessions.map(s => s.status));

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

  const fields: FieldDef[] = useMemo(() => [
    { key: 'name', label: 'Session / Desc', type: 'textarea', placeholder: 'Session name / description' },
    { key: 'type', label: 'Type', type: 'pill', field: 'session_type', options: typeValues, colors: typeColors, allowAdd: false },
    { key: 'script_url', label: 'Link to Script', type: 'url' },
    { key: 'footage_link', label: 'Footage', type: 'url' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'status', label: 'Status', type: 'pill', field: 'session_status', options: statusValues, colors: statusColors, allowAdd: false },
    { key: 'videos_planned', label: 'Videos to Film', type: 'number' },
    { key: 'videos_filmed', label: 'Videos Filmed', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Add notes…' },
  ], [statusValues, statusColors, typeValues, typeColors]);

  const selected = selectedId ? sessions.find(s => s.id === selectedId) : null;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <MiniSelect value={fStatus} options={statusPresent} onChange={setFStatus} />
          <MiniSelect value={fType} options={['All', ...typeValues]} onChange={setFType} />
          <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))} title="Sort by date">
            Date {sortDir === 'asc' ? '↑ oldest' : '↓ newest'}
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>From</span>
          <input className="form-input" type="date" style={{ width: 130, padding: '4px 7px', fontSize: 11 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>To</span>
          <input className="form-input" type="date" style={{ width: 130, padding: '4px 7px', fontSize: 11 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && <button className="btn-ghost" style={{ fontSize: 10, padding: '4px 8px' }} onClick={() => { setDateFrom(''); setDateTo(''); }}>clear</button>}
          <CustomFilterControls props={cprops} optionsByProp={optsByProp} filters={custFilters} setFilters={setCustFilters} />
          {isAdmin && <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setMgrOpen(true)}>+ Add property</button>}
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{rows.length} {rows.length === 1 ? 'session' : 'sessions'}</span>
          <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', marginLeft: 'auto' }} onClick={addSession}>+ Add Session</button>
        </div>

        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>No sessions match. Add a session or adjust filters.</div>
        ) : (
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
                  <th>Notes</th>
                  <CustomHeaderCells props={cprops} isAdmin={isAdmin} onManage={() => setMgrOpen(true)} />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(s => {
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
                        <td><EditPillSelect field="session_type" value={s.type || ''} options={typeValues} colors={typeColors} onChange={t => patch(s.id, { type: t })} allowAdd={false} /></td>
                        <td><UrlCell value={s.script_url} onCommit={u => patch(s.id, { script_url: u })} /></td>
                        <td><UrlCell value={s.footage_link} onCommit={u => patch(s.id, { footage_link: u })} /></td>
                        <td><InlineDate value={s.date} onCommit={d => patch(s.id, { date: d || undefined })} /></td>
                        <td><EditPillSelect field="session_status" value={s.status} options={statusValues} colors={statusColors} onChange={st => changeStatus(s, st)} allowAdd={false} /></td>
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
                        <td>
                          <button onClick={() => setExpanded(e => (e === s.id ? null : s.id))} className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px', color: s.notes ? 'var(--accent)' : 'var(--text-faint)' }} title="Expand notes">
                            {s.notes ? '📝' : '+'} {expanded === s.id ? '▲' : '▾'}
                          </button>
                        </td>
                        <CustomRowCells row={s} props={cprops} optionsByProp={optsByProp} onPatch={patch} />
                        <td><button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteSession(s.id)}>✕</button></td>
                      </tr>
                      {expanded === s.id && (
                        <tr>
                          <td colSpan={11 + cprops.length} style={{ background: 'var(--surface-2)' }}>
                            <div style={{ padding: '4px 2px' }}>
                              <div className="form-label" style={{ marginBottom: 4 }}>Notes</div>
                              <InlineText value={s.notes} onCommit={n => patch(s.id, { notes: n })} placeholder="Add notes…" multiline style={{ width: '100%' }} />
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
          itemType="session"
          itemId={selected.id}
          title={selected.name}
          fields={fields}
          values={selected}
          onChangeField={(key, value) => { if (key === 'status') changeStatus(selected, value); else patch(selected.id, { [key]: value }); }}
          onAddOption={addOption}
          comments={comments}
          activity={activity}
          onReload={onReload}
          onClose={() => setSelectedId(null)}
        />
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
