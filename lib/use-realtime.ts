'use client';
import { useEffect, useRef } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from './supabase';

// ============================================================================
// Live sync — Supabase Realtime (postgres_changes) for the OS boards.
//
// The whole app reads from a single set of row lists held in app/page.tsx, so
// one channel here keeps every board live for every viewer: when anyone
// inserts/updates/deletes a row, the matching list is patched IN PLACE. Nothing
// re-navigates and nothing refetches, so scroll position, open side panels,
// filter state and half-typed inputs all survive another user's edit.
//
// REQUIRES each table to be a member of the `supabase_realtime` publication —
// a table that isn't simply never emits events (no error, just silence). See
// supabase/realtime.sql for the membership check and the ALTER PUBLICATION
// statements.
// ============================================================================

type Row = Record<string, any>;

interface BindingBase {
  /** Table name in the `public` schema. */
  table: string;
  /** Optional PostgREST-style row filter, e.g. `user_id=eq.<uuid>`. */
  filter?: string;
}

/** A row list kept live: events are merged into `setRows` in place. */
export interface RealtimeListBinding extends BindingBase {
  setRows: React.Dispatch<React.SetStateAction<any[]>>;
  /**
   * Keeps a realtime-inserted row where the initial ordered load would have put
   * it (page.tsx loads every table with an explicit `.order(...)`). Omit to
   * append.
   */
  sort?: (a: Row, b: Row) => number;
  /** Row identity. Defaults to `id`; comment_reads is keyed by (user, comment). */
  rowKey?: (row: Row) => string;
}

/** Escape hatch for state that isn't a row list (e.g. the inbox's Set of read ids). */
export interface RealtimeCustomBinding extends BindingBase {
  onChange: (payload: RealtimePostgresChangesPayload<Row>) => void;
}

export type RealtimeBinding = RealtimeListBinding | RealtimeCustomBinding;

const defaultKey = (row: Row) => String(row?.id ?? '');

/**
 * A never-reused channel topic. `removeChannel` resolves asynchronously, so a
 * re-subscribe (or React StrictMode's mount → unmount → mount in dev) can
 * briefly overlap the channel it is replacing; reusing a topic in that window
 * makes the server reject the second join. A fresh name sidesteps it entirely.
 */
let channelSeq = 0;
export function nextChannelName(prefix: string): string {
  channelSeq += 1;
  return `${prefix}#${channelSeq}`;
}

/**
 * Comparator mirroring a PostgREST `.order(field, { ascending })`, including
 * Postgres' NULL placement (last on ASC, first on DESC), so a row that arrives
 * over the wire lands exactly where a refetch would have put it.
 */
export function byField(field: string, ascending = true) {
  return (a: Row, b: Row): number => {
    const av = a?.[field] ?? null;
    const bv = b?.[field] ?? null;
    if (av === bv) return 0;
    if (av === null) return ascending ? 1 : -1;
    if (bv === null) return ascending ? -1 : 1;
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv));
    return ascending ? cmp : -cmp;
  };
}

/**
 * Merge one change into a row list. Returns the SAME array reference when
 * nothing matched, so an irrelevant event can't trigger a re-render.
 *
 * Every case is idempotent: our own writes still call onReload(), so the
 * refetched row and the echoed realtime event describe the same state and
 * either order of arrival converges.
 */
function applyChange(
  rows: Row[],
  payload: RealtimePostgresChangesPayload<Row>,
  keyOf: (row: Row) => string,
  sort?: (a: Row, b: Row) => number,
): Row[] {
  if (payload.eventType === 'DELETE') {
    // With the default replica identity, `old` carries only the primary key —
    // enough to match on, since every keyOf here is PK-based. If the table has
    // no replica identity at all we get nothing and must leave the list alone.
    const key = keyOf(payload.old ?? {});
    if (!key) return rows;
    const next = rows.filter(r => keyOf(r) !== key);
    return next.length === rows.length ? rows : next;
  }

  const row = payload.new;
  const key = keyOf(row);
  if (!key) return rows;

  const i = rows.findIndex(r => keyOf(r) === key);
  if (i >= 0) {
    // UPDATE — or an INSERT for a row we already have because our own write
    // beat the event home. Replace in place either way.
    const next = rows.slice();
    next[i] = { ...rows[i], ...row };
    return sort ? next.sort(sort) : next;
  }
  const next = [...rows, row];
  return sort ? next.sort(sort) : next;
}

/**
 * Subscribe to `postgres_changes` for every binding on ONE shared channel and
 * patch the bound state as events arrive.
 *
 * The channel is torn down on unmount (and rebuilt only when the set of
 * table/filter pairs actually changes), so handlers never pile up or leak.
 * Callers may pass a fresh array literal on every render — the setters are read
 * through a ref at event time, so identity churn costs nothing.
 *
 * `onResync` fires when the socket comes back after a drop: events that
 * happened while it was down are gone for good, so the caller should do one
 * full refetch to close the gap.
 */
export function useRealtimeSync(
  bindings: RealtimeBinding[],
  enabled = true,
  onResync?: () => void,
) {
  const latest = useRef(bindings);
  latest.current = bindings;
  const resync = useRef(onResync);
  resync.current = onResync;

  // Re-subscribe only when the SET of (table, filter) pairs changes.
  const subscriptionKey = bindings.map(b => `${b.table}|${b.filter ?? ''}`).join(',');

  useEffect(() => {
    if (!enabled || !subscriptionKey) return;
    const specs = latest.current.map(b => ({ table: b.table, filter: b.filter }));
    const channel = supabase.channel(nextChannelName('content-os-live'));

    specs.forEach(({ table, filter }) => {
      channel.on(
        'postgres_changes',
        filter
          ? { event: '*', schema: 'public', table, filter }
          : { event: '*', schema: 'public', table },
        (payload: RealtimePostgresChangesPayload<Row>) => {
          // Resolve at event time so the handler always uses the current setter.
          const b = latest.current.find(
            x => x.table === table && (x.filter ?? '') === (filter ?? ''),
          );
          if (!b) return;
          if ('onChange' in b) { b.onChange(payload); return; }
          const keyOf = b.rowKey ?? defaultKey;
          b.setRows(prev => applyChange(prev, payload, keyOf, b.sort));
        },
      );
    });

    // A drop loses every event that happened while the socket was down, so the
    // first SUBSCRIBED *after* a failure is the cue to refetch once.
    let droppedSinceSubscribe = false;
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        if (droppedSinceSubscribe) {
          droppedSinceSubscribe = false;
          resync.current?.();
        }
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        droppedSinceSubscribe = true;
        if (status !== 'CLOSED') {
          console.warn(`[realtime] channel ${status} — live sync paused until it reconnects`);
        }
      }
    });

    return () => { supabase.removeChannel(channel); };
  }, [subscriptionKey, enabled]);
}
