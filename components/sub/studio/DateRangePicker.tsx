'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDismiss } from '@/lib/use-dismiss';
import {
  PRESETS, type PresetKey, presetRange, describeRange, activeSelection,
  parseISO, ymd, startOfMonth,
} from '@/lib/date-range';

// ============================================================================
// THE date-range filter. One component, used by every surface in the app that
// filters by date — the Studio tables, Clip Library, Trial Reels and the
// Finance period picker — so the options can't drift apart tab to tab.
//
// It emits the same inclusive [from, to] pair of ISO yyyy-mm-dd strings it
// always did ('' = open bound), so a caller keeps filtering on whatever column
// it already filtered on. This component decides WHICH ranges are selectable,
// never which column they apply to.
//
// The calendar below is hand-built — no date library. It is ~120 lines of month
// arithmetic against Date, and every pixel of it is a theme token, which is the
// thing a third-party calendar makes hardest. The popover shell is the same
// .fs-* language as FilterMenu/SortMenu, so this reads as one of them.
// ============================================================================

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** A draft field is usable only once it's a complete date — half-typed text isn't. */
function valid(s: string): Date | null {
  return ISO_RE.test(s) ? parseISO(s) : null;
}

/** Exported so a filter chip can read exactly what the trigger reads. */
export function rangeLabel(from: string, to: string): string {
  return describeRange(from, to);
}

export default function DateRangePicker({
  from,
  to,
  onChange,
  align = 'left',
  size = 'sm',
  label,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  align?: 'left' | 'right';
  /** Presentation only, matching MiniSelect: 'sm' dense, 'md' for filter bars. */
  size?: 'sm' | 'md';
  /** Fixed word on the trigger — "Deadline · Last month". */
  label?: string;
}) {
  const md = size === 'md';
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  // Which end the calendar is currently setting. null = calendar collapsed.
  const [target, setTarget] = useState<'from' | 'to' | null>(null);
  const [view, setView] = useState<Date>(() => new Date());
  // The month/year jump panel, so a year away isn't twelve clicks.
  const [chooser, setChooser] = useState(false);
  const [hover, setHover] = useState<Date | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);

  useDismiss(wrapRef, () => setOpen(false), { active: open });

  const selected = activeSelection(from, to);
  const fromD = valid(draftFrom);
  const toD = valid(draftTo);

  function openMenu() {
    setDraftFrom(from);
    setDraftTo(to);
    setTarget(null);
    setChooser(false);
    setHover(null);
    setView(valid(from) || valid(to) || new Date());
    setActiveIdx(-1);
    setOpen(true);
  }
  function close(focusTrigger: boolean) {
    setOpen(false);
    setActiveIdx(-1);
    if (focusTrigger) btnRef.current?.focus();
  }

  useEffect(() => {
    if (open && activeIdx >= 0) itemRefs.current[activeIdx]?.focus();
  }, [open, activeIdx]);

  function apply(f: string, t: string) {
    onChange(f, t);
    close(true);
  }

  function pickPreset(key: PresetKey) {
    const r = presetRange(key);
    apply(r.from, r.to);
  }

  /** Arm the calendar on one end, and show that end's month. */
  function focusField(which: 'from' | 'to') {
    setTarget(which);
    setChooser(false);
    const anchor = which === 'from' ? fromD : toD;
    setView(anchor || fromD || toD || new Date());
  }

  function pickDay(d: Date) {
    const iso = ymd(d);
    if (target === 'to') {
      setDraftTo(iso);
      return;
    }
    setDraftFrom(iso);
    // A new start past the existing end would be backwards. Rather than refuse
    // the click, drop the end and let them pick a fresh one — the same thing
    // every booking calendar does.
    if (toD && iso > draftTo) setDraftTo('');
    setTarget('to');
  }

  // The span painted on the grid: the committed pair, or a live preview of what
  // the hovered day would make it while the end is being chosen.
  const paint = useMemo(() => {
    const a = fromD;
    const b = target === 'to' && !toD && hover && a && hover >= a ? hover : toD;
    if (a && b) return { a, b };
    if (a) return { a, b: a };
    return null;
  }, [fromD, toD, target, hover]);

  const grid = useMemo(() => {
    const first = startOfMonth(view);
    const start = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [view]);

  const today = new Date();
  const bothBlank = !draftFrom && !draftTo;
  const parseError =
    (draftFrom !== '' && !fromD) || (draftTo !== '' && !toD);
  const orderError = Boolean(fromD && toD && draftFrom > draftTo);
  const customUnchanged = draftFrom === from && draftTo === to;

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Escape') return;
    // Handled here, not by useDismiss, so focus lands back on the trigger;
    // stopPropagation keeps the hook's own Escape from also firing.
    e.preventDefault();
    e.stopPropagation();
    close(true);
  }

  function onOptionsKeyDown(e: React.KeyboardEvent) {
    const last = PRESETS.length - 1;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActiveIdx(i => (i >= last ? 0 : i + 1)); break;
      case 'ArrowUp': e.preventDefault(); setActiveIdx(i => (i <= 0 ? last : i - 1)); break;
      case 'Home': e.preventDefault(); setActiveIdx(0); break;
      case 'End': e.preventDefault(); setActiveIdx(last); break;
    }
  }

  const isDefault = !from && !to;
  const text = describeRange(from, to);

  return (
    <div className="fs-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={`drp-trigger${md ? ' is-md' : ''}${isDefault ? '' : ' is-on'}`}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openMenu(); setActiveIdx(0); }
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label ? `${label}: ${text}` : `Filter by date range — ${text}`}
      >
        {label && <span className="drp-trigger-label">{label}</span>}
        <span className="drp-trigger-val">{label ? `· ${text}` : text}</span>
        <span className="fs-caret" aria-hidden>▾</span>
      </button>

      {open && (
        <div
          className={`fs-pop drp-pop2${align === 'right' ? ' fs-pop-right' : ''}`}
          role="dialog"
          aria-label={label ? `${label} range` : 'Date range'}
          onKeyDown={onListKeyDown}
        >
          <div className="fs-menu" role="group" aria-label="Period" onKeyDown={onOptionsKeyDown}>
            <div className="fs-menu-head">Period</div>
            {PRESETS.map((p, i) => {
              const on = selected.kind === 'preset' && selected.key === p.key;
              return (
                <button
                  key={p.key}
                  ref={el => { itemRefs.current[i] = el; }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  className={on ? 'fs-menu-item is-on' : 'fs-menu-item'}
                  onClick={() => pickPreset(p.key)}
                >
                  <span>{p.label}</span>
                  {on && <span className="fs-tick" aria-hidden>✓</span>}
                </button>
              );
            })}
          </div>

          <div className="drp-custom">
            <div className="fs-menu-head">Custom range</div>

            {/* Two fields you can type into; clicking either aims the calendar
                at that end. The calendar is the primary gesture, the text is
                the escape hatch for people who'd rather type. */}
            <div className="drp-fields">
              {(['from', 'to'] as const).map(which => (
                <label key={which} className={`drp-field${target === which ? ' is-active' : ''}`}>
                  <span className="drp-field-label">{which === 'from' ? 'From' : 'To'}</span>
                  <input
                    className={`form-input${parseError || orderError ? ' is-invalid' : ''}`}
                    type="text"
                    inputMode="numeric"
                    placeholder="yyyy-mm-dd"
                    aria-label={which === 'from' ? 'Range start' : 'Range end'}
                    value={which === 'from' ? draftFrom : draftTo}
                    onFocus={() => focusField(which)}
                    onClick={() => focusField(which)}
                    onChange={e => {
                      const v = e.target.value;
                      if (which === 'from') setDraftFrom(v); else setDraftTo(v);
                      const d = valid(v);
                      if (d) setView(d);
                    }}
                  />
                </label>
              ))}
            </div>

            {target && (
              <div className="drp-cal">
                <div className="drp-cal-head">
                  <button
                    type="button"
                    className="drp-nav"
                    onClick={() => setView(v => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
                    aria-label="Previous month"
                  >‹</button>
                  {/* The caption is the year/month jump — twelve arrow clicks to
                      reach last July is not navigation. */}
                  <button
                    type="button"
                    className={`drp-caption${chooser ? ' is-open' : ''}`}
                    onClick={() => setChooser(c => !c)}
                    aria-expanded={chooser}
                    title="Jump to a month or year"
                  >
                    {MONTHS_FULL[view.getMonth()]} {view.getFullYear()}
                    <span className="fs-caret" aria-hidden>▾</span>
                  </button>
                  <button
                    type="button"
                    className="drp-nav"
                    onClick={() => setView(v => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
                    aria-label="Next month"
                  >›</button>
                </div>

                {chooser ? (
                  <div className="drp-chooser">
                    <div className="drp-year">
                      <button type="button" className="drp-nav" onClick={() => setView(v => new Date(v.getFullYear() - 1, v.getMonth(), 1))} aria-label="Previous year">‹</button>
                      <span className="drp-year-val">{view.getFullYear()}</span>
                      <button type="button" className="drp-nav" onClick={() => setView(v => new Date(v.getFullYear() + 1, v.getMonth(), 1))} aria-label="Next year">›</button>
                    </div>
                    <div className="drp-months">
                      {MONTHS_ABBR.map((m, i) => (
                        <button
                          key={m}
                          type="button"
                          className={`drp-month${i === view.getMonth() ? ' is-on' : ''}`}
                          onClick={() => { setView(v => new Date(v.getFullYear(), i, 1)); setChooser(false); }}
                        >{m}</button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="drp-dow" aria-hidden>
                      {WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}
                    </div>
                    <div className="drp-grid" onMouseLeave={() => setHover(null)}>
                      {grid.map((d, i) => {
                        const outside = d.getMonth() !== view.getMonth();
                        // The one hard rule: an end before the start is not
                        // selectable at all, so the pair can't go backwards.
                        const blocked = target === 'to' && Boolean(fromD) && d < (fromD as Date);
                        const edge =
                          (fromD && sameDay(d, fromD)) ||
                          (toD && sameDay(d, toD)) ||
                          Boolean(paint && (sameDay(d, paint.a) || sameDay(d, paint.b)));
                        const inSpan = Boolean(paint && d > paint.a && d < paint.b);
                        const cls = [
                          'drp-day',
                          outside ? 'is-out' : '',
                          edge ? 'is-edge' : '',
                          inSpan ? 'is-span' : '',
                          sameDay(d, today) ? 'is-today' : '',
                        ].filter(Boolean).join(' ');
                        return (
                          <button
                            key={i}
                            type="button"
                            className={cls}
                            disabled={blocked}
                            aria-label={ymd(d)}
                            aria-current={sameDay(d, today) ? 'date' : undefined}
                            onMouseEnter={() => setHover(d)}
                            onClick={() => pickDay(d)}
                          >{d.getDate()}</button>
                        );
                      })}
                    </div>
                    <div className="drp-hint">
                      {target === 'from' ? 'Pick a start date' : 'Pick an end date'}
                    </div>
                  </>
                )}
              </div>
            )}

            {parseError && <div className="form-error" role="alert">Use yyyy-mm-dd, or pick from the calendar.</div>}
            {!parseError && orderError && <div className="form-error" role="alert">Start date is after the end date.</div>}

            <div className="drp-custom-actions">
              <button type="button" className="fs-clear" onClick={() => apply('', '')} disabled={isDefault}>Clear</button>
              <button
                type="button"
                className="btn-primary drp-apply"
                onClick={() => apply(draftFrom, draftTo)}
                disabled={parseError || orderError || customUnchanged || bothBlank}
              >Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
