'use client';
import { Fragment, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioAdCreative, StudioComment, StudioActivity, StudioQuickLink, StudioDropdownOption } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { AD_FORMATS, AD_STATUSES, AD_STATUS_COLORS, todayISO, logActivity, mergeOptions, inDateRange } from '@/lib/studio';
import { EditPillSelect, EditSelect, MiniSelect, InlineText, InlineDate } from './cells';
import ItemPanel, { FieldDef } from './ItemPanel';
import QuickLinks from './QuickLinks';

type SortKey = 'date_added' | 'angle';

interface Props {
  adCreatives: StudioAdCreative[];
  comments: StudioComment[];
  activity: StudioActivity[];
  quickLinks: StudioQuickLink[];
  dropdownOptions: StudioDropdownOption[];
  onReload: () => void;
  showToast: (msg: string) => void;
}

export default function AdCreative({ adCreatives, comments, activity, quickLinks, dropdownOptions, onReload, showToast }: Props) {
  const [fStatus, setFStatus] = usePersistedState<string>('studio_ad_status', 'All');
  const [fFormat, setFFormat] = usePersistedState<string>('studio_ad_format', 'All');
  const [fAngle, setFAngle] = usePersistedState<string>('studio_ad_angle', 'All');
  const [sortKey, setSortKey] = usePersistedState<SortKey>('studio_ad_sortkey', 'date_added');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('studio_ad_sortdir', 'desc');
  const [dateFrom, setDateFrom] = usePersistedState<string>('studio_ad_from', '');
  const [dateTo, setDateTo] = usePersistedState<string>('studio_ad_to', '');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const custom = (field: string) => dropdownOptions.filter(o => o.field === field).map(o => o.value);
  const presentAngles = Array.from(new Set(adCreatives.map(a => a.angle).filter(Boolean) as string[]));
  const formatOpts = mergeOptions(AD_FORMATS, custom('ad_format'));
  const statusOpts = mergeOptions(AD_STATUSES, custom('ad_status'));
  const angleOpts = mergeOptions(custom('ad_angle'), presentAngles);

  async function addOption(field: string, value: string) {
    if (!dropdownOptions.some(o => o.field === field && o.value.toLowerCase() === value.toLowerCase())) {
      await supabase.from('studio_dropdown_options').insert([{ field, value }]);
    }
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

  async function addAd() {
    await supabase.from('studio_ad_creatives').insert([{ creative_id: 'New Creative', date_added: todayISO(), ad_format: 'Video', status: 'Paused' }]);
    onReload();
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

  const fields: FieldDef[] = useMemo(() => [
    { key: 'creative_id', label: 'Creative ID', type: 'text', placeholder: 'Name / identifier' },
    { key: 'date_added', label: 'Date Added', type: 'date' },
    { key: 'ad_format', label: 'Format', type: 'select', field: 'ad_format', options: formatOpts },
    { key: 'angle', label: 'Angle', type: 'select', field: 'ad_angle', options: angleOpts },
    { key: 'hook', label: 'Hook', type: 'text', placeholder: 'Hook' },
    { key: 'buyer_feedback', label: 'Buyer Feedback', type: 'textarea', placeholder: 'Buyer feedback…' },
    { key: 'status', label: 'Status', type: 'pill', field: 'ad_status', options: statusOpts, colors: AD_STATUS_COLORS },
  ], [formatOpts, angleOpts, statusOpts]);

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
          <span style={{ fontSize: 10, color: '#444' }}>From</span>
          <input className="form-input" type="date" style={{ width: 130, padding: '4px 7px', fontSize: 11 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span style={{ fontSize: 10, color: '#444' }}>To</span>
          <input className="form-input" type="date" style={{ width: 130, padding: '4px 7px', fontSize: 11 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && <button className="btn-ghost" style={{ fontSize: 10, padding: '4px 8px' }} onClick={() => { setDateFrom(''); setDateTo(''); }}>clear</button>}
          <span style={{ fontSize: 11, color: '#555' }}>{filtered.length} {filtered.length === 1 ? 'creative' : 'creatives'}</span>
          <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', marginLeft: 'auto' }} onClick={addAd}>+ Add Ad Creative</button>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#333', padding: '40px 0', fontSize: 12 }}>No ad creatives yet. Add one, or set a video&apos;s status to &quot;Ad Variation Needed&quot;.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>Creative ID</th>
                  <th>Date Added</th>
                  <th>Format</th>
                  <th>Angle</th>
                  <th>Hook</th>
                  <th>Buyer Feedback</th>
                  <th>Iterate</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <Fragment key={a.id}>
                    <tr style={selectedId === a.id ? { background: '#0f0f0f' } : undefined}>
                      <td style={{ minWidth: 160 }}>
                        <button onClick={() => setSelectedId(a.id)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, textAlign: 'left', padding: '4px 0', fontFamily: 'inherit', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="Open details">{a.creative_id || 'Untitled'}</button>
                      </td>
                      <td><InlineDate value={a.date_added} onCommit={d => patch(a.id, { date_added: d || undefined })} /></td>
                      <td><EditSelect field="ad_format" value={a.ad_format} options={formatOpts} onChange={f => patch(a.id, { ad_format: f })} onAddOption={addOption} placeholder="—" /></td>
                      <td><EditSelect field="ad_angle" value={a.angle} options={angleOpts} onChange={x => patch(a.id, { angle: x })} onAddOption={addOption} placeholder="—" /></td>
                      <td><InlineText value={a.hook} onCommit={t => patch(a.id, { hook: t })} placeholder="—" style={{ width: 110 }} /></td>
                      <td>
                        <button onClick={() => setExpanded(e => (e === a.id ? null : a.id))} className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px', color: a.buyer_feedback ? '#a5b4fc' : '#555' }} title="Expand feedback">
                          {a.buyer_feedback ? '📝' : '+'} {expanded === a.id ? '▲' : '▾'}
                        </button>
                      </td>
                      <td>
                        <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px', color: '#a5b4fc' }} onClick={() => handleIterate(a)} title="Trigger iteration">↻ Iterate</button>
                      </td>
                      <td><EditPillSelect field="ad_status" value={a.status} options={statusOpts} colors={AD_STATUS_COLORS} onChange={s => changeStatus(a, s)} onAddOption={addOption} /></td>
                      <td><button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteAd(a.id)}>✕</button></td>
                    </tr>
                    {expanded === a.id && (
                      <tr>
                        <td colSpan={9} style={{ background: '#0b0b0b' }}>
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
    </div>
  );
}
