'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile, ClipperAccount, ClipperContent } from '@/lib/types';
import { profileName } from '@/lib/profile-name';
import { fn, avg } from '@/lib/utils';
import Avatar from '@/components/Avatar';
import PlatformIcon from '@/components/PlatformIcon';
import ViewsOverTime from '@/components/ViewsOverTime';

const PLATFORMS = ['tiktok', 'instagram', 'youtube'];
const PLATFORM_LABELS: Record<string, string> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' };
const capPlatform = (p?: string | null) => (p ? PLATFORM_LABELS[p.toLowerCase()] || (p.charAt(0).toUpperCase() + p.slice(1)) : '—');
type PlatformChoice = 'All' | 'TikTok' | 'YouTube' | 'Instagram';
const PLATFORM_CHOICES: PlatformChoice[] = ['All', 'TikTok', 'YouTube', 'Instagram'];

type Period = '30d' | '3m' | '6m' | 'year';
const PERIOD_LABELS: Record<Period, string> = {
  '30d': 'Last 30 days',
  '3m': 'Last 3 months',
  '6m': 'Last 6 months',
  'year': 'Last year',
};
const PERIOD_DAYS: Record<Period, number> = { '30d': 30, '3m': 91, '6m': 182, 'year': 365 };

// "active" unless explicitly marked inactive (DB default is 'active', so null counts as active).
const isActive = (status?: string | null) => (status ?? 'active') !== 'inactive';
// ER% from the fields we have on clipper content (likes / views).
const erOf = (c: ClipperContent) => (c.views ? ((c.likes || 0) / c.views) * 100 : 0);

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
}
function pad(x: number) { return String(x).padStart(2, '0'); }
function dayKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

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

  const selected = selectedId ? clippers.find(c => c.id === selectedId) ?? null : null;

  // ── Full-page dashboard swaps in within the tab (no route change) ─────────
  if (selected) {
    return (
      <ClipperDashboard
        clipper={selected}
        accounts={accountsByClipper[selected.id] || []}
        content={contentByClipper[selected.id] || []}
        onBack={() => setSelectedId(null)}
        onReload={onReload}
      />
    );
  }

  // ── Stat cards (grid view — unchanged) ───────────────────────────────────
  const stats = (() => {
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
  })();

  const cards: { label: string; value: number; color?: string }[] = [
    { label: 'Active Clippers', value: stats.activeClippers, color: '#8b5cf6' },
    { label: 'Total Active Accounts', value: stats.activeAccounts, color: 'var(--text)' },
    { label: 'TikTok Accounts', value: stats.tiktok, color: 'var(--text)' },
    { label: 'Instagram Accounts', value: stats.instagram, color: 'var(--text)' },
    { label: 'YouTube Accounts', value: stats.youtube, color: 'var(--text)' },
  ];

  const filtered = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return clippers;
    return clippers.filter(c => {
      const name = profileName(c).toLowerCase();
      const email = (c.email || '').toLowerCase();
      const handles = (accountsByClipper[c.id] || []).map(a => (a.handle || '').toLowerCase());
      return name.includes(q) || email.includes(q) || handles.some(h => h.includes(q));
    });
  })();

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cards.length}, 1fr)`, gap: 10, marginBottom: 16 }}>
        {cards.map(c => (
          <div key={c.label} className="metric-chip">
            <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>{c.label}</div>
            <div className="kpi-num" style={{ fontSize: 30, color: c.color || 'var(--text)' }}>{c.value}</div>
          </div>
        ))}
      </div>

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
    </div>
  );
}

// ── Full-page clipper dashboard (modeled on the Content analytics page) ───────
function ClipperDashboard({ clipper, accounts, content, onBack, onReload }: {
  clipper: Profile;
  accounts: ClipperAccount[];
  content: ClipperContent[];
  onBack: () => void;
  onReload: () => void;
}) {
  const [platform, setPlatform] = useState<PlatformChoice>('All');
  const [period, setPeriod] = useState<Period>('30d');
  const [sortKey, setSortKey] = useState<'date' | 'views'>('date');
  const [tablePlatform, setTablePlatform] = useState<PlatformChoice>('All');
  const [editing, setEditing] = useState<ClipperContent | null | undefined>(undefined); // undefined=closed, null=new
  const [editingAccount, setEditingAccount] = useState<ClipperAccount | null | undefined>(undefined); // undefined=closed, null=new

  const days = PERIOD_DAYS[period];
  const today = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const start = (() => { const d = new Date(today); d.setDate(d.getDate() - (days - 1)); return d; })();

  const matchesPlatform = (c: ClipperContent, choice: PlatformChoice) =>
    choice === 'All' ? true : (c.platform || '').toLowerCase() === choice.toLowerCase();
  const contentDateKey = (c: ClipperContent) => (c.posted_at ? c.posted_at.slice(0, 10) : '');
  const inRange = (c: ClipperContent) => {
    const k = contentDateKey(c);
    if (!k) return false;
    const d = new Date(k + 'T00:00:00');
    return d >= start && d <= today;
  };

  // Scoped to platform + date range for the stats/chart/outliers.
  const scoped = useMemo(
    () => content.filter(c => matchesPlatform(c, platform) && inRange(c)),
    [content, platform, period]
  );

  const totalViews = scoped.reduce((s, c) => s + (c.views || 0), 0);
  const totalPosts = scoped.length;
  const totalLikes = scoped.reduce((s, c) => s + (c.likes || 0), 0);
  const avgEr = totalViews ? (totalLikes / totalViews) * 100 : 0;
  const activeAccountsCount = accounts.filter(a => isActive(a.status) && (platform === 'All' || (a.platform || '').toLowerCase() === platform.toLowerCase())).length;

  // Daily views across the selected range, gaps filled with 0.
  const dailyViews = useMemo(() => {
    const map: Record<string, number> = {};
    scoped.forEach(c => { const k = contentDateKey(c); if (k) map[k] = (map[k] || 0) + (c.views || 0); });
    const out: { date: string; views: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const k = dayKey(d);
      out.push({ date: k, views: map[k] || 0 });
    }
    return out;
  }, [scoped, period]);

  // Outliers: this clipper's in-range posts ≥ 1.5× their own average views.
  const avgViews = avg(scoped.map(c => c.views || 0));
  const outliers = useMemo(() => {
    if (!avgViews) return [];
    return scoped
      .filter(c => (c.views || 0) >= avgViews * 1.5)
      .map(c => ({ c, multiple: (c.views || 0) / avgViews }))
      .sort((a, b) => b.multiple - a.multiple)
      .slice(0, 6);
  }, [scoped, avgViews]);

  // Table: all content (platform-filtered, all-time), sorted.
  const tableRows = useMemo(() => {
    const rows = content.filter(c => matchesPlatform(c, tablePlatform));
    return [...rows].sort((a, b) => {
      if (sortKey === 'views') return (b.views || 0) - (a.views || 0);
      const av = a.posted_at ? new Date(a.posted_at).getTime() : 0;
      const bv = b.posted_at ? new Date(b.posted_at).getTime() : 0;
      return bv - av;
    });
  }, [content, tablePlatform, sortKey]);

  const active = isActive(clipper.clipper_status);

  // ── CRUD ──
  async function removeAccount(id: string) {
    if (!confirm('Remove this account?')) return;
    const { error } = await supabase.from('clipper_accounts').delete().eq('id', id);
    if (error) { alert(`Couldn't remove account: ${error.message}`); return; }
    onReload();
  }
  async function removeContent(id: string) {
    if (!confirm('Remove this post?')) return;
    const { error } = await supabase.from('clipper_content').delete().eq('id', id);
    if (error) { alert(`Couldn't remove post: ${error.message}`); return; }
    onReload();
  }

  const cards: { label: string; value: string; color?: string }[] = [
    { label: 'Total Views', value: fn(totalViews) },
    { label: 'Total Posts', value: String(totalPosts) },
    { label: 'Avg Engagement', value: `${avgEr.toFixed(1)}%` },
    { label: 'Active Accounts', value: String(activeAccountsCount), color: '#8b5cf6' },
  ];

  return (
    <div>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={onBack}>← Clippers</button>
        <div className="font-head" style={{ fontSize: 18, fontWeight: 700 }}>{profileName(clipper)}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {PLATFORM_CHOICES.map(p => (
            <button key={p} className={`subtab${platform === p ? ' active' : ''}`} onClick={() => setPlatform(p)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {p !== 'All' && <PlatformIcon platform={p} size={14} />}{p}
            </button>
          ))}
        </div>
        <select className="form-input" style={{ width: 'auto', padding: '4px 8px', fontSize: 11, marginLeft: 'auto' }} value={period} onChange={e => setPeriod(e.target.value as Period)}>
          {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* LEFT / MAIN */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            {cards.map(c => (
              <div key={c.label} className="metric-chip">
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>{c.label}</div>
                <div className="kpi-num" style={{ fontSize: 28, color: c.color || 'var(--text)' }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Views over time */}
          <div style={{ marginBottom: 14 }}>
            <ViewsOverTime data={dailyViews} />
          </div>

          {/* Outliers */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Outlier Posts
              <span style={{ color: 'var(--text-faint)', fontWeight: 400, letterSpacing: 0, textTransform: 'none', marginLeft: 4 }}>· 1.5x above their avg ({fn(avgViews)})</span>
            </div>
            {outliers.length === 0 ? (
              <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>No outlier posts in this period.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {outliers.map(({ c, multiple }) => (
                  <div
                    key={c.id}
                    style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 8, padding: 12, cursor: c.content_url ? 'pointer' : 'default' }}
                    onClick={() => { if (c.content_url) window.open(c.content_url, '_blank', 'noopener,noreferrer'); }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span className="badge badge-outlier">{multiple.toFixed(1)}x</span>
                      <PlatformIcon platform={c.platform || ''} size={14} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || 'Untitled'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      {[{ l: 'Views', v: fn(c.views) }, { l: 'Likes', v: fn(c.likes) }, { l: 'ER%', v: `${erOf(c).toFixed(1)}%` }].map(m => (
                        <div key={m.l}>
                          <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.l}</div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{m.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Content table */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="form-input" style={{ width: 'auto', padding: '4px 8px', fontSize: 11 }} value={tablePlatform} onChange={e => setTablePlatform(e.target.value as PlatformChoice)}>
                {PLATFORM_CHOICES.map(p => <option key={p} value={p}>{p === 'All' ? 'All Platforms' : p}</option>)}
              </select>
              <select className="form-input" style={{ width: 'auto', padding: '4px 8px', fontSize: 11 }} value={sortKey} onChange={e => setSortKey(e.target.value as 'date' | 'views')}>
                <option value="date">Date ↓ Newest</option>
                <option value="views">Views ↓ High to Low</option>
              </select>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{tableRows.length} post{tableRows.length === 1 ? '' : 's'}</span>
            </div>
            <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => setEditing(null)}>+ Add Post</button>
          </div>

          {tableRows.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>No posts yet. Add a post to start tracking.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr><th>Title</th><th>Platform</th><th>Date</th><th>Views</th><th>Likes</th><th>ER%</th><th>Link</th><th></th></tr>
                </thead>
                <tbody>
                  {tableRows.map(c => (
                    <tr key={c.id}>
                      <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{c.title || 'Untitled'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <PlatformIcon platform={c.platform || ''} size={14} />
                          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.platform ? capPlatform(c.platform) : '—'}</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-faint)', fontSize: 11 }}>{c.posted_at ? c.posted_at.slice(0, 10) : '—'}</td>
                      <td style={{ fontWeight: 600 }}>{fn(c.views)}</td>
                      <td>{fn(c.likes)}</td>
                      <td style={{ color: 'var(--accent)' }}>{erOf(c).toFixed(1)}%</td>
                      <td>
                        {c.content_url
                          ? <a href={c.content_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 11, textDecoration: 'none' }}>↗</a>
                          : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }} onClick={() => setEditing(c)}>✎</button>
                          <button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => removeContent(c.id)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RIGHT / PROFILE PANEL */}
        <div style={{ width: 320, flexShrink: 0, border: '0.5px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: '18px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Avatar name={profileName(clipper)} size={40} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profileName(clipper)}</div>
              {clipper.email && <div style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clipper.email}</div>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10, fontSize: 12, marginBottom: 18 }}>
            <div style={{ color: 'var(--text-faint)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em', fontWeight: 600 }}>Role</div>
            <div style={{ textTransform: 'capitalize' }}>{clipper.role || '—'}</div>
            <div style={{ color: 'var(--text-faint)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em', fontWeight: 600 }}>Status</div>
            <div><span className="badge" style={{ fontSize: 9, ...(active ? { background: 'rgba(16,185,129,0.15)', color: '#10b981' } : { background: 'rgba(107,114,128,0.18)', color: 'var(--text-faint)' }) }}>{active ? 'Active' : 'Inactive'}</span></div>
            <div style={{ color: 'var(--text-faint)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em', fontWeight: 600 }}>Joined</div>
            <div style={{ color: 'var(--text-dim)' }}>{fmtDate(clipper.joined_at || clipper.created_at)}</div>
          </div>

          <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Accounts {accounts.length > 0 && <span>· {accounts.length}</span>}</div>
              <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--accent)' }} onClick={() => setEditingAccount(null)}>+ Add</button>
            </div>
            {accounts.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>No accounts yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {accounts.map(a => {
                  const aActive = isActive(a.status);
                  return (
                    <div key={a.id} style={{ border: '0.5px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <PlatformIcon platform={a.platform || ''} size={20} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {capPlatform(a.platform)} {a.handle && <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>· {a.handle}</span>}
                        </div>
                        {a.account_url && <a href={a.account_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{a.account_url} ↗</a>}
                      </div>
                      <span className="badge" style={{ fontSize: 9, flexShrink: 0, ...(aActive ? { background: 'rgba(16,185,129,0.15)', color: '#10b981' } : { background: 'rgba(107,114,128,0.18)', color: 'var(--text-faint)' }) }}>{aActive ? 'Active' : 'Inactive'}</span>
                      <button className="btn-ghost" style={{ fontSize: 10, padding: '2px 8px', flexShrink: 0 }} onClick={() => setEditingAccount(a)}>Edit</button>
                      <button className="btn-danger" style={{ padding: '2px 6px', flexShrink: 0 }} onClick={() => removeAccount(a.id)}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {editing !== undefined && (
        <ContentEditor
          clipperId={clipper.id}
          accounts={accounts}
          row={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); onReload(); }}
        />
      )}
      {editingAccount !== undefined && (
        <AccountEditor
          clipperId={clipper.id}
          row={editingAccount}
          onClose={() => setEditingAccount(undefined)}
          onSaved={() => { setEditingAccount(undefined); onReload(); }}
        />
      )}
    </div>
  );
}

// ── Add / edit a single clipper_account row (submit-then-edit, modal) ─────────
function AccountEditor({ clipperId, row, onClose, onSaved }: {
  clipperId: string;
  row: ClipperAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [platform, setPlatform] = useState(row?.platform ?? 'tiktok');
  const [handle, setHandle] = useState(row?.handle ?? '');
  const [accountUrl, setAccountUrl] = useState(row?.account_url ?? '');
  const [status, setStatus] = useState(isActive(row?.status) ? 'active' : 'inactive');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    const payload = {
      clipper_id: clipperId,
      platform,
      handle: handle.trim() || null,
      account_url: accountUrl.trim() || null,
      status,
    };
    const res = row
      ? await supabase.from('clipper_accounts').update(payload).eq('id', row.id)
      : await supabase.from('clipper_accounts').insert([payload]);
    setSaving(false);
    if (res.error) { alert(`Couldn't save account: ${res.error.message}`); return; }
    onSaved();
  }

  const field: React.CSSProperties = { display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, alignItems: 'center' };
  const lbl: React.CSSProperties = { fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>{row ? 'Edit Account' : 'New Account'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={field}><div style={lbl}>Platform</div>
            <select className="form-input" value={platform} onChange={e => setPlatform(e.target.value)} style={{ fontSize: 12 }}>
              {PLATFORMS.map(p => <option key={p} value={p}>{capPlatform(p)}</option>)}
            </select>
          </div>
          <div style={field}><div style={lbl}>Handle</div><input className="form-input" value={handle} onChange={e => setHandle(e.target.value)} placeholder="@username" style={{ fontSize: 12 }} /></div>
          <div style={field}><div style={lbl}>Account URL</div><input className="form-input" value={accountUrl} onChange={e => setAccountUrl(e.target.value)} placeholder="https://…" style={{ fontSize: 12 }} /></div>
          <div style={field}><div style={lbl}>Status</div>
            <select className="form-input" value={status} onChange={e => setStatus(e.target.value)} style={{ fontSize: 12 }}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <button className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }} onClick={onClose}>Cancel</button>
          <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Submit'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Add / edit a single clipper_content row (Content-page PostModal style) ────
function ContentEditor({ clipperId, accounts, row, onClose, onSaved }: {
  clipperId: string;
  accounts: ClipperAccount[];
  row: ClipperContent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(row?.title ?? '');
  const [accountId, setAccountId] = useState(row?.account_id ?? '');
  const [contentUrl, setContentUrl] = useState(row?.content_url ?? '');
  const [views, setViews] = useState(String(row?.views ?? 0));
  const [likes, setLikes] = useState(String(row?.likes ?? 0));
  const [postedAt, setPostedAt] = useState((row?.posted_at || '').slice(0, 10));
  const [saving, setSaving] = useState(false);

  // A post must belong to one of the clipper's accounts; platform is derived from it.
  const selectedAccount = accounts.find(a => a.id === accountId) || null;

  async function save() {
    if (saving) return;
    if (!selectedAccount) { alert('Pick an account for this post.'); return; }
    setSaving(true);
    const payload = {
      clipper_id: clipperId,
      account_id: selectedAccount.id,
      platform: selectedAccount.platform || null, // derived from the chosen account
      title: title.trim() || 'Untitled',
      content_url: contentUrl.trim() || null,
      views: Number(views) || 0,
      likes: Number(likes) || 0,
      posted_at: postedAt || null,
    };
    const res = row
      ? await supabase.from('clipper_content').update(payload).eq('id', row.id)
      : await supabase.from('clipper_content').insert([payload]);
    setSaving(false);
    if (res.error) { alert(`Couldn't save post: ${res.error.message}`); return; }
    onSaved();
  }

  const field: React.CSSProperties = { display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, alignItems: 'center' };
  const lbl: React.CSSProperties = { fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>{row ? 'Edit Post' : 'New Post'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={field}><div style={lbl}>Title</div><input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" style={{ fontSize: 12 }} /></div>
          <div style={field}><div style={lbl}>Account</div>
            {accounts.length === 0 ? (
              <div style={{ fontSize: 12, color: '#f59e0b' }}>⚠️ Add an account first — a post must belong to one of this clipper&apos;s accounts.</div>
            ) : (
              <select className="form-input" value={accountId} onChange={e => setAccountId(e.target.value)} style={{ fontSize: 12 }}>
                <option value="">Select an account…</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{capPlatform(a.platform)} · {a.handle || a.account_url || a.id.slice(0, 6)}</option>)}
              </select>
            )}
          </div>
          <div style={field}><div style={lbl}>Link</div><input className="form-input" value={contentUrl} onChange={e => setContentUrl(e.target.value)} placeholder="https://…" style={{ fontSize: 12 }} /></div>
          <div style={field}><div style={lbl}>Views</div><input className="form-input" type="number" value={views} onChange={e => setViews(e.target.value)} style={{ fontSize: 12 }} /></div>
          <div style={field}><div style={lbl}>Likes</div><input className="form-input" type="number" value={likes} onChange={e => setLikes(e.target.value)} style={{ fontSize: 12 }} /></div>
          <div style={field}><div style={lbl}>Posted</div><input className="form-input" type="date" value={postedAt} onChange={e => setPostedAt(e.target.value)} style={{ fontSize: 12, width: 160 }} /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <button className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }} onClick={onClose}>Cancel</button>
          <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={save} disabled={saving || !selectedAccount}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
