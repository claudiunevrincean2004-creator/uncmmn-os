'use client';
import { DateFilter } from '@/lib/clip-library';

// Segmented "This week / This month / All" quick filter (filters by date_added).
export function DateQuickFilter({ value, onChange }: { value: DateFilter; onChange: (v: DateFilter) => void }) {
  const opts: { k: DateFilter; label: string }[] = [
    { k: 'week', label: 'This week' },
    { k: 'month', label: 'This month' },
    { k: 'all', label: 'All' },
  ];
  return (
    <div style={{ display: 'inline-flex', gap: 4 }}>
      {opts.map(o => (
        <button
          key={o.k}
          onClick={() => onChange(o.k)}
          className="btn-ghost"
          style={{ fontSize: 11, padding: '5px 10px', ...(value === o.k ? { background: 'var(--surface-2)', color: 'var(--accent)', borderColor: 'var(--accent)' } : {}) }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Format dropdown — only rendered when there are distinct formats to pick from.
export function FormatFilter({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  if (options.length === 0) return null;
  return (
    <select className="form-input" style={{ fontSize: 11, padding: '5px 8px' }} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">All formats</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// Distinct non-empty formats present across a set of rows, sorted.
export function distinctFormats(rows: { format?: string | null }[]): string[] {
  return Array.from(new Set(rows.map(r => (r.format || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}
