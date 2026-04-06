'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { checkSchema, getMigrationSQL } from '@/lib/setup-db';
import { Client, Post, Goal, Hook, Format, Pillar, DriveFolder, Expense, MonthlyRevenue, MonthlyExpense, ClientExpense, ClientMonthExclusion, SubscriberSnapshot, MainPage, ClientTab } from '@/lib/types';

import Sidebar from '@/components/Sidebar';
import Overview from '@/components/Overview';
import Finance from '@/components/Finance';
import ClientOverview from '@/components/sub/ClientOverview';
import ContentTab from '@/components/sub/ContentTab';
import OutliersTab from '@/components/sub/OutliersTab';
import GoalsTab from '@/components/sub/GoalsTab';
import HooksTab from '@/components/sub/HooksTab';
import FormatsTab from '@/components/sub/FormatsTab';
import PillarsTab from '@/components/sub/PillarsTab';
import DriveTab from '@/components/sub/DriveTab';
import ClientModal from '@/components/modals/ClientModal';
import ClientSidebar from '@/components/ClientSidebar';

// Helper: query a table, return [] if the table doesn't exist
async function safeSelect(table: string, orderCol: string, ascending = true) {
  const { data, error } = await supabase.from(table).select('*').order(orderCol, { ascending });
  if (error && error.code === 'PGRST205') return []; // table doesn't exist
  return data || [];
}

export type TimePeriod = '30d' | '3m' | 'quarter' | '6m' | 'year' | 'all';

const TIME_PERIOD_LABELS: Record<TimePeriod, string> = {
  '30d': 'Last 30 days',
  '3m': 'Last 3 months',
  'quarter': 'Last quarter',
  '6m': 'Last 6 months',
  'year': 'Last year',
  'all': 'All time',
};

const CLIENT_TABS: { key: ClientTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'content', label: 'Content' },
  { key: 'outliers', label: 'Outliers' },
  { key: 'goals', label: 'Goals' },
  { key: 'hooks', label: 'Hooks' },
  { key: 'formats', label: 'Formats' },
  { key: 'pillars', label: 'Pillars' },
  { key: 'drive', label: 'Drive' },
];

export default function Home() {
  // Data state
  const [clients, setClients] = useState<Client[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [formats, setFormats] = useState<Format[]>([]);
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenue[]>([]);
  const [monthlyExpenses, setMonthlyExpenses] = useState<MonthlyExpense[]>([]);
  const [clientExpenses, setClientExpenses] = useState<ClientExpense[]>([]);
  const [clientMonthExclusions, setClientMonthExclusions] = useState<ClientMonthExclusion[]>([]);
  const [subscriberSnapshots, setSubscriberSnapshots] = useState<SubscriberSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState<{ missing: string[]; clientColumnsMissing: string[]; postColumnsMissing: string[] } | null>(null);
  const [showMigrationSQL, setShowMigrationSQL] = useState(false);

  // Navigation state
  const [mainPage, setMainPage] = useState<MainPage>('overview');
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [clientTab, setClientTab] = useState<ClientTab>('overview');
  const [activePlat, setActivePlat] = useState('All');
  const [showCmp, setShowCmp] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('30d');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Modal state
  const [showClientModal, setShowClientModal] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [sidebarClientId, setSidebarClientId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [c, p, g, h, f, pl, d, e, mr, me, ce, cme, ss] = await Promise.all([
      safeSelect('clients', 'name'),
      safeSelect('posts', 'date', false),
      safeSelect('goals', 'created_at'),
      safeSelect('hooks', 'rating', false),
      safeSelect('formats', 'name'),
      safeSelect('pillars', 'name'),
      safeSelect('drive_folders', 'category'),
      safeSelect('expenses', 'category'),
      safeSelect('monthly_revenue', 'month'),
      safeSelect('monthly_expenses', 'month'),
      safeSelect('client_expenses', 'month'),
      safeSelect('client_month_exclusions', 'month'),
      safeSelect('subscriber_snapshots', 'date'),
    ]);
    setClients(c as Client[]);
    setPosts(p as Post[]);
    setGoals(g as Goal[]);
    setHooks(h as Hook[]);
    setFormats(f as Format[]);
    setPillars(pl as Pillar[]);
    setDriveFolders(d as DriveFolder[]);
    setExpenses(e as Expense[]);
    setMonthlyRevenue(mr as MonthlyRevenue[]);
    setMonthlyExpenses(me as MonthlyExpense[]);
    setClientExpenses(ce as ClientExpense[]);
    setClientMonthExclusions(cme as ClientMonthExclusion[]);
    setSubscriberSnapshots(ss as SubscriberSnapshot[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Check schema on mount, then load data
    checkSchema().then(result => {
      if (result.missing.length > 0 || result.clientColumnsMissing.length > 0 || result.postColumnsMissing.length > 0) {
        setSchemaMissing(result);
      }
    });
    loadData();
  }, [loadData]);

  function handleSelectMain(page: string) {
    setMainPage(page as MainPage);
    setActiveClientId(null);
    setClientTab('overview');
    setActivePlat('All');
  }

  function handleSelectClient(id: string) {
    setMainPage('client');
    setActiveClientId(id);
    setClientTab('overview');
    setActivePlat('All');
  }

  function handleAddClient() {
    setEditClient(null);
    setShowClientModal(true);
  }

  function handleClientSaved() {
    loadData();
  }

  const activeClient = clients.find(c => c.id === activeClientId) || null;
  const clientPlatforms = activeClient?.platforms?.length ? ['All', ...activeClient.platforms] : ['All', 'Instagram', 'TikTok', 'YouTube'];

  async function handleDeleteClient() {
    if (!activeClient) return;
    if (!confirm(`Delete "${activeClient.name}" and all associated data?`)) return;
    await supabase.from('clients').delete().eq('id', activeClient.id);
    setActiveClientId(null);
    setMainPage('overview');
    loadData();
  }

  function renderClientContent() {
    if (!activeClient) return null;
    switch (clientTab) {
      case 'overview':
        return <ClientOverview client={activeClient} posts={posts} goals={goals} pillars={pillars} formats={formats} subscriberSnapshots={subscriberSnapshots} activePlat={activePlat} showCmp={showCmp} timePeriod={timePeriod} />;
      case 'content':
        return <ContentTab client={activeClient} posts={posts} pillars={pillars} formats={formats} activePlat={activePlat} onReload={loadData} />;
      case 'outliers':
        return <OutliersTab client={activeClient} posts={posts} activePlat={activePlat} />;
      case 'goals':
        return <GoalsTab client={activeClient} goals={goals} onReload={loadData} />;
      case 'hooks':
        return <HooksTab client={activeClient} hooks={hooks} onReload={loadData} />;
      case 'formats':
        return <FormatsTab client={activeClient} formats={formats} onReload={loadData} />;
      case 'pillars':
        return <PillarsTab client={activeClient} pillars={pillars} posts={posts} onReload={loadData} />;
      case 'drive':
        return <DriveTab client={activeClient} driveFolders={driveFolders} onReload={loadData} />;
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 8 }}>UNCMMN</div>
          <div style={{ fontSize: 11, color: '#333', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        clients={clients.filter(c => c.status === 'Active')}
        activeId={activeClientId}
        activeMP={mainPage}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(v => !v)}
        onSelectMain={handleSelectMain}
        onSelectClient={handleSelectClient}
        onAddClient={handleAddClient}
      />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Schema migration banner */}
        {schemaMissing && (schemaMissing.missing.length > 0 || schemaMissing.clientColumnsMissing.length > 0 || schemaMissing.postColumnsMissing.length > 0) && (
          <div style={{ background: '#1a1000', borderBottom: '1px solid #3a2a00', padding: '10px 24px', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: 12 }}>Database setup required</span>
                <span style={{ color: '#888', fontSize: 11, marginLeft: 8 }}>
                  Missing: {[...schemaMissing.missing, ...schemaMissing.clientColumnsMissing.map(c => `clients.${c}`), ...schemaMissing.postColumnsMissing.map(c => `posts.${c}`)].join(', ')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 10, padding: '4px 10px', color: '#f59e0b', borderColor: '#3a2a00' }}
                  onClick={() => setShowMigrationSQL(!showMigrationSQL)}
                >
                  {showMigrationSQL ? 'Hide SQL' : 'Show SQL'}
                </button>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 10, padding: '4px 10px' }}
                  onClick={() => {
                    checkSchema().then(result => {
                      if (result.missing.length === 0 && result.clientColumnsMissing.length === 0 && result.postColumnsMissing.length === 0) {
                        setSchemaMissing(null);
                        setShowMigrationSQL(false);
                        loadData();
                      } else {
                        setSchemaMissing(result);
                      }
                    });
                  }}
                >
                  Re-check
                </button>
              </div>
            </div>
            {showMigrationSQL && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, color: '#888', marginBottom: 6 }}>Run this SQL in your Supabase SQL Editor (supabase.com &gt; SQL Editor):</div>
                <pre
                  style={{
                    background: '#111',
                    border: '0.5px solid #2a2a2a',
                    borderRadius: 6,
                    padding: 12,
                    fontSize: 11,
                    color: '#ccc',
                    whiteSpace: 'pre-wrap',
                    maxHeight: 300,
                    overflowY: 'auto',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    navigator.clipboard.writeText(getMigrationSQL(schemaMissing.missing, schemaMissing.clientColumnsMissing, schemaMissing.postColumnsMissing));
                  }}
                  title="Click to copy"
                >
                  {getMigrationSQL(schemaMissing.missing, schemaMissing.clientColumnsMissing, schemaMissing.postColumnsMissing)}
                </pre>
                <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>Click the SQL block to copy. After running it, click "Re-check" above.</div>
              </div>
            )}
          </div>
        )}

        {/* Client header + tabs */}
        {mainPage === 'client' && activeClient && (
          <div style={{ borderBottom: '0.5px solid #1a1a1a', padding: '14px 24px 0', flexShrink: 0 }}>
            {/* Client name + actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{activeClient.name}</div>
                {activeClient.niche && (
                  <span style={{ fontSize: 11, color: '#444', padding: '2px 8px', border: '0.5px solid #2a2a2a', borderRadius: 4 }}>{activeClient.niche}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => { setEditClient(activeClient); setShowClientModal(true); }}
                >
                  Edit
                </button>
                <button
                  className="btn-danger"
                  style={{ padding: '4px 10px' }}
                  onClick={handleDeleteClient}
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Platform filter + Time period + Comparison toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {clientPlatforms.map(p => (
                  <button
                    key={p}
                    className={`subtab${activePlat === p ? ' active' : ''}`}
                    onClick={() => setActivePlat(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {clientTab === 'overview' && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select
                    className="form-input"
                    style={{ width: 'auto', padding: '4px 8px', fontSize: 11, background: '#111', border: '0.5px solid #2a2a2a', borderRadius: 6, color: '#ccc' }}
                    value={timePeriod}
                    onChange={e => setTimePeriod(e.target.value as TimePeriod)}
                  >
                    {(Object.entries(TIME_PERIOD_LABELS) as [TimePeriod, string][]).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <button
                    className={`btn-compare${showCmp ? ' active' : ''}`}
                    onClick={() => setShowCmp(v => !v)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    vs Previous Period
                  </button>
                </div>
              )}
            </div>

            {/* Client tabs */}
            <div style={{ display: 'flex', gap: 2, marginBottom: -1 }}>
              {CLIENT_TABS.map(tab => (
                <button
                  key={tab.key}
                  className={`subtab${clientTab === tab.key ? ' active' : ''}`}
                  onClick={() => setClientTab(tab.key)}
                  style={{ borderRadius: '6px 6px 0 0', padding: '6px 12px' }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main content area */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {mainPage === 'overview' && (
            <Overview
              clients={clients}
              posts={posts}
              onSelectClient={handleSelectClient}
              onOpenSidebar={(id: string) => setSidebarClientId(id)}
            />
          )}
          {mainPage === 'finance' && (
            <Finance
              clients={clients}
              monthlyRevenue={monthlyRevenue}
              monthlyExpenses={monthlyExpenses}
              clientExpenses={clientExpenses}
              clientMonthExclusions={clientMonthExclusions}
              onReload={loadData}
              onOpenSidebar={(id: string) => setSidebarClientId(id)}
            />
          )}
          {mainPage === 'client' && activeClient && (
            <div style={{ padding: '16px 24px' }}>
              {renderClientContent()}
            </div>
          )}
        </div>
      </div>

      {/* Client modal */}
      {showClientModal && (
        <ClientModal
          client={editClient}
          onClose={() => setShowClientModal(false)}
          onSaved={handleClientSaved}
        />
      )}

      {/* Client sidebar */}
      {sidebarClientId && (() => {
        const sidebarClient = clients.find(c => c.id === sidebarClientId);
        if (!sidebarClient) return null;
        return (
          <ClientSidebar
            client={sidebarClient}
            clientExpenses={clientExpenses}
            monthlyRevenue={monthlyRevenue}
            onClose={() => setSidebarClientId(null)}
            onReload={loadData}
          />
        );
      })()}
    </div>
  );
}
