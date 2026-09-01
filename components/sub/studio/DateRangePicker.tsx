'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDismiss } from '@/lib/use-dismiss';
import {
  PRESETS, type PresetKey, presetRange, monthRange, monthLabel, monthsFromData,
  describeRange, activeSelection,
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
// Built on the same .fs-* popover language as FilterMenu/SortMenu/ChoiceMenu —
// deliberately not a native <select>, which renders as an OS menu that ignores
// every theme token and reads as foreign beside the buttons next to it.
//
// The ranges themselves live in lib/date-range.ts, shared with the callers that
// need to reason about a period outside this component (Finance).
// ============================================================================

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
  dates,
  label,
  monthCap = 18,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  align?: 'left' | 'right';
  /** Presentation only, matching MiniSelect: 'sm' dense, 'md' for filter bars. */
  size?: 'sm' | 'md';
  /**
   * The values of the column this filter narrows — deadlines, due dates, posted
   * dates. The specific-month list is built from these, so it only ever offers
   * months that actually contain something and stays right as time passes.
   * Omit and the month section simply doesn't render.
   */
  dates?: (string | null | undefined)[];
  /** Fixed word on the trigger — "Deadline · July 2026". */
  label?: string;
  /** How many months to list before older ones become custom-range-only. */
  monthCap?: number;
}) {
  const md = size === 'md';
  const [open, setOpen] = useState(false);
  // Custom-range drafts. Seeded from the applied range each time the popover
  // opens, so the inputs start where the current filter is rather than blank.
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);

  useDismiss(wrapRef, () => setOpen(false), { active: open });

  const months = useMemo(() => (dates ? monthsFromData(dates, monthCap) : []), [dates, monthCap]);
  const selected = activeSelection(from, to);

  // Every option button, in visual order — the list the arrow keys walk. The
  // custom inputs sit outside it and are reached with Tab, since typing a date
  // and roving a menu want the same keys.
  const options = useMemo(() => {
    const dated = PRESETS.filter(p => p.key !== 'all');
    return [
      ...dated.map(p => ({ kind: 'preset' as const, key: p.key, label: p.label })),
      ...months.map(m => ({ kind: 'month' as const, key: m, label: monthLabel(m) })),
      { kind: 'preset' as const, key: 'all' as PresetKey, label: 'All time' },
    ];
  }, [months]);

  function openMenu() {
    setDraftFrom(from);
    setDraftTo(to);
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

  function pick(o: { kind: 'preset' | 'month'; key: string }) {
    const r = o.kind === 'month' ? monthRange(o.key) : presetRange(o.key as PresetKey);
    apply(r.from, r.to);
  }

  // A backwards pair would filter to nothing and read as a broken table, so it
  // is refused here rather than applied. One-sided ranges stay legal.
  const customInvalid = Boolean(draftFrom && draftTo && draftFrom > draftTo);
  const customUnchanged = draftFrom === from && draftTo === to;

  function onListKeyDown(e: React.KeyboardEvent) {
    const last = options.length - 1;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActiveIdx(i => (i >= last ? 0 : i + 1)); break;
      case 'ArrowUp': e.preventDefault(); setActiveIdx(i => (i <= 0 ? last : i - 1)); break;
      case 'Home': e.preventDefault(); setActiveIdx(0); break;
      case 'End': e.preventDefault(); setActiveIdx(last); break;
      case 'Escape':
        // Handled here, not by useDismiss, so focus lands back on the trigger;
        // stopPropagation keeps the hook's Escape from also firing.
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
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
        aria-haspopup="menu"
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
          role="menu"
          aria-label={label ? `${label} range` : 'Date range'}
          onKeyDown={onListKeyDown}
        >
          <div className="fs-menu drp-scroll">
            <div className="fs-menu-head">Period</div>
            {options.map((o, i) => {
              const on = o.kind === 'month'
                ? selected.kind === 'month' && selected.key === o.key
                : selected.kind === 'preset' && selected.key === o.key;
              // The month list gets its own heading, printed before the first
              // month rather than as a separate array pass.
              const heading = o.kind === 'month' && options[i - 1]?.kind !== 'month'
                ? <div key={`h-${o.key}`} className="fs-menu-head">Month</div>
                : null;
              const isLastMonth = o.kind === 'month' && options[i + 1]?.kind !== 'month';
              return (
                <div key={`${o.kind}-${o.key}`}>
                  {heading}
                  <button
                    ref={el => { itemRefs.current[i] = el; }}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    className={on ? 'fs-menu-item is-on' : 'fs-menu-item'}
                    onClick={() => pick(o)}
                  >
                    <span>{o.label}</span>
                    {on && <span className="fs-tick" aria-hidden>✓</span>}
                  </button>
                  {isLastMonth && months.length >= monthCap && (
                    <div className="drp-note">Older months: use the custom range below.</div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="drp-custom">
            <div className="fs-menu-head">Custom range</div>
            <div className="drp-inputs">
              <label className="drp-input">
                <span>From</span>
                <input
                  className={`form-input${customInvalid ? ' is-invalid' : ''}`}
                  type="date"
                  value={draftFrom}
                  max={draftTo || undefined}
                  aria-label="Range start"
                  onChange={e => setDraftFrom(e.target.value)}
                />
              </label>
              <label className="drp-input">
                <span>To</span>
                <input
                  className={`form-input${customInvalid ? ' is-invalid' : ''}`}
                  type="date"
                  value={draftTo}
                  min={draftFrom || undefined}
                  aria-label="Range end"
                  onChange={e => setDraftTo(e.target.value)}
                />
              </label>
            </div>
            {customInvalid && (
              <div className="form-error" role="alert">Start date is after the end date.</div>
            )}
            <div className="drp-custom-actions">
              <button
                type="button"
                className="fs-clear"
                onClick={() => apply('', '')}
                disabled={isDefault}
              >Clear</button>
              <button
                type="button"
                className="btn-primary drp-apply"
                onClick={() => apply(draftFrom, draftTo)}
                disabled={customInvalid || customUnchanged || (!draftFrom && !draftTo)}
              >Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
