'use client';

// Notion-style "Load more" control shown below a Studio table when more rows
// remain. Sits naturally below the last visible row (not inside the scroll/
// overflow area) so it's never clipped.
export default function LoadMore({ remaining, onClick }: { remaining: number; onClick: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
      <button
        className="btn-ghost"
        style={{ fontSize: 11, padding: '6px 14px' }}
        onClick={onClick}
      >
        Load more <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>({remaining} more)</span>
      </button>
    </div>
  );
}
