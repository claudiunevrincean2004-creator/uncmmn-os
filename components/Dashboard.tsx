'use client';
import { useMemo } from 'react';
import { Client, Post, SubscriberSnapshot } from '@/lib/types';
import { fn, er, avg } from '@/lib/utils';
import PlatformIcon from '@/components/PlatformIcon';
import ViewsOverTime from '@/components/ViewsOverTime';

interface Props {
  client: Client;
  posts: Post[];
  subscriberSnapshots: SubscriberSnapshot[];
  userEmail?: string | null;
  onReload: () => void;
}

function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr.slice(0, 10) + 'T00:00:00');
}

function platformStats(posts: Post[], name: string) {
  const list = posts.filter(p => p.platform.toLowerCase() === name.toLowerCase());
  const views = list.reduce((s, p) => s + (p.views || 0), 0);
  const likes = list.reduce((s, p) => s + (p.likes || 0), 0);
  const comments = list.reduce((s, p) => s + (p.comments || 0), 0);
  const shares = list.reduce((s, p) => s + (p.shares || 0), 0);
  const saves = list.reduce((s, p) => s + (p.saves || 0), 0);
  const interactions = likes + comments + shares + saves;
  const erPct = views ? (interactions / views) * 100 : 0;
  return { count: list.length, views, likes, comments, erPct };
}

function followerGain(snaps: SubscriberSnapshot[], startISO: string): number | null {
  const sorted = [...snaps].sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
  if (sorted.length < 2) return null;
  const start = parseLocalDate(startISO).getTime();
  const inMonth = sorted.filter(s => parseLocalDate(s.date).getTime() >= start);
  if (inMonth.length >= 2) {
    return Number(inMonth[inMonth.length - 1].subscriber_count) - Number(inMonth[0].subscriber_count);
  }
  // Fall back to first snapshot before month vs last in month
  const lastBefore = [...sorted].reverse().find(s => parseLocalDate(s.date).getTime() < start);
  const lastOverall = sorted[sorted.length - 1];
  if (lastBefore && lastOverall && parseLocalDate(lastOverall.date).getTime() >= start) {
    return Number(lastOverall.subscriber_count) - Number(lastBefore.subscriber_count);
  }
  return null;
}

export default function Dashboard({ client, posts, subscriberSnapshots, userEmail }: Props) {
  // Greeting name derived solely from the email local-part (before "@"), capitalized.
  const greetingName = (() => {
    const local = (userEmail || '').split('@')[0].trim();
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : '';
  })();
  // Time-of-day greeting based on the user's local browser hour.
  const greeting = (() => {
    const h = new Date().getHours();
    let prefix: string, suffix: string;
    if (h >= 5 && h < 8) { prefix = 'Early bird'; suffix = '!'; }
    else if (h >= 8 && h < 12) { prefix = 'Morning'; suffix = '! ☕'; }
    else if (h >= 12 && h < 17) { prefix = 'Back at it'; suffix = '!'; }
    else if (h >= 17 && h < 22) { prefix = 'Winding down'; suffix = '?'; }
    else if (h >= 22 || h < 1) { prefix = 'Night owl'; suffix = '!'; }
    else { prefix = 'Sleep is for the weak'; suffix = '!'; }
    return greetingName ? `${prefix}, ${greetingName}${suffix}` : `${prefix}${suffix}`;
  })();

  const now = new Date();
  const monthStartISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  const clientPosts = useMemo(() => posts.filter(p => p.client_id === client.id), [posts, client.id]);
  const clientSnaps = useMemo(() => subscriberSnapshots.filter(s => s.client_id === client.id), [subscriberSnapshots, client.id]);

  const monthPosts = useMemo(() => clientPosts.filter(p => p.date?.startsWith(monthStartISO.slice(0, 7))), [clientPosts, monthStartISO]);
  const totalViews = monthPosts.reduce((s, p) => s + (p.views || 0), 0);
  const totalPosts = monthPosts.length;

  const tiktokSnaps = useMemo(() => clientSnaps.filter(s => s.platform.toLowerCase() === 'tiktok'), [clientSnaps]);
  const youtubeSnaps = useMemo(() => clientSnaps.filter(s => s.platform.toLowerCase() === 'youtube'), [clientSnaps]);

  const ttGain = followerGain(tiktokSnaps, monthStartISO);
  const ytGain = followerGain(youtubeSnaps, monthStartISO);
  const followersGained = (ttGain ?? 0) + (ytGain ?? 0);
  const followersGainedAvailable = ttGain !== null || ytGain !== null;

  // Outliers: 1.5x above average (all time)
  const allTimeAvg = avg(clientPosts.map(p => p.views));
  const outliers = useMemo(() => {
    if (!allTimeAvg) return [];
    return clientPosts
      .filter(p => p.views >= allTimeAvg * 1.5)
      .map(p => ({ ...p, multiple: p.views / allTimeAvg }))
      .sort((a, b) => b.multiple - a.multiple)
      .slice(0, 6);
  }, [clientPosts, allTimeAvg]);

  // Daily views for the last 30 days (sum post views by date, fill gaps with 0)
  const dailyViews = useMemo(() => {
    const map: Record<string, number> = {};
    clientPosts.forEach(p => {
      if (!p.date) return;
      const key = p.date.slice(0, 10);
      map[key] = (map[key] || 0) + (p.views || 0);
    });
    const pad = (x: number) => String(x).padStart(2, '0');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: { date: string; views: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      days.push({ date: key, views: map[key] || 0 });
    }
    return days;
  }, [clientPosts]);

  const tt = platformStats(monthPosts, 'tiktok');
  const yt = platformStats(monthPosts, 'youtube');

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div className="font-head" style={{ fontSize: 36, fontWeight: 700, color: 'var(--accent)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>{greeting}</div>
        <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 8 }}>{monthLabel}</div>
      </div>

      {/* Top metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Total Views</div>
          <div className="kpi-num" style={{ fontSize: 30 }}>{fn(totalViews)}</div>
        </div>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Followers Gained</div>
          <div className="kpi-num" style={{ fontSize: 30, color: followersGainedAvailable ? (followersGained >= 0 ? 'var(--pos)' : 'var(--neg)') : 'var(--text-faint)' }}>
            {followersGainedAvailable ? `${followersGained >= 0 ? '+' : ''}${fn(followersGained)}` : '—'}
          </div>
        </div>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Total Posts</div>
          <div className="kpi-num" style={{ fontSize: 30 }}>{totalPosts}</div>
        </div>
      </div>

      {/* Top outlier posts */}
      <div className="card">
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Top Outlier Posts <span style={{ color: 'var(--text-faint)', fontWeight: 400, letterSpacing: 0, textTransform: 'none', marginLeft: 4 }}>· 1.5x above avg ({fn(allTimeAvg)})</span>
        </div>
        {outliers.length === 0 ? (
          <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>No outlier posts yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {outliers.map(p => {
              const link = p.post_url || p.drive_link;
              return (
                <div
                  key={p.id}
                  style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 8, padding: 12, cursor: link ? 'pointer' : 'default', position: 'relative', transition: 'border-color 0.15s' }}
                  onClick={() => { if (link) window.open(link, '_blank', 'noopener,noreferrer'); }}
                  onMouseEnter={e => { if (link) e.currentTarget.style.borderColor = 'var(--text-faint)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span className="badge badge-outlier">{p.multiple.toFixed(1)}x</span>
                    <PlatformIcon platform={p.platform} size={14} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {[
                      { l: 'Views', v: fn(p.views) },
                      { l: 'Likes', v: fn(p.likes) },
                      { l: 'ER%', v: `${er(p).toFixed(1)}%` },
                    ].map(m => (
                      <div key={m.l}>
                        <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.l}</div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{m.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Views over time */}
      <ViewsOverTime data={dailyViews} />

      {/* Platform breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { name: 'TikTok', s: tt, snapCount: tiktokSnaps.length ? Number([...tiktokSnaps].sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime())[0].subscriber_count) : null, gain: ttGain },
          { name: 'YouTube', s: yt, snapCount: youtubeSnaps.length ? Number([...youtubeSnaps].sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime())[0].subscriber_count) : null, gain: ytGain },
        ].map(({ name, s, snapCount, gain }) => (
          <div key={name} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <PlatformIcon platform={name} size={20} />
              <div style={{ fontSize: 13, fontWeight: 700 }}>{name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 'auto' }}>{s.count} posts this month</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Views</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{fn(s.views)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Likes</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{fn(s.likes)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Comments</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{fn(s.comments)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>ER%</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{s.erPct.toFixed(1)}%</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Followers</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{snapCount !== null ? fn(snapCount) : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Gained this mo.</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: gain === null ? 'var(--text-faint)' : gain >= 0 ? '#10b981' : '#ef4444' }}>
                  {gain === null ? '—' : `${gain >= 0 ? '+' : ''}${fn(gain)}`}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
