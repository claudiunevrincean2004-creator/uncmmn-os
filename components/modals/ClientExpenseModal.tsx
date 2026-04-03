'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ClientExpense } from '@/lib/types';

interface Props {
  expense?: ClientExpense | null;
  clientId: string;
  clientName: string;
  month: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function ClientExpenseModal({ expense, clientId, clientName, month, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (expense) {
      setName(expense.name || '');
      setAmount(String(expense.amount || ''));
      setCategory(expense.category || '');
    }
  }, [expense]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const data = {
      client_id: clientId,
      name: name.trim(),
      amount: parseFloat(amount) || 0,
      category: category.trim(),
      month,
    };
    if (expense?.id) {
      await supabase.from('client_expenses').update(data).eq('id', expense.id);
    } else {
      await supabase.from('client_expenses').insert([data]);
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  const monthLabel = (() => {
    const [y, m] = month.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  })();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{expense ? 'Edit' : 'Add'} Expense — {clientName}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ fontSize: 11, color: '#555', marginBottom: 14, padding: '6px 10px', background: '#111', borderRadius: 6 }}>
          Month: {monthLabel}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="form-label">Expense Name</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Video Editor, Project Manager, Ads..." />
          </div>
          <div>
            <label className="form-label">Amount ($)</label>
            <input className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="form-label">Category</label>
            <input className="form-input" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Freelance, Ads, Tools, Software..." />
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
