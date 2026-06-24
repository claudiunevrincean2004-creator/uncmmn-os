'use client';
import { useEffect } from 'react';

interface Opts {
  active?: boolean;
  // true for inline panels (no backdrop) → detect clicks outside `ref`.
  // false for overlay modals that already close via their backdrop onClick.
  outside?: boolean;
}

/**
 * Uniform dismissal for slide-in panels and modals:
 * - Escape closes.
 * - For inline panels (outside: true), a click anywhere outside `ref` closes;
 *   clicks inside the panel — or inside any open `.modal-overlay` layered on top —
 *   do not. When a modal is open on top, Escape is left for the modal to handle.
 *
 * Before closing, the focused element is blurred so any pending field edit is
 * committed exactly the way clicking the ✕ button already does (blur-to-save).
 */
export function useDismiss(
  ref: React.RefObject<HTMLElement | null> | null,
  onClose: () => void,
  opts: Opts = {}
) {
  const { active = true, outside = true } = opts;

  useEffect(() => {
    if (!active) return;

    const flushClose = () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && typeof el.blur === 'function') el.blur();
      onClose();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!outside) return;
      const target = e.target as Element | null;
      if (!target) return;
      // A modal layered above the panel should handle its own clicks.
      if (target.closest && target.closest('.modal-overlay')) return;
      const node = ref?.current;
      if (node && !node.contains(target)) flushClose();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Inline panels yield Escape to any modal currently on top.
      if (outside && document.querySelector('.modal-overlay')) return;
      flushClose();
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, onClose, active, outside]);
}
