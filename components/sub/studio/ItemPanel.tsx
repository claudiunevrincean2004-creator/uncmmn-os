'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioComment, StudioActivity, Profile } from '@/lib/types';
import { formatActivityTime } from '@/lib/studio';
import { useDismiss } from '@/lib/use-dismiss';
import { InlineText, MiniSelect, PillSelect, EditSelect, EditPillSelect, InlineDate, InlineNumber } from './cells';
import { UserPicker, profileName } from './UserPicker';
import Avatar from '@/components/Avatar';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'pill' | 'url' | 'date' | 'number' | 'readonly' | 'readonly-url' | 'user';
  options?: string[];
  colors?: Record<string, string>;
  placeholder?: string;
  field?: string; // dropdown-option key — enables "+ Add new…" for select/pill
  allowAdd?: boolean; // false → admin-managed options only (no inline add)
  allowEmpty?: boolean;
  visibleIf?: (values: Record<string, any>) => boolean;
}

interface Props {
  itemType: string;
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
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
          <InlineText value={value} onCommit={v => onChangeField(field.key, v)} placeholder="https://…" style={{ flex: 1 }} />
          {value && <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 14 }} title={value}>↗</a>}
        </div>
      );
    case 'readonly-url':
      return value
        ? <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 12, wordBreak: 'break-all' }}>{value} ↗</a>
        : <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>—</span>;
    case 'readonly':
    default:
      return <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{value != null && value !== '' ? String(value) : '—'}</span>;
  }
}

export default function ItemPanel({ itemType, itemId, title, fields, values, onChangeField, onAddOption, comments, activity, profiles = [], isAdmin = false, onReload, onClose }: Props) {
  const [newComment, setNewComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
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

  const itemComments = comments
    .filter(c => c.item_type === itemType && c.item_id === itemId)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const itemActivity = activity
    .filter(a => a.item_type === itemType && a.item_id === itemId)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  async function addComment() {
    const text = newComment.trim();
    if (!text || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from('studio_comments')
      .insert([{ item_type: itemType, item_id: itemId, text, author_id: currentUserId }]);
    setSaving(false);
    if (error) {
      // Surface the failure instead of dropping the comment silently — e.g. a
      // missing author_id column (run studio_comments_author.sql) or an RLS denial.
      console.error('[ItemPanel] failed to add comment', error);
      alert(`Couldn't add comment: ${error.message}`);
      return;
    }
    setNewComment('');
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
    const { error } = await supabase.from('studio_comments').update({ text }).eq('id', id);
    if (error) {
      console.error('[ItemPanel] failed to edit comment', error);
      alert(`Couldn't save comment: ${error.message}`);
      return;
    }
    cancelEdit();
    onReload();
  }

  async function deleteComment(id: string) {
    const { error } = await supabase.from('studio_comments').delete().eq('id', id);
    if (error) {
      console.error('[ItemPanel] failed to delete comment', error);
      alert(`Couldn't delete comment: ${error.message}`);
      return;
    }
    onReload();
  }

  return (
    <div
      ref={panelRef}
      style={{
        width: '40%',
        minWidth: 340,
        maxWidth: 560,
        flexShrink: 0,
        alignSelf: 'flex-start',
        position: 'sticky',
        top: 0,
        maxHeight: 'calc(100vh - 130px)',
        overflowY: 'auto',
        borderLeft: '0.5px solid var(--border)',
        background: 'var(--surface)',
        borderRadius: 10,
        marginLeft: 16,
        padding: '16px 18px',
        animation: 'slideInRight 0.2s ease',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, wordBreak: 'break-word' }}>{title || 'Untitled'}</div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}
          title="Close"
        >✕</button>
      </div>

      {/* Properties */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
        {fields.filter(f => !f.visibleIf || f.visibleIf(values)).map(f => (
          <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'start' }}>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, paddingTop: 6 }}>{f.label}</div>
            <div><FieldControl field={f} values={values} onChangeField={onChangeField} onAddOption={onAddOption} profiles={profiles} /></div>
          </div>
        ))}
      </div>

      {/* Comments */}
      <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 16, marginBottom: 22 }}>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
          Comments {itemComments.length > 0 && <span style={{ color: 'var(--text-faint)' }}>· {itemComments.length}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <textarea
            className="form-input"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Leave a comment… (Enter to send, Shift+Enter for a new line)"
            rows={2}
            style={{ resize: 'vertical', fontSize: 12, lineHeight: 1.4 }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); } }}
          />
          <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', alignSelf: 'flex-end' }} onClick={addComment} disabled={saving || !newComment.trim()}>
            {saving ? '…' : 'Add'}
          </button>
        </div>
        {itemComments.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>No comments yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {itemComments.map(c => {
              const who = authorName(c.author_id);
              const isOwn = !!currentUserId && c.author_id === currentUserId;
              const editing = editingId === c.id;
              return (
                <div key={c.id} style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <Avatar name={who || 'Unknown'} size={18} />
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{who || 'Unknown'}</div>
                  </div>
                  {editing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 5 }}>
                      <textarea
                        className="form-input"
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        rows={2}
                        autoFocus
                        style={{ resize: 'vertical', fontSize: 12, lineHeight: 1.4 }}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit(c.id); }}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-primary" style={{ fontSize: 10, padding: '4px 10px' }} onClick={() => saveEdit(c.id)} disabled={!editText.trim()}>Save</button>
                        <button className="btn-ghost" style={{ fontSize: 10, padding: '4px 10px' }} onClick={cancelEdit}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4, whiteSpace: 'pre-wrap', marginBottom: 5 }}>{c.text}</div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{formatActivityTime(c.created_at)}</span>
                    {!editing && (
                      <div style={{ display: 'flex', gap: 10 }}>
                        {isOwn && (
                          <button
                            onClick={() => startEdit(c)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 10, padding: 0 }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}
                          >edit</button>
                        )}
                        {(isAdmin || isOwn) && (
                          <button
                            onClick={() => deleteComment(c.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 10, padding: 0 }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}
                          >delete</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Activity log */}
      <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 16 }}>
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
  );
}
