'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Client, Expense } from '@/lib/types';
import { fm, getColor } from '@/lib/utils';
import ExpenseModal from '@/components/modals/ExpenseModal';

interface Props {
  clients: Client[];
  expenses: Expense[];
  onReload: () => void;
}

export default function Finance({ clients, expenses, onReload }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);

  const totalRevenue = clients.reduce((s, c) => s + (c.retainer || 0), 0);
  const totalClientCosts = clients.reduce((s, c) => s + (c.cost || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + (e.cost || 0), 0);
  const netProfit = totalRevenue - totalClientCosts - totalExpenses;
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return;
    await supabase.from('expenses').delete().eq('id', id);
    onReload();
  }

  const clientBreakdown = clients.map((c, i) => ({
    client: c,
    retainer: c.retainer || 0,
    cost: c.cost || 0,
    profit: (c.retainer || 0) - (c.cost || 0),
    color: getColor(i),
  })).sort((a, b) => b.retainer - a.retainer);

  const maxRetainer = Math.max(...clientBreakdown.map(c => c.retainer), 1);

  // Group expenses by category
  const expenseCategories: Record<string, Expense[]> = {};
  expenses.forEach(e => {
    const cat = e.category || 'Uncategorized';
    if (!expenseCategories[cat]) expenseCategories[cat] = [];
    expenseCategories[cat].push(e);
  });

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Finance</div>
        <div style={{ fontSize: 12, color: '#444' }}>Revenue, costs, and profitability</div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Monthly Revenue', value: fm(totalRevenue), sub: `${clients.length} clients`, color: '#10b981' },
          { label: 'Client Costs', value: fm(totalClientCosts), sub: 'fulfillment costs', color: '#ef4444' },
          { label: 'Tool Expenses', value: fm(totalExpenses), sub: `${expenses.length} tools/subs`, color: '#f59e0b' },
          { label: 'Net Profit', value: fm(netProfit), sub: `${margin.toFixed(1)}% margin`, color: netProfit >= 0 ? '#10b981' : '#ef4444' },
        ].map(m => (
          <div key={m.label} className="metric-chip">
            <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>{m.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: m.color, marginBottom: 3 }}>{m.value}</div>
            <div style={{ fontSize: 11, color: '#444' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Client profit breakdown */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#555', marginBottom: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client Profit Breakdown</div>
        {clients.length === 0 ? (
          <div style={{ color: '#333', fontSize: 12 }}>No clients yet</div>
        ) : (
          <div>
            {/* Bar chart rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {clientBreakdown.map(cr => (
                <div key={cr.client.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12 }}>{cr.client.name}</span>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <span style={{ fontSize: 11, color: '#10b981' }}>{fm(cr.retainer)}</span>
                      <span style={{ fontSize: 11, color: '#ef4444' }}>-{fm(cr.cost)}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: cr.profit >= 0 ? '#10b981' : '#ef4444', minWidth: 60, textAlign: 'right' }}>{fm(cr.profit)}</span>
                    </div>
                  </div>
                  <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(cr.retainer / maxRetainer) * 100}%`, background: cr.color, borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Table */}
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Niche</th>
                  <th>Retainer</th>
                  <th>Cost</th>
                  <th>Profit</th>
                  <th>Margin</th>
                </tr>
              </thead>
              <tbody>
                {clientBreakdown.map(cr => {
                  const m = cr.retainer > 0 ? (cr.profit / cr.retainer) * 100 : 0;
                  return (
                    <tr key={cr.client.id}>
                      <td style={{ color: '#fff', fontWeight: 600 }}>{cr.client.name}</td>
                      <td style={{ color: '#555' }}>{cr.client.niche || '—'}</td>
                      <td style={{ color: '#10b981' }}>{fm(cr.retainer)}</td>
                      <td style={{ color: '#ef4444' }}>{fm(cr.cost)}</td>
                      <td style={{ color: cr.profit >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{fm(cr.profit)}</td>
                      <td style={{ color: '#555' }}>{m.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Business expenses */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Business Expenses</div>
          <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => { setEditExpense(null); setShowModal(true); }}>+ Add Expense</button>
        </div>

        {expenses.length === 0 ? (
          <div style={{ color: '#333', fontSize: 12 }}>No expenses tracked yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(expenseCategories).map(([cat, catExpenses]) => (
              <div key={cat}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#444', fontWeight: 600, marginBottom: 8, paddingBottom: 6, borderBottom: '0.5px solid #1a1a1a', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{cat}</span>
                  <span style={{ color: '#555' }}>{fm(catExpenses.reduce((s, e) => s + e.cost, 0))}/mo</span>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Monthly Cost</th>
                      <th>Annual</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {catExpenses.map(exp => (
                      <tr key={exp.id}>
                        <td style={{ color: '#fff' }}>{exp.name}</td>
                        <td style={{ color: '#f59e0b', fontWeight: 600 }}>{fm(exp.cost)}</td>
                        <td style={{ color: '#555' }}>{fm(exp.cost * 12)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }} onClick={() => { setEditExpense(exp); setShowModal(true); }}>✎</button>
                            <button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteExpense(exp.id)}>✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '0.5px solid #1a1a1a', paddingTop: 10 }}>
              <div style={{ display: 'flex', gap: 20 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monthly Total</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b' }}>{fm(totalExpenses)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Annual Total</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b' }}>{fm(totalExpenses * 12)}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <ExpenseModal
          expense={editExpense}
          onClose={() => setShowModal(false)}
          onSaved={onReload}
        />
      )}
    </div>
  );
}
