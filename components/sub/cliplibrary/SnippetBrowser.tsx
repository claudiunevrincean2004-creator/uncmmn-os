'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipSnippet, ClipSource } from '@/lib/types';
import { inDateRange } from '@/lib/studio';
import { SortOption, SortDir, sortRows } from '@/lib/sort';
import { MaybeUrl } from '../studio/cells';
import DateRangePicker from '../studio/DateRangePicker';
import SortControl from '../studio/SortControl';
import { FormatFilter, distinctFormats } from './ClipFilters';
import CopyLinkButton from '@/components/CopyLinkButton';

interface Props {
  snippets: ClipSnippet[];
  sources: ClipSource[];
  focusSource: string | null;      // drilled-in from the Overview view
  onClearFocus: () => void;
  openItemId?: string;             // clip deep link ("/clip/<id>")
  onOpened?: () => void;
}

const NO_SOURCE = '(no source)';

export default function SnippetBrowser({ snippets, sources, focusSource, onClearFocus, openItemId, onOpened }: Props) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [formatFilter, setFormatFilter] = useState('');
  const [sortKey, setSortKey] = useState<string>('date_added');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  // Clips have no side panel, so a deep link "opens" one by revealing it: the
  // row is highlighted until the next link, and scrolled into view below.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLTableRowElement>(null);

  // Arriving via a clip deep link: clear the filters (any of which could hide the
  // clip), expand its source group, and mark it. onOpened tells the parent the
  // one-shot link is spent, so returning to this tab later doesn't re-highlight.
  useEffect(() => {
    if (!openItemId) return;
    const clip = snippets.find(s => s.id === openItemId);
    if (clip) {
      setSearch('');
      setDateFrom('');
      setDateTo('');
      setFormatFilter('');
      setExpanded(prev => new Set(prev).add(clip.source_name || NO_SOURCE));
      setHighlightId(clip.id);
    }
    onOpened?.();
  }, [openItemId, snippets, onOpened]);

  // Scroll the linked row into view once it's actually rendered (it only exists
  // after the group above expands).
  useEffect(() => {
    if (highlightId) highlightRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlightId, expanded]);

  // Clips have no pipeline status, so every option here is a plain date/text sort.
  const sortOptions: SortOption<ClipSnippet>[] = useMemo(() => [
    { key: 'date_added', label: 'Date Added', kind: 'date', value: c => c.date_added },
    { key: 'source', label: 'Source', kind: 'text', value: c => c.source_name },
    { key: 'description', label: 'Description', kind: 'text', value: c => c.description },
    { key: 'format', label: 'Format', kind: 'text', value: c => c.format },
  ], []);

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;
  const formats = useMemo(() => distinctFormats(snippets), [snippets]);

  // Date + format filters apply to BOTH the grouped view and flat search, so they
  // compose with the search box (searching + "this month" narrows on both).
  const base = useMemo(
    () => snippets.filter(s =>
      inDateRange(s.date_added ?? undefined, dateFrom, dateTo) &&
      (!formatFilter || (s.format || '') === formatFilter),
    ),
    [snippets, dateFrom, dateTo, formatFilter],
  );

  // Flat search across ALL filtered clips, regardless of source.
  const flat = useMemo(() => {
    if (!searching) return [];
    const matches = base
      .filter(s =>
        (s.description || '').toLowerCase().includes(q) ||
        (s.source_name || '').toLowerCase().includes(q) ||
        (s.full_version_file || '').toLowerCase().includes(q) ||
        (s.snippet_download_link || '').toLowerCase().includes(q),
      )
      .slice();
    return sortRows(matches, sortOptions, sortKey, sortDir);
  }, [base, q, searching, sortOptions, sortKey, sortDir]);

  // Grouped-by-source view (default browsing), clips newest-first within each group.
  const groups = useMemo(() => {
    const byName = new Map<string, ClipSnippet[]>();
    for (const s of base) {
      const key = s.source_name || NO_SOURCE;
      const arr = byName.get(key);
      if (arr) arr.push(s); else byName.set(key, [s]);
    }
    // Clips are sorted inside each source group by the chosen property.
    byName.forEach((arr, k) => byName.set(k, sortRows(arr, sortOptions, sortKey, sortDir)));
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
    // Sorting by Source reorders the groups themselves (that IS the sort the user
    // asked for); any other key leaves the source order alone and sorts within.
    const grouped = sortKey === 'source'
      ? [...ordered].sort((a, b) => (sortDir === 'asc' ? 1 : -1) * a.name.localeCompare(b.name))
      : ordered;
    return focusSource ? grouped.filter(g => g.name === focusSource) : grouped;
  }, [base, sources, focusSource, sortOptions, sortKey, sortDir]);

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
            <th>Date Added</th>
            <th>Format</th>
            <th>Timestamp</th>
            <th>Full Version</th>
            <th>Snippet</th>
          </tr>
        </thead>
        <tbody>
          {clips.map(c => (
            <tr
              key={c.id}
              ref={c.id === highlightId ? highlightRef : undefined}
              style={c.id === highlightId ? { background: 'var(--accent-soft)', boxShadow: 'inset 3px 0 0 var(--accent)' } : undefined}
            >
              {showSource && <td style={{ minWidth: 180, fontSize: 11, color: 'var(--text-dim)' }}>{c.source_name || '—'}</td>}
              <td style={{ minWidth: 240 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 12, flex: 1, minWidth: 0 }} title={c.description || ''}>{c.description || '—'}</span>
                  <CopyLinkButton type="clip" id={c.id} />
                </div>
              </td>
              <td><span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{c.date_added ? c.date_added.slice(0, 10) : '—'}</span></td>
              <td><span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.format || '—'}</span></td>
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
          style={{ fontSize: 12, padding: '6px 10px', width: 300 }}
        />
        <DateRangePicker label="Added" from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        <FormatFilter value={formatFilter} options={formats} onChange={setFormatFilter} />
        <SortControl options={sortOptions} sortKey={sortKey} sortDir={sortDir} onKeyChange={setSortKey} onDirChange={setSortDir} />
        {focusSource && !searching && (
          <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 12px' }} onClick={onClearFocus}>← All sources</button>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          {searching ? `${flat.length} match${flat.length === 1 ? '' : 'es'}` : `${base.length} clips${focusSource ? ` in “${focusSource}”` : ` · ${groups.length} sources`}`}
        </div>
      </div>

      {searching ? (
        flat.length === 0
          ? <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>No clips match “{search}”{dateFrom || dateTo || formatFilter ? ' with these filters' : ''}.</div>
          : <ClipTable clips={flat} showSource />
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>
          {snippets.length === 0 ? 'No clips yet. Import the Snippet database CSV.' : 'No clips match these filters.'}
        </div>
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
