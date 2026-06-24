'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { checkSchema, getMigrationSQL } from '@/lib/setup-db';
import { Client, Post, Goal, DriveFolder, SubscriberSnapshot, ResearchItem, StudioVideo, StudioSequence, StudioSession, MainPage } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';

import Sidebar from '@/components/Sidebar';
import Dashboard from '@/components/Dashboard';
import ContentTab from '@/components/sub/ContentTab';
import GoalsTab from '@/components/sub/GoalsTab';
import ResearchTab from '@/components/sub/ResearchTab';
import DriveTab from '@/components/sub/DriveTab';
import StudioTab from '@/components/sub/StudioTab';

async function safeSelect(table: string, orderCol: string, ascending = true) {
  const { data, error } = await supabase.from(table).select('*').order(orderCol, { ascending });
  if (error && error.code === 'PGRST205') return [];
  if (error) {
    console.warn(`[safeSelect] Error querying "${table}":`, error.message, error.code);
    return [];
  }
  return data || [];
}

const PAGE_LABELS: Record<MainPage, string> = {
  dashboard: 'Dashboard',
  content: 'Content',
  research: 'Research',
  goals: 'Goals',
  drive: 'Drive',
  studio: 'Studio',
};

export default function Home() {
  const [client, setClient] = useState<Client | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([]);
  const [subscriberSnapshots, setSubscriberSnapshots] = useState<SubscriberSnapshot[]>([]);
  const [researchItems, setResearchItems] = useState<ResearchItem[]>([]);
  const [studioVideos, setStudioVideos] = useState<StudioVideo[]>([]);
  const [studioSequences, setStudioSequences] = useState<StudioSequence[]>([]);
  const [studioSessions, setStudioSessions] = useState<StudioSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState<{ missing: string[]; postColumnsMissing: string[]; researchColumnsMissing: string[] } | null>(null);
  const [showMigrationSQL, setShowMigrationSQL] = useState(false);

  const [mainPage, setMainPage] = usePersistedState<MainPage>('main_page', 'dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState<boolean>('sidebar_collapsed', false);

  // Migrate stale persisted page values from prior builds
  useEffect(() => {
    if (!(['dashboard', 'content', 'research', 'goals', 'drive', 'studio'] as const).includes(mainPage)) {
      setMainPage('dashboard');
    }
  }, [mainPage, setMainPage]);

  const loadData = useCallback(async () => {
    const [c, p, g, d, ss, ri, sv, sq, sn] = await Promise.all([
      safeSelect('clients', 'created_at'),
      safeSelect('posts', 'date', false),
      safeSelect('goals', 'created_at'),
      safeSelect('drive_folders', 'category'),
      safeSelect('subscriber_snapshots', 'date'),
      safeSelect('research_items', 'created_at', false),
      safeSelect('studio_videos', 'created_at', false),
      safeSelect('studio_sequences', 'created_at', false),
      safeSelect('studio_sessions', 'created_at', false),
    ]);

    let active = (c as Client[])[0] || null;
    // Auto-provision Nathan if no client exists
    if (!active && (c as Client[]).length === 0) {
      const { data: created } = await supabase.from('clients').insert([{
        name: 'Nathan Nazareth',
        niche: 'Creator',
        platforms: ['TikTok', 'YouTube'],
      }]).select().single();
      if (created) active = created as Client;
    }

    setClient(active);
    setPosts(p as Post[]);
    setGoals(g as Goal[]);
    setDriveFolders(d as DriveFolder[]);
    setSubscriberSnapshots(ss as SubscriberSnapshot[]);
    setResearchItems(ri as ResearchItem[]);
    setStudioVideos(sv as StudioVideo[]);
    setStudioSequences(sq as StudioSequence[]);
    setStudioSessions(sn as StudioSession[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    checkSchema().then(result => {
      if (result.missing.length > 0 || result.postColumnsMissing.length > 0 || result.researchColumnsMissing.length > 0) {
        setSchemaMissing(result);
      }
    });
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 8 }}>NATHAN</div>
          <div style={{ fontSize: 11, color: '#333', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        activeMP={mainPage}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(v => !v)}
        onSelectMain={setMainPage}
      />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {schemaMissing && (schemaMissing.missing.length > 0 || schemaMissing.postColumnsMissing.length > 0 || schemaMissing.researchColumnsMissing.length > 0) && (
          <div style={{ background: '#1a1000', borderBottom: '1px solid #3a2a00', padding: '10px 24px', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: 12 }}>Database setup required</span>
                <span style={{ color: '#888', fontSize: 11, marginLeft: 8 }}>
                  Missing: {[...schemaMissing.missing, ...schemaMissing.postColumnsMissing.map(c => `posts.${c}`), ...schemaMissing.researchColumnsMissing.map(c => `research_items.${c}`)].join(', ')}
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
                      if (result.missing.length === 0 && result.postColumnsMissing.length === 0 && result.researchColumnsMissing.length === 0) {
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
                    navigator.clipboard.writeText(getMigrationSQL(schemaMissing.missing, schemaMissing.postColumnsMissing, schemaMissing.researchColumnsMissing));
                  }}
                  title="Click to copy"
                >
                  {getMigrationSQL(schemaMissing.missing, schemaMissing.postColumnsMissing, schemaMissing.researchColumnsMissing)}
                </pre>
                <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>Click the SQL block to copy. After running it, click "Re-check" above.</div>
              </div>
            )}
          </div>
        )}

        {/* Page header */}
        {client && (
          <div style={{ borderBottom: '0.5px solid #1a1a1a', padding: '14px 24px', flexShrink: 0, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, color: '#888', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{PAGE_LABELS[mainPage]}</div>
            <div style={{ fontSize: 11, color: '#444' }}>{client.name}</div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {client && mainPage === 'dashboard' && (
            <Dashboard
              client={client}
              posts={posts}
              subscriberSnapshots={subscriberSnapshots}
              onReload={loadData}
            />
          )}
          {client && mainPage === 'content' && (
            <div style={{ padding: '16px 24px' }}>
              <ContentTab
                client={client}
                posts={posts}
                subscriberSnapshots={subscriberSnapshots}
                onReload={loadData}
              />
            </div>
          )}
          {client && mainPage === 'research' && (
            <div style={{ padding: '16px 24px' }}>
              <ResearchTab client={client} items={researchItems} onReload={loadData} />
            </div>
          )}
          {client && mainPage === 'goals' && (
            <div style={{ padding: '16px 24px' }}>
              <GoalsTab client={client} goals={goals} onReload={loadData} />
            </div>
          )}
          {client && mainPage === 'drive' && (
            <div style={{ padding: '16px 24px' }}>
              <DriveTab client={client} driveFolders={driveFolders} onReload={loadData} />
            </div>
          )}
          {client && mainPage === 'studio' && (
            <div style={{ padding: '16px 24px' }}>
              <StudioTab
                videos={studioVideos}
                sequences={studioSequences}
                sessions={studioSessions}
                onReload={loadData}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
