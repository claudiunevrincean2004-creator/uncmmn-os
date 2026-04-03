'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Goal, Client } from '@/lib/types';
import { fn } from '@/lib/utils';
import GoalModal from '@/components/modals/GoalModal';

interface Props {
  client: Client;
  goals: Goal[];
  onReload: () => void;
}

export default function GoalsTab({ client, goals, onReload }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);

  async function deleteGoal(id: string) {
    if (!confirm('Delete this goal?')) return;
    await supabase.from('goals').delete().eq('id', id);
    onReload();
  }

  const clientGoals = goals.filter(g => g.client_id === client.id);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: '#555' }}>{clientGoals.length} goals tracked</span>
        <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => { setEditGoal(null); setShowModal(true); }}>+ Add Goal</button>
      </div>

      {clientGoals.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#333', padding: '40px 0', fontSize: 12 }}>No goals yet. Add your first goal.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {clientGoals.map(goal => {
            const pct = goal.target_val > 0 ? Math.min(100, (goal.current_val / goal.target_val) * 100) : 0;
            const done = pct >= 100;
            return (
              <div key={goal.id} className="card" style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{goal.name}</div>
                    <div style={{ fontSize: 11, color: '#555' }}>{goal.platform}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: done ? '#10b981' : '#ccc' }}>
                      {fn(goal.current_val)} / {fn(goal.target_val)}
                    </span>
                    <span style={{ fontSize: 11, color: done ? '#10b981' : '#555' }}>
                      {pct.toFixed(0)}%
                    </span>
                    <button
                      style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }}
                      onClick={() => { setEditGoal(goal); setShowModal(true); }}
                    >
                      ✎
                    </button>
                    <button className="btn-danger" onClick={() => deleteGoal(goal.id)}>✕</button>
                  </div>
                </div>
                <div className="progress-bar">
                  <div className={`progress-bar-fill${done ? ' complete' : ''}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <GoalModal
          goal={editGoal}
          client={client}
          onClose={() => setShowModal(false)}
          onSaved={onReload}
        />
      )}
    </div>
  );
}
