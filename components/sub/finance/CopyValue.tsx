'use client';
import { useEffect, useRef, useState } from 'react';
import { copyText } from '@/lib/item-link';

// One-click copy for a value you can't reasonably retype — an IBAN, a payment
// link. Confirms in place rather than through a toast, so it drops into a table
// row or a panel section with no prop threading.
//
// SECURITY: the value never reaches a console line, a title attribute, or an
// aria-label. Bank details are rendered only where the Finance tab already shows
// them; this button copies, it doesn't disclose.
export default function CopyValue({
  value,
  label = 'Copy',
  what = 'details',
  variant = 'button',
}: {
  value: string;
  label?: string;
  /** Names the thing in the button's tooltip, never the value itself. */
  what?: string;
  /** 'icon' is the bare glyph a table cell uses; 'button' the labelled one. */
  variant?: 'icon' | 'button';
}) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy(e: React.MouseEvent) {
    // Rows open their panel on click; copying must not also open it.
    e.stopPropagation();
    const ok = await copyText(value);
    if (timer.current) clearTimeout(timer.current);
    setState(ok ? 'ok' : 'fail');
    timer.current = setTimeout(() => setState('idle'), 1800);
  }

  if (!value) return null;
  const icon = variant === 'icon';
  const text = state === 'ok' ? 'Copied' : state === 'fail' ? "Couldn't copy" : label;

  return (
    <button
      type="button"
      className={`copy-value${icon ? ' is-icon' : ''}${state === 'ok' ? ' is-ok' : ''}`}
      onClick={copy}
      title={`Copy ${what}`}
      aria-label={`Copy ${what}`}
    >
      <span aria-hidden>{state === 'ok' ? '✓' : '⧉'}</span>
      {!icon && <span>{text}</span>}
    </button>
  );
}
