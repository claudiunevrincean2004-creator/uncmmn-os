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


// The one pill geometry in the app, so a Status/Format/Priority chip looks the
// same in a Studio table as it does in that row's detail panel. 'md' is the
// Studio shape — a soft rounded RECTANGLE, not a lozenge; 'sm' is the dense
// legacy pill the non-Studio tables still use.
export function pillShape(size: 'sm' | 'md'): React.CSSProperties {
  const md = size === 'md';
  return {
    appearance: 'none',
    WebkitAppearance: 'none',
    borderRadius: md ? 6 : 20,
    padding: md ? '4px 10px' : '3px 9px',
    fontSize: md ? 11 : 10,
    fontWeight: md ? 600 : 700,
    cursor: 'pointer',
    outline: 'none',
    fontFamily: 'inherit',
  };
}

// Display-then-edit text field for the detail panels. At rest it's plain read-only
// text (line breaks preserved) with a ✎ beside it; clicking either the text or the
// ✎ opens a textarea. Because the value can be a multi-line description, Enter
// inserts a newline rather than saving — commit is Save, or clicking away
// (save-on-blur); Escape/Cancel reverts.
export function EditableText({
  value,
  onCommit,
  placeholder,
}: {
  value?: string;
  onCommit: (v: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value ?? '');
  useEffect(() => { if (!editing) setV(value ?? ''); }, [value, editing]);
  // Set by Escape/Cancel so the blur they trigger doesn't commit the change.
  const skipCommit = useRef(false);

  function commit() {
    if (skipCommit.current) { skipCommit.current = false; setV(value ?? ''); }
    else if ((v ?? '') !== (value ?? '')) onCommit(v.trim());
    setEditing(false);
  }

  function cancel() {
    skipCommit.current = true;
    setV(value ?? '');
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="field-display" role="button" tabIndex={0}
        title="Click to edit"
        onClick={() => setEditing(true)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); } }}
      >
        <span className={value ? 'field-text' : 'field-empty'}>{value || placeholder || '—'}</span>
        <span className="field-edit" aria-hidden>✎</span>
      </div>
    );
  }

  return (
    <div className="field-editor">
      <textarea
        autoFocus
        className="form-input"
        rows={3}
        value={v}
        placeholder={placeholder}
        style={{ display: 'block', width: '100%', resize: 'vertical', fontSize: 12, lineHeight: 1.45 }}
        onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } }}
        onBlur={commit}
      />
      <div className="field-editor-actions">
        {/* preventDefault on mousedown keeps focus in the textarea, so onBlur's
            own commit never races these two. */}
        <button className="btn-ghost" style={{ fontSize: 10, padding: '5px 12px' }} onMouseDown={e => { e.preventDefault(); cancel(); }}>Cancel</button>
        <button className="btn-primary" style={{ fontSize: 10, padding: '5px 12px' }} onMouseDown={e => e.preventDefault()} onClick={commit}>Save</button>
      </div>
    </div>
  );
}

// A select styled as a colored pill — click opens the dropdown to change.
export function PillSelect({
  value,
  options,
  colors,
  onChange,
  size = 'md',
}: {
  value: string;
  options: string[];
  colors: Record<string, string>;
  onChange: (v: string) => void;
  size?: 'sm' | 'md';
}) {
  const color = colors[value] || '#6b7280';
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ ...pillStyle(color), ...pillShape(size) }}
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
        ...pillShape(size),
        maxWidth: md ? 190 : undefined,
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

// Click-to-edit link field shared by the tables and the detail panels — the
// Notion pattern, with no pencil and no launch arrow:
//   • resting → a chromeless field holding the truncated url as a real link
//     (clicking the url itself opens it in a new tab); clicking anywhere else in
//     the field expands it
//   • editing → an inline input filling the same footprint, committing on
//     blur/Enter and reverting on Escape, then collapsing straight back
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
  const shell = `link-field ${panel ? 'link-field-panel' : 'link-field-table'}`;

  if (editing) {
    return (
      <input
        autoFocus
        className="link-field-input"
        style={{ fontSize }}
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

  const label = value ? (allowPlainText ? 'Click to edit' : 'Click to edit link') : (allowPlainText ? 'Click to add' : 'Click to add link');

  return (
    // A div, not a button, so the <a> inside stays a valid, clickable link.
    // stopPropagation keeps a click here from also opening the row's panel.
    <div
      className={shell}
      style={{ fontSize }}
      role="button"
      tabIndex={0}
      title={value || label}
      onClick={e => { e.stopPropagation(); setEditing(true); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); } }}
    >
      {value ? (
        allowPlainText && !isHttpUrl(value)
          ? <span className="link-text">{value}</span>
          : (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              // The link opens; the field around it edits.
              onClick={e => e.stopPropagation()}
              title={value}
            >
              {shortUrl(value, panel ? 46 : 26)}
            </a>
          )
      ) : (
        <span className="link-empty">—</span>
      )}
    </div>
  );
}

// Editable variant of MaybeUrl: shows a clickable link (when http) or plain text,
// expanding to an inline input on click. Commits on blur/Enter, reverts on Escape.
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

// A clickable, readable link (short URL) that expands to an inline URL editor.
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

// Every date input in the app hides the browser's calendar glyph (see the
// input[type='date'] block in globals.css), so clicking the field is what has to
// open the picker. showPicker() is Chrome 99+/Safari 16+ and requires a user
// gesture; where it's missing or throws, the field still types and arrow-keys
// like any date input. Attach this to any <input type="date"> we render.
export function openDatePicker(e: React.MouseEvent<HTMLInputElement>) {
  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  try { el.showPicker?.(); } catch { /* unsupported here — typing still works */ }
}

// Inline date picker that commits on change.
//
// `display='chip'` is the Studio-table form: an always-editable date field
// styled as a small rounded chip, so a deadline reads clearly in the row and is
// still one click from being changed. `display='text'` collapses to plain text
// until clicked. `display='input'` (default) is the full-width picker the detail
// panels and every other table use.
export function InlineDate({
  value,
  onCommit,
  highlight,
  display = 'input',
}: {
  value?: string;
  onCommit: (v: string) => void;
  highlight?: boolean;
  display?: 'input' | 'text' | 'chip';
}) {
  const [editing, setEditing] = useState(false);

  if (display === 'chip') {
    return (
      <input
        className={`st-date${highlight ? ' is-overdue' : ''}${value ? '' : ' is-empty'}`}
        type="date"
        title={value ? 'Change date' : 'Set date'}
        value={value ? value.slice(0, 10) : ''}
        onChange={e => onCommit(e.target.value)}
        onClick={openDatePicker}
      />
    );
  }

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
      onClick={openDatePicker}
      onBlur={() => setEditing(false)}
    />
  );
}
