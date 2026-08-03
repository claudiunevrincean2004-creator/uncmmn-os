'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioComment, StudioActivity, Profile, CommentReaction } from '@/lib/types';
import { formatActivityTime } from '@/lib/studio';
import { useDismiss } from '@/lib/use-dismiss';
import { InlineText, MiniSelect, PillSelect, EditSelect, EditPillSelect, InlineDate, InlineNumber, MaybeUrl, MaybeUrlCell, UrlCell, isHttpUrl, shortUrl } from './cells';
import { UserPicker, profileName } from './UserPicker';
import Avatar from '@/components/Avatar';
import MentionTextarea from '@/components/MentionTextarea';
import CommentText from '@/components/CommentText';
import EmojiPicker from '@/components/EmojiPicker';
import { parseMentions } from '@/lib/mentions';
import CopyLinkButton from '@/components/CopyLinkButton';
import { ItemType } from '@/lib/item-link';

// Collapse a comment's raw reaction rows into one pill per emoji: how many people
// used it, whether the current user is one of them (drives the toggled-on styling),
// and the list of names for the hover tooltip.
interface ReactionGroup { emoji: string; count: number; mine: boolean; who: string[] }
function groupReactions(rows: CommentReaction[], currentUserId: string | null, profiles: Profile[]): ReactionGroup[] {
  const map = new Map<string, ReactionGroup>();
  for (const r of rows) {
    let g = map.get(r.emoji);
    if (!g) { g = { emoji: r.emoji, count: 0, mine: false, who: [] }; map.set(r.emoji, g); }
    g.count++;
    if (r.user_id === currentUserId) g.mine = true;
    const p = profiles.find(x => x.id === r.user_id);
    g.who.push(r.user_id === currentUserId ? 'You' : (p ? profileName(p) : 'Someone'));
  }
  return Array.from(map.values());
}

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'pill' | 'url' | 'maybe-url' | 'date' | 'number' | 'readonly' | 'readonly-multiline' | 'readonly-url' | 'readonly-url-short' | 'readonly-maybe-url' | 'user';
  options?: string[];
  colors?: Record<string, string>;
  placeholder?: string;
  field?: string; // dropdown-option key — enables "+ Add new…" for select/pill
  allowAdd?: boolean; // false → admin-managed options only (no inline add)
  allowEmpty?: boolean;
  visibleIf?: (values: Record<string, any>) => boolean;
}

interface Props {
  // The comments/activity key for this row (studio_comments.item_type) — note
  // this is NOT the deep-link route type: Filming Sessions file their comments
  // under "session" but link at /studio/filming/<id>. Hence linkType, separately.
  itemType: string;
  linkType: ItemType;
  itemId: string;
  title: string;
  fields: FieldDef[];
  values: Record<string, any>;
  onChangeField: (key: string, value: any) => void;
  onAddOption: (field: string, value: string) => void;
  comments: StudioComment[];
  activity: StudioActivity[];
  profiles?: Profile[];
  isAdmin?: boolean;
  onReload: () => void;
  onClose: () => void;
}

function FieldControl({ field, values, onChangeField, onAddOption, profiles }: { field: FieldDef; values: Record<string, any>; onChangeField: (k: string, v: any) => void; onAddOption: (f: string, v: string) => void; profiles: Profile[] }) {
  const value = values[field.key];
  switch (field.type) {
    case 'text':
      return <InlineText value={value} onCommit={v => onChangeField(field.key, v)} placeholder={field.placeholder} style={{ width: '100%' }} />;
    case 'textarea':
      return <InlineText value={value} onCommit={v => onChangeField(field.key, v)} placeholder={field.placeholder} multiline style={{ width: '100%' }} />;
    case 'number':
      return <InlineNumber value={Number(value) || 0} onCommit={v => onChangeField(field.key, v)} width={80} />;
    case 'date':
      return <InlineDate value={value} onCommit={v => onChangeField(field.key, v || undefined)} />;
    case 'user':
      return <UserPicker value={value} profiles={profiles} onChange={v => onChangeField(field.key, v)} />;
    case 'select':
      return field.field
        ? <EditSelect field={field.field} value={value} options={field.options || []} onChange={v => onChangeField(field.key, v)} onAddOption={onAddOption} placeholder="—" width="100%" allowAdd={field.allowAdd} />
        : <MiniSelect value={value} options={field.options || []} onChange={v => onChangeField(field.key, v)} placeholder="—" width="100%" />;
    case 'pill':
      return field.field
        ? <EditPillSelect field={field.field} value={value || ''} options={field.options || []} colors={field.colors || {}} onChange={v => onChangeField(field.key, v)} onAddOption={onAddOption} allowAdd={field.allowAdd} allowEmpty={field.allowEmpty} />
        : <PillSelect value={value} options={field.options || []} colors={field.colors || {}} onChange={v => onChangeField(field.key, v)} />;
    case 'url':
      // Same renderer the main tables use: the resting state is the clickable,
      // truncated url (opens in a new tab), with the ✎ swapping in the editor —
      // never a bare input box with a launch arrow beside it.
      return <UrlCell value={value || undefined} onCommit={v => onChangeField(field.key, v)} variant="panel" />;
    case 'readonly-url':
      return value
        ? <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 12, wordBreak: 'break-all' }}>{value} ↗</a>
        : <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>—</span>;
    case 'readonly-url-short':
      // Clickable link showing the actual URL truncated to domain + start of path
      // (e.g. "drive.google.com/file/d/1rhPEx…"); plain text for a bare filename.
      return value
        ? (isHttpUrl(value)
            ? <a href={value} target="_blank" rel="noopener noreferrer" title={value} style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom', color: 'var(--accent)', textDecoration: 'none', fontSize: 12 }}>{shortUrl(value, 46)}</a>
            : <span style={{ color: 'var(--text-dim)', fontSize: 12, wordBreak: 'break-word' }} title={value}>{value}</span>)
        : <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>—</span>;
    case 'maybe-url':
      // Editable value that may be a URL or a bare filename (e.g. Full version file):
      // renders a clickable link when it's a URL, plain text otherwise, edit behind a ✎.
      return <MaybeUrlCell value={value || undefined} onCommit={v => onChangeField(field.key, v)} variant="panel" />;
    case 'readonly-maybe-url':
      // Link when the value is an http(s) URL, otherwise plain text (e.g. a filename).
      return <MaybeUrl value={value} />;
    case 'readonly-multiline':
      // Read-only free text that preserves the author's line breaks (e.g. a clip brief).
      return value != null && value !== ''
        ? <div style={{ color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{String(value)}</div>
        : <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>—</span>;
    case 'readonly':
    default:
      return <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{value != null && value !== '' ? String(value) : '—'}</span>;
  }
}

export default function ItemPanel({ itemType, linkType, itemId, title, fields, values, onChangeField, onAddOption, comments, activity, profiles = [], isAdmin = false, onReload, onClose }: Props) {
  const [newComment, setNewComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  // Reactions for the comments shown in this panel. Loaded here (not threaded from
  // the page) so toggling stays snappy without a full reload — mutations update
  // this list optimistically. pickerFor is the comment whose emoji picker is open.
  const [reactions, setReactions] = useState<CommentReaction[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  // Open reply composer, keyed by the TOP-LEVEL comment it will attach to (never a
  // reply's id — threading is single-level, see openReply).
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySaving, setReplySaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click-outside / Escape, committing pending field edits like the ✕ does
  useDismiss(panelRef, onClose);

  // Resolve the signed-in user so we can stamp new comments with their author id
  // and decide which comments they may edit/delete. Read-only — does not affect
  // role or tab access.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => { if (!cancelled) setCurrentUserId(data.user?.id ?? null); });
    return () => { cancelled = true; };
  }, []);

  // Display name for a comment's author (falls back to email prefix via
  // profileName); null when the comment predates author tracking.
  const authorName = (authorId?: string | null): string | null => {
    if (!authorId) return null;
    const p = profiles.find(x => x.id === authorId);
    return p ? profileName(p) : null;
  };

  // Every comment on this item — top-level AND replies. Replies are ordinary rows
  // with the same item_type/item_id, so they come down the same prop and share the
  // reaction fetch below without any extra plumbing.
  const itemComments = comments
    .filter(c => c.item_type === itemType && c.item_id === itemId)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  // Threads: top-level comments keep the existing newest-first order; each one's
  // replies read chronologically (oldest first) beneath it, the way a conversation
  // actually runs. A row whose parent is missing (deleted mid-session, before the
  // reload lands) falls back to rendering as top-level rather than disappearing.
  const topLevelIds = new Set(itemComments.filter(c => !c.parent_comment_id).map(c => c.id));
  const topLevelComments = itemComments.filter(c => !c.parent_comment_id || !topLevelIds.has(c.parent_comment_id));
  const repliesByParent = new Map<string, StudioComment[]>();
  for (const c of itemComments) {
    if (!c.parent_comment_id || !topLevelIds.has(c.parent_comment_id)) continue;
    const list = repliesByParent.get(c.parent_comment_id);
    if (list) list.push(c); else repliesByParent.set(c.parent_comment_id, [c]);
  }
  repliesByParent.forEach(list => list.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')));
  const repliesFor = (id: string) => repliesByParent.get(id) || [];

  const itemActivity = activity
    .filter(a => a.item_type === itemType && a.item_id === itemId)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  // Fetch reactions for exactly the comments shown here whenever that set changes
  // (panel opened, comment added/removed). Keyed on the id list so it doesn't refire
  // on unrelated re-renders. Missing table (migration not run) → no reactions, not a
  // crash, mirroring how comment_reads degrades.
  const itemCommentIdsKey = itemComments.map(c => c.id).join(',');
  useEffect(() => {
    const ids = itemCommentIdsKey ? itemCommentIdsKey.split(',') : [];
    if (ids.length === 0) { setReactions([]); return; }
    let cancelled = false;
    supabase.from('comment_reactions').select('*').in('comment_id', ids).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.warn('[ItemPanel] could not load reactions (run supabase/comment_reactions.sql):', error.message);
        return;
      }
      setReactions((data || []) as CommentReaction[]);
    });
    return () => { cancelled = true; };
  }, [itemCommentIdsKey]);

  // Add or remove the current user's `emoji` reaction on a comment. Optimistic: the
  // pill updates immediately and the row is written behind it; the insert's real id
  // replaces the temp one on success, and either op reverts on error.
  async function toggleReaction(commentId: string, emoji: string) {
    if (!currentUserId) return;
    const existing = reactions.find(r => r.comment_id === commentId && r.emoji === emoji && r.user_id === currentUserId);
    if (existing) {
      setReactions(prev => prev.filter(r => r.id !== existing.id));
      const { error } = await supabase.from('comment_reactions').delete()
        .eq('comment_id', commentId).eq('user_id', currentUserId).eq('emoji', emoji);
      if (error) {
        console.error('[ItemPanel] failed to remove reaction', error);
        setReactions(prev => [...prev, existing]);
        alert(`Couldn't remove reaction: ${error.message}`);
      }
    } else {
      const temp: CommentReaction = { id: `tmp-${commentId}-${emoji}`, comment_id: commentId, user_id: currentUserId, emoji };
      setReactions(prev => [...prev, temp]);
      const { data, error } = await supabase.from('comment_reactions')
        .insert([{ comment_id: commentId, user_id: currentUserId, emoji }])
        .select().single();
      if (error) {
        console.error('[ItemPanel] failed to add reaction', error);
        setReactions(prev => prev.filter(r => r.id !== temp.id));
        alert(`Couldn't add reaction: ${error.message}`);
      } else if (data) {
        setReactions(prev => prev.map(r => (r.id === temp.id ? (data as CommentReaction) : r)));
      }
    }
  }

  async function addComment() {
    const text = newComment.trim();
    if (!text || saving) return;
    setSaving(true);
    // Mentions are re-derived from the body rather than tracked as the user types,
    // so a mention deleted from the text is also gone from the array.
    const { error } = await supabase
      .from('studio_comments')
      .insert([{ item_type: itemType, item_id: itemId, text, author_id: currentUserId, mentions: parseMentions(text, profiles) }]);
    setSaving(false);
    if (error) {
      // Surface the failure instead of dropping the comment silently — e.g. a
      // missing author_id/mentions column (run studio_comments_author.sql and
      // comment_inbox.sql) or an RLS denial.
      console.error('[ItemPanel] failed to add comment', error);
      alert(`Couldn't add comment: ${error.message}`);
      return;
    }
    setNewComment('');
    onReload();
  }

  // Open the reply box for the thread `c` belongs to. SINGLE-LEVEL THREADING: a
  // reply's own Reply button attaches to that reply's parent, not to the reply, so
  // a thread is never more than two levels deep. Because that makes "who am I
  // answering?" ambiguous, replying to a reply pre-fills an @mention of its author.
  function openReply(c: StudioComment) {
    const parentId = c.parent_comment_id || c.id;
    // Already composing in this thread — never clobber what's been typed.
    if (replyTo === parentId) return;
    const answering = c.parent_comment_id && c.author_id !== currentUserId ? authorName(c.author_id) : null;
    setReplyTo(parentId);
    setReplyText(answering ? `@${answering} ` : '');
  }

  function closeReply() {
    setReplyTo(null);
    setReplyText('');
  }

  async function addReply(parentId: string) {
    const text = replyText.trim();
    if (!text || replySaving) return;
    setReplySaving(true);
    const { error } = await supabase
      .from('studio_comments')
      .insert([{ item_type: itemType, item_id: itemId, text, author_id: currentUserId, mentions: parseMentions(text, profiles), parent_comment_id: parentId }]);
    setReplySaving(false);
    if (error) {
      // Most likely a missing parent_comment_id column — run comment_threads.sql.
      console.error('[ItemPanel] failed to add reply', error);
      alert(`Couldn't add reply: ${error.message}`);
      return;
    }
    closeReply();
    onReload();
  }

  function startEdit(c: StudioComment) {
    setEditingId(c.id);
    setEditText(c.text);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText('');
  }

  async function saveEdit(id: string) {
    const text = editText.trim();
    if (!text) return;
    const { error } = await supabase.from('studio_comments').update({ text, mentions: parseMentions(text, profiles) }).eq('id', id);
    if (error) {
      console.error('[ItemPanel] failed to edit comment', error);
      alert(`Couldn't save comment: ${error.message}`);
      return;
    }
    cancelEdit();
    onReload();
  }

  async function deleteComment(id: string) {
    // Deleting a parent takes its replies with it (studio_comments.parent_comment_id
    // is ON DELETE CASCADE, as are the reactions and read-state rows hanging off
    // each). That's destructive enough to be worth confirming — but only when there
    // is actually a thread to lose.
    const replies = repliesFor(id).length;
    if (replies > 0 && !confirm(`Delete this comment and its ${replies} ${replies === 1 ? 'reply' : 'replies'}? This can't be undone.`)) return;
    if (replyTo === id) closeReply();
    const { error } = await supabase.from('studio_comments').delete().eq('id', id);
    if (error) {
      console.error('[ItemPanel] failed to delete comment', error);
      alert(`Couldn't delete comment: ${error.message}`);
      return;
    }
    onReload();
  }

  // One comment card — used for both a top-level comment and a reply, so the two
  // support exactly the same things (reactions, edit, delete, @mentions, linkified
  // URLs). A reply differs only in chrome: it sits on --surface rather than
  // --surface-2 and runs slightly tighter, which (with the thread rail it's drawn
  // inside) is what marks it as belonging to the comment above.
  //
  // Written as a plain function rather than a nested component so React keeps the
  // same element identity across renders — a component declared inside render
  // remounts on every keystroke and would blow away the edit box's focus.
  function renderComment(c: StudioComment, isReply: boolean) {
    const who = authorName(c.author_id);
    const isOwn = !!currentUserId && c.author_id === currentUserId;
    const editing = editingId === c.id;
    const groups = groupReactions(reactions.filter(r => r.comment_id === c.id), currentUserId, profiles);
    return (
      <div
        key={c.id}
        style={{
          background: isReply ? 'var(--surface)' : 'var(--surface-2)',
          border: '0.5px solid var(--border)',
          borderRadius: 8,
          padding: isReply ? '7px 9px' : '8px 10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <Avatar name={who || 'Unknown'} size={isReply ? 16 : 18} />
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{who || 'Unknown'}</div>
        </div>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 5 }}>
            <MentionTextarea
              value={editText}
              onChange={setEditText}
              profiles={profiles}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-primary" style={{ fontSize: 10, padding: '4px 10px' }} onClick={() => saveEdit(c.id)} disabled={!editText.trim()}>Save</button>
              <button className="btn-ghost" style={{ fontSize: 10, padding: '4px 10px' }} onClick={cancelEdit}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4, whiteSpace: 'pre-wrap', marginBottom: 5 }}>
            <CommentText text={c.text} profiles={profiles} currentUserId={currentUserId} />
          </div>
        )}
        {!editing && groups.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 5 }}>
            {groups.map(g => (
              <button
                key={g.emoji}
                type="button"
                onClick={() => toggleReaction(c.id, g.emoji)}
                title={g.who.join(', ')}
                disabled={!currentUserId}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, lineHeight: 1.4, padding: '1px 7px', borderRadius: 999,
                  cursor: currentUserId ? 'pointer' : 'default', fontFamily: 'inherit',
                  background: g.mine ? 'var(--accent-soft)' : (isReply ? 'var(--surface-2)' : 'var(--surface)'),
                  border: g.mine ? '1px solid var(--accent)' : '0.5px solid var(--border)',
                  color: g.mine ? 'var(--accent)' : 'var(--text-dim)',
                }}
              >
                <span style={{ fontSize: 12 }}>{g.emoji}</span>
                <span style={{ fontWeight: 600 }}>{g.count}</span>
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{formatActivityTime(c.created_at)}</span>
          {!editing && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {/* Reply / React live inline with Edit/Delete — always visible, same
                  text-button style, so the card never reflows. The picker anchors
                  to the React button (opens upward/leftward). */}
              {currentUserId && (
                <button
                  onClick={() => openReply(c)}
                  title={isReply ? 'Reply in this thread' : 'Reply to this comment'}
                  style={{ background: 'none', border: 'none', color: replyTo === (c.parent_comment_id || c.id) ? 'var(--accent)' : 'var(--text-faint)', cursor: 'pointer', fontSize: 10, padding: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = replyTo === (c.parent_comment_id || c.id) ? 'var(--accent)' : 'var(--text-faint)'; }}
                >Reply</button>
              )}
              {currentUserId && (
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <button
                    onClick={() => setPickerFor(prev => (prev === c.id ? null : c.id))}
                    title="Add reaction"
                    style={{ background: 'none', border: 'none', color: pickerFor === c.id ? 'var(--accent)' : 'var(--text-faint)', cursor: 'pointer', fontSize: 10, padding: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = pickerFor === c.id ? 'var(--accent)' : 'var(--text-faint)'; }}
                  >React</button>
                  {pickerFor === c.id && (
                    <EmojiPicker
                      onPick={emoji => { setPickerFor(null); toggleReaction(c.id, emoji); }}
                      onClose={() => setPickerFor(null)}
                    />
                  )}
                </span>
              )}
              {isOwn && (
                <button
                  onClick={() => startEdit(c)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 10, padding: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}
                >Edit</button>
              )}
              {(isAdmin || isOwn) && (
                <button
                  onClick={() => deleteComment(c.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 10, padding: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}
                >Delete</button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Subtle scrim so the panel reads as floating above the page (Notion-style):
          content behind stays visible but clearly underneath. Clicking it dismisses
          via the click-outside handler below. */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.28)',
          zIndex: 1400,
          animation: 'fadeIn 0.18s ease',
        }}
      />
      <div
        ref={panelRef}
        style={{
          // Floating slide-over: fixed to the right edge, above the page content,
          // so the page keeps its full width and layout (nothing behind reflows).
          // Desktop ≈ half the viewport, capped for ultrawide; narrow/mobile stays
          // near-full via minWidth (50vw of a phone is tiny → clamps to 340).
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(50vw, 720px)',
          minWidth: 340,
          maxWidth: 720,
          zIndex: 1401,
          overflowY: 'auto',
          borderLeft: '0.5px solid var(--border)',
          background: 'var(--surface)',
          boxShadow: '-16px 0 48px rgba(0, 0, 0, 0.4)',
          padding: '22px 26px',
          animation: 'slideInRight 0.2s ease',
        }}
      >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, wordBreak: 'break-word' }}>{title || 'Untitled'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingTop: 1 }}>
          <CopyLinkButton type={linkType} id={itemId} variant="panel" />
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}
            title="Close"
          >✕</button>
        </div>
      </div>

      {/* Properties */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 28 }}>
        {fields.filter(f => !f.visibleIf || f.visibleIf(values)).map(f => (
          <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 16, alignItems: 'start' }}>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, paddingTop: 7 }}>{f.label}</div>
            <div><FieldControl field={f} values={values} onChangeField={onChangeField} onAddOption={onAddOption} profiles={profiles} /></div>
          </div>
        ))}
      </div>

      {/* Comments */}
      <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 20, marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
          Comments {itemComments.length > 0 && <span style={{ color: 'var(--text-faint)' }}>· {itemComments.length}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <MentionTextarea
            value={newComment}
            onChange={setNewComment}
            profiles={profiles}
            onSubmit={addComment}
            placeholder="Leave a comment… (@ to mention, Enter to send, Shift+Enter for a new line)"
          />
          <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', alignSelf: 'flex-end' }} onClick={addComment} disabled={saving || !newComment.trim()}>
            {saving ? '…' : 'Add'}
          </button>
        </div>
        {itemComments.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>No comments yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topLevelComments.map(c => {
              const replies = repliesFor(c.id);
              const composing = replyTo === c.id;
              return (
                <div key={c.id}>
                  {renderComment(c, false)}
                  {(replies.length > 0 || composing) && (
                    // The thread rail: an indent plus a vertical connector running
                    // down the left of everything that belongs to this comment, so
                    // a reply is never mistaken for a new top-level comment.
                    <div
                      style={{
                        marginLeft: 14,
                        paddingLeft: 12,
                        marginTop: 6,
                        borderLeft: '1.5px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      {replies.map(r => renderComment(r, true))}
                      {composing && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <MentionTextarea
                            value={replyText}
                            onChange={setReplyText}
                            profiles={profiles}
                            onSubmit={() => addReply(c.id)}
                            autoFocus
                            placeholder="Write a reply… (@ to mention, Enter to send)"
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignSelf: 'flex-end' }}>
                            <button className="btn-primary" style={{ fontSize: 10, padding: '4px 10px' }} onClick={() => addReply(c.id)} disabled={replySaving || !replyText.trim()}>
                              {replySaving ? '…' : 'Reply'}
                            </button>
                            <button className="btn-ghost" style={{ fontSize: 10, padding: '4px 10px' }} onClick={closeReply}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Activity log */}
      <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Activity</div>
        {itemActivity.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>No activity yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {itemActivity.map(a => (
              <div key={a.id} style={{ display: 'flex', gap: 8, fontSize: 11, lineHeight: 1.4 }}>
                <span style={{ color: '#8b5cf6', marginTop: 1 }}>•</span>
                <span style={{ color: 'var(--text-dim)' }}>
                  {a.action}
                  {a.old_value != null && a.new_value != null && (
                    <> from <span style={{ color: 'var(--text-dim)' }}>{a.old_value}</span> to <span style={{ color: 'var(--text-dim)' }}>{a.new_value}</span></>
                  )}
                  <span style={{ color: 'var(--text-faint)' }}> — {formatActivityTime(a.created_at)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </>
  );
}
