'use client';
import { useMemo } from 'react';
import { StudioVideo, StudioSequence, StudioSession } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { todayISO, addDaysISO } from '@/lib/studio';
import VideoReview from './studio/VideoReview';
import StorySequences from './studio/StorySequences';
import FilmingSessions from './studio/FilmingSessions';

type SubTab = 'videos' | 'sequences' | 'sessions';

const SUBTABS: { key: SubTab; label: string }[] = [
  { key: 'videos', label: 'Video Review' },
  { key: 'sequences', label: 'Story Sequences' },
  { key: 'sessions', label: 'Filming Sessions' },
];

interface Props {
  videos: StudioVideo[];
  sequences: StudioSequence[];
  sessions: StudioSession[];
  onReload: () => void;
}

export default function StudioTab({ videos, sequences, sessions, onReload }: Props) {
  const [sub, setSub] = usePersistedState<SubTab>('studio_subtab', 'videos');

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
    <div>
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

      {sub === 'videos' && <VideoReview videos={videos} onReload={onReload} />}
      {sub === 'sequences' && <StorySequences sequences={sequences} onReload={onReload} />}
      {sub === 'sessions' && <FilmingSessions sessions={sessions} onReload={onReload} />}
    </div>
  );
}
