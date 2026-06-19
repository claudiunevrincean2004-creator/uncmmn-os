'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Post, Client, SubscriberSnapshot } from '@/lib/types';
import { fn, er, avg } from '@/lib/utils';
import PlatformIcon from '@/components/PlatformIcon';
import PostModal from '@/components/modals/PostModal';
import { usePersistedState } from '@/lib/use-persisted-state';
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

type SortKey = 'date' | 'views' | 'likes' | 'comments' | 'shares' | 'saves' | 'follows' | 'er';
type SortDir = 'asc' | 'desc';
type TimePeriod = '30d' | '3m' | 'quarter' | '6m' | 'year';
type PlatformChoice = 'All' | 'TikTok' | 'YouTube' | 'Instagram';

const PLATFORMS: PlatformChoice[] = ['All', 'TikTok', 'YouTube', 'Instagram'];

const PERIOD_LABELS: Record<TimePeriod, string> = {
  '30d': 'Last 30 days',
  '3m': 'Last 3 months',
  'quarter': 'Last quarter',
  '6m': 'Last 6 months',
  'year': 'Last year',
};

function parseLocalDate(s: string): Date {
  return new Date(s.slice(0, 10) + 'T00:00:00');
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function getPeriodDates(period: TimePeriod): { current: [Date, Date]; previous: [Date, Date] } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    const qEnd = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
    const prevStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
    const prevEnd = new Date(start);
    prevEnd.setMilliseconds(-1);
    return { current: [start, qEnd], previous: [prevStart, prevEnd] };
  }

  const start = new Date(end);
  if (period === '30d') start.setDate(start.getDate() - 30);
  else if (period === '3m') start.setMonth(start.getMonth() - 3);
  else if (period === '6m') start.setMonth(start.getMonth() - 6);
  else if (period === 'year') start.setFullYear(start.getFullYear() - 1);

  const s = startOfDay(start);
  const prevEnd = new Date(s);
  prevEnd.setMilliseconds(-1);
  const prevStart = new Date(prevEnd);
  if (period === '30d') prevStart.setDate(prevStart.getDate() - 30);
  else if (period === '3m') prevStart.setMonth(prevStart.getMonth() - 3);
  else if (period === '6m') prevStart.setMonth(prevStart.getMonth() - 6);
  else if (period === 'year') prevStart.setFullYear(prevStart.getFullYear() - 1);

  return { current: [s, end], previous: [startOfDay(prevStart), prevEnd] };
}

function inRange(dateStr: string, range: [Date, Date]): boolean {
  if (!dateStr) return false;
  const d = parseLocalDate(dateStr);
  return d >= range[0] && d <= range[1];
}

function snapshotGain(snaps: SubscriberSnapshot[], range: [Date, Date]): number | null {
  const inR = snaps
    .filter(s => inRange(s.date, range))
    .sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
  if (inR.length >= 2) {
    return Number(inR[inR.length - 1].subscriber_count) - Number(inR[0].subscriber_count);
  }
  // Fall back: last-before-range vs first-in-range
  const sorted = [...snaps].sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
  const lastBefore = [...sorted].reverse().find(s => parseLocalDate(s.date).getTime() < range[0].getTime());
  if (lastBefore && inR.length >= 1) {
    return Number(inR[inR.length - 1].subscriber_count) - Number(lastBefore.subscriber_count);
  }
  return null;
}

function aggregateEr(posts: Post[]): number {
  const totalViews = posts.reduce((s, p) => s + (p.views || 0), 0);
  if (!totalViews) return 0;
  const totalEng = posts.reduce((s, p) => s + (p.likes || 0) + (p.comments || 0) + (p.shares || 0) + (p.saves || 0), 0);
  return (totalEng / totalViews) * 100;
}

function pctChange(curr: number, prev: number): number {
  if (!prev) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

interface Props {
  client: Client;
  posts: Post[];
  subscriberSnapshots: SubscriberSnapshot[];
  onReload: () => void;
}

export default function ContentTab({ client, posts, subscriberSnapshots, onReload }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editPost, setEditPost] = useState<Post | null>(null);

  const [activePlat, setActivePlat] = usePersistedState<PlatformChoice>('content_platform', 'All');
  const [timePeriod, setTimePeriod] = usePersistedState<TimePeriod>('content_period', '30d');
  const [showCmp, setShowCmp] = usePersistedState<boolean>('content_cmp', false);
  const [sortKey, setSortKey] = usePersistedState<SortKey>('content_sort_key', 'date');
  const [sortDir, setSortDir] = usePersistedState<SortDir>('content_sort_dir', 'desc');
  const [filterPillar, setFilterPillar] = usePersistedState<string>('content_filter_pillar', 'All');
  const [filterFormat, setFilterFormat] = usePersistedState<string>('content_filter_format', 'All');

  const clientPosts = useMemo(() => posts.filter(p => p.client_id === client.id), [posts, client.id]);
  const clientSnaps = useMemo(() => subscriberSnapshots.filter(s => s.client_id === client.id), [subscriberSnapshots, client.id]);

  const tiktokSnaps = useMemo(() => clientSnaps.filter(s => s.platform.toLowerCase() === 'tiktok'), [clientSnaps]);
  const youtubeSnaps = useMemo(() => clientSnaps.filter(s => s.platform.toLowerCase() === 'youtube'), [clientSnaps]);

  const { current: currentRange, previous: prevRange } = useMemo(
    () => getPeriodDates(timePeriod),
    [timePeriod]
  );

  const matchesPlatform = (p: Post): boolean =>
    activePlat === 'All' ? true : p.platform.toLowerCase() === activePlat.toLowerCase();

  const platformPostsAll = useMemo(
    () => clientPosts.filter(matchesPlatform),
    [clientPosts, activePlat]
  );
  const periodPosts = useMemo(
    () => platformPostsAll.filter(p => inRange(p.date, currentRange)),
    [platformPostsAll, currentRange]
  );
  const prevPeriodPosts = useMemo(
    () => platformPostsAll.filter(p => inRange(p.date, prevRange)),
    [platformPostsAll, prevRange]
  );

  function followersGainedFor(plat: PlatformChoice, range: [Date, Date], postsInPeriod: Post[]): number | null {
    if (plat === 'TikTok') return snapshotGain(tiktokSnaps, range);
    if (plat === 'YouTube') return snapshotGain(youtubeSnaps, range);
    if (plat === 'Instagram') return postsInPeriod.reduce((s, p) => s + (p.follows || 0), 0);
    // 'All'
    const tt = snapshotGain(tiktokSnaps, range);
    const yt = snapshotGain(youtubeSnaps, range);
    const igFollows = postsInPeriod
      .filter(p => p.platform.toLowerCase() === 'instagram')
      .reduce((s, p) => s + (p.follows || 0), 0);
    const anyAvail = tt !== null || yt !== null || igFollows > 0;
    if (!anyAvail) return null;
    return (tt ?? 0) + (yt ?? 0) + igFollows;
  }

  const totalViews = periodPosts.reduce((s, p) => s + (p.views || 0), 0);
  const totalPostsCount = periodPosts.length;
  const followersGained = followersGainedFor(activePlat, currentRange, periodPosts);
  const avgErPct = aggregateEr(periodPosts);

  const prevTotalViews = prevPeriodPosts.reduce((s, p) => s + (p.views || 0), 0);
  const prevTotalPosts = prevPeriodPosts.length;
  const prevFollowersGained = followersGainedFor(activePlat, prevRange, prevPeriodPosts);
  const prevAvgEr = aggregateEr(prevPeriodPosts);

  // Growth chart data by month for the selected platform & period
  const monthlyData = useMemo(() => {
    const map: Record<string, { views: number; follows: number }> = {};
    periodPosts.forEach(p => {
      if (!p.date) return;
      const key = p.date.slice(0, 7);
      if (!map[key]) map[key] = { views: 0, follows: 0 };
      map[key].views += p.views || 0;
      if (activePlat === 'Instagram' || (activePlat === 'All' && p.platform.toLowerCase() === 'instagram')) {
        map[key].follows += p.follows || 0;
      }
    });

    function addSnapshotDeltas(snaps: SubscriberSnapshot[]) {
      const byMonth: Record<string, number[]> = {};
      snaps.forEach(s => {
        if (!inRange(s.date, currentRange)) return;
        const key = s.date.slice(0, 7);
        if (!byMonth[key]) byMonth[key] = [];
        byMonth[key].push(Number(s.subscriber_count));
      });
      Object.entries(byMonth).forEach(([key, arr]) => {
        const delta = arr.length >= 2 ? Math.max(...arr) - Math.min(...arr) : 0;
        if (!map[key]) map[key] = { views: 0, follows: 0 };
        map[key].follows += delta;
      });
    }
    if (activePlat === 'TikTok') addSnapshotDeltas(tiktokSnaps);
    else if (activePlat === 'YouTube') addSnapshotDeltas(youtubeSnaps);
    else if (activePlat === 'All') {
      addSnapshotDeltas(tiktokSnaps);
      addSnapshotDeltas(youtubeSnaps);
    }
    return map;
  }, [periodPosts, activePlat, tiktokSnaps, youtubeSnaps, currentRange]);

  const chartKeys = Object.keys(monthlyData).sort();
  const chartLabels = chartKeys.map(k => {
    const [y, m] = k.split('-');
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
  });
  const chartViews = chartKeys.map(k => monthlyData[k].views);
  const chartFollows = chartKeys.map(k => monthlyData[k].follows);

  const chartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Views',
        data: chartViews,
        borderColor: '#fff',
        backgroundColor: 'rgba(255,255,255,0.04)',
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: '#fff',
        yAxisID: 'y',
        borderWidth: 1.5,
      },
      {
        label: 'Followers',
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
      legend: { labels: { color: '#555', font: { size: 11 }, boxWidth: 12 } },
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
      x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#444', font: { size: 10 } } },
      y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#444', font: { size: 10 } }, position: 'left' as const },
      y1: { grid: { display: false }, ticks: { color: '#6366f1', font: { size: 10 } }, position: 'right' as const },
    },
  };

  // Outliers within the selected period for the selected platform
  const periodAvgViews = avg(periodPosts.map(p => p.views));
  const outliers = useMemo(() => {
    if (!periodAvgViews) return [];
    return periodPosts
      .filter(p => p.views >= periodAvgViews * 1.5)
      .map(p => ({ ...p, multiple: p.views / periodAvgViews }))
      .sort((a, b) => b.multiple - a.multiple)
      .slice(0, 6);
  }, [periodPosts, periodAvgViews]);

  // Posts table — filtered by platform (all-time) + pillar/format
  const tablePosts = platformPostsAll;
  const pillarsOptions = ['All', ...Array.from(new Set(tablePosts.map(p => p.pillar).filter(Boolean)))];
  const formatsOptions = ['All', ...Array.from(new Set(tablePosts.map(p => p.format).filter(Boolean)))];
  const avgViewsAllTime = avg(tablePosts.map(p => p.views));

  const filtered = useMemo(() => {
    let result = tablePosts;
    if (filterPillar !== 'All') result = result.filter(p => p.pillar === filterPillar);
    if (filterFormat !== 'All') result = result.filter(p => p.format === filterFormat);
    return result.sort((a, b) => {
      let av = 0;
      let bv = 0;
      if (sortKey === 'date') {
        av = new Date(a.date || 0).getTime();
        bv = new Date(b.date || 0).getTime();
      } else if (sortKey === 'er') {
        av = er(a);
        bv = er(b);
      } else {
        av = a[sortKey] || 0;
        bv = b[sortKey] || 0;
      }
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  }, [tablePosts, filterPillar, filterFormat, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function SortHeader({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(k)}>
        {label} {active ? (sortDir === 'desc' ? '↓' : '↑') : ''}
      </th>
    );
  }

  async function deletePost(id: string) {
    if (!confirm('Delete this post?')) return;
    await supabase.from('posts').delete().eq('id', id);
    onReload();
  }

  const followersAvailable = followersGained !== null;
  const followersCanCompare = followersAvailable && prevFollowersGained !== null;
  const followersValueColor =
    !followersAvailable ? '#555' : followersGained >= 0 ? '#10b981' : '#ef4444';
  const followersSubLabel = !followersAvailable
    ? 'no data'
    : activePlat === 'Instagram'
    ? 'from posts'
    : activePlat === 'All'
    ? 'snapshots + IG posts'
    : 'from snapshots';

  const cards: {
    label: string;
    value: string;
    color?: string;
    diff: number;
    sub: string;
    hasDelta: boolean;
  }[] = [
    {
      label: 'Total Views',
      value: fn(totalViews),
      diff: pctChange(totalViews, prevTotalViews),
      sub: `${totalPostsCount} ${totalPostsCount === 1 ? 'post' : 'posts'}`,
      hasDelta: true,
    },
    {
      label: 'Total Posts',
      value: String(totalPostsCount),
      diff: pctChange(totalPostsCount, prevTotalPosts),
      sub: 'in period',
      hasDelta: true,
    },
    {
      label: 'Followers Gained',
      value: !followersAvailable
        ? '—'
        : `${followersGained! >= 0 ? '+' : ''}${fn(followersGained!)}`,
      color: followersValueColor,
      diff: followersCanCompare ? pctChange(followersGained!, prevFollowersGained!) : 0,
      sub: followersSubLabel,
      hasDelta: followersCanCompare,
    },
    {
      label: 'Avg Engagement',
      value: `${avgErPct.toFixed(1)}%`,
      diff: pctChange(avgErPct, prevAvgEr),
      sub: 'eng. rate (period)',
      hasDelta: prevPeriodPosts.length > 0,
    },
  ];

  return (
    <div>
      {/* Platform tabs + period selector + vs prev toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {PLATFORMS.map(p => (
            <button
              key={p}
              className={`subtab${activePlat === p ? ' active' : ''}`}
              onClick={() => setActivePlat(p)}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {p !== 'All' && <PlatformIcon platform={p} size={14} />}
              {p}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            className="form-input"
            style={{ width: 'auto', padding: '4px 8px', fontSize: 11 }}
            value={timePeriod}
            onChange={e => setTimePeriod(e.target.value as TimePeriod)}
          >
            {(Object.entries(PERIOD_LABELS) as [TimePeriod, string][]).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
          <button
            className={`btn-compare${showCmp ? ' active' : ''}`}
            onClick={() => setShowCmp(v => !v)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            vs Previous Period
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        {cards.map(c => {
          const showDelta = showCmp && c.hasDelta;
          return (
            <div key={c.label} className="metric-chip">
              <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>{c.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: c.color || '#fff' }}>{c.value}</div>
              {showDelta ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className={`badge ${c.diff >= 0 ? 'badge-up' : 'badge-down'}`}>{c.diff >= 0 ? '+' : ''}{c.diff.toFixed(1)}%</span>
                  <span style={{ fontSize: 10, color: '#444' }}>vs prev period</span>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#444' }}>{c.sub}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Growth chart */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#555', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Growth Trend{activePlat !== 'All' ? ` — ${activePlat}` : ''}
        </div>
        <div style={{ height: 220 }}>
          {chartLabels.length > 0 ? (
            <Line data={chartData} options={chartOptions} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#333', fontSize: 12 }}>
              No data in this period
            </div>
          )}
        </div>
      </div>

      {/* Outlier posts */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#555', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Outlier Posts
          <span style={{ color: '#333', fontWeight: 400, letterSpacing: 0, textTransform: 'none', marginLeft: 4 }}>
            · 1.5x above {activePlat === 'All' ? '' : activePlat + ' '}avg ({fn(periodAvgViews)})
          </span>
        </div>
        {outliers.length === 0 ? (
          <div style={{ color: '#333', fontSize: 12 }}>No outlier posts in this period.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {outliers.map(p => {
              const link = p.post_url || p.drive_link;
              return (
                <div
                  key={p.id}
                  style={{ background: '#111', border: '0.5px solid #1a1a1a', borderRadius: 8, padding: 12, cursor: link ? 'pointer' : 'default', position: 'relative', transition: 'border-color 0.15s' }}
                  onClick={() => { if (link) window.open(link, '_blank', 'noopener,noreferrer'); }}
                  onMouseEnter={e => { if (link) e.currentTarget.style.borderColor = '#333'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a1a1a'; }}
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
                        <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.l}</div>
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

      {/* Posts table */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="form-input"
            style={{ width: 'auto', padding: '4px 8px', fontSize: 11 }}
            value={filterPillar}
            onChange={e => setFilterPillar(e.target.value)}
          >
            {pillarsOptions.map(p => <option key={p} value={p}>{p === 'All' ? 'All Pillars' : p}</option>)}
          </select>
          <select
            className="form-input"
            style={{ width: 'auto', padding: '4px 8px', fontSize: 11 }}
            value={filterFormat}
            onChange={e => setFilterFormat(e.target.value)}
          >
            {formatsOptions.map(f => <option key={f} value={f}>{f === 'All' ? 'All Formats' : f}</option>)}
          </select>
          <select
            className="form-input"
            style={{ width: 'auto', padding: '4px 8px', fontSize: 11 }}
            value={`${sortKey}-${sortDir}`}
            onChange={e => {
              const [k, d] = e.target.value.split('-') as [SortKey, SortDir];
              setSortKey(k); setSortDir(d);
            }}
          >
            {([
              { k: 'date', label: 'Date' },
              { k: 'views', label: 'Views' },
              { k: 'likes', label: 'Likes' },
              { k: 'comments', label: 'Comments' },
              { k: 'shares', label: 'Shares' },
              { k: 'saves', label: 'Saves' },
              { k: 'follows', label: 'Follows' },
              { k: 'er', label: 'ER%' },
            ] as { k: SortKey; label: string }[]).map(opt => (
              <optgroup key={opt.k} label={opt.label}>
                <option value={`${opt.k}-desc`}>{opt.label} ↓ High to Low</option>
                <option value={`${opt.k}-asc`}>{opt.label} ↑ Low to High</option>
              </optgroup>
            ))}
          </select>
          <span style={{ fontSize: 11, color: '#555' }}>{filtered.length} posts · avg {fn(avgViewsAllTime)} views</span>
        </div>
        <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => { setEditPost(null); setShowModal(true); }}>+ Add Post</button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#333', padding: '40px 0', fontSize: 12 }}>No posts match. Add a post or adjust filters.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Platform</th>
                <th>Format</th>
                <th>Pillar</th>
                <SortHeader label="Date" k="date" />
                <SortHeader label="Views" k="views" />
                <SortHeader label="Likes" k="likes" />
                <SortHeader label="Comments" k="comments" />
                <SortHeader label="Shares" k="shares" />
                <SortHeader label="Saves" k="saves" />
                <SortHeader label="Follows" k="follows" />
                <SortHeader label="ER%" k="er" />
                <th>Link</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(post => {
                const isOutlier = avgViewsAllTime > 0 && post.views >= avgViewsAllTime * 1.5;
                return (
                  <tr key={post.id}>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isOutlier && <span className="badge badge-outlier" style={{ fontSize: 9 }}>{(post.views / avgViewsAllTime).toFixed(1)}x</span>}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <PlatformIcon platform={post.platform} size={14} />
                        <span style={{ fontSize: 11, color: '#888' }}>{post.platform}</span>
                      </div>
                    </td>
                    <td style={{ color: '#666', fontSize: 11 }}>{post.format || '—'}</td>
                    <td style={{ color: '#666', fontSize: 11 }}>{post.pillar || '—'}</td>
                    <td style={{ color: '#555', fontSize: 11 }}>{post.date ? post.date.slice(0, 10) : '—'}</td>
                    <td style={{ fontWeight: 600 }}>{fn(post.views)}</td>
                    <td>{fn(post.likes)}</td>
                    <td>{fn(post.comments)}</td>
                    <td>{fn(post.shares)}</td>
                    <td>{fn(post.saves)}</td>
                    <td>{fn(post.follows)}</td>
                    <td style={{ color: '#6366f1' }}>{er(post).toFixed(1)}%</td>
                    <td>
                      {post.post_url ? (
                        <a href={post.post_url} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', fontSize: 11, textDecoration: 'none' }}>↗ Post</a>
                      ) : post.drive_link ? (
                        <a href={post.drive_link} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', fontSize: 11, textDecoration: 'none' }}>↗</a>
                      ) : <span style={{ color: '#333' }}>—</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }} onClick={() => { setEditPost(post); setShowModal(true); }}>✎</button>
                        <button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deletePost(post.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <PostModal
          post={editPost}
          client={client}
          onClose={() => setShowModal(false)}
          onSaved={onReload}
        />
      )}
    </div>
  );
}
