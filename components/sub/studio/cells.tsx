'use client';
import { useState, useEffect, useRef } from 'react';
import { pillStyle, shortDate } from '@/lib/studio';

// Inline text/textarea editor with uniform keyboard behavior across every table:
//   • Enter           → commit the value and blur (single-line and multi-line)
//   • Shift+Enter      → insert a newline (multi-line only)
//   • Escape           → revert to the previous value and blur (no commit)
// Commit still happens on blur too, and only when the value actually changed.
export function InlineText({
  value,
  onCommit,
  placeholder,
  multiline,
  style,
}: {
  value?: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  style?: React.CSSProperties;
}) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  // Set when Escape reverts, so the blur it triggers doesn't commit the change.
  const skipCommit = useRef(false);

  const commit = () => {
    if (skipCommit.current) { skipCommit.current = false; return; }
    if ((v ?? '') !== (value ?? '')) onCommit(v.trim());
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      skipCommit.current = true;
      setV(value ?? '');           // revert to the previous value
      e.currentTarget.blur();      // commit() bails out via skipCommit
    } else if (e.key === 'Enter' && (!multiline || !e.shiftKey)) {
      e.preventDefault();          // don't insert a newline / submit a form
      e.currentTarget.blur();      // blur triggers commit()
    }
  };

  const shared = {
    value: v,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: commit,
    onKeyDown,
    className: 'form-input',
    style: { padding: '4px 7px', fontSize: 12, ...style },
  };

  if (multiline) {
    return <textarea {...shared} rows={3} style={{ ...shared.style, resize: 'vertical' as const, lineHeight: 1.4 }} />;
  }
  return <input {...shared} />;
}


// A select styled as a colored pill — click opens the dropdown to change.
export function PillSelect({
  value,
  options,
  colors,
  onChange,
}: {
  value: string;
  options: string[];
  colors: Record<string, string>;
  onChange: (v: string) => void;
}) {
  const color = colors[value] || '#6b7280';
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        ...pillStyle(color),
        appearance: 'none',
        WebkitAppearance: 'none',
        borderRadius: 20,
        padding: '3px 9px',
        fontSize: 10,
        fontWeight: 700,
        cursor: 'pointer',
        outline: 'none',
        fontFamily: 'inherit',
      }}
      title="Click to change"
    >
      {options.map(o => (
        <option key={o} value={o} style={{ background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 600 }}>{o}</option>
      ))}
    </select>
  );
}

// Plain select for non-pill dropdowns (Format, Assigned To, Platform…).
//
// `size='md'` is the roomier Studio-toolbar form. `allLabel` renames the "All"
// option so the resting dropdown reads as its own label ("All status",
// "Everyone", "All formats") — the filter VALUE is still "All", so no caller's
// comparison changes.
export function MiniSelect({
  value,
  options,
  onChange,
  placeholder,
  width,
  size = 'sm',
  allLabel,
}: {
  value?: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number | string;
  size?: 'sm' | 'md';
  allLabel?: string;
}) {
  const md = size === 'md';
  return (
    <select
      className="form-input"
      style={
        md
          ? { width: width ?? 'auto', padding: '8px 12px', fontSize: 12, borderRadius: 10, minWidth: 120 }
          : { width: width ?? 'auto', padding: '4px 7px', fontSize: 11 }
      }
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o === 'All' && allLabel ? allLabel : o}</option>)}
    </select>
  );
}

const ADD_NEW = '__add_new__';

// Editable dropdown that lets the user add their own option via "+ Add new…".
// `options` should already be the merged base + custom list for this field.
export function EditSelect({
  field,
  options,
  value,
  onChange,
  onAddOption,
  placeholder,
  width,
  allowAdd = true,
}: {
  field: string;
  options: string[];
  value?: string;
  onChange: (v: string) => void;
  onAddOption?: (field: string, value: string) => void;
  placeholder?: string;
  width?: number | string;
  allowAdd?: boolean;
}) {
  // Always keep the current value selectable even if it isn't in the option list
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  function handle(v: string) {
    if (v === ADD_NEW) {
      const entered = window.prompt(`Add new ${field.replace(/_/g, ' ')} option:`);
      const t = entered?.trim();
      if (t) { onAddOption?.(field, t); onChange(t); }
      return;
    }
    onChange(v);
  }
  return (
    <select
      className="form-input"
      style={{ width: width ?? 'auto', padding: '4px 7px', fontSize: 11 }}
      value={value ?? ''}
      onChange={e => handle(e.target.value)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
      {allowAdd && <option value={ADD_NEW}>+ Add new…</option>}
    </select>
  );
}

// Colored pill select that also supports adding custom options.
//
// `size` is presentation only — 'sm' is the dense legacy pill (still used by the
// non-Studio tables), 'md' the softer, roomier one the Studio tables use.
// Behaviour (options, "+ Add new…", admin gating) is identical either way.
export function EditPillSelect({
  field,
  options,
  value,
  colors,
  onChange,
  onAddOption,
  allowAdd = true,
  allowEmpty = false,
  size = 'sm',
}: {
  field: string;
  options: string[];
  value: string;
  colors: Record<string, string>;
  onChange: (v: string) => void;
  onAddOption?: (field: string, value: string) => void;
  allowAdd?: boolean;
  allowEmpty?: boolean;
  size?: 'sm' | 'md';
}) {
  const md = size === 'md';
  const color = colors[value] || '#6b7280';
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  function handle(v: string) {
    if (v === ADD_NEW) {
      const entered = window.prompt(`Add new ${field.replace(/_/g, ' ')} option:`);
      const t = entered?.trim();
      if (t) { onAddOption?.(field, t); onChange(t); }
      return;
    }
    onChange(v);
  }
  return (
    <select
      value={value}
      onChange={e => handle(e.target.value)}
      style={{
        ...pillStyle(color),
        appearance: 'none',
        WebkitAppearance: 'none',
        // Studio pills are soft rounded RECTANGLES (radius 6), not lozenges —
        // matching the Format/Status chips in the design.
        borderRadius: md ? 6 : 20,
        padding: md ? '4px 10px' : '3px 9px',
        fontSize: md ? 11 : 10,
        fontWeight: md ? 600 : 700,
        maxWidth: md ? 190 : undefined,
        cursor: 'pointer',
        outline: 'none',
        fontFamily: 'inherit',
      }}
      title="Click to change"
    >
      {allowEmpty && <option value="" style={{ background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 600 }}>—</option>}
      {opts.map(o => <option key={o} value={o} style={{ background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 600 }}>{o}</option>)}
      {allowAdd && <option value={ADD_NEW} style={{ background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 600 }}>+ Add new…</option>}
    </select>
  );
}

// Short, readable form of a URL — e.g. "drive.google.com/folders/1A…"
export function shortUrl(raw: string, max = 30): string {
  let s = raw;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    s = u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname) + (u.search || '');
  } catch {
    s = raw.replace(/^https?:\/\//i, '').replace(/^www\./, '');
  }
  s = s.replace(/\/$/, '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// True when a value looks like an http(s) URL.
export function isHttpUrl(v?: string | null): boolean {
  return !!v && /^https?:\/\//i.test(v.trim());
}

// Read-only display that adapts to its value: a clickable link when the value is
// an http(s) URL, otherwise plain text. Used for fields like "Full version file"
// that may hold either a Drive URL or a bare filename.
export function MaybeUrl({ value }: { value?: string | null }) {
  if (!value) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
  if (isHttpUrl(value)) {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>
        {shortUrl(value)}
      </a>
    );
  }
  return <span style={{ fontSize: 12 }} title={value}>{value}</span>;
}

// Where a link cell is rendered: a table cell (compact, fixed widths) or a detail
// panel property row (fills the row, truncates later). Both look and behave the
// same — the resting state is always the clickable, truncated url, never an input.
export type LinkVariant = 'table' | 'panel';

// Click-to-edit link field shared by the tables and the detail panels.
//   • resting → the truncated url as a clickable link (opens in a new tab), or a
//     subtle "—" when empty; the ✎ (and the "—" itself) opens the editor
//   • editing → an inline input that commits on blur/Enter and reverts on Escape
// `allowPlainText` keeps a non-url value (e.g. a bare filename) readable as text
// rather than linking it.
function LinkEditable({
  value,
  onCommit,
  variant = 'table',
  allowPlainText = false,
}: {
  value?: string;
  onCommit: (v: string) => void;
  variant?: LinkVariant;
  allowPlainText?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  // Set when Escape reverts, so the blur it triggers doesn't commit the change.
  const skipCommit = useRef(false);

  const panel = variant === 'panel';
  const fontSize = panel ? 12 : 11;

  if (editing) {
    return (
      <input
        autoFocus
        className="form-input"
        style={{ width: panel ? '100%' : (allowPlainText ? 150 : 130), padding: '4px 7px', fontSize }}
        value={v}
        placeholder={allowPlainText ? 'https://… or filename' : 'https://…'}
        onChange={e => setV(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { skipCommit.current = true; setV(value ?? ''); e.currentTarget.blur(); }
          else if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        }}
        onBlur={() => {
          if (skipCommit.current) skipCommit.current = false;
          else if ((v ?? '') !== (value ?? '')) onCommit(v.trim());
          setEditing(false);
        }}
      />
    );
  }

  // minWidth 0 lets the link shrink inside the flex row so long values ellipsize
  // instead of pushing the ✎ out of the cell.
  const textStyle: React.CSSProperties = {
    minWidth: 0, fontSize, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: panel ? '100%' : (allowPlainText ? 220 : 200) }}>
      {value ? (
        allowPlainText && !isHttpUrl(value)
          ? <span style={{ ...textStyle, color: 'var(--text-dim)' }} title={value}>{value}</span>
          : (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...textStyle, color: 'var(--accent)', textDecoration: 'none' }}
              title={value}
            >
              {shortUrl(value, panel ? 46 : 30)}
              {/* Opens-in-new-tab marker, part of the link so it can't wrap away from it. */}
              <span className="st-arrow" aria-hidden> ↗</span>
            </a>
          )
      ) : (
        <button
          onClick={() => setEditing(true)}
          style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize, padding: 0, fontFamily: 'inherit' }}
          title={allowPlainText ? 'Add' : 'Add link'}
        >—</button>
      )}
      {/* Inside a Studio table this stays hidden until the row is hovered, so a
          column of links reads clean; everywhere else it's always visible. */}
      <button
        className="link-pencil"
        onClick={() => setEditing(true)}
        style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 11, padding: 0, flexShrink: 0 }}
        title={value ? (allowPlainText ? 'Edit' : 'Edit link') : (allowPlainText ? 'Add' : 'Add link')}
      >✎</button>
    </div>
  );
}

// Editable variant of MaybeUrl: shows a clickable link (when http) or plain text,
// with a pencil to edit inline. Commits on blur/Enter, reverts on Escape.
export function MaybeUrlCell({
  value,
  onCommit,
  variant,
}: {
  value?: string;
  onCommit: (v: string) => void;
  variant?: LinkVariant;
}) {
  return <LinkEditable value={value} onCommit={onCommit} variant={variant} allowPlainText />;
}

// A clickable, readable link (short URL) with an inline-editable URL behind a pencil.
export function UrlCell({
  value,
  onCommit,
  variant,
}: {
  value?: string;
  onCommit: (v: string) => void;
  variant?: LinkVariant;
}) {
  return <LinkEditable value={value} onCommit={onCommit} variant={variant} />;
}

// Inline number input that commits on blur
export function InlineNumber({
  value,
  onCommit,
  width,
}: {
  value: number;
  onCommit: (v: number) => void;
  width?: number;
}) {
  const [v, setV] = useState(String(value ?? 0));
  useEffect(() => { setV(String(value ?? 0)); }, [value]);
  return (
    <input
      className="form-input"
      type="number"
      min={0}
      style={{ width: width ?? 56, padding: '4px 6px', fontSize: 12, textAlign: 'center' }}
      value={v}
      onChange={e => setV(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      onBlur={() => { const n = Math.max(0, parseInt(v) || 0); if (n !== value) onCommit(n); }}
    />
  );
}

// Inline date picker that commits on change.
//
// `display='text'` is the Studio-table form: at rest it's just the short date
// ("Aug 13") or a muted "—", and clicking swaps in the real date input. Keeps the
// row line quiet without giving up inline editing. `display='input'` (default) is
// the always-visible picker every other table and the panels use.
export function InlineDate({
  value,
  onCommit,
  highlight,
  display = 'input',
}: {
  value?: string;
  onCommit: (v: string) => void;
  highlight?: boolean;
  display?: 'input' | 'text';
}) {
  const [editing, setEditing] = useState(false);

  if (display === 'text' && !editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        title={value ? 'Edit date' : 'Set date'}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 11,
          whiteSpace: 'nowrap',
          color: highlight ? 'var(--neg)' : (value ? 'var(--text-dim)' : 'var(--text-faint)'),
        }}
      >
        {value ? shortDate(value) : '—'}
      </button>
    );
  }

  return (
    <input
      className="form-input"
      type="date"
      autoFocus={display === 'text'}
      style={{
        width: 130,
        padding: '4px 7px',
        fontSize: 11,
        color: highlight ? 'var(--neg)' : undefined,
      }}
      value={value ? value.slice(0, 10) : ''}
      onChange={e => onCommit(e.target.value)}
      onBlur={() => setEditing(false)}
    />
  );
}
