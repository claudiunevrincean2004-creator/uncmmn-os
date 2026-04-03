'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Expense } from '@/lib/types';

interface Props {
  expense?: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ExpenseModal({ expense, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (expense) {
      setName(expense.name || '');
      setCost(String(expense.cost || ''));
      setCategory(expense.category || '');
    }
  }, [expense]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const data = {
      name: name.trim(),
      cost: parseFloat(cost) || 0,
      category: category.trim(),
    };
    if (expense?.id) {
      await supabase.from('expenses').update(data).eq('id', expense.id);
    } else {
      await supabase.from('expenses').insert([data]);
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{expense ? 'Edit Expense' : 'Add Expense'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="form-label">Expense Name</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Adobe CC, CapCut Pro, Notion..." />
          </div>
          <div>
            <label className="form-label">Monthly Cost ($)</label>
            <input className="form-input" type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="form-label">Category</label>
            <input className="form-input" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Software, Freelance, Subscription..." />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Expense'}
          </button>
        </div>
      </div>
    </div>
  );
}
