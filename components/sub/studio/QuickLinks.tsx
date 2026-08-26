'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioQuickLink } from '@/lib/types';

const NEW = '__new__';

interface Props {
  context: string; // 'video-review' | 'ad-creative'
  links: StudioQuickLink[];
  onReload: () => void;
}

export default function QuickLinks({ context, links, onReload }: Props) {
  const items = links.filter(l => l.context === context);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  function startAdd() { setEditingId(NEW); setLabel(''); setUrl(''); }
  function startEdit(l: StudioQuickLink) { setEditingId(l.id); setLabel(l.label ?? ''); setUrl(l.url ?? ''); }

  async function save() {
    if (saving || (!label.trim() && !url.trim())) return;
    setSaving(true);
    if (editingId === NEW) {
      await supabase.from('studio_quick_links').insert([{ context, label: label.trim(), url: url.trim() }]);
    } else {
      await supabase.from('studio_quick_links').update({ label: label.trim(), url: url.trim() }).eq('id', editingId);
    }
    setSaving(false);
    setEditingId(null);
    onReload();
  }

  async function del(id: string) {
    if (!confirm('Delete this quick link?')) return;
    await supabase.from('studio_quick_links').delete().eq('id', id);
    if (editingId === id) setEditingId(null);
    onReload();
  }

  // Plain inline JSX (not a nested component) so the inputs keep focus across re-renders
  const editor = (
    <div className="qlink-editor">
      <input className="form-input" style={{ width: 140 }} value={label} onChange={e => setLabel(e.target.value)} placeholder="Label" autoFocus />
      <input className="form-input" style={{ width: 220 }} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" onKeyDown={e => { if (e.key === 'Enter') save(); }} />
      <button className="btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={save} disabled={saving}>Save</button>
      <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setEditingId(null)}>Cancel</button>
    </div>
  );

  return (
    // Same control language as the filter bar below it: rounded shells on the
    // page surface, hairline borders, 12px labels.
    <div className="qlinks">
      {items.map(l => (
        editingId === l.id ? (
          <div key={l.id}>{editor}</div>
        ) : (
          <div key={l.id} className="qlink">
            <button
              className={l.url ? 'qlink-open' : 'qlink-open is-empty'}
              onClick={() => { if (l.url) window.open(l.url, '_blank', 'noopener,noreferrer'); else startEdit(l); }}
              title={l.url || 'No link set — click to add one'}
            >
              <span aria-hidden>📁</span>
              <span>{l.label || 'Untitled'}</span>
            </button>
            <button className="qlink-icon" onClick={() => startEdit(l)} title="Edit quick link" aria-label="Edit quick link">✎</button>
            <button className="qlink-icon is-danger" onClick={() => del(l.id)} title="Delete quick link" aria-label="Delete quick link">✕</button>
          </div>
        )
      ))}

      {editingId === NEW ? (
        editor
      ) : (
        <button className="qlink-add" onClick={startAdd}>
          <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>+</span>Add Quick Link
        </button>
      )}
    </div>
  );
}
