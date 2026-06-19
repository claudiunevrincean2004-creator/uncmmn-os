'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Client, Post, SubscriberSnapshot, RevenueEntry } from '@/lib/types';
import { fn, fm, er, avg } from '@/lib/utils';
import { usePersistedState } from '@/lib/use-persisted-state';
import PlatformIcon from '@/components/PlatformIcon';
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
  subscriberSnapshots: SubscriberSnapshot[];
  revenueEntries: RevenueEntry[];
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

export default function Dashboard({ client, posts, subscriberSnapshots, revenueEntries, onReload }: Props) {
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

  // Growth chart by month
  const monthlyData = useMemo(() => {
    const byMonth: Record<string, { views: number; follows: number }> = {};
    clientPosts.forEach(p => {
      if (!p.date) return;
      const key = p.date.slice(0, 7);
      if (!byMonth[key]) byMonth[key] = { views: 0, follows: 0 };
      byMonth[key].views += p.views || 0;
      byMonth[key].follows += p.follows || 0;
    });

    // Add snapshot delta as follows for months that have snapshots
    const snapsByMonth: Record<string, { tt: number[]; yt: number[] }> = {};
    clientSnaps.forEach(s => {
      const key = s.date.slice(0, 7);
      if (!snapsByMonth[key]) snapsByMonth[key] = { tt: [], yt: [] };
      if (s.platform.toLowerCase() === 'tiktok') snapsByMonth[key].tt.push(Number(s.subscriber_count));
      if (s.platform.toLowerCase() === 'youtube') snapsByMonth[key].yt.push(Number(s.subscriber_count));
    });
    Object.entries(snapsByMonth).forEach(([key, arrs]) => {
      const ttDelta = arrs.tt.length >= 2 ? Math.max(...arrs.tt) - Math.min(...arrs.tt) : 0;
      const ytDelta = arrs.yt.length >= 2 ? Math.max(...arrs.yt) - Math.min(...arrs.yt) : 0;
      const total = ttDelta + ytDelta;
      if (!byMonth[key]) byMonth[key] = { views: 0, follows: 0 };
      if (total > byMonth[key].follows) byMonth[key].follows = total;
    });

    return byMonth;
  }, [clientPosts, clientSnaps]);

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

  const tt = platformStats(monthPosts, 'tiktok');
  const yt = platformStats(monthPosts, 'youtube');

  // Revenue
  const monthEntries = useMemo(
    () => revenueEntries.filter(r => r.date?.startsWith(monthStartISO.slice(0, 7))),
    [revenueEntries, monthStartISO]
  );
  const monthRevenue = monthEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const [sharePct, setSharePct] = usePersistedState<number>('nathan_profit_share_pct', 70);
  const nathanCut = monthRevenue * (sharePct / 100);
  const yourCut = monthRevenue * (1 - sharePct / 100);

  // Inline revenue form
  const [showForm, setShowForm] = useState(false);
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newAmount, setNewAmount] = useState('');
  const [newSource, setNewSource] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setNewDate(new Date().toISOString().slice(0, 10));
    setNewAmount('');
    setNewSource('');
    setNewNotes('');
  }

  async function saveEntry() {
    const amount = parseFloat(newAmount);
    if (!amount || saving) return;
    setSaving(true);
    await supabase.from('revenue_entries').insert([{
      date: newDate,
      amount,
      source: newSource.trim() || null,
      notes: newNotes.trim() || null,
    }]);
    setSaving(false);
    resetForm();
    setShowForm(false);
    onReload();
  }

  async function deleteEntry(id: string) {
    if (!confirm('Delete this revenue entry?')) return;
    await supabase.from('revenue_entries').delete().eq('id', id);
    onReload();
  }

  const sortedEntries = useMemo(
    () => [...revenueEntries].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [revenueEntries]
  );

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Dashboard</div>
        <div style={{ fontSize: 12, color: '#444' }}>{client.name} — {monthLabel}</div>
      </div>

      {/* Top metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Total Views</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{fn(totalViews)}</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>this month</div>
        </div>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Followers Gained</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: followersGainedAvailable ? (followersGained >= 0 ? '#10b981' : '#ef4444') : '#555' }}>
            {followersGainedAvailable ? `${followersGained >= 0 ? '+' : ''}${fn(followersGained)}` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
            {followersGainedAvailable ? 'TikTok + YouTube' : 'Need 2+ snapshots'}
          </div>
        </div>
        <div className="metric-chip">
          <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Total Posts</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{totalPosts}</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>this month</div>
        </div>
      </div>

      {/* Top outlier posts */}
      <div className="card">
        <div style={{ fontSize: 11, color: '#555', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Top Outlier Posts <span style={{ color: '#333', fontWeight: 400, letterSpacing: 0, textTransform: 'none', marginLeft: 4 }}>· 1.5x above avg ({fn(allTimeAvg)})</span>
        </div>
        {outliers.length === 0 ? (
          <div style={{ color: '#333', fontSize: 12 }}>No outlier posts yet.</div>
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

      {/* Growth chart */}
      <div className="card">
        <div style={{ fontSize: 11, color: '#555', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Growth Trend</div>
        <div style={{ height: 220 }}>
          {chartLabels.length > 0 ? (
            <Line data={chartData} options={chartOptions} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#333', fontSize: 12 }}>
              No data with dates yet
            </div>
          )}
        </div>
      </div>

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
              <div style={{ fontSize: 11, color: '#555', marginLeft: 'auto' }}>{s.count} posts this month</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Views</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{fn(s.views)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Likes</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{fn(s.likes)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Comments</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{fn(s.comments)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>ER%</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#6366f1' }}>{s.erPct.toFixed(1)}%</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Followers</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{snapCount !== null ? fn(snapCount) : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Gained this mo.</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: gain === null ? '#555' : gain >= 0 ? '#10b981' : '#ef4444' }}>
                  {gain === null ? '—' : `${gain >= 0 ? '+' : ''}${fn(gain)}`}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Revenue / profit share */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revenue · Profit Share</div>
          <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => setShowForm(v => !v)}>
            {showForm ? 'Cancel' : '+ Log Revenue'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div className="metric-chip">
            <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Revenue this month</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{fm(monthRevenue)}</div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{monthEntries.length} {monthEntries.length === 1 ? 'entry' : 'entries'}</div>
          </div>
          <div className="metric-chip">
            <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Nathan&apos;s share</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min={0}
                max={100}
                value={sharePct}
                onChange={e => setSharePct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                className="form-input"
                style={{ width: 70, fontSize: 18, fontWeight: 700, padding: '4px 8px' }}
              />
              <span style={{ fontSize: 18, fontWeight: 700, color: '#888' }}>%</span>
            </div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>editable</div>
          </div>
          <div className="metric-chip">
            <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>Nathan earns</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981' }}>{fm(nathanCut)}</div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{sharePct}% of revenue</div>
          </div>
          <div className="metric-chip">
            <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>You earn</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#6366f1' }}>{fm(yourCut)}</div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{(100 - sharePct).toFixed(0)}% of revenue</div>
          </div>
        </div>

        {showForm && (
          <div style={{ background: '#111', border: '0.5px solid #1a1a1a', borderRadius: 8, padding: 12, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 140px 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
              <div>
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Amount</label>
                <input className="form-input" type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="form-label">Source</label>
                <input className="form-input" value={newSource} onChange={e => setNewSource(e.target.value)} placeholder="Brand deal, course sale..." />
              </div>
              <div>
                <label className="form-label">Notes</label>
                <input className="form-input" value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="optional" />
              </div>
              <button className="btn-primary" onClick={saveEntry} disabled={saving || !newAmount}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {sortedEntries.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#333', padding: '20px 0', fontSize: 12 }}>No revenue entries yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Source</th>
                <th>Notes</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map(e => (
                <tr key={e.id}>
                  <td style={{ color: '#888', fontSize: 11 }}>{e.date}</td>
                  <td>{e.source || '—'}</td>
                  <td style={{ color: '#666' }}>{e.notes || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fm(Number(e.amount) || 0)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-danger" style={{ padding: '2px 6px' }} onClick={() => deleteEntry(e.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
