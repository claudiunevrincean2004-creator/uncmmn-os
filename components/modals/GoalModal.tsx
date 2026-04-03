'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Goal, Client } from '@/lib/types';

interface Props {
  goal?: Goal | null;
  client: Client;
  onClose: () => void;
  onSaved: () => void;
}

export default function GoalModal({ goal, client, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [currentVal, setCurrentVal] = useState('');
  const [targetVal, setTargetVal] = useState('');
  const [platform, setPlatform] = useState('All');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (goal) {
      setName(goal.name || '');
      setCurrentVal(String(goal.current_val || ''));
      setTargetVal(String(goal.target_val || ''));
      setPlatform(goal.platform || 'All');
    }
  }, [goal]);

  const platforms = ['All', ...(client.platforms || [])];

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const data = {
      client_id: client.id,
      name: name.trim(),
      current_val: parseFloat(currentVal) || 0,
      target_val: parseFloat(targetVal) || 0,
      platform,
    };
    if (goal?.id) {
      await supabase.from('goals').update(data).eq('id', goal.id);
    } else {
      await supabase.from('goals').insert([data]);
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{goal ? 'Edit Goal' : 'Add Goal'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="form-label">Goal Name</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Reach 10K followers" />
          </div>
          <div>
            <label className="form-label">Platform</label>
            <select className="form-input" value={platform} onChange={e => setPlatform(e.target.value)}>
              {platforms.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">Current Value</label>
              <input className="form-input" type="number" value={currentVal} onChange={e => setCurrentVal(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="form-label">Target Value</label>
              <input className="form-input" type="number" value={targetVal} onChange={e => setTargetVal(e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Goal'}
          </button>
        </div>
      </div>
    </div>
  );
}
