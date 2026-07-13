'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StudioComment, Profile } from '@/lib/types';
import { profileName } from '@/lib/profile-name';
import { formatActivityTime } from '@/lib/studio';
import { INBOX_SOURCES, isUnread } from '@/lib/inbox';
import { usePersistedState } from '@/lib/use-persisted-state';
import { useDismiss } from '@/lib/use-dismiss';
import Avatar from '@/components/Avatar';
import CommentText from '@/components/CommentText';

// Newest-first activity inbox for every comment in the app. Slides in from the
// left, over the sidebar it belongs to (the pages behind keep their layout).
//
// Read state: entries currently listed are marked read on open — and again when
// the filter changes, since that changes what's "visible". `wasUnread` snapshots
// the unread set at open time so the blue dots you came to look at don't vanish
// out from under you mid-session; they're gone on the next open.

// Newest N entries. Comments in this app are per-item and low-volume, so this is
// a safety rail rather than paging — the count below says when it clips.
const MAX_ENTRIES = 100;

export default function InboxPanel({
  comments, profiles, currentUserId, readIds, itemTitles, onOpenItem, onMarkRead, onClose,
}: {
  comments: StudioComment[];
  profiles: Profile[];
  currentUserId: string | null;
  readIds: Set<string>;
  // "<item_type>:<item_id>" → the item's display name, resolved by the page (it
  // owns every table's rows).
  itemTitles: Map<string, string>;
  onOpenItem: (itemType: string, itemId: string) => void;
  onMarkRead: (commentIds: string[]) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = usePersistedState<'all' | 'mentions'>('inbox_filter', 'all');
  const panelRef = useRef<HTMLDivElement>(null);
  useDismiss(panelRef, onClose);

  // Unread at the moment the panel opened — purely for styling (see note above).
  const [wasUnread] = useState<Set<string>>(
    () => new Set(comments.filter(c => isUnread(c, currentUserId, readIds)).map(c => c.id))
  );

  const entries = useMemo(() => {
    const mine = (c: StudioComment) => !!currentUserId && (c.mentions || []).includes(currentUserId);
    return comments
      .filter(c => INBOX_SOURCES[c.item_type])           // only comment-bearing tabs
      .filter(c => (filter === 'mentions' ? mine(c) : true))
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, MAX_ENTRIES);
  }, [comments, filter, currentUserId]);

  // Seeing an entry is reading it.
  useEffect(() => {
    const unread = entries.filter(c => isUnread(c, currentUserId, readIds)).map(c => c.id);
    if (unread.length) onMarkRead(unread);
  }, [entries, currentUserId, readIds, onMarkRead]);

  const unreadTotal = comments.filter(c => isUnread(c, currentUserId, readIds)).length;

  return (
    <>
      <div aria-hidden style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.28)', zIndex: 1400, animation: 'fadeIn 0.18s ease' }} />
      <div
        ref={panelRef}
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0,
          width: 'min(42vw, 460px)', minWidth: 320, maxWidth: 460,
          zIndex: 1401, display: 'flex', flexDirection: 'column',
          borderRight: '0.5px solid var(--border)',
          background: 'var(--surface)',
          boxShadow: '16px 0 48px rgba(0,0,0,0.4)',
          animation: 'slideInLeft 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 22px 12px', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
            <div className="font-head" style={{ fontSize: 15, fontWeight: 700 }}>Inbox</div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}
              title="Close"
            >✕</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {(['all', 'mentions'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={filter === f ? 'btn-primary' : 'btn-ghost'}
                style={{ fontSize: 11, padding: '4px 12px' }}
              >
                {f === 'all' ? 'All' : 'Mentions'}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            {unreadTotal > 0 && (
              <button
                className="btn-ghost"
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => onMarkRead(comments.filter(c => isUnread(c, currentUserId, readIds)).map(c => c.id))}
              >
                Mark all read
              </button>
            )}
          </div>
        </div>

        {/* Entries */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
          {entries.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '24px 10px', textAlign: 'center' }}>
              {filter === 'mentions' ? 'No one has @-mentioned you yet.' : 'No comments yet.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {entries.map(c => {
                const src = INBOX_SOURCES[c.item_type];
                const author = profiles.find(p => p.id === c.author_id);
                const who = author ? profileName(author) : 'Unknown';
                const title = itemTitles.get(`${c.item_type}:${c.item_id}`) || 'Untitled';
                const unread = wasUnread.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => onOpenItem(c.item_type, c.item_id)}
                    title={`Open in ${src.tab}`}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                      background: unread ? 'var(--surface-2)' : 'transparent',
                      border: '0.5px solid var(--border)',
                      borderLeft: unread ? '2px solid var(--accent)' : '0.5px solid var(--border)',
                      borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = unread ? 'var(--surface-2)' : 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                      <Avatar name={who} size={18} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{who}</span>
                      {unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                      <div style={{ flex: 1 }} />
                      <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>{formatActivityTime(c.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4, marginBottom: 6, wordBreak: 'break-word' }}>
                      <CommentText text={c.text} profiles={profiles} currentUserId={currentUserId} clamp={140} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-faint)', background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 5, padding: '1px 6px', flexShrink: 0 }}>
                        {src.tab}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {title}
                      </span>
                    </div>
                  </button>
                );
              })}
              {entries.length === MAX_ENTRIES && (
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: 'center', padding: '8px 0' }}>
                  Showing the {MAX_ENTRIES} most recent comments.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
