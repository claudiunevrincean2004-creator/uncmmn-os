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
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 8, padding: '6px 8px' }}>
      <input className="form-input" style={{ width: 130, fontSize: 11, padding: '4px 7px' }} value={label} onChange={e => setLabel(e.target.value)} placeholder="Label" autoFocus />
      <input className="form-input" style={{ width: 200, fontSize: 11, padding: '4px 7px' }} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" onKeyDown={e => { if (e.key === 'Enter') save(); }} />
      <button className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={save} disabled={saving}>Save</button>
      <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setEditingId(null)}>Cancel</button>
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
      {items.map(l => (
        editingId === l.id ? (
          <div key={l.id}>{editor}</div>
        ) : (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center' }}>
            <button
              className="btn-ghost"
              style={{ fontSize: 11, padding: '5px 12px', borderRadius: '6px 0 0 6px', color: l.url ? 'var(--accent)' : 'var(--text-faint)', borderRight: 'none' }}
              onClick={() => { if (l.url) window.open(l.url, '_blank', 'noopener,noreferrer'); else startEdit(l); }}
              title={l.url || 'No link set'}
            >
              📁 {l.label || 'Untitled'}{l.url ? ' ↗' : ''}
            </button>
            <button className="btn-ghost" style={{ fontSize: 10, padding: '5px 7px', borderRadius: 0, borderRight: 'none', color: 'var(--text-faint)' }} onClick={() => startEdit(l)} title="Edit">✎</button>
            <button className="btn-ghost" style={{ fontSize: 10, padding: '5px 7px', borderRadius: '0 6px 6px 0', color: 'var(--text-faint)' }} onClick={() => del(l.id)} title="Delete">✕</button>
          </div>
        )
      ))}

      {editingId === NEW ? (
        editor
      ) : (
        <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }} onClick={startAdd}>+ Add Quick Link</button>
      )}
    </div>
  );
}
