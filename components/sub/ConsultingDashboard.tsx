'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Client, ConsultingCall, ConsultingIdea } from '@/lib/types';
import { fm } from '@/lib/utils';
import CallModal from '@/components/modals/CallModal';

interface Props {
  client: Client;
  calls: ConsultingCall[];
  ideas: ConsultingIdea[];
  onReload: () => void;
}

type IdeaFilter = 'All' | 'Pending' | 'Discussed' | 'Implemented';
const IDEA_STATUSES: IdeaFilter[] = ['All', 'Pending', 'Discussed', 'Implemented'];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Pending: { bg: '#f59e0b22', text: '#f59e0b' },
  Discussed: { bg: '#6366f122', text: '#6366f1' },
  Implemented: { bg: '#10b98122', text: '#10b981' },
};

export default function ConsultingDashboard({ client, calls, ideas, onReload }: Props) {
  const [showCallModal, setShowCallModal] = useState(false);
  const [editCall, setEditCall] = useState<ConsultingCall | null>(null);
  const [ideaFilter, setIdeaFilter] = useState<IdeaFilter>('All');
  const [newIdeaText, setNewIdeaText] = useState('');
  const [addingIdea, setAddingIdea] = useState(false);

  const clientCalls = calls
    .filter(c => c.client_id === client.id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const clientIdeas = ideas
    .filter(i => i.client_id === client.id)
    .filter(i => ideaFilter === 'All' || i.status === ideaFilter);

  const totalCalls = clientCalls.length;
  const totalRevenue = clientCalls.reduce((s, c) => s + (c.amount || 0), 0);
  const lastCallDate = clientCalls[0]?.date;

  async function addIdea() {
    if (!newIdeaText.trim()) return;
    setAddingIdea(true);
    await supabase.from('consulting_ideas').insert([{
      client_id: client.id,
      text: newIdeaText.trim(),
      status: 'Pending',
    }]);
    setNewIdeaText('');
    setAddingIdea(false);
    onReload();
  }

  async function cycleIdeaStatus(idea: ConsultingIdea) {
    const order: ConsultingIdea['status'][] = ['Pending', 'Discussed', 'Implemented'];
    const idx = order.indexOf(idea.status);
    const next = order[(idx + 1) % order.length];
    await supabase.from('consulting_ideas').update({ status: next }).eq('id', idea.id);
    onReload();
  }

  async function deleteIdea(id: string) {
    if (!confirm('Delete this item?')) return;
    await supabase.from('consulting_ideas').delete().eq('id', id);
    onReload();
  }

  async function deleteCall(id: string) {
    if (!confirm('Delete this call?')) return;
    await supabase.from('consulting_calls').delete().eq('id', id);
    onReload();
  }

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Total Calls</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#6366f1' }}>{totalCalls}</div>
        </div>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Total Revenue</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>{fm(totalRevenue)}</div>
        </div>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Last Call</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
            {lastCallDate ? new Date(lastCallDate).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
          </div>
        </div>
      </div>

      {/* Calls section */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Calls</div>
          <button
            className="btn-primary"
            style={{ fontSize: 11, padding: '5px 10px' }}
            onClick={() => { setEditCall(null); setShowCallModal(true); }}
          >
            + Log Call
          </button>
        </div>

        {clientCalls.length === 0 ? (
          <div style={{ color: '#333', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>No calls logged yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {clientCalls.map(call => (
              <div key={call.id} style={{
                background: '#111',
                borderRadius: 8,
                padding: '12px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>
                      {call.date ? new Date(call.date).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'}
                    </span>
                    <span style={{ fontSize: 11, color: '#555' }}>{call.duration_minutes}min</span>
                    <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>{fm(call.amount)}</span>
                  </div>
                  {call.notes && (
                    <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                      {call.notes}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }}
                    onClick={() => { setEditCall(call); setShowCallModal(true); }}
                  >
                    ✎
                  </button>
                  <button className="btn-danger" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => deleteCall(call.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ideas & Action Items */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ideas & Action Items</div>
          <div style={{ display: 'flex', gap: 2 }}>
            {IDEA_STATUSES.map(s => (
              <button
                key={s}
                className={`subtab${ideaFilter === s ? ' active' : ''}`}
                onClick={() => setIdeaFilter(s)}
                style={{ fontSize: 10, padding: '3px 8px' }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Add idea inline */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input
            className="form-input"
            value={newIdeaText}
            onChange={e => setNewIdeaText(e.target.value)}
            placeholder="Add an idea or action item..."
            style={{ flex: 1, fontSize: 12 }}
            onKeyDown={e => { if (e.key === 'Enter') addIdea(); }}
          />
          <button
            className="btn-primary"
            style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }}
            onClick={addIdea}
            disabled={addingIdea}
          >
            + Add
          </button>
        </div>

        {clientIdeas.length === 0 ? (
          <div style={{ color: '#333', fontSize: 12, padding: '10px 0', textAlign: 'center' }}>
            {ideaFilter === 'All' ? 'No ideas yet' : `No ${ideaFilter.toLowerCase()} items`}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {clientIdeas.map(idea => {
              const sc = STATUS_COLORS[idea.status] || STATUS_COLORS.Pending;
              return (
                <div key={idea.id} style={{
                  background: '#111',
                  borderRadius: 6,
                  padding: '8px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <button
                      onClick={() => cycleIdeaStatus(idea)}
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: sc.bg,
                        color: sc.text,
                        border: 'none',
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        flexShrink: 0,
                      }}
                      title="Click to change status"
                    >
                      {idea.status}
                    </button>
                    <span style={{
                      fontSize: 12,
                      color: idea.status === 'Implemented' ? '#555' : '#ccc',
                      textDecoration: idea.status === 'Implemented' ? 'line-through' : 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {idea.text}
                    </span>
                  </div>
                  <button
                    className="btn-danger"
                    style={{ padding: '2px 6px', fontSize: 10, flexShrink: 0 }}
                    onClick={() => deleteIdea(idea.id)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCallModal && (
        <CallModal
          call={editCall}
          clientId={client.id}
          onClose={() => setShowCallModal(false)}
          onSaved={onReload}
        />
      )}
    </div>
  );
}
