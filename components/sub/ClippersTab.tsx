'use client';
import { useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile, ClipperAccount, ClipperContent } from '@/lib/types';
import { profileName } from '@/lib/profile-name';
import { useDismiss } from '@/lib/use-dismiss';
import Avatar from '@/components/Avatar';
import PlatformIcon from '@/components/PlatformIcon';

const PLATFORMS = ['tiktok', 'instagram', 'youtube'];

// "active" unless explicitly marked inactive (DB default is 'active', so null counts as active).
const isActive = (status?: string | null) => (status ?? 'active') !== 'inactive';

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  profiles: Profile[];
  accounts: ClipperAccount[];
  content: ClipperContent[];
  onReload: () => void;
}

export default function ClippersTab({ profiles, accounts, content, onReload }: Props) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const clippers = useMemo(() => profiles.filter(p => p.role === 'clipper'), [profiles]);
  const accountsByClipper = useMemo(() => {
    const m: Record<string, ClipperAccount[]> = {};
    accounts.forEach(a => { (m[a.clipper_id] ||= []).push(a); });
    return m;
  }, [accounts]);
  const contentByClipper = useMemo(() => {
    const m: Record<string, ClipperContent[]> = {};
    content.forEach(c => { (m[c.clipper_id] ||= []).push(c); });
    return m;
  }, [content]);

  // ── Stat cards ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const activeClippers = clippers.filter(c => isActive(c.clipper_status)).length;
    const activeAccounts = accounts.filter(a => isActive(a.status));
    const perPlatform = (p: string) => activeAccounts.filter(a => (a.platform || '').toLowerCase() === p).length;
    return {
      activeClippers,
      activeAccounts: activeAccounts.length,
      tiktok: perPlatform('tiktok'),
      instagram: perPlatform('instagram'),
      youtube: perPlatform('youtube'),
    };
  }, [clippers, accounts]);

  const cards: { label: string; value: number; color?: string }[] = [
    { label: 'Active Clippers', value: stats.activeClippers, color: '#8b5cf6' },
    { label: 'Total Active Accounts', value: stats.activeAccounts, color: 'var(--text)' },
    { label: 'TikTok Accounts', value: stats.tiktok, color: 'var(--text)' },
    { label: 'Instagram Accounts', value: stats.instagram, color: 'var(--text)' },
    { label: 'YouTube Accounts', value: stats.youtube, color: 'var(--text)' },
  ];

  // ── Search ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clippers;
    return clippers.filter(c => {
      const name = profileName(c).toLowerCase();
      const email = (c.email || '').toLowerCase();
      const handles = (accountsByClipper[c.id] || []).map(a => (a.handle || '').toLowerCase());
      return name.includes(q) || email.includes(q) || handles.some(h => h.includes(q));
    });
  }, [clippers, search, accountsByClipper]);

  const selected = selectedId ? clippers.find(c => c.id === selectedId) ?? null : null;

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cards.length}, 1fr)`, gap: 10, marginBottom: 16 }}>
        {cards.map(c => (
          <div key={c.label} className="metric-chip">
            <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>{c.label}</div>
            <div className="kpi-num" style={{ fontSize: 30, color: c.color || 'var(--text)' }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <input
          className="form-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clippers by name, email, or handle…"
          style={{ width: 320, padding: '6px 10px', fontSize: 12 }}
        />
        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{filtered.length} clipper{filtered.length === 1 ? '' : 's'}</div>
      </div>

      {/* Cards grid */}
      {clippers.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '48px 0', fontSize: 12 }}>
          No clippers yet. In <strong>Manage all users</strong>, set a user&apos;s role to <strong>Clipper</strong> to add them here.
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>No clippers match your search.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {filtered.map(c => {
            const accs = accountsByClipper[c.id] || [];
            const activeAccs = accs.filter(a => isActive(a.status));
            const platforms = Array.from(new Set(activeAccs.map(a => (a.platform || '').toLowerCase()).filter(Boolean)));
            const contentCount = (contentByClipper[c.id] || []).length;
            const active = isActive(c.clipper_status);
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="metric-chip"
                style={{ textAlign: 'left', cursor: 'pointer', border: '0.5px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={profileName(c)} size={32} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profileName(c)}</div>
                    {c.email && <div style={{ fontSize: 10, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>}
                  </div>
                  <span className="badge" style={{ fontSize: 9, ...(active ? { background: 'rgba(16,185,129,0.15)', color: '#10b981' } : { background: 'rgba(107,114,128,0.18)', color: 'var(--text-faint)' }) }}>
                    {active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {platforms.length ? platforms.map(p => <PlatformIcon key={p} platform={p} size={18} />) : <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>No accounts</span>}
                  </div>
                  <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)' }}>
                    {accs.length} acct{accs.length === 1 ? '' : 's'} · {contentCount} post{contentCount === 1 ? '' : 's'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <ClipperDetail
          clipper={selected}
          accounts={accountsByClipper[selected.id] || []}
          content={contentByClipper[selected.id] || []}
          onClose={() => setSelectedId(null)}
          onReload={onReload}
        />
      )}
    </div>
  );
}

// ── Detail slide-over (matches the widened Studio ItemPanel overlay) ─────────
function ClipperDetail({ clipper, accounts, content, onClose, onReload }: {
  clipper: Profile;
  accounts: ClipperAccount[];
  content: ClipperContent[];
  onClose: () => void;
  onReload: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDismiss(panelRef, onClose);

  const roleLabel = clipper.role ? clipper.role.charAt(0).toUpperCase() + clipper.role.slice(1) : '—';
  const active = isActive(clipper.clipper_status);

  // ── Account CRUD ──
  async function addAccount() {
    const { error } = await supabase.from('clipper_accounts').insert([{ clipper_id: clipper.id, platform: 'tiktok', status: 'active' }]);
    if (error) { alert(`Couldn't add account: ${error.message}`); return; }
    onReload();
  }
  async function patchAccount(id: string, p: Partial<ClipperAccount>) {
    const { error } = await supabase.from('clipper_accounts').update(p).eq('id', id);
    if (error) { alert(`Couldn't save account: ${error.message}`); return; }
    onReload();
  }
  async function removeAccount(id: string) {
    if (!confirm('Remove this account?')) return;
    const { error } = await supabase.from('clipper_accounts').delete().eq('id', id);
    if (error) { alert(`Couldn't remove account: ${error.message}`); return; }
    onReload();
  }

  // ── Content CRUD ──
  async function addContent() {
    const { error } = await supabase.from('clipper_content').insert([{ clipper_id: clipper.id, platform: 'tiktok', title: 'Untitled' }]);
    if (error) { alert(`Couldn't add content: ${error.message}`); return; }
    onReload();
  }
  async function patchContent(id: string, p: Partial<ClipperContent>) {
    const { error } = await supabase.from('clipper_content').update(p).eq('id', id);
    if (error) { alert(`Couldn't save content: ${error.message}`); return; }
    onReload();
  }
  async function removeContent(id: string) {
    if (!confirm('Remove this content row?')) return;
    const { error } = await supabase.from('clipper_content').delete().eq('id', id);
    if (error) { alert(`Couldn't remove content: ${error.message}`); return; }
    onReload();
  }

  const labelStyle: React.CSSProperties = { fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 };
  const sectionHead: React.CSSProperties = { fontSize: 11, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 };

  return (
    <>
      <div aria-hidden style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.28)', zIndex: 1400, animation: 'fadeIn 0.18s ease' }} />
      <div
        ref={panelRef}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(50vw, 720px)', minWidth: 340, maxWidth: 720, zIndex: 1401,
          overflowY: 'auto', borderLeft: '0.5px solid var(--border)', background: 'var(--surface)',
          boxShadow: '-16px 0 48px rgba(0,0,0,0.4)', padding: '22px 26px', animation: 'slideInRight 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name={profileName(clipper)} size={40} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>{profileName(clipper)}</div>
              {clipper.email && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{clipper.email}</div>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Properties */}
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14, marginBottom: 24 }}>
          <div style={{ ...labelStyle, paddingTop: 2 }}>Role</div>
          <div style={{ fontSize: 12, color: 'var(--text)' }}>{roleLabel}</div>
          <div style={{ ...labelStyle, paddingTop: 2 }}>Status</div>
          <div>
            <span className="badge" style={{ fontSize: 9, ...(active ? { background: 'rgba(16,185,129,0.15)', color: '#10b981' } : { background: 'rgba(107,114,128,0.18)', color: 'var(--text-faint)' }) }}>{active ? 'Active' : 'Inactive'}</span>
          </div>
          <div style={{ ...labelStyle, paddingTop: 2 }}>Joined</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{fmtDate(clipper.joined_at || clipper.created_at)}</div>
        </div>

        {/* Accounts */}
        <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 18, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={sectionHead}>Accounts {accounts.length > 0 && <span>· {accounts.length}</span>}</div>
            <button className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={addAccount}>+ Add account</button>
          </div>
          {accounts.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>No accounts yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {accounts.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '0.5px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)' }}>
                  <PlatformIcon platform={a.platform || ''} size={20} />
                  <select className="form-input" defaultValue={a.platform || 'tiktok'} onChange={e => patchAccount(a.id, { platform: e.target.value })} style={{ width: 110, fontSize: 11, padding: '3px 6px' }}>
                    {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input className="form-input" defaultValue={a.handle || ''} placeholder="@handle" onBlur={e => { const v = e.target.value.trim(); if (v !== (a.handle || '')) patchAccount(a.id, { handle: v || undefined }); }} style={{ flex: 1, minWidth: 80, fontSize: 11, padding: '3px 6px' }} />
                  <input className="form-input" defaultValue={a.account_url || ''} placeholder="https://…" onBlur={e => { const v = e.target.value.trim(); if (v !== (a.account_url || '')) patchAccount(a.id, { account_url: v || undefined }); }} style={{ flex: 1, minWidth: 80, fontSize: 11, padding: '3px 6px' }} />
                  {a.account_url && <a href={a.account_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 13 }} title="Open">↗</a>}
                  <select className="form-input" defaultValue={isActive(a.status) ? 'active' : 'inactive'} onChange={e => patchAccount(a.id, { status: e.target.value })} style={{ width: 90, fontSize: 11, padding: '3px 6px' }}>
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                  <button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => removeAccount(a.id)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={sectionHead}>Content {content.length > 0 && <span>· {content.length}</span>}</div>
            <button className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={addContent}>+ Add content</button>
          </div>
          {content.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>No content yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {content.map(c => (
                <div key={c.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 10px', border: '0.5px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)' }}>
                  <PlatformIcon platform={c.platform || ''} size={18} />
                  <select className="form-input" defaultValue={c.platform || 'tiktok'} onChange={e => patchContent(c.id, { platform: e.target.value })} style={{ width: 100, fontSize: 11, padding: '3px 6px' }}>
                    {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input className="form-input" defaultValue={c.title || ''} placeholder="Title" onBlur={e => { const v = e.target.value.trim(); if (v !== (c.title || '')) patchContent(c.id, { title: v || undefined }); }} style={{ flex: 1, minWidth: 120, fontSize: 11, padding: '3px 6px' }} />
                  <input className="form-input" defaultValue={c.content_url || ''} placeholder="https://…" onBlur={e => { const v = e.target.value.trim(); if (v !== (c.content_url || '')) patchContent(c.id, { content_url: v || undefined }); }} style={{ flex: 1, minWidth: 120, fontSize: 11, padding: '3px 6px' }} />
                  {c.content_url && <a href={c.content_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 13 }} title="Open">↗</a>}
                  <label style={{ fontSize: 10, color: 'var(--text-faint)' }}>Views</label>
                  <input className="form-input" type="number" defaultValue={c.views ?? 0} onBlur={e => { const v = Number(e.target.value) || 0; if (v !== (c.views ?? 0)) patchContent(c.id, { views: v }); }} style={{ width: 80, fontSize: 11, padding: '3px 6px' }} />
                  <label style={{ fontSize: 10, color: 'var(--text-faint)' }}>Posted</label>
                  <input className="form-input" type="date" defaultValue={(c.posted_at || '').slice(0, 10)} onChange={e => patchContent(c.id, { posted_at: e.target.value || null })} style={{ width: 130, fontSize: 11, padding: '3px 6px' }} />
                  <button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => removeContent(c.id)}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 10 }}>Views, likes, posted date &amp; platform IDs will be auto-filled by the platform APIs later — editable manually for now.</div>
        </div>
      </div>
    </>
  );
}
