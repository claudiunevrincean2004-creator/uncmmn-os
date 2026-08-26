'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioAdCreative, StudioComment, StudioActivity, StudioQuickLink, StudioDropdownOption, CustomProperty, CustomPropertyOption, Profile } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { usePagedRows } from '@/lib/use-paged-rows';
import LoadMore from './LoadMore';
import { AD_FORMATS, AD_STATUSES, AD_STATUS_COLORS, todayISO, logActivity, inDateRange, getFieldOptions, colorMap, buildAddOptionRows } from '@/lib/studio';
import { EditPillSelect, MiniSelect, InlineDate, UrlCell, openDatePicker } from './cells';
import TableToolbar, { rowAccent, openOnRowClick, TitleCell } from './table-ui';
import ItemPanel, { FieldDef } from './ItemPanel';
import QuickLinks from './QuickLinks';
import { UserPicker, buildPipelineMentions, resolveAssignee } from './UserPicker';
import SortControl from './SortControl';
import { SortOption, SortDir, sortRows } from '@/lib/sort';
import { sortProps, groupOptions, applyCustomFilters, CustomHeaderCells, CustomRowCells, CustomFilterControls, PropertyManagerModal, AddPropertyButton } from './CustomColumns';
import FieldOptionsManager from './FieldOptionsManager';
import FilterField from './FilterField';
import DateRangePicker from './DateRangePicker';
import CopyLinkButton from '@/components/CopyLinkButton';
import { itemUrl } from '@/lib/item-link';

const TABLE_KEY = 'ad';

// Status transitions whose entry fires a Slack ping to #ad-creative-pipeline (see
// /api/ads-notify). Editing / Testing / Winner / Killed are intentionally silent.
const PIPELINE_NOTIFY_STATUSES = ['Ad Creative Needed', 'Ready for Review', 'Revisions Needed', 'Ready to Test'];

// In-code fallback options per built-in select field, so adding an option can
// backfill them as rows instead of dropping them (see buildAddOptionRows).
const FIELD_FALLBACKS: Record<string, { values: string[]; colors?: Record<string, string> }> = {
  ad_status: { values: AD_STATUSES, colors: AD_STATUS_COLORS },
  ad_format: { values: AD_FORMATS },
};

// Draft for the "Add Ad Creative" form. The row is only written to the database
// when the user clicks Create; closing/cancelling resets back to this. date_added
// is seeded with today when the form opens (see the add button handler).
interface AdDraft {
  creative_id: string;
  date_added: string;
  ad_format: string;
  final_link: string;
  assigned_to_user_id: string;
  status: string;
}
const EMPTY_DRAFT: AdDraft = {
  creative_id: '',
  date_added: '',
  ad_format: '',
  final_link: '',
  assigned_to_user_id: '',
  status: 'Ad Creative Needed',
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
  openItemId?: string;
  onOpened?: () => void;
  onReload: () => void;
  showToast: (msg: string) => void;
}

export default function AdCreative({ adCreatives, comments, activity, quickLinks, dropdownOptions, properties, customOptions, profiles, isAdmin, openItemId, onOpened, onReload, showToast }: Props) {
  const [fStatus, setFStatus] = usePersistedState<string>('studio_ad_status', 'All');
  const [fFormat, setFFormat] = usePersistedState<string>('studio_ad_format', 'All');
  const [sortKey, setSortKey] = usePersistedState<string>('studio_ad_sortkey', 'date_added');
  const [sortDir, setSortDir] = usePersistedState<SortDir>('studio_ad_sortdir', 'desc');
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

  // Open a row's panel when arriving via a deep link (Slack "Open in UNCMMN OS").
  useEffect(() => { if (openItemId) { setSelectedId(openItemId); onOpened?.(); } }, [openItemId, onOpened]);

  const cprops = useMemo(() => sortProps(properties, TABLE_KEY), [properties]);
  const optsByProp = useMemo(() => groupOptions(customOptions), [customOptions]);

  const statusFieldOpts = getFieldOptions(dropdownOptions, 'ad_status', AD_STATUSES, AD_STATUS_COLORS);
  const statusValues = statusFieldOpts.map(o => o.value);
  const statusColors = colorMap(statusFieldOpts);
  const formatFieldOpts = getFieldOptions(dropdownOptions, 'ad_format', AD_FORMATS);
  const formatValues = formatFieldOpts.map(o => o.value);
  const formatColors = colorMap(formatFieldOpts);

  async function addOption(field: string, value: string) {
    const fb = FIELD_FALLBACKS[field] ?? { values: [] };
    const rows = buildAddOptionRows(field, value, fb.values, fb.colors, dropdownOptions);
    if (rows.length) await supabase.from('studio_dropdown_options').insert(rows);
    onReload();
  }

  async function patch(id: string, p: Partial<StudioAdCreative>) {
    // Detect a transition INTO a notify status from the pre-update row BEFORE
    // writing. Doing it here (rather than only in changeStatus) means the Slack
    // ping fires no matter which handler set the status — the inline Status pill
    // or the detail panel — and never on a re-save while already in it.
    const prev = adCreatives.find(x => x.id === id);
    const becoming = p.status && PIPELINE_NOTIFY_STATUSES.includes(p.status) && prev?.status !== p.status ? p.status : null;

    const { error } = await supabase.from('studio_ad_creatives').update(p).eq('id', id);
    if (error) {
      // Surface write failures instead of silently reverting on the next reload.
      console.error('[AdCreative] failed to update ad creative', { id, patch: p, error });
      alert(`Couldn't save change: ${error.message}`);
    }
    onReload();

    if (!error && becoming) {
      // Prefer a value included in this same patch, else the current row value.
      notifyAdPipeline({
        status: becoming,
        creativeId: prev?.creative_id ?? '',
        itemUrl: itemUrl('ad', id),
        sourceLink: (p.source_video_url ?? prev?.source_video_url) ?? '',
        finalLink: (p.final_link ?? prev?.final_link) ?? '',
        ...buildPipelineMentions((p.assigned_to_user_id ?? prev?.assigned_to_user_id) ?? null, profiles),
      });
    }
  }

  async function changeStatus(a: StudioAdCreative, status: string) {
    if (status === a.status) return;
    await logActivity('ad', a.id, 'Status changed', a.status, status);
    // patch() detects the transition into a notify status and fires the Slack ping.
    await patch(a.id, { status });
  }

  // Fire-and-forget POST to the #ad-creative-pipeline notify route, which holds
  // the Slack webhook URL. @-mentions are resolved here from user profiles
  // (slack_user_id) and passed in pre-built. Skips silently if the webhook is
  // unset. Never blocks the UI or throws.
  function notifyAdPipeline(payload: { status: string; creativeId: string; itemUrl: string; sourceLink: string; finalLink: string; editorMention: string }) {
    fetch('/api/ads-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(err => console.warn('[AdCreative] /api/ads-notify call failed', err));
  }

  async function createAd() {
    if (creating) return;
    setCreating(true);
    const status = draft.status || 'Ad Creative Needed';
    const row = {
      creative_id: draft.creative_id.trim() || 'New Creative',
      date_added: draft.date_added || null,
      ad_format: draft.ad_format || null,
      final_link: draft.final_link.trim() || null,
      assigned_to_user_id: draft.assigned_to_user_id || null,
      status,
    };
    const { data: created, error } = await supabase.from('studio_ad_creatives').insert([row]).select().single();
    setCreating(false);
    if (error) {
      console.error('[AdCreative] failed to create ad creative', { row, error });
      alert(`Couldn't create ad creative: ${error.message}`);
      return;
    }
    // A row created directly at a notify status pings the pipeline too, so a new
    // row added straight at "Ad Creative Needed" still reaches the editor.
    if (PIPELINE_NOTIFY_STATUSES.includes(status)) {
      notifyAdPipeline({
        status,
        creativeId: row.creative_id,
        itemUrl: created?.id ? itemUrl('ad', created.id) : '',
        sourceLink: '',
        finalLink: row.final_link ?? '',
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
  // format (Final left blank), then ping the pipeline channel.
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
  // Status filter always lists the FULL defined status set, unioned with any stray
  // statuses present on rows so none become unreachable. A no-match selection falls
  // through to the empty state.
  const statusPresent = ['All', ...Array.from(new Set([...statusValues, ...adCreatives.map(a => a.status).filter(Boolean) as string[]]))];
  const formatPresent = present(adCreatives.map(a => a.ad_format));

  // Status sorts by pipeline position (Ad Creative Needed → … → Winner/Killed),
  // using the same admin-ordered option list the status pills render from.
  const sortOptions: SortOption<StudioAdCreative>[] = useMemo(() => [
    { key: 'status', label: 'Status', kind: 'order', order: statusValues, value: a => a.status },
    { key: 'assigned', label: 'Assigned To', kind: 'text', value: a => resolveAssignee(a.assigned_to_user_id, profiles) },
    { key: 'date_added', label: 'Date Added', kind: 'date', value: a => a.date_added },
    { key: 'creative_id', label: 'Creative ID', kind: 'text', value: a => a.creative_id },
  ], [statusValues, profiles]);

  const filtered = useMemo(() => {
    let r = adCreatives;
    const q = search.trim().toLowerCase();
    if (q) r = r.filter(a => (a.creative_id || '').toLowerCase().includes(q));
    if (fStatus !== 'All') r = r.filter(a => a.status === fStatus);
    if (fFormat !== 'All') r = r.filter(a => (a.ad_format || '') === fFormat);
    if (dateFrom || dateTo) r = r.filter(a => inDateRange(a.date_added, dateFrom, dateTo));
    return sortRows(r, sortOptions, sortKey, sortDir);
  }, [adCreatives, search, fStatus, fFormat, sortKey, sortDir, dateFrom, dateTo, sortOptions]);

  const rows = useMemo(() => applyCustomFilters(filtered, cprops, custFilters), [filtered, cprops, custFilters]);

  // "Load more" pagination — resets to the first page on filter/sort change only.
  const { visible, hasMore, remaining, loadMore } = usePagedRows(
    rows,
    [search, fStatus, fFormat, sortKey, sortDir, dateFrom, dateTo, JSON.stringify(custFilters)].join('|'),
  );

  const fields: FieldDef[] = useMemo(() => [
    { key: 'creative_id', label: 'Creative ID', type: 'text', placeholder: 'Name / identifier' },
    { key: 'date_added', label: 'Date Added', type: 'date' },
    { key: 'ad_format', label: 'Format', type: 'pill', field: 'ad_format', options: formatValues, colors: formatColors, allowAdd: isAdmin, allowEmpty: true },
    { key: 'assigned_to_user_id', label: 'Assigned To', type: 'user' },
    { key: 'source_video_url', label: 'Source Video', type: 'url' },
    { key: 'final_link', label: 'Final', type: 'url' },
    { key: 'status', label: 'Status', type: 'pill', field: 'ad_status', options: statusValues, colors: statusColors, allowAdd: isAdmin },
  ], [formatValues, formatColors, statusValues, statusColors, isAdmin]);

  const selected = selectedId ? adCreatives.find(a => a.id === selectedId) : null;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <QuickLinks context="ad-creative" links={quickLinks} onReload={onReload} />

        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search Creative ID…"
          count={rows.length}
          countNoun="creative"
          actionLabel="Add Ad Creative"
          onAction={() => { setDraft({ ...EMPTY_DRAFT, date_added: todayISO() }); setAddOpen(true); }}
        >
          <MiniSelect size="md" allLabel="All status" value={fStatus} options={statusPresent} onChange={setFStatus} />
          <MiniSelect size="md" allLabel="All formats" value={fFormat} options={formatPresent} onChange={setFFormat} />
          <SortControl size="md" options={sortOptions} sortKey={sortKey} sortDir={sortDir} onKeyChange={setSortKey} onDirChange={setSortDir} />
          <FilterField label="Date"><DateRangePicker size="md" from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} /></FilterField>
          <CustomFilterControls props={cprops} optionsByProp={optsByProp} filters={custFilters} setFilters={setCustFilters} />
        </TableToolbar>

        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>{fStatus !== 'All' ? `No ad creatives with status “${fStatus}”.` : 'No ad creatives yet. Add one with “+ Add Ad Creative”.'}</div>
        ) : (
          <>
          <div className="studio-panel">
          <div className="studio-scroll">
            <table className="studio-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 240 }}>Creative ID</th>
                  <th onClick={isAdmin ? () => setOptsField({ field: 'ad_format', title: 'Format' }) : undefined} style={{ cursor: isAdmin ? 'pointer' : undefined, userSelect: 'none' }}>Format{isAdmin && <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>✎</span>}</th>
                  <th>Assigned</th>
                  <th onClick={isAdmin ? () => setOptsField({ field: 'ad_status', title: 'Status' }) : undefined} style={{ cursor: isAdmin ? 'pointer' : undefined, userSelect: 'none' }}>Status{isAdmin && <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>✎</span>}</th>
                  <th>Source Video</th>
                  <th>Final</th>
                  <th>Iterate</th>
                  <CustomHeaderCells props={cprops} isAdmin={isAdmin} onManage={() => setMgrOpen(true)} />
                  <th className="st-center">Date Added</th>
                  <th style={{ textAlign: 'right' }}>{isAdmin && <AddPropertyButton onClick={() => setMgrOpen(true)} />}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(a => (
                  <tr
                    key={a.id}
                    className={selectedId === a.id ? 'is-selected' : undefined}
                    style={{ ...rowAccent(statusColors[a.status]), cursor: 'pointer' }}
                    onClick={openOnRowClick(() => setSelectedId(a.id))}
                  >
                    <td style={{ minWidth: 240 }}>
                      <TitleCell title={a.creative_id || 'Untitled'} onOpen={() => setSelectedId(a.id)}>
                        <CopyLinkButton type="ad" id={a.id} />
                      </TitleCell>
                    </td>
                    <td><EditPillSelect size="md" field="ad_format" value={a.ad_format || ''} options={formatValues} colors={formatColors} onChange={f => patch(a.id, { ad_format: f })} onAddOption={addOption} allowAdd={isAdmin} allowEmpty /></td>
                    <td><UserPicker size="md" value={a.assigned_to_user_id ?? undefined} profiles={profiles} onChange={uid => patch(a.id, { assigned_to_user_id: uid || null })} /></td>
                    <td><EditPillSelect size="md" field="ad_status" value={a.status} options={statusValues} colors={statusColors} onChange={s => changeStatus(a, s)} onAddOption={addOption} allowAdd={isAdmin} /></td>
                    <td><UrlCell value={a.source_video_url} onCommit={u => patch(a.id, { source_video_url: u })} /></td>
                    <td><UrlCell value={a.final_link} onCommit={u => patch(a.id, { final_link: u })} /></td>
                    <td>
                      <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--accent)' }} onClick={() => handleIterate(a)} title="Trigger iteration">↻ Iterate</button>
                    </td>
                    <CustomRowCells row={a} props={cprops} optionsByProp={optsByProp} onPatch={patch} size="md" />
                    <td className="st-center">
                      <div className="st-datecell">
                        <InlineDate display="chip" value={a.date_added} onCommit={d => patch(a.id, { date_added: d || undefined })} />
                      </div>
                    </td>
                    <td><button className="btn-danger row-action" style={{ padding: '2px 6px' }} onClick={() => deleteAd(a.id)} title="Delete ad creative" aria-label="Delete ad creative">✕</button></td>
                  </tr>
                ))}
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
          itemType="ad"
          linkType="ad"
          itemId={selected.id}
          title={selected.creative_id || 'Ad Creative'}
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
              <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>New Ad Creative</div>
              <button onClick={closeAdd} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <DraftField label="Creative ID">
                <input className="form-input" value={draft.creative_id} onChange={e => setDraft(d => ({ ...d, creative_id: e.target.value }))} placeholder="Name / identifier" style={{ width: '100%', fontSize: 12 }} />
              </DraftField>
              <DraftField label="Date Added">
                <input className="form-input" type="date" value={draft.date_added} onChange={e => setDraft(d => ({ ...d, date_added: e.target.value }))} onClick={openDatePicker} style={{ width: 160, fontSize: 12 }} />
              </DraftField>
              <DraftField label="Format">
                <EditPillSelect field="ad_format" value={draft.ad_format} options={formatValues} colors={formatColors} onChange={f => setDraft(d => ({ ...d, ad_format: f }))} onAddOption={addOption} allowAdd={isAdmin} allowEmpty />
              </DraftField>
              <DraftField label="Assigned To">
                <UserPicker value={draft.assigned_to_user_id} profiles={profiles} onChange={uid => setDraft(d => ({ ...d, assigned_to_user_id: uid }))} />
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
