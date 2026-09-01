'use client';
import { SortOption, SortDir, dirLabel, resolveOption } from '@/lib/sort';
import FilterField from './FilterField';
import Dropdown from './Dropdown';

// The "Sort [Deadline ▾] [↑ Oldest]" control shared by every table: a dropdown of
// that table's sortable properties plus a direction toggle. The direction label is
// phrased for the property's kind (dates say Oldest/Newest, text says A–Z), which
// is what the old deadline-only button did — it just wasn't reusable.
// `size` is presentation only, matching MiniSelect/DateRangePicker: 'sm' is the
// dense legacy control, 'md' the roomier one the Studio filter bars use.
export default function SortControl<T>({
  options, sortKey, sortDir, onKeyChange, onDirChange, size = 'sm',
}: {
  options: SortOption<T>[];
  sortKey: string;
  sortDir: SortDir;
  onKeyChange: (key: string) => void;
  onDirChange: (dir: SortDir) => void;
  size?: 'sm' | 'md';
}) {
  const md = size === 'md';
  const active = resolveOption(options, sortKey);
  return (
    <FilterField label="Sort">
      <Dropdown
        variant="input"
        size={size}
        value={active.key}
        options={options.map(o => ({ value: o.key, label: o.label }))}
        onChange={onKeyChange}
        ariaLabel="Sort by"
      />
      <button
        className="btn-ghost"
        style={md
          ? { fontSize: 12, padding: '8px 12px', borderRadius: 10, whiteSpace: 'nowrap' }
          : { fontSize: 11, padding: '4px 10px' }}
        onClick={() => onDirChange(sortDir === 'asc' ? 'desc' : 'asc')}
        title={`Sort by ${active.label} — click to reverse`}
      >
        {dirLabel(active.kind, sortDir)}
      </button>
    </FilterField>
  );
}
