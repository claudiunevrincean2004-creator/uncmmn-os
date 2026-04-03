'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Format, Client } from '@/lib/types';
import { fn, getPlatformColor } from '@/lib/utils';
import FormatModal from '@/components/modals/FormatModal';

interface Props {
  client: Client;
  formats: Format[];
  onReload: () => void;
}

export default function FormatsTab({ client, formats, onReload }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editFormat, setEditFormat] = useState<Format | null>(null);

  async function deleteFormat(id: string) {
    if (!confirm('Delete this format?')) return;
    await supabase.from('formats').delete().eq('id', id);
    onReload();
  }

  const clientFormats = formats.filter(f => f.client_id === client.id);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: '#555' }}>{clientFormats.length} formats</span>
        <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => { setEditFormat(null); setShowModal(true); }}>+ Add Format</button>
      </div>

      {clientFormats.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#333', padding: '40px 0', fontSize: 12 }}>No formats yet. Add your first format.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {clientFormats.map(fmt => (
            <div key={fmt.id} className="card" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{fmt.name}</div>
                  {fmt.platform && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: getPlatformColor(fmt.platform), display: 'inline-block' }} />
                      <span style={{ fontSize: 11, color: '#555' }}>{fmt.platform}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }} onClick={() => { setEditFormat(fmt); setShowModal(true); }}>✎</button>
                  <button className="btn-danger" onClick={() => deleteFormat(fmt.id)}>✕</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, marginBottom: fmt.notes ? 10 : 0 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Avg Views</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{fn(fmt.avg_views)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Avg Eng</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{fmt.avg_eng.toFixed(1)}%</div>
                </div>
              </div>
              {fmt.notes && (
                <div style={{ fontSize: 11, color: '#444', borderTop: '0.5px solid #1a1a1a', paddingTop: 8, marginTop: 8, lineHeight: 1.5 }}>
                  {fmt.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <FormatModal
          format={editFormat}
          client={client}
          onClose={() => setShowModal(false)}
          onSaved={onReload}
        />
      )}
    </div>
  );
}
