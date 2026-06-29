'use client';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioAdCreative, StudioComment, StudioActivity, StudioQuickLink, StudioDropdownOption, CustomProperty, CustomPropertyOption, Profile } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { usePagedRows } from '@/lib/use-paged-rows';
import LoadMore from './LoadMore';
import { AD_FORMATS, AD_STATUSES, AD_STATUS_COLORS, todayISO, logActivity, mergeOptions, inDateRange, getFieldOptions, colorMap, buildAddOptionRows } from '@/lib/studio';
import { EditPillSelect, MiniSelect, InlineDate, UrlCell } from './cells';
import ItemPanel, { FieldDef } from './ItemPanel';
import QuickLinks from './QuickLinks';
import { sortProps, groupOptions, applyCustomFilters, CustomHeaderCells, CustomRowCells, CustomFilterControls, PropertyManagerModal, AddPropertyButton } from './CustomColumns';
import FieldOptionsManager from './FieldOptionsManager';
import FilterField from './FilterField';

type SortKey = 'date_added' | 'angle';
const TABLE_KEY = 'ad';

// Statuses whose transition fires a Slack notification (see /api/ads-notify).
const ADS_NOTIFY_STATUSES = ['Ready to test', 'Revision Requested'];

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
  final_link: string;
  status: string;
}
const EMPTY_DRAFT: AdDraft = {
  creative_id: '',
  date_added: '',
  ad_format: '',
  angle: '',
  final_link: '',
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
  profiles: Profile[];
  isAdmin: boolean;
  onReload: () => void;
  showToast: (msg: string) => void;
}

export default function AdCreative({ adCreatives, comments, activity, quickLinks, dropdownOptions, properties, customOptions, profiles, isAdmin, onReload, showToast }: Props) {
  const [fStatus, setFStatus] = usePersistedState<string>('studio_ad_status', 'All');
  const [fFormat, setFFormat] = usePersistedState<string>('studio_ad_format', 'All');
  const [fAngle, setFAngle] = usePersistedState<string>('studio_ad_angle', 'All');
  const [sortKey, setSortKey] = usePersistedState<SortKey>('studio_ad_sortkey', 'date_added');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('studio_ad_sortdir', 'desc');
  const [dateFrom, setDateFrom] = usePersistedState<string>('studio_ad_from', '');
  const [dateTo, setDateTo] = usePersistedState<string>('studio_ad_to', '');
  const [custFilters, setCustFilters] = usePersistedState<Record<string, string>>('studio_ad_custfilters', {});
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mgrOpen, setMgrOpen] = useState(false);
  const [optsField, setOptsField] = useState<{ field: string; title: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<AdDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);

  const cprops = useMemo(() => sortProps(properties, TABLE_KEY), [properties]);
  const optsByProp = useMemo(() => groupOptions(customOptions), [customOptions]);

  const presentAngles = Array.from(new Set(adCreatives.map(a => a.angle).filter(Boolean) as string[]));
  const statusFieldOpts = getFieldOptions(dropdownOptions, 'ad_status', AD_STATUSES, AD_STATUS_COLORS);
  const statusValues = statusFieldOpts.map(o => o.value);
  const statusColors = colorMap(statusFieldOpts);
  const formatFieldOpts = getFieldOptions(dropdownOptions, 'ad_format', AD_FORMATS);
  const formatValues = formatFieldOpts.map(o => o.value);
  const formatColors = colorMap(formatFieldOpts);
  // Angle is an admin-managed select like Format/Status (editable options + colors
  // via FieldOptionsManager). Merge any angles already present in data so legacy
  // free-text values stay selectable even before they're saved as options.
  const angleFieldOpts = getFieldOptions(dropdownOptions, 'ad_angle', []);
  const angleColors = colorMap(angleFieldOpts);
  const angleOpts = mergeOptions(angleFieldOpts.map(o => o.value), presentAngles);

  async function addOption(field: string, value: string) {
    const fb = FIELD_FALLBACKS[field] ?? { values: [] };
    const rows = buildAddOptionRows(field, value, fb.values, fb.colors, dropdownOptions);
    if (rows.length) await supabase.from('studio_dropdown_options').insert(rows);
    onReload();
  }

  async function patch(id: string, p: Partial<StudioAdCreative>) {
    // Detect a transition INTO a notify status from the pre-update row BEFORE
    // writing. Doing it here (rather than only in changeStatus) means the Slack
    // notify fires no matter which handler set the status — the inline Status
    // pill or the detail panel — and never on a re-save while already in it.
    const prev = adCreatives.find(x => x.id === id);
    const becoming = p.status && ADS_NOTIFY_STATUSES.includes(p.status) && prev?.status !== p.status ? p.status : null;

    const { error } = await supabase.from('studio_ad_creatives').update(p).eq('id', id);
    if (error) {
      // Surface write failures instead of silently reverting on the next reload.
      console.error('[AdCreative] failed to update ad creative', { id, patch: p, error });
      alert(`Couldn't save change: ${error.message}`);
    }
    onReload();

    if (!error && becoming) {
      notifyStatus({
        status: becoming,
        name: prev?.creative_id ?? '',
        // Prefer a value included in this same patch, else the current row value.
        finalUrl: (p.final_link ?? prev?.final_link) ?? '',
      });
    }
  }

  async function changeStatus(a: StudioAdCreative, status: string) {
    if (status === a.status) return;
    await logActivity('ad', a.id, 'Status changed', a.status, status);
    // patch() detects the transition into a notify status and fires the Slack notify.
    await patch(a.id, { status });
  }

  // Fire-and-forget POST to the server route, which holds the Slack webhook URL
  // and skips silently if it's unset. Never blocks the UI or throws.
  function notifyStatus(payload: { status: string; name: string; finalUrl: string }) {
    fetch('/api/ads-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(err => console.warn('[AdCreative] /api/ads-notify call failed', err));
  }

  async function createAd() {
    if (creating) return;
    setCreating(true);
    const row = {
      creative_id: draft.creative_id.trim() || 'New Creative',
      date_added: draft.date_added || null,
      ad_format: draft.ad_format || null,
      angle: draft.angle.trim() || null,
      final_link: draft.final_link.trim() || null,
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

  // Fire-and-forget POST to the server route (holds the Slack webhook URL, skips
  // silently if unset). Never blocks the UI or throws.
  function notifyIterate(payload: { originalName: string; variationName: string }) {
    fetch('/api/ads-iterate-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(err => console.warn('[AdCreative] /api/ads-iterate-notify call failed', err));
  }

  // Iterate: spawn a new Draft variation of the clicked creative, copying its
  // format/angle (Final left blank), then ping the pipeline channel.
  async function handleIterate(a: StudioAdCreative) {
    const rawName = (a.creative_id || 'Untitled').trim();
    // Number variations off the ROOT name (strip any existing " — Variation N")
    // so iterating a variation doesn't nest names, and numbers never collide.
    const base = rawName.replace(/\s+—\s+Variation\s+\d+$/, '').trim() || rawName;
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^${escaped}\\s+—\\s+Variation\\s+(\\d+)$`);
    // The original implicitly counts as "1", so the first variation is N=2.
    let maxN = 1;
    for (const c of adCreatives) {
      const m = (c.creative_id || '').trim().match(re);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    }
    const variationName = `${base} — Variation ${maxN + 1}`;

    const row = {
      creative_id: variationName,
      date_added: todayISO(),
      ad_format: a.ad_format || null,
      angle: a.angle || null,
      final_link: null,        // start blank — this is a fresh draft to make
      status: 'Draft',
    };
    const { error } = await supabase.from('studio_ad_creatives').insert([row]);
    if (error) {
      console.error('[AdCreative] failed to create variation', { row, error });
      alert(`Couldn't create variation: ${error.message}`);
      return;
    }
    notifyIterate({ originalName: rawName, variationName });
    showToast(`Variation created: ${variationName}`);
    onReload();
  }

  const present = (vals: (string | undefined)[]) => ['All', ...Array.from(new Set(vals.filter(Boolean) as string[]))];
  const statusPresent = present(adCreatives.map(a => a.status));
  const formatPresent = present(adCreatives.map(a => a.ad_format));
  const anglePresent = present(adCreatives.map(a => a.angle));

  const filtered = useMemo(() => {
    let r = adCreatives;
    const q = search.trim().toLowerCase();
    if (q) r = r.filter(a => (a.creative_id || '').toLowerCase().includes(q));
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
  }, [adCreatives, search, fStatus, fFormat, fAngle, sortKey, sortDir, dateFrom, dateTo]);

  const rows = useMemo(() => applyCustomFilters(filtered, cprops, custFilters), [filtered, cprops, custFilters]);

  // "Load more" pagination — resets to the first page on filter/sort change only.
  const { visible, hasMore, remaining, loadMore } = usePagedRows(
    rows,
    [search, fStatus, fFormat, fAngle, sortKey, sortDir, dateFrom, dateTo, JSON.stringify(custFilters)].join('|'),
  );

  const fields: FieldDef[] = useMemo(() => [
    { key: 'creative_id', label: 'Creative ID', type: 'text', placeholder: 'Name / identifier' },
    { key: 'date_added', label: 'Date Added', type: 'date' },
    { key: 'ad_format', label: 'Format', type: 'pill', field: 'ad_format', options: formatValues, colors: formatColors, allowAdd: isAdmin, allowEmpty: true },
    { key: 'angle', label: 'Angle', type: 'pill', field: 'ad_angle', options: angleOpts, colors: angleColors, allowAdd: isAdmin, allowEmpty: true },
    { key: 'final_link', label: 'Final', type: 'url' },
    { key: 'status', label: 'Status', type: 'pill', field: 'ad_status', options: statusValues, colors: statusColors, allowAdd: isAdmin },
  ], [formatValues, formatColors, angleOpts, angleColors, statusValues, statusColors, isAdmin]);

  const selected = selectedId ? adCreatives.find(a => a.id === selectedId) : null;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <QuickLinks context="ad-creative" links={quickLinks} onReload={onReload} />

        {/* Top row: search (left) + add (right) — kept off the filter row so it never wraps. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <input
            className="form-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search Creative ID…"
            style={{ width: 240, padding: '5px 9px', fontSize: 11 }}
          />
          <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', marginLeft: 'auto' }} onClick={() => { setDraft({ ...EMPTY_DRAFT, date_added: todayISO() }); setAddOpen(true); }}>+ Add Ad Creative</button>
        </div>

        {/* Filter / sort row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          {/* Labeled filters */}
          <FilterField label="Format"><MiniSelect value={fFormat} options={formatPresent} onChange={setFFormat} /></FilterField>
          <FilterField label="Angle"><MiniSelect value={fAngle} options={anglePresent} onChange={setFAngle} /></FilterField>
          <FilterField label="Status"><MiniSelect value={fStatus} options={statusPresent} onChange={setFStatus} /></FilterField>

          {/* Sort by + direction */}
          <FilterField label="Sort">
            <select className="form-input" style={{ width: 'auto', padding: '4px 7px', fontSize: 11 }} value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
              <option value="date_added">Date Added</option>
              <option value="angle">Angle</option>
            </select>
            <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))} title="Toggle sort direction">
              {sortDir === 'asc' ? '↑ Ascending' : '↓ Descending'}
            </button>
          </FilterField>

          {/* Date range (kept) */}
          <FilterField label="From"><input className="form-input" type="date" style={{ width: 130, padding: '4px 7px', fontSize: 11 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></FilterField>
          <FilterField label="To"><input className="form-input" type="date" style={{ width: 130, padding: '4px 7px', fontSize: 11 }} value={dateTo} onChange={e => setDateTo(e.target.value)} /></FilterField>
          {(dateFrom || dateTo) && <button className="btn-ghost" style={{ fontSize: 10, padding: '4px 8px' }} onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear dates</button>}

          <CustomFilterControls props={cprops} optionsByProp={optsByProp} filters={custFilters} setFilters={setCustFilters} />
        </div>

        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>No ad creatives yet. Add one, or set a video&apos;s status to &quot;Ad Variation Needed&quot;.</div>
        ) : (
          <>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>Creative ID</th>
                  <th>Date Added</th>
                  <th onClick={isAdmin ? () => setOptsField({ field: 'ad_format', title: 'Format' }) : undefined} style={{ cursor: isAdmin ? 'pointer' : undefined, userSelect: 'none' }}>Format{isAdmin && <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>✎</span>}</th>
                  <th onClick={isAdmin ? () => setOptsField({ field: 'ad_angle', title: 'Angle' }) : undefined} style={{ cursor: isAdmin ? 'pointer' : undefined, userSelect: 'none' }}>Angle{isAdmin && <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>✎</span>}</th>
                  <th>Final</th>
                  <th>Iterate</th>
                  <th onClick={isAdmin ? () => setOptsField({ field: 'ad_status', title: 'Status' }) : undefined} style={{ cursor: isAdmin ? 'pointer' : undefined, userSelect: 'none' }}>Status{isAdmin && <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>✎</span>}</th>
                  <CustomHeaderCells props={cprops} isAdmin={isAdmin} onManage={() => setMgrOpen(true)} />
                  <th style={{ textAlign: 'right' }}>{isAdmin && <AddPropertyButton onClick={() => setMgrOpen(true)} />}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(a => (
                  <Fragment key={a.id}>
                    <tr style={selectedId === a.id ? { background: 'var(--surface-2)' } : undefined}>
                      <td style={{ minWidth: 160 }}>
                        <button onClick={() => setSelectedId(a.id)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 12, textAlign: 'left', padding: '4px 0', fontFamily: 'inherit', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="Open details">{a.creative_id || 'Untitled'}</button>
                      </td>
                      <td><InlineDate value={a.date_added} onCommit={d => patch(a.id, { date_added: d || undefined })} /></td>
                      <td><EditPillSelect field="ad_format" value={a.ad_format || ''} options={formatValues} colors={formatColors} onChange={f => patch(a.id, { ad_format: f })} onAddOption={addOption} allowAdd={isAdmin} allowEmpty /></td>
                      <td><EditPillSelect field="ad_angle" value={a.angle || ''} options={angleOpts} colors={angleColors} onChange={x => patch(a.id, { angle: x })} onAddOption={addOption} allowAdd={isAdmin} allowEmpty /></td>
                      <td><UrlCell value={a.final_link} onCommit={u => patch(a.id, { final_link: u })} /></td>
                      <td>
                        <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--accent)' }} onClick={() => handleIterate(a)} title="Trigger iteration">↻ Iterate</button>
                      </td>
                      <td><EditPillSelect field="ad_status" value={a.status} options={statusValues} colors={statusColors} onChange={s => changeStatus(a, s)} onAddOption={addOption} allowAdd={isAdmin} /></td>
                      <CustomRowCells row={a} props={cprops} optionsByProp={optsByProp} onPatch={patch} />
                      <td><button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteAd(a.id)}>✕</button></td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && <LoadMore remaining={remaining} onClick={loadMore} />}
          </>
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
                <EditPillSelect field="ad_angle" value={draft.angle} options={angleOpts} colors={angleColors} onChange={x => setDraft(d => ({ ...d, angle: x }))} onAddOption={addOption} allowAdd={isAdmin} allowEmpty />
              </DraftField>
              <DraftField label="Final">
                <input className="form-input" value={draft.final_link} onChange={e => setDraft(d => ({ ...d, final_link: e.target.value }))} placeholder="https://…" style={{ width: '100%', fontSize: 12 }} />
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
