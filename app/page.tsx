'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Client, Post, Goal, Hook, Format, Pillar, DriveFolder, Expense, MonthlyRevenue, MonthlyExpense, MainPage, ClientTab } from '@/lib/types';

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
  const [loading, setLoading] = useState(true);

  // Navigation state
  const [mainPage, setMainPage] = useState<MainPage>('overview');
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [clientTab, setClientTab] = useState<ClientTab>('overview');
  const [activePlat, setActivePlat] = useState('All');
  const [showCmp, setShowCmp] = useState(false);

  // Modal state
  const [showClientModal, setShowClientModal] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);

  const loadData = useCallback(async () => {
    const [
      { data: c },
      { data: p },
      { data: g },
      { data: h },
      { data: f },
      { data: pl },
      { data: d },
      { data: e },
      { data: mr },
      { data: me },
    ] = await Promise.all([
      supabase.from('clients').select('*').order('name'),
      supabase.from('posts').select('*').order('date', { ascending: false }),
      supabase.from('goals').select('*').order('created_at'),
      supabase.from('hooks').select('*').order('rating', { ascending: false }),
      supabase.from('formats').select('*').order('name'),
      supabase.from('pillars').select('*').order('name'),
      supabase.from('drive_folders').select('*').order('category'),
      supabase.from('expenses').select('*').order('category'),
      supabase.from('monthly_revenue').select('*').order('month'),
      supabase.from('monthly_expenses').select('*').order('month'),
    ]);
    setClients(c || []);
    setPosts(p || []);
    setGoals(g || []);
    setHooks(h || []);
    setFormats(f || []);
    setPillars(pl || []);
    setDriveFolders(d || []);
    setExpenses(e || []);
    setMonthlyRevenue(mr || []);
    setMonthlyExpenses(me || []);
    setLoading(false);
  }, []);

  useEffect(() => {
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
        return <ClientOverview client={activeClient} posts={posts} goals={goals} pillars={pillars} formats={formats} activePlat={activePlat} showCmp={showCmp} />;
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
        clients={clients}
        activeId={activeClientId}
        activeMP={mainPage}
        onSelectMain={handleSelectMain}
        onSelectClient={handleSelectClient}
        onAddClient={handleAddClient}
      />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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

            {/* Platform filter + Comparison toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
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
                <button
                  className={`subtab${showCmp ? ' active' : ''}`}
                  onClick={() => setShowCmp(v => !v)}
                  style={{ fontSize: 10 }}
                >
                  vs Prev Month
                </button>
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
              pillars={pillars}
              formats={formats}
              onSelectClient={handleSelectClient}
            />
          )}
          {mainPage === 'finance' && (
            <Finance
              clients={clients}
              monthlyRevenue={monthlyRevenue}
              monthlyExpenses={monthlyExpenses}
              onReload={loadData}
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
    </div>
  );
}
