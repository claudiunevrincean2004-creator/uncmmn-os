'use client';
import { useMemo, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Client, Post, Goal, Pillar, Format, SubscriberSnapshot } from '@/lib/types';
import { fn, er, avg, getColor, getPlatformColor } from '@/lib/utils';
import type { TimePeriod } from '@/app/page';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface Props {
  client: Client;
  posts: Post[];
  goals: Goal[];
  pillars: Pillar[];
  formats: Format[];
  activePlat: string;
  showCmp: boolean;
  timePeriod: TimePeriod;
}

/** Returns [periodStart, periodEnd, prevStart, prevEnd] as Date objects */
function getPeriodDates(period: TimePeriod): { current: [Date, Date]; previous: [Date, Date] } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  /** Clone a date and reset time to start of day (00:00:00.000) */
  function startOfDay(d: Date): Date {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  }

  if (period === '30d') {
    const start = new Date(end); start.setDate(start.getDate() - 30);
    const s = startOfDay(start);
    const prevEnd = new Date(s); prevEnd.setMilliseconds(-1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - 30);
    return { current: [s, end], previous: [startOfDay(prevStart), prevEnd] };
  }
  if (period === '3m') {
    const start = new Date(end); start.setMonth(start.getMonth() - 3);
    const s = startOfDay(start);
    const prevEnd = new Date(s); prevEnd.setMilliseconds(-1);
    const prevStart = new Date(prevEnd); prevStart.setMonth(prevStart.getMonth() - 3);
    return { current: [s, end], previous: [startOfDay(prevStart), prevEnd] };
  }
  if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    const qEnd = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
    const prevStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
    const prevEnd = new Date(start); prevEnd.setMilliseconds(-1);
    return { current: [start, qEnd], previous: [prevStart, prevEnd] };
  }
  if (period === '6m') {
    const start = new Date(end); start.setMonth(start.getMonth() - 6);
    const s = startOfDay(start);
    const prevEnd = new Date(s); prevEnd.setMilliseconds(-1);
    const prevStart = new Date(prevEnd); prevStart.setMonth(prevStart.getMonth() - 6);
    return { current: [s, end], previous: [startOfDay(prevStart), prevEnd] };
  }
  if (period === 'year') {
    const start = new Date(end); start.setFullYear(start.getFullYear() - 1);
    const s = startOfDay(start);
    const prevEnd = new Date(s); prevEnd.setMilliseconds(-1);
    const prevStart = new Date(prevEnd); prevStart.setFullYear(prevStart.getFullYear() - 1);
    return { current: [s, end], previous: [startOfDay(prevStart), prevEnd] };
  }
  // all time
  const start = new Date(2000, 0, 1);
  return { current: [start, end], previous: [start, end] };
}

function inRange(dateStr: string, range: [Date, Date]): boolean {
  if (!dateStr) return false;
  // Always extract the YYYY-MM-DD portion and parse as local midnight.
  // This handles both "2026-04-07" and "2026-04-07T00:00:00+00:00" formats
  // that Supabase may return for date columns.
  const datePart = dateStr.slice(0, 10); // "YYYY-MM-DD"
  const d = new Date(datePart + 'T00:00:00'); // local midnight
  return d >= range[0] && d <= range[1];
}

function ExternalLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

/** Parse a date string to local time consistently */
function parseLocalDate(dateStr: string): Date {
  const datePart = dateStr.slice(0, 10);
  return new Date(datePart + 'T00:00:00');
}

/** Get follower gain from snapshots in a date range. Snapshots should already be filtered by client+platform. */
function getSnapshotFollowGain(snapshots: SubscriberSnapshot[], range: [Date, Date]): { gain: number | null; startCount: number; endCount: number; count: number } | null {
  const inRangeSnaps = snapshots
    .filter(s => inRange(s.date, range))
    .sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());

  if (inRangeSnaps.length < 1) return null;

  const startCount = Number(inRangeSnaps[0].subscriber_count);
  const endCount = Number(inRangeSnaps[inRangeSnaps.length - 1].subscriber_count);
  // Need 2+ snapshots to calculate a meaningful difference
  const gain = inRangeSnaps.length >= 2 ? endCount - startCount : null;
  return { gain, startCount, endCount, count: inRangeSnaps.length };
}

/** Get latest subscriber count from an array of snapshots (already filtered by client+platform). */
function getLatestCount(snapshots: SubscriberSnapshot[]): number | null {
  if (snapshots.length === 0) return null;
  const sorted = [...snapshots].sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
  return Number(sorted[0].subscriber_count);
}

export default function ClientOverview({ client, posts, goals, pillars, formats, activePlat, showCmp, timePeriod }: Props) {
  const clientPosts = posts.filter(p => p.client_id === client.id && (activePlat === 'All' || p.platform.toLowerCase() === activePlat.toLowerCase()));
  const clientGoals = goals.filter(g => g.client_id === client.id);
  const clientPillars = pillars.filter(p => p.client_id === client.id);
  const clientFormats = formats.filter(f => f.client_id === client.id);

  const { current: currentRange, previous: prevRange } = getPeriodDates(timePeriod);

  const periodPosts = timePeriod === 'all' ? clientPosts : clientPosts.filter(p => inRange(p.date, currentRange));
  const prevPosts = timePeriod === 'all' ? clientPosts : clientPosts.filter(p => inRange(p.date, prevRange));

  const totalViews = periodPosts.reduce((s, p) => s + p.views, 0);
  const totalImpressions = periodPosts.reduce((s, p) => s + p.likes + p.comments + p.shares + p.saves, 0);
  const totalPostsCount = periodPosts.length;

  const prevViews = prevPosts.reduce((s, p) => s + p.views, 0);
  const prevImpressions = prevPosts.reduce((s, p) => s + p.likes + p.comments + p.shares + p.saves, 0);
  const prevPostsCount = prevPosts.length;

  // --- Fetch subscriber snapshots directly from Supabase, filtered by client_id + platform ---
  const [tiktokSnaps, setTiktokSnaps] = useState<SubscriberSnapshot[]>([]);
  const [youtubeSnaps, setYoutubeSnaps] = useState<SubscriberSnapshot[]>([]);
  const [snapsLoaded, setSnapsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchSnapshots() {
      const [ttRes, ytRes] = await Promise.all([
        supabase
          .from('subscriber_snapshots')
          .select('*')
          .eq('client_id', client.id)
          .ilike('platform', 'tiktok')
          .order('date', { ascending: true }),
        supabase
          .from('subscriber_snapshots')
          .select('*')
          .eq('client_id', client.id)
          .ilike('platform', 'youtube')
          .order('date', { ascending: true }),
      ]);
      if (cancelled) return;

      const tt = (ttRes.data || []) as SubscriberSnapshot[];
      const yt = (ytRes.data || []) as SubscriberSnapshot[];

      if (ttRes.error) console.warn('[Snapshots] TikTok query error:', ttRes.error.message);
      if (ytRes.error) console.warn('[Snapshots] YouTube query error:', ytRes.error.message);

      console.log(`[Snapshots] Client "${client.name}": TikTok=${tt.length} rows, YouTube=${yt.length} rows`);
      if (tt.length > 0) console.log('[Snapshots] TikTok sample:', { date: tt[0].date, count: tt[0].subscriber_count, platform: tt[0].platform });
      if (yt.length > 0) console.log('[Snapshots] YouTube sample:', { date: yt[0].date, count: yt[0].subscriber_count, platform: yt[0].platform });

      setTiktokSnaps(tt);
      setYoutubeSnaps(yt);
      setSnapsLoaded(true);
    }
    fetchSnapshots();
    return () => { cancelled = true; };
  }, [client.id]);

  // Followers card — always visible, platform-aware logic
  type FollowerResult = { netGained: number | null; prevNetGained: number | null; latestTotal: number | null; noTotalLabel: string | null; netGainedLabel: string | null };

  const followerData = useMemo((): FollowerResult => {
    if (!snapsLoaded) {
      return { netGained: null, prevNetGained: null, latestTotal: null, noTotalLabel: 'Loading...', netGainedLabel: 'Loading...' };
    }

    const isAll = activePlat === 'All';
    const isIG = activePlat.toLowerCase() === 'instagram';

    // Helper to compute follower data for one platform's snapshots
    function computeForPlatform(snaps: SubscriberSnapshot[]): { netGained: number | null; prevNetGained: number | null; latestTotal: number | null; count: number } {
      const curr = getSnapshotFollowGain(snaps, currentRange);
      const prev = getSnapshotFollowGain(snaps, prevRange);
      const latest = getLatestCount(snaps);
      return {
        netGained: curr?.gain ?? null,
        prevNetGained: prev?.gain ?? null,
        latestTotal: latest,
        count: curr?.count ?? 0,
      };
    }

    if (isAll) {
      const tt = computeForPlatform(tiktokSnaps);
      const yt = computeForPlatform(youtubeSnaps);

      const hasAnyTotal = tt.latestTotal !== null || yt.latestTotal !== null;
      const latestTotal = hasAnyTotal ? (tt.latestTotal ?? 0) + (yt.latestTotal ?? 0) : null;

      // Sum net gained across platforms that have 2+ snapshots
      const hasAnyGain = tt.netGained !== null || yt.netGained !== null;
      const netGained = hasAnyGain ? (tt.netGained ?? 0) + (yt.netGained ?? 0) : null;
      const prevNetGained = (tt.prevNetGained ?? 0) + (yt.prevNetGained ?? 0);

      // Determine labels
      const totalSnapsInRange = tt.count + yt.count;
      let netGainedLabel: string | null = null;
      if (!hasAnyTotal && totalSnapsInRange === 0) {
        netGainedLabel = 'No data yet';
      } else if (netGained === null && totalSnapsInRange > 0) {
        netGainedLabel = 'Need more data';
      }

      return {
        netGained,
        prevNetGained: hasAnyGain ? prevNetGained : null,
        latestTotal,
        noTotalLabel: hasAnyTotal ? null : 'No data yet',
        netGainedLabel,
      };
    }

    if (isIG) {
      // Instagram — no snapshots, use post-based follows
      const postFollows = periodPosts.reduce((s, p) => s + p.follows, 0);
      const prevPostFollows = prevPosts.reduce((s, p) => s + p.follows, 0);
      return { netGained: postFollows, prevNetGained: prevPostFollows, latestTotal: null, noTotalLabel: 'Connect API to track', netGainedLabel: null };
    }

    // TikTok or YouTube — use that platform's snapshots
    const snaps = activePlat.toLowerCase() === 'tiktok' ? tiktokSnaps : youtubeSnaps;
    const data = computeForPlatform(snaps);

    let netGainedLabel: string | null = null;
    if (snaps.length === 0) {
      netGainedLabel = 'No data yet';
    } else if (data.netGained === null && data.count > 0) {
      netGainedLabel = 'Need more data';
    }

    return {
      netGained: data.netGained,
      prevNetGained: data.prevNetGained,
      latestTotal: data.latestTotal,
      noTotalLabel: data.latestTotal === null ? 'No data yet' : null,
      netGainedLabel,
    };
  }, [activePlat, tiktokSnaps, youtubeSnaps, snapsLoaded, currentRange, prevRange, periodPosts, prevPosts]);

  function pctChange(curr: number, prev: number): number {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return ((curr - prev) / prev) * 100;
  }

  const viewsDiff = pctChange(totalViews, prevViews);
  const netGainedDiff = (followerData.netGained !== null && followerData.prevNetGained !== null)
    ? pctChange(followerData.netGained, followerData.prevNetGained)
    : 0;
  const impressionsDiff = pctChange(totalImpressions, prevImpressions);
  const postsDiff = pctChange(totalPostsCount, prevPostsCount);

  const topPost = [...periodPosts].sort((a, b) => b.views - a.views)[0];

  // Growth chart data – group posts by month (use period-filtered posts)
  const monthlyData = useMemo(() => {
    const sorted = [...periodPosts].filter(p => p.date).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const months: Record<string, { views: number; follows: number }> = {};
    sorted.forEach(p => {
      const key = p.date.slice(0, 7); // YYYY-MM
      if (!months[key]) months[key] = { views: 0, follows: 0 };
      months[key].views += p.views;
      months[key].follows += p.follows;
    });
    return months;
  }, [periodPosts]);

  const chartLabels = Object.keys(monthlyData).map(k => {
    const [y, m] = k.split('-');
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
  });
  const chartViews = Object.values(monthlyData).map(d => d.views);
  const chartFollows = Object.values(monthlyData).map(d => d.follows);

  const chartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Views',
        data: chartViews,
        borderColor: '#fff',
        backgroundColor: 'rgba(255,255,255,0.03)',
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: '#fff',
        yAxisID: 'y',
        borderWidth: 1.5,
      },
      {
        label: 'Follows',
        data: chartFollows,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.05)',
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: '#6366f1',
        yAxisID: 'y1',
        borderWidth: 1.5,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        labels: {
          color: '#555',
          font: { size: 11 },
          boxWidth: 12,
        },
      },
      tooltip: {
        backgroundColor: '#0d0d0d',
        borderColor: '#2a2a2a',
        borderWidth: 1,
        titleColor: '#fff',
        bodyColor: '#888',
        titleFont: { size: 12 },
        bodyFont: { size: 11 },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.03)' },
        ticks: { color: '#444', font: { size: 10 } },
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.03)' },
        ticks: { color: '#444', font: { size: 10 } },
        position: 'left' as const,
      },
      y1: {
        grid: { display: false },
        ticks: { color: '#6366f1', font: { size: 10 } },
        position: 'right' as const,
      },
    },
  };

  // Pillar effectiveness
  const pillarStats = clientPillars.map(pillar => {
    const pp = periodPosts.filter(p => p.pillar === pillar.name);
    return { name: pillar.name, avgViews: pp.length > 0 ? avg(pp.map(p => p.views)) : 0, count: pp.length };
  }).sort((a, b) => b.avgViews - a.avgViews);
  const maxPillarViews = Math.max(...pillarStats.map(p => p.avgViews), 1);

  // Format performance
  const formatStats = clientFormats.map(fmt => {
    const fp = periodPosts.filter(p => p.format === fmt.name);
    return { name: fmt.name, platform: fmt.platform, avgViews: fp.length > 0 ? avg(fp.map(p => p.views)) : fmt.avg_views, count: fp.length };
  });

  // Outlier posts — 1.5x above client average
  const clientAvgViews = avg(periodPosts.map(p => p.views));
  const outlierThreshold = clientAvgViews * 1.5;
  const outlierPosts = periodPosts.filter(p => p.views >= outlierThreshold).sort((a, b) => b.views - a.views);

  const metrics = [
    { label: 'Total Views', value: fn(totalViews), diff: viewsDiff, sub: `${periodPosts.length} posts` },
    { label: 'Total Impressions', value: fn(totalImpressions), diff: impressionsDiff, sub: 'likes + comments + shares + saves' },
    { label: 'Total Posts', value: String(totalPostsCount), diff: postsDiff, sub: 'in period' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) minmax(0, 1.2fr)', gap: 10 }}>
        {metrics.map(m => (
          <div key={m.label} className="metric-chip">
            <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>{m.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 3 }}>{m.value}</div>
            {showCmp && timePeriod !== 'all' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className={`badge ${m.diff >= 0 ? 'badge-up' : 'badge-down'}`}>{m.diff >= 0 ? '+' : ''}{m.diff.toFixed(1)}%</span>
                <span style={{ fontSize: 10, color: '#444' }}>vs prev period</span>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#444' }}>{m.sub}</div>
            )}
          </div>
        ))}

        {/* Followers card — always visible, platform-aware */}
        <div className="metric-chip" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>
            Followers
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 1 }}>
            <div>
              {followerData.netGained !== null ? (
                <>
                  <div style={{ fontSize: 18, fontWeight: 700, color: followerData.netGained >= 0 ? '#10b981' : '#ef4444', marginBottom: 2 }}>
                    {followerData.netGained >= 0 ? '+' : ''}{fn(followerData.netGained)}
                  </div>
                  <div style={{ fontSize: 10, color: '#444' }}>
                    {showCmp && timePeriod !== 'all' && followerData.prevNetGained !== null ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span className={`badge ${netGainedDiff >= 0 ? 'badge-up' : 'badge-down'}`} style={{ fontSize: 9 }}>{netGainedDiff >= 0 ? '+' : ''}{netGainedDiff.toFixed(1)}%</span>
                      </span>
                    ) : (
                      'net gained'
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#555', marginBottom: 2 }} title={followerData.netGainedLabel === 'Need more data' ? 'Need more data — updates every 6 hours' : undefined}>
                    —
                  </div>
                  <div style={{ fontSize: 10, color: '#555' }}>
                    {followerData.netGainedLabel || 'net gained'}
                  </div>
                </>
              )}
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#6366f1', marginBottom: 2 }}>
                {followerData.latestTotal !== null ? fn(followerData.latestTotal) : '—'}
              </div>
              <div style={{ fontSize: 10, color: '#444' }}>
                {followerData.noTotalLabel ? followerData.noTotalLabel : 'total'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Growth chart */}
      <div className="card">
        <div style={{ fontSize: 11, color: '#555', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Growth Trend</div>
        <div style={{ height: 200 }}>
          {chartLabels.length > 0 ? (
            <Line data={chartData} options={chartOptions} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#333', fontSize: 12 }}>
              No data with dates yet
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Goals snapshot — only show when "All" platform is selected */}
        {activePlat === 'All' && (
          <div className="card">
            <div style={{ fontSize: 11, color: '#555', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Goals Snapshot</div>
            {clientGoals.length === 0 ? (
              <div style={{ color: '#333', fontSize: 12 }}>No goals set</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {clientGoals.slice(0, 4).map(goal => {
                  const pct = goal.target_val > 0 ? Math.min(100, (goal.current_val / goal.target_val) * 100) : 0;
                  const done = pct >= 100;
                  return (
                    <div key={goal.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12 }}>{goal.name}</span>
                        <span style={{ fontSize: 11, color: done ? '#10b981' : '#555' }}>{pct.toFixed(0)}%</span>
                      </div>
                      <div className="progress-bar">
                        <div className={`progress-bar-fill${done ? ' complete' : ''}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Top post — clickable if post_url exists */}
        <div className="card" style={{ position: 'relative' }}>
          <div style={{ fontSize: 11, color: '#555', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Post</div>
          {topPost ? (
            <div
              style={{ cursor: topPost.post_url ? 'pointer' : 'default' }}
              onClick={() => { if (topPost.post_url) window.open(topPost.post_url, '_blank', 'noopener,noreferrer'); }}
            >
              {topPost.post_url && (
                <div style={{ position: 'absolute', top: 12, right: 12, color: '#555' }}>
                  <ExternalLinkIcon />
                </div>
              )}
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, lineHeight: 1.4 }}>{topPost.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: getPlatformColor(topPost.platform), display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: '#555' }}>{topPost.platform} · {topPost.format}</span>
                {topPost.date && <span style={{ fontSize: 11, color: '#444' }}>· {topPost.date.slice(0, 10)}</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { l: 'Views', v: fn(topPost.views) },
                  { l: 'Likes', v: fn(topPost.likes) },
                  { l: 'ER%', v: `${er(topPost).toFixed(1)}%` },
                ].map(m => (
                  <div key={m.l}>
                    <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.l}</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{m.v}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ color: '#333', fontSize: 12 }}>No posts yet</div>
          )}
        </div>
      </div>

      {/* Pillar effectiveness */}
      {pillarStats.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 11, color: '#555', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pillar Effectiveness</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pillarStats.map((ps, i) => (
              <div key={ps.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12 }}>{ps.name}</span>
                  <span style={{ fontSize: 11, color: '#555' }}>{fn(ps.avgViews)} avg · {ps.count} posts</span>
                </div>
                <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${(ps.avgViews / maxPillarViews) * 100}%`, background: getColor(i), borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Format performance */}
      {formatStats.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 11, color: '#555', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Format Performance</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {formatStats.map((fs, i) => (
              <div key={fs.name} style={{ background: '#111', border: '0.5px solid #1a1a1a', borderRadius: 8, padding: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: getColor(i), marginBottom: 6 }} />
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>{fs.name}</div>
                {fs.platform && <div style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>{fs.platform}</div>}
                <div style={{ fontSize: 15, fontWeight: 700 }}>{fn(fs.avgViews)}</div>
                <div style={{ fontSize: 10, color: '#555' }}>avg views · {fs.count} posts</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outlier posts table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outlier Posts</div>
          <span style={{ fontSize: 11, color: '#555' }}>{outlierPosts.length} posts above 1.5x avg ({fn(clientAvgViews)} views)</span>
        </div>
        {outlierPosts.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#333', padding: '30px 0', fontSize: 12 }}>
            No outlier posts yet — keep posting
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Platform</th>
                <th>Views</th>
                <th>Likes</th>
                <th>ER%</th>
                <th>Multiplier</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {outlierPosts.map(post => {
                const mult = clientAvgViews > 0 ? (post.views / clientAvgViews).toFixed(1) : '—';
                const clickable = !!post.post_url;
                return (
                  <tr
                    key={post.id}
                    style={{ cursor: clickable ? 'pointer' : 'default' }}
                    onClick={() => { if (clickable) window.open(post.post_url, '_blank', 'noopener,noreferrer'); }}
                  >
                    <td style={{ color: '#fff', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {post.title}
                        {clickable && <span style={{ color: '#555', flexShrink: 0 }}><ExternalLinkIcon /></span>}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: getPlatformColor(post.platform), display: 'inline-block' }} />
                        <span style={{ fontSize: 11, color: '#888' }}>{post.platform}</span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{fn(post.views)}</td>
                    <td>{fn(post.likes)}</td>
                    <td style={{ color: '#6366f1' }}>{er(post).toFixed(1)}%</td>
                    <td><span className="badge badge-outlier">{mult}x</span></td>
                    <td style={{ color: '#555', fontSize: 11 }}>{post.date ? post.date.slice(0, 10) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
