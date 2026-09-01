'use client';
import { useEffect, useRef, useState } from 'react';
import { ItemType, copyItemLink } from '@/lib/item-link';
import { useDialogs } from '@/components/DialogProvider';

interface Props {
  type: ItemType;
  id: string;
  // 'row' hides the button until its row/card is hovered (see .row-copy in
  // globals.css); 'panel' is always visible, for a detail panel header.
  variant?: 'row' | 'panel';
}

// Thin-stroke chain link — the geometry of lucide's <Link2 /> (MIT), inlined
// because this is the only icon we need and the project carries no icon library.
// Strokes with currentColor so the button's hover colour drives it.
function LinkIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      style={{ display: 'block' }}
    >
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <line x1="8" x2="16" y1="12" y2="12" />
    </svg>
  );
}

// "Copy link" — puts the item's deep link (the same URL Slack's "Open in OS"
// points at) on the clipboard and confirms with a toast.
//
// Confirmation goes through the app-wide toast stack (DialogProvider), so this
// control still drops into any row, card, or panel header with no prop
// threading — and can't stack a second toast on top of someone else's.
export default function CopyLinkButton({ type, id, variant = 'row' }: Props) {
  const { toast } = useDialogs();

  async function copy(e: React.MouseEvent) {
    // Rows and cards open the item on click — copying a link shouldn't also open it.
    e.stopPropagation();
    const ok = await copyItemLink(type, id);
    toast(ok ? 'Link copied' : "Couldn't copy link", !ok);
  }

  const isPanel = variant === 'panel';
  const size = isPanel ? 15 : 13;
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
          display: 'flex',
          alignItems: 'center',
          lineHeight: 1,
          flexShrink: 0,
          // Muted by default, full-contrast on hover — the same treatment as the
          // panel's ✕. The icon strokes with currentColor, so it follows along.
          color: 'var(--text-faint)',
          transition: 'color 0.12s ease, opacity 0.12s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}
      >
        <LinkIcon size={size} />
      </button>

    </>
  );
}
