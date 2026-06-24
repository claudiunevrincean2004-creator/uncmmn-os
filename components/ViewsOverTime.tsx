'use client';
import { useRef, useState } from 'react';
import { fn } from '@/lib/utils';

interface DayPoint {
  date: string; // yyyy-mm-dd
  views: number;
}

// viewBox geometry (stretched to the plot via preserveAspectRatio="none")
const VB_W = 1000;
const VB_H = 260;
const PLOT_PX = 220;        // rendered plot height
const TOP = 18;             // y of max value
const BOTTOM = 246;         // y of zero
const GRID_YS = [18, 94, 170, 246];

function fmtDate(key: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(key + 'T00:00:00').toLocaleDateString('default', opts);
}

export default function ViewsOverTime({ data }: { data: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  const n = data.length;
  const realMax = Math.max(0, ...data.map(d => d.views));
  const max = Math.max(1, realMax); // avoid divide-by-zero when there's no data

  const xOf = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * VB_W);
  const yOf = (v: number) => TOP + (1 - v / max) * (BOTTOM - TOP);

  const pts = data.map((d, i) => `${xOf(i).toFixed(2)},${yOf(d.views).toFixed(2)}`);
  const linePath = n > 0 ? 'M' + pts.join(' L') : '';
  const areaPath = n > 0
    ? `M${xOf(0).toFixed(2)},${VB_H} L${pts.join(' L')} L${xOf(n - 1).toFixed(2)},${VB_H} Z`
    : '';

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const rel = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
    setHover(idx);
  }

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="font-head" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Views over time</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2 }}>Daily reach across all platforms · last 30 days</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-dim)' }}>Daily views</span>
        </div>
      </div>

      {/* Plot + y-axis */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ height: PLOT_PX, width: 46, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          {[realMax, realMax / 2, 0].map((v, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>{fn(v)}</span>
          ))}
        </div>

        <div
          ref={plotRef}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          style={{ position: 'relative', flex: 1, height: PLOT_PX, cursor: 'crosshair' }}
        >
          <svg width="100%" height={PLOT_PX} viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id="viewsOverTimeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--accent)" stopOpacity="0.26" />
                <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {GRID_YS.map(y => (
              <line key={y} x1="0" y1={y} x2={VB_W} y2={y} stroke="var(--border)" strokeDasharray="3 7" vectorEffect="non-scaling-stroke" />
            ))}
            {areaPath && <path d={areaPath} fill="url(#viewsOverTimeGrad)" />}
            {linePath && <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
            {hover !== null && (
              <line x1={xOf(hover)} y1="0" x2={xOf(hover)} y2={VB_H} stroke="var(--accent)" strokeOpacity={0.45} vectorEffect="non-scaling-stroke" />
            )}
          </svg>

          {hover !== null && (() => {
            const leftPct = n <= 1 ? 0 : (hover / (n - 1)) * 100;
            const yPx = yOf(data[hover].views) * (PLOT_PX / VB_H);
            const tx = leftPct < 12 ? '0%' : leftPct > 88 ? '-100%' : '-50%';
            return (
              <>
                {/* dot — rendered as HTML so it stays a true circle under non-uniform scaling */}
                <div style={{
                  position: 'absolute', left: `${leftPct}%`, top: yPx,
                  width: 13, height: 13, borderRadius: '50%',
                  background: 'var(--surface)', border: '3px solid var(--accent)',
                  boxSizing: 'border-box', transform: 'translate(-50%, -50%)', pointerEvents: 'none',
                }} />
                {/* tooltip */}
                <div style={{
                  position: 'absolute', left: `${leftPct}%`, top: yPx,
                  transform: `translate(${tx}, calc(-100% - 14px))`,
                  pointerEvents: 'none', zIndex: 5, whiteSpace: 'nowrap',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 10, boxShadow: 'var(--shadow)', padding: '6px 10px',
                }}>
                  <div className="kpi-num" style={{ fontSize: 14, color: 'var(--text)' }}>{fn(data[hover].views)} views</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>{fmtDate(data[hover].date, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* X-axis: first day, day 15, last day */}
      {n > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, marginLeft: 56, fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
          <span>{fmtDate(data[0].date, { month: 'short', day: 'numeric' })}</span>
          <span>{fmtDate(data[Math.floor((n - 1) / 2)].date, { month: 'short', day: 'numeric' })}</span>
          <span>{fmtDate(data[n - 1].date, { month: 'short', day: 'numeric' })}</span>
        </div>
      )}
    </div>
  );
}
