'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Role, canAccess } from '@/lib/auth-config';
import { checkSchema, getMigrationSQL } from '@/lib/setup-db';
import { Client, Post, DriveFolder, SubscriberSnapshot, ResearchItem, StudioVideo, StudioSequence, StudioSession, StudioAdCreative, StudioComment, StudioActivity, StudioQuickLink, StudioDropdownOption, CustomProperty, CustomPropertyOption, Profile, ClipperAccount, ClipperContent, TrialReelSource, TrialReelProduction, ClipSource, ClipSnippet, MainPage } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';

import Sidebar from '@/components/Sidebar';
import Dashboard from '@/components/Dashboard';
import ContentTab from '@/components/sub/ContentTab';
import ResearchTab from '@/components/sub/ResearchTab';
import DriveTab from '@/components/sub/DriveTab';
import StudioTab from '@/components/sub/StudioTab';
import DisplayNamePrompt from '@/components/DisplayNamePrompt';
import AccountPanel from '@/components/AccountPanel';
import AssigneeSettings from '@/components/sub/studio/AssigneeSettings';
import ClippersTab from '@/components/sub/ClippersTab';
import TrialReelsTab from '@/components/sub/TrialReelsTab';
import ClipLibraryTab from '@/components/sub/ClipLibraryTab';
import { profileName } from '@/lib/profile-name';

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
  trialreels: 'Trial Reels',
  cliplibrary: 'Clip Library',
  clippers: 'Clippers',
};

const PAGE_SUBTITLES: Record<MainPage, string> = {
  dashboard: 'Performance at a glance',
  content: 'Posts & analytics',
  research: 'Ideas & references',
  drive: 'Files & folders',
  studio: 'Review & production',
  trialreels: 'Recreate high-converting reels',
  cliplibrary: 'Clips from long-form content',
  clippers: 'Distribution team',
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
  const [customProperties, setCustomProperties] = useState<CustomProperty[]>([]);
  const [customPropOptions, setCustomPropOptions] = useState<CustomPropertyOption[]>([]);
  const [studioProfiles, setStudioProfiles] = useState<Profile[]>([]);
  const [clipperAccounts, setClipperAccounts] = useState<ClipperAccount[]>([]);
  const [clipperContent, setClipperContent] = useState<ClipperContent[]>([]);
  const [trialReelSources, setTrialReelSources] = useState<TrialReelSource[]>([]);
  const [trialReelProductions, setTrialReelProductions] = useState<TrialReelProduction[]>([]);
  const [clipSources, setClipSources] = useState<ClipSource[]>([]);
  const [clipSnippets, setClipSnippets] = useState<ClipSnippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState<{ missing: string[]; postColumnsMissing: string[]; researchColumnsMissing: string[]; adColumnsMissing: string[]; sessionColumnsMissing: string[]; dropdownColsMissing: boolean } | null>(null);
  const [showMigrationSQL, setShowMigrationSQL] = useState(false);

  const [mainPage, setMainPage] = usePersistedState<MainPage>('main_page', 'dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState<boolean>('sidebar_collapsed', false);
  const [theme, setTheme] = useState<'aurora' | 'midnight'>('aurora');
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  // Read-only: email for the dashboard greeting. Independent of role/access logic.
  const [userEmail, setUserEmail] = useState<string | null>(null);
  // Current user's id, used only to surface their own profile (display name).
  // Does not affect role or tab access.
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [adminUsersOpen, setAdminUsersOpen] = useState(false);
  // Deep link from a Slack ping ("/studio/video/<id>" → "/?item=video:<id>"):
  // jump to Studio and open that row's side panel. Read from window (not
  // useSearchParams) to keep the root statically prerendered.
  const [deepLink, setDeepLink] = useState<{ type: 'video' | 'ad' | 'story' | 'filming'; id: string } | null>(null);
  // Trial Reels deep link: a production row id ("/?item=trialreel:<id>") opens the
  // Trial Reels tab → Production Board with that reel's detail panel.
  const [trialReelOpenId, setTrialReelOpenId] = useState<string | undefined>(undefined);

  // Parse a deep-link item param once on mount, route to the right tab, then strip
  // it from the URL so a refresh doesn't re-trigger it. Also supports "?view=<tab>"
  // for links that just switch tabs (e.g. the Trial Reels queue digest → board).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    if (view === 'trialreels') {
      setMainPage('trialreels');
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }
    const item = params.get('item');
    if (!item) return;
    const sep = item.indexOf(':');
    const type = sep >= 0 ? item.slice(0, sep) : '';
    const id = sep >= 0 ? item.slice(sep + 1) : '';
    if (type === 'trialreel' && id) {
      setMainPage('trialreels');
      setTrialReelOpenId(id);
      window.history.replaceState(null, '', window.location.pathname);
    } else if ((type === 'video' || type === 'ad' || type === 'story' || type === 'filming') && id) {
      setMainPage('studio');
      setDeepLink({ type, id });
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [setMainPage]);

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

  // Resolve the signed-in user's role (middleware already guarantees a session here)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (cancelled) return;
      setCurrentUserId(user.id);
      // Recognize the new 'clipper' tier; anything else stays exactly as before
      // (admin → admin, all others → editor). Admin/editor behavior unchanged.
      setRole(profile?.role === 'admin' ? 'admin' : profile?.role === 'clipper' ? 'clipper' : 'editor');
    })();
    return () => { cancelled = true; };
  }, [router]);

  // Read-only greeting source: pull the email from the already-established auth
  // session. Purely presentational — does not affect role or tab visibility.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!cancelled) setUserEmail(user?.email ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  // Layer 2 — editors are confined to their allowed tabs; bounce anything else to Studio
  useEffect(() => {
    if (role === 'editor' && !canAccess('editor', mainPage)) {
      setMainPage('studio');
    }
  }, [role, mainPage, setMainPage]);

  // Migrate stale persisted page values from prior builds
  useEffect(() => {
    if (!(['dashboard', 'content', 'research', 'drive', 'studio', 'clippers', 'trialreels', 'cliplibrary'] as const).includes(mainPage)) {
      setMainPage('dashboard');
    }
  }, [mainPage, setMainPage]);

  const loadData = useCallback(async () => {
    const [c, p, d, ss, ri, sv, sq, sn, ac, cm, av, ql, dr, cp, co, pr] = await Promise.all([
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
      safeSelect('custom_properties', 'position'),
      safeSelect('custom_property_options', 'position'),
      safeSelect('profiles', 'created_at'),
    ]);

    const [ca, cc, trs, trp, cls, cln] = await Promise.all([
      safeSelect('clipper_accounts', 'created_at'),
      safeSelect('clipper_content', 'created_at', false),
      safeSelect('trial_reel_source', 'created_at', false),
      safeSelect('trial_reel_production', 'created_at', false),
      safeSelect('clip_source', 'name'),
      safeSelect('clip_snippet', 'created_at'),
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
    setCustomProperties(cp as CustomProperty[]);
    setCustomPropOptions(co as CustomPropertyOption[]);
    setStudioProfiles(pr as Profile[]);
    setClipperAccounts(ca as ClipperAccount[]);
    setClipperContent(cc as ClipperContent[]);
    setTrialReelSources(trs as TrialReelSource[]);
    setTrialReelProductions(trp as TrialReelProduction[]);
    setClipSources(cls as ClipSource[]);
    setClipSnippets(cln as ClipSnippet[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    checkSchema().then(result => {
      if (result.missing.length > 0 || result.postColumnsMissing.length > 0 || result.researchColumnsMissing.length > 0 || result.adColumnsMissing.length > 0 || result.sessionColumnsMissing.length > 0 || result.dropdownColsMissing) {
        setSchemaMissing(result);
      }
    });
    loadData();
  }, [loadData]);

  if (loading || !role) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 8 }}>NATHAN</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading...</div>
        </div>
      </div>
    );
  }

  // The signed-in user's own profile row (for display name editing / first-login
  // prompt). Null until both the auth id and profiles have loaded.
  const currentProfile = currentUserId ? studioProfiles.find(p => p.id === currentUserId) ?? null : null;
  const currentName = currentProfile ? profileName(currentProfile) : (userEmail ?? 'Account');

  // Clipper tier (Phase 1): the clipper-facing portal ships in Phase 2. For now a
  // clipper sees NO admin surface at all — no sidebar, no tabs — just a minimal
  // placeholder with sign-out. This guarantees clippers can't reach Studio, the
  // content pipeline, Manage all users, or the Clippers management tab.
  if (role === 'clipper') {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', maxWidth: 360, padding: 24 }}>
          <div className="font-head" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 8 }}>UNCMMN OS</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Your clipper portal is coming soon ✂</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 20 }}>You&apos;re all set up{currentProfile ? `, ${currentName}` : ''}. Hang tight — your dashboard is on the way.</div>
          <button className="btn-ghost" style={{ fontSize: 12, padding: '8px 16px' }} onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  }
  // First-login: prompt until the user has actually set a display name.
  const needsDisplayName = !!currentProfile && !(currentProfile.display_name && currentProfile.display_name.trim());

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        activeMP={mainPage}
        collapsed={sidebarCollapsed}
        role={role}
        userName={currentName}
        onToggleCollapse={() => setSidebarCollapsed(v => !v)}
        onSelectMain={setMainPage}
        onOpenAccount={() => setAccountOpen(true)}
        onLogout={signOut}
      />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {schemaMissing && (schemaMissing.missing.length > 0 || schemaMissing.postColumnsMissing.length > 0 || schemaMissing.researchColumnsMissing.length > 0 || schemaMissing.adColumnsMissing.length > 0 || schemaMissing.sessionColumnsMissing.length > 0 || schemaMissing.dropdownColsMissing) && (
          <div style={{ background: '#1a1000', borderBottom: '1px solid #3a2a00', padding: '10px 24px', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: 12 }}>Database setup required</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 8 }}>
                  Missing: {[...schemaMissing.missing, ...schemaMissing.postColumnsMissing.map(c => `posts.${c}`), ...schemaMissing.researchColumnsMissing.map(c => `research_items.${c}`), ...schemaMissing.adColumnsMissing.map(c => `studio_ad_creatives.${c}`), ...schemaMissing.sessionColumnsMissing.map(c => `studio_sessions.${c}`), ...(schemaMissing.dropdownColsMissing ? ['studio_dropdown_options.color'] : [])].join(', ')}
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
                      if (result.missing.length === 0 && result.postColumnsMissing.length === 0 && result.researchColumnsMissing.length === 0 && result.adColumnsMissing.length === 0 && result.sessionColumnsMissing.length === 0 && !result.dropdownColsMissing) {
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
                    navigator.clipboard.writeText(getMigrationSQL(schemaMissing.missing, schemaMissing.postColumnsMissing, schemaMissing.researchColumnsMissing, schemaMissing.adColumnsMissing, schemaMissing.sessionColumnsMissing, schemaMissing.dropdownColsMissing));
                  }}
                  title="Click to copy"
                >
                  {getMigrationSQL(schemaMissing.missing, schemaMissing.postColumnsMissing, schemaMissing.researchColumnsMissing, schemaMissing.adColumnsMissing, schemaMissing.sessionColumnsMissing, schemaMissing.dropdownColsMissing)}
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
              userEmail={userEmail}
              userName={currentProfile ? currentName : null}
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
                properties={customProperties}
                customOptions={customPropOptions}
                profiles={studioProfiles}
                isAdmin={role === 'admin'}
                deepLink={deepLink}
                onDeepLinkConsumed={() => setDeepLink(null)}
                onReload={loadData}
              />
            </div>
          )}
          {client && mainPage === 'trialreels' && (role === 'admin' || role === 'editor') && (
            <div style={{ padding: '16px 24px' }}>
              <TrialReelsTab
                sources={trialReelSources}
                productions={trialReelProductions}
                comments={studioComments}
                activity={studioActivity}
                profiles={studioProfiles}
                isAdmin={role === 'admin'}
                currentUserId={currentUserId}
                openItemId={trialReelOpenId}
                onDeepLinkConsumed={() => setTrialReelOpenId(undefined)}
                onReload={loadData}
              />
            </div>
          )}
          {client && mainPage === 'cliplibrary' && role === 'admin' && (
            <div style={{ padding: '16px 24px' }}>
              <ClipLibraryTab
                sources={clipSources}
                snippets={clipSnippets}
                onReload={loadData}
              />
            </div>
          )}
          {client && mainPage === 'clippers' && role === 'admin' && (
            <div style={{ padding: '16px 24px' }}>
              <ClippersTab
                profiles={studioProfiles}
                accounts={clipperAccounts}
                content={clipperContent}
                onReload={loadData}
              />
            </div>
          )}
        </div>
      </div>

      {/* First-login: force a display name before anything else is usable */}
      {needsDisplayName && <DisplayNamePrompt onSaved={loadData} />}

      {/* Current user's account panel (opened from the sidebar) */}
      {accountOpen && currentProfile && (
        <AccountPanel
          profile={currentProfile}
          email={userEmail}
          isAdmin={role === 'admin'}
          onClose={() => setAccountOpen(false)}
          onSaved={loadData}
          onManageUsers={() => { setAccountOpen(false); setAdminUsersOpen(true); }}
        />
      )}

      {/* Admin: manage every user's display name + assignable (relocated here
          from the old Video Review "Users" button) */}
      {adminUsersOpen && role === 'admin' && (
        <AssigneeSettings profiles={studioProfiles} clipperAccounts={clipperAccounts} currentUserId={currentUserId} onClose={() => setAdminUsersOpen(false)} onReload={loadData} />
      )}
    </div>
  );
}
