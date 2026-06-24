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
        <option key={o} value={o} style={{ background: '#111', color: '#fff', fontWeight: 600 }}>{o}</option>
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
  width?: number;
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

// A clickable external-link icon with an inline-editable URL behind a pencil.
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {value ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#6366f1', textDecoration: 'none', fontSize: 13 }}
          title={value}
        >↗</a>
      ) : (
        <span style={{ color: '#333' }}>—</span>
      )}
      <button
        onClick={() => setEditing(true)}
        style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 11, padding: 0 }}
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
