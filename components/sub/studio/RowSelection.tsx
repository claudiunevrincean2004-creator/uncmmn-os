'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// ============================================================================
// Notion-style row selection for the Studio tables.
//
// Built as a shared module rather than inline in one tab, for the same reason
// TableToolbar and ItemPanel are shared: four tables render the same table
// shell, and a second copy of this logic is how they start to drift. Only Video
// Review's TABLE view wires it up today — the Board deliberately has no
// selection, because its bulk gesture is already drag-and-drop.
//
// The hook owns WHICH rows are selected; the caller owns what a bulk action
// does with them. Nothing here touches Supabase.
// ============================================================================

export interface RowSelection {
  /** Selected ids, always a subset of the rows currently listed. */
  selected: Set<string>;
  count: number;
  isSelected: (id: string) => boolean;
  /** `shift` extends from the last-clicked row, Notion-style. */
  toggle: (id: string, shift?: boolean) => void;
  clear: () => void;
  /** Header checkbox state, over the FILTERED set — not the whole table. */
  allSelected: boolean;
  someSelected: boolean;
  toggleAll: () => void;
}

/**
 * @param allIds  Every row the current filters admit, in display order. This is
 *                the set "select all" covers and the set the selection is
 *                pruned against — so a row that a filter (or a delete arriving
 *                over realtime) removes drops out of the count on its own, and
 *                the number in the bar always describes rows that exist.
 * @param resetKey  Filters/search/view, joined. When it changes the selection
 *                is dropped: it described a set that is no longer on screen.
 * @param enabled  false suspends Escape-to-clear — passed false while a modal
 *                is open, so one Escape doesn't close the modal AND wipe the
 *                selection behind it.
 */
export function useRowSelection(allIds: string[], resetKey: string, enabled = true): RowSelection {
  const [raw, setRaw] = useState<ReadonlySet<string>>(() => new Set());
  // The last row clicked without shift — one end of the next shift range.
  const anchorRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setRaw(prev => (prev.size ? new Set() : prev));
    anchorRef.current = null;
  }, []);

  useEffect(() => { reset(); }, [resetKey, reset]);

  // Storage is a plain Set of ids; what the rest of the app reads is this
  // pruned view, so a stale id can never inflate the count or reach a write.
  const selected = useMemo(() => {
    const live = new Set<string>();
    for (const id of allIds) if (raw.has(id)) live.add(id);
    return live;
  }, [allIds, raw]);

  useEffect(() => {
    if (!enabled || selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') reset(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, selected.size, reset]);

  const toggle = useCallback((id: string, shift = false) => {
    setRaw(prev => {
      const next = new Set(prev);
      const anchor = anchorRef.current;
      if (shift && anchor && anchor !== id) {
        const a = allIds.indexOf(anchor);
        const b = allIds.indexOf(id);
        if (a !== -1 && b !== -1) {
          // A shift-click ADDS the range and never unselects it — the same rule
          // Notion and Finder use, so dragging a selection wider can't
          // accidentally punch a hole in what you already had.
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(allIds[i]);
          return next;
        }
      }
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    // The clicked row anchors the next range, shift-click included — so a second
    // shift-click walks the range out from where the last one landed.
    anchorRef.current = id;
  }, [allIds]);

  const allSelected = allIds.length > 0 && selected.size === allIds.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = useCallback(() => {
    setRaw(prev => {
      // Recomputed here rather than closing over `allSelected`, so the header
      // box behaves the same whether or not a re-render has landed yet.
      let live = 0;
      for (const id of allIds) if (prev.has(id)) live++;
      return live === allIds.length ? new Set() : new Set(allIds);
    });
    anchorRef.current = null;
  }, [allIds]);

  return {
    selected,
    count: selected.size,
    isSelected: useCallback((id: string) => selected.has(id), [selected]),
    toggle,
    clear: reset,
    allSelected,
    someSelected,
    toggleAll,
  };
}

/**
 * The checkbox itself. Fully driven from `onClick` rather than `onChange`,
 * because that is the only event carrying `shiftKey` — a keyboard Space fires a
 * click too, so this stays operable without a mouse.
 */
export function RowCheckbox({
  checked,
  indeterminate = false,
  label,
  onToggle,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onToggle: (shift: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Indeterminate has no HTML attribute — it can only be set on the element.
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className="st-check"
      checked={checked}
      aria-label={label}
      title={label}
      onClick={e => {
        // The row opens its detail panel on click. openOnRowClick already skips
        // inputs; this stops the event before the wrapping cell's handler too,
        // so ticking a box can never also open the panel.
        e.stopPropagation();
        onToggle(e.shiftKey);
      }}
      // React requires a handler beside `checked`. The click above has already
      // done the work — including for Space, which dispatches a click.
      onChange={() => { /* handled in onClick, which carries shiftKey */ }}
    />
  );
}

/**
 * The selection cell. Clicking the padding around the box counts as clicking
 * the box — a 15px target is small, and the row underneath would otherwise open
 * its detail panel instead. The box's own click stops before it reaches here,
 * so a direct hit still toggles exactly once.
 */
export function SelectCell({
  children,
  header = false,
  onToggle,
}: {
  children: ReactNode;
  header?: boolean;
  onToggle: (shift: boolean) => void;
}) {
  const props = {
    className: 'st-selcell',
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); onToggle(e.shiftKey); },
  };
  return header ? <th {...props}>{children}</th> : <td {...props}>{children}</td>;
}

/**
 * Floating action bar, fixed near the bottom of the viewport. Rendered only
 * while something is selected.
 */
export function SelectionBar({
  count,
  offscreen,
  busy,
  onClear,
  children,
}: {
  count: number;
  /** Selected rows past the last rendered one — see the note it prints. */
  offscreen: number;
  busy?: boolean;
  onClear: () => void;
  /** The tab's bulk actions. */
  children?: ReactNode;
}) {
  return (
    <div className="sel-bar" role="region" aria-label={`${count} selected`}>
      <div className="sel-bar-count">
        <span className="sel-bar-num">{count}</span>
        <span>selected</span>
      </div>

      {offscreen > 0 && (
        // "Select all" covers everything the filters admit, which can run past
        // the rows loaded so far. Saying so is the difference between a bulk
        // action that surprises you and one that doesn't.
        <span className="sel-bar-note" title="Selected by “select all”, but past the last row loaded. Load more to see them — a bulk action still applies to every one.">
          {offscreen} not shown below
        </span>
      )}

      <div className="sel-bar-actions">
        {children}
        <button type="button" className="sel-bar-clear" onClick={onClear} disabled={busy}>
          Clear
        </button>
      </div>
    </div>
  );
}
