'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StudioVideo, StudioSequence, StudioSession, StudioAdCreative, StudioComment, StudioActivity } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { todayISO, addDaysISO } from '@/lib/studio';
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
  onReload: () => void;
}

export default function StudioTab({ videos, sequences, sessions, adCreatives, comments, activity, onReload }: Props) {
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
    const in7 = addDaysISO(today, 7);

    const inReview = videos.filter(v => v.status === 'In Review').length;
    const awaitingRevision = videos.filter(v => v.status === 'Revision Requested').length;
    const overdue = videos.filter(v =>
      v.deadline && v.deadline.slice(0, 10) < today && v.status !== 'Posted'
    ).length;
    const upcomingDeadlines = videos.filter(v => {
      if (!v.deadline) return false;
      const d = v.deadline.slice(0, 10);
      return d >= today && d <= in7 && v.status !== 'Posted' && v.status !== 'Approved';
    }).length;

    const nextSession = sessions
      .filter(s => s.date && s.date.slice(0, 10) >= today && s.status !== 'Cancelled')
      .map(s => s.date!.slice(0, 10))
      .sort((a, b) => a.localeCompare(b))[0];

    return { inReview, awaitingRevision, overdue, upcomingDeadlines, nextSession };
  }, [videos, sessions]);

  const overviewItems: { label: string; value: string; color?: string }[] = [
    { label: 'Videos in Review', value: String(stats.inReview), color: '#8b5cf6' },
    { label: 'Awaiting Revision', value: String(stats.awaitingRevision), color: stats.awaitingRevision > 0 ? '#ef4444' : '#fff' },
    { label: 'Overdue', value: String(stats.overdue), color: stats.overdue > 0 ? '#ef4444' : '#fff' },
    { label: 'Next Filming Session', value: stats.nextSession || '—', color: stats.nextSession ? '#3b82f6' : '#555' },
    { label: 'Upcoming Deadlines', value: String(stats.upcomingDeadlines), color: stats.upcomingDeadlines > 0 ? '#f59e0b' : '#fff' },
  ];

  return (
    <div style={{ position: 'relative' }}>
      {/* Overview bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        {overviewItems.map(item => (
          <div key={item.label} className="metric-chip">
            <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>{item.label}</div>
            <div style={{ fontSize: item.value.length > 6 ? 16 : 22, fontWeight: 700, color: item.color || '#fff' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '0.5px solid #1a1a1a', paddingBottom: 12 }}>
        {SUBTABS.map(t => (
          <button key={t.key} className={`subtab${sub === t.key ? ' active' : ''}`} onClick={() => setSub(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'videos' && <VideoReview videos={videos} comments={comments} activity={activity} onReload={onReload} showToast={showToast} />}
      {sub === 'sequences' && <StorySequences sequences={sequences} comments={comments} activity={activity} onReload={onReload} />}
      {sub === 'sessions' && <FilmingSessions sessions={sessions} comments={comments} activity={activity} onReload={onReload} />}
      {sub === 'ads' && <AdCreative adCreatives={adCreatives} comments={comments} activity={activity} onReload={onReload} />}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#0d0d0d',
            border: '0.5px solid #ec4899',
            borderRadius: 8,
            padding: '10px 16px',
            fontSize: 12,
            color: '#fff',
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
