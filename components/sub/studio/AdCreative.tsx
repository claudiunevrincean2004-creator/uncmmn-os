'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioAdCreative, StudioComment, StudioActivity } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import {
  AD_FORMATS, CTA_TYPES, AD_STATUSES, AD_STATUS_COLORS, AD_PLATFORMS, TEAM,
  isOverdue, logActivity,
} from '@/lib/studio';
import { PillSelect, MiniSelect, UrlCell, InlineDate, InlineText } from './cells';
import ItemPanel, { FieldDef } from './ItemPanel';

const DONE = ['Approved', 'Live'];

const FIELDS: FieldDef[] = [
  { key: 'source_video_title', label: 'Source Video', type: 'readonly' },
  { key: 'source_video_url', label: 'Link to Original', type: 'readonly-url' },
  { key: 'ad_format', label: 'Ad Format', type: 'select', options: AD_FORMATS },
  { key: 'cta_type', label: 'CTA Type', type: 'select', options: CTA_TYPES },
  { key: 'custom_cta', label: 'Custom CTA Text', type: 'text', placeholder: 'Custom CTA…', visibleIf: v => v.cta_type === 'Custom' },
  { key: 'status', label: 'Status', type: 'pill', options: AD_STATUSES, colors: AD_STATUS_COLORS },
  { key: 'creative_url', label: 'Ad Creative', type: 'url' },
  { key: 'platform', label: 'Platform', type: 'select', options: AD_PLATFORMS },
  { key: 'deadline', label: 'Deadline', type: 'date' },
  { key: 'assigned_to', label: 'Assigned To', type: 'select', options: TEAM },
  { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Add notes…' },
];

interface Props {
  adCreatives: StudioAdCreative[];
  comments: StudioComment[];
  activity: StudioActivity[];
  onReload: () => void;
}

export default function AdCreative({ adCreatives, comments, activity, onReload }: Props) {
  const [fStatus, setFStatus] = usePersistedState<string>('studio_ad_status', 'All');
  const [fPlatform, setFPlatform] = usePersistedState<string>('studio_ad_platform', 'All');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    await supabase.from('studio_ad_creatives').insert([{ source_video_title: 'Manual Ad Creative', status: 'Pending' }]);
    onReload();
  }

  async function deleteAd(id: string) {
    if (!confirm('Delete this ad creative?')) return;
    await supabase.from('studio_ad_creatives').delete().eq('id', id);
    if (selectedId === id) setSelectedId(null);
    onReload();
  }

  const filtered = useMemo(() => {
    let r = adCreatives;
    if (fStatus !== 'All') r = r.filter(a => a.status === fStatus);
    if (fPlatform !== 'All') r = r.filter(a => (a.platform || '') === fPlatform);
    return [...r].sort((a, b) => {
      const ad = a.deadline ? a.deadline.slice(0, 10) : '';
      const bd = b.deadline ? b.deadline.slice(0, 10) : '';
      if (ad && bd) return ad.localeCompare(bd);
      if (ad) return -1;
      if (bd) return 1;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
  }, [adCreatives, fStatus, fPlatform]);

  const selected = selectedId ? adCreatives.find(a => a.id === selectedId) : null;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <MiniSelect value={fStatus} options={['All', ...AD_STATUSES]} onChange={setFStatus} />
          <MiniSelect value={fPlatform} options={['All', ...AD_PLATFORMS]} onChange={setFPlatform} />
          <span style={{ fontSize: 11, color: '#555' }}>{filtered.length} {filtered.length === 1 ? 'ad creative' : 'ad creatives'}</span>
          <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', marginLeft: 'auto' }} onClick={addAd}>
            + Add Ad Creative
          </button>
        </div>

        <div style={{ fontSize: 11, color: '#444', marginBottom: 12 }}>
          Tip: set a Video Review item&apos;s status to <span style={{ color: '#ec4899', fontWeight: 600 }}>Ad Variation Needed</span> to auto-create an entry here.
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#333', padding: '40px 0', fontSize: 12 }}>
            No ad creatives yet. They appear automatically when a video needs an ad variation.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>Source Video</th>
                  <th>Original</th>
                  <th>Ad Format</th>
                  <th>CTA Type</th>
                  <th>Status</th>
                  <th>Creative</th>
                  <th>Platform</th>
                  <th>Deadline</th>
                  <th>Assigned To</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const overdue = isOverdue(a.deadline, a.status, DONE);
                  return (
                    <tr key={a.id} style={overdue ? { background: 'rgba(239,68,68,0.06)', boxShadow: 'inset 3px 0 0 #ef4444' } : (selectedId === a.id ? { background: '#0f0f0f' } : undefined)}>
                      <td style={{ minWidth: 180 }}>
                        <button
                          onClick={() => setSelectedId(a.id)}
                          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, textAlign: 'left', padding: '4px 0', fontFamily: 'inherit', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title="Open details"
                        >{a.source_video_title || 'Untitled'}</button>
                      </td>
                      <td>
                        {a.source_video_url
                          ? <a href={a.source_video_url} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'none', fontSize: 13 }} title={a.source_video_url}>↗</a>
                          : <span style={{ color: '#333' }}>—</span>}
                      </td>
                      <td>
                        <MiniSelect value={a.ad_format} options={AD_FORMATS} onChange={f => patch(a.id, { ad_format: f })} placeholder="—" />
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <MiniSelect value={a.cta_type} options={CTA_TYPES} onChange={c => patch(a.id, { cta_type: c })} placeholder="—" />
                          {a.cta_type === 'Custom' && (
                            <InlineText value={a.custom_cta} onCommit={t => patch(a.id, { custom_cta: t })} placeholder="Custom CTA…" style={{ width: 130 }} />
                          )}
                        </div>
                      </td>
                      <td>
                        <PillSelect value={a.status} options={AD_STATUSES} colors={AD_STATUS_COLORS} onChange={s => changeStatus(a, s)} />
                      </td>
                      <td><UrlCell value={a.creative_url} onCommit={u => patch(a.id, { creative_url: u })} /></td>
                      <td>
                        <MiniSelect value={a.platform} options={AD_PLATFORMS} onChange={p => patch(a.id, { platform: p })} placeholder="—" />
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <InlineDate value={a.deadline} onCommit={d => patch(a.id, { deadline: d || undefined })} highlight={overdue} />
                          {overdue && <span style={{ color: '#ef4444', fontSize: 9, fontWeight: 700 }}>OVERDUE</span>}
                        </div>
                      </td>
                      <td>
                        <MiniSelect value={a.assigned_to} options={TEAM} onChange={x => patch(a.id, { assigned_to: x })} placeholder="—" />
                      </td>
                      <td>
                        <button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteAd(a.id)}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <ItemPanel
          itemType="ad"
          itemId={selected.id}
          title={selected.source_video_title || 'Ad Creative'}
          fields={FIELDS}
          values={selected}
          onChangeField={(key, value) => { if (key === 'status') changeStatus(selected, value); else patch(selected.id, { [key]: value }); }}
          comments={comments}
          activity={activity}
          onReload={onReload}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
