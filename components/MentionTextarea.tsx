'use client';
import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Profile } from '@/lib/types';
import { profileName } from '@/lib/profile-name';
import Avatar from '@/components/Avatar';

// Comment box with Notion-style @-mentions: typing "@" (at the start or after a
// space) opens a user picker filtered by what you type after it. Picking someone
// inserts the literal "@Display Name " into the text — the mention IS the text,
// so nothing special has to survive a copy/paste or an edit. The mentioned ids
// are re-derived from the body at save time (lib/mentions.ts).
//
// onSubmit (Enter without Shift) is suppressed while the picker is open, so Enter
// picks the highlighted user instead of posting a half-typed mention.

// The "@query" being typed at the caret. No spaces/@ in the query, so a mention
// only ever completes off the word you're on.
const TRIGGER = /(^|\s)@([^\s@]{0,30})$/;

export default function MentionTextarea({
  value, onChange, profiles, onSubmit, placeholder, rows = 2, autoFocus, style,
}: {
  value: string;
  onChange: (v: string) => void;
  profiles: Profile[];
  onSubmit?: () => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Caret offset of the "@" being completed; null when the picker is closed.
  const [at, setAt] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const q = query.trim().toLowerCase();
  const matches = at === null
    ? []
    : profiles
        .filter(p => !q || profileName(p).toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q))
        .slice(0, 6);
  const open = at !== null && matches.length > 0;

  function sync(text: string, caret: number) {
    onChange(text);
    const m = TRIGGER.exec(text.slice(0, caret));
    if (m) {
      setAt(caret - m[2].length - 1); // index of the "@" itself
      setQuery(m[2]);
      setActive(0);
    } else {
      setAt(null);
      setQuery('');
    }
  }

  function pick(p: Profile) {
    if (at === null) return;
    const caret = ref.current?.selectionStart ?? value.length;
    const next = `${value.slice(0, at)}@${profileName(p)} ${value.slice(caret)}`;
    const pos = at + profileName(p).length + 2; // past "@Name "
    onChange(next);
    setAt(null);
    setQuery('');
    // Restore the caret after React re-renders with the new value.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % matches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + matches.length) % matches.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[active]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setAt(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <textarea
        ref={ref}
        className="form-input"
        value={value}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={placeholder}
        // display:block kills the inline-block baseline gap under the textarea —
        // that stray few pixels is what used to leave the composer's button
        // looking like it had slipped below the box.
        style={{ display: 'block', resize: 'vertical', fontSize: 12, lineHeight: 1.4, width: '100%', ...style }}
        onChange={e => sync(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        onKeyUp={e => sync(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
        onBlur={() => setTimeout(() => setAt(null), 120)} // let a click on a row land first
        onKeyDown={onKeyDown}
      />
      {open && (
        <div
          style={{
            position: 'absolute', left: 0, top: '100%', marginTop: 4, zIndex: 2000,
            width: 240, maxHeight: 200, overflowY: 'auto',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: 'var(--shadow)', padding: 6,
            display: 'flex', flexDirection: 'column', gap: 2,
          }}
        >
          {matches.map((p, i) => (
            <button
              key={p.id}
              className={`nav-item${i === active ? ' active' : ''}`}
              style={{ fontWeight: 500, justifyContent: 'flex-start', gap: 8, fontSize: 12 }}
              onMouseEnter={() => setActive(i)}
              onMouseDown={e => e.preventDefault()} // keep focus so onBlur doesn't beat the click
              onClick={() => pick(p)}
            >
              <Avatar name={profileName(p)} size={18} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profileName(p)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
