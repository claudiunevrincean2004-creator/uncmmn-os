'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CustomProperty, CustomPropertyOption } from '@/lib/types';
import { pillStyle } from '@/lib/studio';
import { useDismiss } from '@/lib/use-dismiss';
import { InlineText } from './cells';

// Palette offered for option color chips (same family as the status pills)
const OPTION_COLORS = ['#6b7280', '#3b82f6', '#eab308', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981', '#14b8a6', '#ec4899'];

// ---- helpers ---------------------------------------------------------------
export function sortProps(properties: CustomProperty[], tableKey: string): CustomProperty[] {
  return properties.filter(p => p.table_key === tableKey).sort((a, b) => a.position - b.position || (a.created_at || '').localeCompare(b.created_at || ''));
}

export function groupOptions(options: CustomPropertyOption[]): Record<string, CustomPropertyOption[]> {
  const map: Record<string, CustomPropertyOption[]> = {};
  options.forEach(o => { (map[o.property_id] ||= []).push(o); });
  Object.values(map).forEach(list => list.sort((a, b) => a.position - b.position || (a.created_at || '').localeCompare(b.created_at || '')));
  return map;
}

export function applyCustomFilters<T extends { custom_values?: Record<string, string> }>(
  rows: T[], props: CustomProperty[], filters: Record<string, string>
): T[] {
  return rows.filter(r => props.every(p => {
    const f = filters[p.id];
    if (!f || f === 'All') return true;
    return (r.custom_values?.[p.id] || '') === f;
  }));
}

// ---- header cells ----------------------------------------------------------
export function CustomHeaderCells({ props, isAdmin, onManage }: { props: CustomProperty[]; isAdmin: boolean; onManage: () => void }) {
  return (
    <>
      {props.map(p => (
        <th
          key={p.id}
          onClick={isAdmin ? onManage : undefined}
          title={isAdmin ? 'Manage custom properties' : undefined}
          style={{ cursor: isAdmin ? 'pointer' : undefined, userSelect: 'none' }}
        >
          {p.name}{isAdmin && <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>✎</span>}
        </th>
      ))}
    </>
  );
}

// Notion-style compact "add column" button, dropped into the trailing (actions)
// header cell of a Studio table so it sits inline at the end of the header row.
export function AddPropertyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Add property"
      aria-label="Add property"
      className="btn-ghost"
      style={{ fontSize: 14, lineHeight: 1, padding: '2px 9px', color: 'var(--text-faint)' }}
    >
      +
    </button>
  );
}

// ---- a single select cell (styled like the status/format pills) -----------
function CustomCell({
  value, options, onChange,
}: { value: string; options: CustomPropertyOption[]; onChange: (optionId: string) => void }) {
  const selected = options.find(o => o.id === value);
  const base: React.CSSProperties = selected?.color
    ? pillStyle(selected.color)
    : { background: 'var(--surface-2)', color: 'var(--text-faint)', border: '1px solid var(--border)' };
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      style={{ ...base, appearance: 'none', WebkitAppearance: 'none', borderRadius: 20, padding: '3px 9px', fontSize: 10, fontWeight: 700, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}
      title="Set value"
    >
      <option value="" style={{ background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 600 }}>—</option>
      {options.map(o => (
        <option key={o.id} value={o.id} style={{ background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 600 }}>{o.label}</option>
      ))}
    </select>
  );
}

// ---- row cells -------------------------------------------------------------
export function CustomRowCells<T extends { id: string; custom_values?: Record<string, string> }>({
  row, props, optionsByProp, onPatch,
}: { row: T; props: CustomProperty[]; optionsByProp: Record<string, CustomPropertyOption[]>; onPatch: (id: string, partial: { custom_values: Record<string, string> }) => void }) {
  function setValue(propId: string, optionId: string) {
    const cv = { ...(row.custom_values || {}) };
    if (optionId) cv[propId] = optionId; else delete cv[propId];
    onPatch(row.id, { custom_values: cv });
  }
  return (
    <>
      {props.map(p => (
        <td key={p.id}>
          <CustomCell value={row.custom_values?.[p.id] || ''} options={optionsByProp[p.id] || []} onChange={id => setValue(p.id, id)} />
        </td>
      ))}
    </>
  );
}

// ---- filter dropdowns (show ALL defined options, not just values in use) ---
export function CustomFilterControls({
  props, optionsByProp, filters, setFilters,
}: { props: CustomProperty[]; optionsByProp: Record<string, CustomPropertyOption[]>; filters: Record<string, string>; setFilters: (next: Record<string, string>) => void }) {
  return (
    <>
      {props.map(p => (
        <select
          key={p.id}
          className="form-input"
          style={{ width: 'auto', padding: '4px 7px', fontSize: 11 }}
          value={filters[p.id] || 'All'}
          onChange={e => setFilters({ ...filters, [p.id]: e.target.value })}
        >
          <option value="All">{p.name}: All</option>
          {(optionsByProp[p.id] || []).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      ))}
    </>
  );
}

// ---- admin manager modal ---------------------------------------------------
export function PropertyManagerModal({
  tableKey, properties, options, onClose, onReload,
}: { tableKey: string; properties: CustomProperty[]; options: CustomPropertyOption[]; onClose: () => void; onReload: () => void }) {
  const props = sortProps(properties, tableKey);
  const optionsByProp = groupOptions(options);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  // Escape closes (backdrop click is already handled by the overlay)
  useDismiss(null, onClose, { outside: false });

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    await fn();
    setBusy(false);
    onReload();
  }

  const addProperty = () => run(async () => {
    const name = newName.trim();
    if (!name) return;
    const pos = props.length ? Math.max(...props.map(p => p.position)) + 1 : 0;
    await supabase.from('custom_properties').insert([{ table_key: tableKey, name, position: pos }]);
    setNewName('');
  });

  const renameProperty = (id: string, name: string) => run(async () => {
    await supabase.from('custom_properties').update({ name: name.trim() || 'Untitled' }).eq('id', id);
  });

  const deleteProperty = (p: CustomProperty) => {
    if (!confirm(`Delete the "${p.name}" column? This removes its values from every row.`)) return;
    run(async () => { await supabase.from('custom_properties').delete().eq('id', p.id); });
  };

  const moveProperty = (p: CustomProperty, dir: -1 | 1) => {
    const i = props.findIndex(x => x.id === p.id);
    const j = i + dir;
    if (j < 0 || j >= props.length) return;
    const other = props[j];
    run(async () => {
      await supabase.from('custom_properties').update({ position: other.position }).eq('id', p.id);
      await supabase.from('custom_properties').update({ position: p.position }).eq('id', other.id);
    });
  };

  const addOption = (propId: string) => run(async () => {
    const opts = optionsByProp[propId] || [];
    const pos = opts.length ? Math.max(...opts.map(o => o.position)) + 1 : 0;
    await supabase.from('custom_property_options').insert([{ property_id: propId, label: 'New option', color: null, position: pos }]);
  });

  const renameOption = (id: string, label: string) => run(async () => {
    await supabase.from('custom_property_options').update({ label: label.trim() || 'Option' }).eq('id', id);
  });

  const setOptionColor = (id: string, color: string | null) => run(async () => {
    await supabase.from('custom_property_options').update({ color }).eq('id', id);
  });

  const removeOption = (id: string) => run(async () => {
    await supabase.from('custom_property_options').delete().eq('id', id);
  });

  const moveOption = (opt: CustomPropertyOption, dir: -1 | 1) => {
    const list = optionsByProp[opt.property_id] || [];
    const i = list.findIndex(x => x.id === opt.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const other = list[j];
    run(async () => {
      await supabase.from('custom_property_options').update({ position: other.position }).eq('id', opt.id);
      await supabase.from('custom_property_options').update({ position: opt.position }).eq('id', other.id);
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="font-head" style={{ fontSize: 17, fontWeight: 700 }}>Custom Properties</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {props.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 14 }}>No custom columns yet. Add one below.</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {props.map((p, idx) => (
            <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--surface-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <InlineText value={p.name} onCommit={v => renameProperty(p.id, v)} placeholder="Column name" style={{ flex: 1, fontWeight: 600 }} />
                <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} disabled={idx === 0} onClick={() => moveProperty(p, -1)} title="Move left">↑</button>
                <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} disabled={idx === props.length - 1} onClick={() => moveProperty(p, 1)} title="Move right">↓</button>
                <button className="btn-danger" style={{ padding: '4px 8px' }} onClick={() => deleteProperty(p)}>Delete</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(optionsByProp[p.id] || []).map((o, oi, arr) => (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button
                        onClick={() => setOptionColor(o.id, null)}
                        title="No color"
                        style={{ width: 16, height: 16, borderRadius: '50%', cursor: 'pointer', background: 'transparent', border: o.color ? '1px solid var(--border)' : '2px solid var(--text)' }}
                      />
                      {OPTION_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => setOptionColor(o.id, c)}
                          title={c}
                          style={{ width: 16, height: 16, borderRadius: '50%', cursor: 'pointer', background: c, border: o.color === c ? '2px solid var(--text)' : '1px solid var(--border)' }}
                        />
                      ))}
                    </div>
                    <InlineText value={o.label} onCommit={v => renameOption(o.id, v)} placeholder="Option label" style={{ flex: 1 }} />
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 7px' }} disabled={oi === 0} onClick={() => moveOption(o, -1)}>↑</button>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 7px' }} disabled={oi === arr.length - 1} onClick={() => moveOption(o, 1)}>↓</button>
                    <button className="btn-danger" style={{ padding: '4px 7px' }} onClick={() => removeOption(o.id)}>✕</button>
                  </div>
                ))}
                <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 10px', alignSelf: 'flex-start' }} onClick={() => addOption(p.id)}>+ Add option</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <input className="form-input" style={{ flex: 1 }} value={newName} onChange={e => setNewName(e.target.value)} placeholder="New column name" onKeyDown={e => { if (e.key === 'Enter') addProperty(); }} />
          <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={addProperty} disabled={busy || !newName.trim()}>+ Add property</button>
        </div>
      </div>
    </div>
  );
}
