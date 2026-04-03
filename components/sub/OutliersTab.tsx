'use client';
import { useMemo } from 'react';
import { Post, Client } from '@/lib/types';
import { fn, er, getPlatformColor, avg } from '@/lib/utils';

interface Props {
  client: Client;
  posts: Post[];
  activePlat: string;
}

export default function OutliersTab({ client, posts, activePlat }: Props) {
  const clientPosts = posts.filter(p => p.client_id === client.id);

  const outliers = useMemo(() => {
    let filtered = clientPosts;
    if (activePlat !== 'All') filtered = filtered.filter(p => p.platform === activePlat);

    const avgViews = avg(filtered.map(p => p.views));
    const threshold = avgViews * 1.5;

    return filtered
      .filter(p => p.views >= threshold)
      .sort((a, b) => b.views - a.views);
  }, [clientPosts, activePlat]);

  const avgViews = avg(clientPosts.filter(p => activePlat === 'All' || p.platform === activePlat).map(p => p.views));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#555' }}>
          Posts performing <span style={{ color: '#fff' }}>1.5× above average</span> ({fn(avgViews)} avg views)
        </div>
        <span style={{ fontSize: 11, color: '#555' }}>{outliers.length} outliers</span>
      </div>

      {outliers.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#333', padding: '40px 0', fontSize: 12 }}>
          No outlier posts found yet. Keep posting!
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Platform</th>
                <th>Format</th>
                <th>Pillar</th>
                <th>Date</th>
                <th>Views</th>
                <th>Likes</th>
                <th>Comments</th>
                <th>Shares</th>
                <th>Saves</th>
                <th>ER%</th>
                <th>Multiplier</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {outliers.map(post => {
                const mult = avgViews > 0 ? (post.views / avgViews).toFixed(1) : '∞';
                return (
                  <tr key={post.id}>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff' }}>{post.title}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: getPlatformColor(post.platform), display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: '#888' }}>{post.platform}</span>
                      </div>
                    </td>
                    <td style={{ color: '#666', fontSize: 11 }}>{post.format || '—'}</td>
                    <td style={{ color: '#666', fontSize: 11 }}>{post.pillar || '—'}</td>
                    <td style={{ color: '#555', fontSize: 11 }}>{post.date ? post.date.slice(0, 10) : '—'}</td>
                    <td style={{ fontWeight: 700, color: '#fff' }}>{fn(post.views)}</td>
                    <td>{fn(post.likes)}</td>
                    <td>{fn(post.comments)}</td>
                    <td>{fn(post.shares)}</td>
                    <td>{fn(post.saves)}</td>
                    <td style={{ color: '#6366f1' }}>{er(post).toFixed(1)}%</td>
                    <td>
                      <span className="badge badge-outlier">{mult}×</span>
                    </td>
                    <td>
                      {post.drive_link ? (
                        <a href={post.drive_link} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', fontSize: 11, textDecoration: 'none' }}>↗</a>
                      ) : <span style={{ color: '#333' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
