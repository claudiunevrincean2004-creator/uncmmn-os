'use client';
import { ReactNode } from 'react';
import ViewToggle, { type StudioView } from './ViewToggle';

// ============================================================================
// Shared shell for the four Studio tables (Video Review, Story Sequences,
// Filming Sessions, Ad Creative). Everything visual lives here or in the
// .studio-* block in globals.css, so the tabs can't drift apart: one item per
// row, aligned columns, a status-tinted rail on the left, hairline dividers.
// ============================================================================

/**
 * The row's left accent rail colour, passed down as a CSS custom property that
 * `.studio-table tbody td:first-child::before` reads. Falls back to the brand
 * accent when a status has no colour of its own.
 */
export function rowAccent(color?: string | null): React.CSSProperties {
  return { '--row-accent': color || 'var(--accent)' } as React.CSSProperties;
}

/**
 * Click anywhere on the row to open its side panel — except on the row's own
 * controls. Pills, link editors, date inputs, the copy-link icon and the delete
 * button all keep their own click; only the inert parts of the row open it.
 */
export function openOnRowClick(open: () => void) {
  return (e: React.MouseEvent<HTMLTableRowElement>) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest('button, a, select, input, textarea, label')) return;
    open();
  };
}

/**
 * First cell of every Studio row: the title on its own, plus the hover-revealed
 * copy-link button. No date rides alongside it — every table already carries its
 * dates in their own column.
 */
export function TitleCell({
  title,
  onOpen,
  children,
}: {
  title: string;
  onOpen: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="st-title-wrap">
      <button className="st-title" onClick={onOpen} title="Open details">
        {title || 'Untitled'}
      </button>
      {children}
    </div>
  );
}

interface ToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  /** Table / Board switch — omit the pair to hide it. */
  view?: StudioView;
  onViewChange?: (v: StudioView) => void;
  /** Rows after filtering — what the count reports. */
  count: number;
  /** Singular noun; pluralised with a trailing "s" unless countPlural is given. */
  countNoun: string;
  /** Explicit plural, for nouns a trailing "s" gets wrong ("person" → "people"). */
  countPlural?: string;
  /** Bare label — the button draws its own "+", so don't prefix one. */
  actionLabel: string;
  onAction: () => void;
  /** The tab's own filter / sort / date controls. */
  children?: ReactNode;
}

/**
 * Search on the left, the tab's filters in the middle, item count and the
 * primary "+ Add …" action on the right. Wraps to stacked rows under 720px.
 */
export default function TableToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  view,
  onViewChange,
  count,
  countNoun,
  countPlural,
  actionLabel,
  onAction,
  children,
}: ToolbarProps) {
  return (
    <div className="studio-toolbar">
      <div className="studio-search">
        <span className="studio-search-icon" aria-hidden>⌕</span>
        <input
          className="form-input"
          type="search"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
        />
      </div>

      <div className="studio-filters">
        {view && onViewChange && <ViewToggle view={view} onChange={onViewChange} />}
        {children}
      </div>

      <div className="studio-toolbar-end">
        <span className="studio-count">
          {count} {count === 1 ? countNoun : (countPlural ?? `${countNoun}s`)}
        </span>
        <button className="btn-primary" style={{ fontSize: 12, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 7 }} onClick={onAction}>
          <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>+</span>{actionLabel}
        </button>
      </div>
    </div>
  );
}
