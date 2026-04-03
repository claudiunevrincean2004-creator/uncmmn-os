'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Pillar, Client } from '@/lib/types';

interface Props {
  pillar?: Pillar | null;
  client: Client;
  onClose: () => void;
  onSaved: () => void;
}

export default function PillarModal({ pillar, client, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pillar) {
      setName(pillar.name || '');
      setDescription(pillar.description || '');
    }
  }, [pillar]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const data = {
      client_id: client.id,
      name: name.trim(),
      description: description.trim(),
    };
    if (pillar?.id) {
      await supabase.from('pillars').update(data).eq('id', pillar.id);
    } else {
      await supabase.from('pillars').insert([data]);
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{pillar ? 'Edit Pillar' : 'Add Pillar'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="form-label">Pillar Name</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Education, Entertainment, Promotion..." />
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea
              className="form-input"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe this content pillar..."
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Pillar'}
          </button>
        </div>
      </div>
    </div>
  );
}
