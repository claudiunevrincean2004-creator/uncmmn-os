'use client';
import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Profile } from '@/lib/types';
import { profileName } from '@/lib/profile-name';

// Re-export so existing `./UserPicker` importers (AssigneeSettings, ItemPanel)
// keep working off the shared helper.
export { profileName };

const DROPDOWN_W = 240;
// Approximate full height (search box + ~220 list + padding) used to decide
// whether to flip the dropdown above the trigger.
const DROPDOWN_MAX_H = 290;

// Resolve a stored assigned_to (a profile id, or legacy plain text) to a display name.
// Returns null when it can't be mapped to a real user (→ shown as Unassigned).
export function resolveAssignee(assignedTo: string | undefined | null, profiles: Profile[]): string | null {
  if (!assignedTo) return null;
  const byId = profiles.find(p => p.id === assignedTo);
  if (byId) return profileName(byId);
  const t = assignedTo.trim().toLowerCase();
  const byText = profiles.find(p =>
    (p.email && p.email.toLowerCase() === t) ||
    (p.display_name && p.display_name.toLowerCase() === t)
  );
  return byText ? profileName(byText) : null;
}

// Searchable picker backed by real platform users (profiles where assignable !== false).
export function UserPicker({
  value, profiles, onChange,
}: {
  value?: string;
  profiles: Profile[];
  onChange: (userId: string) => void;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // Fixed-viewport coords for the portaled dropdown; uses `top` (open down) or
  // `bottom` (flipped up) so it's never clipped by the table's overflow box.
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  const display = resolveAssignee(value, profiles);
  const assignable = profiles.filter(p => p.assignable !== false);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? assignable.filter(p => profileName(p).toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q))
    : assignable;

  function reposition() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - DROPDOWN_W - 8));
    const spaceBelow = window.innerHeight - r.bottom;
    // Flip up only when there isn't room below AND there's more room above.
    if (spaceBelow < DROPDOWN_MAX_H && r.top > spaceBelow) {
      setPos({ left, bottom: window.innerHeight - r.top + 4 });
    } else {
      setPos({ left, top: r.bottom + 4 });
    }
  }

  useLayoutEffect(() => { if (open) reposition(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // Keep the dropdown glued to its trigger while the page/table scrolls.
    const onScrollResize = () => reposition();
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [open]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        className="btn-ghost"
        style={{ fontSize: 11, padding: '4px 9px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: display ? 'var(--text)' : 'var(--text-faint)' }}
        title={display || 'Assign a user'}
      >
        {display || 'Unassigned'}
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={popRef}
          style={{
            position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, zIndex: 3000,
            width: DROPDOWN_W, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: 'var(--shadow)', padding: 8,
          }}
        >
          <input
            autoFocus
            className="form-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name or email…"
            style={{ fontSize: 12, marginBottom: 8 }}
          />
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button
              className="nav-item"
              style={{ fontWeight: 500, color: 'var(--text-faint)' }}
              onClick={() => pick('')}
            >
              Unassigned
            </button>
            {filtered.map(p => (
              <button
                key={p.id}
                className="nav-item"
                style={{ fontWeight: 500, justifyContent: 'flex-start' }}
                onClick={() => pick(p.id)}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profileName(p)}
                  {p.email && p.display_name && <span style={{ color: 'var(--text-faint)', marginLeft: 6 }}>{p.email}</span>}
                </span>
              </button>
            ))}
            {filtered.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-faint)', padding: '6px 10px' }}>No users found.</div>}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
