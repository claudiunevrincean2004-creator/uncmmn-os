'use client';
import { useEffect, useRef, useState } from 'react';
import { ItemType, copyItemLink } from '@/lib/item-link';

interface Props {
  type: ItemType;
  id: string;
  // 'row' hides the button until its row/card is hovered (see .row-copy in
  // globals.css); 'panel' is always visible, for a detail panel header.
  variant?: 'row' | 'panel';
}

// "Copy link" — puts the item's deep link (the same URL Slack's "Open in OS"
// points at) on the clipboard and confirms with a toast.
//
// The toast lives here rather than in a shared provider because three of the five
// tables never receive the tabs' showToast prop; keeping it self-contained means
// the control drops into any row, card, or panel header with no prop threading.
export default function CopyLinkButton({ type, id, variant = 'row' }: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy(e: React.MouseEvent) {
    // Rows and cards open the item on click — copying a link shouldn't also open it.
    e.stopPropagation();
    const ok = await copyItemLink(type, id);
    if (timer.current) clearTimeout(timer.current);
    setToast(ok ? 'Link copied' : "Couldn't copy link");
    timer.current = setTimeout(() => setToast(null), 2000);
  }

  const isPanel = variant === 'panel';
  return (
    <>
      <button
        className={isPanel ? undefined : 'row-copy'}
        onClick={copy}
        title="Copy link to this item"
        aria-label="Copy link to this item"
        style={{
          background: 'none',
          border: 'none',
          padding: isPanel ? 2 : '2px 4px',
          cursor: 'pointer',
          fontSize: isPanel ? 14 : 11,
          lineHeight: 1,
          flexShrink: 0,
          color: 'var(--text-faint)',
          filter: 'grayscale(1)',
          opacity: isPanel ? 0.75 : undefined,
          transition: 'opacity 0.12s ease, filter 0.12s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.opacity = '1'; }}
        onMouseLeave={e => { e.currentTarget.style.filter = 'grayscale(1)'; if (isPanel) e.currentTarget.style.opacity = '0.75'; }}
      >🔗</button>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface)', border: '0.5px solid #ec4899', borderRadius: 8, padding: '10px 16px', fontSize: 12, color: 'var(--text)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', gap: 8, animation: 'slideInRight 0.2s ease' }}>
          <span style={{ color: '#ec4899' }}>✦</span>
          {toast}
        </div>
      )}
    </>
  );
}
