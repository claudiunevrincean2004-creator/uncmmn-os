'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StudioDropdownOption } from '@/lib/types';
import { useDismiss } from '@/lib/use-dismiss';
import { InlineText } from './cells';

const OPTION_COLORS = ['#6b7280', '#3b82f6', '#eab308', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981', '#14b8a6', '#ec4899'];

// Admin-only manager for a built-in select field's options (Format / Status).
// Operates on studio_dropdown_options rows for `field` (value = label/stored value).
export default function FieldOptionsManager({
  field, title, options, onClose, onReload,
}: {
  field: string;
  title: string;
  options: StudioDropdownOption[];
  onClose: () => void;
  onReload: () => void;
}) {
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);
  useDismiss(null, onClose, { outside: false });

  const list = options
    .filter(o => o.field === field)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || (a.created_at || '').localeCompare(b.created_at || ''));

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    await fn();
    setBusy(false);
    onReload();
  }

  const addOption = () => run(async () => {
    const value = newLabel.trim();
    if (!value) return;
    const pos = list.length ? Math.max(...list.map(o => o.position ?? 0)) + 1 : 0;
    await supabase.from('studio_dropdown_options').insert([{ field, value, color: null, position: pos }]);
    setNewLabel('');
  });

  // Rename = update the stored value. Rows holding the old value keep it (they
  // simply won't match the renamed option) — never destructive.
  const rename = (o: StudioDropdownOption, value: string) => run(async () => {
    const v = value.trim();
    if (!v || v === o.value) return;
    await supabase.from('studio_dropdown_options').update({ value: v }).eq('id', o.id);
  });

  const setColor = (o: StudioDropdownOption, color: string | null) => run(async () => {
    await supabase.from('studio_dropdown_options').update({ color }).eq('id', o.id);
  });

  const remove = (o: StudioDropdownOption) => {
    if (!confirm(`Remove the "${o.value}" option? Rows already using it keep their value; it just won't be offered for new selections.`)) return;
    run(async () => { await supabase.from('studio_dropdown_options').delete().eq('id', o.id); });
  };

  const move = (o: StudioDropdownOption, dir: -1 | 1) => {
    const i = list.findIndex(x => x.id === o.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const other = list[j];
    run(async () => {
      await supabase.from('studio_dropdown_options').update({ position: other.position ?? 0 }).eq('id', o.id);
      await supabase.from('studio_dropdown_options').update({ position: o.position ?? 0 }).eq('id', other.id);
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>{title} options</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map((o, oi) => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', gap: 3 }}>
                <button
                  onClick={() => setColor(o, null)}
                  title="No color"
                  style={{ width: 16, height: 16, borderRadius: '50%', cursor: 'pointer', background: 'transparent', border: o.color ? '1px solid var(--border)' : '2px solid var(--text)' }}
                />
                {OPTION_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(o, c)}
                    title={c}
                    style={{ width: 16, height: 16, borderRadius: '50%', cursor: 'pointer', background: c, border: o.color === c ? '2px solid var(--text)' : '1px solid var(--border)' }}
                  />
                ))}
              </div>
              <InlineText value={o.value} onCommit={v => rename(o, v)} placeholder="Option label" style={{ flex: 1 }} />
              <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 7px' }} disabled={oi === 0} onClick={() => move(o, -1)}>↑</button>
              <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 7px' }} disabled={oi === list.length - 1} onClick={() => move(o, 1)}>↓</button>
              <button className="btn-danger" style={{ padding: '4px 7px' }} onClick={() => remove(o)}>✕</button>
            </div>
          ))}
          {list.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>No options yet.</div>}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <input className="form-input" style={{ flex: 1 }} value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="New option label" onKeyDown={e => { if (e.key === 'Enter') addOption(); }} />
          <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={addOption} disabled={busy || !newLabel.trim()}>+ Add option</button>
        </div>
      </div>
    </div>
  );
}
