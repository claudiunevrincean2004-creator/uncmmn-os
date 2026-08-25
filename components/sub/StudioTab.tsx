'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StudioVideo, StudioSequence, StudioSession, StudioAdCreative, StudioComment, StudioActivity, StudioQuickLink, StudioDropdownOption, CustomProperty, CustomPropertyOption, Profile } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { todayISO } from '@/lib/studio';
import VideoReview from './studio/VideoReview';
import StorySequences from './studio/StorySequences';
import FilmingSessions from './studio/FilmingSessions';
import AdCreative from './studio/AdCreative';

type SubTab = 'videos' | 'sequences' | 'sessions' | 'ads';

// One chip in the summary row above the sub-tabs: a coloured dot, the count, and
// a lower-case label ("6 ready to edit").
interface StatPill { label: string; value: number; color: string }

const SUBTABS: { key: SubTab; label: string }[] = [
  { key: 'videos', label: 'Video Review' },
  { key: 'sequences', label: 'Story Sequences' },
  { key: 'sessions', label: 'Filming Sessions' },
  { key: 'ads', label: 'Ad Creative' },
];

interface Props {
  videos: StudioVideo[];
  sequences: StudioSequence[];
  sessions: StudioSession[];
  adCreatives: StudioAdCreative[];
  comments: StudioComment[];
  activity: StudioActivity[];
  quickLinks: StudioQuickLink[];
  dropdownOptions: StudioDropdownOption[];
  properties: CustomProperty[];
  customOptions: CustomPropertyOption[];
  profiles: Profile[];
  isAdmin: boolean;
  deepLink?: { type: 'video' | 'ad' | 'story' | 'filming'; id: string } | null;
  onDeepLinkConsumed?: () => void;
  onReload: () => void;
}

export default function StudioTab({ videos, sequences, sessions, adCreatives, comments, activity, quickLinks, dropdownOptions, properties, customOptions, profiles, isAdmin, deepLink, onDeepLinkConsumed, onReload }: Props) {
  const [sub, setSub] = usePersistedState<SubTab>('studio_subtab', 'videos');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // A deep link (from a Slack ping) selects the matching sub-tab; the child then
  // opens the row's side panel via openItemId.
  useEffect(() => {
    if (!deepLink) return;
    const map: Record<string, SubTab> = { video: 'videos', ad: 'ads', story: 'sequences', filming: 'sessions' };
    setSub(map[deepLink.type]);
  }, [deepLink, setSub]);

  // Pipeline counts for the Video Review pill row.
  const overviewItems: StatPill[] = useMemo(() => [
    { label: 'ready to edit', value: videos.filter(v => v.status === 'Ready to Edit').length, color: '#10b981' },
    { label: 'in editing', value: videos.filter(v => v.status === 'Editing').length, color: '#f59e0b' },
    { label: 'posted', value: videos.filter(v => v.status === 'Posted').length, color: '#14b8a6' },
    { label: 'with revisions', value: videos.filter(v => (v.revision_count || 0) > 0).length, color: '#8b5cf6' },
  ], [videos]);

  // Filming Sessions: what's still ahead to film, and what shipped this month.
  const sessionOverviewItems: StatPill[] = useMemo(() => {
    const month = todayISO().slice(0, 7); // YYYY-MM
    return [
      { label: 'planned', value: sessions.filter(s => s.status === 'Planned').length, color: '#3b82f6' },
      { label: 'ready to film', value: sessions.filter(s => s.status === 'Ready to Film').length, color: '#eab308' },
      { label: 'filmed this month', value: sessions.filter(s => s.status === 'Filmed' && (s.date || '').slice(0, 7) === month).length, color: '#10b981' },
    ];
  }, [sessions]);

  // Story Sequences. "In progress" = anything not yet in a done/approved state.
  // Unknown status names simply don't match, leaving 0.
  const sequenceOverviewItems: StatPill[] = useMemo(() => {
    const month = todayISO().slice(0, 7); // YYYY-MM
    const DONE = ['Approved', 'Posted'];
    return [
      { label: 'in progress', value: sequences.filter(s => !DONE.includes(s.status)).length, color: '#8b5cf6' },
      { label: 'approved', value: sequences.filter(s => s.status === 'Approved').length, color: '#10b981' },
      { label: 'this month', value: sequences.filter(s => ((s.created_at || s.scheduled_date) || '').slice(0, 7) === month).length, color: '#14b8a6' },
    ];
  }, [sequences]);

  // Ad Creative, counted from real status values. Unknown status names simply
  // don't match, leaving the relevant pill at 0.
  const adOverviewItems: StatPill[] = useMemo(() => [
    { label: 'ready for review', value: adCreatives.filter(a => a.status === 'Ready for Review').length, color: '#eab308' },
    { label: 'testing', value: adCreatives.filter(a => a.status === 'Testing').length, color: '#8b5cf6' },
    { label: 'winners', value: adCreatives.filter(a => a.status === 'Winner').length, color: '#10b981' },
    { label: 'total creatives', value: adCreatives.length, color: '#6b7280' },
  ], [adCreatives]);

  const activeOverview =
    sub === 'sessions' ? sessionOverviewItems
    : sub === 'sequences' ? sequenceOverviewItems
    : sub === 'ads' ? adOverviewItems
    : overviewItems;

  return (
    <div style={{ position: 'relative' }}>
      {/* Status summary — compact pills, one per meaningful state of the active tab */}
      <div className="stat-pills">
        {activeOverview.map(item => (
          <div key={item.label} className="stat-pill">
            <span className="stat-pill-dot" style={{ background: item.color }} />
            <span className="stat-pill-num">{item.value}</span>
            <span className="stat-pill-label">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="subtab-row">
        {SUBTABS.map(t => (
          <button key={t.key} className={`subtab-underline${sub === t.key ? ' active' : ''}`} onClick={() => setSub(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'videos' && <VideoReview videos={videos} comments={comments} activity={activity} quickLinks={quickLinks} dropdownOptions={dropdownOptions} profiles={profiles} isAdmin={isAdmin} openItemId={deepLink?.type === 'video' ? deepLink.id : undefined} onOpened={onDeepLinkConsumed} onReload={onReload} />}
      {sub === 'sequences' && <StorySequences sequences={sequences} comments={comments} activity={activity} dropdownOptions={dropdownOptions} properties={properties} customOptions={customOptions} profiles={profiles} isAdmin={isAdmin} openItemId={deepLink?.type === 'story' ? deepLink.id : undefined} onOpened={onDeepLinkConsumed} onReload={onReload} />}
      {sub === 'sessions' && <FilmingSessions sessions={sessions} comments={comments} activity={activity} dropdownOptions={dropdownOptions} properties={properties} customOptions={customOptions} profiles={profiles} isAdmin={isAdmin} openItemId={deepLink?.type === 'filming' ? deepLink.id : undefined} onOpened={onDeepLinkConsumed} onReload={onReload} />}
      {sub === 'ads' && <AdCreative adCreatives={adCreatives} comments={comments} activity={activity} quickLinks={quickLinks} dropdownOptions={dropdownOptions} properties={properties} customOptions={customOptions} profiles={profiles} isAdmin={isAdmin} openItemId={deepLink?.type === 'ad' ? deepLink.id : undefined} onOpened={onDeepLinkConsumed} onReload={onReload} showToast={showToast} />}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: 'var(--surface)',
            border: '0.5px solid #ec4899',
            borderRadius: 8,
            padding: '10px 16px',
            fontSize: 12,
            color: 'var(--text)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            animation: 'slideInRight 0.2s ease',
          }}
        >
          <span style={{ color: '#ec4899' }}>✦</span>
          {toast}
        </div>
      )}
    </div>
  );
}
