'use client';
import { useMemo, useState } from 'react';
import { ClipSnippet, ClipSource } from '@/lib/types';
import { MaybeUrl } from '../studio/cells';

interface Props {
  snippets: ClipSnippet[];
  sources: ClipSource[];
  focusSource: string | null;      // drilled-in from the Overview view
  onClearFocus: () => void;
}

const NO_SOURCE = '(no source)';

export default function SnippetBrowser({ snippets, sources, focusSource, onClearFocus }: Props) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;

  // Flat search across ALL clips, regardless of source (description / source name /
  // file links). Only used when the search box has a value.
  const flat = useMemo(() => {
    if (!searching) return [];
    return snippets.filter(s =>
      (s.description || '').toLowerCase().includes(q) ||
      (s.source_name || '').toLowerCase().includes(q) ||
      (s.full_version_file || '').toLowerCase().includes(q) ||
      (s.snippet_download_link || '').toLowerCase().includes(q),
    );
  }, [snippets, q, searching]);

  // Grouped-by-source view (default browsing). Groups ordered by clip_source order,
  // then any orphan source names, then the no-source bucket last.
  const groups = useMemo(() => {
    const byName = new Map<string, ClipSnippet[]>();
    for (const s of snippets) {
      const key = s.source_name || NO_SOURCE;
      const arr = byName.get(key);
      if (arr) arr.push(s); else byName.set(key, [s]);
    }
    const ordered: { name: string; clips: ClipSnippet[] }[] = [];
    const seen = new Set<string>();
    for (const src of sources) {
      const name = src.name || '';
      if (name && byName.has(name)) { ordered.push({ name, clips: byName.get(name)! }); seen.add(name); }
    }
    Array.from(byName.keys())
      .filter(k => k !== NO_SOURCE && !seen.has(k))
      .sort((a, b) => a.localeCompare(b))
      .forEach(k => ordered.push({ name: k, clips: byName.get(k)! }));
    if (byName.has(NO_SOURCE)) ordered.push({ name: NO_SOURCE, clips: byName.get(NO_SOURCE)! });
    return focusSource ? ordered.filter(g => g.name === focusSource) : ordered;
  }, [snippets, sources, focusSource]);

  function toggle(name: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  const ClipTable = ({ clips, showSource }: { clips: ClipSnippet[]; showSource?: boolean }) => (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            {showSource && <th style={{ minWidth: 180 }}>Source</th>}
            <th style={{ minWidth: 240 }}>Description</th>
            <th>Timestamp</th>
            <th>Full Version</th>
            <th>Snippet</th>
          </tr>
        </thead>
        <tbody>
          {clips.map(c => (
            <tr key={c.id}>
              {showSource && <td style={{ minWidth: 180, fontSize: 11, color: 'var(--text-dim)' }}>{c.source_name || '—'}</td>}
              <td style={{ minWidth: 240 }}><span style={{ fontSize: 12 }} title={c.description || ''}>{c.description || '—'}</span></td>
              <td><span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{c.timestamp || '—'}</span></td>
              <td><MaybeUrl value={c.full_version_file} /></td>
              <td><MaybeUrl value={c.snippet_download_link} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          className="form-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search all clips — description, source, or link…"
          style={{ fontSize: 12, padding: '6px 10px', width: 320 }}
        />
        {focusSource && !searching && (
          <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 12px' }} onClick={onClearFocus}>← All sources</button>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          {searching ? `${flat.length} match${flat.length === 1 ? '' : 'es'}` : `${snippets.length} clips${focusSource ? ` in “${focusSource}”` : ` · ${groups.length} sources`}`}
        </div>
      </div>

      {searching ? (
        flat.length === 0
          ? <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>No clips match “{search}”.</div>
          : <ClipTable clips={flat} showSource />
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>No clips yet. Import the Snippet database CSV.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {groups.map(g => {
            const open = focusSource === g.name || expanded.has(g.name);
            return (
              <div key={g.name} style={{ border: '0.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <button
                  onClick={() => toggle(g.name)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface-2)', border: 'none', cursor: 'pointer', color: 'var(--text)', fontFamily: 'inherit', textAlign: 'left' }}
                >
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', width: 12 }}>{open ? '▾' : '▸'}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                  <span className="badge" style={{ background: 'var(--surface)', color: 'var(--text-dim)' }}>{g.clips.length} clip{g.clips.length === 1 ? '' : 's'}</span>
                </button>
                {open && <div style={{ padding: '4px 10px 10px' }}><ClipTable clips={g.clips} /></div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
