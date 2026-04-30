'use client';
import { useState, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Client, ResearchItem, ResearchStatus } from '@/lib/types';
import { usePersistedState } from '@/lib/use-persisted-state';

interface Props {
  client: Client;
  items: ResearchItem[];
  onReload: () => void;
}

type View = 'grid' | 'kanban';

const REASONS = ['Hook', 'Editing Style', 'Format', 'Concept', 'Caption', 'Song / Audio', 'Trend', 'Transition', 'Other'];

// Status display: internal value → user-facing label
const STATUS_LABELS: Record<ResearchStatus, string> = {
  unused: 'Unused',
  progress: 'Saved',
  used: 'Used',
};

const STATUS_COLORS: Record<ResearchStatus, { color: string; bg: string; border: string }> = {
  unused: { color: '#888', bg: '#1a1a1a', border: '#2a2a2a' },
  progress: { color: '#3b82f6', bg: '#3b82f615', border: '#3b82f640' },
  used: { color: '#10b981', bg: '#10b98115', border: '#10b98140' },
};

const NEXT_STATUS: Record<ResearchStatus, ResearchStatus> = {
  unused: 'progress',
  progress: 'used',
  used: 'unused',
};

const KANBAN_ORDER: ResearchStatus[] = ['unused', 'progress', 'used'];

function isUrl(s: string): boolean {
  return s.startsWith('http://') || s.startsWith('https://');
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default function ResearchTab({ client, items, onReload }: Props) {
  const clientItems = useMemo(() => items.filter(i => i.client_id === client.id), [items, client.id]);

  // Form state (used for both Add and Edit)
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState(REASONS[0]);
  const [newHot, setNewHot] = useState(false);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Filters / view
  const [view, setView] = usePersistedState<View>('research_view_mode', 'grid');
  const [query, setQuery] = useState('');
  const [reasonFilter, setReasonFilter] = useState<string>('All');

  // Per-card UI state
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clientItems
      .filter(i => {
        if (reasonFilter !== 'All' && i.reason !== reasonFilter) return false;
        if (q) {
          const hay = `${i.content} ${i.note || ''} ${i.reason || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aPriority = a.hot && a.status === 'unused' ? 1 : 0;
        const bPriority = b.hot && b.status === 'unused' ? 1 : 0;
        if (aPriority !== bPriority) return bPriority - aPriority;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
  }, [clientItems, query, reasonFilter]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  function resetForm() {
    setContent('');
    setNote('');
    setReason(REASONS[0]);
    setNewHot(false);
    setEditingId(null);
  }

  function openAddForm() {
    resetForm();
    setFormOpen(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function openEditForm(item: ResearchItem) {
    setEditingId(item.id);
    setContent(item.content);
    setNote(item.note || '');
    setReason(item.reason || REASONS[0]);
    setNewHot(item.hot);
    setFormOpen(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function closeForm() {
    setFormOpen(false);
    resetForm();
  }

  async function saveItem() {
    const trimmed = content.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const payload = {
      content: trimmed,
      note: note.trim() || null,
      reason,
      hot: newHot,
    };
    if (editingId) {
      const { error: err } = await supabase.from('research_items').update(payload).eq('id', editingId);
      setSaving(false);
      if (err) { showToast('Update failed'); return; }
      closeForm();
      onReload();
      showToast('Updated');
    } else {
      const { error: err } = await supabase.from('research_items').insert([{ ...payload, client_id: client.id, status: 'unused' }]);
      setSaving(false);
      if (err) { showToast('Save failed'); return; }
      closeForm();
      onReload();
      showToast('Saved');
    }
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this idea?')) return;
    await supabase.from('research_items').delete().eq('id', id);
    if (editingId === id) closeForm();
    onReload();
  }

  async function cycleStatus(id: string, current: ResearchStatus) {
    const next = NEXT_STATUS[current];
    await supabase.from('research_items').update({ status: next }).eq('id', id);
    onReload();
  }

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const totalCount = clientItems.length;

  // Empty state — no ideas at all yet
  if (totalCount === 0 && !formOpen) {
    return (
      <div>
        <EmptyState onAdd={openAddForm} />
        {toast && <Toast msg={toast} />}
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#555' }}>
          {totalCount} idea{totalCount === 1 ? '' : 's'}
          {filtered.length !== totalCount && <span style={{ color: '#444', marginLeft: 6 }}>· {filtered.length} shown</span>}
        </span>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            placeholder="Search ideas…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ width: 180, fontSize: 11, padding: '5px 9px' }}
          />
          <select
            className="form-input"
            value={reasonFilter}
            onChange={e => setReasonFilter(e.target.value)}
            style={{ width: 'auto', fontSize: 11, padding: '5px 9px' }}
          >
            <option value="All">All reasons</option>
            {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <ViewToggle view={view} onChange={setView} />
          <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={openAddForm}>
            + Add Idea
          </button>
        </div>
      </div>

      {/* Form (collapsible, shared between Add and Edit) */}
      {formOpen && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              {editingId ? 'Edit idea' : 'New idea'}
            </span>
            <button
              onClick={closeForm}
              style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
              title="Cancel"
            >
              ✕
            </button>
          </div>
          <textarea
            ref={textareaRef}
            className="form-input"
            placeholder="Idea, hook, link, caption… (Cmd+Enter to save)"
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveItem(); }}
            style={{ minHeight: 60, resize: 'vertical', fontSize: 12, lineHeight: 1.4 }}
          />
          <input
            className="form-input"
            placeholder="Note (optional) — why is this worth keeping?"
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{ fontSize: 11 }}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Reason</label>
            <select className="form-input" value={reason} onChange={e => setReason(e.target.value)} style={{ width: 'auto', fontSize: 11, padding: '4px 8px' }}>
              {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setNewHot(v => !v)}
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                padding: '4px 10px',
                borderRadius: 4,
                cursor: 'pointer',
                background: newHot ? '#ef444418' : 'transparent',
                color: newHot ? '#ef4444' : '#555',
                border: `0.5px solid ${newHot ? '#ef4444' : '#2a2a2a'}`,
                fontFamily: 'inherit',
              }}
            >
              {newHot ? '🔥 Hot' : 'Hot'}
            </button>
            <button
              className="btn-primary"
              style={{ fontSize: 11, padding: '5px 12px', marginLeft: 'auto' }}
              onClick={saveItem}
              disabled={saving || !content.trim()}
            >
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save idea'}
            </button>
          </div>
        </div>
      )}

      {/* Results — empty after filtering */}
      {filtered.length === 0 && totalCount > 0 && (
        <div style={{ textAlign: 'center', color: '#333', padding: '40px 0', fontSize: 12 }}>
          No matches. Adjust search or reason filter.
        </div>
      )}

      {/* Grid view */}
      {view === 'grid' && filtered.length > 0 && (
        <div className="research-grid">
          {filtered.map(item => (
            <IdeaCard
              key={item.id}
              item={item}
              expanded={expanded.has(item.id)}
              onToggleExpand={() => toggleExpanded(item.id)}
              onCycleStatus={() => cycleStatus(item.id, item.status)}
              onEdit={() => openEditForm(item)}
              onDelete={() => deleteItem(item.id)}
            />
          ))}
        </div>
      )}

      {/* Kanban view */}
      {view === 'kanban' && filtered.length > 0 && (
        <div className="research-kanban">
          {KANBAN_ORDER.map(status => {
            const colItems = filtered.filter(i => i.status === status);
            const sc = STATUS_COLORS[status];
            return (
              <div key={status} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  background: sc.bg,
                  border: `0.5px solid ${sc.border}`,
                  borderRadius: 6,
                }}>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    color: sc.color,
                  }}>
                    {STATUS_LABELS[status]}
                  </span>
                  <span style={{ fontSize: 10, color: sc.color, fontWeight: 600 }}>{colItems.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {colItems.length === 0 ? (
                    <div style={{ fontSize: 11, color: '#333', textAlign: 'center', padding: '16px 0' }}>
                      Empty
                    </div>
                  ) : colItems.map(item => (
                    <IdeaCard
                      key={item.id}
                      item={item}
                      expanded={expanded.has(item.id)}
                      onToggleExpand={() => toggleExpanded(item.id)}
                      onCycleStatus={() => cycleStatus(item.id, item.status)}
                      onEdit={() => openEditForm(item)}
                      onDelete={() => deleteItem(item.id)}
                      compact
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && <Toast msg={toast} />}
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const btn = (active: boolean): React.CSSProperties => ({
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    padding: '5px 10px',
    cursor: 'pointer',
    background: active ? '#fff' : 'transparent',
    color: active ? '#000' : '#666',
    border: 'none',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  });
  return (
    <div style={{ display: 'inline-flex', border: '0.5px solid #2a2a2a', borderRadius: 6, overflow: 'hidden' }}>
      <button onClick={() => onChange('grid')} style={btn(view === 'grid')}>Grid</button>
      <button onClick={() => onChange('kanban')} style={btn(view === 'kanban')}>Kanban</button>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '80px 24px',
      border: '0.5px dashed #2a2a2a',
      borderRadius: 12,
      background: '#0a0a0a',
    }}>
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>💡</div>
      <div style={{ fontSize: 14, color: '#ccc', marginBottom: 6, fontWeight: 600 }}>No ideas yet</div>
      <div style={{ fontSize: 12, color: '#555', marginBottom: 20, lineHeight: 1.5 }}>
        Capture hooks, formats, references, or anything else worth coming back to.
      </div>
      <button className="btn-primary" style={{ fontSize: 12, padding: '8px 18px' }} onClick={onAdd}>
        + Add Idea
      </button>
    </div>
  );
}

function Toast({ msg }: { msg: string }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      background: '#fff',
      color: '#000',
      padding: '8px 14px',
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 600,
      zIndex: 999,
    }}>{msg}</div>
  );
}

interface CardProps {
  item: ResearchItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onCycleStatus: () => void;
  onEdit: () => void;
  onDelete: () => void;
  compact?: boolean;
}

function IdeaCard({ item, expanded, onToggleExpand, onCycleStatus, onEdit, onDelete, compact }: CardProps) {
  const stColors = STATUS_COLORS[item.status];
  const dim = item.status === 'used' ? 0.55 : 1;
  const dateStr = item.created_at
    ? new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : '';
  const contentIsUrl = isUrl(item.content);

  // Truncated style for content (3 lines, ellipsis)
  const clampStyle: React.CSSProperties = expanded
    ? {}
    : {
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      };

  return (
    <div
      className="research-card"
      style={{
        background: '#0d0d0d',
        border: `0.5px solid ${item.hot ? '#ef444440' : '#1a1a1a'}`,
        borderRadius: 10,
        padding: compact ? 10 : 12,
        opacity: dim,
        position: 'relative',
        transition: 'border-color 0.15s, background 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Hot badge — top-right corner */}
      {item.hot && (
        <span
          title="Hot"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          🔥
        </span>
      )}

      {/* Hover-revealed actions — top-right (offset to clear the flame) */}
      <div
        className="research-card-actions"
        style={{
          position: 'absolute',
          top: 6,
          right: item.hot ? 28 : 6,
          display: 'flex',
          gap: 4,
        }}
      >
        <button
          onClick={onEdit}
          title="Edit"
          style={{
            background: '#1a1a1a',
            border: '0.5px solid #2a2a2a',
            borderRadius: 4,
            color: '#aaa',
            cursor: 'pointer',
            fontSize: 11,
            padding: '2px 7px',
            fontFamily: 'inherit',
          }}
        >
          ✎
        </button>
        <button
          onClick={onDelete}
          title="Delete"
          style={{
            background: '#1a0a0a',
            border: '0.5px solid #3a1a1a',
            borderRadius: 4,
            color: '#ef4444',
            cursor: 'pointer',
            fontSize: 11,
            padding: '2px 7px',
            fontFamily: 'inherit',
          }}
        >
          ✕
        </button>
      </div>

      {/* Content body */}
      <div style={{ paddingRight: item.hot ? 22 : 0 }}>
        {contentIsUrl ? (
          <a
            href={item.content}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              color: '#fff',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 600,
              borderBottom: '0.5px solid #2a2a2a',
              paddingBottom: 2,
            }}
          >
            {safeDomain(item.content)}
            <span style={{ fontSize: 10, color: '#888' }}>↗</span>
          </a>
        ) : (
          <div
            onClick={onToggleExpand}
            style={{
              fontSize: 12,
              lineHeight: 1.5,
              color: '#ddd',
              cursor: 'pointer',
              wordBreak: 'break-word',
              ...clampStyle,
            }}
            title={expanded ? 'Click to collapse' : 'Click to expand'}
          >
            {item.content}
          </div>
        )}
      </div>

      {/* Note */}
      {item.note && (
        <div style={{ fontSize: 11, color: '#666', fontStyle: 'italic', lineHeight: 1.45, wordBreak: 'break-word' }}>
          {item.note}
        </div>
      )}

      {/* Footer: reason tag, status pill, date */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 'auto' }}>
        {item.reason && (
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            padding: '2px 7px',
            borderRadius: 3,
            background: '#161616',
            color: '#888',
            border: '0.5px solid #1f1f1f',
          }}>
            {item.reason}
          </span>
        )}
        <span
          onClick={onCycleStatus}
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            padding: '2px 7px',
            borderRadius: 3,
            background: stColors.bg,
            color: stColors.color,
            border: `0.5px solid ${stColors.border}`,
            cursor: 'pointer',
          }}
          title="Click to advance status"
        >
          {STATUS_LABELS[item.status]}
        </span>
        {dateStr && (
          <span style={{ fontSize: 9, color: '#444', marginLeft: 'auto' }}>{dateStr}</span>
        )}
      </div>
    </div>
  );
}
