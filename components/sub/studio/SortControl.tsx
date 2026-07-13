'use client';
import { SortOption, SortDir, dirLabel, resolveOption } from '@/lib/sort';
import FilterField from './FilterField';

// The "Sort [Deadline ▾] [↑ Oldest]" control shared by every table: a dropdown of
// that table's sortable properties plus a direction toggle. The direction label is
// phrased for the property's kind (dates say Oldest/Newest, text says A–Z), which
// is what the old deadline-only button did — it just wasn't reusable.
export default function SortControl<T>({
  options, sortKey, sortDir, onKeyChange, onDirChange,
}: {
  options: SortOption<T>[];
  sortKey: string;
  sortDir: SortDir;
  onKeyChange: (key: string) => void;
  onDirChange: (dir: SortDir) => void;
}) {
  const active = resolveOption(options, sortKey);
  return (
    <FilterField label="Sort">
      <select
        className="form-input"
        style={{ width: 'auto', padding: '4px 7px', fontSize: 11 }}
        value={active.key}
        onChange={e => onKeyChange(e.target.value)}
      >
        {options.map(o => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
      <button
        className="btn-ghost"
        style={{ fontSize: 11, padding: '4px 10px' }}
        onClick={() => onDirChange(sortDir === 'asc' ? 'desc' : 'asc')}
        title={`Sort by ${active.label} — click to reverse`}
      >
        {dirLabel(active.kind, sortDir)}
      </button>
    </FilterField>
  );
}
