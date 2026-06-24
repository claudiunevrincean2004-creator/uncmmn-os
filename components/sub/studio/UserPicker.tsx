'use client';
import { useRef, useState } from 'react';
import { Profile } from '@/lib/types';
import { useDismiss } from '@/lib/use-dismiss';

export function profileName(p: Profile): string {
  return p.display_name || p.email || `User ${p.id.slice(0, 6)}`;
}

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
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), { active: open });

  const display = resolveAssignee(value, profiles);
  const assignable = profiles.filter(p => p.assignable !== false);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? assignable.filter(p => profileName(p).toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q))
    : assignable;

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="btn-ghost"
        style={{ fontSize: 11, padding: '4px 9px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: display ? 'var(--text)' : 'var(--text-faint)' }}
        title={display || 'Assign a user'}
      >
        {display || 'Unassigned'}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
            width: 240, background: 'var(--surface)', border: '1px solid var(--border)',
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
        </div>
      )}
    </div>
  );
}
