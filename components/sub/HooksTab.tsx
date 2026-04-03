'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Hook, Client } from '@/lib/types';
import { stars } from '@/lib/utils';
import HookModal from '@/components/modals/HookModal';

interface Props {
  client: Client;
  hooks: Hook[];
  onReload: () => void;
}

export default function HooksTab({ client, hooks, onReload }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editHook, setEditHook] = useState<Hook | null>(null);
  const [filterCat, setFilterCat] = useState('All');

  async function deleteHook(id: string) {
    if (!confirm('Delete this hook?')) return;
    await supabase.from('hooks').delete().eq('id', id);
    onReload();
  }

  const clientHooks = hooks.filter(h => h.client_id === client.id);
  const categories = ['All', ...Array.from(new Set(clientHooks.map(h => h.category).filter(Boolean)))];
  const filtered = filterCat === 'All' ? clientHooks : clientHooks.filter(h => h.category === filterCat);

  // Group by category
  const grouped: Record<string, Hook[]> = {};
  filtered.forEach(h => {
    const cat = h.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(h);
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button
              key={cat}
              className={`subtab${filterCat === cat ? ' active' : ''}`}
              onClick={() => setFilterCat(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
        <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => { setEditHook(null); setShowModal(true); }}>+ Add Hook</button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#333', padding: '40px 0', fontSize: 12 }}>No hooks yet. Add your first hook.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(grouped).map(([cat, catHooks]) => (
            <div key={cat}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#444', fontWeight: 600, marginBottom: 8, paddingBottom: 6, borderBottom: '0.5px solid #1a1a1a' }}>
                {cat} <span style={{ color: '#333' }}>({catHooks.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {catHooks.sort((a, b) => b.rating - a.rating).map(hook => (
                  <div key={hook.id} className="card" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '10px 12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: '#ccc', lineHeight: 1.5 }}>{hook.text}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span className="stars">{stars(hook.rating)}</span>
                      <button
                        style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }}
                        onClick={() => { setEditHook(hook); setShowModal(true); }}
                      >
                        ✎
                      </button>
                      <button className="btn-danger" onClick={() => deleteHook(hook.id)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <HookModal
          hook={editHook}
          client={client}
          onClose={() => setShowModal(false)}
          onSaved={onReload}
        />
      )}
    </div>
  );
}
