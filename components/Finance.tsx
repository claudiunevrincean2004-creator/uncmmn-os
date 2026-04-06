'use client';
import React, { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Client, MonthlyRevenue, MonthlyExpense, ClientExpense, ClientMonthExclusion } from '@/lib/types';
import { fm, getColor } from '@/lib/utils';
import ExpenseModal from '@/components/modals/ExpenseModal';
import ClientExpenseModal from '@/components/modals/ClientExpenseModal';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface Props {
  clients: Client[];
  monthlyRevenue: MonthlyRevenue[];
  monthlyExpenses: MonthlyExpense[];
  clientExpenses: ClientExpense[];
  clientMonthExclusions: ClientMonthExclusion[];
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

const PLATFORM_OPTIONS = ['Instagram', 'TikTok', 'YouTube'];

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export default function Finance({ clients, monthlyRevenue, monthlyExpenses, clientExpenses, clientMonthExclusions, onReload, onOpenSidebar }: Props) {
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
  const [showAddClientModal, setShowAddClientModal] = useState(false);

  // Add client modal state
  const [newClientName, setNewClientName] = useState('');
  const [newClientStatus, setNewClientStatus] = useState<'Active' | 'Inactive' | 'Paused'>('Inactive');
  const [newClientRetainer, setNewClientRetainer] = useState('');
  const [newClientStartDate, setNewClientStartDate] = useState('');
  const [newClientPlatforms, setNewClientPlatforms] = useState<string[]>([]);
  const [newClientRenewalDate, setNewClientRenewalDate] = useState('');
  const [savingClient, setSavingClient] = useState(false);

  const mk = monthKey(selectedYear, selectedMonth);

  const exclusionSet = useMemo(() => {
    const set = new Set<string>();
    clientMonthExclusions.forEach(e => set.add(`${e.client_id}::${e.month}`));
    return set;
  }, [clientMonthExclusions]);

  function isClientExcluded(clientId: string, month: string): boolean {
    return exclusionSet.has(`${clientId}::${month}`);
  }

  function isClientExcludedFromMonths(clientId: string, months: string[]): boolean {
    return months.every(m => exclusionSet.has(`${clientId}::${m}`));
  }

  function getClientRevenue(clientId: string, month: string): number {
    if (isClientExcluded(clientId, month)) return 0;
    const entry = monthlyRevenue.find(r => r.client_id === clientId && r.month === month);
    if (entry) return entry.amount;
    const client = clients.find(c => c.id === clientId);
    return client?.retainer || 0;
  }

  function getMonthExpenses(month: string): MonthlyExpense[] {
    return monthlyExpenses.filter(e => e.month === month);
  }

  function getClientExpenses(clientId: string, months: string[]): ClientExpense[] {
    return clientExpenses.filter(e => e.client_id === clientId && months.includes(e.month) && !isClientExcluded(clientId, e.month));
  }

  function clientVisibleInMonths(c: Client, months: string[]): boolean {
    if (isClientExcludedFromMonths(c.id, months)) return false;
    if (!c.start_date) return true;
    const startMonth = c.start_date.slice(0, 7);
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
  }, [viewMode, selectedYear, selectedMonth, clients, monthlyRevenue, monthlyExpenses, clientExpenses, clientMonthExclusions]);

  const maxRevenue = Math.max(...viewData.clientBreakdown.map(c => c.revenue), 1);
  const currentQuarter = QUARTERS.find(q => q.months.includes(selectedMonth))!;

  // Revenue vs Profit chart data for all 12 months of selected year
  const yearlyChartData = useMemo(() => {
    const revenueData: number[] = [];
    const profitData: number[] = [];
    for (let i = 0; i < 12; i++) {
      const m = monthKey(selectedYear, i);
      const totals = computeTotals([m]);
      revenueData.push(totals.totalRevenue);
      profitData.push(totals.netProfit);
    }
    return { revenueData, profitData };
  }, [selectedYear, clients, monthlyRevenue, monthlyExpenses, clientExpenses, clientMonthExclusions]);

  const activeClientCount = clients.filter(c => c.status === 'Active').length;

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

  async function toggleClientMonthExclusion(clientId: string, month: string) {
    const existing = clientMonthExclusions.find(e => e.client_id === clientId && e.month === month);
    if (existing) {
      await supabase.from('client_month_exclusions').delete().eq('id', existing.id);
    } else {
      await supabase.from('client_month_exclusions').insert([{ client_id: clientId, month }]);
    }
    onReload();
  }

  async function handleSaveNewClient() {
    if (!newClientName.trim()) return;
    setSavingClient(true);
    await supabase.from('clients').insert([{
      name: newClientName.trim(),
      niche: '',
      retainer: parseFloat(newClientRetainer) || 0,
      cost: 0,
      platforms: newClientPlatforms,
      status: newClientStatus,
      start_date: newClientStartDate || null,
      renewal_date: newClientRenewalDate || null,
    }]);
    setSavingClient(false);
    setShowAddClientModal(false);
    setNewClientName('');
    setNewClientStatus('Inactive');
    setNewClientRetainer('');
    setNewClientStartDate('');
    setNewClientPlatforms([]);
    setNewClientRenewalDate('');
    onReload();
  }

  const quarterlyData = useMemo(() => {
    if (viewMode !== 'annual') return [];
    return QUARTERS.map(q => {
      const months = q.months.map(m => monthKey(selectedYear, m));
      const data = computeTotals(months);
      return { ...q, ...data };
    });
  }, [viewMode, selectedYear, clients, monthlyRevenue, monthlyExpenses, clientExpenses, clientMonthExclusions]);

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

  // Get months for current view (for exclusion buttons)
  function getCurrentViewMonths(): string[] {
    if (viewMode === 'month') return [mk];
    if (viewMode === 'quarter') return currentQuarter.months.map(m => monthKey(selectedYear, m));
    return Array.from({ length: 12 }, (_, i) => monthKey(selectedYear, i));
  }

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Finance</div>
          <div style={{ fontSize: 12, color: '#444' }}>Revenue, expenses, and profitability</div>
        </div>
        <button
          className="btn-primary"
          style={{ fontSize: 11, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={() => setShowAddClientModal(true)}
        >
          + Add Client
        </button>
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

      {/* Metrics — including Active Clients stat */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Active Clients</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#6366f1', marginBottom: 3 }}>{activeClientCount}</div>
          <div style={{ fontSize: 11, color: '#444' }}>currently active</div>
        </div>
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

      {/* Revenue vs Net Profit Chart */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#555', marginBottom: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Revenue vs Net Profit — {selectedYear}
        </div>
        <div style={{ height: 220 }}>
          <Bar
            data={{
              labels: MONTHS,
              datasets: [
                {
                  label: 'Revenue',
                  data: yearlyChartData.revenueData,
                  backgroundColor: '#10b98144',
                  borderColor: '#10b981',
                  borderWidth: 1,
                  borderRadius: 3,
                },
                {
                  label: 'Net Profit',
                  data: yearlyChartData.profitData,
                  backgroundColor: '#6366f144',
                  borderColor: '#6366f1',
                  borderWidth: 1,
                  borderRadius: 3,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: {
                legend: {
                  labels: { color: '#555', font: { size: 11 }, boxWidth: 12, padding: 16 },
                },
                tooltip: {
                  backgroundColor: '#0d0d0d',
                  borderColor: '#2a2a2a',
                  borderWidth: 1,
                  titleColor: '#fff',
                  bodyColor: '#ccc',
                  padding: 10,
                  callbacks: {
                    label: (ctx) => `${ctx.dataset.label}: ${fm(ctx.parsed.y)}`,
                  },
                },
              },
              scales: {
                x: {
                  grid: { color: 'rgba(255,255,255,0.03)' },
                  ticks: { color: '#444', font: { size: 10 } },
                },
                y: {
                  grid: { color: 'rgba(255,255,255,0.05)' },
                  ticks: {
                    color: '#444',
                    font: { size: 10 },
                    callback: (val) => fm(val as number),
                  },
                },
              },
            }}
          />
        </div>
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
                          <div style={{ display: 'flex', gap: 4 }}>
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
                            <button
                              className="btn-ghost"
                              style={{ fontSize: 10, padding: '2px 6px', color: '#ef4444', borderColor: '#ef444444' }}
                              title={`Remove ${cr.client.name} from ${MONTHS[selectedMonth]} ${selectedYear}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleClientMonthExclusion(cr.client.id, mk);
                              }}
                            >
                              ✕
                            </button>
                          </div>
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

            {/* Show excluded clients for current month with restore button */}
            {viewMode === 'month' && (() => {
              const excludedClients = clients.filter(c => isClientExcluded(c.id, mk) && !viewData.clientBreakdown.some(cb => cb.client.id === c.id));
              if (excludedClients.length === 0) return null;
              return (
                <div style={{ marginTop: 12, padding: '8px 12px', background: '#0a0a0a', borderRadius: 6, border: '0.5px solid #1a1a1a' }}>
                  <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>
                    Excluded from {MONTHS[selectedMonth]} {selectedYear}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {excludedClients.map(c => (
                      <button
                        key={c.id}
                        className="btn-ghost"
                        style={{ fontSize: 10, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={() => toggleClientMonthExclusion(c.id, mk)}
                        title={`Restore ${c.name} to ${MONTHS[selectedMonth]}`}
                      >
                        <span style={{ color: '#555' }}>+</span> {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
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

      {/* Add Client Modal */}
      {showAddClientModal && (
        <div className="modal-overlay" onClick={() => setShowAddClientModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Add Client</span>
              <button onClick={() => setShowAddClientModal(false)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="form-label">Client Name</label>
                <input className="form-input" value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="e.g. Acme Corp" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="form-label">Status</label>
                  <select className="form-input" value={newClientStatus} onChange={e => setNewClientStatus(e.target.value as 'Active' | 'Inactive' | 'Paused')}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Paused">Paused</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Monthly Retainer ($)</label>
                  <input className="form-input" type="number" value={newClientRetainer} onChange={e => setNewClientRetainer(e.target.value)} placeholder="0" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="form-label">Start Date</label>
                  <input className="form-input" type="date" value={newClientStartDate} onChange={e => setNewClientStartDate(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Renewal Date</label>
                  <input className="form-input" type="date" value={newClientRenewalDate} onChange={e => setNewClientRenewalDate(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="form-label">Platforms</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  {PLATFORM_OPTIONS.map(p => (
                    <button
                      key={p}
                      onClick={() => setNewClientPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: '0.5px solid',
                        borderColor: newClientPlatforms.includes(p) ? '#fff' : '#2a2a2a',
                        background: newClientPlatforms.includes(p) ? '#fff' : 'transparent',
                        color: newClientPlatforms.includes(p) ? '#000' : '#555',
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
              <button className="btn-ghost" onClick={() => setShowAddClientModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveNewClient} disabled={savingClient}>
                {savingClient ? 'Saving...' : 'Add Client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
