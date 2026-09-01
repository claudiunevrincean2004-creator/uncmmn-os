'use client';
import { useState, useMemo, useRef, useEffect } from 'react';
import Dropdown from './studio/Dropdown';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { Client, ResearchItem, ResearchStatus, StudioComment, StudioActivity, Profile } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';
import { logActivity, shortDate } from '@/lib/studio';
import Icon from '@/components/Icon';
import ConfirmDelete from '@/components/ConfirmDelete';
import Board, { type BoardCard } from './studio/Board';
import ItemPanel, { type FieldDef } from './studio/ItemPanel';

interface Props {
  client: Client;
  items: ResearchItem[];
  comments: StudioComment[];
  activity: StudioActivity[];
  profiles: Profile[];
  isAdmin?: boolean;
  onReload: () => void;
}

type View = 'grid' | 'kanban';

// studio_comments.item_type for a research note. Deliberately NOT registered in
// lib/inbox.ts's INBOX_SOURCES — notes are private working scratch on an idea,
// not team traffic, so they don't light the Inbox badge. Add an entry there if
// that ever changes.
const ITEM_TYPE = 'research';

// Why an idea was worth saving. Legacy values from older rows ("Editing Style",
// "Song / Audio") still display fine — reasonColor() falls back to a hash.
const REASONS = ['Hook', 'Sound', 'Format', 'Visual', 'Pacing', 'Concept', 'Trend', 'Caption', 'Other'];

const REASON_COLORS: Record<string, string> = {
  hook: '#6366f1',
  sound: '#0ea5e9',
  format: '#f59e0b',
  visual: '#8b5cf6',
  pacing: '#10b981',
  concept: '#ec4899',
  trend: '#14b8a6',
  caption: '#3b82f6',
  other: '#6b7280',
  // Legacy reason values, kept so old rows keep a stable colour.
  'editing style': '#8b5cf6',
  'song / audio': '#0ea5e9',
  transition: '#14b8a6',
};
const REASON_PALETTE = ['#6366f1', '#0ea5e9', '#f59e0b', '#8b5cf6', '#10b981', '#ec4899', '#14b8a6', '#3b82f6'];

function reasonColor(reason?: string): string {
  const key = (reason || 'other').trim().toLowerCase();
  const known = REASON_COLORS[key];
  if (known) return known;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return REASON_PALETTE[h % REASON_PALETTE.length];
}

const STATUS_ORDER: ResearchStatus[] = ['unused', 'progress', 'used'];
const STATUS_LABELS: Record<ResearchStatus, string> = {
  unused: 'Unused',
  progress: 'In Progress',
  used: 'Used',
};
const STATUS_COLORS: Record<ResearchStatus, string> = {
  unused: '#6366f1',
  progress: '#f59e0b',
  used: '#10b981',
};
// Known platforms get their monogram and brand tint; anything else falls back to
// the first two letters of its domain.
const PLATFORMS: { match: RegExp; code: string; color: string }[] = [
  { match: /instagram\./i, code: 'IG', color: '#e1306c' },
  { match: /tiktok\./i, code: 'TT', color: '#14b8a6' },
  { match: /(youtube\.|youtu\.be)/i, code: 'YT', color: '#ef4444' },
  { match: /(twitter\.|x\.com)/i, code: 'X', color: '#6b7280' },
  { match: /facebook\./i, code: 'FB', color: '#3b82f6' },
  { match: /linkedin\./i, code: 'IN', color: '#0ea5e9' },
  { match: /reddit\./i, code: 'RD', color: '#f59e0b' },
];

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function platformOf(url: string): { code: string; color: string; domain: string } {
  const domain = safeDomain(url);
  const hit = PLATFORMS.find(p => p.match.test(domain));
  return hit
    ? { code: hit.code, color: hit.color, domain }
    : { code: domain.slice(0, 2).toUpperCase() || '—', color: '#6b7280', domain };
}

/**
 * "Open the original" button, shared by the grid and kanban cards.
 *
 * It lives inside two hostile parents at once, and each needs a different event
 * stopped:
 *   • the card opens the detail panel on click  → stopPropagation on click
 *   • the kanban card is a dnd-kit draggable, whose listeners sit on the card
 *     root as onMouseDown / onTouchStart / onKeyDown (MouseSensor, TouchSensor,
 *     KeyboardSensor — see Board.tsx) → stop all three so pressing the button
 *     never starts a drag. pointerdown is stopped too, harmless today and
 *     correct if the board ever swaps in PointerSensor.
 * Only propagation is stopped, never the default, so the anchor still navigates
 * on click and on Enter.
 */
function OpenSourceLink({ url, compact }: { url: string; compact?: boolean }) {
  const { domain } = platformOf(url);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <a
      className="idea-open"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open on ${domain} (new tab)`}
      onClick={stop}
      onMouseDown={stop}
      onPointerDown={stop}
      onTouchStart={stop}
      onKeyDown={stop}
    >
      <span aria-hidden>↗</span>
      <span className="idea-open-label">{compact ? 'Open' : domain}</span>
    </a>
  );
}

/** Favicon-style monogram + domain, e.g. "IG instagram.com". */
function SourceChip({ url }: { url: string }) {
  const { code, color, domain } = platformOf(url);
  return (
    <span className="idea-source" style={{ '--src-color': color } as React.CSSProperties}>
      <span className="idea-source-mark">{code}</span>
      <span className="idea-source-domain">{domain}</span>
    </span>
  );
}

export default function ResearchTab({ client, items, comments, activity, profiles, isAdmin = false, onReload }: Props) {
  // Ideas deleted in this session but still present in `items` until the reload
  // lands — or until a failed write puts them back.
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const clientItems = useMemo(
    () => items.filter(i => i.client_id === client.id && !deletedIds.has(i.id)),
    [items, client.id, deletedIds],
  );

  // Add form
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState(REASONS[0]);
  const [saving, setSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Filters / view
  const [view, setView] = usePersistedState<View>('research_view_mode', 'grid');
  const [query, setQuery] = useState('');
  const [reasonFilter, setReasonFilter] = usePersistedState<string>('research_reason', 'All');
  const [statusFilter, setStatusFilter] = usePersistedState<string>('research_status', 'All');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; isError: boolean } | null>(null);
  // Reasons changed from a card, held until the reloaded row agrees.
  const [reasonOverride, setReasonOverride] = useState<Record<string, string>>({});

  // Retire an override once the real row catches up (or the row disappears).
  useEffect(() => {
    setReasonOverride(prev => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const byId = new Map(clientItems.map(i => [i.id, i.reason ?? '']));
      const next: Record<string, string> = {};
      for (const id of keys) {
        const real = byId.get(id);
        if (real !== undefined && real !== prev[id]) next[id] = prev[id];
      }
      return Object.keys(next).length === keys.length ? prev : next;
    });
  }, [clientItems]);

  const effectiveReason = (item: ResearchItem) => reasonOverride[item.id] ?? item.reason ?? '';

  // Once a deleted row is actually gone from the incoming data, stop tracking it.
  useEffect(() => {
    setDeletedIds(prev => {
      if (prev.size === 0) return prev;
      const live = new Set(items.map(i => i.id));
      const next = new Set<string>();
      prev.forEach(id => { if (live.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  // Every reason actually in use, so legacy values stay reachable in the filter.
  const reasonOptions = useMemo(
    () => Array.from(new Set([...REASONS, ...clientItems.map(i => i.reason).filter(Boolean) as string[]])),
    [clientItems],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clientItems
      .filter(i => {
        if (reasonFilter !== 'All' && i.reason !== reasonFilter) return false;
        if (statusFilter !== 'All' && i.status !== statusFilter) return false;
        if (q) {
          const hay = `${i.title || ''} ${i.content || ''} ${i.note || ''} ${i.reason || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // A hot idea still waiting to be used floats to the top.
        const aP = a.hot && a.status === 'unused' ? 1 : 0;
        const bP = b.hot && b.status === 'unused' ? 1 : 0;
        if (aP !== bP) return bP - aP;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
  }, [clientItems, query, reasonFilter, statusFilter]);

  // Total is counted off the FULL set, not the filtered one.
  const totalIdeas = clientItems.length;

  function showToast(msg: string, isError = false) {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), isError ? 4000 : 1800);
  }

  function openAddForm() {
    setTitle(''); setContent(''); setNote(''); setReason(REASONS[0]);
    setFormOpen(true);
    setTimeout(() => titleInputRef.current?.focus(), 0);
  }

  function closeForm() {
    setFormOpen(false);
    setTitle(''); setContent(''); setNote(''); setReason(REASONS[0]);
  }

  async function saveItem() {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    const { error } = await supabase.from('research_items').insert([{
      title: t,
      content: content.trim() || null,
      note: note.trim() || null,
      reason,
      hot: false,
      client_id: client.id,
      status: 'unused',
    }]);
    setSaving(false);
    if (error) { showToast('Save failed'); return; }
    closeForm();
    onReload();
    showToast('Saved');
  }

  // ONE write path for every field, shared by the side panel, the "→ Use"
  // button and the kanban drop — so nothing can drift out of step.
  async function patch(id: string, p: Partial<ResearchItem>) {
    const { error } = await supabase.from('research_items').update(p).eq('id', id);
    if (error) {
      console.error('[ResearchTab] failed to update idea', { id, patch: p, error });
      alert(`Couldn't save change: ${error.message}`);
    }
    onReload();
  }

  /**
   * Reason change from a grid card's chip. Optimistic: the card re-tints at
   * once and reverts if the write fails, so the accent bar never shows a colour
   * the database doesn't agree with.
   */
  async function changeReason(item: ResearchItem, next: string) {
    if (next === (item.reason ?? '')) return;
    setReasonOverride(o => ({ ...o, [item.id]: next }));
    const { error } = await supabase.from('research_items').update({ reason: next }).eq('id', item.id);
    if (error) {
      setReasonOverride(o => {
        const copy = { ...o };
        delete copy[item.id];
        return copy;
      });
      console.error('[ResearchTab] failed to change reason', { id: item.id, next, error });
      alert(`Couldn't change reason: ${error.message}`);
      return;
    }
    onReload();
  }

  /** Status change with its activity-log entry — the panel and drag both use this. */
  async function changeStatus(item: ResearchItem, status: ResearchStatus) {
    if (status === item.status) return;
    await logActivity(ITEM_TYPE, item.id, 'Status changed', STATUS_LABELS[item.status], STATUS_LABELS[status]);
    await patch(item.id, { status });
  }

  /**
   * Delete an idea. Optimistic: the card leaves immediately (and the Total Ideas
   * count drops with it, since both read the same clientItems), and comes back
   * if the write fails — the UI is never left claiming something the database
   * disagrees with. The confirm step lives in ConfirmDelete, so by the time we
   * get here the user has already said yes.
   */
  async function deleteItem(id: string) {
    setDeletedIds(prev => new Set(prev).add(id));
    if (selectedId === id) setSelectedId(null);

    const { error } = await supabase.from('research_items').delete().eq('id', id);
    if (error) {
      setDeletedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      console.error('[ResearchTab] failed to delete idea', { id, error });
      showToast(`Couldn't delete: ${error.message}`, true);
      return;
    }
    showToast('Idea deleted');
    onReload();
  }

  const selected = selectedId ? clientItems.find(i => i.id === selectedId) ?? null : null;

  const fields: FieldDef[] = useMemo(() => [
    { key: 'title', label: 'Title', type: 'textarea', placeholder: 'Short, distinctive name' },
    { key: 'content', label: 'Source', type: 'maybe-url' },
    { key: 'reason', label: 'Reason', type: 'select', options: reasonOptions },
    {
      key: 'status',
      label: 'Status',
      type: 'pill',
      options: STATUS_ORDER,
      colors: STATUS_COLORS,
      optionLabels: STATUS_LABELS,
    },
    { key: 'note', label: 'Note', type: 'textarea', placeholder: 'Why is this worth keeping?' },
    { key: 'saved', label: 'Saved', type: 'readonly' },
  ], [reasonOptions]);

  const boardCards: BoardCard[] = useMemo(
    () => filtered.map(i => ({ id: i.id, title: i.title, status: i.status, data: i })),
    [filtered],
  );

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* One stat card, in the same shell the Studio summary uses. is-single
            keeps it card-width on the left rather than stretching the row. */}
        <div className="studio-stats is-single">
          <div className="studio-stat" style={{ '--stat-color': '#6366f1' } as React.CSSProperties}>
            <span className="studio-stat-icon"><Icon name="stack" size={19} /></span>
            <div className="studio-stat-body">
              <div className="studio-stat-label">Total Ideas</div>
              <div className="studio-stat-num">{totalIdeas}</div>
            </div>
          </div>
        </div>

        {/* Filter bar — search · reasons · status · view · add, one line. */}
        <div className="studio-toolbar research-toolbar">
          <div className="studio-search">
            <span className="studio-search-icon" aria-hidden>⌕</span>
            <input
              className="form-input"
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search ideas…"
              aria-label="Search ideas"
            />
          </div>

          <div className="studio-filters">
            {/* width:auto matters — .form-input sets width:100%, and a bare
                select without this override blows the toolbar onto three rows. */}
            <Dropdown
              variant="input"
              value={reasonFilter}
              options={[{ value: 'All', label: 'All reasons' }, ...reasonOptions.map(r => ({ value: r, label: r }))]}
              onChange={setReasonFilter}
              ariaLabel="Filter by reason"
            />
            <Dropdown
              variant="input"
              value={statusFilter}
              options={[{ value: 'All', label: 'All status' }, ...STATUS_ORDER.map(st => ({ value: st, label: STATUS_LABELS[st] }))]}
              onChange={setStatusFilter}
              ariaLabel="Filter by status"
            />
            <div className="view-seg" role="group" aria-label="View">
              <button type="button" className={view === 'grid' ? 'active' : undefined} aria-pressed={view === 'grid'} onClick={() => setView('grid')} title="Grid view">
                <Icon name="grid" size={14} />Grid
              </button>
              <button type="button" className={view === 'kanban' ? 'active' : undefined} aria-pressed={view === 'kanban'} onClick={() => setView('kanban')} title="Kanban view">
                <Icon name="list" size={14} />Kanban
              </button>
            </div>
          </div>

          <div className="studio-toolbar-end">
            <button className="btn-primary" style={{ fontSize: 12, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 7 }} onClick={openAddForm}>
              <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>+</span>Add Idea
            </button>
          </div>
        </div>

        {/* Add form */}
        {formOpen && (
          <div className="idea-form">
            <div className="idea-form-head">
              <span>New idea</span>
              <button onClick={closeForm} title="Cancel" aria-label="Cancel">✕</button>
            </div>
            <input
              ref={titleInputRef}
              className="form-input"
              placeholder="Title (required) — short, distinctive name"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveItem(); }}
              style={{ fontSize: 13, fontWeight: 600 }}
            />
            <input
              className="form-input"
              placeholder="Source URL (optional)"
              value={content}
              onChange={e => setContent(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveItem(); }}
            />
            <textarea
              className="form-input"
              placeholder="Note — why is this worth keeping? (Cmd+Enter to save)"
              value={note}
              onChange={e => setNote(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveItem(); }}
              style={{ minHeight: 62, resize: 'vertical', lineHeight: 1.45 }}
            />
            <div className="idea-form-foot">
              <Dropdown
                variant="input"
                value={reason}
                options={REASONS.map(r => ({ value: r, label: r }))}
                onChange={setReason}
                ariaLabel="Reason"
              />
              <button className="btn-primary" style={{ fontSize: 12, padding: '8px 16px', marginLeft: 'auto' }} onClick={saveItem} disabled={saving || !title.trim()}>
                {saving ? 'Saving…' : 'Save idea'}
              </button>
            </div>
          </div>
        )}

        {clientItems.length === 0 ? (
          <div className="idea-empty">
            <div className="idea-empty-mark" aria-hidden>💡</div>
            <div className="idea-empty-title">No ideas yet</div>
            <div className="idea-empty-sub">Capture hooks, formats, references — anything worth coming back to.</div>
            <button className="btn-primary" style={{ fontSize: 12, padding: '8px 18px' }} onClick={openAddForm}>+ Add Idea</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '40px 0', fontSize: 12 }}>
            No matches. Adjust the search or filters.
          </div>
        ) : view === 'kanban' ? (
          // The Studio board, with Research supplying its own card body. Dropping
          // into another column runs changeStatus — the same handler the panel's
          // status pill and the "Use" button run.
          <Board
            cards={boardCards}
            statuses={STATUS_ORDER}
            statusColors={STATUS_COLORS}
            statusLabels={STATUS_LABELS}
            profiles={profiles}
            selectedId={selectedId}
            onStatusChange={(id, status) => {
              const item = clientItems.find(x => x.id === id);
              if (item) changeStatus(item, status as ResearchStatus);
            }}
            onOpen={setSelectedId}
            renderCard={card => (
              <KanbanCardBody
                item={card.data as ResearchItem}
                onDelete={() => deleteItem(card.id)}
              />
            )}
          />
        ) : (
          <div className="idea-grid">
            {filtered.map(item => (
              <IdeaCard
                key={item.id}
                item={item}
                reason={effectiveReason(item)}
                reasonOptions={REASONS}
                onOpen={() => setSelectedId(item.id)}
                onChangeReason={r => changeReason(item, r)}
                onDelete={() => deleteItem(item.id)}
              />
            ))}
          </div>
        )}
      </div>

      {selected && (
        <ItemPanel
          itemType={ITEM_TYPE}
          itemId={selected.id}
          title={selected.title}
          commentsLabel="Notes"
          // deleteItem clears selectedId itself, so the panel closes on confirm.
          onDelete={() => deleteItem(selected.id)}
          fields={fields}
          values={{
            title: selected.title,
            content: selected.content ?? '',
            reason: selected.reason ?? '',
            status: selected.status,
            note: selected.note ?? '',
            saved: selected.created_at ? `Saved ${shortDate(selected.created_at)}` : '—',
          }}
          onChangeField={(key, value) => {
            if (key === 'saved') return; // read-only
            if (key === 'status') {
              changeStatus(selected, value as ResearchStatus);
              return;
            }
            patch(selected.id, { [key]: value || null } as Partial<ResearchItem>);
          }}
          onAddOption={() => { /* research reasons are a fixed list */ }}
          comments={comments}
          activity={activity}
          profiles={profiles}
          isAdmin={isAdmin}
          onReload={onReload}
          onClose={() => setSelectedId(null)}
        />
      )}

      {toast && <div className={toast.isError ? 'idea-toast is-error' : 'idea-toast'} role="status">{toast.msg}</div>}
    </div>
  );
}

/**
 * The reason chip, editable in place. The menu is portalled to <body> so the
 * card's `overflow: hidden` can't clip it and a later sibling card can't paint
 * over it. Every click inside stops propagating — React routes portal events
 * through the React tree, so without that a pick would also open the panel.
 */
function ReasonPicker({
  value, options, onPick,
}: {
  value: string;
  options: string[];
  onPick: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const color = reasonColor(value);

  // Anchor under the chip, and keep it there while the page moves.
  useEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ left: Math.min(r.left, window.innerWidth - 196), top: r.bottom + 6 });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  // Dismiss on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="idea-reason is-editable"
        style={{ '--reason-color': color } as React.CSSProperties}
        title="Change reason"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        onMouseDown={stop}
        onKeyDown={stop}
      >
        {value || 'Reason'}
        <span className="idea-reason-caret" aria-hidden>▾</span>
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={popRef}
          className="idea-reason-menu"
          style={{ left: pos.left, top: pos.top }}
          onClick={stop}
          onMouseDown={stop}
        >
          {options.map(o => (
            <button
              key={o}
              type="button"
              className={o === value ? 'active' : undefined}
              style={{ '--reason-color': reasonColor(o) } as React.CSSProperties}
              onClick={e => { e.stopPropagation(); setOpen(false); onPick(o); }}
            >
              <span className="idea-reason-swatch" aria-hidden />
              {o}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

/** Grid card — accent bar tinted by reason, per the reference. */
function IdeaCard({
  item, reason, reasonOptions, onOpen, onChangeReason, onDelete,
}: {
  item: ResearchItem;
  reason: string;
  reasonOptions: string[];
  onOpen: () => void;
  onChangeReason: (reason: string) => void;
  onDelete: () => void;
}) {
  const rColor = reasonColor(reason);
  const status = item.status;
  const source = item.content?.trim() || '';
  const sourceIsUrl = isUrl(source);

  return (
    <div
      className="idea-card"
      style={{ '--reason-color': rColor, '--status-color': STATUS_COLORS[status] } as React.CSSProperties}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}
      title="Open idea"
    >
      <span className="idea-accent" aria-hidden />

      <div className="idea-top">
        {sourceIsUrl ? <SourceChip url={source} /> : <span className="idea-source-none">No source</span>}
        <span className="idea-status">{STATUS_LABELS[status]}</span>
      </div>

      <div className="idea-title">{item.title || 'Untitled'}</div>

      {/* The note lives in the detail panel only — the card face stays to
          title + reason so footers can line up across the row. */}
      <div className="idea-reason-row">
        <ReasonPicker value={reason} options={reasonOptions} onPick={onChangeReason} />
      </div>

      <div className="idea-foot">
        <span className="idea-saved">{item.created_at ? `Saved ${shortDate(item.created_at)}` : ''}</span>
        {/* No source URL → no button at all, rather than a dead control. */}
        {sourceIsUrl && <OpenSourceLink url={source} />}
        <span className="idea-del"><ConfirmDelete onConfirm={onDelete} title="Delete idea" /></span>
      </div>
    </div>
  );
}

/** Kanban card — the same information, tightened for a column. */
function KanbanCardBody({ item, onDelete }: { item: ResearchItem; onDelete: () => void }) {
  if (!item) return null;
  const source = item.content?.trim() || '';
  return (
    <>
      <div className="idea-top">
        {isUrl(source) ? <SourceChip url={source} /> : <span className="idea-source-none">No source</span>}
        {item.reason && (
          <span className="idea-reason is-bare" style={{ '--reason-color': reasonColor(item.reason) } as React.CSSProperties}>
            {item.reason}
          </span>
        )}
      </div>
      <div className="idea-title is-compact">{item.title || 'Untitled'}</div>
      <div className="idea-foot is-compact">
        <span className="idea-saved">{item.created_at ? `Saved ${shortDate(item.created_at)}` : ''}</span>
        {isUrl(source) && <OpenSourceLink url={source} compact />}
        <span className="idea-del"><ConfirmDelete onConfirm={onDelete} title="Delete idea" compact /></span>
      </div>
    </>
  );
}
