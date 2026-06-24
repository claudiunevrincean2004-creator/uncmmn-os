'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioComment, StudioActivity } from '@/lib/types';
import { formatActivityTime } from '@/lib/studio';
import { InlineText, MiniSelect, PillSelect, EditSelect, EditPillSelect, InlineDate, InlineNumber } from './cells';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'pill' | 'url' | 'date' | 'number' | 'readonly' | 'readonly-url';
  options?: string[];
  colors?: Record<string, string>;
  placeholder?: string;
  field?: string; // dropdown-option key — enables "+ Add new…" for select/pill
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
  onReload: () => void;
  onClose: () => void;
}

function FieldControl({ field, values, onChangeField, onAddOption }: { field: FieldDef; values: Record<string, any>; onChangeField: (k: string, v: any) => void; onAddOption: (f: string, v: string) => void }) {
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
    case 'select':
      return field.field
        ? <EditSelect field={field.field} value={value} options={field.options || []} onChange={v => onChangeField(field.key, v)} onAddOption={onAddOption} placeholder="—" width="100%" />
        : <MiniSelect value={value} options={field.options || []} onChange={v => onChangeField(field.key, v)} placeholder="—" width="100%" />;
    case 'pill':
      return field.field
        ? <EditPillSelect field={field.field} value={value} options={field.options || []} colors={field.colors || {}} onChange={v => onChangeField(field.key, v)} onAddOption={onAddOption} />
        : <PillSelect value={value} options={field.options || []} colors={field.colors || {}} onChange={v => onChangeField(field.key, v)} />;
    case 'url':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
          <InlineText value={value} onCommit={v => onChangeField(field.key, v)} placeholder="https://…" style={{ flex: 1 }} />
          {value && <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'none', fontSize: 14 }} title={value}>↗</a>}
        </div>
      );
    case 'readonly-url':
      return value
        ? <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'none', fontSize: 12, wordBreak: 'break-all' }}>{value} ↗</a>
        : <span style={{ color: '#444', fontSize: 12 }}>—</span>;
    case 'readonly':
    default:
      return <span style={{ color: '#ccc', fontSize: 12 }}>{value != null && value !== '' ? String(value) : '—'}</span>;
  }
}

export default function ItemPanel({ itemType, itemId, title, fields, values, onChangeField, onAddOption, comments, activity, onReload, onClose }: Props) {
  const [newComment, setNewComment] = useState('');
  const [saving, setSaving] = useState(false);

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
    await supabase.from('studio_comments').insert([{ item_type: itemType, item_id: itemId, text }]);
    setSaving(false);
    setNewComment('');
    onReload();
  }

  async function deleteComment(id: string) {
    await supabase.from('studio_comments').delete().eq('id', id);
    onReload();
  }

  return (
    <div
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
        borderLeft: '0.5px solid #1a1a1a',
        background: '#0a0a0a',
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
          style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#666'; }}
          title="Close"
        >✕</button>
      </div>

      {/* Properties */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
        {fields.filter(f => !f.visibleIf || f.visibleIf(values)).map(f => (
          <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'start' }}>
            <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, paddingTop: 6 }}>{f.label}</div>
            <div><FieldControl field={f} values={values} onChangeField={onChangeField} onAddOption={onAddOption} /></div>
          </div>
        ))}
      </div>

      {/* Comments */}
      <div style={{ borderTop: '0.5px solid #1a1a1a', paddingTop: 16, marginBottom: 22 }}>
        <div style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
          Comments {itemComments.length > 0 && <span style={{ color: '#333' }}>· {itemComments.length}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <textarea
            className="form-input"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Leave a comment…"
            rows={2}
            style={{ resize: 'vertical', fontSize: 12, lineHeight: 1.4 }}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment(); }}
          />
          <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', alignSelf: 'flex-end' }} onClick={addComment} disabled={saving || !newComment.trim()}>
            {saving ? '…' : 'Add'}
          </button>
        </div>
        {itemComments.length === 0 ? (
          <div style={{ fontSize: 11, color: '#333' }}>No comments yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {itemComments.map(c => (
              <div key={c.id} style={{ background: '#111', border: '0.5px solid #1a1a1a', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.4, whiteSpace: 'pre-wrap', marginBottom: 5 }}>{c.text}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: '#555' }}>{formatActivityTime(c.created_at)}</span>
                  <button
                    onClick={() => deleteComment(c.id)}
                    style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 10, padding: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#444'; }}
                  >delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity log */}
      <div style={{ borderTop: '0.5px solid #1a1a1a', paddingTop: 16 }}>
        <div style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Activity</div>
        {itemActivity.length === 0 ? (
          <div style={{ fontSize: 11, color: '#333' }}>No activity yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {itemActivity.map(a => (
              <div key={a.id} style={{ display: 'flex', gap: 8, fontSize: 11, lineHeight: 1.4 }}>
                <span style={{ color: '#8b5cf6', marginTop: 1 }}>•</span>
                <span style={{ color: '#999' }}>
                  {a.action}
                  {a.old_value != null && a.new_value != null && (
                    <> from <span style={{ color: '#ccc' }}>{a.old_value}</span> to <span style={{ color: '#ccc' }}>{a.new_value}</span></>
                  )}
                  <span style={{ color: '#444' }}> — {formatActivityTime(a.created_at)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
