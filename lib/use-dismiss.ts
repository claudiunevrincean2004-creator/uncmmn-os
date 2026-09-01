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
 *
 * ── Why the outside test runs in the CAPTURE phase ─────────────────────────
 * `node.contains(target)` only answers truthfully while the target is still in
 * the document. Plenty of in-panel controls remove themselves in their own
 * handler — a Cancel button that leaves edit mode, a two-step confirm, a menu
 * option that closes its menu. React flushes that re-render before the event
 * finishes bubbling to document, so a bubble-phase listener would ask
 * `contains()` about a node that had already been unmounted, get `false`, and
 * dismiss the whole panel because you clicked something inside it.
 *
 * Capture runs before the target's own handlers, so the DOM is still intact and
 * the answer is the real one.
 *
 * ── Why `[data-dismiss-safe]` ─────────────────────────────────────────────
 * Some in-panel controls render their popup through a portal on <body> (the
 * shared Dropdown, the assignee UserPicker). Those nodes are genuinely outside
 * `ref`, so containment alone can't save them — the marker is what re-associates
 * a portalled subtree with the panel that owns it.
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
      if (!target || typeof target.closest !== 'function') return;
      // A modal layered above the panel should handle its own clicks.
      if (target.closest('.modal-overlay')) return;
      // A portalled popup that belongs to something inside the panel.
      if (target.closest('[data-dismiss-safe]')) return;
      const node = ref?.current;
      if (node && !node.contains(target)) flushClose();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Inline panels yield Escape to any modal currently on top.
      if (outside && document.querySelector('.modal-overlay')) return;
      flushClose();
    };

    // capture: true — see the note above. The target must still be attached when
    // we ask whether it was inside.
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, onClose, active, outside]);
}
