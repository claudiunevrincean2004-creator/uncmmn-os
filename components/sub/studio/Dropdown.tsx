'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pillStyle } from '@/lib/studio';

// ============================================================================
// THE dropdown. One component behind every option picker in the app.
//
// A native <select> renders as an OS menu — on macOS a system popup that ignores
// every theme token and reads as foreign next to our own controls. This is the
// replacement, wearing the same clothes as the Filter/Sort popovers: .fs-pop
// panel, .fs-menu-item rows, .fs-tick on the active one.
//
// PORTALLED to <body> with position:fixed, deliberately. These sit inside the
// tables' horizontal scroller and inside modals, both of which clip an
// absolutely-positioned child — the one thing a native select never suffered
// from. Fixed positioning off the trigger's rect also makes flipping above the
// trigger, and clamping to the viewport, a matter of arithmetic rather than CSS.
// ============================================================================

export interface DropdownOption {
  value: string;
  label: string;
  /** Renders the row (and the trigger, in pill variant) in this colour. */
  color?: string;
  /** Sentinel rows — "+ Add new…" — sit apart and never carry a tick. */
  isAction?: boolean;
}

const PANEL_MAX_H = 300;
const PANEL_MIN_W = 150;
const EDGE = 8;

export default function Dropdown({
  value,
  options,
  onChange,
  variant = 'input',
  size = 'sm',
  width,
  minWidth,
  maxWidth,
  placeholder,
  title,
  ariaLabel,
  disabled,
  style,
  className,
  add,
}: {
  /** '' means nothing chosen — pairs with an option whose value is ''. */
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /** 'pill' is the coloured chip the tables use; 'input' the form control. */
  variant?: 'pill' | 'input';
  size?: 'sm' | 'md';
  width?: number | string;
  minWidth?: number;
  maxWidth?: number;
  /** Trigger text when the value matches no option. */
  placeholder?: string;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
  /**
   * Lets this field create its own options. The row it adds turns into a text
   * input IN PLACE when picked — Notion's gesture — rather than handing a
   * one-field question to the browser's native prompt, which is unstyleable OS
   * chrome. Omit entirely and the field stays select-only; nothing here can
   * grant creation to a field that didn't ask for it.
   */
  add?: {
    label?: string;
    placeholder?: string;
    /** Persist the new option. The value is trimmed and known non-empty. */
    onAdd: (value: string) => void;
  };
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);
  // The "+ Add new…" row, swapped for a text input.
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const addRef = useRef<HTMLInputElement>(null);

  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Type-to-jump buffer, cleared after a pause — the one native-select affordance
  // people miss most when a select stops being native.
  const typed = useRef({ text: '', at: 0 });

  const selectedIdx = options.findIndex(o => !o.isAction && o.value === value);
  const current = selectedIdx >= 0 ? options[selectedIdx] : null;

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const w = Math.min(
      Math.max(r.width, minWidth ?? PANEL_MIN_W),
      vw - EDGE * 2,
    );
    const below = vh - r.bottom - EDGE;
    const above = r.top - EDGE;
    // Flip up only when below genuinely can't hold the panel AND above holds
    // more — otherwise a menu near the fold would jump for no gain.
    const flip = below < Math.min(PANEL_MAX_H, 180) && above > below;
    const maxH = Math.min(PANEL_MAX_H, flip ? above : below);

    setPos({
      top: flip ? Math.max(EDGE, r.top - maxH - 4) : r.bottom + 4,
      left: Math.min(Math.max(EDGE, r.left), vw - w - EDGE),
      width: w,
      maxH,
    });
  }, [minWidth]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => place();
    // capture:true so an ancestor scroller (the tables' .studio-scroll) moves
    // the panel with its trigger instead of leaving it stranded.
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, place]);

  // Dismissal is owned here rather than by useDismiss: that hook yields both
  // Escape and outside-clicks whenever a .modal-overlay is on screen, and
  // plenty of these dropdowns live inside exactly those modals.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      btnRef.current?.focus();
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && activeIdx >= 0 && !adding) itemRefs.current[activeIdx]?.focus();
  }, [open, activeIdx, adding]);

  useEffect(() => { if (adding) addRef.current?.focus(); }, [adding]);

  function openMenu(idx = selectedIdx) {
    setActiveIdx(idx >= 0 ? idx : 0);
    setAdding(false);
    setDraft('');
    setOpen(true);
  }
  function close(focusTrigger = true) {
    setOpen(false);
    setActiveIdx(-1);
    setAdding(false);
    setDraft('');
    if (focusTrigger) btnRef.current?.focus();
  }

  /**
   * Commit the typed option.
   *
   * An existing value — matched case-insensitively against what's already on the
   * list — SELECTS that option instead of creating a second one that only
   * differs by capitalisation. Empty input does nothing and leaves the box open.
   */
  function commitAdd() {
    const value = draft.trim();
    if (!value) return;
    const existing = options.find(o => !o.isAction && o.label.toLowerCase() === value.toLowerCase());
    if (existing) { choose(existing); return; }
    add?.onAdd(value);
    close();
    onChange(value);
  }
  function choose(o: DropdownOption) {
    close();
    onChange(o.value);
  }

  /** Jump to the next option whose label starts with what's been typed. */
  function typeJump(ch: string) {
    const now = Date.now();
    typed.current.text = now - typed.current.at > 700 ? ch : typed.current.text + ch;
    typed.current.at = now;
    const q = typed.current.text.toLowerCase();
    const start = activeIdx < 0 ? 0 : activeIdx;
    // Search from just after the cursor so repeating a letter cycles matches.
    const order = [
      ...options.slice(start + 1),
      ...options.slice(0, start + 1),
    ];
    const hit = order.find(o => !o.isAction && o.label.toLowerCase().startsWith(q));
    if (hit) setActiveIdx(options.indexOf(hit));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const last = options.length - 1;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActiveIdx(i => (i >= last ? 0 : i + 1)); break;
      case 'ArrowUp': e.preventDefault(); setActiveIdx(i => (i <= 0 ? last : i - 1)); break;
      case 'Home': e.preventDefault(); setActiveIdx(0); break;
      case 'End': e.preventDefault(); setActiveIdx(last); break;
      case 'Tab': close(false); break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) typeJump(e.key);
    }
  }

  const md = size === 'md';
  const pill = variant === 'pill';
  const color = current?.color || '#6b7280';
  const text = current ? current.label : (placeholder ?? '—');

  const triggerStyle: React.CSSProperties = pill
    ? { ...pillStyle(color), maxWidth: maxWidth ?? (md ? 190 : undefined), ...style }
    : { width: width ?? 'auto', minWidth, maxWidth, ...style };

  const triggerClass = [
    pill ? `dd-pill${md ? ' is-md' : ''}` : `dd-input${md ? ' is-md' : ''}`,
    open ? 'is-open' : '',
    className || '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={triggerClass}
        style={triggerStyle}
        disabled={disabled}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openMenu(); }
          else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) { openMenu(); typeJump(e.key); }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title ?? (pill ? 'Click to change' : undefined)}
      >
        <span className="dd-text">{text}</span>
        <span className="dd-caret" aria-hidden>▾</span>
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          className="fs-pop dd-pop"
          // Portalled to <body>, so a panel's outside-click test can't see this
          // as "inside" by containment. See lib/use-dismiss.ts.
          data-dismiss-safe=""
          role="listbox"
          aria-label={ariaLabel}
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH }}
          onKeyDown={onKeyDown}
        >
          <div className="fs-menu">
            {options.map((o, i) => {
              const on = !o.isAction && o.value === value;
              return (
                <button
                  key={`${o.value}-${i}`}
                  ref={el => { itemRefs.current[i] = el; }}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`fs-menu-item${on ? ' is-on' : ''}${o.isAction ? ' dd-action' : ''}`}
                  onClick={() => choose(o)}
                >
                  <span className="dd-opt">
                    {o.color && <span className="dd-dot" style={{ background: o.color }} aria-hidden />}
                    <span className="dd-opt-text" style={o.color && !on ? { color: o.color } : undefined}>{o.label}</span>
                  </span>
                  {on && <span className="fs-tick" aria-hidden>✓</span>}
                </button>
              );
            })}

            {add && (adding ? (
              <div className="dd-add-row">
                <input
                  ref={addRef}
                  className="form-input dd-add-input"
                  value={draft}
                  placeholder={add.placeholder ?? 'New option'}
                  aria-label={add.placeholder ?? 'New option'}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    // Handled here so the menu's own arrow/type-to-jump keys
                    // don't fight the text being typed.
                    e.stopPropagation();
                    if (e.key === 'Enter') { e.preventDefault(); commitAdd(); }
                    else if (e.key === 'Escape') { e.preventDefault(); setAdding(false); setDraft(''); }
                  }}
                />
                <button
                  type="button"
                  className="dd-add-ok"
                  onClick={commitAdd}
                  disabled={!draft.trim()}
                  title="Add option"
                  aria-label="Add option"
                >✓</button>
              </div>
            ) : (
              <button
                type="button"
                className="fs-menu-item dd-action"
                onClick={() => { setDraft(''); setAdding(true); }}
              >
                {add.label ?? '+ Add new…'}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Convenience: build options from the plain string lists the app already holds. */
export function toOptions(
  values: string[],
  labels?: Record<string, string>,
  colors?: Record<string, string>,
): DropdownOption[] {
  return values.map(v => ({ value: v, label: labels?.[v] ?? v, color: colors?.[v] }));
}
