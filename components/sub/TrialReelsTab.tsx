'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TrialReelSource, TrialReelProduction, StudioComment, StudioActivity, Profile } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import SourceLibrary from './trialreels/SourceLibrary';
import ProductionBoard from './trialreels/ProductionBoard';

type SubTab = 'library' | 'board';

interface Props {
  sources: TrialReelSource[];
  productions: TrialReelProduction[];
  comments: StudioComment[];
  activity: StudioActivity[];
  profiles: Profile[];
  isAdmin: boolean;
  currentUserId: string | null;
  openItemId?: string; // a production row id from a deep link
  onReload: () => void;
}

export default function TrialReelsTab({ sources, productions, comments, activity, profiles, isAdmin, currentUserId, openItemId, onReload }: Props) {
  // Editors never see the admin-only Source Library, so their tab is board-only.
  const [sub, setSub] = usePersistedState<SubTab>('trialreel_subtab', isAdmin ? 'library' : 'board');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Non-admins are always on the board; a deep link to a reel also lands on the board.
  useEffect(() => { if (!isAdmin) setSub('board'); }, [isAdmin, setSub]);
  useEffect(() => { if (openItemId) setSub('board'); }, [openItemId, setSub]);

  // Board rows visible to this user (editors only count their own).
  const scopedProductions = useMemo(
    () => (isAdmin ? productions : productions.filter(p => p.assigned_to_user_id && p.assigned_to_user_id === currentUserId)),
    [productions, isAdmin, currentUserId],
  );

  const overview = useMemo(() => {
    const inReview = scopedProductions.filter(p => p.status === 'In Review').length;
    const editing = scopedProductions.filter(p => p.status === 'Editing' || p.status === 'Assigned').length;
    const posted = scopedProductions.filter(p => p.status === 'Posted').length;
    const eligible = sources.filter(s => s.eligible).length;
    const items: { label: string; value: string; color?: string }[] = [];
    if (isAdmin) items.push({ label: 'Eligible in library', value: String(eligible), color: '#10b981' });
    items.push(
      { label: 'In production', value: String(editing), color: '#3b82f6' },
      { label: 'In Review', value: String(inReview), color: inReview > 0 ? '#8b5cf6' : 'var(--text)' },
      { label: 'Posted', value: String(posted), color: 'var(--text)' },
    );
    return items;
  }, [scopedProductions, sources, isAdmin]);

  const SUBTABS: { key: SubTab; label: string }[] = isAdmin
    ? [{ key: 'library', label: 'Source Library' }, { key: 'board', label: 'Production Board' }]
    : [{ key: 'board', label: 'Production Board' }];

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${overview.length}, 1fr)`, gap: 10, marginBottom: 16 }}>
        {overview.map(item => (
          <div key={item.label} className="metric-chip">
            <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>{item.label}</div>
            <div className="kpi-num" style={{ fontSize: 30, color: item.color || 'var(--text)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {SUBTABS.length > 1 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '0.5px solid var(--border)', paddingBottom: 12 }}>
          {SUBTABS.map(t => (
            <button key={t.key} className={`subtab${sub === t.key ? ' active' : ''}`} onClick={() => setSub(t.key)}>{t.label}</button>
          ))}
        </div>
      )}

      {isAdmin && sub === 'library' && (
        <SourceLibrary sources={sources} profiles={profiles} onReload={onReload} showToast={showToast} onQueued={() => setSub('board')} />
      )}
      {sub === 'board' && (
        <ProductionBoard
          productions={productions}
          sources={sources}
          comments={comments}
          activity={activity}
          profiles={profiles}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          openItemId={openItemId}
          onReload={onReload}
        />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface)', border: '0.5px solid #ec4899', borderRadius: 8, padding: '10px 16px', fontSize: 12, color: 'var(--text)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', gap: 8, animation: 'slideInRight 0.2s ease' }}>
          <span style={{ color: '#ec4899' }}>✦</span>
          {toast}
        </div>
      )}
    </div>
  );
}
