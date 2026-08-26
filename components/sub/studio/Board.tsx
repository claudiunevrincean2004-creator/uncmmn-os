'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor,
  closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Profile } from '@/lib/types';
import { pillStyle, shortDate } from '@/lib/studio';
import { AssigneeTag, resolveAssignee } from './UserPicker';

// ============================================================================
// Kanban board shared by all four Studio tabs. One column per status, in the
// tab's own pipeline order, and a card per row.
//
// DRAGGING A CARD TO ANOTHER COLUMN DOES NOT WRITE ANYTHING ITSELF: it calls
// the `onStatusChange` the tab passed in, which is that tab's existing
// changeStatus() — the exact handler the row's Status pill uses. So the activity
// log entry, the Slack ping and every other side effect fire the same way they
// always have, from one code path. This component owns presentation only.
//
// Realtime needs nothing here either: `items` comes down from the page's live
// state, so another user's status change re-renders the board into place.
// ============================================================================

const COL = 'col:';

/** One card's worth of display data — each tab maps its own row shape to this. */
export interface BoardCard {
  id: string;
  title: string;
  status: string;
  /** Format / type chip, tinted with its own colour. */
  pill?: { label: string; color: string } | null;
  /** Deadline / scheduled date / date added, whichever the tab shows. */
  date?: string | null;
  /** Draws the date in --neg (past deadline). */
  dateOverdue?: boolean;
  assignedToUserId?: string | null;
  /** Compact link chips — one letter each, e.g. B/R/F for Brief/Raw/Final. */
  links?: { key: string; label: string; title: string; url?: string | null }[];
}

interface Props {
  cards: BoardCard[];
  /** Pipeline order. Any status present on a card but missing here is appended. */
  statuses: string[];
  statusColors: Record<string, string>;
  profiles: Profile[];
  selectedId?: string | null;
  /** The tab's existing changeStatus, looked up by id. */
  onStatusChange: (id: string, status: string) => void;
  onOpen: (id: string) => void;
}

function LinkChips({ links }: { links: NonNullable<BoardCard['links']> }) {
  return (
    <span className="board-chips">
      {links.map(l => (
        l.url
          ? (
            <a
              key={l.key}
              className="board-chip is-set"
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`${l.title} — ${l.url}`}
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
            >{l.label}</a>
          )
          : <span key={l.key} className="board-chip" title={`${l.title} — not set`}>{l.label}</span>
      ))}
    </span>
  );
}

/** The card's visual body — shared by the in-column card and the drag overlay. */
function CardBody({ card, profiles }: { card: BoardCard; profiles: Profile[] }) {
  const assignee = resolveAssignee(card.assignedToUserId, profiles);
  const hasMeta = !!card.date || !!card.assignedToUserId || !!card.links?.length;
  return (
    <>
      <div className="board-card-title">{card.title || 'Untitled'}</div>
      {card.pill && (
        <span className="board-card-pill" style={pillStyle(card.pill.color)}>{card.pill.label}</span>
      )}
      {hasMeta && (
        <div className="board-card-meta">
          {card.date && (
            <span className={card.dateOverdue ? 'board-card-date is-overdue' : 'board-card-date'}>
              {shortDate(card.date)}
            </span>
          )}
          <span className="board-card-who"><AssigneeTag name={assignee} size={18} /></span>
          {!!card.links?.length && <LinkChips links={card.links} />}
        </div>
      )}
    </>
  );
}

function SortableCard({
  card, profiles, selected, onOpen,
}: {
  card: BoardCard;
  profiles: Profile[];
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  return (
    <div
      ref={setNodeRef}
      className={`board-card${isDragging ? ' is-dragging' : ''}${selected ? ' is-selected' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // A click that never became a drag (the sensors need 6px / a long press
      // first) still lands here and opens the same side panel the table rows do.
      onClick={() => onOpen(card.id)}
      {...attributes}
      {...listeners}
    >
      <CardBody card={card} profiles={profiles} />
    </div>
  );
}

function Column({
  status, color, cards, profiles, selectedId, isOver, onOpen,
}: {
  status: string;
  color: string;
  cards: BoardCard[];
  profiles: Profile[];
  selectedId?: string | null;
  isOver: boolean;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `${COL}${status}` });
  return (
    <div className={`board-col${isOver ? ' is-over' : ''}`} style={{ '--col-accent': color } as React.CSSProperties}>
      <div className="board-col-head">
        <span className="board-col-dot" />
        <span className="board-col-name">{status}</span>
        <span className="board-col-count">{cards.length}</span>
      </div>
      <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
        <div className="board-col-body" ref={setNodeRef}>
          {cards.map(c => (
            <SortableCard key={c.id} card={c} profiles={profiles} selected={selectedId === c.id} onOpen={onOpen} />
          ))}
          {cards.length === 0 && <div className="board-col-empty">Drop here</div>}
        </div>
      </SortableContext>
    </div>
  );
}

export default function Board({
  cards, statuses, statusColors, profiles, selectedId, onStatusChange, onOpen,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<string | null>(null);
  // Where a just-dropped card should sit until the write lands and the fresh row
  // comes back down — without it the card snaps back for a beat, then jumps.
  const [pending, setPending] = useState<Record<string, string>>({});
  // Within-column order the user has dragged into. Presentation only: reordering
  // inside a column is deliberately NOT persisted (no rank column to write to).
  const [manualOrder, setManualOrder] = useState<Record<string, string[]>>({});

  // Retire optimistic moves once the real data agrees (or the row disappears).
  useEffect(() => {
    setPending(prev => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const byId = new Map(cards.map(c => [c.id, c.status]));
      const next: Record<string, string> = {};
      for (const id of keys) {
        const real = byId.get(id);
        if (real !== undefined && real !== prev[id]) next[id] = prev[id];
      }
      return Object.keys(next).length === keys.length ? prev : next;
    });
  }, [cards]);

  const statusOfCard = (c: BoardCard) => pending[c.id] ?? c.status;

  // Pipeline order first, then any stray status a row actually carries, so a
  // card can never fall off the board just because its status was retired.
  const columns = useMemo(() => {
    const extra = cards
      .map(statusOfCard)
      .filter(s => s && !statuses.includes(s));
    const all = [...statuses, ...Array.from(new Set(extra))];
    return all.map(status => {
      const inCol = cards.filter(c => statusOfCard(c) === status);
      const manual = manualOrder[status];
      if (manual) {
        const rank = new Map(manual.map((id, i) => [id, i]));
        inCol.sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
      }
      return { status, color: statusColors[status] || '#6b7280', cards: inCol };
    });
    // statusOfCard closes over `pending`, which is in the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, statuses, statusColors, manualOrder, pending]);

  const sensors = useSensors(
    // 6px of travel before a drag starts, so a plain click still opens the panel.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Touch needs a press-and-hold instead, or the board could never be scrolled.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Which column an over-id belongs to — it may be a column or a card. */
  function statusOfOver(overId: string): string | null {
    if (overId.startsWith(COL)) return overId.slice(COL.length);
    const c = cards.find(x => x.id === overId);
    return c ? statusOfCard(c) : null;
  }

  function reset() {
    setActiveId(null);
    setOverStatus(null);
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    setOverStatus(e.over ? statusOfOver(String(e.over.id)) : null);
  }

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const card = cards.find(c => c.id === id);
    const target = e.over ? statusOfOver(String(e.over.id)) : null;
    reset();
    if (!card || !target) return;

    const from = statusOfCard(card);
    if (target !== from) {
      // Optimistic placement, then hand off to the tab's own changeStatus —
      // the single path that logs the change and fires the Slack ping.
      setPending(p => ({ ...p, [id]: target }));
      onStatusChange(id, target);
      return;
    }

    // Same column: a visual reorder only, never a status write.
    const overId = String(e.over!.id);
    if (overId === id || overId.startsWith(COL)) return;
    const ids = columns.find(c => c.status === from)?.cards.map(c => c.id) ?? [];
    const oldIndex = ids.indexOf(id);
    const newIndex = ids.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) return;
    setManualOrder(m => ({ ...m, [from]: arrayMove(ids, oldIndex, newIndex) }));
  }

  const activeCard = activeId ? cards.find(c => c.id === activeId) ?? null : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <div className="board">
        {columns.map(col => (
          <Column
            key={col.status}
            status={col.status}
            color={col.color}
            cards={col.cards}
            profiles={profiles}
            selectedId={selectedId}
            isOver={!!activeId && overStatus === col.status}
            onOpen={onOpen}
          />
        ))}
      </div>

      {/* The lifted card: follows the cursor, tilted and raised, while the one
          left behind fades to a placeholder. */}
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {activeCard && (
          <div className="board-card board-card-overlay">
            <CardBody card={activeCard} profiles={profiles} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
