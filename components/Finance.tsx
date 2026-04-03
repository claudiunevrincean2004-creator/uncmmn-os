'use client';
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Client, MonthlyRevenue, MonthlyExpense } from '@/lib/types';
import { fm, getColor } from '@/lib/utils';
import ExpenseModal from '@/components/modals/ExpenseModal';

interface Props {
  clients: Client[];
  monthlyRevenue: MonthlyRevenue[];
  monthlyExpenses: MonthlyExpense[];
  onReload: () => void;
}

type ViewMode = 'month' | 'quarter' | 'annual';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const QUARTERS = [
  { label: 'Q1', months: [0, 1, 2] },
  { label: 'Q2', months: [3, 4, 5] },
  { label: 'Q3', months: [6, 7, 8] },
  { label: 'Q4', months: [9, 10, 11] },
];

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export default function Finance({ clients, monthlyRevenue, monthlyExpenses, onReload }: Props) {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [showModal, setShowModal] = useState(false);
  const [editExpense, setEditExpense] = useState<MonthlyExpense | null>(null);
  const [showRevenueEdit, setShowRevenueEdit] = useState<string | null>(null);
  const [revenueInput, setRevenueInput] = useState('');

  const mk = monthKey(selectedYear, selectedMonth);

  // Get revenue for a client in a specific month (falls back to client retainer)
  function getClientRevenue(clientId: string, month: string): number {
    const entry = monthlyRevenue.find(r => r.client_id === clientId && r.month === month);
    if (entry) return entry.amount;
    const client = clients.find(c => c.id === clientId);
    return client?.retainer || 0;
  }

  // Get expenses for a specific month
  function getMonthExpenses(month: string): MonthlyExpense[] {
    return monthlyExpenses.filter(e => e.month === month);
  }

  // Compute totals for a set of months
  function computeTotals(months: string[]) {
    let totalRevenue = 0;
    let totalExpenses = 0;
    const clientBreakdown: { client: Client; revenue: number }[] = [];

    clients.forEach(c => {
      let rev = 0;
      months.forEach(m => { rev += getClientRevenue(c.id, m); });
      totalRevenue += rev;
      clientBreakdown.push({ client: c, revenue: rev });
    });
    clientBreakdown.sort((a, b) => b.revenue - a.revenue);

    const allExpenses: MonthlyExpense[] = [];
    months.forEach(m => { allExpenses.push(...getMonthExpenses(m)); });
    totalExpenses = allExpenses.reduce((s, e) => s + (e.cost || 0), 0);

    const netProfit = totalRevenue - totalExpenses;
    const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Group expenses by category
    const expenseCategories: Record<string, MonthlyExpense[]> = {};
    allExpenses.forEach(e => {
      const cat = e.category || 'Uncategorized';
      if (!expenseCategories[cat]) expenseCategories[cat] = [];
      expenseCategories[cat].push(e);
    });

    return { totalRevenue, totalExpenses, netProfit, margin, clientBreakdown, expenseCategories, allExpenses };
  }

  // Current view data
  const viewData = useMemo(() => {
    if (viewMode === 'month') {
      return computeTotals([mk]);
    } else if (viewMode === 'quarter') {
      const q = QUARTERS.find(q => q.months.includes(selectedMonth))!;
      return computeTotals(q.months.map(m => monthKey(selectedYear, m)));
    } else {
      return computeTotals(Array.from({ length: 12 }, (_, i) => monthKey(selectedYear, i)));
    }
  }, [viewMode, selectedYear, selectedMonth, clients, monthlyRevenue, monthlyExpenses]);

  const maxRevenue = Math.max(...viewData.clientBreakdown.map(c => c.revenue), 1);

  // Get current quarter label
  const currentQuarter = QUARTERS.find(q => q.months.includes(selectedMonth))!;

  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return;
    await supabase.from('monthly_expenses').delete().eq('id', id);
    onReload();
  }

  async function saveClientRevenue(clientId: string) {
    const amount = parseFloat(revenueInput) || 0;
    const existing = monthlyRevenue.find(r => r.client_id === clientId && r.month === mk);
    if (existing) {
      await supabase.from('monthly_revenue').update({ amount }).eq('id', existing.id);
    } else {
      await supabase.from('monthly_revenue').insert([{ client_id: clientId, month: mk, amount }]);
    }
    setShowRevenueEdit(null);
    setRevenueInput('');
    onReload();
  }

  // Quarterly summary data for annual view
  const quarterlyData = useMemo(() => {
    if (viewMode !== 'annual') return [];
    return QUARTERS.map(q => {
      const months = q.months.map(m => monthKey(selectedYear, m));
      const data = computeTotals(months);
      return { ...q, ...data };
    });
  }, [viewMode, selectedYear, clients, monthlyRevenue, monthlyExpenses]);

  const viewLabel = viewMode === 'month'
    ? `${MONTHS[selectedMonth]} ${selectedYear}`
    : viewMode === 'quarter'
    ? `${currentQuarter.label} ${selectedYear}`
    : `${selectedYear}`;

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Finance</div>
        <div style={{ fontSize: 12, color: '#444' }}>Revenue, expenses, and profitability</div>
      </div>

      {/* Controls: Year, View mode, Month selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {/* Year + View mode */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              className="btn-ghost"
              style={{ padding: '4px 8px', fontSize: 11 }}
              onClick={() => setSelectedYear(y => y - 1)}
            >
              &lt;
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, minWidth: 44, textAlign: 'center' }}>{selectedYear}</span>
            <button
              className="btn-ghost"
              style={{ padding: '4px 8px', fontSize: 11 }}
              onClick={() => setSelectedYear(y => y + 1)}
            >
              &gt;
            </button>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            {(['month', 'quarter', 'annual'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                className={`subtab${viewMode === mode ? ' active' : ''}`}
                onClick={() => setViewMode(mode)}
                style={{ textTransform: 'capitalize', fontSize: 11 }}
              >
                {mode === 'month' ? 'Monthly' : mode === 'quarter' ? 'Quarterly' : 'Annual'}
              </button>
            ))}
          </div>
        </div>

        {/* Month selector (for month and quarter views) */}
        {viewMode !== 'annual' && (
          <div style={{ display: 'flex', gap: 2 }}>
            {MONTHS.map((m, i) => {
              const isInQuarter = viewMode === 'quarter' && currentQuarter.months.includes(i);
              const isSelected = viewMode === 'month' ? i === selectedMonth : isInQuarter;
              return (
                <button
                  key={m}
                  className={`subtab${isSelected ? ' active' : ''}`}
                  onClick={() => setSelectedMonth(i)}
                  style={{ flex: 1, fontSize: 10, padding: '5px 0' }}
                >
                  {m}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total Revenue', value: fm(viewData.totalRevenue), sub: viewLabel, color: '#10b981' },
          { label: 'Total Expenses', value: fm(viewData.totalExpenses), sub: `${viewData.allExpenses.length} items`, color: '#f59e0b' },
          { label: 'Net Profit', value: fm(viewData.netProfit), sub: `${viewData.margin.toFixed(1)}% margin`, color: viewData.netProfit >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Profit Margin', value: `${viewData.margin.toFixed(1)}%`, sub: viewData.netProfit >= 0 ? 'healthy' : 'negative', color: viewData.netProfit >= 0 ? '#10b981' : '#ef4444' },
        ].map(m => (
          <div key={m.label} className="metric-chip">
            <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>{m.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: m.color, marginBottom: 3 }}>{m.value}</div>
            <div style={{ fontSize: 11, color: '#444' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Quarterly breakdown in annual view */}
      {viewMode === 'annual' && quarterlyData.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#555', marginBottom: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quarterly Breakdown — {selectedYear}</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Quarter</th>
                <th>Revenue</th>
                <th>Expenses</th>
                <th>Net Profit</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {quarterlyData.map(q => (
                <tr key={q.label}>
                  <td style={{ color: '#fff', fontWeight: 600 }}>{q.label}</td>
                  <td style={{ color: '#10b981' }}>{fm(q.totalRevenue)}</td>
                  <td style={{ color: '#f59e0b' }}>{fm(q.totalExpenses)}</td>
                  <td style={{ color: q.netProfit >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{fm(q.netProfit)}</td>
                  <td style={{ color: '#555' }}>{q.margin.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Client Revenue */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#555', marginBottom: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Client Revenue — {viewLabel}
        </div>
        {clients.length === 0 ? (
          <div style={{ color: '#333', fontSize: 12 }}>No clients yet</div>
        ) : (
          <div>
            {/* Bar chart rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {viewData.clientBreakdown.map((cr, i) => (
                <div key={cr.client.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 12 }}>{cr.client.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>{fm(cr.revenue)}</span>
                      {viewMode === 'month' && (
                        showRevenueEdit === cr.client.id ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input
                              className="form-input"
                              type="number"
                              value={revenueInput}
                              onChange={e => setRevenueInput(e.target.value)}
                              style={{ width: 80, padding: '2px 6px', fontSize: 11 }}
                              placeholder="0"
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') saveClientRevenue(cr.client.id); if (e.key === 'Escape') setShowRevenueEdit(null); }}
                            />
                            <button className="btn-primary" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => saveClientRevenue(cr.client.id)}>Save</button>
                            <button className="btn-ghost" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => setShowRevenueEdit(null)}>Cancel</button>
                          </div>
                        ) : (
                          <button
                            style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }}
                            onClick={() => { setShowRevenueEdit(cr.client.id); setRevenueInput(String(getClientRevenue(cr.client.id, mk))); }}
                          >
                            ✎
                          </button>
                        )
                      )}
                    </div>
                  </div>
                  <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(cr.revenue / maxRevenue) * 100}%`, background: getColor(i), borderRadius: 2 }} />
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
                  <th>Revenue</th>
                  <th>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {viewData.clientBreakdown.map(cr => {
                  const pct = viewData.totalRevenue > 0 ? (cr.revenue / viewData.totalRevenue) * 100 : 0;
                  return (
                    <tr key={cr.client.id}>
                      <td style={{ color: '#fff', fontWeight: 600 }}>{cr.client.name}</td>
                      <td style={{ color: '#555' }}>{cr.client.niche || '—'}</td>
                      <td style={{ color: '#10b981' }}>{fm(cr.revenue)}</td>
                      <td style={{ color: '#555' }}>{pct.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expenses */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Expenses — {viewLabel}
          </div>
          {viewMode === 'month' && (
            <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => { setEditExpense(null); setShowModal(true); }}>+ Add Expense</button>
          )}
        </div>

        {viewData.allExpenses.length === 0 ? (
          <div style={{ color: '#333', fontSize: 12 }}>No expenses for this period.{viewMode === 'month' && ' Add expenses to track your costs.'}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(viewData.expenseCategories).map(([cat, catExpenses]) => (
              <div key={cat}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#444', fontWeight: 600, marginBottom: 8, paddingBottom: 6, borderBottom: '0.5px solid #1a1a1a', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{cat}</span>
                  <span style={{ color: '#555' }}>{fm(catExpenses.reduce((s, e) => s + e.cost, 0))}</span>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Cost</th>
                      {viewMode !== 'month' && <th>Month</th>}
                      {viewMode === 'month' && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {catExpenses.map(exp => (
                      <tr key={exp.id}>
                        <td style={{ color: '#fff' }}>{exp.name}</td>
                        <td style={{ color: '#f59e0b', fontWeight: 600 }}>{fm(exp.cost)}</td>
                        {viewMode !== 'month' && <td style={{ color: '#555', fontSize: 11 }}>{exp.month}</td>}
                        {viewMode === 'month' && (
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }} onClick={() => { setEditExpense(exp); setShowModal(true); }}>✎</button>
                              <button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteExpense(exp.id)}>✕</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '0.5px solid #1a1a1a', paddingTop: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {viewMode === 'month' ? 'Monthly' : viewMode === 'quarter' ? 'Quarterly' : 'Annual'} Total
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b' }}>{fm(viewData.totalExpenses)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <ExpenseModal
          expense={editExpense}
          month={mk}
          onClose={() => setShowModal(false)}
          onSaved={onReload}
        />
      )}
    </div>
  );
}
