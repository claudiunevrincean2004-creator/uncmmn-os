'use client';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioAdCreative, StudioComment, StudioActivity, StudioQuickLink, StudioDropdownOption, CustomProperty, CustomPropertyOption } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { AD_FORMATS, AD_STATUSES, AD_STATUS_COLORS, todayISO, logActivity, mergeOptions, inDateRange, getFieldOptions, colorMap, buildAddOptionRows } from '@/lib/studio';
import { EditPillSelect, EditSelect, MiniSelect, InlineText, InlineDate, UrlCell } from './cells';
import ItemPanel, { FieldDef } from './ItemPanel';
import QuickLinks from './QuickLinks';
import { sortProps, groupOptions, applyCustomFilters, CustomHeaderCells, CustomRowCells, CustomFilterControls, PropertyManagerModal } from './CustomColumns';
import FieldOptionsManager from './FieldOptionsManager';

type SortKey = 'date_added' | 'angle';
const TABLE_KEY = 'ad';

// In-code fallback options per built-in select field, so adding an option can
// backfill them as rows instead of dropping them (see buildAddOptionRows).
// ad_angle has no built-in defaults (its options are entirely user-defined).
const FIELD_FALLBACKS: Record<string, { values: string[]; colors?: Record<string, string> }> = {
  ad_status: { values: AD_STATUSES, colors: AD_STATUS_COLORS },
  ad_format: { values: AD_FORMATS },
  ad_angle: { values: [] },
};

// Draft for the "Add Ad Creative" form. The row is only written to the database
// when the user clicks Create; closing/cancelling resets back to this. date_added
// is seeded with today when the form opens (see the add button handler).
interface AdDraft {
  creative_id: string;
  date_added: string;
  ad_format: string;
  angle: string;
  hook: string;
  final_link: string;
  buyer_feedback: string;
  status: string;
}
const EMPTY_DRAFT: AdDraft = {
  creative_id: '',
  date_added: '',
  ad_format: '',
  angle: '',
  hook: '',
  final_link: '',
  buyer_feedback: '',
  status: 'Paused',
};

interface Props {
  adCreatives: StudioAdCreative[];
  comments: StudioComment[];
  activity: StudioActivity[];
  quickLinks: StudioQuickLink[];
  dropdownOptions: StudioDropdownOption[];
  properties: CustomProperty[];
  customOptions: CustomPropertyOption[];
  isAdmin: boolean;
  onReload: () => void;
  showToast: (msg: string) => void;
}

export default function AdCreative({ adCreatives, comments, activity, quickLinks, dropdownOptions, properties, customOptions, isAdmin, onReload, showToast }: Props) {
  const [fStatus, setFStatus] = usePersistedState<string>('studio_ad_status', 'All');
  const [fFormat, setFFormat] = usePersistedState<string>('studio_ad_format', 'All');
  const [fAngle, setFAngle] = usePersistedState<string>('studio_ad_angle', 'All');
  const [sortKey, setSortKey] = usePersistedState<SortKey>('studio_ad_sortkey', 'date_added');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('studio_ad_sortdir', 'desc');
  const [dateFrom, setDateFrom] = usePersistedState<string>('studio_ad_from', '');
  const [dateTo, setDateTo] = usePersistedState<string>('studio_ad_to', '');
  const [custFilters, setCustFilters] = usePersistedState<Record<string, string>>('studio_ad_custfilters', {});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mgrOpen, setMgrOpen] = useState(false);
  const [optsField, setOptsField] = useState<{ field: string; title: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<AdDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);

  const cprops = useMemo(() => sortProps(properties, TABLE_KEY), [properties]);
  const optsByProp = useMemo(() => groupOptions(customOptions), [customOptions]);

  const custom = (field: string) => dropdownOptions.filter(o => o.field === field).map(o => o.value);
  const presentAngles = Array.from(new Set(adCreatives.map(a => a.angle).filter(Boolean) as string[]));
  const statusFieldOpts = getFieldOptions(dropdownOptions, 'ad_status', AD_STATUSES, AD_STATUS_COLORS);
  const statusValues = statusFieldOpts.map(o => o.value);
  const statusColors = colorMap(statusFieldOpts);
  const formatFieldOpts = getFieldOptions(dropdownOptions, 'ad_format', AD_FORMATS);
  const formatValues = formatFieldOpts.map(o => o.value);
  const formatColors = colorMap(formatFieldOpts);
  const angleOpts = mergeOptions(custom('ad_angle'), presentAngles);

  async function addOption(field: string, value: string) {
    const fb = FIELD_FALLBACKS[field] ?? { values: [] };
    const rows = buildAddOptionRows(field, value, fb.values, fb.colors, dropdownOptions);
    if (rows.length) await supabase.from('studio_dropdown_options').insert(rows);
    onReload();
  }

  async function patch(id: string, p: Partial<StudioAdCreative>) {
    await supabase.from('studio_ad_creatives').update(p).eq('id', id);
    onReload();
  }

  async function changeStatus(a: StudioAdCreative, status: string) {
    if (status === a.status) return;
    await logActivity('ad', a.id, 'Status changed', a.status, status);
    await patch(a.id, { status });
  }

  async function createAd() {
    if (creating) return;
    setCreating(true);
    const row = {
      creative_id: draft.creative_id.trim() || 'New Creative',
      date_added: draft.date_added || null,
      ad_format: draft.ad_format || null,
      angle: draft.angle.trim() || null,
      hook: draft.hook.trim() || null,
      final_link: draft.final_link.trim() || null,
      buyer_feedback: draft.buyer_feedback.trim() || null,
      status: draft.status || 'Paused',
    };
    const { error } = await supabase.from('studio_ad_creatives').insert([row]);
    setCreating(false);
    if (error) {
      console.error('[AdCreative] failed to create ad creative', { row, error });
      alert(`Couldn't create ad creative: ${error.message}`);
      return;
    }
    closeAdd();
    onReload();
  }

  function closeAdd() {
    setAddOpen(false);
    setDraft(EMPTY_DRAFT);
  }

  async function deleteAd(id: string) {
    if (!confirm('Delete this ad creative?')) return;
    await supabase.from('studio_ad_creatives').delete().eq('id', id);
    if (selectedId === id) setSelectedId(null);
    onReload();
  }

  // ACTION TRIGGER: wire up iteration automation here
  function handleIterate(a: StudioAdCreative) {
    const name = a.creative_id || 'Untitled';
    // eslint-disable-next-line no-console
    console.log('[studio] iterate triggered for ad creative', a.id, name);
    showToast(`Iteration triggered for ${name}`);
  }

  const present = (vals: (string | undefined)[]) => ['All', ...Array.from(new Set(vals.filter(Boolean) as string[]))];
  const statusPresent = present(adCreatives.map(a => a.status));
  const formatPresent = present(adCreatives.map(a => a.ad_format));
  const anglePresent = present(adCreatives.map(a => a.angle));

  const filtered = useMemo(() => {
    let r = adCreatives;
    if (fStatus !== 'All') r = r.filter(a => a.status === fStatus);
    if (fFormat !== 'All') r = r.filter(a => (a.ad_format || '') === fFormat);
    if (fAngle !== 'All') r = r.filter(a => (a.angle || '') === fAngle);
    if (dateFrom || dateTo) r = r.filter(a => inDateRange(a.date_added, dateFrom, dateTo));
    return [...r].sort((a, b) => {
      let av = '';
      let bv = '';
      if (sortKey === 'angle') { av = a.angle || ''; bv = b.angle || ''; }
      else { av = a.date_added ? a.date_added.slice(0, 10) : ''; bv = b.date_added ? b.date_added.slice(0, 10) : ''; }
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [adCreatives, fStatus, fFormat, fAngle, sortKey, sortDir, dateFrom, dateTo]);

  const rows = useMemo(() => applyCustomFilters(filtered, cprops, custFilters), [filtered, cprops, custFilters]);

  const fields: FieldDef[] = useMemo(() => [
    { key: 'creative_id', label: 'Creative ID', type: 'text', placeholder: 'Name / identifier' },
    { key: 'date_added', label: 'Date Added', type: 'date' },
    { key: 'ad_format', label: 'Format', type: 'pill', field: 'ad_format', options: formatValues, colors: formatColors, allowAdd: isAdmin, allowEmpty: true },
    { key: 'angle', label: 'Angle', type: 'select', field: 'ad_angle', options: angleOpts, allowAdd: isAdmin },
    { key: 'hook', label: 'Hook', type: 'text', placeholder: 'Hook' },
    { key: 'final_link', label: 'Final', type: 'url' },
    { key: 'buyer_feedback', label: 'Buyer Feedback', type: 'textarea', placeholder: 'Buyer feedback…' },
    { key: 'status', label: 'Status', type: 'pill', field: 'ad_status', options: statusValues, colors: statusColors, allowAdd: isAdmin },
  ], [formatValues, formatColors, angleOpts, statusValues, statusColors, isAdmin]);

  const selected = selectedId ? adCreatives.find(a => a.id === selectedId) : null;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <QuickLinks context="ad-creative" links={quickLinks} onReload={onReload} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <MiniSelect value={fStatus} options={statusPresent} onChange={setFStatus} />
          <MiniSelect value={fFormat} options={formatPresent} onChange={setFFormat} />
          <MiniSelect value={fAngle} options={anglePresent} onChange={setFAngle} />
          <select className="form-input" style={{ width: 'auto', padding: '4px 7px', fontSize: 11 }} value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
            <option value="date_added">Sort: Date Added</option>
            <option value="angle">Sort: Angle</option>
          </select>
          <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))} title="Sort direction">
            {sortDir === 'asc' ? '↑ asc' : '↓ desc'}
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>From</span>
          <input className="form-input" type="date" style={{ width: 130, padding: '4px 7px', fontSize: 11 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>To</span>
          <input className="form-input" type="date" style={{ width: 130, padding: '4px 7px', fontSize: 11 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && <button className="btn-ghost" style={{ fontSize: 10, padding: '4px 8px' }} onClick={() => { setDateFrom(''); setDateTo(''); }}>clear</button>}
          <CustomFilterControls props={cprops} optionsByProp={optsByProp} filters={custFilters} setFilters={setCustFilters} />
          {isAdmin && <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setMgrOpen(true)}>+ Add property</button>}
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{rows.length} {rows.length === 1 ? 'creative' : 'creatives'}</span>
          <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', marginLeft: 'auto' }} onClick={() => { setDraft({ ...EMPTY_DRAFT, date_added: todayISO() }); setAddOpen(true); }}>+ Add Ad Creative</button>
        </div>

        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>No ad creatives yet. Add one, or set a video&apos;s status to &quot;Ad Variation Needed&quot;.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>Creative ID</th>
                  <th>Date Added</th>
                  <th onClick={isAdmin ? () => setOptsField({ field: 'ad_format', title: 'Format' }) : undefined} style={{ cursor: isAdmin ? 'pointer' : undefined, userSelect: 'none' }}>Format{isAdmin && <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>✎</span>}</th>
                  <th>Angle</th>
                  <th>Hook</th>
                  <th>Final</th>
                  <th>Buyer Feedback</th>
                  <th>Iterate</th>
                  <th onClick={isAdmin ? () => setOptsField({ field: 'ad_status', title: 'Status' }) : undefined} style={{ cursor: isAdmin ? 'pointer' : undefined, userSelect: 'none' }}>Status{isAdmin && <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>✎</span>}</th>
                  <CustomHeaderCells props={cprops} isAdmin={isAdmin} onManage={() => setMgrOpen(true)} />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(a => (
                  <Fragment key={a.id}>
                    <tr style={selectedId === a.id ? { background: 'var(--surface-2)' } : undefined}>
                      <td style={{ minWidth: 160 }}>
                        <button onClick={() => setSelectedId(a.id)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 12, textAlign: 'left', padding: '4px 0', fontFamily: 'inherit', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="Open details">{a.creative_id || 'Untitled'}</button>
                      </td>
                      <td><InlineDate value={a.date_added} onCommit={d => patch(a.id, { date_added: d || undefined })} /></td>
                      <td><EditPillSelect field="ad_format" value={a.ad_format || ''} options={formatValues} colors={formatColors} onChange={f => patch(a.id, { ad_format: f })} onAddOption={addOption} allowAdd={isAdmin} allowEmpty /></td>
                      <td><EditSelect field="ad_angle" value={a.angle} options={angleOpts} onChange={x => patch(a.id, { angle: x })} onAddOption={addOption} placeholder="—" allowAdd={isAdmin} /></td>
                      <td><InlineText value={a.hook} onCommit={t => patch(a.id, { hook: t })} placeholder="—" style={{ width: 110 }} /></td>
                      <td><UrlCell value={a.final_link} onCommit={u => patch(a.id, { final_link: u })} /></td>
                      <td>
                        <button onClick={() => setExpanded(e => (e === a.id ? null : a.id))} className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px', color: a.buyer_feedback ? 'var(--accent)' : 'var(--text-faint)' }} title="Expand feedback">
                          {a.buyer_feedback ? '📝' : '+'} {expanded === a.id ? '▲' : '▾'}
                        </button>
                      </td>
                      <td>
                        <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--accent)' }} onClick={() => handleIterate(a)} title="Trigger iteration">↻ Iterate</button>
                      </td>
                      <td><EditPillSelect field="ad_status" value={a.status} options={statusValues} colors={statusColors} onChange={s => changeStatus(a, s)} onAddOption={addOption} allowAdd={isAdmin} /></td>
                      <CustomRowCells row={a} props={cprops} optionsByProp={optsByProp} onPatch={patch} />
                      <td><button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteAd(a.id)}>✕</button></td>
                    </tr>
                    {expanded === a.id && (
                      <tr>
                        <td colSpan={10 + cprops.length} style={{ background: 'var(--surface-2)' }}>
                          <div style={{ padding: '4px 2px' }}>
                            <div className="form-label" style={{ marginBottom: 4 }}>Buyer Feedback</div>
                            <InlineText value={a.buyer_feedback} onCommit={t => patch(a.id, { buyer_feedback: t })} placeholder="Buyer feedback…" multiline style={{ width: '100%' }} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <ItemPanel
          itemType="ad"
          itemId={selected.id}
          title={selected.creative_id || 'Ad Creative'}
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

      {addOpen && (
        <div className="modal-overlay" onClick={closeAdd}>
          <div className="modal-box" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>New Ad Creative</div>
              <button onClick={closeAdd} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <DraftField label="Creative ID">
                <input className="form-input" value={draft.creative_id} onChange={e => setDraft(d => ({ ...d, creative_id: e.target.value }))} placeholder="Name / identifier" style={{ width: '100%', fontSize: 12 }} />
              </DraftField>
              <DraftField label="Date Added">
                <input className="form-input" type="date" value={draft.date_added} onChange={e => setDraft(d => ({ ...d, date_added: e.target.value }))} style={{ width: 160, fontSize: 12 }} />
              </DraftField>
              <DraftField label="Format">
                <EditPillSelect field="ad_format" value={draft.ad_format} options={formatValues} colors={formatColors} onChange={f => setDraft(d => ({ ...d, ad_format: f }))} onAddOption={addOption} allowAdd={isAdmin} allowEmpty />
              </DraftField>
              <DraftField label="Angle">
                <EditSelect field="ad_angle" value={draft.angle} options={angleOpts} onChange={x => setDraft(d => ({ ...d, angle: x }))} onAddOption={addOption} placeholder="—" allowAdd={isAdmin} />
              </DraftField>
              <DraftField label="Hook">
                <input className="form-input" value={draft.hook} onChange={e => setDraft(d => ({ ...d, hook: e.target.value }))} placeholder="Hook" style={{ width: '100%', fontSize: 12 }} />
              </DraftField>
              <DraftField label="Final">
                <input className="form-input" value={draft.final_link} onChange={e => setDraft(d => ({ ...d, final_link: e.target.value }))} placeholder="https://…" style={{ width: '100%', fontSize: 12 }} />
              </DraftField>
              <DraftField label="Buyer Feedback">
                <textarea className="form-input" value={draft.buyer_feedback} onChange={e => setDraft(d => ({ ...d, buyer_feedback: e.target.value }))} placeholder="Buyer feedback…" rows={2} style={{ resize: 'vertical', fontSize: 12, lineHeight: 1.4, width: '100%' }} />
              </DraftField>
              <DraftField label="Status">
                <EditPillSelect field="ad_status" value={draft.status} options={statusValues} colors={statusColors} onChange={s => setDraft(d => ({ ...d, status: s }))} onAddOption={addOption} allowAdd={isAdmin} />
              </DraftField>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }} onClick={closeAdd}>Cancel</button>
              <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={createAd} disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
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

// Label + control row for the Add Ad Creative form, matching the detail panel layout.
function DraftField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'start' }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, paddingTop: 6 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}
