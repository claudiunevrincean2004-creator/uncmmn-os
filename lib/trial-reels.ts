// Trial Reels — shared constants, CSV import and round-robin queue helpers.
import { supabase } from './supabase';
import { TrialReelSource } from './types';

// Production flow — mirrors Video Review (Assigned → Editing → In Review → Posted).
export const TRIAL_REEL_STATUSES = ['Assigned', 'Editing', 'In Review', 'Posted'];

export const TRIAL_REEL_STATUS_COLORS: Record<string, string> = {
  'Assigned': '#3b82f6',   // blue
  'Editing': '#f59e0b',    // orange
  'In Review': '#8b5cf6',  // purple
  'Posted': '#10b981',     // green
};

// Only "In Review" pings (the reviewer). The day's batch is announced by ONE
// digest ping fired at queue-confirm, not per-row on "Assigned"; Editing / Posted
// are intentionally silent.
export const TRIAL_REEL_NOTIFY_STATUSES = ['In Review'];

export const DEFAULT_RATIO_FLOOR = 1.0;
export const DEFAULT_QUEUE_COUNT = 10;

// Format a follows-per-1k ratio for display (2 dp, em-dash when unknown).
export function fmtRatio(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  return n.toFixed(2);
}

// ── CSV parsing ────────────────────────────────────────────────────────────

// Minimal RFC-4180-ish CSV parser: handles quoted fields, embedded commas,
// escaped double-quotes ("") and \r\n / \n line endings. Returns a grid of cells.
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, ""); // strip BOM
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }  // escaped quote
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell); cell = '';
    } else if (c === '\r') {
      // ignore — handled by the \n branch
    } else if (c === '\n') {
      row.push(cell); rows.push(row); row = []; cell = '';
    } else {
      cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

// A single parsed source row — only the CONTENT columns (never the system fields).
export interface ParsedSourceRow {
  posted_url: string;
  description: string | null;
  drive_url: string | null;
  posted_date: string | null;
  views: number | null;
  follows: number | null;
  follows_per_1k: number | null;
  contains_talking: boolean | null;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

function parseNum(v: string | undefined): number | null {
  if (v == null) return null;
  const cleaned = v.replace(/[^0-9.\-]/g, ''); // strip commas, spaces, %, etc.
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

// Normalize a Date cell to yyyy-mm-dd. Accepts ISO, M/D/Y(Y) and M-D-Y(Y), and
// falls back to Date parsing; returns null when unparseable.
function parseDate(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t) return null;
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

function parseBool(v: string | undefined): boolean | null {
  if (v == null) return null;
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (['yes', 'y', 'true', '1'].includes(t)) return true;
  if (['no', 'n', 'false', '0'].includes(t)) return false;
  return null;
}

export interface CSVParseResult {
  rows: ParsedSourceRow[];
  skipped: number;        // data rows dropped because they had no posted_url
  headersFound: boolean;  // the "Link to posted video" column was present
}

// Parse a content-database CSV export into source rows. Columns (case/spacing
// insensitive): Date, Description, Google Drive Link, Link to posted video,
// Views, Follows, Follows/ 1k views, Contains talking?. Rows are de-duplicated by
// posted_url within the file (last occurrence wins) so one import can't produce
// duplicates. follows_per_1k is computed from follows/views when the column is
// absent/blank.
export function parseSourceCSV(text: string): CSVParseResult {
  const grid = parseCSV(text).filter(r => r.some(c => c.trim() !== ''));
  if (grid.length === 0) return { rows: [], skipped: 0, headersFound: false };
  const header = grid[0].map(norm);
  const idx = (want: string) => header.indexOf(want);
  const iUrl = idx('linktopostedvideo');
  const iDesc = idx('description');
  const iDrive = idx('googledrivelink');
  const iDate = idx('date');
  const iViews = idx('views');
  const iFollows = idx('follows');
  const iRatio = header.findIndex(h => h.startsWith('follows1k'));      // "follows1kviews"
  const iTalking = header.findIndex(h => h.startsWith('containstalking'));
  if (iUrl < 0) return { rows: [], skipped: 0, headersFound: false };

  const byUrl = new Map<string, ParsedSourceRow>();
  let skipped = 0;
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    const url = (cells[iUrl] || '').trim();
    if (!url) { skipped++; continue; }
    const views = iViews >= 0 ? parseNum(cells[iViews]) : null;
    const follows = iFollows >= 0 ? parseNum(cells[iFollows]) : null;
    let ratio = iRatio >= 0 ? parseNum(cells[iRatio]) : null;
    if (ratio == null && views != null && follows != null && views > 0) {
      ratio = (follows / views) * 1000;
    }
    byUrl.set(url, {
      posted_url: url,
      description: iDesc >= 0 ? (cells[iDesc]?.trim() || null) : null,
      drive_url: iDrive >= 0 ? (cells[iDrive]?.trim() || null) : null,
      posted_date: iDate >= 0 ? parseDate(cells[iDate]) : null,
      views,
      follows,
      follows_per_1k: ratio != null ? Math.round(ratio * 100) / 100 : null,
      contains_talking: iTalking >= 0 ? parseBool(cells[iTalking]) : null,
    });
  }
  return { rows: Array.from(byUrl.values()), skipped, headersFound: true };
}

export interface ImportResult { inserted: number; updated: number; }

// Rows per request. The existence pre-check uses a `posted_url=in.(...)` GET
// filter whose whole URL must stay well under server limits, so batches are kept
// small (a 2,000-row file in one `in.(...)` produces a ~70KB URL the server
// rejects with ERR_FAILED). The upsert reuses the same batch (its rows travel in
// the POST body, so size isn't the constraint — batching just keeps the two in
// lockstep and bounds the failure blast radius).
const IMPORT_BATCH = 200;

// Turn a Supabase error (a plain object, not an Error) into a readable string so
// callers never surface "[object Object]".
function errText(e: unknown): string {
  if (!e) return 'unknown error';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object') {
    const o = e as { message?: string; details?: string; hint?: string; code?: string };
    return [o.message, o.details, o.hint, o.code && `(${o.code})`].filter(Boolean).join(' — ') || JSON.stringify(e);
  }
  return String(e);
}

// Upsert parsed rows into trial_reel_source, keyed on posted_url, IN BATCHES so it
// scales to thousands of rows. The payload contains ONLY content columns —
// eligible / times_recreated / last_assigned_at are deliberately omitted so
// ON CONFLICT DO UPDATE never touches them (existing rows keep their system
// values) while new rows fall back to the DB defaults. Returns total inserted vs
// updated across all batches (computed from which URLs already existed per batch).
// On failure, throws an Error naming the failing batch's row range + real message.
export async function importSourceRows(rows: ParsedSourceRow[]): Promise<ImportResult> {
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += IMPORT_BATCH) {
    const batch = rows.slice(i, i + IMPORT_BATCH);
    const from = i + 1;
    const to = i + batch.length;
    const urls = batch.map(r => r.posted_url);

    // Batched existence check → drives this batch's inserted vs updated split.
    const { data: existing, error: selErr } = await supabase
      .from('trial_reel_source')
      .select('posted_url')
      .in('posted_url', urls);
    if (selErr) throw new Error(`Import failed at rows ${from}–${to} (existence check): ${errText(selErr)}`);
    const existingSet = new Set((existing || []).map((e: { posted_url: string }) => e.posted_url));
    const batchInserted = batch.filter(r => !existingSet.has(r.posted_url)).length;

    // Single insert-or-update for the batch (server-side ON CONFLICT).
    const { error } = await supabase
      .from('trial_reel_source')
      .upsert(batch, { onConflict: 'posted_url' });
    if (error) throw new Error(`Import failed at rows ${from}–${to} (upsert): ${errText(error)}`);

    inserted += batchInserted;
    updated += batch.length - batchInserted;
  }
  return { inserted, updated };
}

// ── Queue engine ─────────────────────────────────────────────────────────────

// Round-robin candidate pool: eligible sources whose follows_per_1k clears the
// floor, ordered so the LONGEST-since-assigned (and never-assigned) come first —
// matching `order by last_assigned_at asc nulls first`. Ties break by higher
// follows_per_1k so, all else equal, better-converting reels surface sooner.
// Nothing repeats within the result (rows are distinct sources).
export function buildQueueCandidates(sources: TrialReelSource[], floor: number): TrialReelSource[] {
  return sources
    .filter(s => s.eligible && (s.follows_per_1k ?? 0) >= floor)
    .sort((a, b) => {
      const at = a.last_assigned_at ? Date.parse(a.last_assigned_at) : -Infinity; // never-assigned first
      const bt = b.last_assigned_at ? Date.parse(b.last_assigned_at) : -Infinity;
      if (at !== bt) return at - bt;
      return (b.follows_per_1k ?? 0) - (a.follows_per_1k ?? 0);
    });
}
