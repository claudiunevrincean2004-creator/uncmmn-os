'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Post, Client, Pillar, Format } from '@/lib/types';

interface Props {
  post?: Post | null;
  client: Client;
  pillars: Pillar[];
  formats: Format[];
  onClose: () => void;
  onSaved: () => void;
}

export default function PostModal({ post, client, pillars, formats, onClose, onSaved }: Props) {
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
  const [saving, setSaving] = useState(false);

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
    }
  }, [post]);

  const clientPlatforms = client.platforms?.length ? client.platforms : ['Instagram', 'TikTok', 'YouTube'];
  const clientFormats = formats.filter(f => !platform || f.platform === platform || !f.platform);
  const clientPillars = pillars;

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    const data = {
      client_id: client.id,
      title: title.trim(),
      platform,
      format,
      pillar,
      date: date || null,
      views: parseFloat(views) || 0,
      likes: parseFloat(likes) || 0,
      comments: parseFloat(comments) || 0,
      shares: parseFloat(shares) || 0,
      saves: parseFloat(saves) || 0,
      follows: parseFloat(follows) || 0,
      drive_link: driveLink.trim(),
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
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label className="form-label">Title</label>
            <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Post title..." style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">Platform</label>
              <select className="form-input" value={platform} onChange={e => setPlatform(e.target.value)} style={inputStyle}>
                <option value="">Select...</option>
                {clientPlatforms.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Format</label>
              <select className="form-input" value={format} onChange={e => setFormat(e.target.value)} style={inputStyle}>
                <option value="">Select...</option>
                {clientFormats.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                <option value="Reel">Reel</option>
                <option value="Carousel">Carousel</option>
                <option value="Static">Static</option>
                <option value="Story">Story</option>
                <option value="Short">Short</option>
                <option value="Long-form">Long-form</option>
              </select>
            </div>
            <div>
              <label className="form-label">Pillar</label>
              <select className="form-input" value={pillar} onChange={e => setPillar(e.target.value)} style={inputStyle}>
                <option value="">Select...</option>
                {clientPillars.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
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
