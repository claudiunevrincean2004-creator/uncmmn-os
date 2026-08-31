'use client';
import { useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { useDismiss } from '@/lib/use-dismiss';
import DateRangePicker, { rangeLabel } from './DateRangePicker';
import { SortOption, SortDir, dirLabel, resolveOption } from '@/lib/sort';

// ============================================================================
// Notion-style collapsed filter & sort controls for the Studio tables.
//
// Instead of every dropdown living in the bar at once, the bar carries two
// buttons — Filter and Sort — that each open a popover. NOTHING about how the
// tables filter or sort changes: each condition is just a view onto the state
// the tab already owns (the same 'All' sentinel for selects, the same
// from/to ISO pair for dates), so `defs` is a description of existing state,
// never a second copy of it.
//
// The one hard rule this file exists to enforce: an active filter is NEVER
// invisible. The button carries a count badge and lights up, and every
// narrowing condition also renders as its own removable chip in the bar
// (<FilterChips />) — so nobody stares at a short list wondering where the
// rows went.
// ============================================================================

/** A select-backed condition: `value` is 'All' when it isn't narrowing. */
export interface SelectFilterDef {
  kind: 'select';
  key: string;
  /** Property name, as it reads in the popover and on the chip ("Status"). */
  label: string;
  value: string;
  /** Option values, including the leading 'All'. */
  options: string[];
  /** How 'All' reads inside the popover ("Any status"). */
  anyLabel?: string;
  onChange: (v: string) => void;
}

/** A date-range condition, backed by the existing from/to ISO pair. */
export interface DateFilterDef {
  kind: 'date';
  key: string;
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

export type FilterDef = SelectFilterDef | DateFilterDef;

/** Is this condition actually narrowing the rows? (Drives badges and chips.) */
export function isFilterActive(d: FilterDef): boolean {
  return d.kind === 'date' ? Boolean(d.from || d.to) : d.value !== 'All';
}

/** The condition's value as it reads on a chip. */
function filterValueLabel(d: FilterDef): string {
  return d.kind === 'date' ? rangeLabel(d.from, d.to) : d.value;
}

/** Reset one condition to "no constraint", through the tab's own setter. */
function clearFilter(d: FilterDef) {
  if (d.kind === 'date') d.onChange('', '');
  else d.onChange('All');
}

// ---------------------------------------------------------------------------
// Chips — the always-visible half of the collapsed bar
// ---------------------------------------------------------------------------

/**
 * One removable chip per narrowing condition ("Status: Ready to Edit ×"),
 * rendered in the toolbar beside the Filter button. Renders nothing when no
 * filter is on, so an unfiltered bar stays clean.
 */
export function FilterChips({ defs }: { defs: FilterDef[] }) {
  const active = defs.filter(isFilterActive);
  if (!active.length) return null;
  return (
    <>
      {active.map(d => (
        <span key={d.key} className="fs-chip">
          <span className="fs-chip-prop">{d.label}:</span>
          <span className="fs-chip-val">{filterValueLabel(d)}</span>
          <button
            type="button"
            className="fs-chip-x"
            onClick={() => clearFilter(d)}
            title={`Remove ${d.label} filter`}
            aria-label={`Remove ${d.label} filter`}
          >
            ✕
          </button>
        </span>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Filter popover
// ---------------------------------------------------------------------------

/**
 * "Filter · 2" button + popover. Conditions combine with AND — which is what
 * the tabs already do, since each `defs` entry narrows the same row list in
 * turn. Changes apply immediately; there is no Apply button.
 */
export function FilterMenu({ defs }: { defs: FilterDef[] }) {
  const [open, setOpen] = useState(false);
  // Conditions the user added in this popover that aren't narrowing yet (value
  // still "Any"). Active ones don't need tracking — they show themselves.
  const [added, setAdded] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useDismiss(wrapRef, () => { setOpen(false); setPicking(false); }, { active: open });

  const activeCount = defs.filter(isFilterActive).length;
  const rows = defs.filter(d => isFilterActive(d) || added.includes(d.key));
  const unused = defs.filter(d => !rows.includes(d));

  function addRow(key: string) {
    setAdded(a => (a.includes(key) ? a : [...a, key]));
    setPicking(false);
  }

  function removeRow(d: FilterDef) {
    clearFilter(d);
    setAdded(a => a.filter(k => k !== d.key));
  }

  // Swapping a row's property clears the old one and opens the new one in place.
  function swapRow(from: FilterDef, toKey: string) {
    const next = defs.find(d => d.key === toKey);
    if (!next || next.key === from.key) return;
    clearFilter(from);
    setAdded(a => [...a.filter(k => k !== from.key), next.key]);
  }

  function clearAll() {
    defs.forEach(clearFilter);
    setAdded([]);
    setPicking(false);
  }

  return (
    <div className="fs-wrap" ref={wrapRef}>
      <button
        type="button"
        className={activeCount ? 'fs-btn is-on' : 'fs-btn'}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={activeCount ? `${activeCount} filter${activeCount === 1 ? '' : 's'} applied` : 'Filter'}
      >
        <Icon name="filter" size={14} />
        Filter
        {activeCount > 0 && <span className="fs-badge">{activeCount}</span>}
      </button>

      {open && (
        <div className="fs-pop" role="dialog" aria-label="Filters">
          {rows.length > 0 && (
            <div className="fs-rows">
              {rows.map((d, i) => (
                <div className="fs-row" key={d.key}>
                  <span className="fs-conj">{i === 0 ? 'Where' : 'And'}</span>

                  <select
                    className="form-input fs-input fs-prop"
                    value={d.key}
                    onChange={e => swapRow(d, e.target.value)}
                    aria-label={`Filter property (currently ${d.label})`}
                  >
                    <option value={d.key}>{d.label}</option>
                    {unused.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
                  </select>

                  {d.kind === 'select' ? (
                    <select
                      className="form-input fs-input fs-val"
                      value={d.value}
                      onChange={e => d.onChange(e.target.value)}
                      aria-label={`${d.label} value`}
                    >
                      {d.options.map(o => (
                        <option key={o} value={o}>{o === 'All' ? (d.anyLabel ?? 'Any') : o}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="fs-val">
                      <DateRangePicker size="md" from={d.from} to={d.to} onChange={d.onChange} />
                    </div>
                  )}

                  <button
                    type="button"
                    className="fs-row-x"
                    onClick={() => removeRow(d)}
                    title={`Remove ${d.label} condition`}
                    aria-label={`Remove ${d.label} condition`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* With no conditions yet, the property list IS the popover — one
              click to a filter instead of two. */}
          {rows.length === 0 || picking ? (
            unused.length ? (
              <div className="fs-menu">
                {rows.length === 0 && <div className="fs-menu-head">Filter videos by…</div>}
                {unused.map(u => (
                  <button key={u.key} type="button" className="fs-menu-item" onClick={() => addRow(u.key)}>
                    {u.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="fs-empty">Every property is already filtered.</div>
            )
          ) : (
            unused.length > 0 && (
              <button type="button" className="fs-add" onClick={() => setPicking(true)}>
                <span aria-hidden>+</span> Add filter
              </button>
            )
          )}

          {activeCount > 0 && (
            <div className="fs-foot">
              <button type="button" className="fs-clear" onClick={clearAll}>Clear all</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort popover
// ---------------------------------------------------------------------------

/**
 * "Sort · Status ↑" button + popover: the table's sortable properties and the
 * existing direction toggle, whose labels stay phrased per property kind
 * (dates say Oldest/Newest, statuses say First → Last). sortRows is
 * single-level, so this is too — no new sorting behaviour is invented here.
 *
 * `defaultKey`/`defaultDir` are what the tab starts at; matching them reads as
 * "no sort applied" and leaves the button quiet.
 */
export function SortMenu<T>({
  options, sortKey, sortDir, onKeyChange, onDirChange, defaultKey, defaultDir = 'asc',
}: {
  options: SortOption<T>[];
  sortKey: string;
  sortDir: SortDir;
  onKeyChange: (key: string) => void;
  onDirChange: (dir: SortDir) => void;
  defaultKey: string;
  defaultDir?: SortDir;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useDismiss(wrapRef, () => setOpen(false), { active: open });

  const active = resolveOption(options, sortKey);
  const isDefault = active.key === defaultKey && sortDir === defaultDir;
  const arrow = sortDir === 'asc' ? '↑' : '↓';

  return (
    <div className="fs-wrap" ref={wrapRef}>
      <button
        type="button"
        className={isDefault ? 'fs-btn' : 'fs-btn is-on'}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`Sorted by ${active.label} — ${dirLabel(active.kind, sortDir)}`}
      >
        <Icon name="sort" size={14} />
        Sort
        {!isDefault && <span className="fs-btn-val">· {active.label} {arrow}</span>}
      </button>

      {open && (
        <div className="fs-pop fs-pop-sort" role="dialog" aria-label="Sort">
          <div className="fs-menu-head">Sort by</div>
          <div className="fs-menu">
            {options.map(o => (
              <button
                key={o.key}
                type="button"
                className={o.key === active.key ? 'fs-menu-item is-on' : 'fs-menu-item'}
                aria-pressed={o.key === active.key}
                onClick={() => onKeyChange(o.key)}
              >
                {o.label}
                {o.key === active.key && <span className="fs-tick" aria-hidden>✓</span>}
              </button>
            ))}
          </div>

          <div className="fs-dir">
            {(['asc', 'desc'] as SortDir[]).map(d => (
              <button
                key={d}
                type="button"
                className={sortDir === d ? 'active' : undefined}
                aria-pressed={sortDir === d}
                onClick={() => onDirChange(d)}
              >
                {dirLabel(active.kind, d)}
              </button>
            ))}
          </div>

          {!isDefault && (
            <div className="fs-foot">
              <button
                type="button"
                className="fs-clear"
                onClick={() => { onKeyChange(defaultKey); onDirChange(defaultDir); }}
              >
                Reset sort
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
