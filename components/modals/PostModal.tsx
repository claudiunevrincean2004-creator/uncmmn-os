'use client';
import { useState, useEffect } from 'react';
import Dropdown from '../sub/studio/Dropdown';
import { supabase } from '@/lib/supabase';
import { Post, Client } from '@/lib/types';
import { useDismiss } from '@/lib/use-dismiss';
import { openDatePicker } from '@/components/sub/studio/cells';

interface Props {
  post?: Post | null;
  client: Client;
  onClose: () => void;
  onSaved: () => void;
}

const DEFAULT_FORMATS = ['Short', 'Long-form', 'Reel', 'Carousel', 'Static', 'Story'];

export default function PostModal({ post, client, onClose, onSaved }: Props) {
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState('');
  const [format, setFormat] = useState('');
  const [pillar, setPillar] = useState('');
  const [date, setDate] = useState('');
  const [views, setViews] = useState('');
  const [likes, setLikes] = useState('');
  const [comments, setComments] = useState('');
  const [shares, setShares] = useState('');
  const [saves, setSaves] = useState('');
  const [follows, setFollows] = useState('');
  const [driveLink, setDriveLink] = useState('');
  const [postUrl, setPostUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // Escape closes (backdrop click is already handled by the overlay); matches Cancel/✕
  useDismiss(null, onClose, { outside: false });

  useEffect(() => {
    if (post) {
      setTitle(post.title || '');
      setPlatform(post.platform || '');
      setFormat(post.format || '');
      setPillar(post.pillar || '');
      setDate(post.date || '');
      setViews(String(post.views || ''));
      setLikes(String(post.likes || ''));
      setComments(String(post.comments || ''));
      setShares(String(post.shares || ''));
      setSaves(String(post.saves || ''));
      setFollows(String(post.follows || ''));
      setDriveLink(post.drive_link || '');
      setPostUrl(post.post_url || '');
    }
  }, [post]);

  const clientPlatforms = client.platforms?.length ? client.platforms : ['TikTok', 'YouTube'];

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    const data = {
      client_id: client.id,
      title: title.trim(),
      platform,
      format: format.trim(),
      pillar: pillar.trim(),
      date: date || null,
      views: parseFloat(views) || 0,
      likes: parseFloat(likes) || 0,
      comments: parseFloat(comments) || 0,
      shares: parseFloat(shares) || 0,
      saves: parseFloat(saves) || 0,
      follows: parseFloat(follows) || 0,
      drive_link: driveLink.trim(),
      post_url: postUrl.trim(),
    };
    if (post?.id) {
      await supabase.from('posts').update(data).eq('id', post.id);
    } else {
      await supabase.from('posts').insert([data]);
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  const inputStyle = { marginBottom: 0 };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 500 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{post ? 'Edit Post' : 'Add Post'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label className="form-label">Title</label>
            <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Post title..." style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">Platform</label>
              <Dropdown
                variant="input"
                value={platform}
                options={[{ value: '', label: 'Select...' }, ...clientPlatforms.map(p => ({ value: p, label: p }))]}
                onChange={setPlatform}
                ariaLabel="Platform"
                width="100%"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="form-label">Format</label>
              <input
                className="form-input"
                list="format-options"
                value={format}
                onChange={e => setFormat(e.target.value)}
                placeholder="Short, Long-form..."
                style={inputStyle}
              />
              <datalist id="format-options">
                {DEFAULT_FORMATS.map(f => <option key={f} value={f} />)}
              </datalist>
            </div>
            <div>
              <label className="form-label">Pillar</label>
              <input
                className="form-input"
                value={pillar}
                onChange={e => setPillar(e.target.value)}
                placeholder="Content pillar"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} onClick={openDatePicker} style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[['Views', views, setViews], ['Likes', likes, setLikes], ['Comments', comments, setComments], ['Shares', shares, setShares], ['Saves', saves, setSaves], ['Follows', follows, setFollows]].map(([label, val, setter]) => (
              <div key={label as string}>
                <label className="form-label">{label as string}</label>
                <input className="form-input" type="number" value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)} placeholder="0" style={inputStyle} />
              </div>
            ))}
          </div>

          <div>
            <label className="form-label">Post URL</label>
            <input className="form-input" value={postUrl} onChange={e => setPostUrl(e.target.value)} placeholder="https://tiktok.com/... or https://youtube.com/..." style={inputStyle} />
          </div>

          <div>
            <label className="form-label">Drive Link</label>
            <input className="form-input" value={driveLink} onChange={e => setDriveLink(e.target.value)} placeholder="https://drive.google.com/..." style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
