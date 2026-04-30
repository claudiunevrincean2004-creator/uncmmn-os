'use client';
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Client, ResearchItem, ResearchStatus } from '@/lib/types';

interface Props {
  client: Client;
  items: ResearchItem[];
  onReload: () => void;
}

type TypeFilter = 'all' | 'hot';
type StatusFilter = 'all' | ResearchStatus;

const REASONS = ['Hook', 'Editing Style', 'Format', 'Concept', 'Caption', 'Song / Audio', 'Trend', 'Transition', 'Other'];

const STATUS_LABELS: Record<ResearchStatus, string> = {
  unused: 'Unused',
  progress: 'In Progress',
  used: 'Used',
};

const STATUS_COLORS: Record<ResearchStatus, { color: string; bg: string; border: string }> = {
  unused: { color: '#888', bg: '#1a1a1a', border: '#2a2a2a' },
  progress: { color: '#f59e0b', bg: '#f59e0b15', border: '#f59e0b40' },
  used: { color: '#10b981', bg: '#10b98115', border: '#10b98140' },
};

const NEXT_STATUS: Record<ResearchStatus, ResearchStatus> = {
  unused: 'progress',
  progress: 'used',
  used: 'unused',
};

export default function ResearchTab({ client, items, onReload }: Props) {
  const clientItems = useMemo(() => items.filter(i => i.client_id === client.id), [items, client.id]);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [content, setContent] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState(REASONS[0]);
  const [newHot, setNewHot] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return clientItems
      .filter(i => {
        if (typeFilter === 'hot' && !i.hot) return false;
        if (statusFilter !== 'all' && i.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const aPriority = a.hot && a.status === 'unused' ? 1 : 0;
        const bPriority = b.hot && b.status === 'unused' ? 1 : 0;
        if (aPriority !== bPriority) return bPriority - aPriority;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
  }, [clientItems, typeFilter, statusFilter]);

  const hotCount = useMemo(() => clientItems.filter(i => i.hot && i.status === 'unused').length, [clientItems]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  function resetForm() {
    setContent('');
    setNote('');
    setReason(REASONS[0]);
    setNewHot(false);
  }

  async function addItem() {
    const trimmed = content.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const { error: err } = await supabase.from('research_items').insert([{
      client_id: client.id,
      content: trimmed,
      note: note.trim() || null,
      reason,
      hot: newHot,
      status: 'unused',
    }]);
    setSaving(false);
    if (err) {
      showToast('Save failed');
      return;
    }
    resetForm();
    setFormOpen(false);
    onReload();
    showToast('Saved');
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this saved item?')) return;
    await supabase.from('research_items').delete().eq('id', id);
    onReload();
  }

  async function cycleStatus(id: string, current: ResearchStatus) {
    const next = NEXT_STATUS[current];
    await supabase.from('research_items').update({ status: next }).eq('id', id);
    onReload();
  }

  async function toggleHot(id: string, current: boolean) {
    await supabase.from('research_items').update({ hot: !current }).eq('id', id);
    onReload();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: '#555' }}>
          {clientItems.length} saved
          {hotCount > 0 && <span style={{ color: '#ef4444', marginLeft: 6 }}>· {hotCount} hot</span>}
        </span>
        <button
          className="btn-primary"
          style={{ fontSize: 11, padding: '5px 10px' }}
          onClick={() => { setFormOpen(v => !v); if (formOpen) resetForm(); }}
        >
          {formOpen ? '✕ Cancel' : '+ Add Idea'}
        </button>
      </div>

      {formOpen && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, marginBottom: 14 }}>
          <textarea
            className="form-input"
            placeholder="Idea, hook, link, caption… (Cmd+Enter to save)"
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') addItem(); }}
            style={{ minHeight: 60, resize: 'vertical', fontSize: 12, lineHeight: 1.4 }}
            autoFocus
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
              onClick={addItem}
              disabled={saving || !content.trim()}
            >
              {saving ? 'Saving…' : 'Save idea'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Type:</span>
        <FilterChip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>All</FilterChip>
        <FilterChip active={typeFilter === 'hot'} onClick={() => setTypeFilter('hot')} hot>🔥 Hot</FilterChip>
        <span style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginLeft: 8 }}>Status:</span>
        <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</FilterChip>
        <FilterChip active={statusFilter === 'unused'} onClick={() => setStatusFilter('unused')}>Unused</FilterChip>
        <FilterChip active={statusFilter === 'progress'} onClick={() => setStatusFilter('progress')}>In Progress</FilterChip>
        <FilterChip active={statusFilter === 'used'} onClick={() => setStatusFilter('used')}>Used</FilterChip>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#333', padding: '40px 0', fontSize: 12 }}>
          {clientItems.length === 0 ? 'No ideas yet. Click + Add Idea to log one.' : 'No matches. Adjust filters.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              onCycleStatus={() => cycleStatus(item.id, item.status)}
              onToggleHot={() => toggleHot(item.id, item.hot)}
              onDelete={() => deleteItem(item.id)}
            />
          ))}
        </div>
      )}

      {toast && (
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
        }}>{toast}</div>
      )}
    </div>
  );
}

function FilterChip({ children, active, onClick, hot }: { children: React.ReactNode; active: boolean; onClick: () => void; hot?: boolean }) {
  const accent = hot ? '#ef4444' : '#fff';
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 9px',
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        cursor: 'pointer',
        border: `0.5px solid ${active ? accent : '#1a1a1a'}`,
        background: active ? `${hot ? '#ef444415' : '#ffffff10'}` : 'transparent',
        color: active ? accent : '#666',
        fontFamily: 'inherit',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

function ItemCard({
  item,
  onCycleStatus,
  onToggleHot,
  onDelete,
}: {
  item: ResearchItem;
  onCycleStatus: () => void;
  onToggleHot: () => void;
  onDelete: () => void;
}) {
  const isUrl = item.content.startsWith('http://') || item.content.startsWith('https://');
  const stColors = STATUS_COLORS[item.status];
  const dim = item.status === 'used' ? 0.5 : 1;
  const dateStr = item.created_at
    ? new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : '';

  return (
    <div
      style={{
        background: '#0d0d0d',
        border: `0.5px solid ${item.hot ? '#ef444440' : '#1a1a1a'}`,
        borderRadius: 8,
        padding: '10px 12px',
        opacity: dim,
        transition: 'border-color 0.15s, background 0.15s',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: '#ccc', wordBreak: 'break-word' }}>
            {isUrl ? (
              <a href={item.content} target="_blank" rel="noopener noreferrer" style={{ color: '#fff', textDecoration: 'underline' }}>
                {item.content}
              </a>
            ) : item.content}
          </div>
          {item.note && (
            <div style={{ fontSize: 10, color: '#666', fontStyle: 'italic', marginTop: 3, lineHeight: 1.4 }}>
              💬 {item.note}
            </div>
          )}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 7, flexWrap: 'wrap' }}>
            {item.hot ? (
              <span
                onClick={onToggleHot}
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '1px 6px',
                  borderRadius: 3,
                  background: '#ef444420',
                  color: '#ef4444',
                  border: '0.5px solid #ef444455',
                  cursor: 'pointer',
                }}
                title="Click to unmark hot"
              >
                🔥 Hot
              </span>
            ) : (
              <span
                onClick={onToggleHot}
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '1px 6px',
                  borderRadius: 3,
                  color: '#444',
                  border: '0.5px dashed #2a2a2a',
                  cursor: 'pointer',
                }}
                title="Mark as hot"
              >
                + Hot
              </span>
            )}
            {item.reason && (
              <span style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                padding: '1px 6px',
                borderRadius: 3,
                background: '#ffffff05',
                color: '#666',
                border: '0.5px solid #1a1a1a',
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
                padding: '1px 6px',
                borderRadius: 3,
                marginLeft: 'auto',
                background: stColors.bg,
                color: stColors.color,
                border: `0.5px solid ${stColors.border}`,
                cursor: 'pointer',
              }}
              title="Click to cycle status"
            >
              {STATUS_LABELS[item.status]}
            </span>
          </div>
          {dateStr && (
            <div style={{ fontSize: 9, color: '#444', marginTop: 4 }}>{dateStr}</div>
          )}
        </div>
        <button
          onClick={onDelete}
          style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, flexShrink: 0 }}
          title="Delete"
        >
          ×
        </button>
      </div>
    </div>
  );
}
