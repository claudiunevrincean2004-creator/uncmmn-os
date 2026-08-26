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
import { AssigneeTag, resolveAssignee, UserPicker } from './UserPicker';
import { EditPillSelect, InlineDate } from './cells';

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
  /** Raw format / type value; the board renders it as an editable pill. */
  format?: string | null;
  /** Deadline / scheduled date / date added, whichever the tab shows. */
  date?: string | null;
  /** Draws the date in --neg (past deadline). */
  dateOverdue?: boolean;
  assignedToUserId?: string | null;
}

/**
 * The tab's format/type dropdown, wired to the SAME patch() the table cell uses.
 * Omit on a tab that has no such column (Story Sequences).
 */
export interface BoardFormatField {
  /** Dropdown-option key, e.g. 'video_format' — enables "+ Add new…". */
  field: string;
  options: string[];
  colors: Record<string, string>;
  allowAdd?: boolean;
  onAddOption?: (field: string, value: string) => void;
  onChange: (id: string, value: string) => void;
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
  /** Inline editors. Each is the tab's own patch handler — pass none to render
   *  that control as read-only text instead. */
  formatField?: BoardFormatField;
  onAssigneeChange?: (id: string, userId: string | null) => void;
  onDateChange?: (id: string, value?: string) => void;
}

/** Editors sit inside a draggable, clickable card, so every pointer event they
 *  see has to stop there: bubbling would start a drag (the sensors listen on the
 *  card root) or open the side panel. */
const swallow = {
  onClick: (e: React.SyntheticEvent) => e.stopPropagation(),
  onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(),
  onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation(),
};

/**
 * The card's body. `interactive` renders the live inline editors; the drag
 * overlay renders the same content as flat, non-interactive chips so the lifted
 * card is a snapshot rather than a second set of live dropdowns.
 */
function CardBody({
  card, profiles, interactive, formatField, onAssigneeChange, onDateChange,
}: {
  card: BoardCard;
  profiles: Profile[];
  interactive: boolean;
  formatField?: BoardFormatField;
  onAssigneeChange?: (id: string, userId: string | null) => void;
  onDateChange?: (id: string, value?: string) => void;
}) {
  const showFormat = !!formatField || !!card.format;
  const showDate = !!onDateChange || !!card.date;
  const showWho = !!onAssigneeChange || !!card.assignedToUserId;

  return (
    <>
      <div className="board-card-title">{card.title || 'Untitled'}</div>

      {showFormat && (
        <div className="board-card-format" {...(interactive ? swallow : {})}>
          {interactive && formatField ? (
            <EditPillSelect
              size="md"
              field={formatField.field}
              value={card.format || ''}
              options={formatField.options}
              colors={formatField.colors}
              onChange={v => formatField.onChange(card.id, v)}
              onAddOption={formatField.onAddOption}
              allowAdd={formatField.allowAdd}
              allowEmpty
            />
          ) : card.format ? (
            <span className="board-card-pill" style={pillStyle(formatField?.colors[card.format] || '#6b7280')}>{card.format}</span>
          ) : null}
        </div>
      )}

      {(showDate || showWho) && (
        <div className="board-card-meta">
          {showDate && (
            <span className="board-card-cell" {...(interactive ? swallow : {})}>
              {interactive && onDateChange ? (
                <InlineDate
                  display="chip"
                  value={card.date ?? undefined}
                  highlight={card.dateOverdue}
                  onCommit={d => onDateChange(card.id, d || undefined)}
                />
              ) : card.date ? (
                <span className={card.dateOverdue ? 'board-card-date is-overdue' : 'board-card-date'}>{shortDate(card.date)}</span>
              ) : null}
            </span>
          )}

          {showWho && (
            <span className="board-card-cell board-card-who" {...(interactive ? swallow : {})}>
              {interactive && onAssigneeChange ? (
                <UserPicker
                  size="md"
                  value={card.assignedToUserId ?? undefined}
                  profiles={profiles}
                  onChange={uid => onAssigneeChange(card.id, uid || null)}
                />
              ) : (
                <AssigneeTag name={resolveAssignee(card.assignedToUserId, profiles)} size={18} />
              )}
            </span>
          )}
        </div>
      )}
    </>
  );
}

/** The inline-editor handlers, passed straight through to CardBody. */
type Editors = Pick<Props, 'formatField' | 'onAssigneeChange' | 'onDateChange'>;

function SortableCard({
  card, profiles, selected, onOpen, editors,
}: {
  card: BoardCard;
  profiles: Profile[];
  selected: boolean;
  onOpen: (id: string) => void;
  editors: Editors;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  return (
    <div
      ref={setNodeRef}
      className={`board-card${isDragging ? ' is-dragging' : ''}${selected ? ' is-selected' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // A click that never became a drag (the sensors need 6px / a long press
      // first) still lands here and opens the same side panel the table rows do.
      // The inline editors swallow their own events, so they never reach this.
      onClick={() => onOpen(card.id)}
      {...attributes}
      {...listeners}
    >
      <CardBody card={card} profiles={profiles} interactive {...editors} />
    </div>
  );
}

function Column({
  status, color, cards, profiles, selectedId, isOver, onOpen, editors,
}: {
  status: string;
  color: string;
  cards: BoardCard[];
  profiles: Profile[];
  selectedId?: string | null;
  isOver: boolean;
  onOpen: (id: string) => void;
  editors: Editors;
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
            <SortableCard key={c.id} card={c} profiles={profiles} selected={selectedId === c.id} onOpen={onOpen} editors={editors} />
          ))}
          {cards.length === 0 && <div className="board-col-empty">Drop here</div>}
        </div>
      </SortableContext>
    </div>
  );
}

export default function Board({
  cards, statuses, statusColors, profiles, selectedId, onStatusChange, onOpen,
  formatField, onAssigneeChange, onDateChange,
}: Props) {
  const editors: Editors = { formatField, onAssigneeChange, onDateChange };
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
            editors={editors}
          />
        ))}
      </div>

      {/* The lifted card: follows the cursor, tilted and raised, while the one
          left behind fades to a placeholder. */}
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {activeCard && (
          <div className="board-card board-card-overlay">
            <CardBody card={activeCard} profiles={profiles} interactive={false} formatField={formatField} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
