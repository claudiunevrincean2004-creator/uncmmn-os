'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Client, ClientExpense, MonthlyRevenue } from '@/lib/types';
import { fm, getPlatformColor } from '@/lib/utils';
import ClientExpenseModal from '@/components/modals/ClientExpenseModal';

interface Props {
  client: Client;
  clientExpenses: ClientExpense[];
  monthlyRevenue: MonthlyRevenue[];
  onClose: () => void;
  onReload: () => void;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Active: { bg: '#10b98122', text: '#10b981' },
  Inactive: { bg: '#ef444422', text: '#ef4444' },
  Paused: { bg: '#f59e0b22', text: '#f59e0b' },
};

export default function ClientSidebar({ client, clientExpenses, monthlyRevenue, onClose, onReload }: Props) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [notes, setNotes] = useState(client.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editExpense, setEditExpense] = useState<ClientExpense | null>(null);
  const notesTimeout = useRef<NodeJS.Timeout | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNotes(client.notes || '');
  }, [client.id, client.notes]);

  // Auto-save notes with debounce
  function handleNotesChange(value: string) {
    setNotes(value);
    if (notesTimeout.current) clearTimeout(notesTimeout.current);
    notesTimeout.current = setTimeout(async () => {
      setSavingNotes(true);
      await supabase.from('clients').update({ notes: value }).eq('id', client.id);
      setSavingNotes(false);
    }, 800);
  }

  // Monthly expenses for this client
  const thisMonthExpenses = clientExpenses.filter(e => e.client_id === client.id && e.month === currentMonth);
  const totalExpenses = thisMonthExpenses.reduce((s, e) => s + (e.amount || 0), 0);

  // Revenue
  const revenueEntry = monthlyRevenue.find(r => r.client_id === client.id && r.month === currentMonth);
  const revenue = revenueEntry ? revenueEntry.amount : (client.retainer || 0);
  const netProfit = revenue - totalExpenses;
  const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  const status = client.status || 'Active';
  const statusColors = STATUS_COLORS[status] || STATUS_COLORS.Active;

  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return;
    await supabase.from('client_expenses').delete().eq('id', id);
    onReload();
  }

  function formatRenewalDate(date?: string): string {
    if (!date) return 'Not set';
    const d = new Date(date);
    return d.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: 'relative',
          width: 420,
          maxWidth: '90vw',
          height: '100vh',
          background: '#0a0a0a',
          borderLeft: '0.5px solid #1a1a1a',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '0.5px solid #1a1a1a', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{client.name}</div>
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 4,
                background: statusColors.bg,
                color: statusColors.text,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {status}
              </span>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: '0.5px solid #2a2a2a',
                borderRadius: 6,
                color: '#555',
                cursor: 'pointer',
                fontSize: 14,
                padding: '4px 8px',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: 20, flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, fontWeight: 600 }}>Retainer</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>{fm(client.retainer)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, fontWeight: 600 }}>Renewal Date</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{formatRenewalDate(client.renewal_date)}</div>
            </div>
          </div>

          {/* Niche */}
          <div>
            <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, fontWeight: 600 }}>Niche</div>
            <div style={{ fontSize: 13, color: '#ccc' }}>{client.niche || 'Not set'}</div>
          </div>

          {/* Platforms */}
          <div>
            <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Platforms</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(client.platforms || []).map(p => (
                <span key={p} style={{
                  fontSize: 10,
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: '0.5px solid #2a2a2a',
                  color: getPlatformColor(p),
                  fontWeight: 600,
                }}>
                  {p}
                </span>
              ))}
              {(!client.platforms || client.platforms.length === 0) && (
                <span style={{ fontSize: 12, color: '#333' }}>No platforms set</span>
              )}
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '0.5px solid #1a1a1a' }} />

          {/* Profitability */}
          <div>
            <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, fontWeight: 600 }}>
              Profitability — {monthLabel}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="metric-chip">
                <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, fontWeight: 600 }}>Net Profit</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: netProfit >= 0 ? '#10b981' : '#ef4444' }}>{fm(netProfit)}</div>
              </div>
              <div className="metric-chip">
                <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, fontWeight: 600 }}>Margin</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: margin >= 0 ? '#10b981' : '#ef4444' }}>{margin.toFixed(1)}%</div>
              </div>
            </div>
          </div>

          {/* Client Expenses */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                Client Expenses — {monthLabel}
              </div>
              <button
                className="btn-ghost"
                style={{ fontSize: 10, padding: '3px 8px' }}
                onClick={() => { setEditExpense(null); setShowExpenseModal(true); }}
              >
                +
              </button>
            </div>
            {thisMonthExpenses.length === 0 ? (
              <div style={{ color: '#333', fontSize: 12, padding: '10px 0' }}>No expenses this month</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {thisMonthExpenses.map(exp => (
                  <div key={exp.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    background: '#111',
                    borderRadius: 6,
                    marginBottom: 2,
                  }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#fff', marginBottom: 2 }}>{exp.name}</div>
                      <div style={{ fontSize: 9, color: '#444' }}>{exp.category}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>{fm(exp.amount)}</span>
                      <button
                        style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }}
                        onClick={() => { setEditExpense(exp); setShowExpenseModal(true); }}
                      >
                        ✎
                      </button>
                      <button
                        className="btn-danger"
                        style={{ padding: '2px 6px', fontSize: 10 }}
                        onClick={() => deleteExpense(exp.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 6 }}>
                  <span style={{ fontSize: 11, color: '#555' }}>Total: <span style={{ color: '#f59e0b', fontWeight: 600 }}>{fm(totalExpenses)}</span></span>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ borderTop: '0.5px solid #1a1a1a' }} />

          {/* Notes */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Notes</div>
              {savingNotes && <span style={{ fontSize: 9, color: '#444' }}>Saving...</span>}
            </div>
            <textarea
              className="form-input"
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
              placeholder="Add notes about this client..."
              style={{
                minHeight: 120,
                resize: 'vertical',
                lineHeight: 1.6,
                fontSize: 12,
              }}
            />
          </div>
        </div>
      </div>

      {showExpenseModal && (
        <ClientExpenseModal
          expense={editExpense}
          clientId={client.id}
          clientName={client.name}
          month={currentMonth}
          onClose={() => setShowExpenseModal(false)}
          onSaved={onReload}
        />
      )}
    </div>
  );
}
