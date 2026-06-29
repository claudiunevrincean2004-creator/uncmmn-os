'use client';
import { ReactNode } from 'react';

// Labeled wrapper for a filter/sort control, shared across all Studio tabs so the
// filter rows read and align consistently: a small faint label next to its
// control ("Status [All ▾]", "Sort [Deadline ↑ Oldest]", etc.).
export default function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 10, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{label}</span>
      {children}
    </label>
  );
}
