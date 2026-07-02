'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ClipSource, ClipSnippet } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import {
  parseOverviewCSV, parseSnippetsCSV,
  importClipSources, importClipSnippets, relinkClipSnippets,
} from '@/lib/clip-library';
import OverviewList from './cliplibrary/OverviewList';
import SnippetBrowser from './cliplibrary/SnippetBrowser';

type SubTab = 'overview' | 'snippets';

interface Props {
  sources: ClipSource[];
  snippets: ClipSnippet[];
  onReload: () => void;
}

export default function ClipLibraryTab({ sources, snippets, onReload }: Props) {
  const [sub, setSub] = usePersistedState<SubTab>('cliplib_subtab', 'overview');
  const [focusSource, setFocusSource] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [importingOverview, setImportingOverview] = useState(false);
  const [importingSnippets, setImportingSnippets] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const overviewFileRef = useRef<HTMLInputElement>(null);
  const snippetFileRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const overview = useMemo(() => {
    const linked = snippets.filter(s => s.source_id).length;
    return [
      { label: 'Long-form pieces', value: String(sources.length), color: '#3b82f6' },
      { label: 'Clips', value: String(snippets.length), color: '#8b5cf6' },
      { label: 'Linked to a source', value: String(linked), color: 'var(--text)' },
    ];
  }, [sources, snippets]);

  function drill(sourceName: string) {
    setFocusSource(sourceName);
    setSub('snippets');
  }

  // ── Imports ──────────────────────────────────────────────────────────────
  async function onOverviewPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await runOverviewImport(file);
    if (overviewFileRef.current) overviewFileRef.current.value = '';
  }
  async function onSnippetsPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await runSnippetsImport(file);
    if (snippetFileRef.current) snippetFileRef.current.value = '';
  }

  async function runOverviewImport(file: File) {
    setImportingOverview(true);
    try {
      const parsed = parseOverviewCSV(await file.text());
      if (!parsed.headersFound) { alert('Could not find a "Video name" column. Expected: Video name, Row number in Snippet database, RAW full version file, Shortcut to row in Snippet Database.'); return; }
      if (parsed.rows.length === 0) { showToast('No long-form pieces found in that CSV.'); return; }
      const { inserted, updated } = await importClipSources(parsed.rows);
      // Newly-added sources may now match previously-orphaned clips.
      const relinked = await relinkClipSnippets();
      showToast(`Overview: ${inserted} new, ${updated} updated${relinked ? ` · ${relinked} source(s) linked to clips` : ''}`);
      onReload();
    } catch (err) {
      console.error('[ClipLibrary] overview import failed', err);
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImportingOverview(false);
    }
  }

  async function runSnippetsImport(file: File) {
    setImportingSnippets(true);
    try {
      const parsed = parseSnippetsCSV(await file.text());
      if (!parsed.headersFound) { alert('Could not find a "Description" column header. The Snippet database sheet needs a header row naming Description / FULL version file / Timestamp / Snippet download link.'); return; }
      if (parsed.rows.length === 0) { showToast('No clips found in that CSV.'); return; }
      const { inserted, linked } = await importClipSnippets(parsed.rows);
      showToast(`Snippets: ${inserted} imported · ${linked} linked to a source · ${parsed.sourceCount} source sections`);
      onReload();
    } catch (err) {
      console.error('[ClipLibrary] snippet import failed', err);
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImportingSnippets(false);
    }
  }

  // ── Clear ──────────────────────────────────────────────────────────────────
  async function clearLibrary() {
    if (clearing) return;
    setClearing(true);
    const nil = '00000000-0000-0000-0000-000000000000';
    const { error: snipErr } = await supabase.from('clip_snippet').delete().neq('id', nil);
    const { error: srcErr } = await supabase.from('clip_source').delete().neq('id', nil);
    setClearing(false);
    if (snipErr || srcErr) {
      console.error('[ClipLibrary] clear failed', snipErr || srcErr);
      alert(`Couldn't clear library: ${(snipErr || srcErr)!.message}`);
      return;
    }
    setClearOpen(false);
    setFocusSource(null);
    showToast('Clip library cleared');
    onReload();
  }

  const busy = importingOverview || importingSnippets;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${overview.length}, 1fr)`, gap: 10, marginBottom: 16 }}>
        {overview.map(item => (
          <div key={item.label} className="metric-chip">
            <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>{item.label}</div>
            <div className="kpi-num" style={{ fontSize: 30, color: item.color || 'var(--text)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar: imports + clear */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input ref={overviewFileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onOverviewPicked} />
        <input ref={snippetFileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onSnippetsPicked} />
        <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 12px' }} onClick={() => overviewFileRef.current?.click()} disabled={busy}>
          {importingOverview ? 'Importing…' : '⬆ Import Overview CSV'}
        </button>
        <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 12px' }} onClick={() => snippetFileRef.current?.click()} disabled={busy}>
          {importingSnippets ? 'Importing…' : '⬆ Import Snippets CSV'}
        </button>
        <div style={{ flex: 1 }} />
        {(sources.length > 0 || snippets.length > 0) && (
          <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 12px', color: '#ef4444' }} onClick={() => setClearOpen(true)} title="Delete all long-form pieces and clips">🗑 Clear Library</button>
        )}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '0.5px solid var(--border)', paddingBottom: 12 }}>
        {([{ key: 'overview', label: 'Overview' }, { key: 'snippets', label: 'Clips' }] as { key: SubTab; label: string }[]).map(t => (
          <button key={t.key} className={`subtab${sub === t.key ? ' active' : ''}`} onClick={() => { setSub(t.key); if (t.key === 'overview') setFocusSource(null); }}>{t.label}</button>
        ))}
      </div>

      {sub === 'overview' && <OverviewList sources={sources} snippets={snippets} onDrill={drill} />}
      {sub === 'snippets' && <SnippetBrowser snippets={snippets} sources={sources} focusSource={focusSource} onClearFocus={() => setFocusSource(null)} />}

      {clearOpen && (
        <div className="modal-overlay" onClick={() => !clearing && setClearOpen(false)}>
          <div className="modal-box" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
            <div className="font-head" style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>Clear the clip library?</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 18 }}>
              This permanently deletes <strong style={{ color: 'var(--text)' }}>all {sources.length} long-form piece{sources.length === 1 ? '' : 's'} and {snippets.length} clip{snippets.length === 1 ? '' : 's'}</strong> so you can re-import clean CSVs. This can’t be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }} onClick={() => setClearOpen(false)} disabled={clearing}>Cancel</button>
              <button className="btn-danger" style={{ fontSize: 12, padding: '8px 14px' }} onClick={clearLibrary} disabled={clearing}>{clearing ? 'Clearing…' : 'Delete everything'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface)', border: '0.5px solid #ec4899', borderRadius: 8, padding: '10px 16px', fontSize: 12, color: 'var(--text)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', gap: 8, animation: 'slideInRight 0.2s ease' }}>
          <span style={{ color: '#ec4899' }}>✦</span>
          {toast}
        </div>
      )}
    </div>
  );
}
