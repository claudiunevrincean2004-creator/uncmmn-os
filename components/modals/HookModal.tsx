'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Hook, Client } from '@/lib/types';

interface Props {
  hook?: Hook | null;
  client: Client;
  onClose: () => void;
  onSaved: () => void;
}

export default function HookModal({ hook, client, onClose, onSaved }: Props) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState('Uncategorized');
  const [rating, setRating] = useState(3);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (hook) {
      setText(hook.text || '');
      setCategory(hook.category || 'Uncategorized');
      setRating(hook.rating || 3);
    }
  }, [hook]);

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);
    const data = {
      client_id: client.id,
      text: text.trim(),
      category: category.trim() || 'Uncategorized',
      rating,
    };
    if (hook?.id) {
      await supabase.from('hooks').update(data).eq('id', hook.id);
    } else {
      await supabase.from('hooks').insert([data]);
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{hook ? 'Edit Hook' : 'Add Hook'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="form-label">Hook Text</label>
            <textarea
              className="form-input"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Enter hook text..."
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </div>
          <div>
            <label className="form-label">Category</label>
            <input className="form-input" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Question, Shock, Story..." />
          </div>
          <div>
            <label className="form-label">Rating (1–5)</label>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    border: '0.5px solid',
                    borderColor: rating >= n ? '#f59e0b' : '#2a2a2a',
                    background: rating >= n ? 'rgba(245,158,11,0.1)' : 'transparent',
                    color: rating >= n ? '#f59e0b' : '#555',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 14,
                  }}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Hook'}
          </button>
        </div>
      </div>
    </div>
  );
}
