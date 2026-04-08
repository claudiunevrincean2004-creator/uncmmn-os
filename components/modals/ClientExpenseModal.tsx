'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { ClientExpense } from '@/lib/types';

interface Props {
  expense?: ClientExpense | null;
  clientId: string;
  clientName: string;
  month: string;
  existingNames?: string[];
  onClose: () => void;
  onSaved: () => void;
}

export default function ClientExpenseModal({ expense, clientId, clientName, month, existingNames = [], onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expense) {
      setName(expense.name || '');
      setAmount(String(expense.amount || ''));
      setCategory(expense.category || '');
    }
  }, [expense]);

  const suggestions = name.trim().length > 0
    ? Array.from(new Set(existingNames)).filter(n => n.toLowerCase().includes(name.toLowerCase()) && n.toLowerCase() !== name.toLowerCase())
    : [];

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const data = {
      client_id: clientId,
      name: name.trim(),
      amount: parseFloat(amount) || 0,
      category: category.trim(),
      month,
    };
    let result;
    if (expense?.id) {
      result = await supabase.from('client_expenses').update(data).eq('id', expense.id);
    } else {
      result = await supabase.from('client_expenses').insert([data]);
    }
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
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
          <div style={{ position: 'relative' }}>
            <label className="form-label">Expense Name</label>
            <input
              ref={nameRef}
              className="form-input"
              value={name}
              onChange={e => { setName(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="e.g. Video Editor, Project Manager, Ads..."
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
            <label className="form-label">Amount ($)</label>
            <input className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="form-label">Sub-category</label>
            <select className="form-input" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Select sub-category...</option>
              {[
                'Video Editor',
                'Clipper',
                'Designer',
                'Payment Processing Fee',
                'Client-specific Tool',
                'Other',
              ].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: '8px 10px', background: '#1a0a0a', border: '0.5px solid #3a1a1a', borderRadius: 6, color: '#ef4444', fontSize: 11 }}>
            {error}
          </div>
        )}

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
