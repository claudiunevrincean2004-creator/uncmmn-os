'use client';
import React, { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Client, MonthlyRevenue, MonthlyExpense, ClientExpense } from '@/lib/types';
import { fm, getColor } from '@/lib/utils';
import ExpenseModal from '@/components/modals/ExpenseModal';
import ClientExpenseModal from '@/components/modals/ClientExpenseModal';

interface Props {
  clients: Client[];
  monthlyRevenue: MonthlyRevenue[];
  monthlyExpenses: MonthlyExpense[];
  clientExpenses: ClientExpense[];
  onReload: () => void;
  onOpenSidebar: (id: string) => void;
}

type ViewMode = 'month' | 'quarter' | 'annual';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const QUARTERS = [
  { label: 'Q1', months: [0, 1, 2] },
  { label: 'Q2', months: [3, 4, 5] },
  { label: 'Q3', months: [6, 7, 8] },
  { label: 'Q4', months: [9, 10, 11] },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Active: { bg: '#10b98122', text: '#10b981' },
  Inactive: { bg: '#ef444422', text: '#ef4444' },
  Paused: { bg: '#f59e0b22', text: '#f59e0b' },
};

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export default function Finance({ clients, monthlyRevenue, monthlyExpenses, clientExpenses, onReload, onOpenSidebar }: Props) {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [showModal, setShowModal] = useState(false);
  const [editExpense, setEditExpense] = useState<MonthlyExpense | null>(null);
  const [showRevenueEdit, setShowRevenueEdit] = useState<string | null>(null);
  const [revenueInput, setRevenueInput] = useState('');
  const [showClientExpenseModal, setShowClientExpenseModal] = useState(false);
  const [clientExpenseTarget, setClientExpenseTarget] = useState<{ clientId: string; clientName: string } | null>(null);
  const [editClientExpense, setEditClientExpense] = useState<ClientExpense | null>(null);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  const mk = monthKey(selectedYear, selectedMonth);

  function getClientRevenue(clientId: string, month: string): number {
    const entry = monthlyRevenue.find(r => r.client_id === clientId && r.month === month);
    if (entry) return entry.amount;
    const client = clients.find(c => c.id === clientId);
    return client?.retainer || 0;
  }

  function getMonthExpenses(month: string): MonthlyExpense[] {
    return monthlyExpenses.filter(e => e.month === month);
  }

  function getClientExpenses(clientId: string, months: string[]): ClientExpense[] {
    return clientExpenses.filter(e => e.client_id === clientId && months.includes(e.month));
  }

  function clientVisibleInMonths(c: Client, months: string[]): boolean {
    if (!c.start_date) return true;
    const startMonth = c.start_date.slice(0, 7); // YYYY-MM
    return months.some(m => m >= startMonth);
  }

  function computeTotals(months: string[]) {
    let totalRevenue = 0;
    let totalExpenses = 0;
    const clientBreakdown: { client: Client; revenue: number; expenses: ClientExpense[]; totalClientExpenses: number; netProfit: number; margin: number }[] = [];

    clients.filter(c => clientVisibleInMonths(c, months)).forEach(c => {
      let rev = 0;
      months.forEach(m => { rev += getClientRevenue(c.id, m); });
      totalRevenue += rev;
      const cExpenses = getClientExpenses(c.id, months);
      const totalCE = cExpenses.reduce((s, e) => s + (e.amount || 0), 0);
      const net = rev - totalCE;
      const mg = rev > 0 ? (net / rev) * 100 : 0;
      clientBreakdown.push({ client: c, revenue: rev, expenses: cExpenses, totalClientExpenses: totalCE, netProfit: net, margin: mg });
    });
    clientBreakdown.sort((a, b) => b.revenue - a.revenue);

    const allExpenses: MonthlyExpense[] = [];
    months.forEach(m => { allExpenses.push(...getMonthExpenses(m)); });
    totalExpenses = allExpenses.reduce((s, e) => s + (e.cost || 0), 0);

    const totalClientExp = clientBreakdown.reduce((s, c) => s + c.totalClientExpenses, 0);
    const grandTotalExpenses = totalExpenses + totalClientExp;
    const netProfit = totalRevenue - grandTotalExpenses;
    const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    const expenseCategories: Record<string, MonthlyExpense[]> = {};
    allExpenses.forEach(e => {
      const cat = e.category || 'Uncategorized';
      if (!expenseCategories[cat]) expenseCategories[cat] = [];
      expenseCategories[cat].push(e);
    });

    return { totalRevenue, totalExpenses: grandTotalExpenses, netProfit, margin, clientBreakdown, expenseCategories, allExpenses, operationalExpenses: totalExpenses, totalClientExpenses: totalClientExp };
  }

  const viewData = useMemo(() => {
    if (viewMode === 'month') {
      return computeTotals([mk]);
    } else if (viewMode === 'quarter') {
      const q = QUARTERS.find(q => q.months.includes(selectedMonth))!;
      return computeTotals(q.months.map(m => monthKey(selectedYear, m)));
    } else {
      return computeTotals(Array.from({ length: 12 }, (_, i) => monthKey(selectedYear, i)));
    }
  }, [viewMode, selectedYear, selectedMonth, clients, monthlyRevenue, monthlyExpenses, clientExpenses]);

  const maxRevenue = Math.max(...viewData.clientBreakdown.map(c => c.revenue), 1);
  const currentQuarter = QUARTERS.find(q => q.months.includes(selectedMonth))!;

  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return;
    await supabase.from('monthly_expenses').delete().eq('id', id);
    onReload();
  }

  async function deleteClientExpense(id: string) {
    if (!confirm('Delete this client expense?')) return;
    await supabase.from('client_expenses').delete().eq('id', id);
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

  const quarterlyData = useMemo(() => {
    if (viewMode !== 'annual') return [];
    return QUARTERS.map(q => {
      const months = q.months.map(m => monthKey(selectedYear, m));
      const data = computeTotals(months);
      return { ...q, ...data };
    });
  }, [viewMode, selectedYear, clients, monthlyRevenue, monthlyExpenses, clientExpenses]);

  const viewLabel = viewMode === 'month'
    ? `${MONTHS[selectedMonth]} ${selectedYear}`
    : viewMode === 'quarter'
    ? `${currentQuarter.label} ${selectedYear}`
    : `${selectedYear}`;

  function formatRenewalDate(date?: string): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function renderStatusBadge(status?: string) {
    const s = status || 'Active';
    const colors = STATUS_COLORS[s] || STATUS_COLORS.Active;
    return (
      <span style={{
        fontSize: 9,
        fontWeight: 600,
        padding: '2px 6px',
        borderRadius: 4,
        background: colors.bg,
        color: colors.text,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {s}
      </span>
    );
  }

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Finance</div>
        <div style={{ fontSize: 12, color: '#444' }}>Revenue, expenses, and profitability</div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setSelectedYear(y => y - 1)}>&lt;</button>
            <span style={{ fontSize: 13, fontWeight: 700, minWidth: 44, textAlign: 'center' }}>{selectedYear}</span>
            <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setSelectedYear(y => y + 1)}>&gt;</button>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            {(['month', 'quarter', 'annual'] as ViewMode[]).map(mode => (
              <button key={mode} className={`subtab${viewMode === mode ? ' active' : ''}`} onClick={() => setViewMode(mode)} style={{ textTransform: 'capitalize', fontSize: 11 }}>
                {mode === 'month' ? 'Monthly' : mode === 'quarter' ? 'Quarterly' : 'Annual'}
              </button>
            ))}
          </div>
        </div>
        {viewMode !== 'annual' && (
          <div style={{ display: 'flex', gap: 2 }}>
            {MONTHS.map((m, i) => {
              const isInQuarter = viewMode === 'quarter' && currentQuarter.months.includes(i);
              const isSelected = viewMode === 'month' ? i === selectedMonth : isInQuarter;
              return (
                <button key={m} className={`subtab${isSelected ? ' active' : ''}`} onClick={() => setSelectedMonth(i)} style={{ flex: 1, fontSize: 10, padding: '5px 0' }}>
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
          { label: 'Total Expenses', value: fm(viewData.totalExpenses), sub: `${viewData.allExpenses.length} operational + client`, color: '#f59e0b' },
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

      {/* Client Revenue + Per-Client Breakdown */}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{ fontSize: 12, cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); onOpenSidebar(cr.client.id); }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                      >{cr.client.name}</span>
                      {renderStatusBadge(cr.client.status)}
                      {cr.client.renewal_date && (
                        <span style={{ fontSize: 9, color: '#555' }}>Renews {formatRenewalDate(cr.client.renewal_date)}</span>
                      )}
                    </div>
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

            {/* Client table with breakdown */}
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Retainer</th>
                  <th>Client Expenses</th>
                  <th>Net Profit</th>
                  <th>Margin</th>
                  {viewMode === 'month' && <th></th>}
                </tr>
              </thead>
              <tbody>
                {viewData.clientBreakdown.map(cr => (
                  <React.Fragment key={cr.client.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedClient(expandedClient === cr.client.id ? null : cr.client.id)}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{ color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                            onClick={(e) => { e.stopPropagation(); onOpenSidebar(cr.client.id); }}
                            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                          >{cr.client.name}</span>
                          {cr.client.renewal_date && (
                            <span style={{ fontSize: 9, color: '#555' }}>{formatRenewalDate(cr.client.renewal_date)}</span>
                          )}
                        </div>
                      </td>
                      <td>{renderStatusBadge(cr.client.status)}</td>
                      <td style={{ color: '#10b981' }}>{fm(cr.revenue)}</td>
                      <td style={{ color: '#f59e0b' }}>{fm(cr.totalClientExpenses)}</td>
                      <td style={{ color: cr.netProfit >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{fm(cr.netProfit)}</td>
                      <td style={{ color: '#555' }}>{cr.margin.toFixed(1)}%</td>
                      {viewMode === 'month' && (
                        <td>
                          <button
                            className="btn-ghost"
                            style={{ fontSize: 10, padding: '2px 6px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setClientExpenseTarget({ clientId: cr.client.id, clientName: cr.client.name });
                              setEditClientExpense(null);
                              setShowClientExpenseModal(true);
                            }}
                          >
                            + Expense
                          </button>
                        </td>
                      )}
                    </tr>
                    {expandedClient === cr.client.id && cr.expenses.length > 0 && (
                      <tr>
                        <td colSpan={viewMode === 'month' ? 7 : 6} style={{ padding: '8px 16px', background: '#0a0a0a' }}>
                          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, fontWeight: 600 }}>Client Expenses Breakdown</div>
                          {cr.expenses.map(exp => (
                            <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '0.5px solid #1a1a1a' }}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: '#fff' }}>{exp.name}</span>
                                <span style={{ fontSize: 9, color: '#444', padding: '1px 4px', border: '0.5px solid #1a1a1a', borderRadius: 3 }}>{exp.category}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>{fm(exp.amount)}</span>
                                {viewMode === 'month' && (
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button
                                      style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }}
                                      onClick={() => {
                                        setClientExpenseTarget({ clientId: cr.client.id, clientName: cr.client.name });
                                        setEditClientExpense(exp);
                                        setShowClientExpenseModal(true);
                                      }}
                                    >
                                      ✎
                                    </button>
                                    <button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteClientExpense(exp.id)}>✕</button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
                            <span style={{ fontSize: 11, color: '#555' }}>Total: <span style={{ color: '#f59e0b', fontWeight: 600 }}>{fm(cr.totalClientExpenses)}</span></span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Operational Expenses */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Operational Expenses — {viewLabel}
          </div>
          {viewMode === 'month' && (
            <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => { setEditExpense(null); setShowModal(true); }}>+ Add Expense</button>
          )}
        </div>

        {viewData.allExpenses.length === 0 ? (
          <div style={{ color: '#333', fontSize: 12 }}>No operational expenses for this period.{viewMode === 'month' && ' Add expenses to track your costs.'}</div>
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
                <div style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b' }}>{fm(viewData.allExpenses.reduce((s, e) => s + e.cost, 0))}</div>
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

      {showClientExpenseModal && clientExpenseTarget && (
        <ClientExpenseModal
          expense={editClientExpense}
          clientId={clientExpenseTarget.clientId}
          clientName={clientExpenseTarget.clientName}
          month={mk}
          onClose={() => setShowClientExpenseModal(false)}
          onSaved={onReload}
        />
      )}
    </div>
  );
}
