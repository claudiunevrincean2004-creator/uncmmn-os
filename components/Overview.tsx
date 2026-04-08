'use client';
import { Client, Post } from '@/lib/types';
import { fn, avg, er } from '@/lib/utils';
import PlatformIcon from '@/components/PlatformIcon';

interface Props {
  clients: Client[];
  posts: Post[];
  onSelectClient: (id: string) => void;
  onOpenSidebar: (id: string) => void;
}

export default function Overview({ clients, posts, onSelectClient, onOpenSidebar }: Props) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const monthPosts = posts.filter(p => p.date?.startsWith(currentMonth));
  const prevMonthPosts = posts.filter(p => p.date?.startsWith(prevMonth));

  // Current month metrics
  const totalViews = monthPosts.reduce((s, p) => s + (p.views || 0), 0);
  const totalPostsCount = monthPosts.length;
  const totalFollows = monthPosts.reduce((s, p) => s + (p.follows || 0), 0);

  // Previous month metrics
  const prevViews = prevMonthPosts.reduce((s, p) => s + (p.views || 0), 0);
  const prevPostsCount = prevMonthPosts.length;
  const prevFollows = prevMonthPosts.reduce((s, p) => s + (p.follows || 0), 0);

  // Delta helper
  function delta(current: number, previous: number): { text: string; color: string } {
    const diff = current - previous;
    if (diff > 0) return { text: `+${fn(diff)} vs last month`, color: '#10b981' };
    if (diff < 0) return { text: `${fn(diff)} vs last month`, color: '#ef4444' };
    return { text: 'No change vs last month', color: '#555' };
  }

  // Top 3 outlier posts
  const outlierPosts: (Post & { clientName: string; multiple: number })[] = [];
  clients.forEach(client => {
    const cp = monthPosts.filter(p => p.client_id === client.id);
    if (cp.length === 0) return;
    const clientAvg = avg(cp.map(p => p.views));
    if (clientAvg === 0) return;
    cp.forEach(p => {
      if (p.views >= clientAvg * 1.5) {
        outlierPosts.push({ ...p, clientName: client.name, multiple: p.views / clientAvg });
      }
    });
  });
  outlierPosts.sort((a, b) => b.multiple - a.multiple);
  const topOutliers = outlierPosts.slice(0, 3);

  // Client cards — views this month vs last month, pick top 3 by absolute change
  const clientCards = clients.map(c => {
    const thisMonthViews = monthPosts.filter(p => p.client_id === c.id).reduce((s, p) => s + (p.views || 0), 0);
    const lastMonthViews = prevMonthPosts.filter(p => p.client_id === c.id).reduce((s, p) => s + (p.views || 0), 0);
    const diff = thisMonthViews - lastMonthViews;
    return { client: c, thisMonthViews, lastMonthViews, diff };
  }).filter(c => c.thisMonthViews > 0 || c.lastMonthViews > 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 3);

  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  const viewsDelta = delta(totalViews, prevViews);
  const postsDelta = delta(totalPostsCount, prevPostsCount);
  const followsDelta = delta(totalFollows, prevFollows);

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Overview</div>
        <div style={{ fontSize: 12, color: '#444' }}>Content performance snapshot — {monthLabel}</div>
      </div>

      {/* Top metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total Views', value: fn(totalViews), delta: viewsDelta },
          { label: 'Total Posts', value: String(totalPostsCount), delta: postsDelta },
          { label: 'Total Follows', value: fn(totalFollows), delta: followsDelta },
        ].map(m => (
          <div key={m.label} className="metric-chip">
            <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>{m.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{m.value}</div>
            <div style={{ fontSize: 11, color: m.delta.color }}>{m.delta.text}</div>
          </div>
        ))}
      </div>

      {/* Top 3 Outlier Posts */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#555', marginBottom: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Outlier Posts</div>
        {topOutliers.length === 0 ? (
          <div style={{ color: '#333', fontSize: 12 }}>No outlier posts this month (posts need 1.5x above client average)</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(topOutliers.length, 3)}, 1fr)`, gap: 12 }}>
            {topOutliers.map((post) => {
              const postLink = post.post_url || post.drive_link;
              return (
              <div
                key={post.id}
                style={{ background: '#111', border: '0.5px solid #1a1a1a', borderRadius: 8, padding: 14, cursor: postLink ? 'pointer' : 'default', position: 'relative', transition: 'border-color 0.15s' }}
                onClick={() => { if (postLink) window.open(postLink, '_blank', 'noopener,noreferrer'); }}
                onMouseEnter={e => { if (postLink) e.currentTarget.style.borderColor = '#333'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a1a1a'; }}
              >
                {postLink && (
                  <div style={{ position: 'absolute', top: 10, right: 10, color: '#444' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span className="badge badge-outlier">{post.multiple.toFixed(1)}x</span>
                  <PlatformIcon platform={post.platform} size={14} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</div>
                <div
                  style={{ fontSize: 11, color: '#555', marginBottom: 10, cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); onOpenSidebar(post.client_id); }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#999')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#555')}
                >{post.clientName}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {[
                    { l: 'Views', v: fn(post.views) },
                    { l: 'Follows', v: fn(post.follows) },
                    { l: 'ER%', v: `${er(post).toFixed(1)}%` },
                  ].map(m => (
                    <div key={m.l}>
                      <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{m.l}</div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{m.v}</div>
                    </div>
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Client Cards */}
      {clientCards.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(clientCards.length, 3)}, 1fr)`, gap: 10 }}>
          {clientCards.map(cc => {
            const arrow = cc.diff > 0 ? '↑' : cc.diff < 0 ? '↓' : '→';
            const arrowColor = cc.diff > 0 ? '#10b981' : cc.diff < 0 ? '#ef4444' : '#555';
            return (
              <div
                key={cc.client.id}
                className="card"
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectClient(cc.client.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div
                    style={{ fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); onOpenSidebar(cc.client.id); }}
                    onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                  >{cc.client.name}</div>
                  <span style={{ fontSize: 18, color: arrowColor, fontWeight: 700 }}>{arrow}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>This Month</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{fn(cc.thisMonthViews)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Last Month</div>
                    <div style={{ fontSize: 14, color: '#555' }}>{fn(cc.lastMonthViews)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
