'use client';
import { useMemo, useState } from 'react';
import { ClipSource, ClipSnippet } from '@/lib/types';
import { MaybeUrl } from '../studio/cells';

interface Props {
  sources: ClipSource[];
  snippets: ClipSnippet[];
  onDrill: (sourceName: string) => void; // open this source's clips in the Snippet view
}

export default function OverviewList({ sources, snippets, onDrill }: Props) {
  const [search, setSearch] = useState('');

  // Clip counts per source, matched by name (robust regardless of source_id links).
  const countByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of snippets) {
      const k = s.source_name || '';
      if (k) m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [snippets]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const r = q ? sources.filter(s => (s.name || '').toLowerCase().includes(q)) : sources;
    return [...r].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [sources, search]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          className="form-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search long-form pieces…"
          style={{ fontSize: 12, padding: '6px 10px', width: 280 }}
        />
        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{sources.length} long-form pieces</div>
      </div>

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>
          No long-form pieces yet. Import the Overview CSV.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ minWidth: 260 }}>Name</th>
                <th>RAW Full Version</th>
                <th style={{ textAlign: 'center' }}>Clips</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(s => {
                const count = s.name ? (countByName.get(s.name) || 0) : 0;
                return (
                  <tr key={s.id}>
                    <td style={{ minWidth: 260 }}>
                      <button
                        onClick={() => s.name && onDrill(s.name)}
                        style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 12, textAlign: 'left', padding: '4px 0', fontFamily: 'inherit', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title="View this piece’s clips"
                      >{s.name || '—'}</button>
                    </td>
                    <td><MaybeUrl value={s.raw_full_version} /></td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="badge"
                        onClick={() => s.name && onDrill(s.name)}
                        style={{ background: count > 0 ? 'rgba(139,92,246,0.15)' : 'var(--surface-2)', color: count > 0 ? '#8b5cf6' : 'var(--text-faint)', border: 'none', cursor: 'pointer' }}
                        title="View clips"
                      >{count}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
