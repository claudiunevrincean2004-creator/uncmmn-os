'use client';
import { Client, Post, Pillar, Format } from '@/lib/types';
import { fn, avg, er, getColor, getPlatformColor } from '@/lib/utils';

interface Props {
  clients: Client[];
  posts: Post[];
  pillars: Pillar[];
  formats: Format[];
  onSelectClient: (id: string) => void;
}

export default function Overview({ clients, posts, pillars, formats, onSelectClient }: Props) {
  // Current month filter
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthPosts = posts.filter(p => p.date?.startsWith(currentMonth));

  // Aggregate metrics for this month
  const totalViews = monthPosts.reduce((s, p) => s + (p.views || 0), 0);
  const totalPostsCount = monthPosts.length;
  const totalFollows = monthPosts.reduce((s, p) => s + (p.follows || 0), 0);
  const totalSaves = monthPosts.reduce((s, p) => s + (p.saves || 0), 0);

  // Top 3 outlier posts — 1.5x above their CLIENT average views
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

  // Most active client this month (most posts logged)
  const clientPostCounts = clients.map(c => ({
    client: c,
    count: monthPosts.filter(p => p.client_id === c.id).length,
  })).sort((a, b) => b.count - a.count);
  const mostActive = clientPostCounts[0]?.count > 0 ? clientPostCounts[0] : null;

  // Best performing pillar — highest avg follows per post (across all clients)
  const pillarStats = pillars.map(pl => {
    const pillarPosts = monthPosts.filter(p => p.pillar === pl.name);
    const avgFollows = pillarPosts.length > 0 ? avg(pillarPosts.map(p => p.follows)) : 0;
    return { pillar: pl, avgFollows, postCount: pillarPosts.length };
  }).filter(ps => ps.postCount > 0).sort((a, b) => b.avgFollows - a.avgFollows);
  const bestPillar = pillarStats[0] || null;

  // Best performing format — highest avg views (across all clients)
  const uniqueFormats = Array.from(new Set(monthPosts.map(p => p.format).filter(Boolean)));
  const formatStats = uniqueFormats.map(f => {
    const formatPosts = monthPosts.filter(p => p.format === f);
    const avgViews = formatPosts.length > 0 ? avg(formatPosts.map(p => p.views)) : 0;
    return { format: f, avgViews, postCount: formatPosts.length };
  }).sort((a, b) => b.avgViews - a.avgViews);
  const bestFormat = formatStats[0] || null;

  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Overview</div>
        <div style={{ fontSize: 12, color: '#444' }}>Content performance snapshot — {monthLabel}</div>
      </div>

      {/* Top metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total Views', value: fn(totalViews), sub: 'this month' },
          { label: 'Total Posts', value: String(totalPostsCount), sub: 'across all clients' },
          { label: 'Total Follows', value: fn(totalFollows), sub: 'gained this month' },
          { label: 'Total Saves', value: fn(totalSaves), sub: 'this month' },
        ].map(m => (
          <div key={m.label} className="metric-chip">
            <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>{m.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{m.value}</div>
            <div style={{ fontSize: 11, color: '#444' }}>{m.sub}</div>
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
            {topOutliers.map((post, i) => (
              <div key={post.id} style={{ background: '#111', border: '0.5px solid #1a1a1a', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span className="badge badge-outlier">{post.multiple.toFixed(1)}x</span>
                  <span style={{ fontSize: 9, color: getPlatformColor(post.platform), textTransform: 'uppercase', fontWeight: 600 }}>{post.platform}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</div>
                <div style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>{post.clientName}</div>
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
            ))}
          </div>
        )}
      </div>

      {/* Insights row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Most Active Client */}
        <div className="card">
          <div style={{ fontSize: 11, color: '#555', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Most Active Client</div>
          {mostActive ? (
            <div style={{ cursor: 'pointer' }} onClick={() => onSelectClient(mostActive.client.id)}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{mostActive.client.name}</div>
              <div style={{ fontSize: 12, color: '#555' }}>{mostActive.count} posts this month</div>
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                {(mostActive.client.platforms || []).map(p => (
                  <span key={p} style={{ fontSize: 9, padding: '2px 5px', borderRadius: 4, border: '0.5px solid #2a2a2a', color: getPlatformColor(p) }}>{p}</span>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ color: '#333', fontSize: 12 }}>No posts this month</div>
          )}
        </div>

        {/* Best Performing Pillar */}
        <div className="card">
          <div style={{ fontSize: 11, color: '#555', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Best Pillar</div>
          {bestPillar ? (
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{bestPillar.pillar.name}</div>
              <div style={{ fontSize: 12, color: '#555' }}>{fn(bestPillar.avgFollows)} avg follows/post</div>
              <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>{bestPillar.postCount} posts this month</div>
            </div>
          ) : (
            <div style={{ color: '#333', fontSize: 12 }}>No pillar data this month</div>
          )}
        </div>

        {/* Best Performing Format */}
        <div className="card">
          <div style={{ fontSize: 11, color: '#555', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Best Format</div>
          {bestFormat ? (
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{bestFormat.format}</div>
              <div style={{ fontSize: 12, color: '#555' }}>{fn(bestFormat.avgViews)} avg views</div>
              <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>{bestFormat.postCount} posts this month</div>
            </div>
          ) : (
            <div style={{ color: '#333', fontSize: 12 }}>No format data this month</div>
          )}
        </div>
      </div>

      {/* Client performance table */}
      <div className="card">
        <div style={{ fontSize: 11, color: '#555', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client Performance — {monthLabel}</div>
        {clients.length === 0 ? (
          <div style={{ color: '#333', fontSize: 12 }}>No clients yet. Add your first client from the sidebar.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Posts</th>
                <th>Views</th>
                <th>Follows</th>
                <th>Saves</th>
                <th>Avg ER%</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c, i) => {
                const cp = monthPosts.filter(p => p.client_id === c.id);
                const views = cp.reduce((s, p) => s + (p.views || 0), 0);
                const follows = cp.reduce((s, p) => s + (p.follows || 0), 0);
                const saves = cp.reduce((s, p) => s + (p.saves || 0), 0);
                const avgER = cp.length > 0 ? avg(cp.map(p => er(p))) : 0;
                return (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => onSelectClient(c.id)}>
                    <td style={{ color: '#fff', fontWeight: 600 }}>{c.name}</td>
                    <td style={{ color: '#555' }}>{cp.length}</td>
                    <td>{fn(views)}</td>
                    <td>{fn(follows)}</td>
                    <td>{fn(saves)}</td>
                    <td style={{ color: '#555' }}>{avgER.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
