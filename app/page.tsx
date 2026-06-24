'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { checkSchema, getMigrationSQL } from '@/lib/setup-db';
import { Client, Post, DriveFolder, SubscriberSnapshot, ResearchItem, StudioVideo, StudioSequence, StudioSession, StudioAdCreative, StudioComment, StudioActivity, StudioQuickLink, StudioDropdownOption, MainPage } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';

import Sidebar from '@/components/Sidebar';
import Dashboard from '@/components/Dashboard';
import ContentTab from '@/components/sub/ContentTab';
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
  drive: 'Assets',
  studio: 'Studio',
};

const PAGE_SUBTITLES: Record<MainPage, string> = {
  dashboard: 'Performance at a glance',
  content: 'Posts & analytics',
  research: 'Ideas & references',
  drive: 'Files & folders',
  studio: 'Review & production',
};

export default function Home() {
  const [client, setClient] = useState<Client | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([]);
  const [subscriberSnapshots, setSubscriberSnapshots] = useState<SubscriberSnapshot[]>([]);
  const [researchItems, setResearchItems] = useState<ResearchItem[]>([]);
  const [studioVideos, setStudioVideos] = useState<StudioVideo[]>([]);
  const [studioSequences, setStudioSequences] = useState<StudioSequence[]>([]);
  const [studioSessions, setStudioSessions] = useState<StudioSession[]>([]);
  const [studioAdCreatives, setStudioAdCreatives] = useState<StudioAdCreative[]>([]);
  const [studioComments, setStudioComments] = useState<StudioComment[]>([]);
  const [studioActivity, setStudioActivity] = useState<StudioActivity[]>([]);
  const [studioQuickLinks, setStudioQuickLinks] = useState<StudioQuickLink[]>([]);
  const [studioDropdownOptions, setStudioDropdownOptions] = useState<StudioDropdownOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState<{ missing: string[]; postColumnsMissing: string[]; researchColumnsMissing: string[]; adColumnsMissing: string[] } | null>(null);
  const [showMigrationSQL, setShowMigrationSQL] = useState(false);

  const [mainPage, setMainPage] = usePersistedState<MainPage>('main_page', 'dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState<boolean>('sidebar_collapsed', false);
  const [theme, setTheme] = useState<'aurora' | 'midnight'>('aurora');

  // Sync theme from storage on mount (the layout script already applied it pre-paint)
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('nathan_theme') : null;
    const initial = stored === 'midnight' ? 'midnight' : 'aurora';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  function toggleTheme() {
    setTheme(prev => {
      const next = prev === 'aurora' ? 'midnight' : 'aurora';
      try { localStorage.setItem('nathan_theme', next); } catch {}
      document.documentElement.setAttribute('data-theme', next);
      return next;
    });
  }

  // Migrate stale persisted page values from prior builds
  useEffect(() => {
    if (!(['dashboard', 'content', 'research', 'drive', 'studio'] as const).includes(mainPage)) {
      setMainPage('dashboard');
    }
  }, [mainPage, setMainPage]);

  const loadData = useCallback(async () => {
    const [c, p, d, ss, ri, sv, sq, sn, ac, cm, av, ql, dr] = await Promise.all([
      safeSelect('clients', 'created_at'),
      safeSelect('posts', 'date', false),
      safeSelect('drive_folders', 'category'),
      safeSelect('subscriber_snapshots', 'date'),
      safeSelect('research_items', 'created_at', false),
      safeSelect('studio_videos', 'created_at', false),
      safeSelect('studio_sequences', 'created_at', false),
      safeSelect('studio_sessions', 'created_at', false),
      safeSelect('studio_ad_creatives', 'created_at', false),
      safeSelect('studio_comments', 'created_at'),
      safeSelect('studio_activity', 'created_at', false),
      safeSelect('studio_quick_links', 'created_at'),
      safeSelect('studio_dropdown_options', 'created_at'),
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
    setDriveFolders(d as DriveFolder[]);
    setSubscriberSnapshots(ss as SubscriberSnapshot[]);
    setResearchItems(ri as ResearchItem[]);
    setStudioVideos(sv as StudioVideo[]);
    setStudioSequences(sq as StudioSequence[]);
    setStudioSessions(sn as StudioSession[]);
    setStudioAdCreatives(ac as StudioAdCreative[]);
    setStudioComments(cm as StudioComment[]);
    setStudioActivity(av as StudioActivity[]);
    setStudioQuickLinks(ql as StudioQuickLink[]);
    setStudioDropdownOptions(dr as StudioDropdownOption[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    checkSchema().then(result => {
      if (result.missing.length > 0 || result.postColumnsMissing.length > 0 || result.researchColumnsMissing.length > 0 || result.adColumnsMissing.length > 0) {
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
          <div style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading...</div>
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
        {schemaMissing && (schemaMissing.missing.length > 0 || schemaMissing.postColumnsMissing.length > 0 || schemaMissing.researchColumnsMissing.length > 0 || schemaMissing.adColumnsMissing.length > 0) && (
          <div style={{ background: '#1a1000', borderBottom: '1px solid #3a2a00', padding: '10px 24px', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: 12 }}>Database setup required</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 8 }}>
                  Missing: {[...schemaMissing.missing, ...schemaMissing.postColumnsMissing.map(c => `posts.${c}`), ...schemaMissing.researchColumnsMissing.map(c => `research_items.${c}`), ...schemaMissing.adColumnsMissing.map(c => `studio_ad_creatives.${c}`)].join(', ')}
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
                      if (result.missing.length === 0 && result.postColumnsMissing.length === 0 && result.researchColumnsMissing.length === 0 && result.adColumnsMissing.length === 0) {
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
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6 }}>Run this SQL in your Supabase SQL Editor (supabase.com &gt; SQL Editor):</div>
                <pre
                  style={{
                    background: 'var(--surface-2)',
                    border: '0.5px solid var(--border)',
                    borderRadius: 6,
                    padding: 12,
                    fontSize: 11,
                    color: 'var(--text-dim)',
                    whiteSpace: 'pre-wrap',
                    maxHeight: 300,
                    overflowY: 'auto',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    navigator.clipboard.writeText(getMigrationSQL(schemaMissing.missing, schemaMissing.postColumnsMissing, schemaMissing.researchColumnsMissing, schemaMissing.adColumnsMissing));
                  }}
                  title="Click to copy"
                >
                  {getMigrationSQL(schemaMissing.missing, schemaMissing.postColumnsMissing, schemaMissing.researchColumnsMissing, schemaMissing.adColumnsMissing)}
                </pre>
                <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 4 }}>Click the SQL block to copy. After running it, click "Re-check" above.</div>
              </div>
            )}
          </div>
        )}

        {/* Page header */}
        {client && (
          <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', padding: '16px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <div className="font-head" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.15, color: 'var(--text)' }}>{PAGE_LABELS[mainPage]}</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2 }}>{PAGE_SUBTITLES[mainPage]}</div>
            </div>
            <div style={{ flex: 1 }} />
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={theme === 'aurora' ? 'Switch to dark' : 'Switch to light'}
              aria-label="Toggle theme"
            >
              {theme === 'aurora' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
              )}
            </button>
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
                adCreatives={studioAdCreatives}
                comments={studioComments}
                activity={studioActivity}
                quickLinks={studioQuickLinks}
                dropdownOptions={studioDropdownOptions}
                onReload={loadData}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
