'use client';
import { useState, useEffect } from 'react';
import { pillStyle } from '@/lib/studio';

// Inline text/textarea that commits on blur (only if the value actually changed)
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

  const commit = () => { if ((v ?? '') !== (value ?? '')) onCommit(v.trim()); };

  const shared = {
    value: v,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: commit,
    className: 'form-input',
    style: { padding: '4px 7px', fontSize: 12, ...style },
  };

  if (multiline) {
    return <textarea {...shared} rows={3} style={{ ...shared.style, resize: 'vertical' as const, lineHeight: 1.4 }} />;
  }
  return (
    <input
      {...shared}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

// Expandable note editor used in the note row on each Studio tab. Saves and
// closes on Enter or the "Leave note" button; Shift+Enter inserts a newline.
// Persists via onCommit (same path as the inline textarea) and only writes when
// the text actually changed. onBlur still persists so clicking away never loses
// the note; closing is reserved for the explicit save actions.
export function NoteEditor({
  value,
  onCommit,
  onClose,
  placeholder,
}: {
  value?: string;
  onCommit: (v: string) => void;
  onClose: () => void;
  placeholder?: string;
}) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);

  const persist = () => { if ((v ?? '') !== (value ?? '')) onCommit(v.trim()); };
  const save = () => { persist(); onClose(); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      <textarea
        autoFocus
        className="form-input"
        value={v}
        placeholder={placeholder}
        rows={3}
        onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } }}
        onBlur={persist}
        style={{ width: '100%', padding: '4px 7px', fontSize: 12, lineHeight: 1.4, resize: 'vertical' }}
      />
      {/* preventDefault on mousedown so the click doesn't blur the textarea first
          (which would double-fire the commit and race the close). */}
      <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px' }} onMouseDown={e => e.preventDefault()} onClick={save}>Leave note</button>
    </div>
  );
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

// Plain select for non-pill dropdowns (Format, Assigned To, Platform…)
export function MiniSelect({
  value,
  options,
  onChange,
  placeholder,
  width,
}: {
  value?: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number | string;
}) {
  return (
    <select
      className="form-input"
      style={{ width: width ?? 'auto', padding: '4px 7px', fontSize: 11 }}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
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
export function EditPillSelect({
  field,
  options,
  value,
  colors,
  onChange,
  onAddOption,
  allowAdd = true,
  allowEmpty = false,
}: {
  field: string;
  options: string[];
  value: string;
  colors: Record<string, string>;
  onChange: (v: string) => void;
  onAddOption?: (field: string, value: string) => void;
  allowAdd?: boolean;
  allowEmpty?: boolean;
}) {
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

// A clickable, readable link (short URL) with an inline-editable URL behind a pencil.
export function UrlCell({
  value,
  onCommit,
}: {
  value?: string;
  onCommit: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);

  if (editing) {
    return (
      <input
        autoFocus
        className="form-input"
        style={{ width: 130, padding: '4px 7px', fontSize: 11 }}
        value={v}
        placeholder="https://…"
        onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        onBlur={() => { if ((v ?? '') !== (value ?? '')) onCommit(v.trim()); setEditing(false); }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 200 }}>
      {value ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={value}
        >{shortUrl(value)}</a>
      ) : (
        <span style={{ color: 'var(--text-faint)' }}>—</span>
      )}
      <button
        onClick={() => setEditing(true)}
        style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 11, padding: 0, flexShrink: 0 }}
        title={value ? 'Edit link' : 'Add link'}
      >✎</button>
    </div>
  );
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

// Inline date picker that commits on change
export function InlineDate({
  value,
  onCommit,
  highlight,
}: {
  value?: string;
  onCommit: (v: string) => void;
  highlight?: boolean;
}) {
  return (
    <input
      className="form-input"
      type="date"
      style={{
        width: 130,
        padding: '4px 7px',
        fontSize: 11,
        color: highlight ? '#ef4444' : undefined,
        borderColor: highlight ? '#3a1a1a' : undefined,
      }}
      value={value ? value.slice(0, 10) : ''}
      onChange={e => onCommit(e.target.value)}
    />
  );
}
