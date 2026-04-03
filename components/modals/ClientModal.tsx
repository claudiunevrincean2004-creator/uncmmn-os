'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Client } from '@/lib/types';

interface Props {
  client?: Client | null;
  onClose: () => void;
  onSaved: () => void;
}

const PLATFORM_OPTIONS = ['Instagram', 'TikTok', 'YouTube'];

export default function ClientModal({ client, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [niche, setNiche] = useState('');
  const [retainer, setRetainer] = useState('');
  const [cost, setCost] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (client) {
      setName(client.name || '');
      setNiche(client.niche || '');
      setRetainer(String(client.retainer || ''));
      setCost(String(client.cost || ''));
      setPlatforms(client.platforms || []);
    }
  }, [client]);

  function togglePlatform(p: string) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const data = {
      name: name.trim(),
      niche: niche.trim(),
      retainer: parseFloat(retainer) || 0,
      cost: parseFloat(cost) || 0,
      platforms,
    };
    if (client?.id) {
      await supabase.from('clients').update(data).eq('id', client.id);
    } else {
      await supabase.from('clients').insert([data]);
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{client ? 'Edit Client' : 'Add Client'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="form-label">Client Name</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme Corp" />
          </div>
          <div>
            <label className="form-label">Niche</label>
            <input className="form-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="e.g. Fitness, Tech, Food..." />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">Monthly Retainer ($)</label>
              <input className="form-input" type="number" value={retainer} onChange={e => setRetainer(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="form-label">Client Cost ($)</label>
              <input className="form-input" type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <label className="form-label">Platforms</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {PLATFORM_OPTIONS.map(p => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: '0.5px solid',
                    borderColor: platforms.includes(p) ? '#fff' : '#2a2a2a',
                    background: platforms.includes(p) ? '#fff' : 'transparent',
                    color: platforms.includes(p) ? '#000' : '#555',
                    fontSize: 11,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Client'}
          </button>
        </div>
      </div>
    </div>
  );
}
