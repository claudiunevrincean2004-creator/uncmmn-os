'use client';

// Initials-only avatar (no photo upload). Initials are derived from the given
// name; the background color is a stable hash of the same string, so the same
// user shows the same color everywhere (sidebar, account panel, comments).
const PALETTE = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#14b8a6', '#ef4444'];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const label = name && name.trim() ? name : '?';
  return (
    <span
      aria-hidden
      title={label}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: colorFor(label), color: '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.max(9, Math.round(size * 0.42)), fontWeight: 700, lineHeight: 1,
      }}
    >
      {initialsOf(label)}
    </span>
  );
}
