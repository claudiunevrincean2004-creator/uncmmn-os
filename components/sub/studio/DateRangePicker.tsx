'use client';
import { useMemo, useRef, useState } from 'react';
import { useDismiss } from '@/lib/use-dismiss';

// Shared date-range filter used across every table that filters by date. Renders a
// single button showing the active range ("All time" / "Last 30 days" / "Jun 1 –
// Jun 30"); clicking it opens an aurora/midnight popover with quick presets and a
// click-start-then-end calendar. Emits ISO yyyy-mm-dd strings ('' = open bound),
// so callers keep filtering with the existing inDateRange(from, to) helper.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Local-time yyyy-mm-dd (native <input type=date> and our data both use local dates).
function fmtISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseISO(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function sameDay(a: Date, b: Date): boolean { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

interface Preset { key: string; label: string; from: string; to: string }

// Presets are recomputed from "today" on every open so rolling windows stay correct.
function buildPresets(): Preset[] {
  const today = new Date();
  const t = fmtISO(today);
  const thisM0 = startOfMonth(today), thisM1 = endOfMonth(today);
  const lastMonthRef = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return [
    { key: 'all', label: 'All time', from: '', to: '' },
    { key: '7d', label: 'Last 7 days', from: fmtISO(addDays(today, -6)), to: t },
    { key: '30d', label: 'Last 30 days', from: fmtISO(addDays(today, -29)), to: t },
    { key: 'month', label: 'This month', from: fmtISO(thisM0), to: fmtISO(thisM1) },
    { key: 'lastmonth', label: 'Last month', from: fmtISO(startOfMonth(lastMonthRef)), to: fmtISO(endOfMonth(lastMonthRef)) },
  ];
}

function labelFor(from: string, to: string, presets: Preset[]): string {
  if (!from && !to) return 'All time';
  const preset = presets.find(p => p.from === from && p.to === to && p.key !== 'all');
  if (preset) return preset.label;
  const fd = parseISO(from), td = parseISO(to);
  const thisYear = new Date().getFullYear();
  const withYear = (fd?.getFullYear() ?? thisYear) !== thisYear || (td?.getFullYear() ?? thisYear) !== thisYear || (fd && td && fd.getFullYear() !== td.getFullYear());
  const one = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}${withYear ? `, ${d.getFullYear()}` : ''}`;
  if (fd && td) return `${one(fd)} – ${one(td)}`;
  if (fd) return `From ${one(fd)}`;
  if (td) return `Until ${one(td)}`;
  return 'All time';
}

// `size` is presentation only, matching MiniSelect: 'sm' is the dense legacy
// trigger, 'md' the roomier one the Studio filter bars use so every control in
// that row is the same height and weight.
export default function DateRangePicker({ from, to, onChange, align = 'left', size = 'sm' }: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  align?: 'left' | 'right';
  size?: 'sm' | 'md';
}) {
  const md = size === 'md';
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState<Date | null>(null); // pending start click
  const [hover, setHover] = useState<Date | null>(null);
  const [view, setView] = useState<Date>(() => parseISO(from) || parseISO(to) || new Date());
  const wrapRef = useRef<HTMLDivElement>(null);

  const presets = buildPresets(); // cheap; recomputed each render so rolling windows track "today"
  const fromD = parseISO(from), toD = parseISO(to);

  useDismiss(wrapRef, () => { setOpen(false); setSelecting(null); setHover(null); }, { active: open });

  function apply(f: string, t: string) {
    onChange(f, t);
    setOpen(false);
    setSelecting(null);
    setHover(null);
  }

  function pickPreset(p: Preset) {
    apply(p.from, p.to);
  }

  function pickDay(d: Date) {
    if (!selecting) { setSelecting(d); setHover(d); return; }
    const [a, b] = d < selecting ? [d, selecting] : [selecting, d];
    apply(fmtISO(a), fmtISO(b));
  }

  // The range currently painted on the calendar: the pending selection while the
  // user is mid-pick, otherwise the applied range.
  const paint = selecting
    ? (() => { const h = hover || selecting; return h < selecting ? { a: h, b: selecting } : { a: selecting, b: h }; })()
    : (fromD && toD ? { a: fromD, b: toD } : fromD ? { a: fromD, b: fromD } : null);

  const grid = useMemo(() => {
    const first = startOfMonth(view);
    const start = addDays(first, -first.getDay()); // back to the Sunday of the first week
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [view]);

  const activePresetKey = presets.find(p => p.from === from && p.to === to)?.key ?? (from || to ? 'custom' : 'all');
  const today = new Date();

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="form-input"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: md ? 8 : 6,
          fontSize: md ? 12 : 11,
          padding: md ? '8px 12px' : '4px 9px',
          borderRadius: md ? 10 : undefined,
          minWidth: md ? 120 : undefined,
          width: 'auto',
          background: md ? 'var(--surface)' : undefined,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          color: from || to ? 'var(--text)' : 'var(--text-dim)',
        }}
        title="Filter by date range"
      >
        <span>{labelFor(from, to, presets)}</span>
        <span style={{ color: 'var(--text-faint)', fontSize: 9 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: align === 'left' ? 0 : undefined, right: align === 'right' ? 0 : undefined, zIndex: 1500,
            display: 'flex', background: 'var(--surface)', border: '0.5px solid var(--border)',
            borderRadius: 12, boxShadow: '0 16px 48px rgba(0,0,0,0.32)', overflow: 'hidden',
          }}
        >
          {/* Presets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 8, borderRight: '0.5px solid var(--border)', minWidth: 132 }}>
            {presets.map(p => {
              const on = activePresetKey === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => pickPreset(p)}
                  style={{
                    textAlign: 'left', fontSize: 12, padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                    border: 'none', fontFamily: 'inherit',
                    background: on ? 'var(--accent-soft)' : 'transparent',
                    color: on ? 'var(--accent)' : 'var(--text-dim)',
                    fontWeight: on ? 600 : 400,
                  }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--surface-2)'; }}
                  onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                >{p.label}</button>
              );
            })}
          </div>

          {/* Calendar */}
          <div style={{ padding: 12, width: 246 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <button onClick={() => setView(v => new Date(v.getFullYear(), v.getMonth() - 1, 1))} style={navBtn} title="Previous month">‹</button>
              <div className="font-head" style={{ fontSize: 12, fontWeight: 600 }}>{MONTHS_FULL[view.getMonth()]} {view.getFullYear()}</div>
              <button onClick={() => setView(v => new Date(v.getFullYear(), v.getMonth() + 1, 1))} style={navBtn} title="Next month">›</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
              {WEEKDAYS.map((w, i) => <div key={i} style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-faint)', fontWeight: 600 }}>{w}</div>)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }} onMouseLeave={() => selecting && setHover(selecting)}>
              {grid.map((d, i) => {
                const inMonth = d.getMonth() === view.getMonth();
                const isEnd = paint && (sameDay(d, paint.a) || sameDay(d, paint.b));
                const inRange = paint && d >= paint.a && d <= paint.b;
                const isToday = sameDay(d, today);
                return (
                  <button
                    key={i}
                    onClick={() => pickDay(d)}
                    onMouseEnter={() => selecting && setHover(d)}
                    style={{
                      height: 28, borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
                      background: isEnd ? 'var(--accent)' : inRange ? 'var(--accent-soft)' : 'transparent',
                      color: isEnd ? '#fff' : inMonth ? 'var(--text)' : 'var(--text-faint)',
                      fontWeight: isEnd ? 700 : isToday ? 700 : 400,
                      boxShadow: isToday && !isEnd ? 'inset 0 0 0 1px var(--border)' : undefined,
                      transition: 'background 0.1s',
                    }}
                  >{d.getDate()}</button>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '0.5px solid var(--border)' }}>
              <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                {selecting ? 'Pick an end date…' : 'Click a start & end date'}
              </span>
              <button onClick={() => apply('', '')} style={{ fontSize: 11, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px' }}>Clear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 6, border: '0.5px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text-dim)', cursor: 'pointer', fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
};
