'use client';
import { useMemo } from 'react';
import { Post, Client } from '@/lib/types';
import { fn, er, avg } from '@/lib/utils';
import PlatformIcon from '@/components/PlatformIcon';

interface Props {
  client: Client;
  posts: Post[];
  activePlat: string;
}

function ExternalLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export default function OutliersTab({ client, posts, activePlat }: Props) {
  const clientPosts = posts.filter(p => p.client_id === client.id);

  const outliers = useMemo(() => {
    let filtered = clientPosts;
    if (activePlat !== 'All') filtered = filtered.filter(p => p.platform.toLowerCase() === activePlat.toLowerCase());

    const avgViews = avg(filtered.map(p => p.views));
    const threshold = avgViews * 1.5;

    return filtered
      .filter(p => p.views >= threshold)
      .sort((a, b) => b.views - a.views);
  }, [clientPosts, activePlat]);

  const avgViews = avg(clientPosts.filter(p => activePlat === 'All' || p.platform.toLowerCase() === activePlat.toLowerCase()).map(p => p.views));

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
                const clickable = !!post.post_url;
                return (
                  <tr
                    key={post.id}
                    style={{ cursor: clickable ? 'pointer' : 'default' }}
                    onClick={() => { if (clickable) window.open(post.post_url, '_blank', 'noopener,noreferrer'); }}
                  >
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {post.title}
                        {clickable && <span style={{ color: '#555', flexShrink: 0 }}><ExternalLinkIcon /></span>}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <PlatformIcon platform={post.platform} size={14} />
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
                      {post.post_url ? (
                        <a
                          href={post.post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#6366f1', fontSize: 11, textDecoration: 'none' }}
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLinkIcon />
                        </a>
                      ) : post.drive_link ? (
                        <a
                          href={post.drive_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#6366f1', fontSize: 11, textDecoration: 'none' }}
                          onClick={e => e.stopPropagation()}
                        >
                          ↗
                        </a>
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
