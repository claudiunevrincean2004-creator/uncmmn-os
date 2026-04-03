'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Format, Client } from '@/lib/types';

interface Props {
  format?: Format | null;
  client: Client;
  onClose: () => void;
  onSaved: () => void;
}

export default function FormatModal({ format, client, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('');
  const [avgViews, setAvgViews] = useState('');
  const [avgEng, setAvgEng] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (format) {
      setName(format.name || '');
      setPlatform(format.platform || '');
      setAvgViews(String(format.avg_views || ''));
      setAvgEng(String(format.avg_eng || ''));
      setNotes(format.notes || '');
    }
  }, [format]);

  const platforms = client.platforms?.length ? client.platforms : ['Instagram', 'TikTok', 'YouTube'];

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const data = {
      client_id: client.id,
      name: name.trim(),
      platform,
      avg_views: parseFloat(avgViews) || 0,
      avg_eng: parseFloat(avgEng) || 0,
      notes: notes.trim(),
    };
    if (format?.id) {
      await supabase.from('formats').update(data).eq('id', format.id);
    } else {
      await supabase.from('formats').insert([data]);
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{format ? 'Edit Format' : 'Add Format'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="form-label">Format Name</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Talking Head Reel, Carousel..." />
          </div>
          <div>
            <label className="form-label">Platform</label>
            <select className="form-input" value={platform} onChange={e => setPlatform(e.target.value)}>
              <option value="">Select...</option>
              {platforms.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">Avg Views</label>
              <input className="form-input" type="number" value={avgViews} onChange={e => setAvgViews(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="form-label">Avg Engagement %</label>
              <input className="form-input" type="number" value={avgEng} onChange={e => setAvgEng(e.target.value)} placeholder="0.0" step="0.1" />
            </div>
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea
              className="form-input"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={2}
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Format'}
          </button>
        </div>
      </div>
    </div>
  );
}
