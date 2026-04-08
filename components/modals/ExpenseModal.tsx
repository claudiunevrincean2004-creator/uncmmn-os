'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { MonthlyExpense } from '@/lib/types';

interface Props {
  expense?: MonthlyExpense | null;
  month: string; // YYYY-MM
  existingNames?: string[];
  onClose: () => void;
  onSaved: () => void;
}

export default function ExpenseModal({ expense, month, existingNames = [], onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expense) {
      setName(expense.name || '');
      setCost(String(expense.cost || ''));
      setCategory(expense.category || '');
    }
  }, [expense]);

  const suggestions = name.trim().length > 0
    ? Array.from(new Set(existingNames)).filter(n => n.toLowerCase().includes(name.toLowerCase()) && n.toLowerCase() !== name.toLowerCase())
    : [];

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const data = {
      name: name.trim(),
      cost: parseFloat(cost) || 0,
      category: category.trim(),
      month,
    };
    if (expense?.id) {
      await supabase.from('monthly_expenses').update(data).eq('id', expense.id);
    } else {
      await supabase.from('monthly_expenses').insert([data]);
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
          <span style={{ fontSize: 13, fontWeight: 700 }}>{expense ? 'Edit Expense' : 'Add Expense'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ fontSize: 11, color: '#555', marginBottom: 14, padding: '6px 10px', background: '#111', borderRadius: 6 }}>
          Month: {monthLabel}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <label className="form-label">Expense Name</label>
            <input
              ref={nameRef}
              className="form-input"
              value={name}
              onChange={e => { setName(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="e.g. Adobe CC, CapCut Pro, Notion..."
            />
            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                background: '#1a1a1a', border: '0.5px solid #2a2a2a', borderRadius: 6,
                maxHeight: 150, overflowY: 'auto', marginTop: 2,
              }}>
                {suggestions.slice(0, 8).map(s => (
                  <div
                    key={s}
                    style={{ padding: '6px 10px', fontSize: 12, color: '#ccc', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#252525')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onMouseDown={() => { setName(s); setShowSuggestions(false); }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="form-label">Cost ($)</label>
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
