'use client';
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';

// Two-step delete that swaps in place: a quiet trash button, then a compact
// "Delete? Yes / Cancel" row. No window.confirm — that's an OS dialog we can't
// theme and can't dismiss with Escape consistently.
//
// EVENTS: this sits inside cards that are BOTH clickable (open a detail panel)
// and, on the kanban, dnd-kit draggables whose sensors listen on the card root
// as onMouseDown / onTouchStart / onKeyDown. So every one of those is stopped
// here — a press on the control can never open the panel or begin a drag.
// Propagation only, never preventDefault, so the buttons themselves still work
// by mouse and keyboard.

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

const swallow = {
  onClick: stop,
  onMouseDown: stop,
  onPointerDown: stop,
  onTouchStart: stop,
  onKeyDown: stop,
};

export default function ConfirmDelete({
  onConfirm,
  variant = 'icon',
  label = 'Delete',
  title = 'Delete',
  compact = false,
}: {
  onConfirm: () => void;
  /** 'icon' = trash glyph (cards); 'button' = labelled button (detail panel). */
  variant?: 'icon' | 'button';
  label?: string;
  title?: string;
  compact?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);

  // Move focus onto the confirming action, so a keyboard user lands on it and
  // Escape has somewhere sensible to return from.
  useEffect(() => {
    if (asking) yesRef.current?.focus();
  }, [asking]);

  // Escape anywhere, or a click elsewhere, backs out of the confirm.
  useEffect(() => {
    if (!asking) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAsking(false); };
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setAsking(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown, true);
    };
  }, [asking]);

  if (asking) {
    return (
      <span ref={wrapRef} className={`confirm-del${compact ? ' is-compact' : ''}`} {...swallow}>
        <span className="confirm-del-q">Delete?</span>
        <button
          ref={yesRef}
          type="button"
          className="confirm-del-yes"
          onClick={e => { e.stopPropagation(); setAsking(false); onConfirm(); }}
        >Yes</button>
        <button
          type="button"
          className="confirm-del-no"
          onClick={e => { e.stopPropagation(); setAsking(false); }}
        >Cancel</button>
      </span>
    );
  }

  return (
    <span ref={wrapRef} {...swallow} style={{ display: 'inline-flex' }}>
      <button
        type="button"
        className={variant === 'button' ? 'del-btn' : `del-icon${compact ? ' is-compact' : ''}`}
        title={title}
        aria-label={title}
        onClick={e => { e.stopPropagation(); setAsking(true); }}
      >
        <Icon name="trash" size={variant === 'button' ? 14 : compact ? 13 : 14} />
        {variant === 'button' && label}
      </button>
    </span>
  );
}
