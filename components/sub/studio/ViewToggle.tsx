'use client';
import Icon from '@/components/Icon';

export type StudioView = 'table' | 'board';

// Segmented Table / Board switch that lives in each tab's filter bar. Same
// control language as the filter dropdowns beside it (rounded shell on
// --surface, 12px), with the active half carrying --accent-soft.
export default function ViewToggle({ view, onChange }: { view: StudioView; onChange: (v: StudioView) => void }) {
  return (
    <div className="view-seg" role="group" aria-label="View">
      <button
        type="button"
        className={view === 'table' ? 'active' : undefined}
        aria-pressed={view === 'table'}
        onClick={() => onChange('table')}
        title="Table view"
      >
        <Icon name="document" size={14} />
        Table
      </button>
      <button
        type="button"
        className={view === 'board' ? 'active' : undefined}
        aria-pressed={view === 'board'}
        onClick={() => onChange('board')}
        title="Board view"
      >
        <Icon name="grid" size={14} />
        Board
      </button>
    </div>
  );
}
