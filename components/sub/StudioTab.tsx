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
  onReload: () => void;
}

export default function StudioTab({ videos, sequences, sessions, adCreatives, comments, activity, quickLinks, dropdownOptions, properties, customOptions, profiles, isAdmin, onReload }: Props) {
  const [sub, setSub] = usePersistedState<SubTab>('studio_subtab', 'videos');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const stats = useMemo(() => {
    const today = todayISO();
    const inReview = videos.filter(v => v.status === 'In Review').length;
    const awaitingRevision = videos.filter(v => v.status === 'Revision Requested').length;
    const overdue = videos.filter(v =>
      v.deadline && v.deadline.slice(0, 10) < today && v.status !== 'Posted'
    ).length;
    return { inReview, awaitingRevision, overdue };
  }, [videos]);

  const overviewItems: { label: string; value: string; color?: string }[] = [
    { label: 'Videos in Review', value: String(stats.inReview), color: '#8b5cf6' },
    { label: 'Awaiting Revision', value: String(stats.awaitingRevision), color: stats.awaitingRevision > 0 ? '#ef4444' : 'var(--text)' },
    { label: 'Overdue', value: String(stats.overdue), color: stats.overdue > 0 ? '#ef4444' : 'var(--text)' },
  ];

  // Filming Sessions-specific cards: what's still ahead to film, and what shipped
  // this calendar month. Only used while the Sessions sub-tab is active.
  const sessionStats = useMemo(() => {
    const month = todayISO().slice(0, 7); // YYYY-MM
    const planned = sessions.filter(s => s.status === 'Planned').length;
    const filmedThisMonth = sessions.filter(s => s.status === 'Filmed' && (s.date || '').slice(0, 7) === month).length;
    return { planned, filmedThisMonth };
  }, [sessions]);

  const sessionOverviewItems: { label: string; value: string; color?: string }[] = [
    { label: 'Planned', value: String(sessionStats.planned), color: '#8b5cf6' },
    { label: 'Filmed this month', value: String(sessionStats.filmedThisMonth), color: 'var(--text)' },
  ];

  const activeOverview = sub === 'sessions' ? sessionOverviewItems : overviewItems;

  return (
    <div style={{ position: 'relative' }}>
      {/* Overview bar */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${activeOverview.length}, 1fr)`, gap: 10, marginBottom: 16 }}>
        {activeOverview.map(item => (
          <div key={item.label} className="metric-chip">
            <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>{item.label}</div>
            <div className="kpi-num" style={{ fontSize: item.value.length > 6 ? 18 : 30, color: item.color || 'var(--text)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '0.5px solid var(--border)', paddingBottom: 12 }}>
        {SUBTABS.map(t => (
          <button key={t.key} className={`subtab${sub === t.key ? ' active' : ''}`} onClick={() => setSub(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'videos' && <VideoReview videos={videos} comments={comments} activity={activity} quickLinks={quickLinks} dropdownOptions={dropdownOptions} profiles={profiles} isAdmin={isAdmin} onReload={onReload} showToast={showToast} />}
      {sub === 'sequences' && <StorySequences sequences={sequences} comments={comments} activity={activity} dropdownOptions={dropdownOptions} properties={properties} customOptions={customOptions} isAdmin={isAdmin} onReload={onReload} />}
      {sub === 'sessions' && <FilmingSessions sessions={sessions} comments={comments} activity={activity} dropdownOptions={dropdownOptions} properties={properties} customOptions={customOptions} isAdmin={isAdmin} onReload={onReload} />}
      {sub === 'ads' && <AdCreative adCreatives={adCreatives} comments={comments} activity={activity} quickLinks={quickLinks} dropdownOptions={dropdownOptions} properties={properties} customOptions={customOptions} isAdmin={isAdmin} onReload={onReload} showToast={showToast} />}

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
