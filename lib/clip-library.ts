// Clip Library — CSV parsing (Overview + section-headered Snippet database) and
// batched imports. Reuses the RFC-4180-ish CSV parser from trial-reels.
import { supabase } from './supabase';
import { parseCSV } from './trial-reels';
import { todayISO, addDaysISO } from './studio';

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
const isBlank = (s: string | undefined) => !s || s.trim() === '';

// Normalize a Date cell to yyyy-mm-dd. Accepts ISO, M/D/Y(Y) and M-D-Y(Y), and
// falls back to Date parsing; returns null when blank/unparseable.
function parseDate(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t || t === '-') return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (m) {
    let [, mo, d, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const dt = new Date(t);
  if (!isNaN(dt.getTime())) {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  return null;
}

// ── Shared date sort/filter (used by both the Overview and Snippet views) ─────

export type DateFilter = 'all' | 'week' | 'month';

// Time-bounded filter on a yyyy-mm-dd date_added. "week" = last 7 days (rolling),
// "month" = current calendar month. Undated rows are excluded from bounded
// filters (but always shown under "all").
export function matchesDateFilter(dateStr: string | null | undefined, filter: DateFilter): boolean {
  if (filter === 'all') return true;
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  const today = todayISO();
  if (filter === 'month') return d.slice(0, 7) === today.slice(0, 7);
  return d >= addDaysISO(today, -6) && d <= today; // week
}

// Newest-first comparator by date_added; undated rows sort LAST.
export function byDateAddedDesc(a: string | null | undefined, b: string | null | undefined): number {
  const ad = a ? a.slice(0, 10) : '';
  const bd = b ? b.slice(0, 10) : '';
  if (ad && bd) return bd.localeCompare(ad);
  if (ad) return -1;
  if (bd) return 1;
  return 0;
}

// Rows per request — keeps the existence-check `in.(...)` URL small and bounds the
// failure blast radius (the Snippet database is ~900 rows).
const BATCH = 200;

function errText(e: unknown): string {
  if (!e) return 'unknown error';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object') {
    const o = e as { message?: string; details?: string; hint?: string; code?: string };
    return [o.message, o.details, o.hint, o.code && `(${o.code})`].filter(Boolean).join(' — ') || JSON.stringify(e);
  }
  return String(e);
}

// ── Overview CSV (long-form pieces) ──────────────────────────────────────────

export interface ParsedClipSource {
  name: string;
  raw_full_version: string | null;
  date_added: string | null;
  format: string | null;
}

export interface OverviewParseResult {
  rows: ParsedClipSource[];
  skipped: number;        // data rows dropped for having no Video name
  headersFound: boolean;  // the "Video name" column was present
}

// Columns: Video name, Row number in Snippet database, RAW full version file,
// Shortcut to row in Snippet Database, plus optional Date added / Format. Video
// name → name (unique key), RAW full version file → raw_full_version, Date added →
// date_added, Format → format; the row-number/shortcut columns are ignored.
// De-duplicated by name (last occurrence wins). "-"/blank values → null.
export function parseOverviewCSV(text: string): OverviewParseResult {
  const grid = parseCSV(text).filter(r => r.some(c => c.trim() !== ''));
  if (grid.length === 0) return { rows: [], skipped: 0, headersFound: false };
  const header = grid[0].map(norm);
  const iName = header.indexOf('videoname');
  const iRaw = header.indexOf('rawfullversionfile');
  const iDate = header.indexOf('dateadded');
  const iFormat = header.indexOf('format');
  if (iName < 0) return { rows: [], skipped: 0, headersFound: false };

  const byName = new Map<string, ParsedClipSource>();
  let skipped = 0;
  for (let r = 1; r < grid.length; r++) {
    const name = (grid[r][iName] || '').trim();
    if (!name) { skipped++; continue; }
    const raw = iRaw >= 0 ? (grid[r][iRaw] || '').trim() : '';
    const fmt = iFormat >= 0 ? (grid[r][iFormat] || '').trim() : '';
    byName.set(name, {
      name,
      raw_full_version: raw && raw !== '-' ? raw : null,
      date_added: iDate >= 0 ? parseDate(grid[r][iDate]) : null,
      format: fmt && fmt !== '-' ? fmt : null,
    });
  }
  return { rows: Array.from(byName.values()), skipped, headersFound: true };
}

// ── Snippet database CSV (section-headered clips) ────────────────────────────

export interface ParsedClipSnippet {
  source_name: string | null;
  description: string | null;
  full_version_file: string | null;
  timestamp: string | null;
  snippet_download_link: string | null;
  date_added: string | null;
  format: string | null;
}

export interface SnippetParseResult {
  rows: ParsedClipSnippet[];
  sourceCount: number;    // distinct section-header names seen
  headersFound: boolean;  // a column-header row with "Description" was found
}

// The Snippet database sheet is section-headered: a row where ONLY the first
// column is filled is a section header (the source/session name); the rows below
// it (blank first column) are the clips belonging to that source, until the next
// header. Clip columns come from the column-header row: (col A), Description,
// FULL version file, Timestamp, and the snippet URL under "Snippet download link"
// / "Download link" / "Snippet". source_name carries the current section down.
export function parseSnippetsCSV(text: string): SnippetParseResult {
  const grid = parseCSV(text);
  // Locate the column-header row (the one that names "Description").
  let h = -1;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i].map(norm).includes('description')) { h = i; break; }
  }
  if (h < 0) return { rows: [], sourceCount: 0, headersFound: false };
  const header = grid[h].map(norm);
  const iDesc = header.indexOf('description');
  const iFull = header.indexOf('fullversionfile');
  const iTs = header.indexOf('timestamp');
  const iDate = header.indexOf('dateadded');
  const iFormat = header.indexOf('format');
  let iSnip = -1;
  for (const alias of ['snippetdownloadlink', 'downloadlink', 'snippet']) {
    const k = header.indexOf(alias);
    if (k >= 0) { iSnip = k; break; }
  }

  const rows: ParsedClipSnippet[] = [];
  const sources = new Set<string>();
  let current: string | null = null;
  for (let r = h + 1; r < grid.length; r++) {
    const cells = grid[r];
    const first = (cells[0] || '').trim();
    const restFilled = cells.slice(1).some(c => !isBlank(c));
    // Section header: only the first column is filled → switch current source.
    if (first && !restFilled) { current = first; sources.add(current); continue; }
    if (!first && !restFilled) continue; // fully blank separator row
    // Clip row (blank first column, content in the mapped columns).
    const desc = iDesc >= 0 ? (cells[iDesc] || '').trim() : '';
    const full = iFull >= 0 ? (cells[iFull] || '').trim() : '';
    const ts = iTs >= 0 ? (cells[iTs] || '').trim() : '';
    const snip = iSnip >= 0 ? (cells[iSnip] || '').trim() : '';
    const fmt = iFormat >= 0 ? (cells[iFormat] || '').trim() : '';
    if (!desc && !full && !ts && !snip) continue; // nothing meaningful
    rows.push({
      source_name: current,
      description: desc || null,
      full_version_file: full || null,
      timestamp: ts || null,
      snippet_download_link: snip || null,
      date_added: iDate >= 0 ? parseDate(cells[iDate]) : null,
      format: fmt && fmt !== '-' ? fmt : null,
    });
  }
  return { rows, sourceCount: sources.size, headersFound: true };
}

// ── Imports ──────────────────────────────────────────────────────────────────

export interface SourceImportResult { inserted: number; updated: number; }

// Batched upsert of long-form pieces, keyed on name. On failure throws an Error
// naming the failing row range + real message.
export async function importClipSources(rows: ParsedClipSource[]): Promise<SourceImportResult> {
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const from = i + 1;
    const to = i + batch.length;
    const names = batch.map(r => r.name);
    const { data: existing, error: selErr } = await supabase
      .from('clip_source')
      .select('name')
      .in('name', names);
    if (selErr) throw new Error(`Overview import failed at rows ${from}–${to} (existence check): ${errText(selErr)}`);
    const existingSet = new Set((existing || []).map((e: { name: string }) => e.name));
    const batchInserted = batch.filter(r => !existingSet.has(r.name)).length;
    const { error } = await supabase.from('clip_source').upsert(batch, { onConflict: 'name' });
    if (error) throw new Error(`Overview import failed at rows ${from}–${to} (upsert): ${errText(error)}`);
    inserted += batchInserted;
    updated += batch.length - batchInserted;
  }
  return { inserted, updated };
}

export interface SnippetImportResult { inserted: number; linked: number }

// Batched insert of clips. Snippets have no natural unique key, so this is an
// INSERT (re-import cleanly via "Clear Library" first). Each clip's source_id is
// linked best-effort to an existing clip_source by name (null when unmatched).
export async function importClipSnippets(rows: ParsedClipSnippet[]): Promise<SnippetImportResult> {
  // Name → id map for best-effort FK linking (import Overview first for full links).
  const { data: sources, error: srcErr } = await supabase.from('clip_source').select('id,name');
  if (srcErr) throw new Error(`Snippet import failed (loading sources): ${errText(srcErr)}`);
  const idByName = new Map((sources || []).map((s: { id: string; name: string }) => [s.name, s.id]));

  let inserted = 0;
  let linked = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const from = i + 1;
    const to = i + batch.length;
    const payload = batch.map(r => {
      const source_id = r.source_name ? (idByName.get(r.source_name) ?? null) : null;
      if (source_id) linked++;
      return {
        source_name: r.source_name,
        source_id,
        description: r.description,
        full_version_file: r.full_version_file,
        timestamp: r.timestamp,
        snippet_download_link: r.snippet_download_link,
        date_added: r.date_added,
        format: r.format,
      };
    });
    const { error } = await supabase.from('clip_snippet').insert(payload);
    if (error) throw new Error(`Snippet import failed at rows ${from}–${to} (insert): ${errText(error)}`);
    inserted += payload.length;
  }
  return { inserted, linked };
}

// Backfill source_id on clips whose source_name now matches a clip_source but that
// were imported before their source existed. Best-effort, one update per distinct
// unmatched name. Safe to call after either import.
export async function relinkClipSnippets(): Promise<number> {
  const { data: sources } = await supabase.from('clip_source').select('id,name');
  const idByName = new Map((sources || []).map((s: { id: string; name: string }) => [s.name, s.id]));
  const { data: orphans } = await supabase
    .from('clip_snippet')
    .select('source_name')
    .is('source_id', null);
  const names = Array.from(new Set((orphans || []).map((o: { source_name: string | null }) => o.source_name).filter(Boolean) as string[]));
  let relinked = 0;
  for (const name of names) {
    const id = idByName.get(name);
    if (!id) continue;
    const { error } = await supabase.from('clip_snippet').update({ source_id: id }).eq('source_name', name).is('source_id', null);
    if (!error) relinked++;
  }
  return relinked;
}
