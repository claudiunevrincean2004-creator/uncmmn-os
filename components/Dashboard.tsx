'use client';
import { useMemo, useState } from 'react';
import { Client, Post, SubscriberSnapshot, ClipperContent } from '@/lib/types';
import { fn, avg } from '@/lib/utils';
import PlatformIcon from '@/components/PlatformIcon';
import ViewsOverTime from '@/components/ViewsOverTime';
import OutlierCard from '@/components/OutlierCard';

interface Props {
  client: Client;
  posts: Post[];
  subscriberSnapshots: SubscriberSnapshot[];
  clipperContent: ClipperContent[];
  userEmail?: string | null;
  userName?: string | null;
  onReload: () => void;
}

// Platform filter, mirroring the Clippers tab. YouTube stays available even
// though the main account is TikTok + Instagram only, because clippers run
// YouTube accounts — under a YouTube filter the main account simply contributes
// zero and clippers contribute their YouTube numbers.
type PlatformChoice = 'All' | 'TikTok' | 'Instagram' | 'YouTube';
const PLATFORM_CHOICES: PlatformChoice[] = ['All', 'TikTok', 'Instagram', 'YouTube'];

const CLIP_COLOR = '#8b5cf6';

function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr.slice(0, 10) + 'T00:00:00');
}

// Main-account posts → per-platform totals (has the full engagement fields).
function platformStats(posts: Post[]) {
  const views = posts.reduce((s, p) => s + (p.views || 0), 0);
  const likes = posts.reduce((s, p) => s + (p.likes || 0), 0);
  const comments = posts.reduce((s, p) => s + (p.comments || 0), 0);
  const shares = posts.reduce((s, p) => s + (p.shares || 0), 0);
  const saves = posts.reduce((s, p) => s + (p.saves || 0), 0);
  return { count: posts.length, views, likes, comments, interactions: likes + comments + shares + saves };
}

// Clipper content → per-platform totals. Clipper rows only carry views + likes,
// so interactions here are likes only.
function clipperStats(rows: ClipperContent[]) {
  const views = rows.reduce((s, c) => s + (c.views || 0), 0);
  const likes = rows.reduce((s, c) => s + (c.likes || 0), 0);
  return { count: rows.length, views, likes, comments: 0, interactions: likes };
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

// Uppercase KPI label (Plus Jakarta Sans) with an optional faint qualifier, e.g. "TOTAL VIEWS · THIS MONTH".
function StatLabel({ label, qualifier }: { label: string; qualifier?: string }) {
  return (
    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 6 }}>
      {label}{qualifier && <span style={{ opacity: 0.75 }}> · {qualifier}</span>}
    </div>
  );
}

// Main / Clippers breakdown line shown under a combined figure, so a single
// merged number never hides where the reach comes from.
function SplitLine({ main, clipper, fmt = fn }: { main: number; clipper: number; fmt?: (n: number) => string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, fontSize: 11, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
        Main: <strong style={{ color: 'var(--text)', fontWeight: 700 }}>{fmt(main)}</strong>
      </span>
      <span style={{ color: 'var(--text-faint)' }}>·</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: CLIP_COLOR }} />
        Clippers: <strong style={{ color: 'var(--text)', fontWeight: 700 }}>{fmt(clipper)}</strong>
      </span>
    </div>
  );
}

// Rounded delta chip: up/down arrow + percent change, then a faint qualifier. Renders nothing when the delta is null.
function DeltaPill({ delta, qualifier }: { delta: { pct: number } | null; qualifier: string }) {
  if (!delta) return null;
  const up = delta.pct >= 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
      <span className={`delta-pill ${up ? 'up' : 'down'}`}>
        <span aria-hidden="true">{up ? '↑' : '↓'}</span>{Math.abs(delta.pct).toFixed(1)}%
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{qualifier}</span>
    </div>
  );
}

export default function Dashboard({ client, posts, subscriberSnapshots, clipperContent, userEmail, userName }: Props) {
  const [platform, setPlatform] = useState<PlatformChoice>('All');

  // Greeting: prefer the user's display name; fall back to the capitalized email
  // local-part (before "@") when no display name is set yet.
  const greetingName = (() => {
    if (userName && userName.trim()) return userName.trim();
    const local = (userEmail || '').split('@')[0].trim();
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : '';
  })();
  // Time-of-day greeting based on the user's local browser hour. Each slot pairs
  // the greeting phrase with a matching emoji and its subtle animation class.
  const tod = (() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 8) return { prefix: 'Early bird', suffix: '!', emoji: '🐦', anim: 'emoji-hop' };
    if (h >= 8 && h < 12) return { prefix: 'Morning', suffix: '!', emoji: '☕', anim: 'emoji-steam' };
    if (h >= 12 && h < 17) return { prefix: 'Back at it', suffix: '!', emoji: '☀️', anim: 'emoji-sun' };
    if (h >= 17 && h < 22) return { prefix: 'Winding down', suffix: '?', emoji: '🌆', anim: 'emoji-fade' };
    if (h >= 22 || h < 1) return { prefix: 'Night owl', suffix: '!', emoji: '🦉', anim: 'emoji-sway' };
    return { prefix: 'Sleep is for the weak', suffix: '!', emoji: '🌙', anim: 'emoji-glow' };
  })();

  const now = new Date();
  const monthStartISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthPrefix = monthStartISO.slice(0, 7);
  const fullDateLabel = now.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' });

  // ── Platform matchers (applied identically to both sources) ────────────────
  const matchPlatform = (p?: string) => platform === 'All' || (p || '').toLowerCase() === platform.toLowerCase();
  // Clipper rows are dated by posted_at when present, else the created date so a
  // manually-logged post still lands in a month.
  const clipDateKey = (c: ClipperContent) => (c.posted_at || c.created_at || '').slice(0, 10);

  // ── Main-account posts, scoped to this client + platform filter ────────────
  const clientPosts = useMemo(
    () => posts.filter(p => p.client_id === client.id && matchPlatform(p.platform)),
    [posts, client.id, platform],
  );
  const clientSnaps = useMemo(() => subscriberSnapshots.filter(s => s.client_id === client.id), [subscriberSnapshots, client.id]);

  // ── Clipper content, scoped to the platform filter ─────────────────────────
  const clips = useMemo(
    () => clipperContent.filter(c => matchPlatform(c.platform)),
    [clipperContent, platform],
  );

  const monthMainPosts = useMemo(() => clientPosts.filter(p => p.date?.startsWith(monthPrefix)), [clientPosts, monthPrefix]);
  const monthClips = useMemo(() => clips.filter(c => clipDateKey(c).startsWith(monthPrefix)), [clips, monthPrefix]);

  const mainViews = monthMainPosts.reduce((s, p) => s + (p.views || 0), 0);
  const clipViews = monthClips.reduce((s, c) => s + (c.views || 0), 0);
  const totalViews = mainViews + clipViews;

  const mainPostCount = monthMainPosts.length;
  const clipPostCount = monthClips.length;
  const totalPosts = mainPostCount + clipPostCount;

  // Combined engagement (interactions) — main carries likes+comments+shares+saves,
  // clippers carry likes only. ER% = interactions / views.
  const mainEng = platformStats(monthMainPosts);
  const clipEng = clipperStats(monthClips);
  const mainInteractions = mainEng.interactions;
  const clipInteractions = clipEng.interactions;
  const totalInteractions = mainInteractions + clipInteractions;
  const totalErPct = totalViews ? (totalInteractions / totalViews) * 100 : 0;

  // Previous calendar month — combined basis for period-over-period deltas.
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthPrefix = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
  const prevMainPosts = useMemo(() => clientPosts.filter(p => p.date?.startsWith(prevMonthPrefix)), [clientPosts, prevMonthPrefix]);
  const prevClips = useMemo(() => clips.filter(c => clipDateKey(c).startsWith(prevMonthPrefix)), [clips, prevMonthPrefix]);
  const prevViews = prevMainPosts.reduce((s, p) => s + (p.views || 0), 0) + prevClips.reduce((s, c) => s + (c.views || 0), 0);
  const prevPosts = prevMainPosts.length + prevClips.length;
  // Percent change vs last month; only valid when there's a non-zero baseline to compare against.
  const viewsDelta = prevViews > 0 ? { pct: ((totalViews - prevViews) / prevViews) * 100 } : null;
  const postsDelta = prevPosts > 0 ? { pct: ((totalPosts - prevPosts) / prevPosts) * 100 } : null;

  // ── Followers gained — main account only (clippers have no follower data) ──
  const tiktokSnaps = useMemo(() => clientSnaps.filter(s => s.platform.toLowerCase() === 'tiktok'), [clientSnaps]);
  const youtubeSnaps = useMemo(() => clientSnaps.filter(s => s.platform.toLowerCase() === 'youtube'), [clientSnaps]);
  const ttGain = followerGain(tiktokSnaps, monthStartISO);
  const ytGain = followerGain(youtubeSnaps, monthStartISO);
  // Respect the platform filter: TikTok/YouTube isolate their snapshot; Instagram
  // has no follower snapshots (→ "—"); All sums the platforms we do track.
  const { followersGained, followersGainedAvailable } = (() => {
    if (platform === 'TikTok') return { followersGained: ttGain ?? 0, followersGainedAvailable: ttGain !== null };
    if (platform === 'YouTube') return { followersGained: ytGain ?? 0, followersGainedAvailable: ytGain !== null };
    if (platform === 'Instagram') return { followersGained: 0, followersGainedAvailable: false };
    return { followersGained: (ttGain ?? 0) + (ytGain ?? 0), followersGainedAvailable: ttGain !== null || ytGain !== null };
  })();

  // ── Outliers — main account only, respecting the platform filter ───────────
  // (Under a YouTube filter the main account has nothing, so this falls to its
  // empty state — expected, since main runs no YouTube.)
  const allTimeAvg = avg(clientPosts.map(p => p.views));
  const outliers = useMemo(() => {
    if (!allTimeAvg) return [];
    return clientPosts
      .filter(p => p.views >= allTimeAvg * 1.5)
      .map(p => ({ ...p, multiple: p.views / allTimeAvg }))
      .sort((a, b) => b.multiple - a.multiple)
      .slice(0, 6);
  }, [clientPosts, allTimeAvg]);

  // ── Daily views for the last 30 days, split into main vs clipper ───────────
  const { dailyViews, dailySplit } = useMemo(() => {
    const mainMap: Record<string, number> = {};
    monthAgnosticAdd(clientPosts, p => p.date, p => p.views || 0, mainMap);
    const clipMap: Record<string, number> = {};
    monthAgnosticAdd(clips, clipDateKey, c => c.views || 0, clipMap);

    const pad = (x: number) => String(x).padStart(2, '0');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dv: { date: string; views: number }[] = [];
    const sp: { main: number; clipper: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const main = mainMap[key] || 0;
      const clipper = clipMap[key] || 0;
      dv.push({ date: key, views: main + clipper });
      sp.push({ main, clipper });
    }
    return { dailyViews: dv, dailySplit: sp };
  }, [clientPosts, clips]);

  const clipHasData = clipperContent.length > 0;

  // ── Per-platform breakdown cards (combined main + clipper, with split) ──────
  const breakdownPlatforms: ('TikTok' | 'Instagram' | 'YouTube')[] =
    platform === 'All' ? ['TikTok', 'Instagram', 'YouTube'] : [platform];
  const breakdown = breakdownPlatforms.map(name => {
    const key = name.toLowerCase();
    const m = platformStats(monthMainPosts.filter(p => p.platform.toLowerCase() === key));
    const c = clipperStats(monthClips.filter(x => (x.platform || '').toLowerCase() === key));
    const views = m.views + c.views;
    const likes = m.likes + c.likes;
    const interactions = m.interactions + c.interactions;
    const erPct = views ? (interactions / views) * 100 : 0;
    const snaps = key === 'tiktok' ? tiktokSnaps : key === 'youtube' ? youtubeSnaps : [];
    const latestFollowers = snaps.length
      ? Number([...snaps].sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime())[0].subscriber_count)
      : null;
    const gain = key === 'tiktok' ? ttGain : key === 'youtube' ? ytGain : null;
    return { name, count: m.count + c.count, views, likes, erPct, latestFollowers, gain, mainViews: m.views, clipViews: c.views, mainLikes: m.likes, clipLikes: c.likes };
  });

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Date line: accent dot + full local date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-dim)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />
          {fullDateLabel}
        </div>
        {/* Hero greeting: words in text color, name in accent, animated time-of-day emoji */}
        <div className="font-head" style={{ fontSize: 36, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
          {tod.prefix}
          {greetingName && <>, <span style={{ color: 'var(--accent)' }}>{greetingName}</span></>}
          {tod.suffix}{' '}
          <span className={tod.anim} style={{ display: 'inline-block' }}>{tod.emoji}</span>
        </div>
      </div>

      {/* Platform filter — applies to main account AND clippers alike */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {PLATFORM_CHOICES.map(p => (
            <button key={p} className={`subtab${platform === p ? ' active' : ''}`} onClick={() => setPlatform(p)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {p !== 'All' && <PlatformIcon platform={p} size={14} />}{p}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          Main account + all clippers{platform === 'YouTube' ? ' · main runs no YouTube — clippers only' : ''}
        </div>
      </div>

      {/* Top metrics — combined totals with the Main / Clippers split beneath */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <div className="stat-card">
          <StatLabel label="Total Views" qualifier="This Month" />
          <div className="kpi-num" style={{ fontSize: 30 }}>{fn(totalViews)}</div>
          <SplitLine main={mainViews} clipper={clipViews} />
          <DeltaPill delta={viewsDelta} qualifier="vs last month" />
        </div>
        <div className="stat-card">
          <StatLabel label="Total Posts" qualifier="This Month" />
          <div className="kpi-num" style={{ fontSize: 30 }}>{fn(totalPosts)}</div>
          <SplitLine main={mainPostCount} clipper={clipPostCount} fmt={n => String(n)} />
          <DeltaPill delta={postsDelta} qualifier="vs last month" />
        </div>
        <div className="stat-card">
          <StatLabel label="Engagement Rate" qualifier="This Month" />
          <div className="kpi-num" style={{ fontSize: 30, color: 'var(--accent)' }}>{totalErPct.toFixed(1)}%</div>
          <SplitLine main={mainInteractions} clipper={clipInteractions} />
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 8 }}>interactions ÷ views</div>
        </div>
      </div>

      {/* Followers gained (main account) — clippers have no follower data */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <div className="stat-card">
          <StatLabel label="Followers Gained" qualifier="This Month" />
          <div className="kpi-num" style={{ fontSize: 30, color: followersGainedAvailable ? (followersGained >= 0 ? 'var(--pos)' : 'var(--neg)') : 'var(--text-faint)' }}>
            {followersGainedAvailable ? `${followersGained >= 0 ? '+' : ''}${fn(followersGained)}` : '—'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 8 }}>main account · no clipper follower data</div>
        </div>
      </div>

      {/* Top outlier posts */}
      <div className="card">
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Top Outlier Posts <span style={{ color: 'var(--text-faint)', fontWeight: 400, letterSpacing: 0, textTransform: 'none', marginLeft: 4 }}>· main account · 1.5x above avg ({fn(allTimeAvg)})</span>
        </div>
        {outliers.length === 0 ? (
          <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>No outlier posts yet.</div>
        ) : (
          <div className="outlier-grid">
            {outliers.map(p => <OutlierCard key={p.id} post={p} multiple={p.multiple} />)}
          </div>
        )}
      </div>

      {/* Views over time — main + clipper, stacked (single combined line if no clipper data) */}
      <ViewsOverTime data={dailyViews} split={clipHasData ? dailySplit : undefined} />

      {/* Platform breakdown — combined per platform, with the Main / Clippers split */}
      <div style={{ display: 'grid', gridTemplateColumns: breakdown.length === 1 ? '1fr' : '1fr 1fr', gap: 10 }}>
        {breakdown.map(b => (
          <div key={b.name} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <PlatformIcon platform={b.name} size={20} />
              <div style={{ fontSize: 13, fontWeight: 700 }}>{b.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 'auto' }}>{b.count} posts this month</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Views</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{fn(b.views)}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>M {fn(b.mainViews)} · C {fn(b.clipViews)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Likes</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{fn(b.likes)}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>M {fn(b.mainLikes)} · C {fn(b.clipLikes)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>ER%</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{b.erPct.toFixed(1)}%</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Followers</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{b.latestFollowers !== null ? fn(b.latestFollowers) : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Gained this mo.</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: b.gain === null ? 'var(--text-faint)' : b.gain >= 0 ? '#10b981' : '#ef4444' }}>
                  {b.gain === null ? '—' : `${b.gain >= 0 ? '+' : ''}${fn(b.gain)}`}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Accumulate a numeric field by yyyy-mm-dd date key into `map`, skipping rows
// with no usable date. Shared by the daily main/clipper aggregation.
function monthAgnosticAdd<T>(rows: T[], dateOf: (r: T) => string | null | undefined, valueOf: (r: T) => number, map: Record<string, number>) {
  rows.forEach(r => {
    const raw = dateOf(r);
    if (!raw) return;
    const key = raw.slice(0, 10);
    if (!key) return;
    map[key] = (map[key] || 0) + valueOf(r);
  });
}
