'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Pillar, Post, Client } from '@/lib/types';
import { fn, getColor } from '@/lib/utils';
import PillarModal from '@/components/modals/PillarModal';

interface Props {
  client: Client;
  pillars: Pillar[];
  posts: Post[];
  onReload: () => void;
}

export default function PillarsTab({ client, pillars, posts, onReload }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editPillar, setEditPillar] = useState<Pillar | null>(null);

  async function deletePillar(id: string) {
    if (!confirm('Delete this pillar?')) return;
    await supabase.from('pillars').delete().eq('id', id);
    onReload();
  }

  const clientPillars = pillars.filter(p => p.client_id === client.id);
  const clientPosts = posts.filter(p => p.client_id === client.id);

  // Compute avg views per pillar
  const pillarStats = clientPillars.map(pillar => {
    const pp = clientPosts.filter(p => p.pillar === pillar.name);
    const avgViews = pp.length > 0 ? pp.reduce((s, p) => s + p.views, 0) / pp.length : 0;
    const postCount = pp.length;
    return { ...pillar, avgViews, postCount };
  });

  const maxAvg = Math.max(...pillarStats.map(p => p.avgViews), 1);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: '#555' }}>{clientPillars.length} pillars</span>
        <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => { setEditPillar(null); setShowModal(true); }}>+ Add Pillar</button>
      </div>

      {clientPillars.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#333', padding: '40px 0', fontSize: 12 }}>No pillars yet. Add your first content pillar.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Effectiveness bars */}
          <div className="card" style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Pillar Effectiveness (Avg Views)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pillarStats.sort((a, b) => b.avgViews - a.avgViews).map((ps, i) => (
                <div key={ps.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12 }}>{ps.name}</span>
                    <span style={{ fontSize: 11, color: '#555' }}>{fn(ps.avgViews)} avg · {ps.postCount} posts</span>
                  </div>
                  <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(ps.avgViews / maxAvg) * 100}%`, background: getColor(i), borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pillar list */}
          {clientPillars.map((pillar, i) => (
            <div key={pillar.id} className="card" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: getColor(i), marginTop: 4, flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{pillar.name}</div>
                  {pillar.description && (
                    <div style={{ fontSize: 11, color: '#555', lineHeight: 1.5 }}>{pillar.description}</div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }} onClick={() => { setEditPillar(pillar); setShowModal(true); }}>✎</button>
                <button className="btn-danger" onClick={() => deletePillar(pillar.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <PillarModal
          pillar={editPillar}
          client={client}
          onClose={() => setShowModal(false)}
          onSaved={onReload}
        />
      )}
    </div>
  );
}
