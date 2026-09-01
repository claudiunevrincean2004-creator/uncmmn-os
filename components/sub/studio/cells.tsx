'use client';
import { useState, useEffect, useRef } from 'react';
import { shortDate } from '@/lib/studio';
import Dropdown, { toOptions, type DropdownOption } from './Dropdown';
import { formatUSD, parseUSD } from '@/lib/utils';

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

// ── The four option pickers ─────────────────────────────────────────────────
// All four are thin adapters over the ONE shared <Dropdown/>. Their props,
// option lists, "+ Add new…" gating and what they emit are unchanged — only the
// native <select> underneath them is gone. Every existing call site is therefore
// untouched, and no field gains or loses the ability to create options.

/**
 * The `add` config for a field that can create its own options.
 *
 * The typing happens INSIDE the dropdown (see Dropdown's `add` prop) — the old
 * window.prompt is gone. Returns undefined when the field is select-only, which
 * is what keeps Dropdown from rendering the row at all.
 */
function addConfig(
  field: string,
  allowAdd: boolean,
  onAddOption?: (field: string, value: string) => void,
) {
  if (!allowAdd) return undefined;
  const noun = field.replace(/_/g, ' ');
  return {
    label: '+ Add new…',
    placeholder: `New ${noun}`,
    onAdd: (value: string) => onAddOption?.(field, value),
  };
}

// A picker styled as a colored pill — click opens the dropdown to change.
export function PillSelect({
  value,
  options,
  colors,
  onChange,
  size = 'md',
  labels,
}: {
  value: string;
  options: string[];
  colors: Record<string, string>;
  onChange: (v: string) => void;
  size?: 'sm' | 'md';
  /** Display text per stored value, where the two differ ('progress' → "In Progress"). */
  labels?: Record<string, string>;
}) {
  return (
    <Dropdown
      variant="pill"
      size={size}
      value={value}
      options={toOptions(options, labels, colors)}
      onChange={onChange}
    />
  );
}

// Plain picker for non-pill dropdowns (Format, Assigned To, Platform…).
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
  labels,
  ariaLabel,
}: {
  value?: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number | string;
  size?: 'sm' | 'md';
  allLabel?: string;
  /** Display text per stored value, where the two differ (a person's uuid →
   *  their name, 'one_off' → "One-off"). */
  labels?: Record<string, string>;
  ariaLabel?: string;
}) {
  const opts: DropdownOption[] = [
    ...(placeholder ? [{ value: '', label: placeholder }] : []),
    ...options.map(o => ({
      value: o,
      label: labels?.[o] ?? (o === 'All' && allLabel ? allLabel : o),
    })),
  ];
  return (
    <Dropdown
      variant="input"
      size={size}
      value={value ?? ''}
      options={opts}
      onChange={onChange}
      width={width}
      minWidth={size === 'md' ? 120 : undefined}
      placeholder={placeholder ?? '—'}
      ariaLabel={ariaLabel}
    />
  );
}

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
  const rows: DropdownOption[] = [
    ...(placeholder ? [{ value: '', label: placeholder }] : []),
    ...opts.map(o => ({ value: o, label: o })),
  ];
  return (
    <Dropdown
      variant="input"
      value={value ?? ''}
      options={rows}
      onChange={onChange}
      add={addConfig(field, allowAdd, onAddOption)}
      width={width}
      placeholder={placeholder ?? '—'}
    />
  );
}

// Colored pill picker that also supports adding custom options.
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
  labels,
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
  /** Display text per stored value, where the two differ ('ready_to_pay' →
   *  "Ready to Pay"). Same contract as PillSelect's `labels`. */
  labels?: Record<string, string>;
}) {
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  const rows: DropdownOption[] = [
    ...(allowEmpty ? [{ value: '', label: '—' }] : []),
    ...toOptions(opts, labels, colors),
  ];
  return (
    <Dropdown
      variant="pill"
      size={size}
      value={value}
      options={rows}
      onChange={onChange}
      add={addConfig(field, allowAdd, onAddOption)}
      maxWidth={size === 'md' ? 190 : undefined}
    />
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
      <a className="link-anim" href={value} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>
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
              className="link-anim"
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

// Money cell — reads as "$1,234.56", clicks open a plain number input.
//
// Separate from InlineNumber because that one is a spinner-style integer field
// (parseInt, min 0) built for revision counts; money needs cents and needs to
// REST as formatted text, so a column of amounts scans as a column of amounts.
// Commit on blur/Enter, revert on Escape; an unparseable entry reverts rather
// than writing a 0 over a real figure.
export function InlineMoney({
  value,
  onCommit,
  placeholder = '—',
}: {
  value?: number | null;
  onCommit: (v: number) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value == null ? '' : String(value));
  useEffect(() => { if (!editing) setV(value == null ? '' : String(value)); }, [value, editing]);
  const skipCommit = useRef(false);

  function commit() {
    setEditing(false);
    if (skipCommit.current) { skipCommit.current = false; setV(value == null ? '' : String(value)); return; }
    const n = parseUSD(v);
    if (n === null || n === value) { setV(value == null ? '' : String(value)); return; }
    onCommit(n);
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="st-money"
        title="Click to edit"
        onClick={() => setEditing(true)}
      >
        {value == null ? placeholder : formatUSD(value)}
      </button>
    );
  }

  return (
    <input
      autoFocus
      className="form-input"
      type="text"
      inputMode="decimal"
      value={v}
      placeholder="0.00"
      style={{ width: 96, padding: '4px 7px', fontSize: 12, textAlign: 'right' }}
      onChange={e => setV(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Escape') { skipCommit.current = true; e.currentTarget.blur(); }
        else if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
      }}
      onBlur={commit}
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
  shortLabel,
}: {
  value?: string;
  onCommit: (v: string) => void;
  highlight?: boolean;
  display?: 'input' | 'text' | 'chip';
  /** Chip only: rest as "Aug 26" instead of the browser's mm/dd/yyyy, swapping
   *  in the real date input on click. Used on the board, where a card has to be
   *  scannable at a glance. */
  shortLabel?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);

  // Entering short-label edit mode: focus the field and try to pop the calendar
  // straight open. The click that got us here still counts as user activation
  // for a moment, so showPicker() usually lands; when it doesn't, the field is
  // focused and types/arrow-keys as normal.
  useEffect(() => {
    if (!editing || !shortLabel) return;
    const el = dateRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!el) return;
    el.focus();
    try { el.showPicker?.(); } catch { /* not supported here — typing still works */ }
  }, [editing, shortLabel]);

  if (display === 'chip') {
    if (shortLabel && !editing) {
      return (
        <button
          type="button"
          className={`st-date${highlight ? ' is-overdue' : ''}${value ? '' : ' is-empty'}`}
          title={value ? 'Change date' : 'Set date'}
          onClick={() => setEditing(true)}
        >
          {value ? shortDate(value) : 'Set date'}
        </button>
      );
    }
    return (
      <input
        ref={dateRef}
        className={`st-date${highlight ? ' is-overdue' : ''}${value ? '' : ' is-empty'}`}
        type="date"
        title={value ? 'Change date' : 'Set date'}
        value={value ? value.slice(0, 10) : ''}
        onChange={e => onCommit(e.target.value)}
        onClick={openDatePicker}
        onBlur={shortLabel ? () => setEditing(false) : undefined}
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
