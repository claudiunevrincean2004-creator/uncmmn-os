'use client';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioComment, StudioActivity, Profile, CommentReaction } from '@/lib/types';
import { formatActivityTime } from '@/lib/studio';
import { useDismiss } from '@/lib/use-dismiss';
import { nextChannelName } from '@/lib/use-realtime';
import { InlineText, EditableText, MiniSelect, PillSelect, EditSelect, EditPillSelect, InlineDate, InlineNumber, InlineMoney, MaybeUrl, MaybeUrlCell, UrlCell, isHttpUrl, shortUrl } from './cells';
import { UserPicker, profileName } from './UserPicker';
import Avatar from '@/components/Avatar';
import MentionTextarea from '@/components/MentionTextarea';
import CommentText from '@/components/CommentText';
import EmojiPicker from '@/components/EmojiPicker';
import { parseMentions } from '@/lib/mentions';
import CopyLinkButton from '@/components/CopyLinkButton';
import ConfirmDelete from '@/components/ConfirmDelete';
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
  type: 'text' | 'textarea' | 'select' | 'pill' | 'url' | 'maybe-url' | 'date' | 'number' | 'money' | 'readonly' | 'readonly-multiline' | 'readonly-url' | 'readonly-url-short' | 'readonly-maybe-url' | 'user';
  options?: string[];
  colors?: Record<string, string>;
  /** Display text per stored option value, for fields whose DB values aren't
   *  presentable (research status: 'progress' → "In Progress"). */
  optionLabels?: Record<string, string>;
  placeholder?: string;
  field?: string; // dropdown-option key — enables "+ Add new…" for select/pill
  allowAdd?: boolean; // false → admin-managed options only (no inline add)
  allowEmpty?: boolean;
  visibleIf?: (values: Record<string, any>) => boolean;
  /**
   * Guard a value before it is written. Return a message to REJECT the edit —
   * onChangeField is never called, the control snaps back to the stored value,
   * and the message renders under the field. Return null to allow it.
   *
   * For invariants the database also enforces (Finance's "a paid payment must
   * have a paid date"), so the user gets a sentence instead of a constraint
   * violation from Postgres.
   */
  validate?: (value: any, values: Record<string, any>) => string | null;
}

interface Props {
  // The comments/activity key for this row (studio_comments.item_type) — note
  // this is NOT the deep-link route type: Filming Sessions file their comments
  // under "session" but link at /studio/filming/<id>. Hence linkType, separately.
  itemType: string;
  /** Omit on a surface with no deep-link route of its own (Research) — the
   *  copy-link control is simply not rendered. */
  linkType?: ItemType;
  itemId: string;
  title: string;
  /** Heading for the comments block — "Notes" on Research, say. */
  commentsLabel?: string;
  /** Omit to hide the header's Delete button. Confirmed before it fires; the
   *  caller is responsible for closing the panel afterwards. */
  onDelete?: () => void;
  fields: FieldDef[];
  values: Record<string, any>;
  /** Extra controls rendered under the properties — actions that belong to the
   *  row but aren't a field of it (Finance's "Resend notification"). */
  footer?: ReactNode;
  onChangeField: (key: string, value: any) => void;
  onAddOption: (field: string, value: string) => void;
  /**
   * false → render the properties ONLY: no comment thread, no activity log, and
   * no comment_reactions subscription. Finance uses this, because comments and
   * activity live in studio_comments / studio_activity, which every authenticated
   * user can read — the one place a payment discussion must never end up. Every
   * Studio tab leaves this at its default and is unaffected.
   */
  showComments?: boolean;
  comments?: StudioComment[];
  activity?: StudioActivity[];
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
      // Title / Desc and friends read as plain text until you click to edit —
      // the same resting calm as Revisions or a link field, rather than an
      // always-open box. Multi-line, so Enter is a newline and Save commits.
      return <EditableText value={value} onCommit={v => onChangeField(field.key, v)} placeholder={field.placeholder} />;
    case 'number':
      return <InlineNumber value={Number(value) || 0} onCommit={v => onChangeField(field.key, v)} width={80} />;
    case 'money':
      // USD with cents, resting as formatted text — same control the Finance
      // table uses, so the panel and the row can't drift.
      return <InlineMoney value={value == null || value === '' ? null : Number(value)} onCommit={v => onChangeField(field.key, v)} />;
    case 'date':
      return <InlineDate value={value} onCommit={v => onChangeField(field.key, v || undefined)} />;
    case 'user':
      // size="md" throughout: the panel's pills and assignee chip are the same
      // controls the table row uses, so the two never drift apart in shape.
      return <UserPicker size="md" value={value} profiles={profiles} onChange={v => onChangeField(field.key, v)} />;
    case 'select':
      return field.field
        ? <EditSelect field={field.field} value={value} options={field.options || []} onChange={v => onChangeField(field.key, v)} onAddOption={onAddOption} placeholder="—" width="100%" allowAdd={field.allowAdd} />
        : <MiniSelect value={value} options={field.options || []} labels={field.optionLabels} onChange={v => onChangeField(field.key, v)} placeholder="—" width="100%" />;
    case 'pill':
      return field.field
        ? <EditPillSelect size="md" field={field.field} value={value || ''} options={field.options || []} colors={field.colors || {}} labels={field.optionLabels} onChange={v => onChangeField(field.key, v)} onAddOption={onAddOption} allowAdd={field.allowAdd} allowEmpty={field.allowEmpty} />
        : <PillSelect size="md" value={value} options={field.options || []} colors={field.colors || {}} labels={field.optionLabels} onChange={v => onChangeField(field.key, v)} />;
    case 'url':
      // Same renderer the main tables use: the resting state is the clickable,
      // truncated url (opens in a new tab), and clicking the field around it
      // expands the inline editor — never a bare input box sitting open.
      return <UrlCell value={value || undefined} onCommit={v => onChangeField(field.key, v)} variant="panel" />;
    case 'readonly-url':
      return value
        ? <a className="link-anim" href={value} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 12, wordBreak: 'break-all' }}>{value} ↗</a>
        : <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>—</span>;
    case 'readonly-url-short':
      // Clickable link showing the actual URL truncated to domain + start of path
      // (e.g. "drive.google.com/file/d/1rhPEx…"); plain text for a bare filename.
      return value
        ? (isHttpUrl(value)
            ? <a className="link-anim" href={value} target="_blank" rel="noopener noreferrer" title={value} style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom', color: 'var(--accent)', fontSize: 12 }}>{shortUrl(value, 46)}</a>
            : <span style={{ color: 'var(--text-dim)', fontSize: 12, wordBreak: 'break-word' }} title={value}>{value}</span>)
        : <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>—</span>;
    case 'maybe-url':
      // Editable value that may be a URL or a bare filename (e.g. Full version file):
      // renders a clickable link when it's a URL, plain text otherwise, click to edit.
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

export default function ItemPanel({ itemType, linkType, itemId, title, commentsLabel = 'Comments', onDelete, fields, values, footer, onChangeField, onAddOption, showComments = true, comments = [], activity = [], profiles = [], isAdmin = false, onReload, onClose }: Props) {
  const [newComment, setNewComment] = useState('');
  // Whether the new-comment box is focused — drives whether Add is on screen.
  const [composerActive, setComposerActive] = useState(false);
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
  // Rejected edits, keyed by field. Only ever set by a FieldDef.validate that
  // returned a message; cleared as soon as that field takes a legal value.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click-outside / Escape, committing pending field edits like the ✕ does
  useDismiss(panelRef, onClose);

  /**
   * Every field write goes through here. A FieldDef.validate that returns a
   * message stops the write dead: onChangeField is never reached, so nothing is
   * sent to the database, and the state change below re-renders the control
   * from the UNCHANGED `values` — which is what snaps a cleared input back to
   * what is actually stored.
   */
  function commitField(key: string, value: any) {
    const def = fields.find(f => f.key === key);
    const message = def?.validate ? def.validate(value, values) : null;
    setFieldErrors(prev => {
      if (message) return { ...prev, [key]: message };
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (message) return;
    onChangeField(key, value);
  }

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

  // Live reactions. The fetch above only reruns when the comment SET changes, so
  // without this a reaction another user adds to a comment already on screen
  // would never show up. postgres_changes has no "in (…)" filter, so the panel's
  // own comment ids are matched client-side, through a ref the handler reads at
  // event time (the subscription itself must not churn as comments come and go).
  const visibleCommentIds = useRef<Set<string>>(new Set());
  visibleCommentIds.current = new Set(itemCommentIdsKey ? itemCommentIdsKey.split(',') : []);

  useEffect(() => {
    // Nothing to keep live on a comment-free panel (Finance) — and no reason to
    // open a socket for a table it never reads.
    if (!showComments) return;
    const channel = supabase
      .channel(nextChannelName(`uncmmn-os-reactions:${itemType}:${itemId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comment_reactions' }, payload => {
        if (payload.eventType === 'DELETE') {
          // `old` carries only the primary key, so "is this one of ours?" is
          // answered by whether we're actually holding that row.
          const id = payload.old?.id as string | undefined;
          if (!id) return;
          setReactions(prev => (prev.some(r => r.id === id) ? prev.filter(r => r.id !== id) : prev));
          return;
        }
        const row = payload.new as CommentReaction;
        if (!row?.id || !visibleCommentIds.current.has(row.comment_id)) return;
        setReactions(prev => {
          // Match on the unique (comment, user, emoji) triple as well as the id,
          // so this also absorbs the echo of our own optimistic insert — whose
          // temp row carries a `tmp-…` id — instead of double-counting it.
          const same = (r: CommentReaction) =>
            r.id === row.id ||
            (r.comment_id === row.comment_id && r.user_id === row.user_id && r.emoji === row.emoji);
          return prev.some(same) ? prev.map(r => (same(r) ? row : r)) : [...prev, row];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [itemType, itemId, showComments]);

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
        className="item-panel"
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
          animation: 'slideInRight 0.2s ease',
        }}
      >
      {/* Header — the title gets room to breathe, then a rule down to the props */}
      <div className="panel-head">
        <div className="panel-title">{title || 'Untitled'}</div>
        <div className="panel-head-actions">
          {onDelete && <ConfirmDelete onConfirm={onDelete} variant="button" title="Delete this item" />}
          {linkType && <CopyLinkButton type={linkType} id={itemId} variant="panel" />}
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}
            title="Close"
          >✕</button>
        </div>
      </div>

      {/* Properties — one per hairline-divided row, label column aligned all the
          way down, exactly like the table this panel opened from. */}
      <div className="panel-props">
        {fields.filter(f => !f.visibleIf || f.visibleIf(values)).map(f => {
          // Multi-line controls read from the top, so their label rides up too.
          const tall = f.type === 'textarea' || f.type === 'readonly-multiline';
          const error = fieldErrors[f.key];
          return (
            <div key={f.key} className={tall ? 'panel-prop is-tall' : 'panel-prop'}>
              <div className="panel-prop-label">{f.label}</div>
              <div className="panel-prop-value">
                <FieldControl field={f} values={values} onChangeField={commitField} onAddOption={onAddOption} profiles={profiles} />
                {error && (
                  // aria-live, because the control that triggered this keeps
                  // focus — nothing else would announce the rejection.
                  <div className="panel-prop-error" role="alert" aria-live="polite">{error}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {footer && <div className="panel-footer">{footer}</div>}

      {/* Comments + Activity. Both live in shared, authenticated-readable tables,
          so a surface that must not leak (Finance) opts out of the pair. */}
      {showComments && <>
      <div className="panel-section">
        <div className="panel-section-title">
          {commentsLabel} {itemComments.length > 0 && <span>· {itemComments.length}</span>}
        </div>
        {/* Idle, this is just the placeholder box — Add only appears once the
            composer is in use. Text keeps it visible after blur, so the button
            is never yanked out from under the click that's about to land. */}
        <div className="panel-composer">
          <MentionTextarea
            value={newComment}
            onChange={setNewComment}
            profiles={profiles}
            onSubmit={addComment}
            onFocus={() => setComposerActive(true)}
            onBlur={() => setComposerActive(false)}
            placeholder="Leave a comment… (@ to mention, Enter to send, Shift+Enter for a new line)"
          />
          {(composerActive || newComment.trim().length > 0) && (
            <div className="panel-composer-actions is-revealed">
              <button className="btn-primary" style={{ fontSize: 11, padding: '6px 14px' }} onClick={addComment} disabled={saving || !newComment.trim()}>
                {saving ? '…' : 'Add'}
              </button>
            </div>
          )}
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
                        // Same composer shape as the top-level one: actions on
                        // their own line under the box, right-aligned.
                        <div className="panel-composer" style={{ marginBottom: 0 }}>
                          <MentionTextarea
                            value={replyText}
                            onChange={setReplyText}
                            profiles={profiles}
                            onSubmit={() => addReply(c.id)}
                            autoFocus
                            placeholder="Write a reply… (@ to mention, Enter to send)"
                          />
                          <div className="panel-composer-actions">
                            <button className="btn-ghost" style={{ fontSize: 10, padding: '5px 12px' }} onClick={closeReply}>Cancel</button>
                            <button className="btn-primary" style={{ fontSize: 10, padding: '5px 12px' }} onClick={() => addReply(c.id)} disabled={replySaving || !replyText.trim()}>
                              {replySaving ? '…' : 'Reply'}
                            </button>
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
      <div className="panel-section">
        <div className="panel-section-title">Activity</div>
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
      </>}
      </div>
    </>
  );
}
