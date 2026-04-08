'use client';
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Post, Client, Pillar, Format } from '@/lib/types';
import { fn, er } from '@/lib/utils';
import PlatformIcon from '@/components/PlatformIcon';
import PostModal from '@/components/modals/PostModal';

interface Props {
  client: Client;
  posts: Post[];
  pillars: Pillar[];
  formats: Format[];
  activePlat: string;
  onReload: () => void;
}

type SortKey = 'date' | 'views' | 'likes' | 'comments' | 'shares' | 'saves' | 'follows' | 'er';
type SortDir = 'asc' | 'desc';

export default function ContentTab({ client, posts, pillars, formats, activePlat, onReload }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editPost, setEditPost] = useState<Post | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterPillar, setFilterPillar] = useState('All');
  const [filterFormat, setFilterFormat] = useState('All');

  async function deletePost(id: string) {
    if (!confirm('Delete this post?')) return;
    await supabase.from('posts').delete().eq('id', id);
    onReload();
  }

  const clientPosts = posts.filter(p => p.client_id === client.id);
  const clientPillars = pillars.filter(p => p.client_id === client.id);
  const clientFormats = formats.filter(f => f.client_id === client.id);

  const pillarsOptions = ['All', ...Array.from(new Set(clientPosts.map(p => p.pillar).filter(Boolean)))];
  const formatsOptions = ['All', ...Array.from(new Set(clientPosts.map(p => p.format).filter(Boolean)))];

  const filtered = useMemo(() => {
    let result = clientPosts;
    if (activePlat !== 'All') result = result.filter(p => p.platform.toLowerCase() === activePlat.toLowerCase());
    if (filterPillar !== 'All') result = result.filter(p => p.pillar === filterPillar);
    if (filterFormat !== 'All') result = result.filter(p => p.format === filterFormat);
    return result.sort((a, b) => {
      let av = 0, bv = 0;
      if (sortKey === 'date') {
        av = new Date(a.date || 0).getTime();
        bv = new Date(b.date || 0).getTime();
      } else if (sortKey === 'er') {
        av = er(a); bv = er(b);
      } else {
        av = a[sortKey] || 0; bv = b[sortKey] || 0;
      }
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  }, [clientPosts, activePlat, filterPillar, filterFormat, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortHeader({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(k)}>
        {label} {active ? (sortDir === 'desc' ? '↓' : '↑') : ''}
      </th>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            className="form-input"
            style={{ width: 'auto', padding: '4px 8px', fontSize: 11 }}
            value={filterPillar}
            onChange={e => setFilterPillar(e.target.value)}
          >
            {pillarsOptions.map(p => <option key={p} value={p}>{p === 'All' ? 'All Pillars' : p}</option>)}
          </select>
          <select
            className="form-input"
            style={{ width: 'auto', padding: '4px 8px', fontSize: 11 }}
            value={filterFormat}
            onChange={e => setFilterFormat(e.target.value)}
          >
            {formatsOptions.map(f => <option key={f} value={f}>{f === 'All' ? 'All Formats' : f}</option>)}
          </select>
          <select
            className="form-input"
            style={{ width: 'auto', padding: '4px 8px', fontSize: 11 }}
            value={`${sortKey}-${sortDir}`}
            onChange={e => {
              const [k, d] = e.target.value.split('-') as [SortKey, SortDir];
              setSortKey(k); setSortDir(d);
            }}
          >
            {([
              { k: 'date', label: 'Date' },
              { k: 'views', label: 'Views' },
              { k: 'likes', label: 'Likes' },
              { k: 'comments', label: 'Comments' },
              { k: 'shares', label: 'Shares' },
              { k: 'saves', label: 'Saves' },
              { k: 'follows', label: 'Follows' },
              { k: 'er', label: 'ER%' },
            ] as { k: SortKey; label: string }[]).map(opt => (
              <optgroup key={opt.k} label={opt.label}>
                <option value={`${opt.k}-desc`}>{opt.label} ↓ High to Low</option>
                <option value={`${opt.k}-asc`}>{opt.label} ↑ Low to High</option>
              </optgroup>
            ))}
          </select>
          <span style={{ fontSize: 11, color: '#555' }}>{filtered.length} posts</span>
        </div>
        <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => { setEditPost(null); setShowModal(true); }}>+ Add Post</button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#333', padding: '40px 0', fontSize: 12 }}>No posts yet. Add your first post.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Platform</th>
                <th>Format</th>
                <th>Pillar</th>
                <SortHeader label="Date" k="date" />
                <SortHeader label="Views" k="views" />
                <SortHeader label="Likes" k="likes" />
                <SortHeader label="Comments" k="comments" />
                <SortHeader label="Shares" k="shares" />
                <SortHeader label="Saves" k="saves" />
                <SortHeader label="Follows" k="follows" />
                <SortHeader label="ER%" k="er" />
                <th>Link</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(post => (
                <tr key={post.id}>
                  <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff' }}>{post.title}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <PlatformIcon platform={post.platform} size={14} />
                      <span style={{ fontSize: 11, color: '#888' }}>{post.platform}</span>
                    </div>
                  </td>
                  <td style={{ color: '#666', fontSize: 11 }}>{post.format || '—'}</td>
                  <td style={{ color: '#666', fontSize: 11 }}>{post.pillar || '—'}</td>
                  <td style={{ color: '#555', fontSize: 11 }}>{post.date ? post.date.slice(0, 10) : '—'}</td>
                  <td style={{ fontWeight: 600 }}>{fn(post.views)}</td>
                  <td>{fn(post.likes)}</td>
                  <td>{fn(post.comments)}</td>
                  <td>{fn(post.shares)}</td>
                  <td>{fn(post.saves)}</td>
                  <td>{fn(post.follows)}</td>
                  <td style={{ color: '#6366f1' }}>{er(post).toFixed(1)}%</td>
                  <td>
                    {post.post_url ? (
                      <a href={post.post_url} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', fontSize: 11, textDecoration: 'none' }}>↗ Post</a>
                    ) : post.drive_link ? (
                      <a href={post.drive_link} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', fontSize: 11, textDecoration: 'none' }}>↗</a>
                    ) : <span style={{ color: '#333' }}>—</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }} onClick={() => { setEditPost(post); setShowModal(true); }}>✎</button>
                      <button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deletePost(post.id)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <PostModal
          post={editPost}
          client={client}
          pillars={clientPillars}
          formats={clientFormats}
          onClose={() => setShowModal(false)}
          onSaved={onReload}
        />
      )}
    </div>
  );
}
